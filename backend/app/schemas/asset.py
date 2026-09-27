from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

class AssetResponse(BaseModel):
    id: str
    project_id: str
    asset_type: str
    file_name: str
    storage_key: str
    file_size_bytes: int
    mime_type: str
    duration_ms: Optional[int] = None
    has_proxy: bool = False
    proxy_storage_key: Optional[str] = None
    thumbnail_url: Optional[str] = None
    waveform_data: Optional[List[float]] = None
    metadata_info: Dict[str, Any] = {}
    tags: List[str] = []
    is_favorite: bool = False
    folder_path: str = "/"
    created_at: datetime

    class Config:
        from_attributes = True

class AssetFolderUpdate(BaseModel):
    folder_path: str

class AssetFavoriteToggle(BaseModel):
    is_favorite: bool
