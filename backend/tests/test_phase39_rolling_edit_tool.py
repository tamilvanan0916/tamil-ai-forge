import pytest
import uuid
import copy
from typing import List, Dict, Any, Optional

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


# ─── Pure Algorithm Implementation for Phase 39 Rolling Edit Tool ───

def roll_edit(
    track: TrackSchema,
    pred_id: str,
    succ_id: str,
    delta_ms: int,
    snap_enabled: bool = False,
    snap_points: Optional[List[int]] = None,
) -> bool:
    """Moves the shared cut point between two touching adjacent clips on the same track.
    Predecessor A: duration += delta, source_out += delta * speed.
    Successor B: start += delta, duration -= delta, source_in += delta * speed.
    Total A+B duration and overall timeline duration remain strictly invariant.
    """
    if track.is_locked or not pred_id or not succ_id or delta_ms == 0:
        return False

    pred_clip = next((c for c in track.clips if c.id == pred_id), None)
    succ_clip = next((c for c in track.clips if c.id == succ_id), None)
    if not pred_clip or not succ_clip:
        return False

    orig_pred_end = pred_clip.start_time_ms + pred_clip.duration_ms
    is_touching = abs(orig_pred_end - succ_clip.start_time_ms) <= 5
    if not is_touching:
        return False

    pred_speed = pred_clip.speed_factor if pred_clip.speed_factor and pred_clip.speed_factor > 0 else 1.0
    succ_speed = succ_clip.speed_factor if succ_clip.speed_factor and succ_clip.speed_factor > 0 else 1.0

    # 1. Minimum duration limits (100ms)
    min_delta = -(pred_clip.duration_ms - 100)
    max_delta = succ_clip.duration_ms - 100

    # 2. Predecessor media boundary limits
    pred_info = pred_clip.metadata_info or {}
    pred_max_dur = int(pred_info.get("source_duration_ms") or pred_info.get("duration_ms") or 0)
    if not pred_clip.is_reversed:
        if pred_max_dur > 0:
            max_pred_expand = int((pred_max_dur - pred_clip.source_out_ms) // pred_speed)
            if max_pred_expand >= 0:
                max_delta = min(max_delta, max_pred_expand)
    else:
        max_pred_expand = int(pred_clip.source_in_ms // pred_speed)
        if max_pred_expand >= 0:
            max_delta = min(max_delta, max_pred_expand)

    # 3. Successor media boundary limits
    succ_info = succ_clip.metadata_info or {}
    succ_max_dur = int(succ_info.get("source_duration_ms") or succ_info.get("duration_ms") or 0)
    if not succ_clip.is_reversed:
        max_succ_expand = int(succ_clip.source_in_ms // succ_speed)
        if max_succ_expand >= 0:
            min_delta = max(min_delta, -max_succ_expand)
    else:
        if succ_max_dur > 0:
            max_succ_expand = int((succ_max_dur - succ_clip.source_out_ms) // succ_speed)
            if max_succ_expand >= 0:
                min_delta = max(min_delta, -max_succ_expand)

    if min_delta > max_delta:
        return False

    requested_delta = delta_ms

    # 4. Snapping evaluation
    if snap_enabled and snap_points:
        snap_threshold = 100
        candidate_cut = orig_pred_end + requested_delta
        best_dist = snap_threshold + 1
        snap_correction = 0
        for sp in snap_points:
            dist = abs(candidate_cut - sp)
            if dist < best_dist:
                best_dist = dist
                snap_correction = sp - candidate_cut
        if best_dist <= snap_threshold:
            requested_delta += snap_correction

    effective_delta = max(min_delta, min(max_delta, requested_delta))
    if effective_delta == 0:
        return False

    # 5. Mutate predecessor
    pred_clip.duration_ms += effective_delta
    if not pred_clip.is_reversed:
        pred_clip.source_out_ms += int(round(effective_delta * pred_speed))
    else:
        pred_clip.source_in_ms -= int(round(effective_delta * pred_speed))
    if pred_clip.fade_out_ms:
        pred_clip.fade_out_ms = min(pred_clip.fade_out_ms, pred_clip.duration_ms)

    # 6. Mutate successor
    succ_clip.start_time_ms += effective_delta
    succ_clip.duration_ms -= effective_delta
    if not succ_clip.is_reversed:
        succ_clip.source_in_ms += int(round(effective_delta * succ_speed))
    else:
        succ_clip.source_out_ms -= int(round(effective_delta * succ_speed))
    if succ_clip.fade_in_ms:
        succ_clip.fade_in_ms = min(succ_clip.fade_in_ms, succ_clip.duration_ms)

    # 7. Transition duration clamping
    if pred_clip.transition_out:
        t_dur = pred_clip.transition_out.get("duration_ms", 1000)
        pred_clip.transition_out["duration_ms"] = min(t_dur, pred_clip.duration_ms, succ_clip.duration_ms)
    if succ_clip.transition_in:
        t_dur = succ_clip.transition_in.get("duration_ms", 1000)
        succ_clip.transition_in["duration_ms"] = min(t_dur, pred_clip.duration_ms, succ_clip.duration_ms)

    track.clips.sort(key=lambda c: c.start_time_ms)
    return True


# ─── Test Suite: Phase 39 Rolling Edit Tool ───

def test_roll_edit_basic_move_right():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=3000, source_in_ms=1000, source_out_ms=4000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    ok = roll_edit(track, "c1", "c2", 500)
    assert ok is True
    # Cut moved from 2000ms to 2500ms
    assert c1.start_time_ms == 0
    assert c1.duration_ms == 2500
    assert c1.source_out_ms == 2500
    assert c2.start_time_ms == 2500
    assert c2.duration_ms == 2500
    assert c2.source_in_ms == 1500
    assert c2.source_out_ms == 4000


def test_roll_edit_basic_move_left():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=3000, source_in_ms=500, source_out_ms=3500)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=3000, duration_ms=2000, source_in_ms=1000, source_out_ms=3000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    ok = roll_edit(track, "c1", "c2", -400)
    assert ok is True
    # Cut moved from 3000ms to 2600ms
    assert c1.start_time_ms == 0
    assert c1.duration_ms == 2600
    assert c1.source_out_ms == 3100
    assert c2.start_time_ms == 2600
    assert c2.duration_ms == 2400
    assert c2.source_in_ms == 600
    assert c2.source_out_ms == 3000


def test_roll_edit_zero_delta_noop():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    ok = roll_edit(track, "c1", "c2", 0)
    assert ok is False
    assert c1.duration_ms == 2000
    assert c2.start_time_ms == 2000


def test_roll_edit_combined_duration_invariance():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=1000, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=5000, duration_ms=5000, source_in_ms=1000, source_out_ms=6000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    orig_total = c1.duration_ms + c2.duration_ms
    roll_edit(track, "c1", "c2", 800)
    new_total = c1.duration_ms + c2.duration_ms
    assert new_total == orig_total == 9000


def test_roll_edit_timeline_duration_invariance():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=3000, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
    c3 = ClipSchema(id="c3", name="Clip 3", start_time_ms=8000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2, c3])

    def calc_dur(t: TrackSchema):
        return max(c.start_time_ms + c.duration_ms for c in t.clips)

    assert calc_dur(track) == 10000
    roll_edit(track, "c1", "c2", 600)
    assert calc_dur(track) == 10000
    # Downstream c3 is completely untouched
    assert c3.start_time_ms == 8000
    assert c3.duration_ms == 2000


def test_roll_edit_stationary_predecessor_start_and_source_in():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=500, duration_ms=2000, source_in_ms=300, source_out_ms=2300)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2500, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    roll_edit(track, "c1", "c2", 300)
    assert c1.start_time_ms == 500
    assert c1.source_in_ms == 300


def test_roll_edit_stationary_successor_source_out():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=3000, source_in_ms=1000, source_out_ms=4000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    roll_edit(track, "c1", "c2", 400)
    assert c2.source_out_ms == 4000


def test_roll_edit_predecessor_min_duration_clamp():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=500, source_in_ms=0, source_out_ms=500)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=500, duration_ms=3000, source_in_ms=1000, source_out_ms=4000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    # Rolling left by -800ms would shrink c1 below 100ms
    ok = roll_edit(track, "c1", "c2", -800)
    assert ok is True
    # Clamped to -400ms (500 - 100)
    assert c1.duration_ms == 100
    assert c2.start_time_ms == 100
    assert c2.duration_ms == 3400


def test_roll_edit_successor_min_duration_clamp():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=3000, duration_ms=400, source_in_ms=0, source_out_ms=400)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    # Rolling right by +800ms would shrink c2 below 100ms
    ok = roll_edit(track, "c1", "c2", 800)
    assert ok is True
    # Clamped to +300ms (400 - 100)
    assert c2.duration_ms == 100
    assert c1.duration_ms == 3300
    assert c2.start_time_ms == 3300


def test_roll_edit_predecessor_source_tail_clamp():
    c1 = ClipSchema(
        id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000,
        source_in_ms=0, source_out_ms=2000, metadata_info={"source_duration_ms": 2300}
    )
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    # Rolling right by 1000ms is clamped by c1's media duration (2300 - 2000 = 300ms max expand)
    ok = roll_edit(track, "c1", "c2", 1000)
    assert ok is True
    assert c1.duration_ms == 2300
    assert c1.source_out_ms == 2300
    assert c2.start_time_ms == 2300
    assert c2.duration_ms == 2700


def test_roll_edit_successor_source_head_clamp():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=3000, source_in_ms=200, source_out_ms=3200)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    # Rolling left by -600ms is clamped because c2 source_in is 200ms (can only expand left by 200ms)
    ok = roll_edit(track, "c1", "c2", -600)
    assert ok is True
    assert c2.source_in_ms == 0
    assert c2.start_time_ms == 1800
    assert c2.duration_ms == 3200
    assert c1.duration_ms == 1800


def test_roll_edit_speed_scaled_clips():
    # c1 is 2.0x speed, c2 is 0.5x speed
    c1 = ClipSchema(id="c1", name="Fast Clip", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=4000, speed_factor=2.0)
    c2 = ClipSchema(id="c2", name="Slow Clip", start_time_ms=2000, duration_ms=3000, source_in_ms=1000, source_out_ms=2500, speed_factor=0.5)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    ok = roll_edit(track, "c1", "c2", 400)
    assert ok is True
    assert c1.duration_ms == 2400
    # 400ms timeline * 2.0 speed = 800ms media
    assert c1.source_out_ms == 4800
    assert c2.duration_ms == 2600
    assert c2.start_time_ms == 2400
    # 400ms timeline * 0.5 speed = 200ms media
    assert c2.source_in_ms == 1200


def test_roll_edit_reversed_clips():
    c1 = ClipSchema(id="c1", name="Rev 1", start_time_ms=0, duration_ms=2000, source_in_ms=1000, source_out_ms=3000, is_reversed=True)
    c2 = ClipSchema(id="c2", name="Rev 2", start_time_ms=2000, duration_ms=2000, source_in_ms=500, source_out_ms=2500, is_reversed=True)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    ok = roll_edit(track, "c1", "c2", 300)
    assert ok is True
    assert c1.duration_ms == 2300
    # For reversed predecessor, expanding tail pulls head backwards
    assert c1.source_in_ms == 700
    assert c2.start_time_ms == 2300
    assert c2.duration_ms == 1700
    # For reversed successor, shrinking head reduces tail
    assert c2.source_out_ms == 2200


def test_roll_edit_locked_track_rejection():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    track = TrackSchema(id="t1", name="V1", is_locked=True, clips=[c1, c2])

    ok = roll_edit(track, "c1", "c2", 300)
    assert ok is False
    assert c1.duration_ms == 2000
    assert c2.start_time_ms == 2000


def test_roll_edit_non_touching_clips_rejection():
    # Gap between c1 (ends at 2000) and c2 (starts at 3000)
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=3000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    ok = roll_edit(track, "c1", "c2", 200)
    assert ok is False
    assert c1.duration_ms == 2000
    assert c2.start_time_ms == 3000


def test_roll_edit_invalid_clip_ids():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    track = TrackSchema(id="t1", name="V1", clips=[c1])

    assert roll_edit(track, "c1", "c_missing", 200) is False
    assert roll_edit(track, "c_missing", "c1", 200) is False


def test_roll_edit_same_track_enforcement():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    track1 = TrackSchema(id="t1", name="V1", clips=[c1])

    # Rejection when successor is not in track1
    assert roll_edit(track1, "c1", "c2", 200) is False


def test_roll_edit_snapping_to_playhead():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=2000, source_in_ms=1000, source_out_ms=3000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    # Playhead at 2350ms. Requesting delta +320ms puts cut at 2320ms, which is within 100ms threshold of 2350ms
    ok = roll_edit(track, "c1", "c2", 320, snap_enabled=True, snap_points=[2350])
    assert ok is True
    # Snapped to 2350ms (+350ms delta)
    assert c1.duration_ms == 2350
    assert c2.start_time_ms == 2350
    assert c2.duration_ms == 1650


def test_roll_edit_snapping_to_sequence_markers():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=3000, duration_ms=3000, source_in_ms=1000, source_out_ms=4000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    marker_cue = 2800
    # Requesting -180ms puts cut at 2820ms, which snaps to 2800ms
    ok = roll_edit(track, "c1", "c2", -180, snap_enabled=True, snap_points=[marker_cue])
    assert ok is True
    assert c1.duration_ms == 2800
    assert c2.start_time_ms == 2800
    assert c2.duration_ms == 3200


def test_roll_edit_clip_markers_preservation():
    m1 = MarkerSchema(id="m1", time_ms=300, name="Beat A", color="cyan")
    m2 = MarkerSchema(id="m2", time_ms=500, name="Beat B", color="yellow")
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, markers=[m1])
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=2000, source_in_ms=500, source_out_ms=2500, markers=[m2])
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    roll_edit(track, "c1", "c2", 400)
    # Clip markers preserve their relative offsets
    assert c1.markers[0].time_ms == 300
    assert c2.markers[0].time_ms == 500
    # In absolute timeline terms, c2 marker shifted along with c2 start
    assert c2.start_time_ms + c2.markers[0].time_ms == 2400 + 500 == 2900


def test_roll_edit_keyframes_preservation():
    kf1 = KeyframeSchema(id="kf1", property_path="opacity", time_offset_ms=200, value=0.5, interpolation="linear")
    kf2 = KeyframeSchema(id="kf2", property_path="scale_x", time_offset_ms=400, value=1.2, interpolation="linear")
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, keyframes=[kf1])
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=2000, source_in_ms=500, source_out_ms=2500, keyframes=[kf2])
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    roll_edit(track, "c1", "c2", 300)
    assert len(c1.keyframes) == 1
    assert c1.keyframes[0].time_offset_ms == 200
    assert len(c2.keyframes) == 1
    assert c2.keyframes[0].time_offset_ms == 400


def test_roll_edit_transition_duration_clamping():
    c1 = ClipSchema(
        id="c1", name="Clip 1", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=1000,
        transition_out={"type": "crossfade", "duration_ms": 500, "from_clip_id": "c1", "to_clip_id": "c2"}
    )
    c2 = ClipSchema(
        id="c2", name="Clip 2", start_time_ms=1000, duration_ms=1000, source_in_ms=1000, source_out_ms=2000,
        transition_in={"type": "crossfade", "duration_ms": 500, "from_clip_id": "c1", "to_clip_id": "c2"}
    )
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    # Roll left so c1 shrinks to 200ms
    ok = roll_edit(track, "c1", "c2", -800)
    assert ok is True
    assert c1.duration_ms == 200
    # Transition duration clamped to c1's new duration (200ms)
    assert c1.transition_out["duration_ms"] == 200
    assert c2.transition_in["duration_ms"] == 200


def test_roll_edit_compound_clips_compatibility():
    child1 = ClipSchema(id="ch1", name="Child 1", start_time_ms=0, duration_ms=1500, source_in_ms=0, source_out_ms=1500)
    nested_track = TrackSchema(id="nt1", name="NV1", clips=[child1])
    compound = ClipSchema(
        id="comp1", name="Compound Master", start_time_ms=0, duration_ms=1500,
        source_in_ms=0, source_out_ms=1500, is_compound=True, nested_tracks=[nested_track]
    )
    c2 = ClipSchema(id="c2", name="Live Cut", start_time_ms=1500, duration_ms=2000, source_in_ms=500, source_out_ms=2500)
    track = TrackSchema(id="t1", name="V1", clips=[compound, c2])

    ok = roll_edit(track, "comp1", "c2", 300)
    assert ok is True
    assert compound.duration_ms == 1800
    assert compound.is_compound is True
    assert len(compound.nested_tracks) == 1
    assert c2.start_time_ms == 1800
    assert c2.duration_ms == 1700


def test_roll_edit_repeated_bidirectional_identity():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=1000, source_out_ms=3000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=2000, source_in_ms=1000, source_out_ms=3000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    # Move right 250ms
    roll_edit(track, "c1", "c2", 250)
    assert c1.duration_ms == 2250
    assert c2.start_time_ms == 2250

    # Move left 250ms (inverse)
    roll_edit(track, "c1", "c2", -250)
    assert c1.duration_ms == 2000
    assert c1.source_out_ms == 3000
    assert c2.start_time_ms == 2000
    assert c2.duration_ms == 2000
    assert c2.source_in_ms == 1000


def test_roll_edit_fade_in_fade_out_clamping():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=1000, fade_out_ms=400)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=1000, duration_ms=1000, source_in_ms=1000, source_out_ms=2000, fade_in_ms=400)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    # Shrink c1 to 200ms -> fade_out_ms clamped to 200ms
    roll_edit(track, "c1", "c2", -800)
    assert c1.duration_ms == 200
    assert c1.fade_out_ms == 200


def test_roll_edit_history_undo_simulation():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=2000, source_in_ms=1000, source_out_ms=3000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    history_stack = [copy.deepcopy(track)]
    roll_edit(track, "c1", "c2", 400)
    history_stack.append(copy.deepcopy(track))

    assert track.clips[0].duration_ms == 2400
    # Undo restores state from stack
    restored_track = history_stack[0]
    assert restored_track.clips[0].duration_ms == 2000
    assert restored_track.clips[1].start_time_ms == 2000


def test_roll_edit_history_redo_simulation():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=2000, source_in_ms=1000, source_out_ms=3000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    history_stack = [copy.deepcopy(track)]
    roll_edit(track, "c1", "c2", 400)
    history_stack.append(copy.deepcopy(track))

    # Undo
    track_undo = history_stack[0]
    # Redo
    track_redo = history_stack[1]
    assert track_redo.clips[0].duration_ms == 2400
    assert track_redo.clips[1].start_time_ms == 2400


def test_roll_edit_effects_preservation():
    eff1 = EffectSchema(effect_type="blur", effect_category="vfx", order_index=0, is_enabled=True, parameters={"radius": 5})
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, effects=[eff1])
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    roll_edit(track, "c1", "c2", 200)
    assert len(c1.effects) == 1
    assert c1.effects[0].effect_type == "blur"
    assert c1.effects[0].parameters["radius"] == 5


def test_roll_edit_audio_automation_preservation():
    kf_vol = KeyframeSchema(id="kf1", property_path="volume_db", time_offset_ms=100, value=-3.0, interpolation="linear")
    c1 = ClipSchema(id="c1", name="Audio A", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, volume_db=0.0, keyframes=[kf_vol])
    c2 = ClipSchema(id="c2", name="Audio B", start_time_ms=2000, duration_ms=2000, source_in_ms=500, source_out_ms=2500, volume_db=-6.0)
    track = TrackSchema(id="t1", name="A1", track_type="audio", track_role="music", clips=[c1, c2])

    ok = roll_edit(track, "c1", "c2", 300)
    assert ok is True
    assert c1.volume_db == 0.0
    assert c2.volume_db == -6.0
    assert c1.keyframes[0].value == -3.0


def test_roll_edit_timeline_serialization_roundtrip():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=3000, source_in_ms=1000, source_out_ms=4000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    roll_edit(track, "c1", "c2", 500)

    # Build DB models and serialize
    tl_model = Timeline(id="tl-roll", project_id="p-roll", name="Main Roll Seq", duration_ms=30000)
    tr_model = Track(id=track.id, timeline_id="tl-roll", name=track.name, track_type="video", track_role="video", order_index=0)
    cl1_model = Clip(
        id=c1.id, track_id=track.id, name=c1.name, clip_type="media",
        start_time_ms=c1.start_time_ms, duration_ms=c1.duration_ms,
        source_in_ms=c1.source_in_ms, source_out_ms=c1.source_out_ms
    )
    cl2_model = Clip(
        id=c2.id, track_id=track.id, name=c2.name, clip_type="media",
        start_time_ms=c2.start_time_ms, duration_ms=c2.duration_ms,
        source_in_ms=c2.source_in_ms, source_out_ms=c2.source_out_ms
    )
    tr_model.clips = [cl1_model, cl2_model]
    tl_model.tracks = [tr_model]

    serialized = TimelineService.serialize_timeline(tl_model)
    assert len(serialized["tracks"]) == 1
    s_c1 = serialized["tracks"][0]["clips"][0]
    s_c2 = serialized["tracks"][0]["clips"][1]
    assert s_c1["id"] == "c1"
    assert s_c1["duration_ms"] == 2500
    assert s_c1["source_out_ms"] == 2500
    assert s_c2["id"] == "c2"
    assert s_c2["start_time_ms"] == 2500
    assert s_c2["duration_ms"] == 2500
    assert s_c2["source_in_ms"] == 1500
