import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.scene import Scene
from app.schemas.scene import SceneCreate, SceneUpdate, SceneResponse

router = APIRouter(tags=["scenes"])

@router.get("/projects/{project_id}/scenes", response_model=List[SceneResponse])
async def list_scenes(project_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Scene).where(Scene.project_id == project_id).options(selectinload(Scene.storyboard_frames)).order_by(Scene.scene_number)
    res = await db.execute(query)
    return list(res.scalars().all())

@router.post("/projects/{project_id}/scenes", response_model=SceneResponse, status_code=status.HTTP_201_CREATED)
async def create_scene(project_id: str, data: SceneCreate, db: AsyncSession = Depends(get_db)):
    scene = Scene(
        id=str(uuid.uuid4()),
        project_id=project_id,
        scene_number=data.scene_number,
        title=data.title,
        description=data.description,
        dialogue=data.dialogue,
        visual_prompt=data.visual_prompt,
        audio_prompt=data.audio_prompt,
        duration_target_sec=data.duration_target_sec,
        location=data.location,
        time_of_day=data.time_of_day,
        mood=data.mood,
        status="draft",
    )
    db.add(scene)
    await db.commit()
    await db.refresh(scene)
    return scene

@router.patch("/scenes/{scene_id}", response_model=SceneResponse)
async def update_scene(scene_id: str, data: SceneUpdate, db: AsyncSession = Depends(get_db)):
    query = select(Scene).where(Scene.id == scene_id).options(selectinload(Scene.storyboard_frames))
    res = await db.execute(query)
    scene = res.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    if data.title is not None:
        scene.title = data.title
    if data.description is not None:
        scene.description = data.description
    if data.dialogue is not None:
        scene.dialogue = data.dialogue
    if data.visual_prompt is not None:
        scene.visual_prompt = data.visual_prompt
    if data.audio_prompt is not None:
        scene.audio_prompt = data.audio_prompt
    if data.duration_target_sec is not None:
        scene.duration_target_sec = data.duration_target_sec
    if data.location is not None:
        scene.location = data.location
    if data.time_of_day is not None:
        scene.time_of_day = data.time_of_day
    if data.mood is not None:
        scene.mood = data.mood
    if data.status is not None:
        scene.status = data.status

    await db.commit()
    await db.refresh(scene)
    return scene

@router.delete("/scenes/{scene_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scene(scene_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Scene).where(Scene.id == scene_id)
    res = await db.execute(query)
    scene = res.scalar_one_or_none()
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    await db.delete(scene)
    await db.commit()
    return None
