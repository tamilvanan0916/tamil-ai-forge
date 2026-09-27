from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

class StoryboardFrameResponse(BaseModel):
    id: str
    scene_id: str
    frame_number: int
    image_asset_id: Optional[str] = None
    prompt: Optional[str] = None
    description: Optional[str] = None
    camera_angle: Optional[str] = None
    duration_sec: float = 4.0
    created_at: datetime

    class Config:
        from_attributes = True

class SceneCreate(BaseModel):
    scene_number: int
    title: Optional[str] = None
    description: Optional[str] = None
    dialogue: Optional[str] = None
    visual_prompt: Optional[str] = None
    audio_prompt: Optional[str] = None
    duration_target_sec: Optional[float] = 5.0
    location: Optional[str] = None
    time_of_day: Optional[str] = None
    mood: Optional[str] = None

class SceneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    dialogue: Optional[str] = None
    visual_prompt: Optional[str] = None
    audio_prompt: Optional[str] = None
    duration_target_sec: Optional[float] = None
    location: Optional[str] = None
    time_of_day: Optional[str] = None
    mood: Optional[str] = None
    status: Optional[str] = None

class SceneResponse(BaseModel):
    id: str
    project_id: str
    scene_number: int
    title: Optional[str] = None
    description: Optional[str] = None
    dialogue: Optional[str] = None
    visual_prompt: Optional[str] = None
    audio_prompt: Optional[str] = None
    duration_target_sec: Optional[float] = None
    location: Optional[str] = None
    time_of_day: Optional[str] = None
    mood: Optional[str] = None
    status: str
    storyboard_frames: List[StoryboardFrameResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
