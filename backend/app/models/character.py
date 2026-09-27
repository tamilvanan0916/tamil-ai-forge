import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Text, Boolean, JSON, DateTime, ForeignKey, LargeBinary
from sqlalchemy.orm import relationship
from app.core.database import Base

class Character(Base):
    __tablename__ = "characters"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    personality = Column(Text, nullable=True)
    voice_profile = Column(JSON, nullable=True) # {voice_id, provider, speed, pitch, emotion}
    visual_prompt = Column(Text, nullable=True) # Stable visual prompt for consistent image generation
    metadata_info = Column("metadata", JSON, nullable=False, default=lambda: {})
    
    # Phase 6 fields
    is_locked = Column(Boolean, nullable=False, default=True)
    tamil_name = Column(String(255), nullable=True)
    age = Column(Integer, nullable=True, default=25)
    gender = Column(String(50), nullable=True, default="unspecified")
    appearance = Column(Text, nullable=True)
    clothing = Column(Text, nullable=True)
    hair = Column(String(100), nullable=True)
    skin = Column(String(100), nullable=True)
    voice_id = Column(String(255), nullable=True)
    visual_style = Column(String(255), nullable=True, default="Cinematic Photorealistic")
    reference_images = Column(JSON, nullable=True, default=list)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="characters")
    references = relationship("CharacterReference", back_populates="character", cascade="all, delete-orphan", lazy="selectin")


class CharacterReference(Base):
    __tablename__ = "character_references"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    character_id = Column(String(36), ForeignKey("characters.id", ondelete="CASCADE"), nullable=False, index=True)
    reference_type = Column(String(30), nullable=False) # 'face_front', 'face_side', 'full_body', 'expression', 'outfit'
    asset_id = Column(String(36), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    embedding_vector = Column(LargeBinary, nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    character = relationship("Character", back_populates="references")
    asset = relationship("Asset")
