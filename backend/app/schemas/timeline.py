from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

class KeyframeSchema(BaseModel):
    id: Optional[str] = None
    property_path: str
    time_offset_ms: int
    value: Any
    interpolation: str = "linear"
    bezier_handles: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True

class EffectSchema(BaseModel):
    id: Optional[str] = None
    effect_type: str
    effect_category: str
    order_index: int = 0
    is_enabled: bool = True
    parameters: Dict[str, Any] = {}

class MarkerSchema(BaseModel):
    id: Optional[str] = None
    time_ms: int
    duration_ms: Optional[int] = 0
    name: str = "Marker"
    comment: Optional[str] = ""
    color: str = "blue"
    clip_id: Optional[str] = None

    class Config:
        from_attributes = True

class ClipSchema(BaseModel):
    id: Optional[str] = None
    track_id: Optional[str] = None
    asset_id: Optional[str] = None
    scene_id: Optional[str] = None
    name: str
    clip_type: str = "media"
    start_time_ms: int
    duration_ms: int
    source_in_ms: int = 0
    source_out_ms: int = 0
    speed_factor: float = 1.0
    is_reversed: bool = False
    is_frozen: bool = False
    freeze_at_ms: Optional[int] = None
    freeze_duration_ms: Optional[int] = 2000
    is_frame_hold: bool = False
    frame_hold_at_ms: Optional[int] = None
    frame_hold_duration_ms: Optional[int] = 2000
    opacity: float = 1.0
    blend_mode: str = "normal"
    position_x: float = 0.5
    position_y: float = 0.5
    scale_x: float = 1.0
    scale_y: float = 1.0
    rotation: float = 0.0
    anchor_x: float = 0.5
    anchor_y: float = 0.5
    crop_left: float = 0.0
    crop_right: float = 0.0
    crop_top: float = 0.0
    crop_bottom: float = 0.0
    volume_db: float = 0.0
    fade_in_ms: int = 0
    fade_out_ms: int = 0
    transition_in: Optional[Dict[str, Any]] = None
    transition_out: Optional[Dict[str, Any]] = None
    color_grade: Optional[Dict[str, Any]] = None
    metadata_info: Optional[Dict[str, Any]] = None
    effects: List[EffectSchema] = []
    keyframes: List[KeyframeSchema] = []
    markers: List[MarkerSchema] = []
    is_compound: bool = False
    nested_tracks: Optional[List['TrackSchema']] = None
    group_id: Optional[str] = None
    linked_clip_id: Optional[str] = None

    class Config:
        from_attributes = True

class TrackSchema(BaseModel):
    id: Optional[str] = None
    timeline_id: Optional[str] = None
    track_type: str = "video" # video, audio, subtitle, adjustment
    track_role: str = "video"
    order_index: int = 0
    name: str = "Track"
    is_muted: bool = False
    is_locked: bool = False
    is_visible: bool = True
    is_solo: bool = False
    volume_db: float = 0.0
    pan: float = 0.0
    height_px: int = 60
    color: Optional[str] = "#1e3a8a"
    clips: List[ClipSchema] = []

    class Config:
        from_attributes = True

ClipSchema.model_rebuild()

class TimelineStateSchema(BaseModel):
    id: str
    project_id: str
    name: str = "Main Sequence"
    duration_ms: int = 0
    tracks: List[TrackSchema] = []
    markers: List[MarkerSchema] = []
    in_point_ms: Optional[int] = None
    out_point_ms: Optional[int] = None
    target_video_track_id: Optional[str] = None
    target_audio_track_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TimelineSaveRequest(BaseModel):
    name: Optional[str] = None
    duration_ms: int
    tracks: List[TrackSchema]
    markers: Optional[List[MarkerSchema]] = []
    in_point_ms: Optional[int] = None
    out_point_ms: Optional[int] = None
    target_video_track_id: Optional[str] = None
    target_audio_track_id: Optional[str] = None

class GraphicsClipCreateRequest(BaseModel):
    preset_id: str = "cinema_title"
    title: str = "Cinema Title"
    subtitle: Optional[str] = ""
    tamil_text: Optional[str] = ""
    start_time_ms: int = 0
    duration_ms: int = 4000
    font_family: str = "Nirmala UI"
    font_size: int = 48
    font_color: str = "#ffffff"
    box_color: str = "#000000"
    box_opacity: float = 0.6
    alignment: str = "center"  # center, lower_third, top_left, bottom
    position_x: float = 0.5
    position_y: float = 0.5
    fade_in_ms: int = 500
    fade_out_ms: int = 500
    style_variant: Optional[str] = "default"

