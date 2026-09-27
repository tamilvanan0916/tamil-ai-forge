from typing import Optional, Dict, Any, List
from pydantic import BaseModel

class AICommandRequest(BaseModel):
    project_id: str
    command: str # e.g. "Make this scene cinematic", "Add emotional Tamil instrumental music"
    context: Optional[Dict[str, Any]] = None

class AICommandResponse(BaseModel):
    command: str
    interpreted_intent: str
    suggested_actions: List[Dict[str, Any]] # Structured actions for timeline/effects
    explanation: str

class AIStoryAnalyzeRequest(BaseModel):
    prompt: str
    target_duration_sec: int = 120 # 30 to 600 seconds
    genre: Optional[str] = "Drama"
    mood: Optional[str] = "Cinematic"

class AIStoryResponse(BaseModel):
    title: str
    synopsis: str
    themes: List[str]
    logline: str
    estimated_duration_sec: int
    character_outlines: List[Dict[str, Any]]
    scene_outlines: List[Dict[str, Any]]

class AIScriptGenerateRequest(BaseModel):
    project_id: str
    story_data: Dict[str, Any]

class AIGenerateVideoRequest(BaseModel):
    project_id: str
    prompt: str
    reference_image_id: Optional[str] = None
    duration_sec: float = 5.0
    aspect_ratio: str = "16:9"

class AITTSRequest(BaseModel):
    project_id: str
    text: str
    voice_id: str = "ta-IN-Standard-A"
    language: str = "ta"
    speed: float = 1.0
    pitch: float = 1.0
    emotion: str = "neutral"

class AILipSyncRequest(BaseModel):
    project_id: str
    video_asset_id: str
    audio_asset_id: str

class AIMusicGenRequest(BaseModel):
    prompt: str
    duration_sec: float = 30.0
    genre: Optional[str] = "Tamil Melody"
    mood: Optional[str] = "Emotional"
    instrumental: bool = True
