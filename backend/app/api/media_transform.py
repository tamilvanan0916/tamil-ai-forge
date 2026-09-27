from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.database import get_db
from app.services.media_transformation_service import MediaTransformationService
from app.core.storage import storage
from app.models.asset import Asset
from app.models.ai_models import AIJob
from app.schemas.media_transform import (
    MediaTransformCreateRequest,
    MediaTransformJobResponse,
    MediaTransformResultResponse,
    AddToTimelineRequest,
    AddToTimelineResponse,
    AddToAssetsResponse
)

router = APIRouter(prefix="/ai/media-transform", tags=["media-transform"])


def _build_job_response(job: "AIJob", req_mode: Optional[str] = None) -> MediaTransformJobResponse:
    """Helper to build a consistent MediaTransformJobResponse from an AIJob ORM row."""
    input_data = job.input_data or {}
    output_meta = (job.output_data or {}).get("metadata", {}) if job.output_data else {}
    job_meta = job.job_metadata or {}
    mode = req_mode or input_data.get("mode", "video_to_3d_cartoon")
    return MediaTransformJobResponse(
        job_id=job.id,
        project_id=job.project_id,
        mode=mode,
        status=job.status,
        progress_percent=job.progress_percent,
        current_stage=job_meta.get("stage", job.status),
        source_asset_id=input_data.get("source_asset_id", ""),
        reference_asset_id=input_data.get("reference_asset_id"),
        output_asset_id=job.result_asset_id,
        output_url=job.output_url,
        error=job.error_message,
        is_mock=True,
        offline_label="OFFLINE DEMO TRANSFORMATION (MOCK)",
        # Phase 15: surface output dimensions/duration if available
        output_width=output_meta.get("width") or job_meta.get("output_width"),
        output_height=output_meta.get("height") or job_meta.get("output_height"),
        output_duration_ms=output_meta.get("duration_ms") or job_meta.get("output_duration_ms"),
        transformation_mode=mode,
        metadata=job_meta,
        created_at=job.created_at.isoformat() if job.created_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
    )


@router.post("/create", response_model=MediaTransformJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_transformation_job(req: MediaTransformCreateRequest, db: AsyncSession = Depends(get_db)):
    """
    Creates an offline AI media transformation job (Image/Video to 3D Cartoon, Character Replacement, etc.).

    Phase 15 hardening:
    - Rejects duplicate in-flight jobs for the same project+mode+source to prevent double-submissions.
    - Returns HTTP 409 for duplicate jobs with the existing job_id so the client can resume polling.
    """
    # Phase 15: Duplicate job guard — reject if there is already an active job for the same project + source
    existing_res = await db.execute(
        select(AIJob).where(
            and_(
                AIJob.project_id == req.project_id,
                AIJob.status.in_(["queued", "processing"]),
                AIJob.input_data.contains({"source_asset_id": req.source_asset_id}),
            )
        )
    )
    existing_job = existing_res.scalar_one_or_none()
    if existing_job:
        # Return 409 with the existing active job so the UI can resume polling rather than panic
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "duplicate_job",
                "message": "A transformation job is already active for this source asset.",
                "job_id": existing_job.id,
                "status": existing_job.status,
            }
        )

    try:
        job = await MediaTransformationService.create_job(db, req)
        return _build_job_response(job, req.mode)
    except ValueError as e:
        err_msg = str(e).lower()
        if "required" in err_msg or "must be" in err_msg or "belong" in err_msg or "invalid" in err_msg:
            status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
        elif "not found" in err_msg:
            status_code = status.HTTP_404_NOT_FOUND
        else:
            status_code = status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Transformation error: {str(e)}")


@router.post("/{job_id}/start", response_model=MediaTransformJobResponse)
async def start_transformation_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Starts or resumes a transformation job if queued."""
    job = await MediaTransformationService.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return _build_job_response(job)


@router.get("/{job_id}", response_model=MediaTransformJobResponse)
async def get_transformation_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Fetches job status, progress percentage, stage, and output references."""
    job = await MediaTransformationService.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return _build_job_response(job)


@router.get("/{job_id}/result", response_model=MediaTransformResultResponse)
async def get_transformation_result(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Fetches transformation comparison assets and rich output/source file information.
    Phase 15: Now returns source file metadata (name, size, dimensions, duration) and
    output file metadata (name, size, dimensions, duration, transformation mode) for the UI.
    """
    job = await MediaTransformationService.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    input_data = job.input_data or {}
    source_id = input_data.get("source_asset_id", "")
    mode = input_data.get("mode", "video_to_3d_cartoon")

    # Fetch source asset metadata
    source_url = None
    source_file_name = None
    source_file_size_bytes = None
    source_duration_ms = None
    source_width = None
    source_height = None
    source_asset_type = None
    if source_id:
        s_res = await db.execute(select(Asset).where(Asset.id == source_id))
        s_asset = s_res.scalar_one_or_none()
        if s_asset:
            source_url = storage.get_url(s_asset.storage_key)
            source_file_name = s_asset.file_name
            source_file_size_bytes = s_asset.file_size_bytes
            source_duration_ms = s_asset.duration_ms
            source_asset_type = s_asset.asset_type
            s_meta = s_asset.metadata_info or {}
            source_width = s_meta.get("width")
            source_height = s_meta.get("height")

    # Fetch output asset metadata
    output_file_name = None
    output_file_size_bytes = None
    output_duration_ms = None
    output_width = None
    output_height = None
    if job.result_asset_id:
        o_res = await db.execute(select(Asset).where(Asset.id == job.result_asset_id))
        o_asset = o_res.scalar_one_or_none()
        if o_asset:
            output_file_name = o_asset.file_name
            output_file_size_bytes = o_asset.file_size_bytes
            output_duration_ms = o_asset.duration_ms
            o_meta = o_asset.metadata_info or {}
            output_width = o_meta.get("width")
            output_height = o_meta.get("height")

    output_meta = (job.output_data or {}).get("metadata", {})

    return MediaTransformResultResponse(
        job_id=job.id,
        status=job.status,
        mode=mode,
        source_asset_id=source_id,
        output_asset_id=job.result_asset_id,
        source_url=source_url,
        output_url=job.output_url,
        # Phase 15 source info
        source_file_name=source_file_name,
        source_file_size_bytes=source_file_size_bytes,
        source_duration_ms=source_duration_ms,
        source_width=source_width,
        source_height=source_height,
        source_asset_type=source_asset_type,
        # Phase 15 output info
        output_file_name=output_file_name,
        output_file_size_bytes=output_file_size_bytes,
        output_duration_ms=output_duration_ms,
        output_width=output_width,
        output_height=output_height,
        transformation_mode=mode,
        is_mock=True,
        offline_label="OFFLINE DEMO TRANSFORMATION (MOCK)",
        metadata=output_meta,
    )


@router.post("/{job_id}/cancel", response_model=MediaTransformJobResponse)
async def cancel_transformation_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """Cancels a queued or processing transformation job."""
    job = await MediaTransformationService.cancel_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return _build_job_response(job)


@router.post("/{job_id}/retry", response_model=MediaTransformJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def retry_transformation_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Phase 15: Retries a failed or cancelled transformation job by creating a new job
    with identical input parameters. Returns the new job response.
    """
    original = await MediaTransformationService.get_job(db, job_id)
    if not original:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    if original.status not in ["failed", "cancelled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only failed or cancelled jobs can be retried. Current status: {original.status}"
        )

    input_data = original.input_data or {}
    from app.schemas.media_transform import MediaTransformCreateRequest, MediaTransformOptions
    retry_req = MediaTransformCreateRequest(
        project_id=original.project_id,
        mode=input_data.get("mode", "image_to_3d_cartoon"),
        source_asset_id=input_data.get("source_asset_id", ""),
        reference_asset_id=input_data.get("reference_asset_id"),
        prompt=original.prompt,
        options=MediaTransformOptions(**input_data.get("options", {})) if input_data.get("options") else None,
    )
    try:
        new_job = await MediaTransformationService.create_job(db, retry_req)
        return _build_job_response(new_job, retry_req.mode)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Retry failed: {str(e)}")


@router.post("/{job_id}/add-to-assets", response_model=AddToAssetsResponse)
async def add_transformed_to_assets(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Confirms asset availability in the project's Media Library.
    Phase 15: Returns enriched metadata (dimensions, duration, transformation mode).
    """
    job = await MediaTransformationService.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    if job.status != "completed" or not job.result_asset_id:
        raise HTTPException(status_code=400, detail="Job has not completed or has no output asset.")

    a_res = await db.execute(select(Asset).where(Asset.id == job.result_asset_id))
    asset = a_res.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Output asset record not found.")

    asset.folder_path = "/AI Transforms"
    await db.commit()

    meta = asset.metadata_info or {}
    input_data = job.input_data or {}

    return AddToAssetsResponse(
        success=True,
        asset_id=asset.id,
        file_name=asset.file_name,
        asset_type=asset.asset_type,
        duration_ms=asset.duration_ms,
        width=meta.get("width"),
        height=meta.get("height"),
        transformation_mode=input_data.get("mode"),
        folder_path=asset.folder_path,
        message=f"Asset '{asset.file_name}' saved to Media Library (/AI Transforms)",
    )


@router.post("/{job_id}/add-to-timeline", response_model=AddToTimelineResponse)
async def add_transformed_to_timeline(
    job_id: str,
    req: AddToTimelineRequest = AddToTimelineRequest(),
    db: AsyncSession = Depends(get_db)
):
    """
    Inserts the transformed asset into the project timeline on Track V1 (or chosen track),
    recording an auto-save revision snapshot.
    Phase 15: Prevents duplicate insertion if the same asset clip already exists on the same track.
    """
    try:
        result = await MediaTransformationService.add_to_timeline(
            db=db,
            job_id=job_id,
            track_role=req.track_role,
            insert_at_ms=req.insert_at_ms
        )
        return AddToTimelineResponse(
            success=True,
            clip_id=result["clip_id"],
            track_id=result["track_id"],
            timeline_id=result["timeline_id"],
            revision_id=result.get("revision_id"),
            is_existing=result.get("is_existing", False),
            message=result["message"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add to timeline: {str(e)}")
