import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Text, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class RenderJob(Base):
    __tablename__ = "render_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    timeline_id = Column(String(36), ForeignKey("timelines.id", ondelete="CASCADE"), nullable=False, index=True)
    job_type = Column(String(30), nullable=False, default="export") # export, preview, thumbnail, shorts
    export_preset = Column(JSON, nullable=False, default=lambda: {
        "format": "mp4",
        "video_codec": "libx264",
        "crf": 18,
        "fps": 30,
        "width": 1920,
        "height": 1080,
        "audio_codec": "aac",
        "audio_bitrate": "192k"
    })
    status = Column(String(30), nullable=False, default="queued", index=True) # queued, processing, completed, failed, cancelled
    progress_percent = Column(Float, nullable=False, default=0.0)
    celery_task_id = Column(String(255), nullable=True)
    output_asset_id = Column(String(36), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    output_path = Column(String(1024), nullable=True)
    error_message = Column(Text, nullable=True)
    chunks_total = Column(Integer, nullable=True, default=1)
    chunks_completed = Column(Integer, nullable=True, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="render_jobs")
    timeline = relationship("Timeline")
    output_asset = relationship("Asset")
