from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict
from datetime import datetime


class ProductionPlanCreateRequest(BaseModel):
    project_id: str
    story_id: Optional[str] = None
    prompt: Optional[str] = None
    target_duration_sec: float = 30.0
    genre: str = "Drama"
    mood: str = "Cinematic"
    aspect_ratio: str = "16:9"


class ProductionPlanStartRequest(BaseModel):
    plan_id: Optional[str] = None
    force: bool = False


class SceneRegenerateRequest(BaseModel):
    prompt: Optional[str] = None


class StaleJobRecoveryRequest(BaseModel):
    stale_threshold_minutes: int = 10


class SceneExtendRequest(BaseModel):
    extend_sec: float = 4.0
    prompt: Optional[str] = None


class SceneGenerateRequest(BaseModel):
    strategy: str = "text_to_video"  # text_to_video, image_to_video, video_to_video
    prompt: Optional[str] = None
    reference_image: Optional[str] = None
    source_video: Optional[str] = None
    duration_sec: float = 5.0


class FilmCreateRequest(BaseModel):
    title: Optional[str] = None
    prompt: str
    target_duration_sec: float = 30.0
    genre: str = "Drama"
    mood: str = "Cinematic"
    language: str = "ta"
    aspect_ratio: str = "16:9"


class FilmAnalyzeRequest(BaseModel):
    prompt: str = "Cinematic Tamil film production"
    target_duration_sec: float = 30.0
    genre: str = "Drama"
    mood: str = "Cinematic"
    language: str = "ta"
    aspect_ratio: str = "16:9"


class ProductionPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    story_id: Optional[str] = None
    title: str
    target_duration_sec: float
    status: str
    progress_percent: float
    plan_data: Dict[str, Any] = {}
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FilmProduceAllRequest(BaseModel):
    prompt: Optional[str] = None
    target_duration_sec: float = 30.0
    genre: str = "Emotional Tamil"
    mood: str = "Cinematic"
    language: str = "ta"
    aspect_ratio: str = "16:9"
    force: bool = False

