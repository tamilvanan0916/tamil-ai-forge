import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, BigInteger, Text, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Caption(Base):
    __tablename__ = "captions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    clip_id = Column(String(36), ForeignKey("clips.id", ondelete="SET NULL"), nullable=True)
    language = Column(String(10), nullable=False, default="ta") # 'ta', 'en'
    start_time_ms = Column(BigInteger, nullable=False)
    end_time_ms = Column(BigInteger, nullable=False)
    text = Column(Text, nullable=False)
    style = Column(JSON, nullable=False, default=lambda: {
        "font_family": "Inter",
        "font_size": 24,
        "color": "#ffffff",
        "bg_color": "rgba(0,0,0,0.6)",
        "position": "bottom",
        "animation": "fade"
    })
    word_timestamps = Column(JSON, nullable=True) # [{word: "...", start_ms: 100, end_ms: 400}]
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="captions")
    clip = relationship("Clip")
