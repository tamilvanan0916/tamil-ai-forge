from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.project_service import ProjectService
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectUnifiedStatusResponse

router = APIRouter(prefix="/projects", tags=["projects"])

@router.get("", response_model=List[ProjectResponse])
async def list_projects(db: AsyncSession = Depends(get_db)):
    return await ProjectService.list_projects(db)

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    return await ProjectService.create_project(db, data)

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await ProjectService.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.get("/{project_id}/unified-status", response_model=ProjectUnifiedStatusResponse)
async def get_unified_project_status(project_id: str, db: AsyncSession = Depends(get_db)):
    """
    Returns unified project production pipeline status covering:
    Project setup, Story, Scenes, Audio, Music, Captions, Timeline, Transformation, Rendering, and Deliverables.
    """
    status_data = await ProjectService.get_unified_status(db, project_id)
    if not status_data:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return status_data

@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, data: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    project = await ProjectService.update_project(db, project_id, data)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await ProjectService.delete_project(db, project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return None

@router.post("/{project_id}/duplicate", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_project(project_id: str, db: AsyncSession = Depends(get_db)):
    copy = await ProjectService.duplicate_project(db, project_id)
    if not copy:
        raise HTTPException(status_code=404, detail="Project not found")
    return copy
