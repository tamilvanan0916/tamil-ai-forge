import asyncio
import os
import uuid
from pathlib import Path
from typing import List, Optional, BinaryIO
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import UploadFile
from app.models.asset import Asset
from app.core.storage import storage
from app.core.ffmpeg import ffmpeg_service
from app.core.websocket_manager import ws_manager

class AssetService:
    @staticmethod
    async def list_assets(db: AsyncSession, project_id: str, asset_type: Optional[str] = None, folder_path: Optional[str] = None) -> List[Asset]:
        query = select(Asset).where(Asset.project_id == project_id)
        if asset_type:
            query = query.where(Asset.asset_type == asset_type)
        if folder_path:
            query = query.where(Asset.folder_path == folder_path)
        query = query.order_by(desc(Asset.created_at))
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_asset(db: AsyncSession, asset_id: str) -> Optional[Asset]:
        query = select(Asset).where(Asset.id == asset_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def upload_asset(
        db: AsyncSession,
        project_id: str,
        upload_file: UploadFile,
        folder_path: str = "/",
        asset_type: Optional[str] = None
    ) -> Asset:
        asset_id = str(uuid.uuid4())
        original_name = upload_file.filename or "unnamed_asset"
        ext = Path(original_name).suffix.lower()

        # Determine asset type
        mime = upload_file.content_type or "application/octet-stream"
        if not asset_type:
            if mime.startswith("video/") or ext in [".mp4", ".mov", ".mkv", ".webm", ".avi"]:
                asset_type = "video"
            elif mime.startswith("audio/") or ext in [".mp3", ".wav", ".aac", ".ogg", ".flac", ".m4a"]:
                asset_type = "audio"
            elif mime.startswith("image/") or ext in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]:
                asset_type = "image"
            elif ext in [".cube", ".3dl"]:
                asset_type = "lut"
            elif ext in [".ttf", ".otf", ".woff2"]:
                asset_type = "font"
            elif ext in [".srt", ".vtt"]:
                asset_type = "subtitle"
            else:
                asset_type = "media"

        # Storage relative path: projects/{project_id}/assets/{asset_id}/source{ext}
        storage_rel_path = f"projects/{project_id}/assets/{asset_id}/source{ext}"
        saved_key = await storage.save_file(storage_rel_path, upload_file.file)
        local_path = storage.get_local_path(storage_rel_path)
        file_size = os.path.getsize(local_path) if local_path.exists() else 0

        # Create Asset record
        asset = Asset(
            id=asset_id,
            project_id=project_id,
            asset_type=asset_type,
            file_name=original_name,
            storage_key=saved_key,
            file_size_bytes=file_size,
            mime_type=mime,
            folder_path=folder_path,
        )
        db.add(asset)
        await db.commit()
        await db.refresh(asset)

        # Trigger media probe and proxy/thumbnail generation asynchronously
        asyncio.create_task(AssetService._process_media(asset.id, project_id, local_path, asset_type))

        return asset

    @staticmethod
    async def _process_media(asset_id: str, project_id: str, local_path: Path, asset_type: str):
        """Background pipeline for media probing, proxy, thumbnail and waveform extraction."""
        from app.core.database import AsyncSessionLocal

        try:
            # 1. Probe media
            probe_data = await ffmpeg_service.probe_media(local_path)
            duration_ms = probe_data.get("duration_ms", 0)

            proxy_key = None
            thumb_url = None
            waveform_data = None

            # 2. If Video: generate thumbnail and 720p proxy
            if asset_type == "video":
                thumb_rel = f"projects/{project_id}/assets/{asset_id}/thumb.jpg"
                thumb_local = storage.get_local_path(thumb_rel)
                if await ffmpeg_service.generate_thumbnail(local_path, thumb_local, time_sec=min(1.0, (duration_ms / 1000) / 2)):
                    thumb_url = storage.get_url(thumb_rel)

                proxy_rel = f"projects/{project_id}/assets/{asset_id}/proxy_720p.mp4"
                proxy_local = storage.get_local_path(proxy_rel)
                if await ffmpeg_service.generate_proxy(local_path, proxy_local):
                    proxy_key = proxy_rel

                # Also extract waveform from video audio stream
                waveform_data = await ffmpeg_service.extract_waveform_peaks(local_path)

            # 3. If Audio: extract waveform
            elif asset_type == "audio":
                waveform_data = await ffmpeg_service.extract_waveform_peaks(local_path)

            # 4. If Image: thumbnail is the image itself (use its storage key path)
            elif asset_type == "image":
                thumb_url = storage_rel_path  # Use the relative storage path as thumbnail URL

            # Update DB record
            async with AsyncSessionLocal() as session:
                query = select(Asset).where(Asset.id == asset_id)
                res = await session.execute(query)
                asset_rec = res.scalar_one_or_none()
                if asset_rec:
                    asset_rec.duration_ms = duration_ms
                    asset_rec.metadata_info = probe_data
                    if proxy_key:
                        asset_rec.has_proxy = True
                        asset_rec.proxy_storage_key = proxy_key
                    if thumb_url:
                        asset_rec.thumbnail_url = thumb_url
                    if waveform_data:
                        asset_rec.waveform_data = waveform_data
                    await session.commit()

            # Broadcast WebSocket notification
            await ws_manager.broadcast_to_project(project_id, {
                "type": "asset.ready",
                "asset_id": asset_id,
                "project_id": project_id,
                "duration_ms": duration_ms,
                "thumbnail_url": thumb_url,
                "has_proxy": bool(proxy_key),
            })
        except Exception as e:
            import logging
            logging.getLogger("tamil_ai_forge").error(f"Asset background processing error for {asset_id}: {e}")

    @staticmethod
    async def delete_asset(db: AsyncSession, asset_id: str) -> bool:
        asset = await AssetService.get_asset(db, asset_id)
        if not asset:
            return False

        try:
            await storage.delete_file(asset.storage_key)
            if asset.proxy_storage_key:
                await storage.delete_file(asset.proxy_storage_key)
        except Exception:
            pass

        await db.delete(asset)
        await db.commit()
        return True
