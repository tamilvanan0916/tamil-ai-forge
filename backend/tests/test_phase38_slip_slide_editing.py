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


# ─── Pure Algorithm Implementations for Backend Verification ───

def slip_clip(
    track: TrackSchema,
    clip_id: str,
    delta_ms: int,
) -> bool:
    """Slips source in/out window while strictly preserving timeline start and duration."""
    if track.is_locked or delta_ms == 0:
        return False

    clip = next((c for c in track.clips if c.id == clip_id), None)
    if not clip:
        return False

    speed = clip.speed_factor if clip.speed_factor and clip.speed_factor > 0 else 1.0
    is_reversed = bool(clip.is_reversed)
    delta_media = int(round(delta_ms * speed))

    window_size = clip.source_out_ms - clip.source_in_ms
    if window_size <= 0:
        return False

    if not is_reversed:
        new_source_in = clip.source_in_ms + delta_media
        new_source_out = new_source_in + window_size
    else:
        new_source_in = clip.source_in_ms - delta_media
        new_source_out = new_source_in + window_size

    # Clamping at lower bound: source_in >= 0
    if new_source_in < 0:
        new_source_in = 0
        new_source_out = new_source_in + window_size

    # Clamping at upper bound if metadata contains source duration
    max_source_dur = int((clip.metadata_info or {}).get("source_duration_ms") or (clip.metadata_info or {}).get("duration_ms") or 0)
    if max_source_dur > 0 and new_source_out > max_source_dur:
        new_source_out = max_source_dur
        new_source_in = max(0, new_source_out - window_size)

    if new_source_in == clip.source_in_ms and new_source_out == clip.source_out_ms:
        return False

    clip.source_in_ms = new_source_in
    clip.source_out_ms = new_source_out
    return True


def slide_clip(
    track: TrackSchema,
    clip_id: str,
    delta_ms: int,
    all_tracks: Optional[List[TrackSchema]] = None,
    snap_enabled: bool = False,
    playhead_ms: int = 0,
    timeline_markers: Optional[List[int]] = None,
    zoom_level: int = 25,
) -> bool:
    """Slides clip along timeline while adjusting neighboring clips."""
    if track.is_locked or delta_ms == 0:
        return False

    clips_sorted = sorted(track.clips, key=lambda c: c.start_time_ms)
    clip_idx = next((i for i, c in enumerate(clips_sorted) if c.id == clip_id), -1)
    if clip_idx == -1:
        return False

    clip = clips_sorted[clip_idx]
    orig_start = clip.start_time_ms
    orig_end = orig_start + clip.duration_ms

    pred_clip = clips_sorted[clip_idx - 1] if clip_idx > 0 else None
    succ_clip = clips_sorted[clip_idx + 1] if clip_idx < len(clips_sorted) - 1 else None

    is_pred_adjacent = abs((pred_clip.start_time_ms + pred_clip.duration_ms) - orig_start) <= 5 if pred_clip else False
    is_succ_adjacent = abs(orig_end - succ_clip.start_time_ms) <= 5 if succ_clip else False

    min_delta = -orig_start
    max_delta = 999999999

    if pred_clip:
        if is_pred_adjacent:
            min_delta = max(min_delta, -(pred_clip.duration_ms - 100))
        else:
            pred_end = pred_clip.start_time_ms + pred_clip.duration_ms
            min_delta = max(min_delta, pred_end - orig_start)

    if succ_clip:
        if is_succ_adjacent:
            max_delta = min(max_delta, succ_clip.duration_ms - 100)
        else:
            max_delta = min(max_delta, succ_clip.start_time_ms - orig_end)

    # Media boundary limit for adjacent expanding neighbors
    if pred_clip and is_pred_adjacent:
        pred_speed = pred_clip.speed_factor if pred_clip.speed_factor and pred_clip.speed_factor > 0 else 1.0
        pred_max_dur = int((pred_clip.metadata_info or {}).get("source_duration_ms") or (pred_clip.metadata_info or {}).get("duration_ms") or 0)
        if pred_max_dur > 0 and not pred_clip.is_reversed:
            max_pred_expand = int((pred_max_dur - pred_clip.source_out_ms) / pred_speed)
            if max_pred_expand > 0:
                max_delta = min(max_delta, max_pred_expand)

    if succ_clip and is_succ_adjacent:
        succ_speed = succ_clip.speed_factor if succ_clip.speed_factor and succ_clip.speed_factor > 0 else 1.0
        if not succ_clip.is_reversed:
            max_succ_expand = int(succ_clip.source_in_ms / succ_speed)
            if max_succ_expand >= 0:
                min_delta = max(min_delta, -max_succ_expand)

    requested_delta = delta_ms

    if snap_enabled:
        snap_threshold = max(60, int(1000 / zoom_level))
        cand_start = orig_start + requested_delta
        cand_end = cand_start + clip.duration_ms

        snap_points = [0, playhead_ms]
        if timeline_markers:
            snap_points.extend(timeline_markers)
        if all_tracks:
            for tr in all_tracks:
                if tr.is_locked:
                    continue
                for c in tr.clips:
                    if c.id == clip.id:
                        continue
                    snap_points.append(c.start_time_ms)
                    snap_points.append(c.start_time_ms + c.duration_ms)

        best_dist = snap_threshold + 1
        snap_correction = 0
        for sp in snap_points:
            d_start = abs(cand_start - sp)
            if d_start < best_dist:
                best_dist = d_start
                snap_correction = sp - cand_start
            d_end = abs(cand_end - sp)
            if d_end < best_dist:
                best_dist = d_end
                snap_correction = sp - cand_end

        if best_dist <= snap_threshold:
            requested_delta += snap_correction

    effective_delta = max(min_delta, min(max_delta, requested_delta))
    if effective_delta == 0:
        return False

    clip.start_time_ms += effective_delta

    if pred_clip and is_pred_adjacent:
        pred_speed = pred_clip.speed_factor if pred_clip.speed_factor and pred_clip.speed_factor > 0 else 1.0
        pred_clip.duration_ms += effective_delta
        if not pred_clip.is_reversed:
            pred_clip.source_out_ms += int(round(effective_delta * pred_speed))
        else:
            pred_clip.source_in_ms -= int(round(effective_delta * pred_speed))

    if succ_clip and is_succ_adjacent:
        succ_speed = succ_clip.speed_factor if succ_clip.speed_factor and succ_clip.speed_factor > 0 else 1.0
        succ_clip.start_time_ms += effective_delta
        succ_clip.duration_ms -= effective_delta
        if not succ_clip.is_reversed:
            succ_clip.source_in_ms += int(round(effective_delta * succ_speed))
        else:
            succ_clip.source_out_ms -= int(round(effective_delta * succ_speed))

    track.clips.sort(key=lambda c: c.start_time_ms)
    return True


# ─── Unit Test Suite: Slip Editing (14 Tests) ───

def test_slip_clip_forward_updates_source_window_only():
    clip = ClipSchema(id="c1", name="Clip 1", start_time_ms=1000, duration_ms=2000, source_in_ms=500, source_out_ms=2500)
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    ok = slip_clip(track, "c1", 300)
    assert ok is True
    assert clip.source_in_ms == 800
    assert clip.source_out_ms == 2800
    # Strict preservation
    assert clip.start_time_ms == 1000
    assert clip.duration_ms == 2000
    assert clip.start_time_ms + clip.duration_ms == 3000


def test_slip_clip_backward_updates_source_window_only():
    clip = ClipSchema(id="c1", name="Clip 1", start_time_ms=2000, duration_ms=1500, source_in_ms=1000, source_out_ms=2500)
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    ok = slip_clip(track, "c1", -400)
    assert ok is True
    assert clip.source_in_ms == 600
    assert clip.source_out_ms == 2100
    assert clip.start_time_ms == 2000
    assert clip.duration_ms == 1500


def test_slip_clip_clamped_at_zero():
    clip = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=300, source_out_ms=2300)
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    ok = slip_clip(track, "c1", -600)
    assert ok is True
    assert clip.source_in_ms == 0
    assert clip.source_out_ms == 2000  # Window size strictly maintained (2000ms)
    assert clip.start_time_ms == 0
    assert clip.duration_ms == 2000


def test_slip_clip_clamped_at_max_duration():
    clip = ClipSchema(
        id="c1", name="Clip 1", start_time_ms=1000, duration_ms=2000,
        source_in_ms=3000, source_out_ms=5000,
        metadata_info={"source_duration_ms": 6000}
    )
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    ok = slip_clip(track, "c1", 1500)
    assert ok is True
    assert clip.source_out_ms == 6000  # Clamped at max source duration
    assert clip.source_in_ms == 4000  # Window size maintained (2000ms)
    assert clip.start_time_ms == 1000
    assert clip.duration_ms == 2000


def test_slip_clip_zero_delta_noop():
    clip = ClipSchema(id="c1", name="Clip 1", start_time_ms=1000, duration_ms=2000, source_in_ms=500, source_out_ms=2500)
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    ok = slip_clip(track, "c1", 0)
    assert ok is False
    assert clip.source_in_ms == 500
    assert clip.source_out_ms == 2500


def test_slip_clip_already_at_bound_noop():
    clip = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    ok = slip_clip(track, "c1", -100)
    assert ok is False
    assert clip.source_in_ms == 0
    assert clip.source_out_ms == 2000


def test_slip_clip_preserves_track_and_clip_id():
    clip = ClipSchema(id="test-uuid-123", track_id="track-uuid-456", name="Clip 1", start_time_ms=1000, duration_ms=2000, source_in_ms=200, source_out_ms=2200)
    track = TrackSchema(id="track-uuid-456", name="Video 1", clips=[clip])

    slip_clip(track, "test-uuid-123", 150)
    assert clip.id == "test-uuid-123"
    assert clip.track_id == "track-uuid-456"


def test_slip_clip_preserves_keyframes():
    kf = KeyframeSchema(property_path="opacity", time_offset_ms=500, value=0.8)
    clip = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=100, source_out_ms=2100, keyframes=[kf])
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    slip_clip(track, "c1", 200)
    assert len(clip.keyframes) == 1
    assert clip.keyframes[0].time_offset_ms == 500
    assert clip.keyframes[0].value == 0.8


def test_slip_clip_preserves_markers():
    m = MarkerSchema(id="m1", time_ms=300, name="Beat", color="yellow")
    clip = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=100, source_out_ms=2100, markers=[m])
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    slip_clip(track, "c1", 300)
    assert len(clip.markers) == 1
    assert clip.markers[0].time_ms == 300
    assert clip.markers[0].color == "yellow"


def test_slip_clip_preserves_effects():
    ef = EffectSchema(effect_type="blur", effect_category="vfx", parameters={"radius": 10})
    clip = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=100, source_out_ms=2100, effects=[ef])
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    slip_clip(track, "c1", 100)
    assert len(clip.effects) == 1
    assert clip.effects[0].parameters["radius"] == 10


def test_slip_clip_preserves_transitions():
    trans_in = {"type": "crossfade", "duration_ms": 500}
    trans_out = {"type": "fade_black", "duration_ms": 400}
    clip = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=100, source_out_ms=2100, transition_in=trans_in, transition_out=trans_out)
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    slip_clip(track, "c1", 250)
    assert clip.transition_in == trans_in
    assert clip.transition_out == trans_out


def test_slip_clip_with_speed_factor():
    clip = ClipSchema(id="c1", name="Speed Clip", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=2000, speed_factor=2.0)
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    # Slipped by 500ms at 2x speed -> delta media is 1000ms
    ok = slip_clip(track, "c1", 500)
    assert ok is True
    assert clip.source_in_ms == 1000
    assert clip.source_out_ms == 3000
    assert clip.duration_ms == 1000


def test_slip_clip_with_reversed_playback():
    clip = ClipSchema(id="c1", name="Rev Clip", start_time_ms=0, duration_ms=1000, source_in_ms=1500, source_out_ms=2500, is_reversed=True)
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    # Reversed: forward timeline delta moves source backward
    ok = slip_clip(track, "c1", 500)
    assert ok is True
    assert clip.source_in_ms == 1000
    assert clip.source_out_ms == 2000


def test_slip_clip_blocked_on_locked_track():
    clip = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=500, source_out_ms=2500)
    track = TrackSchema(id="t1", name="Locked Track", is_locked=True, clips=[clip])

    ok = slip_clip(track, "c1", 200)
    assert ok is False
    assert clip.source_in_ms == 500
    assert clip.source_out_ms == 2500


# ─── Unit Test Suite: Slide Editing (13 Tests) ───

def test_slide_clip_moves_timeline_start_preserving_duration_and_source():
    clip = ClipSchema(id="c1", name="Solo Clip", start_time_ms=1000, duration_ms=2000, source_in_ms=300, source_out_ms=2300)
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    ok = slide_clip(track, "c1", 500)
    assert ok is True
    assert clip.start_time_ms == 1500
    # Own duration and source window strictly preserved
    assert clip.duration_ms == 2000
    assert clip.source_in_ms == 300
    assert clip.source_out_ms == 2300


def test_slide_clip_adjusts_adjacent_predecessor_sliding_right():
    pred = ClipSchema(id="c0", name="Pred", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    mid = ClipSchema(id="c1", name="Mid", start_time_ms=1000, duration_ms=1000, source_in_ms=500, source_out_ms=1500)
    succ = ClipSchema(id="c2", name="Succ", start_time_ms=2000, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    track = TrackSchema(id="t1", name="Video 1", clips=[pred, mid, succ])

    # Slide mid right by 200ms
    ok = slide_clip(track, "c1", 200)
    assert ok is True
    assert mid.start_time_ms == 1200
    assert mid.duration_ms == 1000
    assert mid.source_in_ms == 500
    assert mid.source_out_ms == 1500

    # Pred expands: duration increases, source_out increases
    assert pred.duration_ms == 1200
    assert pred.source_out_ms == 1200

    # Succ contracts: start moves right, duration decreases, source_in increases
    assert succ.start_time_ms == 2200
    assert succ.duration_ms == 800
    assert succ.source_in_ms == 200


def test_slide_clip_adjusts_adjacent_neighbors_sliding_left():
    pred = ClipSchema(id="c0", name="Pred", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    mid = ClipSchema(id="c1", name="Mid", start_time_ms=1000, duration_ms=1000, source_in_ms=500, source_out_ms=1500)
    succ = ClipSchema(id="c2", name="Succ", start_time_ms=2000, duration_ms=1000, source_in_ms=200, source_out_ms=1200)
    track = TrackSchema(id="t1", name="Video 1", clips=[pred, mid, succ])

    # Slide mid left by 200ms
    ok = slide_clip(track, "c1", -200)
    assert ok is True
    assert mid.start_time_ms == 800
    assert mid.duration_ms == 1000

    # Pred shrinks
    assert pred.duration_ms == 800
    assert pred.source_out_ms == 800

    # Succ expands
    assert succ.start_time_ms == 1800
    assert succ.duration_ms == 1200
    assert succ.source_in_ms == 0


def test_slide_clip_bounded_by_predecessor_minimum_duration():
    pred = ClipSchema(id="c0", name="Pred", start_time_ms=0, duration_ms=300, source_in_ms=0, source_out_ms=300)
    mid = ClipSchema(id="c1", name="Mid", start_time_ms=300, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    track = TrackSchema(id="t1", name="Video 1", clips=[pred, mid])

    # Sliding left by 500ms is clamped so pred duration does not drop below 100ms
    # Maximum shrink is 200ms
    ok = slide_clip(track, "c1", -500)
    assert ok is True
    assert mid.start_time_ms == 100
    assert pred.duration_ms == 100
    assert pred.source_out_ms == 100


def test_slide_clip_bounded_by_successor_minimum_duration():
    mid = ClipSchema(id="c1", name="Mid", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    succ = ClipSchema(id="c2", name="Succ", start_time_ms=1000, duration_ms=250, source_in_ms=0, source_out_ms=250)
    track = TrackSchema(id="t1", name="Video 1", clips=[mid, succ])

    # Sliding right by 400ms is clamped so succ duration does not drop below 100ms
    # Maximum shrink is 150ms
    ok = slide_clip(track, "c1", 400)
    assert ok is True
    assert mid.start_time_ms == 150
    assert succ.start_time_ms == 1150
    assert succ.duration_ms == 100


def test_slide_clip_non_adjacent_gap_predecessor():
    pred = ClipSchema(id="c0", name="Pred", start_time_ms=0, duration_ms=500)  # ends at 500
    mid = ClipSchema(id="c1", name="Mid", start_time_ms=1000, duration_ms=1000)  # gap of 500ms
    track = TrackSchema(id="t1", name="Video 1", clips=[pred, mid])

    # Sliding left by 200ms moves mid within gap without resizing pred
    ok = slide_clip(track, "c1", -200)
    assert ok is True
    assert mid.start_time_ms == 800
    assert pred.duration_ms == 500  # Untouched


def test_slide_clip_non_adjacent_gap_successor():
    mid = ClipSchema(id="c1", name="Mid", start_time_ms=0, duration_ms=1000)  # ends at 1000
    succ = ClipSchema(id="c2", name="Succ", start_time_ms=1500, duration_ms=500)  # gap of 500ms
    track = TrackSchema(id="t1", name="Video 1", clips=[mid, succ])

    # Sliding right by 200ms moves mid within gap without resizing succ
    ok = slide_clip(track, "c1", 200)
    assert ok is True
    assert mid.start_time_ms == 200
    assert succ.start_time_ms == 1500  # Untouched
    assert succ.duration_ms == 500


def test_slide_clip_bounded_at_timeline_start():
    mid = ClipSchema(id="c1", name="First Clip", start_time_ms=300, duration_ms=1000)
    track = TrackSchema(id="t1", name="Video 1", clips=[mid])

    # Cannot slide before 0ms
    ok = slide_clip(track, "c1", -600)
    assert ok is True
    assert mid.start_time_ms == 0


def test_slide_clip_snapping_to_playhead():
    clip = ClipSchema(id="c1", name="Clip", start_time_ms=1000, duration_ms=1000)
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    # Playhead at 1500ms. Slide candidate 1480ms is within snap threshold of 1500ms
    ok = slide_clip(track, "c1", 480, snap_enabled=True, playhead_ms=1500, zoom_level=25)
    assert ok is True
    assert clip.start_time_ms == 1500  # Snapped exactly to playhead


def test_slide_clip_snapping_to_marker():
    clip = ClipSchema(id="c1", name="Clip", start_time_ms=1000, duration_ms=1000)
    track = TrackSchema(id="t1", name="Video 1", clips=[clip])

    # Sequence marker at 2500ms. Slide candidate end at 2480ms (delta +480) snaps to 2500ms
    ok = slide_clip(track, "c1", 480, snap_enabled=True, timeline_markers=[2500], zoom_level=25)
    assert ok is True
    assert clip.start_time_ms + clip.duration_ms == 2500
    assert clip.start_time_ms == 1500


def test_slide_clip_snapping_to_other_track_clips():
    tr1_clip = ClipSchema(id="c1", name="Track 1 Clip", start_time_ms=0, duration_ms=1000)
    tr2_clip = ClipSchema(id="c2", name="Track 2 Clip", start_time_ms=2500, duration_ms=800)
    t1 = TrackSchema(id="t1", name="V1", clips=[tr1_clip])
    t2 = TrackSchema(id="t2", name="V2", clips=[tr2_clip])

    # Sliding c2 left near c1's end (1000ms): candidate 1020ms snaps to 1000ms
    ok = slide_clip(t2, "c2", -1480, all_tracks=[t1, t2], snap_enabled=True, zoom_level=25)
    assert ok is True
    assert tr2_clip.start_time_ms == 1000


def test_slide_clip_blocked_on_locked_track():
    clip = ClipSchema(id="c1", name="Clip 1", start_time_ms=1000, duration_ms=1000)
    track = TrackSchema(id="t1", name="Locked", is_locked=True, clips=[clip])

    ok = slide_clip(track, "c1", 200)
    assert ok is False
    assert clip.start_time_ms == 1000


def test_slide_clip_preserves_keyframes_transitions_effects():
    kf = KeyframeSchema(property_path="rotation", time_offset_ms=200, value=45.0)
    ef = EffectSchema(effect_type="color_grading", effect_category="color", parameters={"contrast": 1.2})
    trans = {"type": "crossfade", "duration_ms": 300}
    clip = ClipSchema(
        id="c1", name="Rich Clip", start_time_ms=1000, duration_ms=2000,
        keyframes=[kf], effects=[ef], transition_in=trans
    )
    track = TrackSchema(id="t1", name="V1", clips=[clip])

    slide_clip(track, "c1", 300)
    assert clip.start_time_ms == 1300
    assert len(clip.keyframes) == 1
    assert clip.keyframes[0].value == 45.0
    assert len(clip.effects) == 1
    assert clip.effects[0].parameters["contrast"] == 1.2
    assert clip.transition_in == trans


# ─── Integration Test Suite: Compound Clips & Serialization (4 Tests) ───

def test_compound_clip_slip_and_slide_compatibility():
    nested_clip = ClipSchema(id="nc1", name="Nested Clip", start_time_ms=0, duration_ms=3000)
    nested_track = TrackSchema(id="nt1", name="Nested V1", clips=[nested_clip])

    compound_clip = ClipSchema(
        id="comp1", name="Compound 1", start_time_ms=1000, duration_ms=3000,
        source_in_ms=0, source_out_ms=3000, is_compound=True,
        nested_tracks=[nested_track]
    )
    track = TrackSchema(id="t1", name="Main V1", clips=[compound_clip])

    # 1. Slip compound clip
    ok_slip = slip_clip(track, "comp1", 500)
    assert ok_slip is True
    assert compound_clip.source_in_ms == 500
    assert compound_clip.source_out_ms == 3500
    assert compound_clip.start_time_ms == 1000
    assert compound_clip.duration_ms == 3000

    # 2. Slide compound clip
    ok_slide = slide_clip(track, "comp1", 400)
    assert ok_slide is True
    assert compound_clip.start_time_ms == 1400
    assert compound_clip.duration_ms == 3000


def test_slip_slide_serialization_roundtrip():
    clip = ClipSchema(
        id="clip-roundtrip", name="Roundtrip Clip",
        start_time_ms=1500, duration_ms=2500,
        source_in_ms=800, source_out_ms=3300,
        speed_factor=1.5,
        metadata_info={"source_duration_ms": 10000}
    )
    track = TrackSchema(id="tr-rt", name="V1", clips=[clip])

    # Simulate slip
    slip_clip(track, "clip-roundtrip", 400)
    # Simulate slide
    slide_clip(track, "clip-roundtrip", 200)

    # Build DB models and serialize
    tl_model = Timeline(id="tl-1", project_id="p-1", name="Main Seq", duration_ms=30000)
    tr_model = Track(id=track.id, timeline_id="tl-1", name=track.name, track_type="video", track_role="video", order_index=0)
    cl_model = Clip(
        id=clip.id, track_id=track.id, name=clip.name, clip_type="media",
        start_time_ms=clip.start_time_ms, duration_ms=clip.duration_ms,
        source_in_ms=clip.source_in_ms, source_out_ms=clip.source_out_ms,
        speed_factor=clip.speed_factor, metadata_info=clip.metadata_info
    )
    tr_model.clips = [cl_model]
    tl_model.tracks = [tr_model]

    serialized = TimelineService.serialize_timeline(tl_model)
    assert len(serialized["tracks"]) == 1
    s_clip = serialized["tracks"][0]["clips"][0]
    assert s_clip["id"] == "clip-roundtrip"
    assert s_clip["start_time_ms"] == 1700
    assert s_clip["duration_ms"] == 2500
    assert s_clip["source_in_ms"] == 1400  # 800 + 400 * 1.5 = 1400
    assert s_clip["source_out_ms"] == 3900


def test_slide_clip_timeline_duration_recalculation():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=20000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=20000, duration_ms=15000)
    track = TrackSchema(id="t1", name="V1", clips=[c1, c2])

    # Initial end: 35000ms
    assert c2.start_time_ms + c2.duration_ms == 35000

    # Slide c2 right by 5000ms (gap of 5000ms after c1)
    slide_clip(track, "c2", 5000)
    assert c2.start_time_ms == 25000
    new_end = c2.start_time_ms + c2.duration_ms
    assert new_end == 40000

    # Recalculated timeline duration
    new_timeline_dur = max(30000, new_end + 2000)
    assert new_timeline_dur == 42000


def test_clip_markers_slide_with_clip():
    m1 = MarkerSchema(id="m1", time_ms=400, name="Intro Cue", color="green")
    m2 = MarkerSchema(id="m2", time_ms=1200, name="Action Cue", color="red")
    clip = ClipSchema(id="c1", name="Narrative Clip", start_time_ms=2000, duration_ms=3000, markers=[m1, m2])
    track = TrackSchema(id="t1", name="V1", clips=[clip])

    slide_clip(track, "c1", 1000)
    assert clip.start_time_ms == 3000
    # Marker offsets within clip remain constant, absolute timeline positions shift accordingly
    assert clip.markers[0].time_ms == 400
    assert clip.start_time_ms + clip.markers[0].time_ms == 3400
    assert clip.markers[1].time_ms == 1200
    assert clip.start_time_ms + clip.markers[1].time_ms == 4200
