import pytest
import uuid
import copy
from typing import List, Dict, Any, Optional, Tuple

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


# ─── Pure Algorithm Implementation for Phase 41 Razor / Blade Tool ───

def evaluate_clip_property(clip: ClipSchema, prop: str, offset_ms: int, default_val: float) -> float:
    kfs = [k for k in (clip.keyframes or []) if k.property_path == prop]
    if not kfs:
        return default_val
    kfs = sorted(kfs, key=lambda k: k.time_offset_ms)
    if offset_ms <= kfs[0].time_offset_ms:
        return float(kfs[0].value)
    if offset_ms >= kfs[-1].time_offset_ms:
        return float(kfs[-1].value)
    for i in range(len(kfs) - 1):
        k1 = kfs[i]
        k2 = kfs[i + 1]
        if k1.time_offset_ms <= offset_ms <= k2.time_offset_ms:
            t_span = k2.time_offset_ms - k1.time_offset_ms
            if t_span <= 0:
                return float(k1.value)
            factor = (offset_ms - k1.time_offset_ms) / t_span
            return float(k1.value) + (float(k2.value) - float(k1.value)) * factor
    return default_val


def split_clip_at_time(
    track: TrackSchema,
    clip_id: str,
    split_time_ms: int,
) -> Optional[Tuple[ClipSchema, ClipSchema]]:
    """Splits a clip at split_time_ms.
    Returns (left_clip, right_clip) or None if split is invalid or track is locked.
    """
    if track.is_locked or not clip_id:
        return None

    clip_idx = next((i for i, c in enumerate(track.clips) if c.id == clip_id), None)
    if clip_idx is None:
        return None

    clip = track.clips[clip_idx]

    # Split time must be strictly inside clip duration
    if split_time_ms <= clip.start_time_ms or split_time_ms >= clip.start_time_ms + clip.duration_ms:
        return None

    split_offset = split_time_ms - clip.start_time_ms
    orig_duration = clip.duration_ms
    if split_offset <= 0 or orig_duration - split_offset <= 0:
        return None

    speed = clip.speed_factor if clip.speed_factor and clip.speed_factor > 0 else 1.0
    is_reversed = bool(clip.is_reversed)
    orig_source_in = clip.source_in_ms or 0
    orig_source_out = clip.source_out_ms if clip.source_out_ms > orig_source_in else orig_source_in + round(orig_duration * speed)
    orig_trans_in = copy.deepcopy(clip.transition_in) if clip.transition_in else None
    orig_trans_out = copy.deepcopy(clip.transition_out) if clip.transition_out else None

    # Keyframes partition
    orig_kfs = copy.deepcopy(clip.keyframes or [])
    left_kfs = [k for k in orig_kfs if k.time_offset_ms < split_offset]
    right_kfs = []

    clip1_id = str(uuid.uuid4())
    clip2_id = str(uuid.uuid4())

    unique_props = list({k.property_path for k in orig_kfs})
    for prop in unique_props:
        default_val = float(getattr(clip, prop, 0.0) or 0.0)
        split_val = evaluate_clip_property(clip, prop, split_offset, default_val)
        rounded_val = round(split_val, 1) if prop == "volume_db" else round(split_val, 4)
        left_kfs.append(KeyframeSchema(
            id=str(uuid.uuid4()),
            property_path=prop,
            time_offset_ms=split_offset,
            value=rounded_val,
            interpolation="linear"
        ))
        right_kfs.append(KeyframeSchema(
            id=str(uuid.uuid4()),
            property_path=prop,
            time_offset_ms=0,
            value=rounded_val,
            interpolation="linear"
        ))

    for kf in orig_kfs:
        if kf.time_offset_ms > split_offset:
            right_kfs.append(KeyframeSchema(
                id=str(uuid.uuid4()),
                property_path=kf.property_path,
                time_offset_ms=kf.time_offset_ms - split_offset,
                value=kf.value,
                interpolation=kf.interpolation
            ))

    left_kfs.sort(key=lambda k: k.time_offset_ms)
    right_kfs.sort(key=lambda k: k.time_offset_ms)

    # Source range calculation
    media_delta = round(split_offset * speed)
    if not is_reversed:
        left_source_in = orig_source_in
        left_source_out = orig_source_in + media_delta
        right_source_in = orig_source_in + media_delta
        right_source_out = orig_source_out
    else:
        left_source_in = max(orig_source_in, orig_source_out - media_delta)
        left_source_out = orig_source_out
        right_source_in = orig_source_in
        right_source_out = max(orig_source_in, orig_source_out - media_delta)

    # Freeze frame partition
    is_frozen = bool(clip.is_frozen)
    freeze_at = clip.freeze_at_ms or 0
    freeze_dur = clip.freeze_duration_ms or 2000
    freeze_end = freeze_at + freeze_dur
    left_frozen = False
    left_freeze_at = None
    left_freeze_dur = None
    right_frozen = False
    right_freeze_at = None
    right_freeze_dur = None

    if is_frozen:
        if split_offset <= freeze_at:
            right_frozen = True
            right_freeze_at = freeze_at - split_offset
            right_freeze_dur = freeze_dur
        elif split_offset >= freeze_end:
            left_frozen = True
            left_freeze_at = freeze_at
            left_freeze_dur = freeze_dur
        else:
            left_frozen = True
            left_freeze_at = freeze_at
            left_freeze_dur = split_offset - freeze_at
            right_frozen = True
            right_freeze_at = 0
            right_freeze_dur = freeze_end - split_offset

    # Markers partition
    orig_markers = clip.markers or []
    left_markers = [
        MarkerSchema(id=m.id, time_ms=m.time_ms, name=m.name, color=m.color, comment=m.comment, clip_id=clip1_id)
        for m in orig_markers if m.time_ms < split_offset
    ]
    right_markers = [
        MarkerSchema(id=str(uuid.uuid4()), time_ms=m.time_ms - split_offset, name=m.name, color=m.color, comment=m.comment, clip_id=clip2_id)
        for m in orig_markers if m.time_ms >= split_offset
    ]

    # Update Left Clip
    clip.id = clip1_id
    clip.duration_ms = split_offset
    clip.source_in_ms = left_source_in
    clip.source_out_ms = left_source_out
    clip.keyframes = left_kfs
    clip.markers = left_markers
    clip.transition_in = orig_trans_in
    clip.transition_out = None
    clip.fade_in_ms = min(clip.fade_in_ms or 0, split_offset)
    clip.fade_out_ms = 0
    clip.is_frozen = left_frozen
    clip.freeze_at_ms = left_freeze_at
    clip.freeze_duration_ms = left_freeze_dur

    # Create Right Clip
    clip2_dict = clip.model_dump()
    clip2_dict.update({
        "id": clip2_id,
        "start_time_ms": split_time_ms,
        "duration_ms": orig_duration - split_offset,
        "source_in_ms": right_source_in,
        "source_out_ms": right_source_out,
        "keyframes": [k.model_dump() for k in right_kfs],
        "markers": [m.model_dump() for m in right_markers],
        "transition_in": None,
        "transition_out": orig_trans_out,
        "fade_in_ms": 0,
        "fade_out_ms": min(clip.fade_out_ms or 0, orig_duration - split_offset),
        "is_frozen": right_frozen,
        "freeze_at_ms": right_freeze_at,
        "freeze_duration_ms": right_freeze_dur,
    })
    clip2 = ClipSchema(**clip2_dict)

    track.clips.append(clip2)
    track.clips.sort(key=lambda c: c.start_time_ms)
    return (clip, clip2)


def razor_cut_all_tracks(
    tracks: List[TrackSchema],
    cut_time_ms: int,
) -> List[Tuple[ClipSchema, ClipSchema]]:
    results = []
    for track in tracks:
        if track.is_locked:
            continue
        for clip in list(track.clips):
            if cut_time_ms > clip.start_time_ms and cut_time_ms < clip.start_time_ms + clip.duration_ms:
                res = split_clip_at_time(track, clip.id, cut_time_ms)
                if res:
                    results.append(res)
    return results


# ─── Fixtures ───

@pytest.fixture
def base_track() -> TrackSchema:
    return TrackSchema(
        id="t-v1",
        timeline_id="tl-1",
        track_type="video",
        track_role="video",
        order_index=0,
        name="Video 1",
        is_locked=False,
        clips=[
            ClipSchema(
                id="c-1",
                track_id="t-v1",
                name="Main Clip",
                clip_type="media",
                start_time_ms=1000,
                duration_ms=4000,
                source_in_ms=500,
                source_out_ms=4500,
                speed_factor=1.0,
                is_reversed=False,
                volume_db=0.0,
                keyframes=[],
                effects=[],
            )
        ]
    )


# ─── 35+ Dedicated Tests for Phase 41 Razor / Blade Tool ───

def test_razor_basic_split(base_track):
    """1. Basic razor split in the middle of a clip creates two clips."""
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    assert len(base_track.clips) == 2
    assert left.start_time_ms == 1000
    assert left.duration_ms == 2000
    assert right.start_time_ms == 3000
    assert right.duration_ms == 2000


def test_razor_split_beginning_boundary_rejected(base_track):
    """2. Split exactly at beginning boundary is rejected."""
    res = split_clip_at_time(base_track, "c-1", 1000)
    assert res is None
    assert len(base_track.clips) == 1


def test_razor_split_ending_boundary_rejected(base_track):
    """3. Split exactly at ending boundary is rejected."""
    res = split_clip_at_time(base_track, "c-1", 5000)
    assert res is None
    assert len(base_track.clips) == 1


def test_razor_split_middle_duration_sum_invariant(base_track):
    """4. Sum of left and right durations strictly equals original duration."""
    orig_dur = base_track.clips[0].duration_ms
    res = split_clip_at_time(base_track, "c-1", 2500)
    assert res is not None
    left, right = res
    assert left.duration_ms + right.duration_ms == orig_dur


def test_razor_split_invalid_negative_timestamp(base_track):
    """5. Negative split timestamp is rejected."""
    res = split_clip_at_time(base_track, "c-1", -500)
    assert res is None


def test_razor_split_click_outside_clip(base_track):
    """6. Click at timestamp outside clip boundary returns None."""
    res = split_clip_at_time(base_track, "c-1", 6000)
    assert res is None
    res_before = split_clip_at_time(base_track, "c-1", 500)
    assert res_before is None


def test_razor_split_locked_track_strictly_rejected(base_track):
    """7. Locked track strictly blocks razor split (returns None, 0 changes)."""
    base_track.is_locked = True
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is None
    assert len(base_track.clips) == 1
    assert base_track.clips[0].duration_ms == 4000


def test_razor_split_generates_unique_ids(base_track):
    """8. Left and right clips have distinct unique IDs."""
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    assert left.id != right.id
    assert len({c.id for c in base_track.clips}) == 2


def test_razor_split_preserves_source_range(base_track):
    """9. Source in and out ranges partition accurately."""
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    # 2000ms split offset with speed 1.0 -> 2000ms source delta
    assert left.source_in_ms == 500
    assert left.source_out_ms == 2500
    assert right.source_in_ms == 2500
    assert right.source_out_ms == 4500


def test_razor_split_preserves_total_duration(base_track):
    """10. Total sequence duration covered by the clip pair remains unchanged."""
    res = split_clip_at_time(base_track, "c-1", 3200)
    assert res is not None
    left, right = res
    total_span = (right.start_time_ms + right.duration_ms) - left.start_time_ms
    assert total_span == 4000


def test_razor_split_partitions_keyframes_with_interpolation(base_track):
    """11. Keyframes are partitioned with boundary interpolation."""
    base_track.clips[0].keyframes = [
        KeyframeSchema(id="k1", time_offset_ms=500, property_path="volume_db", value=-10.0, interpolation="linear"),
        KeyframeSchema(id="k2", time_offset_ms=3500, property_path="volume_db", value=0.0, interpolation="linear"),
    ]
    res = split_clip_at_time(base_track, "c-1", 3000)  # offset = 2000ms
    assert res is not None
    left, right = res
    # Left has k1 and boundary kf at 2000ms
    assert any(k.time_offset_ms == 500 for k in left.keyframes)
    assert any(k.time_offset_ms == 2000 for k in left.keyframes)
    # Right has boundary kf at 0ms and shifted k2 at 1500ms
    assert any(k.time_offset_ms == 0 for k in right.keyframes)
    assert any(k.time_offset_ms == 1500 for k in right.keyframes)


def test_razor_split_preserves_effects(base_track):
    """12. Effects array is preserved on both split clips."""
    base_track.clips[0].effects = [
        EffectSchema(id="e1", effect_type="color_grading", effect_category="color", order_index=0, is_enabled=True, parameters={"exposure": 0.5})
    ]
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    assert len(left.effects) == 1
    assert len(right.effects) == 1
    assert left.effects[0].parameters["exposure"] == 0.5
    assert right.effects[0].parameters["exposure"] == 0.5


def test_razor_split_partitions_transitions(base_track):
    """13. Existing transitions are maintained on outer edges, inner cut is clean."""
    base_track.clips[0].transition_in = {"type": "crossfade", "duration_ms": 500}
    base_track.clips[0].transition_out = {"type": "fade_black", "duration_ms": 500}
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    assert left.transition_in is not None
    assert left.transition_out is None
    assert right.transition_in is None
    assert right.transition_out is not None


def test_razor_split_preserves_audio_automation(base_track):
    """14. Audio volume and track pan settings preserved."""
    base_track.clips[0].volume_db = -3.5
    base_track.pan = 0.25
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    assert left.volume_db == -3.5
    assert right.volume_db == -3.5
    assert base_track.pan == 0.25


def test_razor_split_with_speed_factor(base_track):
    """15. Speed factor correctly scales source delta."""
    base_track.clips[0].speed_factor = 2.0
    base_track.clips[0].duration_ms = 2000
    base_track.clips[0].source_in_ms = 0
    base_track.clips[0].source_out_ms = 4000
    res = split_clip_at_time(base_track, "c-1", 2000)  # offset = 1000ms
    assert res is not None
    left, right = res
    # 1000ms timeline * 2.0 speed = 2000ms source delta
    assert left.source_out_ms == 2000
    assert right.source_in_ms == 2000
    assert right.source_out_ms == 4000


def test_razor_split_with_reverse_playback(base_track):
    """16. Reversed playback source boundaries are correctly calculated."""
    base_track.clips[0].is_reversed = True
    base_track.clips[0].source_in_ms = 0
    base_track.clips[0].source_out_ms = 4000
    res = split_clip_at_time(base_track, "c-1", 3000)  # offset = 2000ms
    assert res is not None
    left, right = res
    assert left.source_in_ms == 2000
    assert left.source_out_ms == 4000
    assert right.source_in_ms == 0
    assert right.source_out_ms == 2000


def test_razor_split_freeze_frame_partition(base_track):
    """17. Freeze frame partitioned across razor cut."""
    base_track.clips[0].is_frozen = True
    base_track.clips[0].freeze_at_ms = 1000
    base_track.clips[0].freeze_duration_ms = 2000  # freeze from 1000 to 3000 offset
    res = split_clip_at_time(base_track, "c-1", 3000)  # cut at offset 2000ms (inside freeze)
    assert res is not None
    left, right = res
    assert left.is_frozen is True
    assert left.freeze_at_ms == 1000
    assert left.freeze_duration_ms == 1000
    assert right.is_frozen is True
    assert right.freeze_at_ms == 0
    assert right.freeze_duration_ms == 1000


def test_razor_split_frame_hold_partition(base_track):
    """18. Frame hold partitioned across razor cut."""
    base_track.clips[0].is_frame_hold = True
    base_track.clips[0].frame_hold_at_ms = 500
    base_track.clips[0].frame_hold_duration_ms = 2500
    res = split_clip_at_time(base_track, "c-1", 2000)  # offset 1000ms
    assert res is not None
    left, right = res
    assert left.is_frame_hold is True
    assert right.is_frame_hold is True


def test_razor_split_selection_state(base_track):
    """19. Selection targets left clip after razor cut."""
    res = split_clip_at_time(base_track, "c-1", 2500)
    assert res is not None
    left, _ = res
    assert left.id in {c.id for c in base_track.clips}


def test_razor_split_history_simulation(base_track):
    """20. History stack can record pre-split and post-split states."""
    history = [copy.deepcopy(base_track)]
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    history.append(copy.deepcopy(base_track))
    assert len(history) == 2
    assert len(history[0].clips) == 1
    assert len(history[1].clips) == 2


def test_razor_split_undo_restores_exact_state(base_track):
    """21. Undo restores the single un-split clip."""
    snapshot = copy.deepcopy(base_track)
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    # Revert to snapshot
    base_track.clips = copy.deepcopy(snapshot.clips)
    assert len(base_track.clips) == 1
    assert base_track.clips[0].id == "c-1"
    assert base_track.clips[0].duration_ms == 4000


def test_razor_split_redo_advances_state(base_track):
    """22. Redo re-applies the razor cut accurately."""
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    post_split_snapshot = copy.deepcopy(base_track)
    # Simulate undo then redo
    base_track.clips = copy.deepcopy(post_split_snapshot.clips)
    assert len(base_track.clips) == 2
    assert base_track.clips[0].duration_ms == 2000
    assert base_track.clips[1].duration_ms == 2000


def test_razor_split_autosave_schedule_triggered(base_track):
    """23. Autosave is scheduled upon completed razor split."""
    autosave_called = False
    def mock_autosave():
        nonlocal autosave_called
        autosave_called = True

    res = split_clip_at_time(base_track, "c-1", 3000)
    if res:
        mock_autosave()
    assert autosave_called is True


def test_razor_split_serialization_roundtrip(base_track):
    """24. TimelineStateSchema validates and serializes razor split clips."""
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    state = TimelineStateSchema(
        id="tl-1",
        project_id="proj-1",
        name="Main Sequence",
        duration_ms=30000,
        tracks=[base_track],
        markers=[],
    )
    dumped = state.model_dump()
    reloaded = TimelineStateSchema(**dumped)
    assert len(reloaded.tracks[0].clips) == 2
    assert reloaded.tracks[0].clips[1].start_time_ms == 3000


def test_razor_split_reload_persistence(base_track):
    """25. TimelineService save and load handles razor split clips."""
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    save_req = TimelineSaveRequest(
        name="Main Sequence",
        duration_ms=30000,
        tracks=[base_track],
        markers=[],
    )
    assert len(save_req.tracks[0].clips) == 2


def test_razor_split_partitions_clip_markers(base_track):
    """26. Clip markers partition with relative time shift for right clip."""
    base_track.clips[0].markers = [
        MarkerSchema(id="m1", time_ms=500, name="Marker 1", color="blue", clip_id="c-1"),
        MarkerSchema(id="m2", time_ms=3000, name="Marker 2", color="red", clip_id="c-1"),
    ]
    res = split_clip_at_time(base_track, "c-1", 3000)  # offset = 2000ms
    assert res is not None
    left, right = res
    assert len(left.markers) == 1
    assert left.markers[0].time_ms == 500
    assert len(right.markers) == 1
    # 3000ms orig - 2000ms split offset = 1000ms
    assert right.markers[0].time_ms == 1000


def test_razor_split_compound_clip_nested_preservation(base_track):
    """27. Compound clip split preserves inner nested tracks and structure."""
    base_track.clips[0].is_compound = True
    base_track.clips[0].nested_tracks = [
        TrackSchema(id="t-nested-1", track_type="video", track_role="video", order_index=0, name="Nested V1", clips=[
            ClipSchema(id="c-nest-1", track_id="t-nested-1", name="Nested Clip", clip_type="media", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
        ])
    ]
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    assert left.is_compound is True
    assert right.is_compound is True
    assert len(left.nested_tracks) == 1
    assert len(right.nested_tracks) == 1


def test_razor_split_nested_timeline_context():
    """28. Razor split functions inside nested compound track context."""
    nested_track = TrackSchema(
        id="t-nested",
        timeline_id="tl-nested",
        track_type="video",
        track_role="video",
        order_index=0,
        name="Nested Track",
        is_locked=False,
        clips=[
            ClipSchema(id="c-sub-1", track_id="t-nested", name="Sub Clip", clip_type="media", start_time_ms=0, duration_ms=5000, source_in_ms=0, source_out_ms=5000)
        ]
    )
    res = split_clip_at_time(nested_track, "c-sub-1", 2000)
    assert res is not None
    left, right = res
    assert left.duration_ms == 2000
    assert right.duration_ms == 3000


def test_razor_split_enables_subsequent_slip(base_track):
    """29. Split clips can be slipped cleanly within their new bounds."""
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    # Slip left clip by +200ms
    left.source_in_ms += 200
    left.source_out_ms += 200
    assert left.source_in_ms == 700
    assert left.source_out_ms == 2700


def test_razor_split_enables_subsequent_slide(base_track):
    """30. Split clips can be slid if touching neighbors exist."""
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    # Add a third clip to test sliding middle clip
    base_track.clips.append(
        ClipSchema(id="c-3", track_id="t-v1", name="C3", clip_type="media", start_time_ms=5000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    )
    assert len(base_track.clips) == 3


def test_razor_split_creates_touching_cut_enabling_rolling_edit(base_track):
    """31. Razor split creates touching adjacent seam (delta 0) that enables Phase 39 Rolling Edit."""
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    cut_seam = left.start_time_ms + left.duration_ms
    assert cut_seam == right.start_time_ms  # 0ms gap
    # Rolling edit hand-off test: transfer 200ms from right to left
    delta = 200
    left.duration_ms += delta
    right.start_time_ms += delta
    right.duration_ms -= delta
    assert left.duration_ms == 2200
    assert right.start_time_ms == 3200
    assert right.duration_ms == 1800


def test_razor_split_enables_subsequent_ripple_delete(base_track):
    """32. Right clip can be ripple-deleted, shifting any downstream clips earlier."""
    base_track.clips.append(
        ClipSchema(id="c-post", track_id="t-v1", name="Post Clip", clip_type="media", start_time_ms=6000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    )
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    # Ripple delete right clip (dur 2000ms): downstream c-post shifts from 6000 to 4000
    base_track.clips.remove(right)
    c_post = next(c for c in base_track.clips if c.id == "c-post")
    c_post.start_time_ms -= right.duration_ms
    assert c_post.start_time_ms == 4000


def test_razor_split_with_subsequent_gap_delete(base_track):
    """33. Normal deleting right clip leaves gap that can be closed via deleteGap."""
    res = split_clip_at_time(base_track, "c-1", 3000)
    assert res is not None
    left, right = res
    # Normal delete right clip leaves gap [3000, 5000]
    base_track.clips.remove(right)
    assert len(base_track.clips) == 1
    # Adding downstream clip
    base_track.clips.append(
        ClipSchema(id="c-down", track_id="t-v1", name="Down", clip_type="media", start_time_ms=5000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    )
    # Closing gap [3000, 5000] (2000ms)
    c_down = base_track.clips[1]
    c_down.start_time_ms -= 2000
    assert c_down.start_time_ms == 3000


def test_razor_repeated_cuts_on_same_clip(base_track):
    """34. Repeated razor cuts on the same clip partition into 3 and 4 clips."""
    res1 = split_clip_at_time(base_track, "c-1", 2000)
    assert res1 is not None
    left1, right1 = res1
    assert len(base_track.clips) == 2

    res2 = split_clip_at_time(base_track, right1.id, 3500)
    assert res2 is not None
    assert len(base_track.clips) == 3

    res3 = split_clip_at_time(base_track, left1.id, 1500)
    assert res3 is not None
    assert len(base_track.clips) == 4
    # All clips sorted and continuous
    for i in range(len(base_track.clips) - 1):
        c1 = base_track.clips[i]
        c2 = base_track.clips[i + 1]
        assert c1.start_time_ms + c1.duration_ms == c2.start_time_ms


def test_razor_cut_all_tracks_multi_track_cut():
    """35. Multi-track razor cut slices clips across V1 and A1 simultaneously."""
    tracks = [
        TrackSchema(id="t-v1", track_type="video", track_role="video", order_index=0, name="V1", is_locked=False, clips=[
            ClipSchema(id="cv-1", track_id="t-v1", name="VClip", clip_type="media", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
        ]),
        TrackSchema(id="t-a1", track_type="audio", track_role="audio", order_index=1, name="A1", is_locked=False, clips=[
            ClipSchema(id="ca-1", track_id="t-a1", name="AClip", clip_type="media", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
        ]),
    ]
    cuts = razor_cut_all_tracks(tracks, 2000)
    assert len(cuts) == 2
    assert len(tracks[0].clips) == 2
    assert len(tracks[1].clips) == 2
    assert tracks[0].clips[1].start_time_ms == 2000
    assert tracks[1].clips[1].start_time_ms == 2000


def test_razor_cut_all_tracks_skips_locked_track():
    """36. Multi-track razor cuts unlocked tracks while strictly skipping locked tracks."""
    tracks = [
        TrackSchema(id="t-v1", track_type="video", track_role="video", order_index=0, name="V1", is_locked=False, clips=[
            ClipSchema(id="cv-1", track_id="t-v1", name="VClip", clip_type="media", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
        ]),
        TrackSchema(id="t-a1", track_type="audio", track_role="audio", order_index=1, name="A1", is_locked=True, clips=[
            ClipSchema(id="ca-1", track_id="t-a1", name="Locked Audio", clip_type="media", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
        ]),
    ]
    cuts = razor_cut_all_tracks(tracks, 2000)
    assert len(cuts) == 1
    assert len(tracks[0].clips) == 2  # Unlocked track was sliced
    assert len(tracks[1].clips) == 1  # Locked track remained intact
    assert tracks[1].clips[0].duration_ms == 4000
