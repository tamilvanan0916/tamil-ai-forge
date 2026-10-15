import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.ai_models import AIJob
from app.models.project import Project
from app.models.asset import Asset
from app.core.websocket_manager import ws_manager
from app.ai.registry import AIRegistry
import httpx
import json
import os
import shutil
from app.core.storage import storage
from app.core.ffmpeg import ffmpeg_service

logger = logging.getLogger("tamil_ai_forge.ai_job_service")

_active_ai_tasks: Dict[str, asyncio.Task] = {}


class AIJobService:
    @staticmethod
    async def create_job(
        db: AsyncSession,
        project_id: str,
        job_type: str,
        prompt: str,
        scene_id: Optional[str] = None,
        job_metadata: Optional[Dict[str, Any]] = None
    ) -> AIJob:
        """
        Creates an AIJob record in database and enqueues background processing.
        Returns job record immediately without blocking HTTP response.
        """
        job = AIJob(
            id=str(uuid.uuid4()),
            project_id=project_id,
            scene_id=scene_id,
            job_type=job_type,
            provider="configured" if AIRegistry.get_llm() else "unconfigured",
            prompt=prompt,
            status="queued",
            progress_percent=0.0,
            job_metadata=job_metadata or {}
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)

        # Broadcast via WebSocket
        await ws_manager.broadcast_to_project(project_id, {
            "type": "ai_job.queued",
            "job_id": job.id,
            "job_type": job_type,
            "status": "queued",
        })

        # Launch non-blocking background task
        task = asyncio.create_task(AIJobService._process_job(job.id, project_id, job_type, prompt, job_metadata or {}))
        _active_ai_tasks[job.id] = task

        return job

    @staticmethod
    async def _process_job(job_id: str, project_id: str, job_type: str, prompt: str, metadata: Dict[str, Any]):
        """Background execution worker for AI jobs with honest stage-based progression."""
        logger.info(f"Starting AI job {job_id} ({job_type})")
        from app.providers.factory import UnconfiguredProviderError
        async with AsyncSessionLocal() as session:
            try:
                # 1. Transition to 'running'
                res = await session.execute(select(AIJob).where(AIJob.id == job_id))
                job = res.scalar_one_or_none()
                if not job or job.status in ("running", "completed", "failed", "cancelled"):
                    logger.info(
                        f"AI job {job_id} already in status '{job.status if job else 'missing'}', "
                        "skipping duplicate run."
                    )
                    active_task = _active_ai_tasks.get(job_id)
                    if active_task and active_task is not asyncio.current_task():
                        try:
                            await asyncio.shield(active_task)
                        except asyncio.CancelledError:
                            curr_t = asyncio.current_task()
                            if curr_t and hasattr(curr_t, "cancelling") and curr_t.cancelling() > 0:
                                raise
                        except Exception:
                            pass
                    return

                job.status = "running"
                job.started_at = datetime.now(timezone.utc)
                await session.commit()

                await ws_manager.broadcast_to_project(project_id, {
                    "type": "ai_job.running",
                    "job_id": job_id,
                    "stage": "running"
                })

                # 2. Stage: provider_processing
                async with AsyncSessionLocal() as p_sess:
                    pj_res = await p_sess.execute(select(AIJob).where(AIJob.id == job_id))
                    pj = pj_res.scalar_one_or_none()
                    if pj and pj.status != "cancelled":
                        pj.status = "provider_processing"
                        await p_sess.commit()

                await ws_manager.broadcast_to_project(project_id, {
                    "type": "ai_job.provider_processing",
                    "job_id": job_id,
                    "stage": "provider_processing"
                })

                # Call real Provider based on job type
                gen_result = None
                if job_type in ["text_to_video", "video"]:
                    provider = AIRegistry.get_video()
                    gen_result = await provider.text_to_video(
                        prompt,
                        duration_sec=float(metadata.get("duration_sec", 5.0)),
                        width=int(metadata.get("width", 1280)),
                        height=int(metadata.get("height", 720)),
                        reference_image=metadata.get("reference_image")
                    )
                elif job_type == "image_to_video":
                    provider = AIRegistry.get_video()
                    ref_img = metadata.get("reference_image") or metadata.get("image_path") or ""
                    gen_result = await provider.image_to_video(
                        image_path=ref_img,
                        prompt=prompt,
                        duration_sec=float(metadata.get("duration_sec", 5.0)),
                    )
                elif job_type == "video_to_video":
                    provider = AIRegistry.get_video()
                    src_vid = metadata.get("source_video") or metadata.get("video_path") or ""
                    gen_result = await provider.video_to_video(
                        video_path=src_vid,
                        prompt=prompt,
                    )
                elif job_type == "image":
                    provider = AIRegistry.get_image()
                    results = await provider.generate(prompt, width=int(metadata.get("width", 1024)), height=int(metadata.get("height", 1024)))
                    gen_result = results[0] if results else None
                elif job_type == "tts":
                    provider = AIRegistry.get_tts()
                    gen_result = await provider.synthesize(prompt, metadata.get("voice_id", "ta-IN-ValluvarNeural"))
                elif job_type == "music":
                    provider = AIRegistry.get_music()
                    gen_result = await provider.generate(prompt, duration_sec=float(metadata.get("duration_sec", 30.0)))
                elif job_type == "stt":
                    provider = AIRegistry.get_stt()
                    gen_result = await provider.transcribe(metadata.get("audio_path", ""))

                if not gen_result or not gen_result.success:
                    err_msg = gen_result.error if gen_result else "Provider returned no generation result"
                    raise RuntimeError(err_msg)

                result_asset_id = None
                output_url = gen_result.output_url

                # 3. For video jobs: real download -> real FFprobe validation -> database Asset registration
                if job_type in ["text_to_video", "video", "image_to_video", "video_to_video"] and output_url:
                    # Stage: downloading
                    async with AsyncSessionLocal() as stage_sess:
                        s_job = (await stage_sess.execute(select(AIJob).where(AIJob.id == job_id))).scalar_one_or_none()
                        if s_job and s_job.status != "cancelled":
                            s_job.status = "downloading"
                            await stage_sess.commit()

                    await ws_manager.broadcast_to_project(project_id, {
                        "type": "ai_job.downloading",
                        "job_id": job_id,
                        "stage": "downloading"
                    })

                    asset_id = str(uuid.uuid4())
                    ext = ".mp4"
                    storage_rel_path = f"projects/{project_id}/assets/{asset_id}/source{ext}"
                    local_dest = storage.get_local_path(storage_rel_path)
                    local_dest.parent.mkdir(parents=True, exist_ok=True)

                    from app.providers.omni_factory import _safe_diagnostic_summary
                    logger.info(f"[DIAGNOSTIC] AIJobService received output_url: {json.dumps(_safe_diagnostic_summary(output_url))}")

                    # 1. Normalize output media reference (supports str or dict/FileData)
                    target_media = output_url
                    if isinstance(target_media, dict):
                        p = target_media.get("path")
                        if p and isinstance(p, str) and os.path.exists(p) and os.path.isfile(p) and os.path.getsize(p) > 0:
                            target_media = p
                        else:
                            target_media = target_media.get("url") or target_media.get("path") or ""

                    target_str = str(target_media or "").strip()

                    # Resolve relative server paths like /file= or /tmp/ to full HF Space URL if not existing locally
                    if not os.path.exists(target_str):
                        if target_str.startswith("/file="):
                            target_str = f"https://frameai4687-omni-video-factory.hf.space{target_str}"
                        elif target_str.startswith("file="):
                            target_str = f"https://frameai4687-omni-video-factory.hf.space/{target_str}"
                        elif target_str.startswith("/tmp/"):
                            target_str = f"https://frameai4687-omni-video-factory.hf.space/file={target_str}"

                    logger.info(f"[DIAGNOSTIC] AIJobService resolved target_str: {json.dumps(_safe_diagnostic_summary(target_str))}")

                    # 2. Ingest media (copy local file or download remote stream)
                    if os.path.exists(target_str) and os.path.isfile(target_str):
                        if os.path.getsize(target_str) == 0:
                            raise ValueError("Invalid media: Source media file exists but is empty (0 bytes)")
                        shutil.copy2(target_str, local_dest)
                        logger.info(f"Ingested local provider media to {local_dest} ({local_dest.stat().st_size} bytes)")
                    elif target_str.startswith("http://") or target_str.startswith("https://"):
                        dl_headers = {}
                        if "hf.space" in target_str or "huggingface.co" in target_str:
                            from app.config import settings
                            hf_tok = os.environ.get("HF_TOKEN") or getattr(settings, "HF_TOKEN", None)
                            if hf_tok:
                                dl_headers["Authorization"] = f"Bearer {hf_tok}"

                        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as dl_client:
                            dl_res = await dl_client.get(target_str, headers=dl_headers)
                            if dl_res.status_code >= 400:
                                raise RuntimeError(f"Download failed: Provider returned HTTP {dl_res.status_code} for media URL")

                            content = dl_res.content
                            if not content or len(content) == 0:
                                raise ValueError("Download failed: Provider returned empty media content (0 bytes)")

                            ct = dl_res.headers.get("content-type", "").lower()
                            if "text/html" in ct or "application/json" in ct:
                                raise ValueError(f"Download failed: Provider returned content-type '{ct}' instead of video media")

                            head_bytes = content[:256].lstrip().lower()
                            if head_bytes.startswith(b"<!doctype") or head_bytes.startswith(b"<html") or head_bytes.startswith(b"{\"") or head_bytes.startswith(b"{'"):
                                raise ValueError("Download failed: Provider returned HTML or JSON text instead of video media")

                            with open(local_dest, "wb") as f:
                                f.write(content)

                        clean_target_log = target_str.split("?")[0]
                        logger.info(f"Downloaded provider media from {clean_target_log} to {local_dest} ({len(content)} bytes)")
                    else:
                        raise ValueError(f"Invalid media output path or URL: {target_str}")

                    # 3. Pre-validation: verify media file exists and is non-empty before FFprobe
                    file_sz = local_dest.stat().st_size if local_dest.exists() else 0
                    logger.info(f"[DIAGNOSTIC] AIJobService local_dest at {local_dest}: exists={local_dest.exists()}, size_bytes={file_sz}")
                    if not local_dest.exists() or file_sz == 0:
                        raise ValueError("Invalid media: Output media file was not written or is empty (0 bytes)")

                    # Stage: validating
                    async with AsyncSessionLocal() as stage_sess:
                        s_job = (await stage_sess.execute(select(AIJob).where(AIJob.id == job_id))).scalar_one_or_none()
                        if s_job and s_job.status != "cancelled":
                            s_job.status = "validating"
                            await stage_sess.commit()

                    await ws_manager.broadcast_to_project(project_id, {
                        "type": "ai_job.validating",
                        "job_id": job_id,
                        "stage": "validating"
                    })

                    probe_data = await ffmpeg_service.probe_media(local_dest)
                    logger.info(f"[DIAGNOSTIC] AIJobService probe_data: {probe_data}")
                    dur_ms = probe_data.get("duration_ms", 0)
                    w = probe_data.get("width")
                    h = probe_data.get("height")
                    codec = probe_data.get("codec_video")

                    if not local_dest.exists() or local_dest.stat().st_size == 0 or not dur_ms or not w or not h or not codec:
                        if local_dest.exists():
                            local_dest.unlink(missing_ok=True)
                        raise ValueError(f"Invalid media: Corrupted or missing video stream in downloaded provider output ({probe_data})")

                    # Stage: registering_asset
                    async with AsyncSessionLocal() as stage_sess:
                        s_job = (await stage_sess.execute(select(AIJob).where(AIJob.id == job_id))).scalar_one_or_none()
                        if s_job and s_job.status != "cancelled":
                            s_job.status = "registering_asset"
                            await stage_sess.commit()

                    await ws_manager.broadcast_to_project(project_id, {
                        "type": "ai_job.registering_asset",
                        "job_id": job_id,
                        "stage": "registering_asset"
                    })

                    target_scene_id = metadata.get("scene_id")
                    if not target_scene_id:
                        async with AsyncSessionLocal() as job_sc_sess:
                            j_sc_res = await job_sc_sess.execute(select(AIJob.scene_id).where(AIJob.id == job_id))
                            target_scene_id = j_sc_res.scalar_one_or_none()

                    file_size = local_dest.stat().st_size
                    new_asset = Asset(
                        id=asset_id,
                        project_id=project_id,
                        asset_type="video",
                        file_name=f"ai_gen_{job_id[:8]}{ext}",
                        storage_key=storage_rel_path,
                        file_size_bytes=file_size,
                        mime_type="video/mp4",
                        duration_ms=dur_ms,
                        metadata_info={
                            "width": w,
                            "height": h,
                            "fps": probe_data.get("fps", 30.0),
                            "codec": codec,
                            "source": "ai_generated",
                            "provider": gen_result.usage.get("provider") if gen_result.usage else "runway",
                            "prompt": prompt,
                            "generation_job_id": job_id,
                            "scene_id": target_scene_id,
                            "scene_number": metadata.get("scene_number")
                        }
                    )
                    async with AsyncSessionLocal() as reg_sess:
                        reg_sess.add(new_asset)
                        await reg_sess.commit()
                        await reg_sess.refresh(new_asset)

                    if target_scene_id:
                        from app.models.ai_models import Scene, ProductionAssetVersion
                        async with AsyncSessionLocal() as sc_sess:
                            sc_res = await sc_sess.execute(select(Scene).where(Scene.id == target_scene_id))
                            sc_obj = sc_res.scalar_one_or_none()
                            if sc_obj:
                                sc_obj.status = "ready"
                                sc_obj.generated_asset_id = asset_id
                                v_num = metadata.get("version_number")
                                if v_num:
                                    v_res = await sc_sess.execute(
                                        select(ProductionAssetVersion).where(
                                            ProductionAssetVersion.scene_id == target_scene_id,
                                            ProductionAssetVersion.version_number == v_num
                                        )
                                    )
                                    t_v = v_res.scalar_one_or_none()
                                    if t_v:
                                        all_v = await sc_sess.execute(
                                            select(ProductionAssetVersion).where(ProductionAssetVersion.scene_id == target_scene_id)
                                        )
                                        for prev_v in all_v.scalars().all():
                                            if prev_v.id != t_v.id and prev_v.is_current:
                                                prev_v.is_current = False
                                                prev_v.status = "superseded"
                                        t_v.status = "current"
                                        t_v.is_current = True
                                        t_v.asset_id = asset_id
                                await sc_sess.commit()

                    # Generate thumbnail & proxy (awaited to ensure process handles close cleanly)
                    try:
                        await asyncio.gather(
                            ffmpeg_service.generate_thumbnail(
                                local_dest,
                                storage.get_local_path(f"projects/{project_id}/assets/{asset_id}/thumb.jpg"),
                                time_sec=min(1.0, (dur_ms / 1000) / 2)
                            ),
                            ffmpeg_service.generate_proxy(
                                local_dest,
                                storage.get_local_path(f"projects/{project_id}/assets/{asset_id}/proxy_720p.mp4")
                            ),
                            return_exceptions=True
                        )
                    except Exception:
                        pass

                    result_asset_id = asset_id
                    output_url = storage.get_url(storage_rel_path)

                # 4. Mark completed
                async with AsyncSessionLocal() as comp_sess:
                    c_job = (await comp_sess.execute(select(AIJob).where(AIJob.id == job_id))).scalar_one_or_none()
                    if c_job and c_job.status != "cancelled":
                        c_job.status = "completed"
                        c_job.progress_percent = 100.0
                        c_job.completed_at = datetime.now(timezone.utc)
                        c_job.result_asset_id = result_asset_id
                        c_job.output_url = output_url

                        sc_id = metadata.get("scene_id") or c_job.scene_id
                        v_id = metadata.get("version_id")
                        if not v_id and isinstance(c_job.job_metadata, dict):
                            v_id = c_job.job_metadata.get("version_id")
                        if not isinstance(v_id, str):
                            v_id = None

                        v_num = metadata.get("version_number")
                        if v_num is None and isinstance(c_job.job_metadata, dict):
                            v_num = c_job.job_metadata.get("version_number")
                        if not isinstance(v_num, int):
                            v_num = None

                        if sc_id:
                            from app.services.production_orchestrator import AIProductionOrchestrator
                            await AIProductionOrchestrator.finalize_scene_version(
                                db=comp_sess,
                                scene_id=sc_id,
                                version_number=v_num,
                                version_id=v_id,
                                success=True,
                                asset_id=result_asset_id
                            )
                        await comp_sess.commit()

                await ws_manager.broadcast_to_project(project_id, {
                    "type": "ai_job.completed",
                    "job_id": job_id,
                    "status": "completed",
                    "result_asset_id": result_asset_id,
                    "output_url": output_url
                })

            except UnconfiguredProviderError as e:
                # Honest state when provider is missing API key
                async with AsyncSessionLocal() as fail_sess:
                    res = await fail_sess.execute(select(AIJob).where(AIJob.id == job_id))
                    job = res.scalar_one_or_none()
                    if job and job.status != "cancelled":
                        job.status = "failed"
                        job.error_message = f"AI Provider Not Configured: {str(e)}"
                        job.completed_at = datetime.now(timezone.utc)

                        sc_id = metadata.get("scene_id") or job.scene_id
                        v_id = metadata.get("version_id")
                        if not v_id and isinstance(job.job_metadata, dict):
                            v_id = job.job_metadata.get("version_id")
                        if not isinstance(v_id, str):
                            v_id = None

                        v_num = metadata.get("version_number")
                        if v_num is None and isinstance(job.job_metadata, dict):
                            v_num = job.job_metadata.get("version_number")
                        if not isinstance(v_num, int):
                            v_num = None

                        if sc_id:
                            from app.services.production_orchestrator import AIProductionOrchestrator
                            await AIProductionOrchestrator.finalize_scene_version(
                                db=fail_sess,
                                scene_id=sc_id,
                                version_number=v_num,
                                version_id=v_id,
                                success=False,
                                asset_id=None,
                                error=f"AI Provider Not Configured: {str(e)}"
                            )
                        await fail_sess.commit()

                await ws_manager.broadcast_to_project(project_id, {
                    "type": "ai_job.failed",
                    "job_id": job_id,
                    "error": f"AI Provider Not Configured: {str(e)}"
                })

            except Exception as exc:
                logger.error(f"AI job {job_id} failed: {exc}", exc_info=True)
                async with AsyncSessionLocal() as fail_sess:
                    res = await fail_sess.execute(select(AIJob).where(AIJob.id == job_id))
                    job = res.scalar_one_or_none()
                    if job and job.status != "cancelled":
                        job.status = "failed"
                        job.error_message = str(exc)
                        job.completed_at = datetime.now(timezone.utc)

                        # Failure recovery: preserve previous valid asset and mark this version failed
                        sc_id = metadata.get("scene_id") or job.scene_id
                        v_id = metadata.get("version_id")
                        if not v_id and isinstance(job.job_metadata, dict):
                            v_id = job.job_metadata.get("version_id")
                        if not isinstance(v_id, str):
                            v_id = None

                        v_num = metadata.get("version_number")
                        if v_num is None and isinstance(job.job_metadata, dict):
                            v_num = job.job_metadata.get("version_number")
                        if not isinstance(v_num, int):
                            v_num = None

                        if sc_id:
                            from app.services.production_orchestrator import AIProductionOrchestrator
                            await AIProductionOrchestrator.finalize_scene_version(
                                db=fail_sess,
                                scene_id=sc_id,
                                version_number=v_num,
                                version_id=v_id,
                                success=False,
                                asset_id=None,
                                error=str(exc)
                            )
                        await fail_sess.commit()

                await ws_manager.broadcast_to_project(project_id, {
                    "type": "ai_job.failed",
                    "job_id": job_id,
                    "error": str(exc)
                })
            finally:
                curr_t = asyncio.current_task()
                if _active_ai_tasks.get(job_id) is curr_t:
                    _active_ai_tasks.pop(job_id, None)

    @staticmethod
    async def list_jobs(db: AsyncSession, project_id: Optional[str] = None) -> List[AIJob]:
        query = select(AIJob)
        if project_id:
            query = query.where(AIJob.project_id == project_id)
        query = query.order_by(desc(AIJob.created_at))
        res = await db.execute(query)
        return list(res.scalars().all())

    @staticmethod
    async def get_job(db: AsyncSession, job_id: str) -> Optional[AIJob]:
        res = await db.execute(select(AIJob).where(AIJob.id == job_id))
        return res.scalar_one_or_none()

    @staticmethod
    async def cancel_job(db: AsyncSession, job_id: str) -> Optional[AIJob]:
        res = await db.execute(select(AIJob).where(AIJob.id == job_id))
        job = res.scalar_one_or_none()
        if not job:
            return None

        task = _active_ai_tasks.get(job_id)
        if task and not task.done():
            task.cancel()

        if job.status in ["queued", "processing"]:
            job.status = "cancelled"
            await db.commit()
            await db.refresh(job)

            await ws_manager.broadcast_to_project(job.project_id, {
                "type": "ai_job.cancelled",
                "job_id": job.id,
            })
        return job

    @staticmethod
    async def retry_job(db: AsyncSession, job_id: str) -> Optional[AIJob]:
        res = await db.execute(select(AIJob).where(AIJob.id == job_id))
        job = res.scalar_one_or_none()
        if not job:
            return None

        job.status = "queued"
        job.progress_percent = 0.0
        job.error_message = None
        await db.commit()
        await db.refresh(job)

        task = asyncio.create_task(AIJobService._process_job(job.id, job.project_id, job.job_type, job.prompt or "", job.job_metadata or {}))
        _active_ai_tasks[job.id] = task

        return job
