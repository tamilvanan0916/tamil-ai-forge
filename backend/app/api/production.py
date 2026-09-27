from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.ai_models import ProductionPlan, AIJob
from app.services.production_orchestrator import AIProductionOrchestrator
from app.schemas.production_schemas import (
    ProductionPlanCreateRequest, ProductionPlanStartRequest,
    SceneRegenerateRequest, StaleJobRecoveryRequest, ProductionPlanResponse
)

router = APIRouter(prefix="/production", tags=["production"])


@router.post("/plan", response_model=ProductionPlanResponse, status_code=status.HTTP_201_CREATED)
async def create_production_plan(
    data: ProductionPlanCreateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Creates a structured multi-scene production plan with:
    - 20 metadata fields per planned scene
    - Character consistency locked context
    - Scene continuity context propagation (Scene N-1 -> Scene N)
    - Deterministic generation task specifications
    """
    try:
        plan = await AIProductionOrchestrator.create_production_plan(
            db=db,
            project_id=data.project_id,
            story_id=data.story_id,
            prompt=data.prompt,
            target_duration_sec=data.target_duration_sec,
            genre=data.genre,
            mood=data.mood,
            aspect_ratio=data.aspect_ratio
        )
        return plan
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/start")
async def start_production(
    project_id: str,
    body: Optional[ProductionPlanStartRequest] = None,
    plan_id: Optional[str] = Query(None),
    force: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """
    Launches or resumes generation for all planned scenes in the project's production plan.
    Enforces idempotency: does not duplicate active or completed jobs unless force=True.
    """
    target_plan_id = (body and body.plan_id) or plan_id
    effective_force = (body and body.force) or force

    if not target_plan_id:
        # Find latest plan for project
        pl_res = await db.execute(
            select(ProductionPlan)
            .where(ProductionPlan.project_id == project_id)
            .order_by(ProductionPlan.created_at.desc())
        )
        plan = pl_res.scalars().first()
        if not plan:
            raise HTTPException(status_code=404, detail=f"No ProductionPlan found for project '{project_id}'")
        target_plan_id = plan.id

    try:
        return await AIProductionOrchestrator.start_production_plan(
            db=db,
            plan_id=target_plan_id,
            force=effective_force
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{project_id}/status")
async def get_production_status(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Returns live project-level, scene-level, and job-level progress,
    character lock status, and active video provider configuration.
    """
    return await AIProductionOrchestrator.get_production_status(db, project_id)


@router.post("/{project_id}/retry")
async def retry_production(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Safely retries all failed scenes with transient errors in the active production plan.
    Permanent errors (e.g. unconfigured provider, missing keys) are skipped.
    """
    try:
        return await AIProductionOrchestrator.retry_failed_scenes(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/scenes/{scene_id}/regenerate")
async def regenerate_scene(
    scene_id: str,
    body: Optional[SceneRegenerateRequest] = None,
    prompt: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Regenerates a single scene by creating a new generation job and updating the plan.
    """
    custom_p = (body and body.prompt) or prompt
    try:
        return await AIProductionOrchestrator.regenerate_scene(
            db=db,
            scene_id=scene_id,
            custom_prompt=custom_p
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{project_id}/recover-stale")
async def recover_stale_jobs(
    project_id: str,
    body: Optional[StaleJobRecoveryRequest] = None,
    stale_threshold_minutes: int = Query(10),
    db: AsyncSession = Depends(get_db)
):
    """
    Detects and transitions jobs stuck in generating/running beyond timeout threshold into recoverable state.
    """
    thresh = (body and body.stale_threshold_minutes) or stale_threshold_minutes
    recovered = await AIProductionOrchestrator.recover_stale_jobs(
        db=db,
        project_id=project_id,
        stale_threshold_minutes=thresh
    )
    return {
        "project_id": project_id,
        "recovered_count": len(recovered),
        "recovered_jobs": recovered
    }


@router.post("/{project_id}/auto-assemble")
async def auto_assemble_production(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Auto-assembles timeline from completed scene assets using strictly probed FFprobe durations.
    Non-overlapping sequential layout on Track V1.
    """
    try:
        timeline = await AIProductionOrchestrator.auto_assemble_production_timeline(db, project_id)
        return {
            "status": "success",
            "timeline_id": timeline.id,
            "duration_ms": timeline.duration_ms,
            "tracks_count": len(timeline.tracks)
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/pause")
async def pause_production(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Pauses active generation jobs for the project.
    """
    from app.services.ai_job_service import AIJobService
    q = select(AIJob).where(AIJob.project_id == project_id, AIJob.status.in_(["queued", "running"]))
    res = await db.execute(q)
    jobs = list(res.scalars().all())
    cancelled = []
    for j in jobs:
        await AIJobService.cancel_job(db, j.id)
        cancelled.append(j.id)

    return {
        "project_id": project_id,
        "status": "paused",
        "paused_jobs_count": len(cancelled),
        "paused_job_ids": cancelled
    }
