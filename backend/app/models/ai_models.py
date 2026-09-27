import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, JSON, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

# Import existing models to avoid table duplicate definitions
from app.models.character import Character
from app.models.scene import Scene
from app.models.ai_job import AIJob


class Story(Base):
    __tablename__ = "stories"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False, default="Untitled Story")
    synopsis = Column(Text, nullable=True)
    logline = Column(Text, nullable=True)
    genre = Column(String(100), nullable=False, default="Drama")
    mood = Column(String(100), nullable=False, default="Cinematic")
    target_audience = Column(String(100), nullable=True, default="General")
    language = Column(String(20), nullable=False, default="ta")
    themes = Column(JSON, default=list)
    target_duration_sec = Column(Integer, default=60)
    raw_script = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", backref="stories")
    scenes = relationship("Scene", back_populates="story", cascade="all, delete-orphan")


class StoryboardShot(Base):
    __tablename__ = "storyboard_shots"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    scene_id = Column(String(36), ForeignKey("scenes.id", ondelete="CASCADE"), nullable=False, index=True)
    shot_number = Column(Integer, nullable=False, default=1)
    thumbnail_url = Column(String(1024), nullable=True)
    prompt = Column(Text, nullable=True)
    camera_movement = Column(String(100), nullable=True, default="Pan Right")
    transition = Column(String(100), nullable=True, default="Cut")
    duration_sec = Column(Float, nullable=False, default=3.0)
    status = Column(String(50), nullable=False, default="pending")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    scene = relationship("Scene", back_populates="shots")


class AIProviderConfig(Base):
    __tablename__ = "ai_provider_configs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    capability = Column(String(100), nullable=False, unique=True, index=True) # llm, image, video, vision, tts, stt, lipsync, music
    provider_name = Column(String(100), nullable=False, default="none")
    is_enabled = Column(Boolean, default=False)
    is_configured = Column(Boolean, default=False)
    model_name = Column(String(255), nullable=True)
    settings_json = Column(JSON, default=dict)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ProductionPlan(Base):
    __tablename__ = "production_plans"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    story_id = Column(String(36), ForeignKey("stories.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False, default="Untitled Production Plan")
    target_duration_sec = Column(Float, nullable=False, default=30.0)
    status = Column(String(30), nullable=False, default="planned", index=True) # planned, queued, generating, completed, failed, cancelled
    progress_percent = Column(Float, nullable=False, default=0.0)
    plan_data = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ProductionAssetVersion(Base):
    __tablename__ = "production_asset_versions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    scene_id = Column(String(36), ForeignKey("scenes.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False, default=1)
    strategy = Column(String(20), default="T2V")
    asset_id = Column(String(36), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    job_id = Column(String(36), ForeignKey("ai_jobs.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(30), nullable=False, default="valid", index=True) # valid, failed, superseded, current
    is_current = Column(Boolean, nullable=False, default=False)
    prompt = Column(Text, nullable=True)
    provider = Column(String(50), nullable=False, default="mock")
    duration_sec = Column(Float, nullable=False, default=5.0)
    error = Column(Text, nullable=True)
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

