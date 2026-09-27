import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Text, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class AIJob(Base):
    __tablename__ = "ai_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    job_type = Column(String(50), nullable=False) # 'story_generation', 'text_to_video', 'tts', 'lip_sync', etc.
    provider = Column(String(50), nullable=True)
    input_data = Column(JSON, nullable=True, default=dict)
    output_data = Column(JSON, nullable=True)
    status = Column(String(30), nullable=False, default="pending", index=True) # pending, processing, completed, failed, cancelled
    progress_percent = Column(Float, nullable=False, default=0.0)
    celery_task_id = Column(String(255), nullable=True)
    error_message = Column(Text, nullable=True)
    cost_info = Column(JSON, nullable=True)
    
    # Phase 6 fields
    scene_id = Column(String(36), nullable=True)
    model = Column(String(255), nullable=True)
    prompt = Column(Text, nullable=True)
    result_asset_id = Column(String(36), nullable=True)
    output_url = Column(String(1024), nullable=True)
    job_metadata = Column(JSON, nullable=True, default=dict)
    started_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    project = relationship("Project", back_populates="ai_jobs")
