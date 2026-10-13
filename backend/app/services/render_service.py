import asyncio
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.core.storage import storage
from app.core.ffmpeg import ffmpeg_service
from app.core.websocket_manager import ws_manager
from app.models.render_job import RenderJob
from app.models.asset import Asset
from app.models.timeline import Timeline
from app.schemas.render import RenderEnqueueRequest

logger = logging.getLogger("tamil_ai_forge.render")

# Registry of active background render tasks for graceful cancellation
_active_render_tasks: Dict[str, asyncio.Task] = {}

class RenderService:
    @staticmethod
    async def list_jobs(db: AsyncSession, project_id: Optional[str] = None) -> List[RenderJob]:
        query = select(RenderJob)
        if project_id:
            query = query.where(RenderJob.project_id == project_id)
        query = query.order_by(desc(RenderJob.created_at))
        res = await db.execute(query)
        return list(res.scalars().all())

    @staticmethod
    async def get_job(db: AsyncSession, job_id: str) -> Optional[RenderJob]:
        query = select(RenderJob).where(RenderJob.id == job_id)
        res = await db.execute(query)
        return res.scalar_one_or_none()

    @staticmethod
    async def enqueue_render(db: AsyncSession, project_id: str, data: RenderEnqueueRequest) -> RenderJob:
        preset_dict = data.export_preset.model_dump() if data.export_preset else {
            "format": "mp4",
            "video_codec": "libx264",
            "crf": 18,
            "fps": 30.0,
            "width": 1920,
            "height": 1080,
            "audio_codec": "aac",
            "audio_bitrate": "192k"
        }

        job = RenderJob(
            id=str(uuid.uuid4()),
            project_id=project_id,
            timeline_id=data.timeline_id,
            job_type=data.job_type,
            export_preset=preset_dict,
            status="queued",
            progress_percent=0.0,
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        # Notify via WebSocket
        await ws_manager.broadcast_to_project(project_id, {
            "type": "render.queued",
            "job_id": job.id,
            "project_id": project_id,
            "preset": preset_dict,
        })

        # Launch non-blocking background render worker outside HTTP request lifecycle
        task = asyncio.create_task(
            RenderService._execute_render_job(job.id, project_id, data.timeline_id, preset_dict)
        )
        _active_render_tasks[job.id] = task

        return job

    @staticmethod
    async def _execute_render_job(job_id: str, project_id: str, timeline_id: str, preset: Dict[str, Any]):
        """Background render task that runs completely outside the HTTP request lifecycle."""
        logger.info(f"Starting background render job {job_id} for project {project_id}")
        async with AsyncSessionLocal() as session:
            try:
                # 1. Update status to processing
                query = select(RenderJob).where(RenderJob.id == job_id)
                res = await session.execute(query)
                job = res.scalar_one_or_none()
                if not job or job.status == "cancelled":
                    return

                job.status = "processing"
                job.started_at = datetime.now(timezone.utc)
                job.progress_percent = 5.0
                await session.commit()

                await ws_manager.broadcast_to_project(project_id, {
                    "type": "render.processing",
                    "job_id": job_id,
                    "progress": 5.0,
                })

                # 2. Fetch timeline and tracks
                tl_query = select(Timeline).where(Timeline.id == timeline_id)
                tl_res = await session.execute(tl_query)
                timeline = tl_res.scalar_one_or_none()
                timeline_dur_ms = timeline.duration_ms if timeline else 30000

                # 3. Resolve clips and media asset paths
                video_clips = []
                audio_clips = []
                graphics_clips = []

                if timeline and timeline.tracks:
                    # Check if any audio track has is_solo = True
                    has_solo_audio = any(
                        bool(getattr(t, 'is_solo', False)) for t in timeline.tracks
                        if t.track_type == 'audio' or getattr(t, 'track_role', '') in ['dialogue', 'voiceover', 'music', 'sfx', 'ambience']
                    )

                    for track in sorted(timeline.tracks, key=lambda t: t.order_index):
                        if track.is_muted or not track.is_visible:
                            continue

                        is_audio_track = (track.track_type == 'audio' or getattr(track, 'track_role', '') in ['dialogue', 'voiceover', 'music', 'sfx', 'ambience'])
                        if is_audio_track and has_solo_audio and not getattr(track, 'is_solo', False):
                            continue

                        is_graphics_track = (getattr(track, 'track_role', '') == 'graphics' or track.name.lower() == 'graphics')

                        for clip in sorted(track.clips, key=lambda c: c.start_time_ms):
                            if is_graphics_track or clip.clip_type == 'title':
                                graphics_clips.append({
                                    "id": clip.id,
                                    "name": clip.name,
                                    "start_time_ms": clip.start_time_ms,
                                    "duration_ms": clip.duration_ms,
                                    "fade_in_ms": clip.fade_in_ms,
                                    "fade_out_ms": clip.fade_out_ms,
                                    "position_x": clip.position_x,
                                    "position_y": clip.position_y,
                                    "opacity": clip.opacity,
                                    "metadata_info": clip.metadata_info or {},
                                })
                            elif clip.asset_id:
                                asset_query = select(Asset).where(Asset.id == clip.asset_id)
                                a_res = await session.execute(asset_query)
                                asset = a_res.scalar_one_or_none()

                                if asset and asset.storage_key:
                                    try:
                                        local_path = storage.get_local_path(asset.storage_key)
                                        if local_path.exists():
                                            track_vol = getattr(track, 'volume_db', 0.0) or 0.0
                                            clip_vol = getattr(clip, 'volume_db', 0.0) or 0.0
                                            track_pan = getattr(track, 'pan', 0.0) or 0.0
                                            clip_meta = clip.metadata_info or {}
                                            clip_pan = clip_meta.get('pan', 0.0) if isinstance(clip_meta, dict) else 0.0
                                            pan_val = float(track_pan if abs(track_pan) > 0.001 else clip_pan)
                                            pan_val = max(-1.0, min(1.0, pan_val))

                                            keyframes_list = [
                                                {
                                                    "id": kf.id,
                                                    "property_path": kf.property_path,
                                                    "time_offset_ms": kf.time_offset_ms,
                                                    "value": kf.value,
                                                    "interpolation": getattr(kf, 'interpolation', 'linear'),
                                                }
                                                for kf in (getattr(clip, 'keyframes', []) or [])
                                            ]

                                            clip_info = {
                                                "file_path": local_path,
                                                "start_time_ms": clip.start_time_ms,
                                                "duration_ms": clip.duration_ms,
                                                "source_in_ms": clip.source_in_ms,
                                                "source_out_ms": clip.source_out_ms,
                                                "speed_factor": clip.speed_factor,
                                                "is_reversed": clip.is_reversed,
                                                "is_frozen": getattr(clip, "is_frozen", False),
                                                "freeze_at_ms": getattr(clip, "freeze_at_ms", None),
                                                "freeze_duration_ms": getattr(clip, "freeze_duration_ms", 2000),
                                                "is_frame_hold": getattr(clip, "is_frame_hold", clip_meta.get("is_frame_hold", False)),
                                                "frame_hold_at_ms": getattr(clip, "frame_hold_at_ms", clip_meta.get("frame_hold_at_ms")),
                                                "frame_hold_duration_ms": getattr(clip, "frame_hold_duration_ms", clip_meta.get("frame_hold_duration_ms", 2000)),
                                                "track_volume_db": track_vol,
                                                "clip_volume_db": clip_vol,
                                                "volume_db": track_vol + clip_vol,
                                                "pan": pan_val,
                                                "fade_in_ms": clip.fade_in_ms,
                                                "fade_out_ms": clip.fade_out_ms,
                                                "track_role": getattr(track, 'track_role', 'audio') or 'audio',
                                                "position_x": getattr(clip, "position_x", 0.5),
                                                "position_y": getattr(clip, "position_y", 0.5),
                                                "scale_x": getattr(clip, "scale_x", 1.0),
                                                "scale_y": getattr(clip, "scale_y", 1.0),
                                                "rotation": getattr(clip, "rotation", 0.0),
                                                "opacity": getattr(clip, "opacity", 1.0),
                                                "id": clip.id,
                                                "transition_in": getattr(clip, "transition_in", None),
                                                "transition_out": getattr(clip, "transition_out", None),
                                                "metadata_info": clip_meta,
                                                "keyframes": keyframes_list,
                                            }
                                            if track.track_type == "video":
                                                video_clips.append(clip_info)
                                            elif track.track_type == "audio":
                                                audio_clips.append(clip_info)
                                    except Exception as path_err:
                                        logger.warning(f"Could not resolve asset path for clip {clip.id}: {path_err}")

                # 4. Handle Subtitle Burn-In & Export Preparation
                burn_subtitles = bool(preset.get("burn_subtitles"))
                subtitles_path = None
                if burn_subtitles:
                    from app.models.caption import Caption
                    from app.core.caption_parser import export_srt
                    cap_res = await session.execute(
                        select(Caption).where(Caption.project_id == project_id).order_by(Caption.start_time_ms)
                    )
                    captions_list = list(cap_res.scalars().all())
                    if captions_list:
                        cap_dicts = [{"start_ms": c.start_time_ms, "end_ms": c.end_time_ms, "text": c.text} for c in captions_list]
                        srt_content = export_srt(cap_dicts)
                        subtitles_path = storage.get_local_path(f"projects/{project_id}/renders/{job_id}_subs.srt")
                        subtitles_path.parent.mkdir(parents=True, exist_ok=True)
                        subtitles_path.write_text(srt_content, encoding="utf-8")

                # Define target output file path in storage
                rel_output_key = f"projects/{project_id}/renders/{job_id}.mp4"
                output_local_path = storage.get_local_path(rel_output_key)
                output_local_path.parent.mkdir(parents=True, exist_ok=True)

                # Progress callback updater
                last_reported_pct = 5.0
                async def on_progress(pct: float):
                    nonlocal last_reported_pct
                    if pct - last_reported_pct >= 4.0 or pct >= 99.0:
                        last_reported_pct = pct
                        async with AsyncSessionLocal() as prog_session:
                            p_query = select(RenderJob).where(RenderJob.id == job_id)
                            p_res = await prog_session.execute(p_query)
                            p_job = p_res.scalar_one_or_none()
                            if p_job and p_job.status == "processing":
                                p_job.progress_percent = pct
                                await prog_session.commit()
                        await ws_manager.broadcast_to_project(project_id, {
                            "type": "render.progress",
                            "job_id": job_id,
                            "progress": pct,
                        })

                # 5. Execute FFmpeg rendering pipeline with multi-track audio & subtitles
                render_ok = await ffmpeg_service.render_timeline_sequence(
                    timeline_duration_ms=timeline_dur_ms,
                    video_clips=video_clips,
                    audio_clips=audio_clips,
                    output_path=output_local_path,
                    export_preset=preset,
                    progress_callback=on_progress,
                    subtitles_path=subtitles_path,
                    burn_subtitles=burn_subtitles,
                    graphics_clips=graphics_clips,
                )

                if render_ok and output_local_path.exists():
                    file_size = output_local_path.stat().st_size
                    output_url = storage.get_url(rel_output_key)

                    # Export audio stems if requested
                    stems_map = {}
                    if preset.get("export_stems") and audio_clips:
                        total_dur_sec = max(1.0, timeline_dur_ms / 1000.0)
                        for role_key, roles in [
                            ("dialogue", ["dialogue", "voiceover"]),
                            ("music", ["music"]),
                            ("sfx", ["sfx", "ambience"])
                        ]:
                            stem_clips = [c for c in audio_clips if c.get("track_role", "").lower() in roles or (role_key == "dialogue" and "dial" in c.get("track_role", "").lower())]
                            if stem_clips:
                                stem_rel_key = f"projects/{project_id}/renders/{job_id}_{role_key}_stem.wav"
                                stem_local = storage.get_local_path(stem_rel_key)
                                stem_inputs = [
                                    {
                                        "path": c["file_path"],
                                        "volume": 10.0 ** (c.get("volume_db", 0.0) / 20.0),
                                        "delay_ms": c.get("start_time_ms", 0),
                                        "fade_in_ms": c.get("fade_in_ms", 0),
                                        "fade_out_ms": c.get("fade_out_ms", 0),
                                    } for c in stem_clips
                                ]
                                stem_ok = await ffmpeg_service.mix_audio_tracks(stem_inputs, stem_local, total_duration_sec=total_dur_sec)
                                if stem_ok and stem_local.exists():
                                    stem_asset = Asset(
                                        id=str(uuid.uuid4()),
                                        project_id=project_id,
                                        asset_type="audio",
                                        file_name=f"{role_key.capitalize()}_Stem_{job_id[:8]}.wav",
                                        storage_key=stem_rel_key,
                                        file_size_bytes=stem_local.stat().st_size,
                                        mime_type="audio/wav",
                                        duration_ms=timeline_dur_ms,
                                        metadata_info={"is_stem": True, "stem_role": role_key},
                                        folder_path="/Exports/Stems",
                                    )
                                    session.add(stem_asset)
                                    await session.flush()
                                    stems_map[role_key] = storage.get_url(stem_rel_key)

                    # Create rendered Asset in DB
                    rendered_asset = Asset(
                        id=str(uuid.uuid4()),
                        project_id=project_id,
                        asset_type="video",
                        file_name=f"Master_{preset.get('width', 1920)}p_{job_id[:8]}.mp4",
                        storage_key=rel_output_key,
                        file_size_bytes=file_size,
                        mime_type="video/mp4",
                        duration_ms=timeline_dur_ms,
                        thumbnail_url=output_url,
                        metadata_info={
                            "width": preset.get("width", 1920),
                            "height": preset.get("height", 1080),
                            "fps": preset.get("fps", 30.0),
                            "format": "mp4",
                            "is_rendered_master": True,
                            "burn_subtitles": burn_subtitles,
                            "framing_mode": preset.get("framing_mode", "fit"),
                            "stems": stems_map,
                        },
                        folder_path="/Exports",
                    )
                    session.add(rendered_asset)
                    await session.flush()

                    # Update job completion
                    query = select(RenderJob).where(RenderJob.id == job_id)
                    res = await session.execute(query)
                    job = res.scalar_one_or_none()
                    if job:
                        job.status = "completed"
                        job.progress_percent = 100.0
                        job.output_path = output_url
                        job.output_asset_id = rendered_asset.id
                        job.completed_at = datetime.now(timezone.utc)
                        await session.commit()

                    logger.info(f"Render job {job_id} successfully completed: {output_url}")
                    await ws_manager.broadcast_to_project(project_id, {
                        "type": "render.completed",
                        "job_id": job_id,
                        "output_url": output_url,
                        "asset_id": rendered_asset.id,
                    })
                else:
                    # Render failed
                    query = select(RenderJob).where(RenderJob.id == job_id)
                    res = await session.execute(query)
                    job = res.scalar_one_or_none()
                    if job:
                        job.status = "failed"
                        job.error_message = "FFmpeg process returned non-zero exit code"
                        await session.commit()

                    await ws_manager.broadcast_to_project(project_id, {
                        "type": "render.failed",
                        "job_id": job_id,
                        "error": "FFmpeg process failed during timeline assembly",
                    })

            except asyncio.CancelledError:
                logger.info(f"Render job {job_id} was cancelled.")
                try:
                    await session.rollback()
                    query = select(RenderJob).where(RenderJob.id == job_id)
                    res = await session.execute(query)
                    job = res.scalar_one_or_none()
                    if job:
                        job.status = "cancelled"
                        await session.commit()
                except Exception:
                    pass
            except Exception as exc:
                logger.error(f"Render job {job_id} failed with exception: {exc}", exc_info=True)
                try:
                    await session.rollback()
                    query = select(RenderJob).where(RenderJob.id == job_id)
                    res = await session.execute(query)
                    job = res.scalar_one_or_none()
                    if job:
                        job.status = "failed"
                        job.error_message = str(exc)
                        await session.commit()
                except Exception:
                    pass
                await ws_manager.broadcast_to_project(project_id, {
                    "type": "render.failed",
                    "job_id": job_id,
                    "error": str(exc),
                })
            finally:
                _active_render_tasks.pop(job_id, None)

    @staticmethod
    async def cancel_job(db: AsyncSession, job_id: str) -> Optional[RenderJob]:
        job = await RenderService.get_job(db, job_id)
        if not job:
            return None

        # Cancel running task if active
        task = _active_render_tasks.get(job_id)
        if task and not task.done():
            task.cancel()

        if job.status in ["queued", "processing"]:
            job.status = "cancelled"
            try:
                await db.commit()
                await db.refresh(job)
            except Exception:
                await asyncio.sleep(0.1)
                await db.rollback()
                job = await RenderService.get_job(db, job_id)
                if job:
                    job.status = "cancelled"
                    await db.commit()
                    await db.refresh(job)

            if job:
                await ws_manager.broadcast_to_project(job.project_id, {
                    "type": "render.cancelled",
                    "job_id": job.id,
                    "project_id": job.project_id,
                })

        return job

