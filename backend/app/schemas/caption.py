from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

class CaptionItemSchema(BaseModel):
    id: Optional[str] = None
    project_id: str
    clip_id: Optional[str] = None
    language: str = "ta"
    start_time_ms: int
    end_time_ms: int
    text: str
    style: Optional[Dict[str, Any]] = None
    word_timestamps: Optional[List[Dict[str, Any]]] = None

class CaptionUpdateSchema(BaseModel):
    clip_id: Optional[str] = None
    language: Optional[str] = None
    start_time_ms: Optional[int] = None
    end_time_ms: Optional[int] = None
    text: Optional[str] = None
    style: Optional[Dict[str, Any]] = None
    word_timestamps: Optional[List[Dict[str, Any]]] = None

class CaptionAutoGenerateRequest(BaseModel):
    audio_asset_id: Optional[str] = None
    language: str = "ta" # Tamil default

class CaptionTranslateRequest(BaseModel):
    source_language: str
    target_language: str # 'en' or 'ta'

