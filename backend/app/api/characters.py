import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.character import Character
from app.schemas.character import CharacterCreate, CharacterUpdate, CharacterResponse

router = APIRouter(tags=["characters"])

@router.get("/projects/{project_id}/characters", response_model=List[CharacterResponse])
async def list_characters(project_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Character).where(Character.project_id == project_id).options(selectinload(Character.references))
    res = await db.execute(query)
    return list(res.scalars().all())

@router.post("/projects/{project_id}/characters", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def create_character(project_id: str, data: CharacterCreate, db: AsyncSession = Depends(get_db)):
    char = Character(
        id=str(uuid.uuid4()),
        project_id=project_id,
        name=data.name,
        description=data.description,
        personality=data.personality,
        voice_profile=data.voice_profile,
        visual_prompt=data.visual_prompt,
    )
    db.add(char)
    await db.commit()
    await db.refresh(char)
    return char

@router.get("/characters/{char_id}", response_model=CharacterResponse)
async def get_character(char_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Character).where(Character.id == char_id).options(selectinload(Character.references))
    res = await db.execute(query)
    char = res.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    return char

@router.patch("/characters/{char_id}", response_model=CharacterResponse)
async def update_character(char_id: str, data: CharacterUpdate, db: AsyncSession = Depends(get_db)):
    query = select(Character).where(Character.id == char_id).options(selectinload(Character.references))
    res = await db.execute(query)
    char = res.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")

    if data.name is not None:
        char.name = data.name
    if data.description is not None:
        char.description = data.description
    if data.personality is not None:
        char.personality = data.personality
    if data.voice_profile is not None:
        char.voice_profile = data.voice_profile
    if data.visual_prompt is not None:
        char.visual_prompt = data.visual_prompt

    await db.commit()
    await db.refresh(char)
    return char

@router.delete("/characters/{char_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(char_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Character).where(Character.id == char_id)
    res = await db.execute(query)
    char = res.scalar_one_or_none()
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    await db.delete(char)
    await db.commit()
    return None
