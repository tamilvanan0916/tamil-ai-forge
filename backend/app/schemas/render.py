from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class ExportPreset(BaseModel):
    model_config = ConfigDict(extra="allow", from_attributes=True)

    name: Optional[str] = "Custom"
    format: str = "mp4"  # mp4, mov, webm
    video_codec: str = "libx264"  # libx264, libx265, prores
    codec: Optional[str] = None
    crf: int = Field(18, ge=0, le=51)
    fps: float = Field(30.0, ge=1.0, le=120.0)
    width: int = Field(1920, ge=320, le=7680)
    height: int = Field(1080, ge=240, le=4320)
    audio_codec: str = "aac"
    audio_bitrate: str = "192k"
    bitrate_video: Optional[str] = None

class RenderEnqueueRequest(BaseModel):
    model_config = ConfigDict(extra="allow", from_attributes=True)

    timeline_id: str
    export_preset: Optional[ExportPreset] = None
    job_type: str = "export"

class RenderJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    timeline_id: str
    job_type: str
    export_preset: Dict[str, Any]
    status: str
    progress_percent: float
    output_path: Optional[str] = None
    error_message: Optional[str] = None
    chunks_total: Optional[int] = 1
    chunks_completed: Optional[int] = 0
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
