import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, JSON, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    settings = Column(JSON, nullable=False, default=lambda: {
        "width": 1920,
        "height": 1080,
        "fps": 30.0,
        "sample_rate": 48000,
        "color_space": "bt709",
        "max_duration_sec": 600,
    })
    story_data = Column(JSON, nullable=True)
    thumbnail_url = Column(String(1024), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    timelines = relationship("Timeline", back_populates="project", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="project", cascade="all, delete-orphan")
    characters = relationship("Character", back_populates="project", cascade="all, delete-orphan")
    scenes = relationship("Scene", back_populates="project", cascade="all, delete-orphan")
    render_jobs = relationship("RenderJob", back_populates="project", cascade="all, delete-orphan")
    ai_jobs = relationship("AIJob", back_populates="project", cascade="all, delete-orphan")
    captions = relationship("Caption", back_populates="project", cascade="all, delete-orphan")
