import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, BigInteger, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Asset(Base):
    __tablename__ = "assets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    asset_type = Column(String(30), nullable=False) # 'video', 'audio', 'image', 'font', 'lut', 'subtitle', 'ai_generated'
    file_name = Column(String(512), nullable=False)
    storage_key = Column(String(1024), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False, default=0)
    mime_type = Column(String(100), nullable=False)
    duration_ms = Column(BigInteger, nullable=True) # in milliseconds
    has_proxy = Column(Boolean, nullable=False, default=False)
    proxy_storage_key = Column(String(1024), nullable=True)
    thumbnail_url = Column(String(1024), nullable=True)
    waveform_data = Column(JSON, nullable=True) # Array of normalized peak floats
    metadata_info = Column("metadata", JSON, nullable=False, default=lambda: {}) # width, height, fps, codec, etc.
    tags = Column(JSON, nullable=True, default=lambda: [])
    is_favorite = Column(Boolean, nullable=False, default=False)
    folder_path = Column(String(1024), default="/", index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="assets")
