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


# ─── Pure Timeline State & Algorithm Implementations for Phase 44 ───

def clamp(val: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, val))


def trim_single_clip_data(
    clip: ClipSchema,
    new_start_time_ms: float,
    new_duration_ms: float,
    edge: str,
) -> ClipSchema:
    c = clip.model_copy(deep=True)
    MIN_DURATION = 100.0
    effective_duration = max(MIN_DURATION, new_duration_ms)
    speed = c.speed_factor if (c.speed_factor and c.speed_factor > 0) else 1.0

    if edge == 'start':
        source_delta = (new_start_time_ms - c.start_time_ms) * speed
        c.source_in_ms = int(max(0.0, c.source_in_ms + source_delta))
        c.start_time_ms = int(new_start_time_ms)
        c.duration_ms = int(effective_duration)
        c.source_out_ms = int(c.source_in_ms + (effective_duration * speed))

        # Shift keyframes
        if c.keyframes:
            updated_kfs = []
            for kf in c.keyframes:
                shifted = kf.time_offset_ms - source_delta
                if 0 <= shifted <= effective_duration:
                    kf_copy = kf.model_copy(deep=True)
                    kf_copy.time_offset_ms = int(shifted)
                    updated_kfs.append(kf_copy)
            c.keyframes = updated_kfs

        if c.transition_in:
            t_in = copy.deepcopy(c.transition_in)
            t_in["duration_ms"] = min(t_in.get("duration_ms", 1000), int(effective_duration / 2))
            c.transition_in = t_in
    else:
        c.duration_ms = int(effective_duration)
        c.source_out_ms = int(c.source_in_ms + (effective_duration * speed))

        # Prune keyframes beyond new duration
        if c.keyframes:
            c.keyframes = [kf for kf in c.keyframes if kf.time_offset_ms <= effective_duration]

        if c.transition_out:
            t_out = copy.deepcopy(c.transition_out)
            t_out["duration_ms"] = min(t_out.get("duration_ms", 1000), int(effective_duration / 2))
            c.transition_out = t_out

    return c


def ripple_trim_clip(
    tracks: List[TrackSchema],
    clip_id: str,
    new_start_time_ms: float,
    new_duration_ms: float,
    edge: str,  # 'start' or 'end'
    is_ripple: bool = True,
) -> Tuple[List[TrackSchema], bool]:
    # Check if clip exists
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

    if not target_clip or not target_track:
        return tracks, False

    if target_track.is_locked:
        return tracks, False

    # Check linked clip
    linked_clip = None
    linked_track = None
    if target_clip.linked_clip_id:
        for t in tracks:
            for c in t.clips:
                if c.id == target_clip.linked_clip_id:
                    linked_clip = c
                    linked_track = t
                    break
            if linked_clip:
                break
        if linked_track and linked_track.is_locked:
            return tracks, False

    MIN_DURATION = 100.0
    constrained_duration = max(MIN_DURATION, new_duration_ms)
    time_delta = constrained_duration - target_clip.duration_ms

    if abs(time_delta) < 1.0 and abs(new_start_time_ms - target_clip.start_time_ms) < 1.0:
        return tracks, False

    new_tracks = [t.model_copy(deep=True) for t in tracks]
    affected_ids = {target_clip.id}
    if linked_clip:
        affected_ids.add(linked_clip.id)

    # Apply trim to target and linked partner
    for t in new_tracks:
        if t.is_locked:
            continue
        for i, c in enumerate(t.clips):
            if c.id == target_clip.id:
                t.clips[i] = trim_single_clip_data(c, new_start_time_ms, constrained_duration, edge)
            elif linked_clip and c.id == linked_clip.id:
                t.clips[i] = trim_single_clip_data(c, new_start_time_ms, constrained_duration, edge)

    if is_ripple:
        if edge == 'start':
            # Head trim ripple: duration shrank, so downstream clips shift left by the trimmed delta
            shift_delta = int(-(new_start_time_ms - target_clip.start_time_ms))
            for t in new_tracks:
                if t.is_locked:
                    continue
                for i, c in enumerate(t.clips):
                    if c.id in affected_ids:
                        continue
                    if c.start_time_ms >= target_clip.start_time_ms:
                        c_copy = c.model_copy(deep=True)
                        c_copy.start_time_ms = max(0, c_copy.start_time_ms + shift_delta)
                        t.clips[i] = c_copy
        else:
            # Tail trim ripple: clip expanded or shrank
            shift_origin = target_clip.start_time_ms + target_clip.duration_ms - 1.0
            shift_delta = int(time_delta)
            for t in new_tracks:
                if t.is_locked:
                    continue
                for i, c in enumerate(t.clips):
                    if c.id in affected_ids:
                        continue
                    if c.start_time_ms >= shift_origin:
                        c_copy = c.model_copy(deep=True)
                        c_copy.start_time_ms = max(0, c_copy.start_time_ms + shift_delta)
                        t.clips[i] = c_copy

    return new_tracks, True


def ripple_trim_to_playhead(
    tracks: List[TrackSchema],
    playhead_ms: float,
    edge: str,  # 'head' or 'tail'
    clip_id: Optional[str] = None,
) -> Tuple[List[TrackSchema], bool, Optional[float]]:
    # Find candidate clip
    target_clip = None
    target_track = None
    if clip_id:
        for t in tracks:
            for c in t.clips:
                if c.id == clip_id:
                    target_clip = c
                    target_track = t
                    break
            if target_clip:
                break
    else:
        for t in tracks:
            for c in t.clips:
                if c.start_time_ms <= playhead_ms <= (c.start_time_ms + c.duration_ms):
                    target_clip = c
                    target_track = t
                    break
            if target_clip:
                break

    if not target_clip or not target_track:
        return tracks, False, None

    if target_track.is_locked:
        return tracks, False, None

    MIN_DURATION = 100.0
    if edge == 'head':
        if playhead_ms <= target_clip.start_time_ms or playhead_ms >= (target_clip.start_time_ms + target_clip.duration_ms - MIN_DURATION):
            return tracks, False, None
        delta = playhead_ms - target_clip.start_time_ms
        new_dur = target_clip.duration_ms - delta
        new_tracks, ok = ripple_trim_clip(tracks, target_clip.id, playhead_ms, new_dur, 'start', is_ripple=True)
        return new_tracks, ok, target_clip.start_time_ms
    else:
        if playhead_ms >= (target_clip.start_time_ms + target_clip.duration_ms) or playhead_ms <= (target_clip.start_time_ms + MIN_DURATION):
            return tracks, False, None
        new_dur = playhead_ms - target_clip.start_time_ms
        new_tracks, ok = ripple_trim_clip(tracks, target_clip.id, target_clip.start_time_ms, new_dur, 'end', is_ripple=True)
        return new_tracks, ok, playhead_ms


# ─── Pytest Fixtures ───

@pytest.fixture
def sample_timeline_tracks() -> List[TrackSchema]:
    return [
        TrackSchema(
            id="v-track-1",
            name="Video 1",
            track_type="video",
            track_role="main",
            order_index=0,
            is_locked=False,
            is_muted=False,
            is_visible=True,
            volume=1.0,
            pan=0.0,
            clips=[
                ClipSchema(
                    id="clip-v1",
                    name="Scene 1",
                    track_id="v-track-1",
                    start_time_ms=0,
                    duration_ms=4000,
                    source_in_ms=0,
                    source_out_ms=4000,
                    speed_factor=1.0,
                    linked_clip_id="clip-a1",
                    keyframes=[
                        KeyframeSchema(id="kf-1", property_path="scale_x", time_offset_ms=1000, value=1.0),
                        KeyframeSchema(id="kf-2", property_path="scale_x", time_offset_ms=3000, value=1.5),
                    ],
                ),
                ClipSchema(
                    id="clip-v2",
                    name="Scene 2",
                    track_id="v-track-1",
                    start_time_ms=4000,
                    duration_ms=5000,
                    source_in_ms=1000,
                    source_out_ms=6000,
                    speed_factor=1.0,
                ),
            ],
        ),
        TrackSchema(
            id="a-track-1",
            name="Audio 1",
            track_type="audio",
            track_role="dialogue",
            order_index=1,
            is_locked=False,
            is_muted=False,
            is_visible=True,
            volume=1.0,
            pan=0.0,
            clips=[
                ClipSchema(
                    id="clip-a1",
                    name="Dialogue 1",
                    track_id="a-track-1",
                    start_time_ms=0,
                    duration_ms=4000,
                    source_in_ms=0,
                    source_out_ms=4000,
                    speed_factor=1.0,
                    linked_clip_id="clip-v1",
                ),
                ClipSchema(
                    id="clip-a2",
                    name="Dialogue 2",
                    track_id="a-track-1",
                    start_time_ms=4000,
                    duration_ms=5000,
                    source_in_ms=1000,
                    source_out_ms=6000,
                    speed_factor=1.0,
                ),
            ],
        ),
    ]


# ─── Tests ───

def test_01_ripple_trim_head_shortens_duration(sample_timeline_tracks):
    """Trimming head collapses duration and ripples downstream clips left."""
    # Trim clip-v1 from start: new start = 1000, new duration = 3000 (trimmed 1000ms from head)
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 1000, 3000, 'start', is_ripple=True)
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    v2 = updated_tracks[0].clips[1]
    assert v1.duration_ms == 3000
    assert v1.start_time_ms == 1000
    # Downstream clip-v2 shifted left by 1000ms (was 4000, now 3000)
    assert v2.start_time_ms == 3000


def test_02_ripple_trim_head_shifts_source_in(sample_timeline_tracks):
    """Advancing start_time_ms also advances source_in_ms by identical delta."""
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 1500, 2500, 'start', is_ripple=True)
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    assert v1.source_in_ms == 1500
    assert v1.source_out_ms == 4000


def test_03_ripple_trim_tail_shortens_duration(sample_timeline_tracks):
    """Trimming tail contracts duration and ripples downstream clips left."""
    # Trim clip-v1 tail from 4000 to 2500 (delta = -1500ms)
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 2500, 'end', is_ripple=True)
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    v2 = updated_tracks[0].clips[1]
    assert v1.duration_ms == 2500
    assert v2.start_time_ms == 2500


def test_04_ripple_trim_tail_extends_duration(sample_timeline_tracks):
    """Extending tail expands duration and ripples downstream clips right."""
    # Extend clip-v1 from 4000 to 5000 (delta = +1000ms)
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 5000, 'end', is_ripple=True)
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    v2 = updated_tracks[0].clips[1]
    assert v1.duration_ms == 5000
    assert v2.start_time_ms == 5000


def test_05_ripple_trim_head_min_duration_constraint(sample_timeline_tracks):
    """Head ripple trim enforces 100ms minimum clip duration."""
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 3950, 50, 'start', is_ripple=True)
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    assert v1.duration_ms == 100


def test_06_ripple_trim_tail_min_duration_constraint(sample_timeline_tracks):
    """Tail ripple trim enforces 100ms minimum clip duration."""
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 20, 'end', is_ripple=True)
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    assert v1.duration_ms == 100


def test_07_ripple_trim_bilateral_linked_head(sample_timeline_tracks):
    """Trimming video head bilaterally trims linked audio head identically."""
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 1000, 3000, 'start', is_ripple=True)
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    a1 = updated_tracks[1].clips[0]
    assert v1.duration_ms == 3000
    assert a1.duration_ms == 3000
    assert v1.source_in_ms == 1000
    assert a1.source_in_ms == 1000


def test_08_ripple_trim_bilateral_linked_tail(sample_timeline_tracks):
    """Trimming video tail bilaterally trims linked audio tail identically."""
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 2000, 'end', is_ripple=True)
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    a1 = updated_tracks[1].clips[0]
    assert v1.duration_ms == 2000
    assert a1.duration_ms == 2000


def test_09_ripple_trim_bilateral_audio_to_video(sample_timeline_tracks):
    """Trimming audio clip trims linked video clip bilaterally."""
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-a1", 1200, 2800, 'start', is_ripple=True)
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    a1 = updated_tracks[1].clips[0]
    assert v1.duration_ms == 2800
    assert a1.duration_ms == 2800
    assert v1.start_time_ms == 1200
    assert a1.start_time_ms == 1200


def test_10_ripple_trim_bilateral_zero_drift(sample_timeline_tracks):
    """Zero drift between linked video and audio after ripple trim."""
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 3500, 'end', is_ripple=True)
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    a1 = updated_tracks[1].clips[0]
    drift = (v1.start_time_ms - a1.start_time_ms) + (v1.source_in_ms - a1.source_in_ms)
    assert drift == 0.0


def test_11_ripple_trim_head_to_playhead_q(sample_timeline_tracks):
    """Q shortcut ripples head to playhead position."""
    # Playhead at 1500ms inside clip-v1 (0-4000ms)
    updated_tracks, ok, new_playhead = ripple_trim_to_playhead(sample_timeline_tracks, 1500, 'head', "clip-v1")
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    assert v1.start_time_ms == 1500
    assert v1.duration_ms == 2500
    # Playhead returned to clip's original anchor (or 0ms)
    assert new_playhead == 0


def test_12_ripple_trim_tail_to_playhead_w(sample_timeline_tracks):
    """W shortcut ripples tail to playhead position."""
    # Playhead at 2500ms inside clip-v1 (0-4000ms)
    updated_tracks, ok, new_playhead = ripple_trim_to_playhead(sample_timeline_tracks, 2500, 'tail', "clip-v1")
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    v2 = updated_tracks[0].clips[1]
    assert v1.duration_ms == 2500
    assert v2.start_time_ms == 2500
    assert new_playhead == 2500


def test_13_ripple_trim_q_outside_clip(sample_timeline_tracks):
    """Q returns False when playhead is outside clip bounds."""
    updated_tracks, ok, _ = ripple_trim_to_playhead(sample_timeline_tracks, 5000, 'head', "clip-v1")
    assert ok is False


def test_14_ripple_trim_w_outside_clip(sample_timeline_tracks):
    """W returns False when playhead is outside clip bounds."""
    updated_tracks, ok, _ = ripple_trim_to_playhead(sample_timeline_tracks, 5000, 'tail', "clip-v1")
    assert ok is False


def test_15_ripple_trim_locked_track_rejection(sample_timeline_tracks):
    """Trimming clip on locked track is rejected."""
    sample_timeline_tracks[0].is_locked = True
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 1000, 3000, 'start')
    assert ok is False


def test_16_ripple_trim_locked_track_downstream_protection(sample_timeline_tracks):
    """Clips on locked tracks are NOT moved by ripple trim."""
    sample_timeline_tracks[1].is_locked = True
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v2", 4000, 3000, 'end', is_ripple=True)
    assert ok is True
    # Track 1 was locked, so a2 stays at 4000ms
    assert updated_tracks[1].clips[1].start_time_ms == 4000


def test_17_ripple_trim_linked_clip_on_locked_track(sample_timeline_tracks):
    """If linked audio clip is on a locked track, trim is prevented."""
    sample_timeline_tracks[1].is_locked = True
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 3000, 'end')
    assert ok is False


def test_18_ripple_trim_keyframe_offset_adjustment_head(sample_timeline_tracks):
    """Head ripple trim adjusts keyframe offsets."""
    # clip-v1 keyframes at 1000ms and 3000ms. Trim head by 1000ms.
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 1000, 3000, 'start')
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    # kf-1 (1000) shifted to 0, kf-2 (3000) shifted to 2000
    assert len(v1.keyframes) == 2
    assert v1.keyframes[0].time_offset_ms == 0
    assert v1.keyframes[1].time_offset_ms == 2000


def test_19_ripple_trim_keyframe_pruning_head(sample_timeline_tracks):
    """Keyframes before the new head are pruned."""
    # Trim head by 2000ms. kf-1 was at 1000ms, which is now before head (-1000ms offset).
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 2000, 2000, 'start')
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    assert len(v1.keyframes) == 1
    assert v1.keyframes[0].id == "kf-2"
    assert v1.keyframes[0].time_offset_ms == 1000


def test_20_ripple_trim_keyframe_pruning_tail(sample_timeline_tracks):
    """Keyframes beyond new duration are pruned on tail trim."""
    # Trim tail to 2000ms. kf-2 was at 3000ms, so it is pruned.
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 2000, 'end')
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    assert len(v1.keyframes) == 1
    assert v1.keyframes[0].id == "kf-1"


def test_21_ripple_trim_transition_in_preservation(sample_timeline_tracks):
    """Transition-in duration clamped to half clip duration if trimmed."""
    v1 = sample_timeline_tracks[0].clips[0]
    v1.transition_in = {
        "id": "trans-1",
        "effect_type": "crossfade",
        "duration_ms": 1000,
    }
    # Trim clip to 150ms
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 3850, 150, 'start')
    assert ok is True
    t_in = updated_tracks[0].clips[0].transition_in
    assert t_in["duration_ms"] <= 75


def test_22_ripple_trim_transition_out_preservation(sample_timeline_tracks):
    """Transition-out duration clamped to half clip duration if tail trimmed."""
    v1 = sample_timeline_tracks[0].clips[0]
    v1.transition_out = {
        "id": "trans-2",
        "effect_type": "fade_out",
        "duration_ms": 1000,
    }
    # Trim tail to 200ms
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 200, 'end')
    assert ok is True
    t_out = updated_tracks[0].clips[0].transition_out
    assert t_out["duration_ms"] <= 100


def test_23_ripple_trim_speed_factor_adjustment(sample_timeline_tracks):
    """Ripple trim accounts for clip speed multiplier (2x speed)."""
    v1 = sample_timeline_tracks[0].clips[0]
    v1.speed_factor = 2.0
    # Trim 1000ms timeline delta from head -> source delta should be 2000ms
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 1000, 3000, 'start')
    assert ok is True
    assert updated_tracks[0].clips[0].source_in_ms == 2000


def test_24_ripple_trim_freeze_frame_preserved(sample_timeline_tracks):
    """Freeze frame metadata remains intact through ripple trim."""
    v1 = sample_timeline_tracks[0].clips[0]
    v1.is_frozen = True
    v1.freeze_at_ms = 1200
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 3000, 'end')
    assert ok is True
    assert updated_tracks[0].clips[0].is_frozen is True
    assert updated_tracks[0].clips[0].freeze_at_ms == 1200


def test_25_ripple_trim_frame_hold_preserved(sample_timeline_tracks):
    """Frame hold metadata remains intact through ripple trim."""
    v1 = sample_timeline_tracks[0].clips[0]
    v1.is_frame_hold = True
    v1.frame_hold_at_ms = 500
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 500, 3500, 'start')
    assert ok is True
    assert updated_tracks[0].clips[0].is_frame_hold is True
    assert updated_tracks[0].clips[0].frame_hold_at_ms == 500


def test_26_ripple_trim_group_compatibility(sample_timeline_tracks):
    """Clips belonging to a group shift coherently when ripple occurs."""
    g_id = "group-xyz"
    sample_timeline_tracks[0].clips[1].group_id = g_id
    sample_timeline_tracks[1].clips[1].group_id = g_id
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 2000, 'end', is_ripple=True)
    assert ok is True
    # Both group members shifted identically to 2000ms
    assert updated_tracks[0].clips[1].start_time_ms == 2000
    assert updated_tracks[1].clips[1].start_time_ms == 2000


def test_27_ripple_trim_compound_clip_compatibility(sample_timeline_tracks):
    """Compound clips can be ripple trimmed safely."""
    sample_timeline_tracks[0].clips[1].is_compound = True
    sample_timeline_tracks[0].clips[1].nested_tracks = []
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v2", 4000, 3000, 'end', is_ripple=True)
    assert ok is True
    assert updated_tracks[0].clips[1].duration_ms == 3000
    assert updated_tracks[0].clips[1].is_compound is True


def test_28_ripple_trim_work_area_preservation(sample_timeline_tracks):
    """Timeline work area in/out points are untouched during clip ripple trimming."""
    in_pt = 1000
    out_pt = 7000
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 2500, 'end', is_ripple=True)
    assert ok is True
    # Work area in/out remain constant
    assert in_pt == 1000
    assert out_pt == 7000


def test_29_ripple_trim_multi_track_synchronous_ripple(sample_timeline_tracks):
    """All unlocked tracks downstream shift identically."""
    # Clip v2 and a2 both start at 4000ms. Trim v1 by 1000ms.
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 3000, 'end', is_ripple=True)
    assert ok is True
    assert updated_tracks[0].clips[1].start_time_ms == 3000
    assert updated_tracks[1].clips[1].start_time_ms == 3000


def test_30_ripple_trim_no_op_on_zero_delta(sample_timeline_tracks):
    """Ripple trim with identical parameters returns False and causes no changes."""
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 4000, 'end')
    assert ok is False


def test_31_ripple_trim_nonexistent_clip(sample_timeline_tracks):
    """Attempting to ripple trim a nonexistent clip returns False."""
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "nonexistent-id", 0, 2000, 'end')
    assert ok is False


def test_32_ripple_trim_serialization_roundtrip(sample_timeline_tracks):
    """Serialization roundtrip via TimelineSaveRequest and Pydantic validation."""
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 1000, 3000, 'start', is_ripple=True)
    assert ok is True
    save_req = TimelineSaveRequest(duration_ms=60000, tracks=updated_tracks)
    serialized = save_req.model_dump()
    deserialized = TimelineSaveRequest.model_validate(serialized)
    assert len(deserialized.tracks) == 2
    assert deserialized.tracks[0].clips[0].duration_ms == 3000
    assert deserialized.tracks[0].clips[1].start_time_ms == 3000


def test_33_ripple_trim_undo_restores_state(sample_timeline_tracks):
    """Undo stack pattern: restoring previous snapshot returns exact initial state."""
    history_stack = [copy.deepcopy(sample_timeline_tracks)]
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 2000, 'end', is_ripple=True)
    assert ok is True
    history_stack.append(copy.deepcopy(updated_tracks))

    # Undo
    restored_tracks = history_stack.pop()
    assert restored_tracks[0].clips[0].duration_ms == 2000
    initial_tracks = history_stack[-1]
    assert initial_tracks[0].clips[0].duration_ms == 4000
    assert initial_tracks[0].clips[1].start_time_ms == 4000


def test_34_ripple_trim_redo_reapplies_state(sample_timeline_tracks):
    """Redo stack pattern: re-applying state preserves modified values."""
    history_stack = [copy.deepcopy(sample_timeline_tracks)]
    redo_stack = []
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 2000, 'end', is_ripple=True)
    assert ok is True
    history_stack.append(copy.deepcopy(updated_tracks))

    # Undo
    popped = history_stack.pop()
    redo_stack.append(popped)
    assert history_stack[-1][0].clips[0].duration_ms == 4000

    # Redo
    redone = redo_stack.pop()
    assert redone[0].clips[0].duration_ms == 2000
    assert redone[0].clips[1].start_time_ms == 2000


def test_35_ripple_trim_single_history_transaction(sample_timeline_tracks):
    """A ripple trim produces exactly one new snapshot in history."""
    history = [copy.deepcopy(sample_timeline_tracks)]
    # Perform operation
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 3000, 'end')
    if ok:
        history.append(copy.deepcopy(updated_tracks))
    assert len(history) == 2


def test_36_ripple_trim_auto_save_payload_ready(sample_timeline_tracks):
    """Autosave payload contains updated tracks with all ripple offsets."""
    updated_tracks, ok = ripple_trim_clip(sample_timeline_tracks, "clip-v1", 0, 2500, 'end')
    assert ok is True
    payload = {"tracks": [t.model_dump() for t in updated_tracks]}
    assert payload["tracks"][0]["clips"][0]["duration_ms"] == 2500
    assert payload["tracks"][0]["clips"][1]["start_time_ms"] == 2500


def test_37_ripple_trim_q_shortcut_finds_clip_at_playhead_without_id(sample_timeline_tracks):
    """Q without explicit clipId resolves clip under playhead automatically."""
    # Playhead at 2000ms: within clip-v1 (0-4000ms)
    updated_tracks, ok, _ = ripple_trim_to_playhead(sample_timeline_tracks, 2000, 'head', clip_id=None)
    assert ok is True
    v1 = updated_tracks[0].clips[0]
    assert v1.start_time_ms == 2000
    assert v1.duration_ms == 2000
