import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.ai_models import AIJob
from app.models.asset import Asset
from app.models.project import Project
from app.models.timeline import Timeline, Track, Clip
from app.core.storage import storage
from app.core.ffmpeg import ffmpeg_service
from app.core.websocket_manager import ws_manager
from app.services.timeline_service import TimelineService
from app.providers.mock_media_transform import mock_media_transform_provider
from app.schemas.media_transform import MediaTransformCreateRequest

logger = logging.getLogger("tamil_ai_forge.media_transformation_service")

# Concurrency tracker for in-flight tasks
_active_transform_tasks: Dict[str, asyncio.Task] = {}

class MediaTransformationService:
    @staticmethod
    async def create_job(db: AsyncSession, req: MediaTransformCreateRequest) -> AIJob:
        """
        Validates request, persists an AIJob record, and starts asynchronous offline transformation.
        """
        # 1. Validate project
        p_res = await db.execute(select(Project).where(Project.id == req.project_id))
        project = p_res.scalar_one_or_none()
        if not project:
            raise ValueError(f"Project '{req.project_id}' not found.")

        # 2. Validate source asset and ownership
        s_res = await db.execute(select(Asset).where(Asset.id == req.source_asset_id))
        source_asset = s_res.scalar_one_or_none()
        if not source_asset:
            raise ValueError(f"Source asset '{req.source_asset_id}' not found.")
        if source_asset.project_id != req.project_id:
            raise ValueError(f"Source asset does not belong to project '{req.project_id}'.")

        # 3. Validate mode and media types
        mode_str = req.mode.strip()
        mode_upper = mode_str.upper()

        VALID_MODES = {
            "IMAGE_TO_3D_CARTOON", "IMAGE_TO_3D",
            "VIDEO_TO_3D_CARTOON", "VIDEO_TO_ANIMATED", "VIDEO_TO_CINEMATIC",
            "CHARACTER_REPLACEMENT",
            "IMAGE_CHARACTER_STYLE", "IMAGE_TO_CHARACTER", "IMAGE_TO_CINEMATIC"
        }
        valid_lower = {m.lower() for m in VALID_MODES}
        if mode_upper not in VALID_MODES and mode_str.lower() not in valid_lower:
            raise ValueError(f"Invalid transformation mode '{req.mode}'. Supported modes: IMAGE_TO_3D_CARTOON, VIDEO_TO_3D_CARTOON, CHARACTER_REPLACEMENT, IMAGE_CHARACTER_STYLE")

        is_source_video = source_asset.asset_type == "video" or (bool(source_asset.mime_type) and source_asset.mime_type.startswith("video/"))
        is_source_image = source_asset.asset_type == "image" or (bool(source_asset.mime_type) and source_asset.mime_type.startswith("image/"))

        if mode_upper in ["VIDEO_TO_3D_CARTOON", "VIDEO_TO_ANIMATED", "VIDEO_TO_CINEMATIC"] or mode_str in ["video_to_3d_cartoon", "video_to_animated", "video_to_cinematic"]:
            if not is_source_video:
                raise ValueError(f"Source asset must be a video for {req.mode} mode.")
        elif mode_upper in ["IMAGE_TO_3D_CARTOON", "IMAGE_TO_3D", "IMAGE_CHARACTER_STYLE", "IMAGE_TO_CHARACTER", "IMAGE_TO_CINEMATIC"] or mode_str in ["image_to_3d", "image_to_3d_cartoon", "image_to_character", "image_to_cinematic", "image_character_style"]:
            if not is_source_image:
                raise ValueError(f"Source asset must be an image for {req.mode} mode.")

        # 4. Validate reference asset for reference-based modes
        is_ref_mode = mode_upper in ["CHARACTER_REPLACEMENT", "IMAGE_CHARACTER_STYLE"] or mode_str in ["character_replacement", "image_character_style", "image_to_character"]
        if is_ref_mode and not req.reference_asset_id:
            raise ValueError(f"Reference character image is required for {req.mode} mode.")

        if req.reference_asset_id:
            r_res = await db.execute(select(Asset).where(Asset.id == req.reference_asset_id))
            ref_asset = r_res.scalar_one_or_none()
            if not ref_asset:
                raise ValueError(f"Reference asset '{req.reference_asset_id}' not found.")
            if ref_asset.project_id != req.project_id:
                raise ValueError(f"Reference asset does not belong to project '{req.project_id}'.")
            is_ref_image = ref_asset.asset_type == "image" or (bool(ref_asset.mime_type) and ref_asset.mime_type.startswith("image/"))
            if not is_ref_image:
                raise ValueError("Reference asset must be an image.")

        # 5. Determine job_type
        is_video = is_source_video or "VIDEO" in mode_upper or "video" in mode_str
        job_type = "MEDIA_TRANSFORM_VIDEO" if is_video else "MEDIA_TRANSFORM_IMAGE"

        options_dict = req.options.model_dump() if req.options else {}

        # 6. Create AIJob record
        job_id = str(uuid.uuid4())
        job = AIJob(
            id=job_id,
            project_id=req.project_id,
            job_type=job_type,
            provider="mock",
            prompt=req.prompt or f"Transform {source_asset.file_name} with {options_dict.get('style_preset', '3d_cartoon')}",
            input_data={
                "mode": req.mode,
                "source_asset_id": req.source_asset_id,
                "reference_asset_id": req.reference_asset_id,
                "options": options_dict,
                "source_file_name": source_asset.file_name,
                "source_mime": source_asset.mime_type,
            },
            status="queued",
            progress_percent=0.0,
            job_metadata={
                "stage": "QUEUED",
                "is_mock": True,
                "offline_label": "OFFLINE DEMO TRANSFORMATION (MOCK)",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        # 6. Launch background execution task
        task = asyncio.create_task(MediaTransformationService._run_transformation(job.id))
        _active_transform_tasks[job.id] = task

        logger.info(f"Enqueued media transformation job {job.id} (mode={req.mode})")
        return job

    @staticmethod
    async def _run_transformation(job_id: str):
        """Asynchronously executes media transformation and registers output as an Asset."""
        async with AsyncSessionLocal() as session:
            try:
                j_res = await session.execute(select(AIJob).where(AIJob.id == job_id))
                job = j_res.scalar_one_or_none()
                if not job:
                    return

                job.status = "processing"
                job.started_at = datetime.now(timezone.utc)
                job.job_metadata = {**(job.job_metadata or {}), "stage": "VALIDATING"}
                await session.commit()

                input_data = job.input_data or {}
                source_id = input_data.get("source_asset_id")
                reference_id = input_data.get("reference_asset_id")
                mode = input_data.get("mode", "video_to_3d_cartoon")
                options = input_data.get("options", {})

                # Fetch source asset
                s_res = await session.execute(select(Asset).where(Asset.id == source_id))
                source_asset = s_res.scalar_one_or_none()
                if not source_asset:
                    raise RuntimeError("Source asset was deleted before transformation started.")

                source_path = storage.get_local_path(source_asset.storage_key)
                ref_path = None
                if reference_id:
                    r_res = await session.execute(select(Asset).where(Asset.id == reference_id))
                    ref_asset = r_res.scalar_one_or_none()
                    if ref_asset:
                        ref_path = storage.get_local_path(ref_asset.storage_key)

                # Progress callback — maps raw percent to canonical stage labels
                async def on_progress(pct: float, stage: str):
                    # Map progress percentage to canonical stage names
                    if pct <= 10:
                        canonical = "VALIDATING"
                    elif pct <= 35:
                        canonical = "PROCESSING"
                    elif pct < 100:
                        canonical = "FINALIZING"
                    else:
                        canonical = "COMPLETED"
                    async with AsyncSessionLocal() as p_sess:
                        pj_res = await p_sess.execute(select(AIJob).where(AIJob.id == job_id))
                        pj = pj_res.scalar_one_or_none()
                        if pj and pj.status == "processing":
                            pj.progress_percent = pct
                            pj.job_metadata = {**(pj.job_metadata or {}), "stage": canonical, "stage_detail": stage}
                            await p_sess.commit()
                            await ws_manager.broadcast_to_project(pj.project_id, {
                                "type": "media_transform.progress",
                                "job_id": job_id,
                                "progress": pct,
                                "stage": canonical,
                                "stage_detail": stage,
                            })

                style_preset = options.get("style_preset", "3d_cartoon")
                style_strength = float(options.get("style_strength", 80.0))
                preserve_audio = bool(options.get("preserve_audio", True))

                is_video = "video" in mode or source_asset.asset_type == "video"

                # Update to PROCESSING stage before actual work
                async with AsyncSessionLocal() as p_sess:
                    pj_res = await p_sess.execute(select(AIJob).where(AIJob.id == job_id))
                    pj = pj_res.scalar_one_or_none()
                    if pj:
                        pj.job_metadata = {**(pj.job_metadata or {}), "stage": "PROCESSING"}
                        await p_sess.commit()

                if is_video:
                    result = await mock_media_transform_provider.transform_video(
                        source_path=source_path,
                        mode=mode,
                        style_preset=style_preset,
                        prompt=job.prompt,
                        reference_path=ref_path,
                        style_strength=style_strength,
                        preserve_audio=preserve_audio,
                        progress_callback=on_progress,
                    )
                else:
                    result = await mock_media_transform_provider.transform_image(
                        source_path=source_path,
                        mode=mode,
                        style_preset=style_preset,
                        prompt=job.prompt,
                        reference_path=ref_path,
                        style_strength=style_strength,
                        progress_callback=on_progress,
                    )

                output_path: Path = result["output_path"]
                metadata = result["metadata"]

                # Update to FINALIZING stage before asset registration
                async with AsyncSessionLocal() as p_sess:
                    pj_res = await p_sess.execute(select(AIJob).where(AIJob.id == job_id))
                    pj = pj_res.scalar_one_or_none()
                    if pj:
                        pj.job_metadata = {**(pj.job_metadata or {}), "stage": "FINALIZING"}
                        await p_sess.commit()

                # Register genuine Asset record
                asset_id = str(uuid.uuid4())
                ext = output_path.suffix.lower()
                storage_rel = f"projects/{job.project_id}/assets/{asset_id}/transformed{ext}"

                with open(output_path, "rb") as f:
                    saved_key = await storage.save_file(storage_rel, f)

                local_saved = storage.get_local_path(storage_rel)
                file_size = os.path.getsize(local_saved) if local_saved.exists() else 0

                new_asset = Asset(
                    id=asset_id,
                    project_id=job.project_id,
                    asset_type="video" if is_video else "image",
                    file_name=f"transformed_{source_asset.file_name.rsplit('.', 1)[0]}{ext}",
                    storage_key=saved_key,
                    file_size_bytes=file_size,
                    mime_type="video/mp4" if is_video else "image/png",
                    duration_ms=metadata.get("duration_ms", 0),
                    metadata_info={
                        **metadata,
                        "source_asset_id": source_id,
                        "reference_asset_id": reference_id,
                        "transformation_mode": mode,
                        "is_mock": True,
                        "offline_label": "OFFLINE DEMO TRANSFORMATION (MOCK)",
                    },
                    folder_path="/AI Transforms",
                )
                session.add(new_asset)
                await session.flush()

                # Update AIJob as completed with COMPLETED stage and output dimensions
                job.status = "completed"
                job.progress_percent = 100.0
                job.result_asset_id = new_asset.id
                job.output_url = storage.get_url(saved_key)
                job.output_data = {
                    "asset_id": new_asset.id,
                    "url": storage.get_url(saved_key),
                    "file_name": new_asset.file_name,
                    "metadata": metadata,
                    "is_mock": True,
                }
                job.completed_at = datetime.now(timezone.utc)
                job.job_metadata = {
                    **(job.job_metadata or {}),
                    "stage": "COMPLETED",
                    "output_asset_id": new_asset.id,
                    # Phase 15: store output dimensions in job_metadata for polling consumers
                    "output_width": metadata.get("width"),
                    "output_height": metadata.get("height"),
                    "output_duration_ms": metadata.get("duration_ms"),
                }
                await session.commit()

                # Clean up temp file
                try:
                    if output_path.exists():
                        output_path.unlink()
                except Exception:
                    pass

                await ws_manager.broadcast_to_project(job.project_id, {
                    "type": "media_transform.completed",
                    "job_id": job_id,
                    "asset_id": new_asset.id,
                    "output_url": storage.get_url(saved_key)
                })

            except Exception as e:
                logger.exception(f"Transformation job {job_id} failed: {e}")
                try:
                    await session.rollback()
                    j_res = await session.execute(select(AIJob).where(AIJob.id == job_id))
                    job = j_res.scalar_one_or_none()
                    if job:
                        job.status = "failed"
                        job.error_message = f"Transformation could not be completed: {str(e)}"
                        job.job_metadata = {**(job.job_metadata or {}), "stage": "FAILED"}
                        await session.commit()
                except Exception:
                    pass
            finally:
                _active_transform_tasks.pop(job_id, None)

    @staticmethod
    async def get_job(db: AsyncSession, job_id: str) -> Optional[AIJob]:
        """Fetches an AIJob record by ID."""
        res = await db.execute(select(AIJob).where(AIJob.id == job_id))
        return res.scalar_one_or_none()

    @staticmethod
    async def cancel_job(db: AsyncSession, job_id: str) -> Optional[AIJob]:
        """Cancels an in-flight transformation job."""
        res = await db.execute(select(AIJob).where(AIJob.id == job_id))
        job = res.scalar_one_or_none()
        if not job:
            return None

        if job.status in ["queued", "processing"]:
            task = _active_transform_tasks.get(job_id)
            if task and not task.done():
                task.cancel()
            job.status = "cancelled"
            job.job_metadata = {**(job.job_metadata or {}), "stage": "Cancelled by user"}
            await db.commit()
            await db.refresh(job)

        return job

    @staticmethod
    async def add_to_timeline(
        db: AsyncSession,
        job_id: str,
        track_role: str = "v1_main",
        insert_at_ms: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Inserts the completed transformed asset into the project's timeline on the specified track
        and creates an auto-save revision snapshot.
        """
        # 1. Fetch Job
        job = await MediaTransformationService.get_job(db, job_id)
        if not job:
            raise ValueError(f"Transformation job '{job_id}' not found.")
        if job.status != "completed" or not job.result_asset_id:
            raise ValueError("Job must be completed before adding its result to the timeline.")

        # 2. Fetch Result Asset
        a_res = await db.execute(select(Asset).where(Asset.id == job.result_asset_id))
        asset = a_res.scalar_one_or_none()
        if not asset:
            raise ValueError(f"Output asset '{job.result_asset_id}' not found.")
        if str(asset.project_id) != str(job.project_id):
            raise ValueError("Asset project ownership mismatch.")

        # 3. Fetch or Create Timeline
        timeline = await TimelineService.get_timeline_by_project(db, job.project_id)
        if not timeline:
            timeline = Timeline(
                id=str(uuid.uuid4()),
                project_id=job.project_id,
                name="Main Sequence",
                duration_ms=asset.duration_ms or 5000
            )
            db.add(timeline)
            await db.flush()

        # Phase 16: Idempotent duplicate-clip protection
        # If this transformed asset is already present on the timeline, return the existing clip without duplicating
        c_res = await db.execute(
            select(Clip).join(Track).where(Track.timeline_id == timeline.id, Clip.asset_id == asset.id)
        )
        existing_clip = c_res.scalars().first()
        if existing_clip:
            revs = await TimelineService.get_revisions(db, job.project_id)
            latest_rev = revs[0] if revs else None
            return {
                "success": True,
                "clip_id": existing_clip.id,
                "track_id": existing_clip.track_id,
                "timeline_id": timeline.id,
                "start_time_ms": existing_clip.start_time_ms,
                "duration_ms": existing_clip.duration_ms,
                "revision_id": latest_rev.id if latest_rev else None,
                "is_existing": True,
                "message": "Transformed media is already present on the timeline track."
            }

        # 4. Find or Create Track
        is_visual = asset.asset_type in ["video", "image"]
        expected_type = "video" if is_visual else "audio"

        target_track = None
        for track in (timeline.tracks or []):
            if track.track_role == track_role:
                target_track = track
                break

        if not target_track:
            for track in (timeline.tracks or []):
                if track.track_type == expected_type:
                    target_track = track
                    break

        if not target_track:
            target_track = Track(
                id=str(uuid.uuid4()),
                timeline_id=timeline.id,
                track_type=expected_type,
                track_role=track_role,
                order_index=len(timeline.tracks or []),
                name=f"Track {track_role.upper()}",
            )
            db.add(target_track)
            await db.flush()

        existing_clips = target_track.clips or []

        # 5. Create Revision Snapshot before mutation
        await TimelineService.create_revision_snapshot(
            db=db,
            timeline_id=timeline.id,
            description=f"Auto-save before adding transformed media '{asset.file_name}'",
            timeline_obj=timeline
        )

        # 6. Determine Start Time and Duration
        clip_duration = asset.duration_ms if (asset.duration_ms and asset.duration_ms > 0) else 5000
        if insert_at_ms is not None:
            start_time = insert_at_ms
        else:
            # Append at end of track
            if existing_clips:
                last_clip = max(existing_clips, key=lambda c: c.start_time_ms + c.duration_ms)
                start_time = last_clip.start_time_ms + last_clip.duration_ms
            else:
                start_time = 0

        # 7. Create Clip
        clip = Clip(
            id=str(uuid.uuid4()),
            track_id=target_track.id,
            asset_id=asset.id,
            name=f"Transformed: {asset.file_name}",
            clip_type="media",
            start_time_ms=start_time,
            duration_ms=clip_duration,
            source_in_ms=0,
            source_out_ms=clip_duration,
            speed_factor=1.0,
            metadata_info={"is_transformed": True, "source_asset_id": job.input_data.get("source_asset_id")},
        )
        db.add(clip)

        # Update timeline duration if extended
        if start_time + clip_duration > (timeline.duration_ms or 0):
            timeline.duration_ms = start_time + clip_duration

        await db.commit()

        # Fetch revision ID if available
        revs = await TimelineService.get_revisions(db, job.project_id)
        latest_rev_id = revs[0].id if revs else None

        logger.info(f"Added transformed asset {asset.id} to track {target_track.id} (clip={clip.id})")
        return {
            "success": True,
            "clip_id": clip.id,
            "track_id": target_track.id,
            "timeline_id": timeline.id,
            "revision_id": latest_rev_id,
            "message": f"Added transformed media to Track {target_track.name or track_role}",
        }
