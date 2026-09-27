import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, BigInteger, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class MusicFolder(Base):
    __tablename__ = "music_folders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    parent_id = Column(String(36), ForeignKey("music_folders.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False)
    folder_path = Column(String(1024), nullable=False)
    icon = Column(String(50), nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    children = relationship("MusicFolder", backref="parent", remote_side=[id])
    items = relationship("MusicItem", back_populates="folder", cascade="all, delete-orphan")


class MusicItem(Base):
    __tablename__ = "music_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    folder_id = Column(String(36), ForeignKey("music_folders.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(512), nullable=False)
    artist = Column(String(255), nullable=True)
    album = Column(String(255), nullable=True)
    genre = Column(String(100), nullable=True)
    mood = Column(String(100), nullable=True)
    bpm = Column(Float, nullable=True)
    music_key = Column(String(10), nullable=True) # 'Am', 'C#', etc.
    duration_ms = Column(BigInteger, nullable=False, default=0)
    file_size_bytes = Column(BigInteger, nullable=False, default=0)
    storage_key = Column(String(1024), nullable=False)
    mime_type = Column(String(100), nullable=False, default="audio/mpeg")
    waveform_data = Column(JSON, nullable=True)
    thumbnail_url = Column(String(1024), nullable=True)
    tags = Column(JSON, nullable=True, default=lambda: [])
    is_favorite = Column(Boolean, nullable=False, default=False)
    is_ai_generated = Column(Boolean, nullable=False, default=False)
    is_user_upload = Column(Boolean, nullable=False, default=False)
    license_info = Column(String(255), nullable=True)
    metadata_info = Column("metadata", JSON, nullable=False, default=lambda: {})
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    folder = relationship("MusicFolder", back_populates="items")
