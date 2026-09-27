from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict
from datetime import datetime

# --- Story Schemas ---
class StoryGenerateRequest(BaseModel):
    project_id: str
    prompt: str
    genre: str = "Drama"
    mood: str = "Cinematic"
    language: str = "ta"  # 'ta', 'en', 'ta+en'
    target_duration_sec: int = 60
    target_audience: Optional[str] = "General"
    visual_style: Optional[str] = "Cinematic Kollywood Photorealistic"
    scene_count: Optional[int] = 4

class StoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    title: str
    synopsis: Optional[str] = None
    logline: Optional[str] = None
    genre: str
    mood: str
    target_audience: Optional[str] = None
    language: str
    themes: List[str] = []
    target_duration_sec: int
    raw_script: Optional[str] = None
    created_at: Optional[datetime] = None

# --- Character Schemas ---
class CharacterCreateSchema(BaseModel):
    name: str
    tamil_name: Optional[str] = None
    age: Optional[int] = 25
    gender: Optional[str] = "unspecified"
    appearance: Optional[str] = None
    clothing: Optional[str] = None
    hair: Optional[str] = None
    skin: Optional[str] = None
    personality: Optional[str] = None
    voice_id: Optional[str] = None
    visual_style: Optional[str] = "Cinematic Photorealistic"
    reference_images: List[str] = []
    is_locked: bool = True
    metadata_info: Optional[Dict[str, Any]] = None

class CharacterUpdateSchema(BaseModel):
    name: Optional[str] = None
    tamil_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    appearance: Optional[str] = None
    clothing: Optional[str] = None
    hair: Optional[str] = None
    skin: Optional[str] = None
    personality: Optional[str] = None
    voice_id: Optional[str] = None
    visual_style: Optional[str] = None
    reference_images: Optional[List[str]] = None
    is_locked: Optional[bool] = None
    metadata_info: Optional[Dict[str, Any]] = None

class CharacterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    tamil_name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    appearance: Optional[str] = None
    clothing: Optional[str] = None
    hair: Optional[str] = None
    skin: Optional[str] = None
    personality: Optional[str] = None
    voice_id: Optional[str] = None
    visual_style: Optional[str] = None
    reference_images: List[str] = []
    is_locked: bool = True
    metadata_info: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

# --- Scene Schemas ---
class SceneCreateSchema(BaseModel):
    story_id: Optional[str] = None
    scene_number: int = 1
    title: str = "Scene 1"
    description: Optional[str] = None
    location: Optional[str] = "Interior / Studio"
    time_of_day: Optional[str] = "Day"
    mood: Optional[str] = "Neutral"
    duration_sec: float = 5.0
    visual_prompt: Optional[str] = None
    camera_directions: Optional[str] = "Medium Shot, Static"
    shot_type: Optional[str] = "Medium Shot"
    lighting: Optional[str] = "Natural Daylight"
    dialogue_text: Optional[str] = None
    audio_prompt: Optional[str] = None

class SceneUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    time_of_day: Optional[str] = None
    mood: Optional[str] = None
    duration_sec: Optional[float] = None
    visual_prompt: Optional[str] = None
    camera_directions: Optional[str] = None
    shot_type: Optional[str] = None
    lighting: Optional[str] = None
    dialogue_text: Optional[str] = None
    audio_prompt: Optional[str] = None
    status: Optional[str] = None

class SceneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    story_id: Optional[str] = None
    scene_number: int
    title: str
    description: Optional[str] = None
    location: Optional[str] = None
    time_of_day: Optional[str] = None
    mood: Optional[str] = None
    duration_sec: float
    visual_prompt: Optional[str] = None
    camera_directions: Optional[str] = None
    shot_type: Optional[str] = None
    lighting: Optional[str] = None
    dialogue_text: Optional[str] = None
    audio_prompt: Optional[str] = None
    generated_asset_id: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None

# --- Storyboard Schemas ---
class StoryboardReorderRequest(BaseModel):
    scene_ids: List[str]

class StoryboardShotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    scene_id: str
    shot_number: int
    thumbnail_url: Optional[str] = None
    prompt: Optional[str] = None
    camera_movement: Optional[str] = None
    transition: Optional[str] = None
    duration_sec: float
    status: str

# --- AI Job & Provider Config Schemas ---
class AIJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    scene_id: Optional[str] = None
    job_type: str
    provider: Optional[str] = "unknown"
    model: Optional[str] = None
    prompt: Optional[str] = None
    status: str
    progress_percent: float
    result_asset_id: Optional[str] = None
    output_url: Optional[str] = None
    error_message: Optional[str] = None
    job_metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

class ProviderConfigUpdateSchema(BaseModel):
    capability: str  # llm, image, video, vision, tts, stt, lipsync, music
    provider_name: str
    api_key: Optional[str] = None
    is_enabled: bool = True
    model_name: Optional[str] = None
    settings_json: Optional[Dict[str, Any]] = None

class ProviderConfigResponse(BaseModel):
    capability: str
    provider_name: str
    is_enabled: bool
    is_configured: bool
    model_name: Optional[str] = None
    message: str

# --- AI Command Bar Action Schemas ---
class AIActionItem(BaseModel):
    type: str  # SET_CLIP_DURATION, MOVE_CLIP, ADD_CAPTION, SET_CLIP_COLOR, CREATE_SCENE, ADD_TRANSITION, SET_TRACK_VOLUME, etc.
    target_id: Optional[str] = None
    clip_id: Optional[str] = None
    track_id: Optional[str] = None
    scene_id: Optional[str] = None
    duration_ms: Optional[int] = None
    color_grade: Optional[Dict[str, Any]] = None
    volume_db: Optional[float] = None
    text: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

class AICommandRequest(BaseModel):
    project_id: str
    command: str
    context: Optional[Dict[str, Any]] = None

class AICommandActionResponse(BaseModel):
    original_command: str
    summary: str
    status: str  # executed, failed, provider_not_configured
    actions: List[AIActionItem] = []

class AIGenerateVideoRequest(BaseModel):
    project_id: Optional[str] = None
    scene_id: Optional[str] = None
    prompt: str
    duration_sec: float = 4.0
    aspect_ratio: str = "16:9"
    character_id: Optional[str] = None

class AIVideoWorkflowRequest(BaseModel):
    project_id: Optional[str] = None
    prompt: Optional[str] = None
    target_duration_sec: Optional[float] = 30.0
    genre: Optional[str] = "Drama"
    mood: Optional[str] = "Cinematic"
    aspect_ratio: Optional[str] = "16:9"

class AITTSRequest(BaseModel):
    project_id: Optional[str] = None
    text: str
    voice_id: Optional[str] = "ta_female_1"
    language: str = "ta"
    speed: float = 1.0

class AILipSyncRequest(BaseModel):
    project_id: Optional[str] = None
    video_asset_id: str
    audio_asset_id: str

class AIMusicGenRequest(BaseModel):
    project_id: Optional[str] = None
    prompt: str
    genre: Optional[str] = "Cinematic"
    mood: Optional[str] = "Cinematic"
    duration_sec: float = 30.0
