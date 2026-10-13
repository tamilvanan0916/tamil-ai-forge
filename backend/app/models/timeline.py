import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, BigInteger, Boolean, JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base

class Timeline(Base):
    __tablename__ = "timelines"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False, default="Main Sequence")
    duration_ms = Column(BigInteger, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    project = relationship("Project", back_populates="timelines")
    tracks = relationship("Track", back_populates="timeline", cascade="all, delete-orphan", order_by="Track.order_index", lazy="selectin")
    revisions = relationship("TimelineRevision", back_populates="timeline", cascade="all, delete-orphan", lazy="selectin")


class Track(Base):
    __tablename__ = "tracks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    timeline_id = Column(String(36), ForeignKey("timelines.id", ondelete="CASCADE"), nullable=False, index=True)
    track_type = Column(String(20), nullable=False) # 'video', 'audio', 'subtitle', 'adjustment'
    track_role = Column(String(30), nullable=False, default="custom") # video, dialogue, voiceover, music, sfx, ambience, captions, graphics, adjustment
    order_index = Column(Integer, nullable=False)
    name = Column(String(100), nullable=False)
    is_muted = Column(Boolean, nullable=False, default=False)
    is_locked = Column(Boolean, nullable=False, default=False)
    is_visible = Column(Boolean, nullable=False, default=True)
    is_solo = Column(Boolean, nullable=False, default=False)
    volume_db = Column(Float, nullable=False, default=0.0)
    pan = Column(Float, nullable=False, default=0.0)
    height_px = Column(Integer, nullable=False, default=60)
    color = Column(String(10), nullable=True, default="#1e3a8a")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    timeline = relationship("Timeline", back_populates="tracks")
    clips = relationship("Clip", back_populates="track", cascade="all, delete-orphan", order_by="Clip.start_time_ms", lazy="selectin")

    def get(self, key, default=None):
        return getattr(self, key, default)

    def __getitem__(self, key):
        if hasattr(self, key):
            return getattr(self, key)
        raise KeyError(key)


class Clip(Base):
    __tablename__ = "clips"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    track_id = Column(String(36), ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)
    asset_id = Column(String(36), ForeignKey("assets.id", ondelete="RESTRICT"), nullable=True)
    scene_id = Column(String(36), ForeignKey("scenes.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    clip_type = Column(String(30), nullable=False, default="media") # media, title, generator, adjustment, caption

    # Timeline timing (in milliseconds)
    start_time_ms = Column(BigInteger, nullable=False)
    duration_ms = Column(BigInteger, nullable=False)

    # Source media trim points
    source_in_ms = Column(BigInteger, nullable=False, default=0)
    source_out_ms = Column(BigInteger, nullable=False, default=0)

    # Playback modifications
    speed_factor = Column(Float, nullable=False, default=1.0)
    is_reversed = Column(Boolean, nullable=False, default=False)
    is_frozen = Column(Boolean, nullable=False, default=False)
    freeze_at_ms = Column(BigInteger, nullable=True)

    # Spatial properties (normalized 0.0 - 1.0)
    opacity = Column(Float, nullable=False, default=1.0)
    blend_mode = Column(String(30), nullable=False, default="normal")
    position_x = Column(Float, nullable=False, default=0.5)
    position_y = Column(Float, nullable=False, default=0.5)
    scale_x = Column(Float, nullable=False, default=1.0)
    scale_y = Column(Float, nullable=False, default=1.0)
    rotation = Column(Float, nullable=False, default=0.0)
    anchor_x = Column(Float, nullable=False, default=0.5)
    anchor_y = Column(Float, nullable=False, default=0.5)

    # Crop (normalized 0.0 - 1.0)
    crop_left = Column(Float, nullable=False, default=0.0)
    crop_right = Column(Float, nullable=False, default=0.0)
    crop_top = Column(Float, nullable=False, default=0.0)
    crop_bottom = Column(Float, nullable=False, default=0.0)

    # Audio properties
    volume_db = Column(Float, nullable=False, default=0.0)
    fade_in_ms = Column(BigInteger, nullable=False, default=0)
    fade_out_ms = Column(BigInteger, nullable=False, default=0)

    # Transitions
    transition_in = Column(JSON, nullable=True)
    transition_out = Column(JSON, nullable=True)

    metadata_info = Column("metadata", JSON, nullable=False, default=lambda: {})
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    @property
    def color_grade(self):
        if isinstance(self.metadata_info, dict):
            return self.metadata_info.get("color_grade")
        return None

    @property
    def group_id(self):
        if isinstance(self.metadata_info, dict):
            return self.metadata_info.get("group_id")
        return None

    @property
    def linked_clip_id(self):
        if isinstance(self.metadata_info, dict):
            return self.metadata_info.get("linked_clip_id")
        return None

    @property
    def is_compound(self):
        if isinstance(self.metadata_info, dict):
            return bool(self.metadata_info.get("is_compound", False))
        return False

    @property
    def nested_tracks(self):
        if isinstance(self.metadata_info, dict):
            return self.metadata_info.get("nested_tracks")
        return None

    @property
    def markers(self):
        if isinstance(self.metadata_info, dict):
            return self.metadata_info.get("markers", [])
        return []

    @property
    def is_frame_hold(self):
        if isinstance(self.metadata_info, dict):
            return bool(self.metadata_info.get("is_frame_hold", False))
        return False

    @property
    def frame_hold_at_ms(self):
        if isinstance(self.metadata_info, dict):
            return self.metadata_info.get("frame_hold_at_ms")
        return None

    @property
    def frame_hold_duration_ms(self):
        if isinstance(self.metadata_info, dict):
            return self.metadata_info.get("frame_hold_duration_ms", 2000)
        return 2000

    @property
    def freeze_duration_ms(self):
        if isinstance(self.metadata_info, dict):
            return self.metadata_info.get("freeze_duration_ms", 2000)
        return 2000

    # Relationships
    track = relationship("Track", back_populates="clips")
    asset = relationship("Asset")
    effects = relationship("Effect", back_populates="clip", cascade="all, delete-orphan", order_by="Effect.order_index", lazy="selectin")
    keyframes = relationship("Keyframe", back_populates="clip", cascade="all, delete-orphan", lazy="selectin")

    def get(self, key, default=None):
        return getattr(self, key, default)

    def __getitem__(self, key):
        if hasattr(self, key):
            return getattr(self, key)
        raise KeyError(key)


class Effect(Base):
    __tablename__ = "effects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clip_id = Column(String(36), ForeignKey("clips.id", ondelete="CASCADE"), nullable=False, index=True)
    effect_type = Column(String(50), nullable=False)
    effect_category = Column(String(30), nullable=False) # color, transform, vfx, audio, ai, text
    order_index = Column(Integer, nullable=False, default=0)
    is_enabled = Column(Boolean, nullable=False, default=True)
    parameters = Column(JSON, nullable=False, default=lambda: {})
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    clip = relationship("Clip", back_populates="effects")


class Keyframe(Base):
    __tablename__ = "keyframes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clip_id = Column(String(36), ForeignKey("clips.id", ondelete="CASCADE"), nullable=False, index=True)
    property_path = Column(String(200), nullable=False) # 'position_x', 'scale_x', 'opacity'
    time_offset_ms = Column(BigInteger, nullable=False)
    value = Column(JSON, nullable=False)
    interpolation = Column(String(30), nullable=False, default="linear") # hold, linear, bezier, ease_in, ease_out
    bezier_handles = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    clip = relationship("Clip", back_populates="keyframes")


class TimelineRevision(Base):
    __tablename__ = "timeline_revisions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    timeline_id = Column(String(36), ForeignKey("timelines.id", ondelete="CASCADE"), nullable=False, index=True)
    revision_number = Column(Integer, nullable=False)
    description = Column(String(255), nullable=True)
    snapshot = Column(JSON, nullable=False) # Complete serialized timeline state
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("timeline_id", "revision_number", name="uq_timeline_revision"),
    )

    # Relationships
    timeline = relationship("Timeline", back_populates="revisions")
