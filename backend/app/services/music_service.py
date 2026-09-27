import os
import uuid
from pathlib import Path
from typing import List, Optional
from sqlalchemy import select, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import UploadFile
from app.models.music import MusicFolder, MusicItem
from app.core.storage import storage
from app.core.ffmpeg import ffmpeg_service
from app.schemas.music import MusicMetadataUpdate

INITIAL_FOLDERS = [
    {"name": "Tamil Songs", "slug": "tamil-songs", "folder_path": "tamil-songs", "icon": "Music", "order": 0, "children": [
        {"name": "Melody", "slug": "melody", "folder_path": "tamil-songs/melody", "icon": "Sparkles", "order": 0},
        {"name": "Love", "slug": "love", "folder_path": "tamil-songs/love", "icon": "Heart", "order": 1},
        {"name": "Sad", "slug": "sad", "folder_path": "tamil-songs/sad", "icon": "CloudRain", "order": 2},
        {"name": "Mass", "slug": "mass", "folder_path": "tamil-songs/mass", "icon": "Zap", "order": 3},
        {"name": "Folk", "slug": "folk", "folder_path": "tamil-songs/folk", "icon": "Drum", "order": 4},
        {"name": "Devotional", "slug": "devotional", "folder_path": "tamil-songs/devotional", "icon": "Sun", "order": 5},
        {"name": "Kids", "slug": "kids", "folder_path": "tamil-songs/kids", "icon": "Smile", "order": 6},
        {"name": "Instrumental", "slug": "instrumental", "folder_path": "tamil-songs/instrumental", "icon": "Guitar", "order": 7},
    ]},
    {"name": "Tamil Instrumental", "slug": "tamil-instrumental", "folder_path": "tamil-instrumental", "icon": "Guitar", "order": 1},
    {"name": "English Songs", "slug": "english-songs", "folder_path": "english-songs", "icon": "Disc", "order": 2},
    {"name": "Background Music", "slug": "background-music", "folder_path": "background-music", "icon": "Radio", "order": 3},
    {"name": "Cinematic", "slug": "cinematic", "folder_path": "cinematic", "icon": "Film", "order": 4},
    {"name": "Emotional", "slug": "emotional", "folder_path": "emotional", "icon": "Flame", "order": 5},
    {"name": "Action", "slug": "action", "folder_path": "action", "icon": "Sword", "order": 6},
    {"name": "Romance", "slug": "romance", "folder_path": "romance", "icon": "Heart", "order": 7},
    {"name": "Happy", "slug": "happy", "folder_path": "happy", "icon": "Smile", "order": 8},
    {"name": "Sad", "slug": "sad", "folder_path": "sad", "icon": "Frown", "order": 9},
    {"name": "Kids", "slug": "kids", "folder_path": "kids", "icon": "Baby", "order": 10},
    {"name": "Ambient", "slug": "ambient", "folder_path": "ambient", "icon": "Wind", "order": 11},
    {"name": "AI Generated", "slug": "ai-generated", "folder_path": "ai-generated", "icon": "Bot", "order": 12},
    {"name": "My Uploads", "slug": "my-uploads", "folder_path": "my-uploads", "icon": "UploadCloud", "order": 13},
]

class MusicService:
    @staticmethod
    async def seed_folders(db: AsyncSession):
        """Seeds the folder hierarchy in the database if empty."""
        query = select(MusicFolder)
        res = await db.execute(query)
        if res.scalars().first():
            return # Already seeded

        for top in INITIAL_FOLDERS:
            folder = MusicFolder(
                name=top["name"],
                slug=top["slug"],
                folder_path=top["folder_path"],
                icon=top["icon"],
                order_index=top["order"],
            )
            db.add(folder)
            await db.flush()

            for child in top.get("children", []):
                sub = MusicFolder(
                    parent_id=folder.id,
                    name=child["name"],
                    slug=child["slug"],
                    folder_path=child["folder_path"],
                    icon=child["icon"],
                    order_index=child["order"],
                )
                db.add(sub)

        await db.commit()

    @staticmethod
    async def list_folders(db: AsyncSession) -> List[MusicFolder]:
        await MusicService.seed_folders(db)
        query = select(MusicFolder).where(MusicFolder.parent_id == None).order_by(MusicFolder.order_index)
        res = await db.execute(query)
        return list(res.scalars().all())

    @staticmethod
    async def get_folder_items(db: AsyncSession, folder_id: str) -> List[MusicItem]:
        query = select(MusicItem).where(MusicItem.folder_id == folder_id).order_by(desc(MusicItem.created_at))
        res = await db.execute(query)
        return list(res.scalars().all())

    @staticmethod
    async def search_music(db: AsyncSession, query_str: str, favorite_only: bool = False) -> List[MusicItem]:
        query = select(MusicItem)
        if favorite_only:
            query = query.where(MusicItem.is_favorite == True)
        if query_str.strip():
            pattern = f"%{query_str.strip()}%"
            query = query.where(
                or_(
                    MusicItem.title.ilike(pattern),
                    MusicItem.artist.ilike(pattern),
                    MusicItem.genre.ilike(pattern),
                    MusicItem.mood.ilike(pattern),
                )
            )
        query = query.order_by(desc(MusicItem.created_at))
        res = await db.execute(query)
        return list(res.scalars().all())

    @staticmethod
    async def upload_music(
        db: AsyncSession,
        folder_id: str,
        upload_file: UploadFile,
        title: Optional[str] = None,
        artist: Optional[str] = None,
        genre: Optional[str] = None,
        mood: Optional[str] = None
    ) -> MusicItem:
        original_name = upload_file.filename or "track.mp3"
        ext = Path(original_name).suffix.lower()
        track_id = str(uuid.uuid4())

        # Save to music library storage
        storage_rel = f"music-library/{track_id}/source{ext}"
        saved_key = await storage.save_file(storage_rel, upload_file.file)
        local_path = storage.get_local_path(storage_rel)
        file_size = os.path.getsize(local_path) if local_path.exists() else 0

        # Probe for duration & audio properties
        probe = await ffmpeg_service.probe_media(local_path)
        duration_ms = probe.get("duration_ms", 0)

        # Extract waveform
        waveform = await ffmpeg_service.extract_waveform_peaks(local_path)

        track_title = title or Path(original_name).stem.replace("_", " ").title()

        music_item = MusicItem(
            id=track_id,
            folder_id=folder_id,
            title=track_title,
            artist=artist or "Unknown Artist",
            genre=genre or "Tamil",
            mood=mood or "Emotional",
            duration_ms=duration_ms,
            file_size_bytes=file_size,
            storage_key=saved_key,
            mime_type=upload_file.content_type or "audio/mpeg",
            waveform_data=waveform,
            is_user_upload=True,
            metadata_info=probe,
        )
        db.add(music_item)
        await db.commit()
        await db.refresh(music_item)
        return music_item

    @staticmethod
    async def update_metadata(db: AsyncSession, track_id: str, data: MusicMetadataUpdate) -> Optional[MusicItem]:
        query = select(MusicItem).where(MusicItem.id == track_id)
        res = await db.execute(query)
        item = res.scalar_one_or_none()
        if not item:
            return None

        if data.title is not None:
            item.title = data.title
        if data.artist is not None:
            item.artist = data.artist
        if data.genre is not None:
            item.genre = data.genre
        if data.mood is not None:
            item.mood = data.mood
        if data.tags is not None:
            item.tags = data.tags
        if data.is_favorite is not None:
            item.is_favorite = data.is_favorite

        await db.commit()
        await db.refresh(item)
        return item
