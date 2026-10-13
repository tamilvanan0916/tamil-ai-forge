import pytest
import uuid
import copy
import sys
import os
from typing import List, Dict, Any, Optional, Tuple

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.schemas.timeline import (
    TrackSchema,
    ClipSchema,
    TimelineStateSchema,
    TimelineSaveRequest,
    MarkerSchema,
)


# ─── Mock Asset & Source Session Logic ───

class MockAsset:
    def __init__(
        self,
        asset_id: str = "asset-1",
        file_name: str = "raw_footage_take1.mp4",
        asset_type: str = "video",
        duration_ms: int = 15000,
        storage_key: str = "/storage/assets/raw_footage_take1.mp4",
    ):
        self.id = asset_id
        self.file_name = file_name
        self.asset_type = asset_type
        self.duration_ms = duration_ms
        self.storage_key = storage_key


class SourceMonitorSession:
    def __init__(self):
        self.source_asset: Optional[MockAsset] = None
        self.source_playhead_ms: int = 0
        self.source_in_point_ms: Optional[int] = None
        self.source_out_point_ms: Optional[int] = None
        self.source_is_playing: bool = False
        self.timeline_is_playing: bool = False
        self.active_monitor_focus: str = "program"
        self.monitor_layout: str = "dual"

    def load_asset(self, asset: MockAsset):
        dur = max(100, asset.duration_ms)
        self.source_asset = asset
        self.source_playhead_ms = 0
        self.source_in_point_ms = 0
        self.source_out_point_ms = dur
        self.source_is_playing = False
        self.active_monitor_focus = "source"

    def close_asset(self):
        self.source_asset = None
        self.source_playhead_ms = 0
        self.source_in_point_ms = None
        self.source_out_point_ms = None
        self.source_is_playing = False

    def set_playhead(self, ms: int):
        dur = max(100, self.source_asset.duration_ms if self.source_asset else 60000)
        self.source_playhead_ms = max(0, min(ms, dur))

    def step_frame(self, frames: int, fps: int = 30):
        frame_ms = int(1000 / fps)
        self.set_playhead(self.source_playhead_ms + frames * frame_ms)

    def set_in_point(self, ms: Optional[int] = None):
        if not self.source_asset:
            return
        target = ms if ms is not None else self.source_playhead_ms
        dur = max(100, self.source_asset.duration_ms)
        clamped_in = max(0, min(target, dur))
        out = self.source_out_point_ms
        if out is not None and clamped_in >= out:
            out = min(dur, clamped_in + 33)
        self.source_in_point_ms = clamped_in
        self.source_out_point_ms = out

    def set_out_point(self, ms: Optional[int] = None):
        if not self.source_asset:
            return
        target = ms if ms is not None else self.source_playhead_ms
        dur = max(100, self.source_asset.duration_ms)
        clamped_out = max(0, min(target, dur))
        in_pt = self.source_in_point_ms if self.source_in_point_ms is not None else 0
        if clamped_out <= in_pt:
            in_pt = max(0, clamped_out - 33)
        self.source_in_point_ms = in_pt
        self.source_out_point_ms = clamped_out

    def clear_in_out(self):
        if not self.source_asset:
            return
        self.source_in_point_ms = 0
        self.source_out_point_ms = max(100, self.source_asset.duration_ms)

    def get_range_duration(self) -> int:
        if not self.source_asset:
            return 0
        s_in = self.source_in_point_ms if self.source_in_point_ms is not None else 0
        s_out = self.source_out_point_ms if self.source_out_point_ms is not None else self.source_asset.duration_ms
        return max(33, s_out - s_in)

    def toggle_source_play(self):
        self.source_is_playing = not self.source_is_playing
        if self.source_is_playing:
            self.timeline_is_playing = False

    def toggle_timeline_play(self):
        self.timeline_is_playing = not self.timeline_is_playing
        if self.timeline_is_playing:
            self.source_is_playing = False

    def toggle_monitor_focus(self):
        self.active_monitor_focus = "program" if self.active_monitor_focus == "source" else "source"


# ─── Pure Timeline 3-Point Insertion Functions ───

def create_sample_clip(
    name: str = "Test Clip",
    track_id: str = "track-1",
    start_time_ms: int = 0,
    duration_ms: int = 5000,
    source_in_ms: int = 0,
    source_out_ms: int = 5000,
    clip_id: Optional[str] = None,
    asset_id: Optional[str] = None,
    linked_clip_id: Optional[str] = None,
) -> ClipSchema:
    return ClipSchema(
        id=clip_id or str(uuid.uuid4()),
        track_id=track_id,
        name=name,
        clip_type="media",
        start_time_ms=start_time_ms,
        duration_ms=duration_ms,
        source_in_ms=source_in_ms,
        source_out_ms=source_out_ms,
        asset_id=asset_id,
        linked_clip_id=linked_clip_id,
    )


def create_sample_timeline(
    num_video_tracks: int = 2,
    num_audio_tracks: int = 2,
    target_video: Optional[str] = None,
    target_audio: Optional[str] = None,
) -> TimelineStateSchema:
    tracks = []
    for i in range(num_video_tracks):
        tracks.append(
            TrackSchema(
                id=f"v-track-{i+1}",
                timeline_id="tl-1",
                track_type="video",
                track_role="video",
                name=f"V{i+1}",
                order_index=i,
                clips=[],
            )
        )
    for i in range(num_audio_tracks):
        tracks.append(
            TrackSchema(
                id=f"a-track-{i+1}",
                timeline_id="tl-1",
                track_type="audio",
                track_role="dialogue",
                name=f"A{i+1}",
                order_index=num_video_tracks + i,
                clips=[],
            )
        )
    return TimelineStateSchema(
        id="tl-1",
        project_id="proj-1",
        name="Main Sequence",
        duration_ms=30000,
        tracks=tracks,
        target_video_track_id=target_video or "v-track-1",
        target_audio_track_id=target_audio or "a-track-1",
    )


def execute_source_insert_edit(
    timeline: TimelineStateSchema,
    session: SourceMonitorSession,
    playhead_ms: int,
) -> bool:
    if not session.source_asset:
        return False

    v_track = None
    if timeline.target_video_track_id:
        v_track = next((t for t in timeline.tracks if t.id == timeline.target_video_track_id and not t.is_locked), None)
    if not v_track:
        v_track = next((t for t in timeline.tracks if t.track_type == "video" and not t.is_locked), None)

    a_track = None
    if timeline.target_audio_track_id:
        a_track = next((t for t in timeline.tracks if t.id == timeline.target_audio_track_id and not t.is_locked), None)
    if not a_track:
        a_track = next((t for t in timeline.tracks if t.track_type == "audio" and not t.is_locked), None)

    if not v_track and not a_track:
        return False

    s_in = session.source_in_point_ms if session.source_in_point_ms is not None else 0
    s_out = session.source_out_point_ms if session.source_out_point_ms is not None else session.source_asset.duration_ms
    edit_duration = max(33, s_out - s_in)
    in_ms = playhead_ms

    # Split straddling clips on target tracks
    for t in [v_track, a_track]:
        if not t:
            continue
        new_clips = []
        for c in t.clips:
            if c.start_time_ms < in_ms < c.start_time_ms + c.duration_ms:
                first_dur = in_ms - c.start_time_ms
                second_dur = c.duration_ms - first_dur
                c1 = copy.deepcopy(c)
                c1.duration_ms = first_dur
                c1.source_out_ms = c.source_in_ms + first_dur

                c2 = copy.deepcopy(c)
                c2.id = str(uuid.uuid4())
                c2.start_time_ms = in_ms
                c2.duration_ms = second_dur
                c2.source_in_ms = c.source_in_ms + first_dur
                new_clips.extend([c1, c2])
            else:
                new_clips.append(c)
        t.clips = new_clips

    # Ripple shift all clips on unlocked tracks at or after in_ms
    for t in timeline.tracks:
        if t.is_locked:
            continue
        for c in t.clips:
            if c.start_time_ms >= in_ms:
                c.start_time_ms += edit_duration

    # Insert new clip(s)
    new_v_id, new_a_id = None, None
    if v_track and not v_track.is_locked:
        new_v_id = str(uuid.uuid4())
        v_clip = create_sample_clip(
            name=session.source_asset.file_name,
            track_id=v_track.id,
            start_time_ms=in_ms,
            duration_ms=edit_duration,
            source_in_ms=s_in,
            source_out_ms=s_out,
            clip_id=new_v_id,
            asset_id=session.source_asset.id,
        )
        v_track.clips.append(v_clip)
        v_track.clips.sort(key=lambda x: x.start_time_ms)

    if a_track and not a_track.is_locked:
        new_a_id = str(uuid.uuid4())
        a_clip = create_sample_clip(
            name=f"{session.source_asset.file_name} (Audio)",
            track_id=a_track.id,
            start_time_ms=in_ms,
            duration_ms=edit_duration,
            source_in_ms=s_in,
            source_out_ms=s_out,
            clip_id=new_a_id,
            asset_id=session.source_asset.id,
        )
        a_track.clips.append(a_clip)
        a_track.clips.sort(key=lambda x: x.start_time_ms)

    if new_v_id and new_a_id and v_track and a_track:
        cv = next(c for c in v_track.clips if c.id == new_v_id)
        ca = next(c for c in a_track.clips if c.id == new_a_id)
        cv.linked_clip_id = ca.id
        ca.linked_clip_id = cv.id

    return True


def execute_source_overwrite_edit(
    timeline: TimelineStateSchema,
    session: SourceMonitorSession,
    playhead_ms: int,
) -> bool:
    if not session.source_asset:
        return False

    v_track = None
    if timeline.target_video_track_id:
        v_track = next((t for t in timeline.tracks if t.id == timeline.target_video_track_id and not t.is_locked), None)
    if not v_track:
        v_track = next((t for t in timeline.tracks if t.track_type == "video" and not t.is_locked), None)

    a_track = None
    if timeline.target_audio_track_id:
        a_track = next((t for t in timeline.tracks if t.id == timeline.target_audio_track_id and not t.is_locked), None)
    if not a_track:
        a_track = next((t for t in timeline.tracks if t.track_type == "audio" and not t.is_locked), None)

    if not v_track and not a_track:
        return False

    s_in = session.source_in_point_ms if session.source_in_point_ms is not None else 0
    s_out = session.source_out_point_ms if session.source_out_point_ms is not None else session.source_asset.duration_ms
    edit_duration = max(33, s_out - s_in)
    edit_start = playhead_ms
    edit_end = playhead_ms + edit_duration

    for t in [v_track, a_track]:
        if not t or t.is_locked:
            continue
        remaining = []
        for c in t.clips:
            c_start = c.start_time_ms
            c_end = c_start + c.duration_ms

            if c_end <= edit_start or c_start >= edit_end:
                remaining.append(c)
            elif c_start >= edit_start and c_end <= edit_end:
                continue
            elif c_start < edit_start and c_end > edit_end:
                p1 = copy.deepcopy(c)
                p1.duration_ms = edit_start - c_start
                p1.source_out_ms = c.source_in_ms + p1.duration_ms
                remaining.append(p1)

                p2 = copy.deepcopy(c)
                p2.id = str(uuid.uuid4())
                p2.start_time_ms = edit_end
                p2.duration_ms = c_end - edit_end
                p2.source_in_ms = c.source_in_ms + (edit_end - c_start)
                remaining.append(p2)
            elif c_start < edit_start and c_end <= edit_end:
                p1 = copy.deepcopy(c)
                p1.duration_ms = edit_start - c_start
                p1.source_out_ms = c.source_in_ms + p1.duration_ms
                remaining.append(p1)
            elif c_start >= edit_start and c_end > edit_end:
                p2 = copy.deepcopy(c)
                p2.start_time_ms = edit_end
                p2.duration_ms = c_end - edit_end
                p2.source_in_ms = c.source_in_ms + (edit_end - c_start)
                remaining.append(p2)
        t.clips = remaining

    # Insert new overwriting clips
    new_v_id, new_a_id = None, None
    if v_track and not v_track.is_locked:
        new_v_id = str(uuid.uuid4())
        v_clip = create_sample_clip(
            name=session.source_asset.file_name,
            track_id=v_track.id,
            start_time_ms=edit_start,
            duration_ms=edit_duration,
            source_in_ms=s_in,
            source_out_ms=s_out,
            clip_id=new_v_id,
            asset_id=session.source_asset.id,
        )
        v_track.clips.append(v_clip)
        v_track.clips.sort(key=lambda x: x.start_time_ms)

    if a_track and not a_track.is_locked:
        new_a_id = str(uuid.uuid4())
        a_clip = create_sample_clip(
            name=f"{session.source_asset.file_name} (Audio)",
            track_id=a_track.id,
            start_time_ms=edit_start,
            duration_ms=edit_duration,
            source_in_ms=s_in,
            source_out_ms=s_out,
            clip_id=new_a_id,
            asset_id=session.source_asset.id,
        )
        a_track.clips.append(a_clip)
        a_track.clips.sort(key=lambda x: x.start_time_ms)

    if new_v_id and new_a_id and v_track and a_track:
        cv = next(c for c in v_track.clips if c.id == new_v_id)
        ca = next(c for c in a_track.clips if c.id == new_a_id)
        cv.linked_clip_id = ca.id
        ca.linked_clip_id = cv.id

    return True


# ═══════════════════════════════════════════════════════════
# Phase 46 Test Suite
# ═══════════════════════════════════════════════════════════

# ─── Group 1: Session Management & Asset Loading ───

def test_source_session_initial_state():
    session = SourceMonitorSession()
    assert session.source_asset is None
    assert session.source_playhead_ms == 0
    assert session.source_in_point_ms is None
    assert session.source_out_point_ms is None
    assert session.source_is_playing is False
    assert session.active_monitor_focus == "program"
    assert session.monitor_layout == "dual"


def test_load_source_asset():
    session = SourceMonitorSession()
    asset = MockAsset(duration_ms=12000)
    session.load_asset(asset)

    assert session.source_asset is not None
    assert session.source_asset.id == "asset-1"
    assert session.source_playhead_ms == 0
    assert session.source_in_point_ms == 0
    assert session.source_out_point_ms == 12000
    assert session.source_is_playing is False
    assert session.active_monitor_focus == "source"


def test_close_source_asset():
    session = SourceMonitorSession()
    session.load_asset(MockAsset())
    session.close_asset()

    assert session.source_asset is None
    assert session.source_playhead_ms == 0
    assert session.source_in_point_ms is None
    assert session.source_out_point_ms is None
    assert session.source_is_playing is False


def test_source_playhead_clamping():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=8000))

    session.set_playhead(3000)
    assert session.source_playhead_ms == 3000

    session.set_playhead(-500)
    assert session.source_playhead_ms == 0

    session.set_playhead(99999)
    assert session.source_playhead_ms == 8000


# ─── Group 2: Frame Stepping & Transport ───

def test_source_frame_stepping_forward():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=5000))

    session.step_frame(1, fps=30)
    assert session.source_playhead_ms == 33

    session.step_frame(5, fps=30)
    assert session.source_playhead_ms == 33 + (5 * 33)


def test_source_frame_stepping_backward_clamped():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=5000))
    session.set_playhead(50)

    session.step_frame(-5, fps=30)
    assert session.source_playhead_ms == 0


def test_playback_exclusivity():
    session = SourceMonitorSession()
    session.load_asset(MockAsset())

    # Start timeline playback
    session.toggle_timeline_play()
    assert session.timeline_is_playing is True
    assert session.source_is_playing is False

    # Start source playback -> stops timeline playback
    session.toggle_source_play()
    assert session.source_is_playing is True
    assert session.timeline_is_playing is False

    # Start timeline playback -> stops source playback
    session.toggle_timeline_play()
    assert session.timeline_is_playing is True
    assert session.source_is_playing is False


def test_monitor_focus_toggling():
    session = SourceMonitorSession()
    assert session.active_monitor_focus == "program"

    session.toggle_monitor_focus()
    assert session.active_monitor_focus == "source"

    session.toggle_monitor_focus()
    assert session.active_monitor_focus == "program"


# ─── Group 3: Source In/Out Marking & Validation ───

def test_mark_source_in_point():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))

    session.set_playhead(2500)
    session.set_in_point()
    assert session.source_in_point_ms == 2500
    assert session.source_out_point_ms == 10000


def test_mark_source_out_point():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))

    session.set_playhead(7500)
    session.set_out_point()
    assert session.source_in_point_ms == 0
    assert session.source_out_point_ms == 7500


def test_source_range_duration_calculation():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))

    session.set_in_point(1500)
    session.set_out_point(6500)
    assert session.get_range_duration() == 5000


def test_prevent_inverted_in_point():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))
    session.set_out_point(4000)

    # Attempt to set In past Out (5000 >= 4000)
    session.set_in_point(5000)
    assert session.source_in_point_ms == 5000
    # Out point automatically pushed forward to preserve minimum 1 frame
    assert session.source_out_point_ms >= 5033


def test_prevent_inverted_out_point():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))
    session.set_in_point(6000)

    # Attempt to set Out before In (3000 <= 6000)
    session.set_out_point(3000)
    assert session.source_out_point_ms == 3000
    # In point automatically adjusted backward to preserve minimum 1 frame
    assert session.source_in_point_ms <= 2967


def test_clear_source_in_out():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=12000))
    session.set_in_point(2000)
    session.set_out_point(5000)
    assert session.get_range_duration() == 3000

    session.clear_in_out()
    assert session.source_in_point_ms == 0
    assert session.source_out_point_ms == 12000
    assert session.get_range_duration() == 12000


# ─── Group 4: 3-Point Insert Edit from Source ───

def test_source_insert_into_empty_track():
    timeline = create_sample_timeline()
    session = SourceMonitorSession()
    session.load_asset(MockAsset(asset_id="asset-hdr", duration_ms=20000))
    session.set_in_point(2000)
    session.set_out_point(7000)

    ok = execute_source_insert_edit(timeline, session, playhead_ms=1000)
    assert ok is True

    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    assert len(v1.clips) == 1
    clip = v1.clips[0]
    assert clip.asset_id == "asset-hdr"
    assert clip.start_time_ms == 1000
    assert clip.duration_ms == 5000
    assert clip.source_in_ms == 2000
    assert clip.source_out_ms == 7000


def test_source_insert_preserves_math():
    timeline = create_sample_timeline()
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))
    session.set_in_point(1000)
    session.set_out_point(4500)

    execute_source_insert_edit(timeline, session, playhead_ms=0)
    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    c = v1.clips[0]
    assert c.duration_ms == c.source_out_ms - c.source_in_ms
    assert c.duration_ms == 3500


def test_source_insert_splits_and_ripples_downstream():
    timeline = create_sample_timeline()
    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    v1.clips.append(create_sample_clip("Existing Clip", track_id="v-track-1", start_time_ms=0, duration_ms=10000))

    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=20000))
    session.set_in_point(5000)
    session.set_out_point(8000)  # 3000ms sub-clip

    # Insert at 4000ms
    ok = execute_source_insert_edit(timeline, session, playhead_ms=4000)
    assert ok is True

    # Expect 3 clips:
    # 1. Existing head (0 to 4000)
    # 2. Inserted sub-clip (4000 to 7000, duration 3000)
    # 3. Existing tail shifted by 3000ms (7000 to 13000)
    assert len(v1.clips) == 3
    assert v1.clips[0].start_time_ms == 0
    assert v1.clips[0].duration_ms == 4000

    assert v1.clips[1].start_time_ms == 4000
    assert v1.clips[1].duration_ms == 3000
    assert v1.clips[1].source_in_ms == 5000
    assert v1.clips[1].source_out_ms == 8000

    assert v1.clips[2].start_time_ms == 7000
    assert v1.clips[2].duration_ms == 6000


def test_source_insert_ripples_unlocked_tracks_leaves_locked_tracks():
    timeline = create_sample_timeline()
    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    v2 = next(t for t in timeline.tracks if t.id == "v-track-2")
    v2.is_locked = True

    v1.clips.append(create_sample_clip("V1 Clip", track_id="v-track-1", start_time_ms=5000, duration_ms=5000))
    v2.clips.append(create_sample_clip("V2 Locked Clip", track_id="v-track-2", start_time_ms=5000, duration_ms=5000))

    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))
    session.set_in_point(0)
    session.set_out_point(2000)  # 2000ms sub-clip

    execute_source_insert_edit(timeline, session, playhead_ms=2000)

    # V1 downstream clip was shifted from 5000 to 7000
    v1_existing = next(c for c in v1.clips if c.name == "V1 Clip")
    assert v1_existing.start_time_ms == 7000

    # V2 locked clip was NOT shifted
    v2_locked = v2.clips[0]
    assert v2_locked.start_time_ms == 5000


def test_source_insert_creates_cross_linked_av_pair():
    timeline = create_sample_timeline()
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=15000))
    session.set_in_point(1000)
    session.set_out_point(5000)

    execute_source_insert_edit(timeline, session, playhead_ms=0)

    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    a1 = next(t for t in timeline.tracks if t.id == "a-track-1")

    assert len(v1.clips) == 1
    assert len(a1.clips) == 1
    vc = v1.clips[0]
    ac = a1.clips[0]

    assert vc.linked_clip_id == ac.id
    assert ac.linked_clip_id == vc.id
    assert vc.source_in_ms == 1000
    assert ac.source_in_ms == 1000
    assert vc.duration_ms == 4000
    assert ac.duration_ms == 4000


# ─── Group 5: 3-Point Overwrite Edit from Source ───

def test_source_overwrite_empty_space():
    timeline = create_sample_timeline()
    session = SourceMonitorSession()
    session.load_asset(MockAsset(asset_id="asset-broll", duration_ms=10000))
    session.set_in_point(2000)
    session.set_out_point(6000)  # 4000ms

    ok = execute_source_overwrite_edit(timeline, session, playhead_ms=3000)
    assert ok is True

    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    assert len(v1.clips) == 1
    c = v1.clips[0]
    assert c.start_time_ms == 3000
    assert c.duration_ms == 4000
    assert c.source_in_ms == 2000
    assert c.source_out_ms == 6000


def test_source_overwrite_slices_middle_of_existing_clip():
    timeline = create_sample_timeline()
    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    v1.clips.append(create_sample_clip("Base Clip", track_id="v-track-1", start_time_ms=0, duration_ms=12000, source_in_ms=0, source_out_ms=12000))

    session = SourceMonitorSession()
    session.load_asset(MockAsset(asset_id="insert-take", duration_ms=10000))
    session.set_in_point(1000)
    session.set_out_point(4000)  # 3000ms

    # Overwrite between 4000 and 7000
    execute_source_overwrite_edit(timeline, session, playhead_ms=4000)

    # Expect:
    # 1. Base head: 0 to 4000 (dur 4000, source 0..4000)
    # 2. Overwrite: 4000 to 7000 (dur 3000, source 1000..4000)
    # 3. Base tail: 7000 to 12000 (dur 5000, source 7000..12000)
    assert len(v1.clips) == 3
    assert v1.clips[0].start_time_ms == 0
    assert v1.clips[0].duration_ms == 4000
    assert v1.clips[0].source_out_ms == 4000

    assert v1.clips[1].start_time_ms == 4000
    assert v1.clips[1].duration_ms == 3000
    assert v1.clips[1].source_in_ms == 1000
    assert v1.clips[1].source_out_ms == 4000

    assert v1.clips[2].start_time_ms == 7000
    assert v1.clips[2].duration_ms == 5000
    assert v1.clips[2].source_in_ms == 7000


def test_source_overwrite_completely_replaces_smaller_clip():
    timeline = create_sample_timeline()
    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    v1.clips.append(create_sample_clip("Tiny Clip", track_id="v-track-1", start_time_ms=2000, duration_ms=2000))

    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))
    session.set_in_point(0)
    session.set_out_point(6000)  # 6000ms

    # Overwrite 1000 to 7000 completely engulfs Tiny Clip (2000 to 4000)
    execute_source_overwrite_edit(timeline, session, playhead_ms=1000)

    assert len(v1.clips) == 1
    assert v1.clips[0].start_time_ms == 1000
    assert v1.clips[0].duration_ms == 6000


def test_source_overwrite_trims_head_of_clip():
    timeline = create_sample_timeline()
    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    v1.clips.append(create_sample_clip("Target Clip", track_id="v-track-1", start_time_ms=3000, duration_ms=6000, source_in_ms=0, source_out_ms=6000))

    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=5000))
    session.set_in_point(0)
    session.set_out_point(5000)  # 5000ms

    # Overwrite from 0 to 5000
    execute_source_overwrite_edit(timeline, session, playhead_ms=0)

    assert len(v1.clips) == 2
    # 0 to 5000 is the new clip
    assert v1.clips[0].start_time_ms == 0
    assert v1.clips[0].duration_ms == 5000
    # Remaining target clip starts at 5000 with duration 4000 (trimmed by 2000ms)
    assert v1.clips[1].start_time_ms == 5000
    assert v1.clips[1].duration_ms == 4000
    assert v1.clips[1].source_in_ms == 2000


# ─── Group 6: Destination Track Routing & Locked Protection ───

def test_source_routing_to_patched_tracks():
    timeline = create_sample_timeline(num_video_tracks=3, num_audio_tracks=3)
    timeline.target_video_track_id = "v-track-2"
    timeline.target_audio_track_id = "a-track-3"

    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=8000))
    session.set_in_point(1000)
    session.set_out_point(5000)

    ok = execute_source_insert_edit(timeline, session, playhead_ms=0)
    assert ok is True

    v2 = next(t for t in timeline.tracks if t.id == "v-track-2")
    a3 = next(t for t in timeline.tracks if t.id == "a-track-3")
    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")

    assert len(v2.clips) == 1
    assert len(a3.clips) == 1
    assert len(v1.clips) == 0


def test_locked_target_track_rejection():
    timeline = create_sample_timeline()
    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    for t in timeline.tracks:
        t.is_locked = True

    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=5000))

    # All available tracks locked -> edit rejected
    ok_insert = execute_source_insert_edit(timeline, session, playhead_ms=0)
    assert ok_insert is False

    ok_overwrite = execute_source_overwrite_edit(timeline, session, playhead_ms=0)
    assert ok_overwrite is False


def test_unloaded_asset_rejection():
    timeline = create_sample_timeline()
    session = SourceMonitorSession()  # No asset loaded

    ok_insert = execute_source_insert_edit(timeline, session, playhead_ms=0)
    assert ok_insert is False

    ok_overwrite = execute_source_overwrite_edit(timeline, session, playhead_ms=0)
    assert ok_overwrite is False


# ─── Group 8: Additional Edge Cases & Workflow Integrity ───

def test_source_in_point_at_zero():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=5000))
    session.set_in_point(0)
    assert session.source_in_point_ms == 0
    assert session.source_out_point_ms == 5000


def test_source_out_point_at_exact_duration():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=7500))
    session.set_out_point(7500)
    assert session.source_out_point_ms == 7500


def test_source_minimum_one_frame_duration():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))
    session.set_in_point(2000)
    session.set_out_point(2000)
    # Range duration must be at least 1 frame (33ms)
    assert session.get_range_duration() >= 33


def test_source_session_reset_on_new_asset():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(asset_id="a1", duration_ms=4000))
    session.set_in_point(1000)
    session.set_out_point(3000)
    assert session.get_range_duration() == 2000

    # Load new asset -> resets session state
    session.load_asset(MockAsset(asset_id="a2", duration_ms=10000))
    assert session.source_asset.id == "a2"
    assert session.source_in_point_ms == 0
    assert session.source_out_point_ms == 10000
    assert session.get_range_duration() == 10000


def test_source_insert_multiple_sequential():
    timeline = create_sample_timeline()
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=20000))

    # Sub-clip 1: 0 to 2000
    session.set_in_point(0)
    session.set_out_point(2000)
    execute_source_insert_edit(timeline, session, playhead_ms=0)

    # Sub-clip 2: 5000 to 8000 (insert at 2000)
    session.set_in_point(5000)
    session.set_out_point(8000)
    execute_source_insert_edit(timeline, session, playhead_ms=2000)

    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    assert len(v1.clips) == 2
    assert v1.clips[0].start_time_ms == 0
    assert v1.clips[0].duration_ms == 2000
    assert v1.clips[1].start_time_ms == 2000
    assert v1.clips[1].duration_ms == 3000


def test_source_overwrite_at_tail_of_clip():
    timeline = create_sample_timeline()
    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    v1.clips.append(create_sample_clip("Base", track_id="v-track-1", start_time_ms=0, duration_ms=6000, source_in_ms=0, source_out_ms=6000))

    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))
    session.set_in_point(0)
    session.set_out_point(4000)

    # Overwrite from 4000 to 8000 (clips tail of Base at 4000)
    execute_source_overwrite_edit(timeline, session, playhead_ms=4000)

    assert len(v1.clips) == 2
    assert v1.clips[0].start_time_ms == 0
    assert v1.clips[0].duration_ms == 4000
    assert v1.clips[0].source_out_ms == 4000

    assert v1.clips[1].start_time_ms == 4000
    assert v1.clips[1].duration_ms == 4000
    assert v1.clips[1].source_out_ms == 4000


def test_source_scrubbing_does_not_modify_timeline():
    timeline = create_sample_timeline()
    original_state = copy.deepcopy(timeline.model_dump())

    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))
    session.set_playhead(5000)
    session.step_frame(10)

    # Timeline remains 100% untouched
    assert timeline.model_dump() == original_state


def test_source_marking_does_not_modify_timeline():
    timeline = create_sample_timeline()
    original_state = copy.deepcopy(timeline.model_dump())

    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))
    session.set_in_point(1000)
    session.set_out_point(4000)
    session.clear_in_out()

    # Timeline remains 100% untouched
    assert timeline.model_dump() == original_state


def test_source_insert_with_markers_shift():
    timeline = create_sample_timeline()
    timeline.markers = [
        MarkerSchema(time_ms=1000, name="Marker 1"),
        MarkerSchema(time_ms=5000, name="Marker 2"),
    ]

    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=10000))
    session.set_in_point(0)
    session.set_out_point(3000)  # 3000ms

    execute_source_insert_edit(timeline, session, playhead_ms=2000)

    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    assert len(v1.clips) == 1
    assert v1.clips[0].start_time_ms == 2000
    assert v1.clips[0].duration_ms == 3000


def test_source_clip_custom_name():
    timeline = create_sample_timeline()
    session = SourceMonitorSession()
    session.load_asset(MockAsset(file_name="Interview_Scene_Take_3.mp4", duration_ms=15000))
    session.set_in_point(2000)
    session.set_out_point(7000)

    execute_source_insert_edit(timeline, session, playhead_ms=0)

    v1 = next(t for t in timeline.tracks if t.id == "v-track-1")
    a1 = next(t for t in timeline.tracks if t.id == "a-track-1")

    assert v1.clips[0].name == "Interview_Scene_Take_3.mp4"
    assert a1.clips[0].name == "Interview_Scene_Take_3.mp4 (Audio)"


# ─── Group 7: Serialization & Schema Preservation ───

def test_source_created_clip_serialization():
    timeline = create_sample_timeline()
    session = SourceMonitorSession()
    session.load_asset(MockAsset(asset_id="asset-77", file_name="clip_77.mp4", duration_ms=10000))
    session.set_in_point(2000)
    session.set_out_point(6000)

    execute_source_insert_edit(timeline, session, playhead_ms=1500)

    # Serialize to TimelineSaveRequest
    save_req = TimelineSaveRequest(
        name=timeline.name,
        duration_ms=timeline.duration_ms,
        tracks=timeline.tracks,
        target_video_track_id=timeline.target_video_track_id,
        target_audio_track_id=timeline.target_audio_track_id,
    )

    data = save_req.model_dump()
    v_track_data = next(t for t in data["tracks"] if t["id"] == "v-track-1")
    c_data = v_track_data["clips"][0]

    assert c_data["asset_id"] == "asset-77"
    assert c_data["start_time_ms"] == 1500
    assert c_data["duration_ms"] == 4000
    assert c_data["source_in_ms"] == 2000
    assert c_data["source_out_ms"] == 6000
    assert c_data["duration_ms"] == c_data["source_out_ms"] - c_data["source_in_ms"]


def test_roundtrip_schema_validation():
    timeline = create_sample_timeline()
    session = SourceMonitorSession()
    session.load_asset(MockAsset(asset_id="asset-99", file_name="take99.mov", duration_ms=8000))
    session.set_in_point(500)
    session.set_out_point(3500)

    execute_source_overwrite_edit(timeline, session, playhead_ms=2000)

    # Dump and reconstruct schema
    dumped = timeline.model_dump()
    reconstructed = TimelineStateSchema.model_validate(dumped)

    v1 = next(t for t in reconstructed.tracks if t.id == "v-track-1")
    assert len(v1.clips) == 1
    assert v1.clips[0].asset_id == "asset-99"
    assert v1.clips[0].source_in_ms == 500
    assert v1.clips[0].source_out_ms == 3500
    assert v1.clips[0].duration_ms == 3000


def test_source_playhead_jump_to_in():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=8000))
    session.set_in_point(2500)
    session.set_playhead(0)
    # Jump to In
    session.set_playhead(session.source_in_point_ms or 0)
    assert session.source_playhead_ms == 2500


def test_source_playhead_jump_to_out():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=8000))
    session.set_out_point(6200)
    session.set_playhead(0)
    # Jump to Out
    session.set_playhead(session.source_out_point_ms or 8000)
    assert session.source_playhead_ms == 6200


def test_source_range_single_frame_exact():
    session = SourceMonitorSession()
    session.load_asset(MockAsset(duration_ms=5000))
    session.set_in_point(1000)
    session.set_out_point(1033)
    assert session.get_range_duration() == 33


def test_source_audio_only_track_insert():
    timeline = create_sample_timeline(num_video_tracks=0, num_audio_tracks=2)
    session = SourceMonitorSession()
    session.load_asset(MockAsset(asset_type="audio", duration_ms=6000))
    session.set_in_point(1000)
    session.set_out_point(4000)

    ok = execute_source_insert_edit(timeline, session, playhead_ms=500)
    assert ok is True
    a1 = next(t for t in timeline.tracks if t.id == "a-track-1")
    assert len(a1.clips) == 1
    assert a1.clips[0].start_time_ms == 500
    assert a1.clips[0].duration_ms == 3000


def test_source_layout_mode_switch():
    session = SourceMonitorSession()
    assert session.monitor_layout == "dual"
    session.monitor_layout = "tabbed"
    assert session.monitor_layout == "tabbed"
    session.monitor_layout = "dual"
    assert session.monitor_layout == "dual"
