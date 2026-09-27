import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Text, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Scene(Base):
    __tablename__ = "scenes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    scene_number = Column(Integer, nullable=False)
    title = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    dialogue = Column(Text, nullable=True)
    visual_prompt = Column(Text, nullable=True)
    audio_prompt = Column(Text, nullable=True)
    duration_target_sec = Column(Float, nullable=True, default=5.0)
    location = Column(String(255), nullable=True)
    time_of_day = Column(String(50), nullable=True)
    mood = Column(String(100), nullable=True)
    status = Column(String(30), nullable=False, default="draft") # draft, storyboarded, generating, generated, edited, approved
    metadata_info = Column("metadata", JSON, nullable=False, default=lambda: {})

    # Phase 6 fields
    story_id = Column(String(36), ForeignKey("stories.id", ondelete="CASCADE"), nullable=True, index=True)
    duration_sec = Column(Float, nullable=False, default=5.0)
    camera_directions = Column(String(255), nullable=True, default="Medium Shot, Static")
    shot_type = Column(String(100), nullable=True, default="Medium Shot")
    lighting = Column(String(100), nullable=True, default="Natural Daylight")
    dialogue_text = Column(Text, nullable=True)
    generated_asset_id = Column(String(36), nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="scenes")
    story = relationship("Story", back_populates="scenes")
    shots = relationship("StoryboardShot", back_populates="scene", cascade="all, delete-orphan", lazy="selectin")
    storyboard_frames = relationship("StoryboardFrame", back_populates="scene", cascade="all, delete-orphan", lazy="selectin")


class StoryboardFrame(Base):
    __tablename__ = "storyboard_frames"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scene_id = Column(String(36), ForeignKey("scenes.id", ondelete="CASCADE"), nullable=False, index=True)
    frame_number = Column(Integer, nullable=False)
    image_asset_id = Column(String(36), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    prompt = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    camera_angle = Column(String(100), nullable=True)
    duration_sec = Column(Float, nullable=True, default=4.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    scene = relationship("Scene", back_populates="storyboard_frames")
    image_asset = relationship("Asset")
