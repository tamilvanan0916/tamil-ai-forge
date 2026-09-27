from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

class ProjectSettings(BaseModel):
    width: int = Field(1920, ge=320, le=7680)
    height: int = Field(1080, ge=240, le=4320)
    fps: float = Field(30.0, ge=1.0, le=120.0)
    sample_rate: int = Field(48000)
    color_space: str = Field("bt709")
    max_duration_sec: int = Field(600, ge=30, le=600) # 30s min, 10 min max

class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    settings: Optional[ProjectSettings] = None
    story_data: Optional[Dict[str, Any]] = None

class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    settings: Optional[ProjectSettings] = None
    story_data: Optional[Dict[str, Any]] = None
    thumbnail_url: Optional[str] = None

class ProjectResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    settings: Dict[str, Any]
    story_data: Optional[Dict[str, Any]] = None
    thumbnail_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProjectUnifiedStatusResponse(BaseModel):
    project_id: str
    title: str
    created_at: Optional[str] = None
    current_stage: str
    completion_percent: float
    honest_message: str
    offline_label: str = "OFFLINE DEMO MODE (MOCK)"
    stages: Dict[str, Any]

    class Config:
        from_attributes = True
