from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

class MusicItemResponse(BaseModel):
    id: str
    folder_id: str
    title: str
    artist: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    mood: Optional[str] = None
    bpm: Optional[float] = None
    music_key: Optional[str] = None
    duration_ms: int
    file_size_bytes: int
    storage_key: str
    mime_type: str
    waveform_data: Optional[List[float]] = None
    thumbnail_url: Optional[str] = None
    tags: List[str] = []
    is_favorite: bool = False
    is_ai_generated: bool = False
    is_user_upload: bool = False
    license_info: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class MusicFolderResponse(BaseModel):
    id: str
    parent_id: Optional[str] = None
    name: str
    slug: str
    folder_path: str
    icon: Optional[str] = None
    order_index: int = 0
    items_count: Optional[int] = 0
    children: Optional[List['MusicFolderResponse']] = None

    class Config:
        from_attributes = True

class MusicMetadataUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    genre: Optional[str] = None
    mood: Optional[str] = None
    tags: Optional[List[str]] = None
    is_favorite: Optional[bool] = None
