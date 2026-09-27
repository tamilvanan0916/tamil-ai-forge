from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.music_service import MusicService
from app.schemas.music import MusicItemResponse, MusicFolderResponse, MusicMetadataUpdate

router = APIRouter(prefix="/music", tags=["music"])

@router.get("/folders", response_model=List[MusicFolderResponse])
async def list_music_folders(db: AsyncSession = Depends(get_db)):
    return await MusicService.list_folders(db)

@router.get("/folders/{folder_id}/items", response_model=List[MusicItemResponse])
async def get_folder_items(folder_id: str, db: AsyncSession = Depends(get_db)):
    return await MusicService.get_folder_items(db, folder_id)

@router.get("/search", response_model=List[MusicItemResponse])
async def search_music(q: str = "", favorite_only: bool = False, db: AsyncSession = Depends(get_db)):
    return await MusicService.search_music(db, q, favorite_only)

@router.post("/upload", response_model=MusicItemResponse)
async def upload_music(
    folder_id: str = Form(...),
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    artist: Optional[str] = Form(None),
    genre: Optional[str] = Form(None),
    mood: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    return await MusicService.upload_music(db, folder_id, file, title, artist, genre, mood)

@router.patch("/items/{item_id}", response_model=MusicItemResponse)
async def update_music_metadata(item_id: str, data: MusicMetadataUpdate, db: AsyncSession = Depends(get_db)):
    updated = await MusicService.update_metadata(db, item_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Music item not found")
    return updated

@router.post("/items/{item_id}/favorite", response_model=MusicItemResponse)
async def toggle_favorite(item_id: str, db: AsyncSession = Depends(get_db)):
    updated = await MusicService.update_metadata(db, item_id, MusicMetadataUpdate(is_favorite=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Music item not found")
    return updated
