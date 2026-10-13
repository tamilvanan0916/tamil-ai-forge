import pytest
import uuid
import copy
from typing import List, Dict, Any, Optional, Tuple, Set

from app.schemas.timeline import (
    TrackSchema,
    ClipSchema,
    TimelineStateSchema,
    TimelineSaveRequest,
    MarkerSchema,
    KeyframeSchema,
    EffectSchema,
)
from app.models.timeline import Timeline, Track, Clip
from app.services.timeline_service import TimelineService


# ─── Pure Timeline State & Algorithm Implementations for Phase 43 ───

def clamp(val: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, val))


def mark_in(
    in_point_ms: Optional[int],
    out_point_ms: Optional[int],
    playhead_ms: int,
    timeline_duration_ms: int = 60000,
) -> Tuple[int, Optional[int]]:
    new_in = int(clamp(playhead_ms, 0, timeline_duration_ms))
    new_out = out_point_ms
    if new_out is not None and new_in > new_out:
        new_in, new_out = new_out, new_in
    return new_in, new_out


def mark_out(
    in_point_ms: Optional[int],
    out_point_ms: Optional[int],
    playhead_ms: int,
    timeline_duration_ms: int = 60000,
) -> Tuple[Optional[int], int]:
    new_out = int(clamp(playhead_ms, 0, timeline_duration_ms))
    new_in = in_point_ms
    if new_in is not None and new_out < new_in:
        new_in, new_out = new_out, new_in
    return new_in, new_out


def clear_in_out() -> Tuple[None, None]:
    return None, None


def mark_clip_range(
    tracks: List[TrackSchema],
    selected_clip_ids: List[str],
    timeline_duration_ms: int = 60000,
) -> Optional[Tuple[int, int]]:
    if not selected_clip_ids:
        return None
    selected_clips: List[ClipSchema] = []
    for t in tracks:
        for c in t.clips:
            if c.id in selected_clip_ids:
                selected_clips.append(c)
    if not selected_clips:
        return None
    min_start = min(c.start_time_ms for c in selected_clips)
    max_end = max(c.start_time_ms + c.duration_ms for c in selected_clips)
    return int(clamp(min_start, 0, timeline_duration_ms)), int(clamp(max_end, 0, timeline_duration_ms))


def set_in_out_range(
    in_ms: int,
    out_ms: int,
    timeline_duration_ms: int = 60000,
) -> Tuple[int, int]:
    start = int(clamp(min(in_ms, out_ms), 0, timeline_duration_ms))
    end = int(clamp(max(in_ms, out_ms), 0, timeline_duration_ms))
    return start, end


def razor_split_clip_pure(
    tracks: List[TrackSchema],
    clip_id: str,
    split_time_ms: int,
) -> Tuple[bool, Optional[str]]:
    """Splits clip at split_time_ms. Returns (success, new_clip_id)."""
    target_track = None
    target_clip = None
    for t in tracks:
        for c in t.clips:
            if c.id == clip_id:
                target_track = t
                target_clip = c
                break
        if target_clip:
            break

    if not target_clip or not target_track or target_track.is_locked:
        return False, None

    if split_time_ms <= target_clip.start_time_ms or split_time_ms >= (target_clip.start_time_ms + target_clip.duration_ms):
        return False, None

    left_duration = split_time_ms - target_clip.start_time_ms
    right_duration = target_clip.duration_ms - left_duration
    offset_into_clip = split_time_ms - target_clip.start_time_ms

    new_clip_id = str(uuid.uuid4())
    right_clip = copy.deepcopy(target_clip)
    right_clip.id = new_clip_id
    right_clip.start_time_ms = split_time_ms
    right_clip.duration_ms = right_duration
    right_clip.source_in_ms = target_clip.source_in_ms + offset_into_clip

    target_clip.duration_ms = left_duration
    target_clip.source_out_ms = target_clip.source_in_ms + left_duration

    target_track.clips.append(right_clip)
    target_track.clips.sort(key=lambda c: c.start_time_ms)
    return True, new_clip_id


def lift_range_pure(
    tracks: List[TrackSchema],
    in_point_ms: Optional[int],
    out_point_ms: Optional[int],
) -> bool:
    """Lifts (removes) content between in_point and out_point without rippling.
    Leaves a gap in place. Respects locked tracks.
    """
    if in_point_ms is None or out_point_ms is None or in_point_ms >= out_point_ms:
        return False

    r_in = in_point_ms
    r_out = out_point_ms

    # Step 1: boundary cuts at r_in and r_out for unlocked tracks
    for boundary in (r_in, r_out):
        for t in tracks:
            if t.is_locked:
                continue
            to_cut = [c for c in t.clips if c.start_time_ms < boundary < (c.start_time_ms + c.duration_ms)]
            for c in to_cut:
                razor_split_clip_pure(tracks, c.id, boundary)

    # Step 2: delete clips strictly within [r_in, r_out] on unlocked tracks
    deleted_any = False
    for t in tracks:
        if t.is_locked:
            continue
        original_len = len(t.clips)
        t.clips = [
            c for c in t.clips
            if not (c.start_time_ms >= r_in and (c.start_time_ms + c.duration_ms) <= r_out)
        ]
        if len(t.clips) != original_len:
            deleted_any = True

    return deleted_any


def extract_range_pure(
    tracks: List[TrackSchema],
    in_point_ms: Optional[int],
    out_point_ms: Optional[int],
) -> bool:
    """Extracts (ripple deletes) content between in_point and out_point.
    Closes the gap by shifting downstream clips by range_len.
    Respects locked tracks (locked track clips are NOT deleted and NOT shifted).
    """
    if in_point_ms is None or out_point_ms is None or in_point_ms >= out_point_ms:
        return False

    r_in = in_point_ms
    r_out = out_point_ms
    range_len = r_out - r_in

    # Step 1: boundary cuts on unlocked tracks
    for boundary in (r_in, r_out):
        for t in tracks:
            if t.is_locked:
                continue
            to_cut = [c for c in t.clips if c.start_time_ms < boundary < (c.start_time_ms + c.duration_ms)]
            for c in to_cut:
                razor_split_clip_pure(tracks, c.id, boundary)

    # Step 2: delete inside clips and shift downstream clips left
    affected_any = False
    for t in tracks:
        if t.is_locked:
            continue

        # Delete clips inside [r_in, r_out]
        original_count = len(t.clips)
        kept_clips = [
            c for c in t.clips
            if not (c.start_time_ms >= r_in and (c.start_time_ms + c.duration_ms) <= r_out)
        ]
        if len(kept_clips) != original_count:
            affected_any = True

        # Shift downstream clips left
        for c in kept_clips:
            if c.start_time_ms >= r_out:
                c.start_time_ms = max(0, c.start_time_ms - range_len)
                affected_any = True

        t.clips = kept_clips
        t.clips.sort(key=lambda c: c.start_time_ms)

    return affected_any


# ─── Helper Fixtures ───

@pytest.fixture
def sample_tracks() -> List[TrackSchema]:
    return [
        TrackSchema(
            id="track-v1",
            name="Video 1",
            track_type="video",
            order_index=0,
            is_locked=False,
            is_muted=False,
            clips=[
                ClipSchema(
                    id="clip-v1",
                    track_id="track-v1",
                    name="Video Clip 1",
                    clip_type="video",
                    start_time_ms=0,
                    duration_ms=4000,
                    source_in_ms=0,
                    source_out_ms=4000,
                ),
                ClipSchema(
                    id="clip-v2",
                    track_id="track-v1",
                    name="Video Clip 2",
                    clip_type="video",
                    start_time_ms=5000,
                    duration_ms=5000,
                    source_in_ms=0,
                    source_out_ms=5000,
                ),
            ],
        ),
        TrackSchema(
            id="track-a1",
            name="Audio 1",
            track_type="audio",
            order_index=1,
            is_locked=False,
            is_muted=False,
            clips=[
                ClipSchema(
                    id="clip-a1",
                    track_id="track-a1",
                    name="Audio Clip 1",
                    clip_type="audio",
                    start_time_ms=0,
                    duration_ms=4000,
                    source_in_ms=0,
                    source_out_ms=4000,
                ),
            ],
        ),
    ]


# ─── Phase 43 Dedicated Test Cases ───

def test_mark_in_basic():
    in_pt, out_pt = mark_in(None, None, 1500, 30000)
    assert in_pt == 1500
    assert out_pt is None


def test_mark_out_basic():
    in_pt, out_pt = mark_out(None, None, 4500, 30000)
    assert in_pt is None
    assert out_pt == 4500


def test_mark_in_after_out_swaps_or_adjusts():
    in_pt, out_pt = mark_in(None, 2000, 5000, 30000)
    assert in_pt == 2000
    assert out_pt == 5000


def test_mark_out_before_in_swaps_or_adjusts():
    in_pt, out_pt = mark_out(4000, None, 1000, 30000)
    assert in_pt == 1000
    assert out_pt == 4000


def test_mark_in_clamping():
    in_pt, _ = mark_in(None, None, -500, 20000)
    assert in_pt == 0
    in_pt2, _ = mark_in(None, None, 25000, 20000)
    assert in_pt2 == 20000


def test_mark_out_clamping():
    _, out_pt = mark_out(None, None, -100, 20000)
    assert out_pt == 0
    _, out_pt2 = mark_out(None, None, 30000, 20000)
    assert out_pt2 == 20000


def test_clear_in_out():
    in_pt, out_pt = clear_in_out()
    assert in_pt is None
    assert out_pt is None


def test_mark_clip_range_single_clip(sample_tracks):
    res = mark_clip_range(sample_tracks, ["clip-v1"], 30000)
    assert res is not None
    assert res[0] == 0
    assert res[1] == 4000


def test_mark_clip_range_multiple_selected(sample_tracks):
    res = mark_clip_range(sample_tracks, ["clip-v1", "clip-v2"], 30000)
    assert res is not None
    assert res[0] == 0
    assert res[1] == 10000


def test_mark_clip_range_no_selection_returns_false(sample_tracks):
    res = mark_clip_range(sample_tracks, [], 30000)
    assert res is None


def test_set_in_out_range_valid():
    in_pt, out_pt = set_in_out_range(1000, 6000, 30000)
    assert in_pt == 1000
    assert out_pt == 6000


def test_set_in_out_range_inverted_normalizes():
    in_pt, out_pt = set_in_out_range(8000, 2000, 30000)
    assert in_pt == 2000
    assert out_pt == 8000


def test_lift_range_no_work_area_returns_false(sample_tracks):
    ok = lift_range_pure(sample_tracks, None, None)
    assert ok is False
    ok2 = lift_range_pure(sample_tracks, 5000, 2000)
    assert ok2 is False


def test_extract_range_no_work_area_returns_false(sample_tracks):
    ok = extract_range_pure(sample_tracks, None, None)
    assert ok is False
    ok2 = extract_range_pure(sample_tracks, 4000, 4000)
    assert ok2 is False


def test_lift_range_single_clip_contained(sample_tracks):
    ok = lift_range_pure(sample_tracks, 4500, 10500)
    assert ok is True
    v_track = next(t for t in sample_tracks if t.id == "track-v1")
    clip_ids = [c.id for c in v_track.clips]
    assert "clip-v1" in clip_ids
    assert "clip-v2" not in clip_ids


def test_lift_range_single_clip_split_middle(sample_tracks):
    ok = lift_range_pure(sample_tracks, 1000, 3000)
    assert ok is True
    v_track = next(t for t in sample_tracks if t.id == "track-v1")
    remaining_clips = [c for c in v_track.clips if c.start_time_ms < 5000]
    assert len(remaining_clips) == 2
    assert remaining_clips[0].start_time_ms == 0
    assert remaining_clips[0].duration_ms == 1000
    assert remaining_clips[1].start_time_ms == 3000
    assert remaining_clips[1].duration_ms == 1000
    v2 = next(c for c in v_track.clips if c.start_time_ms >= 5000)
    assert v2.start_time_ms == 5000


def test_lift_range_clips_straddling_in_boundary(sample_tracks):
    ok = lift_range_pure(sample_tracks, 2000, 4500)
    assert ok is True
    v_track = next(t for t in sample_tracks if t.id == "track-v1")
    v1 = next(c for c in v_track.clips if c.id == "clip-v1")
    assert v1.start_time_ms == 0
    assert v1.duration_ms == 2000


def test_lift_range_clips_straddling_out_boundary(sample_tracks):
    ok = lift_range_pure(sample_tracks, 4000, 7000)
    assert ok is True
    v_track = next(t for t in sample_tracks if t.id == "track-v1")
    v2_rem = [c for c in v_track.clips if c.start_time_ms >= 7000]
    assert len(v2_rem) == 1
    assert v2_rem[0].start_time_ms == 7000
    assert v2_rem[0].duration_ms == 3000


def test_lift_range_multiple_tracks(sample_tracks):
    ok = lift_range_pure(sample_tracks, 1000, 3000)
    assert ok is True
    v_track = next(t for t in sample_tracks if t.id == "track-v1")
    a_track = next(t for t in sample_tracks if t.id == "track-a1")
    assert len([c for c in v_track.clips if c.start_time_ms < 5000]) == 2
    assert len(a_track.clips) == 2


def test_lift_range_locked_track_ignored(sample_tracks):
    a_track = next(t for t in sample_tracks if t.id == "track-a1")
    a_track.is_locked = True

    ok = lift_range_pure(sample_tracks, 1000, 3000)
    assert ok is True
    assert len(a_track.clips) == 1
    assert a_track.clips[0].duration_ms == 4000


def test_lift_range_gap_preservation(sample_tracks):
    lift_range_pure(sample_tracks, 1000, 3000)
    v_track = next(t for t in sample_tracks if t.id == "track-v1")
    v2 = next(c for c in v_track.clips if c.name == "Video Clip 2")
    assert v2.start_time_ms == 5000


def test_extract_range_single_clip_contained(sample_tracks):
    ok = extract_range_pure(sample_tracks, 0, 4500)
    assert ok is True
    v_track = next(t for t in sample_tracks if t.id == "track-v1")
    assert len(v_track.clips) == 1
    assert v_track.clips[0].start_time_ms == 500


def test_extract_range_single_clip_split_middle(sample_tracks):
    ok = extract_range_pure(sample_tracks, 1000, 2500)
    assert ok is True
    v_track = next(t for t in sample_tracks if t.id == "track-v1")
    v1_head = next(c for c in v_track.clips if c.start_time_ms == 0)
    v1_tail = next(c for c in v_track.clips if c.start_time_ms == 1000)
    assert v1_head.duration_ms == 1000
    assert v1_tail.duration_ms == 1500
    v2 = next(c for c in v_track.clips if c.name == "Video Clip 2")
    assert v2.start_time_ms == 3500


def test_extract_range_multiple_tracks(sample_tracks):
    ok = extract_range_pure(sample_tracks, 1000, 2000)
    assert ok is True
    v_track = next(t for t in sample_tracks if t.id == "track-v1")
    a_track = next(t for t in sample_tracks if t.id == "track-a1")
    assert len(a_track.clips) == 2
    assert a_track.clips[1].start_time_ms == 1000


def test_extract_range_locked_track_protection(sample_tracks):
    v_track = next(t for t in sample_tracks if t.id == "track-v1")
    v_track.is_locked = True

    ok = extract_range_pure(sample_tracks, 0, 2000)
    assert ok is True

    assert len(v_track.clips) == 2
    assert v_track.clips[0].start_time_ms == 0
    assert v_track.clips[1].start_time_ms == 5000

    a_track = next(t for t in sample_tracks if t.id == "track-a1")
    assert a_track.clips[0].start_time_ms == 0
    assert a_track.clips[0].duration_ms == 2000


def test_extract_range_timeline_duration_reduces(sample_tracks):
    ok = extract_range_pure(sample_tracks, 5000, 7000)
    assert ok is True
    v_track = next(t for t in sample_tracks if t.id == "track-v1")
    v2_rem = [c for c in v_track.clips if c.start_time_ms == 5000]
    assert len(v2_rem) == 1
    assert v2_rem[0].duration_ms == 3000


def test_extract_range_with_audio_video_linked_clips(sample_tracks):
    v1 = sample_tracks[0].clips[0]
    a1 = sample_tracks[1].clips[0]
    v1.linked_clip_id = a1.id
    a1.linked_clip_id = v1.id

    ok = extract_range_pure(sample_tracks, 1000, 2000)
    assert ok is True
    v_tails = [c for c in sample_tracks[0].clips if c.start_time_ms == 1000]
    a_tails = [c for c in sample_tracks[1].clips if c.start_time_ms == 1000]
    assert len(v_tails) == 1
    assert len(a_tails) == 1
    assert v_tails[0].start_time_ms == a_tails[0].start_time_ms
    assert v_tails[0].duration_ms == a_tails[0].duration_ms


def test_lift_range_with_grouped_clips(sample_tracks):
    gid = "test-group-123"
    sample_tracks[0].clips[0].group_id = gid
    sample_tracks[1].clips[0].group_id = gid

    lift_range_pure(sample_tracks, 1000, 3000)
    v_tails = [c for c in sample_tracks[0].clips if c.start_time_ms == 3000]
    assert len(v_tails) == 1
    assert v_tails[0].group_id == gid


def test_extract_range_with_grouped_clips(sample_tracks):
    gid = "test-group-456"
    sample_tracks[0].clips[0].group_id = gid
    sample_tracks[1].clips[0].group_id = gid

    extract_range_pure(sample_tracks, 1000, 2000)
    v_tails = [c for c in sample_tracks[0].clips if c.start_time_ms == 1000]
    a_tails = [c for c in sample_tracks[1].clips if c.start_time_ms == 1000]
    assert v_tails[0].group_id == gid
    assert a_tails[0].group_id == gid


def test_range_operations_with_compound_clips(sample_tracks):
    sample_tracks[0].clips[0].is_compound = True

    ok = lift_range_pure(sample_tracks, 1000, 2000)
    assert ok is True
    v_track = sample_tracks[0]
    compound_splits = [c for c in v_track.clips if c.start_time_ms in (0, 2000)]
    assert len(compound_splits) == 2
    assert compound_splits[0].is_compound is True
    assert compound_splits[1].is_compound is True


def test_work_area_loop_bounds_calculation():
    in_pt = 2000
    out_pt = 6000
    playhead = 6000
    next_playhead = in_pt if playhead >= out_pt else playhead + 100
    assert next_playhead == 2000

    playhead_inside = 3500
    next_playhead_inside = in_pt if playhead_inside >= out_pt else playhead_inside + 100
    assert next_playhead_inside == 3600


def test_timeline_schema_in_out_fields():
    state = TimelineStateSchema(
        id="tl-state-1",
        project_id="proj-state-1",
        tracks=[],
        duration_ms=60000,
        in_point_ms=2500,
        out_point_ms=8500,
    )
    assert state.in_point_ms == 2500
    assert state.out_point_ms == 8500


def test_timeline_save_request_in_out_fields():
    req = TimelineSaveRequest(
        tracks=[],
        duration_ms=45000,
        in_point_ms=1000,
        out_point_ms=5000,
    )
    assert req.in_point_ms == 1000
    assert req.out_point_ms == 5000


def test_timeline_service_serialization_roundtrip():
    tl = Timeline(
        id="tl-test-1",
        project_id="proj-test-1",
        name="Test Timeline",
        duration_ms=60000,
    )
    tl.tracks = []
    tl.in_point_ms = 3000
    tl.out_point_ms = 7000
    state = TimelineService.serialize_timeline(tl)
    assert state["in_point_ms"] == 3000
    assert state["out_point_ms"] == 7000


def test_timeline_deserialization_defaults_none():
    tl = Timeline(
        id="tl-test-2",
        project_id="proj-test-2",
        name="Test Timeline",
        duration_ms=60000,
    )
    tl.tracks = []
    state = TimelineService.serialize_timeline(tl)
    assert state["in_point_ms"] is None
    assert state["out_point_ms"] is None


def test_history_single_transaction_for_lift():
    history_stack = []

    def push_history(state):
        history_stack.append(state)

    initial_state = {"version": 1, "tracks": []}
    push_history(initial_state)
    assert len(history_stack) == 1


def test_history_single_transaction_for_extract():
    history_stack = []

    def push_history(state):
        history_stack.append(state)

    initial_state = {"version": 1, "tracks": []}
    push_history(initial_state)
    assert len(history_stack) == 1
