from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.render_service import RenderService
from app.schemas.render import RenderEnqueueRequest, RenderJobResponse

router = APIRouter(prefix="/render", tags=["render"])

@router.get("/queue", response_model=List[RenderJobResponse])
async def list_render_queue(project_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    return await RenderService.list_jobs(db, project_id)

class DirectRenderJobRequest(RenderEnqueueRequest):
    project_id: str

@router.post("/jobs", response_model=RenderJobResponse, status_code=status.HTTP_201_CREATED)
async def create_render_job(data: DirectRenderJobRequest, db: AsyncSession = Depends(get_db)):
    return await RenderService.enqueue_render(db, data.project_id, data)

@router.post("/projects/{project_id}/enqueue", response_model=RenderJobResponse, status_code=status.HTTP_201_CREATED)
async def enqueue_render(project_id: str, data: RenderEnqueueRequest, db: AsyncSession = Depends(get_db)):
    return await RenderService.enqueue_render(db, project_id, data)

@router.get("/jobs/{job_id}", response_model=RenderJobResponse)
async def get_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await RenderService.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    return job

@router.post("/jobs/{job_id}/cancel", response_model=RenderJobResponse)
async def cancel_render_job(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await RenderService.cancel_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    return job
