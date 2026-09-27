from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

class MediaTransformOptions(BaseModel):
    style_preset: str = Field(default="3d_cartoon", description="Preset key: 3d_cartoon, pixar_family, cute_kids, cinematic_3d, anime, clay, storybook, realistic_cinematic, custom")
    style_name: Optional[str] = None
    style_strength: float = Field(default=80.0, ge=0.0, le=100.0)
    character_consistency: float = Field(default=85.0, ge=0.0, le=100.0)
    motion_preservation: float = Field(default=90.0, ge=0.0, le=100.0)
    background_preservation: float = Field(default=75.0, ge=0.0, le=100.0)
    negative_prompt: Optional[str] = None
    preserve_audio: bool = True
    character_id: Optional[str] = None
    custom_settings: Optional[Dict[str, Any]] = None

class MediaTransformCreateRequest(BaseModel):
    project_id: str
    mode: str = Field(..., description="IMAGE_TO_3D_CARTOON, VIDEO_TO_3D_CARTOON, CHARACTER_REPLACEMENT, IMAGE_CHARACTER_STYLE (or snake_case aliases)")
    source_asset_id: str
    reference_asset_id: Optional[str] = None
    prompt: Optional[str] = None
    options: Optional[MediaTransformOptions] = None

class MediaTransformJobResponse(BaseModel):
    job_id: str
    project_id: str
    mode: str
    status: str
    progress_percent: float
    current_stage: Optional[str] = None
    source_asset_id: str
    reference_asset_id: Optional[str] = None
    output_asset_id: Optional[str] = None
    output_url: Optional[str] = None
    error: Optional[str] = None
    is_mock: bool = True
    offline_label: str = "OFFLINE DEMO TRANSFORMATION (MOCK)"
    # Phase 15: output dimensions / duration surfaced in job response
    output_width: Optional[int] = None
    output_height: Optional[int] = None
    output_duration_ms: Optional[int] = None
    transformation_mode: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None

class MediaTransformResultResponse(BaseModel):
    job_id: str
    status: str
    mode: str
    source_asset_id: str
    output_asset_id: Optional[str] = None
    source_url: Optional[str] = None
    output_url: Optional[str] = None
    # Phase 15: rich file-info fields
    source_file_name: Optional[str] = None
    source_file_size_bytes: Optional[int] = None
    source_duration_ms: Optional[int] = None
    source_width: Optional[int] = None
    source_height: Optional[int] = None
    source_asset_type: Optional[str] = None
    output_file_name: Optional[str] = None
    output_file_size_bytes: Optional[int] = None
    output_duration_ms: Optional[int] = None
    output_width: Optional[int] = None
    output_height: Optional[int] = None
    transformation_mode: Optional[str] = None
    is_mock: bool = True
    offline_label: str = "OFFLINE DEMO TRANSFORMATION (MOCK)"
    metadata: Dict[str, Any] = {}

class AddToTimelineRequest(BaseModel):
    track_role: str = Field(default="v1_main", description="Target track role: v1_main, video, dialogue, music, sfx")
    insert_at_ms: Optional[int] = None

class AddToTimelineResponse(BaseModel):
    success: bool
    clip_id: str
    track_id: str
    timeline_id: str
    revision_id: Optional[str] = None
    is_existing: bool = False
    message: str

class AddToAssetsResponse(BaseModel):
    success: bool
    asset_id: str
    file_name: str
    asset_type: str
    # Phase 15: enriched response
    duration_ms: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    transformation_mode: Optional[str] = None
    folder_path: Optional[str] = None
    message: str
