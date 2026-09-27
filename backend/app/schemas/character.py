from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel

class CharacterReferenceResponse(BaseModel):
    id: str
    character_id: str
    reference_type: str
    asset_id: str
    is_primary: bool
    created_at: datetime

    class Config:
        from_attributes = True

class CharacterCreate(BaseModel):
    name: str
    description: Optional[str] = None
    personality: Optional[str] = None
    voice_profile: Optional[Dict[str, Any]] = None
    visual_prompt: Optional[str] = None

class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    personality: Optional[str] = None
    voice_profile: Optional[Dict[str, Any]] = None
    visual_prompt: Optional[str] = None

class CharacterResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    personality: Optional[str] = None
    voice_profile: Optional[Dict[str, Any]] = None
    visual_prompt: Optional[str] = None
    references: List[CharacterReferenceResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
