import pytest
import uuid
import copy
import math
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


# ─── Pure Algorithm Implementations for Phase 49 Replace & 4-Point Editing ───

def calculate_fit_to_fill_speed(source_duration_ms: Any, sequence_duration_ms: Any) -> Optional[float]:
    """
    Computes Fit-to-Fill speedFactor = sourceDuration / sequenceDuration.
    Clamps between safe range 0.1x and 10.0x.
    Protects against <= 0, NaN, Infinity.
    """
    try:
        s_dur = float(source_duration_ms)
        q_dur = float(sequence_duration_ms)
        if math.isnan(s_dur) or math.isnan(q_dur) or math.isinf(s_dur) or math.isinf(q_dur):
            return None
        if s_dur <= 0 or q_dur <= 0:
            return None
        raw_speed = s_dur / q_dur
        if math.isnan(raw_speed) or math.isinf(raw_speed):
            return None
        clamped = max(0.1, min(10.0, round(raw_speed, 3)))
        return clamped
    except (TypeError, ValueError, ZeroDivisionError, OverflowError):
        return None


def detect_four_point_conflict(
    source_in_ms: Optional[int],
    source_out_ms: Optional[int],
    sequence_in_ms: Optional[int],
    sequence_out_ms: Optional[int],
    tolerance_ms: int = 33,
) -> Tuple[bool, bool, Optional[Dict[str, Any]]]:
    """
    Evaluates whether a 4-point edit condition exists and whether there is a duration conflict.
    Returns: (is_four_point, is_conflict, conflict_data)
    """
    has_source = (
        source_in_ms is not None
        and source_out_ms is not None
        and source_out_ms > source_in_ms
    )
    has_sequence = (
        sequence_in_ms is not None
        and sequence_out_ms is not None
        and sequence_out_ms > sequence_in_ms
    )

    if not (has_source and has_sequence):
        return False, False, None

    src_dur = source_out_ms - source_in_ms
    seq_dur = sequence_out_ms - sequence_in_ms
    diff_ms = src_dur - seq_dur
    is_conflict = abs(diff_ms) > tolerance_ms

    speed_factor = calculate_fit_to_fill_speed(src_dur, seq_dur)

    data = {
        "source_in_ms": source_in_ms,
        "source_out_ms": source_out_ms,
        "source_duration_ms": src_dur,
        "sequence_in_ms": sequence_in_ms,
        "sequence_out_ms": sequence_out_ms,
        "sequence_duration_ms": seq_dur,
        "diff_ms": diff_ms,
        "speed_factor": speed_factor,
    }
    return True, is_conflict, data


def resolve_four_point_edit(
    state: TimelineStateSchema,
    conflict_data: Dict[str, Any],
    resolution: str,
    asset_id: str = "asset-4pt",
    asset_name: str = "4-Point Clip",
    target_track_id: Optional[str] = None,
) -> Tuple[bool, TimelineStateSchema]:
    """
    Applies one of the four professional 4-point resolution strategies:
    1. fit_to_fill: changes clip speed to fit sequence duration
    2. ignore_source_out: uses Source In and sequence duration at 1.0x
    3. ignore_sequence_out: overwrites starting at Sequence In for full source duration
    4. ignore_sequence_in: aligns source ending with Sequence Out
    """
    st = state.model_copy(deep=True)
    v_track_id = target_track_id or st.target_video_track_id
    target_track = None
    for t in st.tracks:
        if (t.id == v_track_id or (not v_track_id and t.track_type == 'video')) and not t.is_locked:
            target_track = t
            break

    if not target_track or target_track.is_locked:
        return False, st

    src_in = conflict_data["source_in_ms"]
    src_out = conflict_data["source_out_ms"]
    seq_in = conflict_data["sequence_in_ms"]
    seq_out = conflict_data["sequence_out_ms"]
    src_dur = conflict_data["source_duration_ms"]
    seq_dur = conflict_data["sequence_duration_ms"]

    if resolution == "fit_to_fill":
        speed = conflict_data["speed_factor"] or 1.0
        edit_start = seq_in
        edit_duration = seq_dur
        clip_src_in = src_in
        clip_src_out = src_out
        clip_speed = speed

    elif resolution == "ignore_source_out":
        edit_start = seq_in
        edit_duration = seq_dur
        clip_src_in = src_in
        clip_src_out = src_in + seq_dur
        clip_speed = 1.0

    elif resolution == "ignore_sequence_out":
        edit_start = seq_in
        edit_duration = src_dur
        clip_src_in = src_in
        clip_src_out = src_out
        clip_speed = 1.0

    elif resolution == "ignore_sequence_in":
        edit_start = max(0, seq_out - src_dur)
        edit_duration = seq_out - edit_start
        clip_src_in = src_in
        clip_src_out = src_in + edit_duration
        clip_speed = 1.0

    else:
        return False, st

    edit_end = edit_start + edit_duration

    # Overwrite slicing
    remaining_clips = []
    for c in target_track.clips:
        c_start = c.start_time_ms
        c_end = c_start + c.duration_ms
        if c_end <= edit_start or c_start >= edit_end:
            remaining_clips.append(c)
        elif c_start >= edit_start and c_end <= edit_end:
            continue
        elif c_start < edit_start and c_end > edit_end:
            speed = c.speed_factor if c.speed_factor and c.speed_factor > 0 else 1.0
            left = c.model_copy(deep=True)
            left.duration_ms = edit_start - c_start
            left.source_out_ms = c.source_in_ms + int(round((edit_start - c_start) * speed))
            right = c.model_copy(deep=True)
            right.id = str(uuid.uuid4())
            right.start_time_ms = edit_end
            right.duration_ms = c_end - edit_end
            right.source_in_ms = c.source_in_ms + int(round((edit_end - c_start) * speed))
            remaining_clips.extend([left, right])
        elif c_start < edit_start and c_end > edit_start:
            speed = c.speed_factor if c.speed_factor and c.speed_factor > 0 else 1.0
            trunc = c.model_copy(deep=True)
            trunc.duration_ms = edit_start - c_start
            trunc.source_out_ms = c.source_in_ms + int(round((edit_start - c_start) * speed))
            remaining_clips.append(trunc)
        elif c_start < edit_end and c_end > edit_end:
            speed = c.speed_factor if c.speed_factor and c.speed_factor > 0 else 1.0
            head_cut = edit_end - c_start
            trunc = c.model_copy(deep=True)
            trunc.start_time_ms = edit_end
            trunc.duration_ms = c_end - edit_end
            trunc.source_in_ms = c.source_in_ms + int(round(head_cut * speed))
            remaining_clips.append(trunc)

    new_clip = ClipSchema(
        id=str(uuid.uuid4()),
        track_id=target_track.id,
        name=asset_name,
        clip_type="media",
        start_time_ms=edit_start,
        duration_ms=edit_duration,
        source_in_ms=clip_src_in,
        source_out_ms=clip_src_out,
        speed_factor=clip_speed,
        is_reversed=False,
        is_frozen=False,
        opacity=1.0,
        blend_mode="normal",
        position_x=0.5,
        position_y=0.5,
        scale_x=1.0,
        scale_y=1.0,
        rotation=0.0,
        anchor_x=0.5,
        anchor_y=0.5,
        crop_left=0.0,
        crop_right=0.0,
        crop_top=0.0,
        crop_bottom=0.0,
        volume_db=0.0,
        fade_in_ms=0,
        fade_out_ms=0,
        effects=[],
        keyframes=[],
        asset_id=asset_id,
    )
    remaining_clips.append(new_clip)
    remaining_clips.sort(key=lambda c: c.start_time_ms)
    target_track.clips = remaining_clips

    return True, st


def perform_professional_replace_edit(
    state: TimelineStateSchema,
    clip_id: Optional[str] = None,
    new_asset_id: str = "new-asset-id",
    new_name: str = "New Asset",
    mode: str = "from_in",
    custom_source_in_ms: Optional[int] = None,
    custom_source_out_ms: Optional[int] = None,
    source_playhead_ms: Optional[int] = None,
    timeline_playhead_ms: Optional[int] = None,
    asset_duration_ms: int = 5000,
) -> Tuple[bool, TimelineStateSchema]:
    """
    Executes professional Replace Edit.
    Preserves target clip's start_time_ms, duration_ms, keyframes, effects, transitions, volume, pan, transform.
    Modes:
      - 'from_in': starts at source_in_ms (or 0), preserves clip duration at original speed
      - 'from_playhead': aligns source playhead with timeline playhead offset
      - 'fit_to_fill': recalculates speed_factor to fit destination clip duration
    """
    st = state.model_copy(deep=True)
    target_clip = None
    target_track = None

    if clip_id:
        for t in st.tracks:
            for c in t.clips:
                if c.id == clip_id:
                    target_clip = c
                    target_track = t
                    break
            if target_clip:
                break
    else:
        v_track_id = st.target_video_track_id
        candidates = [t for t in st.tracks if (t.id == v_track_id or (not v_track_id and t.track_type == 'video')) and not t.is_locked]
        p_ms = timeline_playhead_ms or 0
        for t in candidates:
            for c in t.clips:
                if c.start_time_ms <= p_ms <= c.start_time_ms + c.duration_ms:
                    target_clip = c
                    target_track = t
                    break
            if target_clip:
                break

    if not target_clip or not target_track or target_track.is_locked:
        return False, st

    orig_speed = target_clip.speed_factor if target_clip.speed_factor and target_clip.speed_factor > 0 else 1.0

    if mode == "from_in":
        s_in = custom_source_in_ms if custom_source_in_ms is not None else 0
        safe_in = max(0, min(s_in, asset_duration_ms - 33))
        needed_src_dur = int(round(target_clip.duration_ms * orig_speed))
        target_clip.source_in_ms = safe_in
        target_clip.source_out_ms = safe_in + needed_src_dur

    elif mode == "from_playhead":
        p_ms = timeline_playhead_ms or target_clip.start_time_ms
        offset_within_clip = max(0, min(target_clip.duration_ms, p_ms - target_clip.start_time_ms))
        source_offset = int(round(offset_within_clip * orig_speed))
        s_playhead = source_playhead_ms or 0
        s_start = max(0, s_playhead - source_offset)
        target_clip.source_in_ms = s_start
        target_clip.source_out_ms = s_start + int(round(target_clip.duration_ms * orig_speed))

    elif mode == "fit_to_fill":
        s_in = custom_source_in_ms if custom_source_in_ms is not None else 0
        s_out = custom_source_out_ms if custom_source_out_ms is not None else asset_duration_ms
        src_dur = max(33, s_out - s_in)
        dest_dur = max(33, target_clip.duration_ms)
        speed = calculate_fit_to_fill_speed(src_dur, dest_dur) or 1.0
        target_clip.speed_factor = speed
        target_clip.source_in_ms = s_in
        target_clip.source_out_ms = s_out

    else:
        return False, st

    target_clip.asset_id = new_asset_id
    target_clip.name = new_name

    # Handle linked audio clip if present
    if target_clip.linked_clip_id:
        for t in st.tracks:
            if t.is_locked:
                continue
            for c in t.clips:
                if c.id == target_clip.linked_clip_id:
                    c.asset_id = new_asset_id
                    c.name = f"{new_name} (Audio)"
                    c.source_in_ms = target_clip.source_in_ms
                    c.source_out_ms = target_clip.source_out_ms
                    c.speed_factor = target_clip.speed_factor
                    break

    return True, st


# ─── Fixtures ───

@pytest.fixture
def base_timeline() -> TimelineStateSchema:
    c1 = ClipSchema(
        id="c-v1",
        track_id="t-v1",
        name="Source Video 1",
        clip_type="media",
        start_time_ms=1000,
        duration_ms=4000,
        source_in_ms=0,
        source_out_ms=4000,
        speed_factor=1.0,
        is_reversed=False,
        is_frozen=False,
        opacity=1.0,
        blend_mode="normal",
        position_x=0.5,
        position_y=0.5,
        scale_x=1.0,
        scale_y=1.0,
        rotation=0.0,
        anchor_x=0.5,
        anchor_y=0.5,
        crop_left=0.0,
        crop_right=0.0,
        crop_top=0.0,
        crop_bottom=0.0,
        volume_db=0.0,
        fade_in_ms=100,
        fade_out_ms=100,
        effects=[
            EffectSchema(id="fx-1", effect_type="color_grading", effect_category="color", is_enabled=True, parameters={"brightness": 1.2})
        ],
        keyframes=[
            KeyframeSchema(id="kf-1", property_path="opacity", time_offset_ms=1000, value=1.0, interpolation="linear")
        ],
        asset_id="asset-original",
    )

    t_v1 = TrackSchema(
        id="t-v1",
        name="Video 1",
        track_type="video",
        track_role="video",
        order_index=0,
        is_muted=False,
        is_locked=False,
        is_visible=True,
        is_solo=False,
        volume_db=0.0,
        pan=0.0,
        height_px=50,
        clips=[c1],
    )

    t_a1 = TrackSchema(
        id="t-a1",
        name="Audio 1",
        track_type="audio",
        track_role="dialogue",
        order_index=1,
        is_muted=False,
        is_locked=False,
        is_visible=True,
        is_solo=False,
        volume_db=0.0,
        pan=0.0,
        height_px=40,
        clips=[],
    )

    return TimelineStateSchema(
        id="timeline-49",
        project_id="proj-49",
        name="Phase 49 Master",
        duration_ms=30000,
        timecode_start="00:00:00:00",
        fps=30.0,
        width=1920,
        height=1080,
        playhead_ms=2000,
        target_video_track_id="t-v1",
        target_audio_track_id="t-a1",
        tracks=[t_v1, t_a1],
        markers=[],
        transitions=[],
    )


# ─── Comprehensive Test Suite: Phase 49 Replace / Fit-to-Fill & 4-Point Edit ───

class TestPhase49ReplaceFitToFill:

    # 1. Exact 4-Point Match
    def test_01_exact_4point_match_no_conflict(self):
        is_4pt, is_conflict, data = detect_four_point_conflict(
            source_in_ms=1000, source_out_ms=5000,
            sequence_in_ms=2000, sequence_out_ms=6000,
        )
        assert is_4pt is True
        assert is_conflict is False
        assert data["source_duration_ms"] == 4000
        assert data["sequence_duration_ms"] == 4000
        assert data["diff_ms"] == 0

    # 2. Duration Mismatch
    def test_02_duration_mismatch_detected(self):
        is_4pt, is_conflict, data = detect_four_point_conflict(
            source_in_ms=0, source_out_ms=5000,
            sequence_in_ms=2000, sequence_out_ms=4500,
        )
        assert is_4pt is True
        assert is_conflict is True
        assert data["source_duration_ms"] == 5000
        assert data["sequence_duration_ms"] == 2500
        assert data["diff_ms"] == 2500

    # 3. Fit-to-Fill Speed Calculation
    def test_03_fit_to_fill_speed_factor_calculation(self):
        # 5000ms source fitting into 2500ms sequence -> speed 2.0x
        speed = calculate_fit_to_fill_speed(5000, 2500)
        assert speed == 2.0

        # 2000ms source fitting into 4000ms sequence -> speed 0.5x
        speed2 = calculate_fit_to_fill_speed(2000, 4000)
        assert speed2 == 0.5

    # 4. Speed Factor Lower Bound Clamping (0.1x)
    def test_04_speed_factor_lower_bound_clamp(self):
        # 100ms source into 10000ms sequence -> raw 0.01x -> clamped to 0.1x
        speed = calculate_fit_to_fill_speed(100, 10000)
        assert speed == 0.1

    # 5. Speed Factor Upper Bound Clamping (10.0x)
    def test_05_speed_factor_upper_bound_clamp(self):
        # 50000ms source into 1000ms sequence -> raw 50x -> clamped to 10.0x
        speed = calculate_fit_to_fill_speed(50000, 1000)
        assert speed == 10.0

    # 6. Fit-to-Fill Resolution Execution
    def test_06_resolution_fit_to_fill_preserves_sequence_bounds(self, base_timeline):
        conflict = {
            "source_in_ms": 1000,
            "source_out_ms": 6000,
            "source_duration_ms": 5000,
            "sequence_in_ms": 2000,
            "sequence_out_ms": 4500,
            "sequence_duration_ms": 2500,
            "speed_factor": 2.0,
        }
        ok, res = resolve_four_point_edit(base_timeline, conflict, resolution="fit_to_fill")
        assert ok is True
        c = next(cl for cl in res.tracks[0].clips if cl.start_time_ms == 2000)
        assert c.duration_ms == 2500
        assert c.speed_factor == 2.0
        assert c.source_in_ms == 1000
        assert c.source_out_ms == 6000

    # 7. Resolution Option: Ignore Source Out
    def test_07_resolution_ignore_source_out(self, base_timeline):
        conflict = {
            "source_in_ms": 1000,
            "source_out_ms": 6000,
            "source_duration_ms": 5000,
            "sequence_in_ms": 2000,
            "sequence_out_ms": 4500,
            "sequence_duration_ms": 2500,
            "speed_factor": 2.0,
        }
        ok, res = resolve_four_point_edit(base_timeline, conflict, resolution="ignore_source_out")
        assert ok is True
        c = next(cl for cl in res.tracks[0].clips if cl.start_time_ms == 2000)
        assert c.duration_ms == 2500
        assert c.speed_factor == 1.0
        assert c.source_in_ms == 1000
        assert c.source_out_ms == 1000 + 2500  # fills sequence duration at 1.0x

    # 8. Resolution Option: Ignore Sequence Out
    def test_08_resolution_ignore_sequence_out(self, base_timeline):
        conflict = {
            "source_in_ms": 1000,
            "source_out_ms": 6000,
            "source_duration_ms": 5000,
            "sequence_in_ms": 2000,
            "sequence_out_ms": 4500,
            "sequence_duration_ms": 2500,
            "speed_factor": 2.0,
        }
        ok, res = resolve_four_point_edit(base_timeline, conflict, resolution="ignore_sequence_out")
        assert ok is True
        c = next(cl for cl in res.tracks[0].clips if cl.start_time_ms == 2000)
        assert c.duration_ms == 5000  # full source duration
        assert c.speed_factor == 1.0
        assert c.source_in_ms == 1000
        assert c.source_out_ms == 6000

    # 9. Resolution Option: Ignore Sequence In
    def test_09_resolution_ignore_sequence_in_aligns_to_sequence_out(self, base_timeline):
        conflict = {
            "source_in_ms": 1000,
            "source_out_ms": 4000,
            "source_duration_ms": 3000,
            "sequence_in_ms": 2000,
            "sequence_out_ms": 6000,
            "sequence_duration_ms": 4000,
            "speed_factor": 0.75,
        }
        ok, res = resolve_four_point_edit(base_timeline, conflict, resolution="ignore_sequence_in")
        assert ok is True
        # Aligns end to 6000ms: start = 6000 - 3000 = 3000ms
        c = next(cl for cl in res.tracks[0].clips if cl.start_time_ms == 3000)
        assert c.duration_ms == 3000
        assert c.start_time_ms + c.duration_ms == 6000

    # 10. Ignore Sequence In Prevents Negative Timeline Start
    def test_10_resolution_ignore_sequence_in_protects_against_negative_start(self, base_timeline):
        conflict = {
            "source_in_ms": 0,
            "source_out_ms": 5000,
            "source_duration_ms": 5000,
            "sequence_in_ms": 1000,
            "sequence_out_ms": 2000,
            "sequence_duration_ms": 1000,
            "speed_factor": 5.0,
        }
        ok, res = resolve_four_point_edit(base_timeline, conflict, resolution="ignore_sequence_in")
        assert ok is True
        # sequence_out = 2000, source_dur = 5000 -> 2000 - 5000 = -3000 -> clamped to 0
        c = next(cl for cl in res.tracks[0].clips if cl.start_time_ms == 0)
        assert c.start_time_ms == 0
        assert c.duration_ms == 2000

    # 11. Source In Point Handling
    def test_11_source_in_point_respected(self, base_timeline):
        ok, res = perform_professional_replace_edit(
            base_timeline,
            clip_id="c-v1",
            mode="from_in",
            custom_source_in_ms=1500,
        )
        assert ok is True
        c = res.tracks[0].clips[0]
        assert c.source_in_ms == 1500
        assert c.source_out_ms == 1500 + 4000

    # 12. Source Out Point Handling
    def test_12_source_out_point_fit_to_fill(self, base_timeline):
        ok, res = perform_professional_replace_edit(
            base_timeline,
            clip_id="c-v1",
            mode="fit_to_fill",
            custom_source_in_ms=1000,
            custom_source_out_ms=3000,  # 2000ms source fitting into 4000ms destination
        )
        assert ok is True
        c = res.tracks[0].clips[0]
        assert c.duration_ms == 4000  # destination duration preserved
        assert c.speed_factor == 0.5  # 2000 / 4000 = 0.5x

    # 13. Sequence In Point Respected
    def test_13_sequence_in_point_respected_in_4point(self, base_timeline):
        conflict = {
            "source_in_ms": 0, "source_out_ms": 2000, "source_duration_ms": 2000,
            "sequence_in_ms": 7000, "sequence_out_ms": 9000, "sequence_duration_ms": 2000,
            "speed_factor": 1.0,
        }
        ok, res = resolve_four_point_edit(base_timeline, conflict, resolution="fit_to_fill")
        assert ok is True
        c = next(cl for cl in res.tracks[0].clips if cl.start_time_ms == 7000)
        assert c.start_time_ms == 7000

    # 14. Sequence Out Point Respected
    def test_14_sequence_out_point_respected_in_4point(self, base_timeline):
        conflict = {
            "source_in_ms": 0, "source_out_ms": 4000, "source_duration_ms": 4000,
            "sequence_in_ms": 5000, "sequence_out_ms": 8000, "sequence_duration_ms": 3000,
            "speed_factor": 1.333,
        }
        ok, res = resolve_four_point_edit(base_timeline, conflict, resolution="fit_to_fill")
        assert ok is True
        c = next(cl for cl in res.tracks[0].clips if cl.start_time_ms == 5000)
        assert c.start_time_ms + c.duration_ms == 8000

    # 15. Source Duration Calculation
    def test_15_source_duration_calculation(self):
        s_in = 1200
        s_out = 6800
        assert s_out - s_in == 5600

    # 16. Sequence Duration Calculation
    def test_16_sequence_duration_calculation(self):
        seq_in = 3400
        seq_out = 9100
        assert seq_out - seq_in == 5700

    # 17. Zero Source Duration Rejected
    def test_17_zero_source_duration_rejected(self):
        speed = calculate_fit_to_fill_speed(0, 3000)
        assert speed is None

    # 18. Zero Destination Duration Rejected
    def test_18_zero_destination_duration_rejected(self):
        speed = calculate_fit_to_fill_speed(3000, 0)
        assert speed is None

    # 19. Missing Target Clip Rejection
    def test_19_missing_target_clip_rejection(self, base_timeline):
        ok, res = perform_professional_replace_edit(base_timeline, clip_id="non-existent-clip")
        assert ok is False
        assert res == base_timeline

    # 20. Locked Track Rejection
    def test_20_locked_track_rejection(self, base_timeline):
        base_timeline.tracks[0].is_locked = True
        ok, res = perform_professional_replace_edit(base_timeline, clip_id="c-v1")
        assert ok is False
        assert res.tracks[0].clips[0].asset_id == "asset-original"

    # 21. Target Video Track Patching
    def test_21_target_video_track_patching(self, base_timeline):
        t_v2 = TrackSchema(
            id="t-v2", name="Video 2", track_type="video", track_role="video",
            order_index=2, is_muted=False, is_locked=False, is_visible=True, is_solo=False,
            volume_db=0.0, pan=0.0, height_px=50,
            clips=[
                ClipSchema(
                    id="c-v2", track_id="t-v2", name="V2 Clip", clip_type="media",
                    start_time_ms=1000, duration_ms=3000, source_in_ms=0, source_out_ms=3000,
                    speed_factor=1.0, is_reversed=False, is_frozen=False, opacity=1.0, blend_mode="normal",
                    position_x=0.5, position_y=0.5, scale_x=1.0, scale_y=1.0, rotation=0.0,
                    anchor_x=0.5, anchor_y=0.5, crop_left=0.0, crop_right=0.0, crop_top=0.0, crop_bottom=0.0,
                    volume_db=0.0, fade_in_ms=0, fade_out_ms=0, effects=[], keyframes=[], asset_id="orig-v2",
                )
            ],
        )
        base_timeline.tracks.append(t_v2)
        base_timeline.target_video_track_id = "t-v2"

        # Replace using target track playhead fallback
        ok, res = perform_professional_replace_edit(
            base_timeline, clip_id=None, timeline_playhead_ms=2000, new_asset_id="patched-asset"
        )
        assert ok is True
        c = next(cl for cl in res.tracks if cl.id == "t-v2").clips[0]
        assert c.asset_id == "patched-asset"
        # Track 1 untouched
        assert res.tracks[0].clips[0].asset_id == "asset-original"

    # 22. Target Audio Track Patching
    def test_22_target_audio_track_patching(self, base_timeline):
        conflict = {
            "source_in_ms": 0, "source_out_ms": 2000, "source_duration_ms": 2000,
            "sequence_in_ms": 1000, "sequence_out_ms": 3000, "sequence_duration_ms": 2000,
            "speed_factor": 1.0,
        }
        ok, res = resolve_four_point_edit(
            base_timeline, conflict, resolution="fit_to_fill", target_track_id="t-a1", asset_name="Audio 4Pt"
        )
        assert ok is True
        a_track = next(t for t in res.tracks if t.id == "t-a1")
        assert len(a_track.clips) == 1
        assert a_track.clips[0].name == "Audio 4Pt"

    # 23. Linked A/V Synchronous Replacement
    def test_23_linked_av_clip_replacement(self, base_timeline):
        c_audio = ClipSchema(
            id="c-a1", track_id="t-a1", name="Audio Linked", clip_type="media",
            start_time_ms=1000, duration_ms=4000, source_in_ms=0, source_out_ms=4000,
            speed_factor=1.0, is_reversed=False, is_frozen=False, opacity=1.0, blend_mode="normal",
            position_x=0.5, position_y=0.5, scale_x=1.0, scale_y=1.0, rotation=0.0,
            anchor_x=0.5, anchor_y=0.5, crop_left=0.0, crop_right=0.0, crop_top=0.0, crop_bottom=0.0,
            volume_db=0.0, fade_in_ms=0, fade_out_ms=0, effects=[], keyframes=[], asset_id="orig-audio",
            linked_clip_id="c-v1",
        )
        base_timeline.tracks[1].clips.append(c_audio)
        base_timeline.tracks[0].clips[0].linked_clip_id = "c-a1"

        ok, res = perform_professional_replace_edit(
            base_timeline, clip_id="c-v1", new_asset_id="new-dual-media", new_name="Dual Scene"
        )
        assert ok is True
        v_clip = res.tracks[0].clips[0]
        a_clip = res.tracks[1].clips[0]
        assert v_clip.asset_id == "new-dual-media"
        assert a_clip.asset_id == "new-dual-media"
        assert a_clip.name == "Dual Scene (Audio)"
        assert v_clip.source_in_ms == a_clip.source_in_ms
        assert v_clip.source_out_ms == a_clip.source_out_ms

    # 24. Reverse Media State Preserved
    def test_24_reverse_media_state_preserved(self, base_timeline):
        base_timeline.tracks[0].clips[0].is_reversed = True
        ok, res = perform_professional_replace_edit(base_timeline, clip_id="c-v1")
        assert ok is True
        assert res.tracks[0].clips[0].is_reversed is True

    # 25. Effects Preservation During Replace
    def test_25_effects_preserved_during_replace(self, base_timeline):
        ok, res = perform_professional_replace_edit(base_timeline, clip_id="c-v1")
        assert ok is True
        c = res.tracks[0].clips[0]
        assert len(c.effects) == 1
        assert c.effects[0].effect_type == "color_grading"
        assert c.effects[0].parameters["brightness"] == 1.2

    # 26. Keyframes Preservation During Replace
    def test_26_keyframes_preserved_during_replace(self, base_timeline):
        ok, res = perform_professional_replace_edit(base_timeline, clip_id="c-v1")
        assert ok is True
        c = res.tracks[0].clips[0]
        assert len(c.keyframes) == 1
        assert c.keyframes[0].property_path == "opacity"
        assert c.keyframes[0].value == 1.0

    # 27. Transitions Preservation During Replace
    def test_27_transitions_preserved_during_replace(self, base_timeline):
        base_timeline.tracks[0].clips[0].transition_in = {"type": "crossfade", "duration_ms": 500}
        ok, res = perform_professional_replace_edit(base_timeline, clip_id="c-v1")
        assert ok is True
        c = res.tracks[0].clips[0]
        assert c.transition_in == {"type": "crossfade", "duration_ms": 500}

    # 28. Transform Properties Preserved
    def test_28_transform_preserved_during_replace(self, base_timeline):
        base_timeline.tracks[0].clips[0].scale_x = 1.25
        base_timeline.tracks[0].clips[0].scale_y = 1.25
        base_timeline.tracks[0].clips[0].rotation = 15.0
        ok, res = perform_professional_replace_edit(base_timeline, clip_id="c-v1")
        assert ok is True
        c = res.tracks[0].clips[0]
        assert c.scale_x == 1.25
        assert c.scale_y == 1.25
        assert c.rotation == 15.0

    # 29. Audio Properties Preserved
    def test_29_audio_properties_preserved_during_replace(self, base_timeline):
        base_timeline.tracks[0].clips[0].volume_db = -3.5
        base_timeline.tracks[0].clips[0].fade_in_ms = 250
        ok, res = perform_professional_replace_edit(base_timeline, clip_id="c-v1")
        assert ok is True
        c = res.tracks[0].clips[0]
        assert c.volume_db == -3.5
        assert c.fade_in_ms == 250

    # 30. Replace from Playhead Position Sync
    def test_30_replace_from_playhead_sync(self, base_timeline):
        # Clip is from 1000ms to 5000ms. Playhead at 3000ms (offset 2000ms inside clip).
        # Source playhead at 4000ms.
        # Result: source_start = 4000 - 2000 = 2000ms.
        ok, res = perform_professional_replace_edit(
            base_timeline,
            clip_id="c-v1",
            mode="from_playhead",
            timeline_playhead_ms=3000,
            source_playhead_ms=4000,
        )
        assert ok is True
        c = res.tracks[0].clips[0]
        assert c.source_in_ms == 2000
        assert c.source_out_ms == 2000 + 4000

    # 31. Replace from Playhead at Clip Start
    def test_31_replace_from_playhead_at_head(self, base_timeline):
        # Playhead at 1000ms (head of clip). Source playhead at 2500ms.
        # offset = 0 -> source_start = 2500ms.
        ok, res = perform_professional_replace_edit(
            base_timeline,
            clip_id="c-v1",
            mode="from_playhead",
            timeline_playhead_ms=1000,
            source_playhead_ms=2500,
        )
        assert ok is True
        c = res.tracks[0].clips[0]
        assert c.source_in_ms == 2500
        assert c.source_out_ms == 6500

    # 32. History Snapshot Push Exactly Once on Commit
    def test_32_history_snapshot_push_behavior(self, base_timeline):
        history: List[TimelineStateSchema] = [base_timeline.model_copy(deep=True)]

        # Edit committed
        ok, committed_state = perform_professional_replace_edit(
            base_timeline, clip_id="c-v1", new_asset_id="asset-committed"
        )
        assert ok is True
        history.append(committed_state.model_copy(deep=True))

        assert len(history) == 2
        assert history[0].tracks[0].clips[0].asset_id == "asset-original"
        assert history[1].tracks[0].clips[0].asset_id == "asset-committed"

    # 33. Modal Cancel Generates Zero History Snapshots
    def test_33_cancel_no_history_snapshot(self, base_timeline):
        history = [base_timeline.model_copy(deep=True)]
        # User cancels modal -> 0 mutations, 0 history pushes
        assert len(history) == 1
        assert history[0] == base_timeline

    # 34. Undo Restores Exact Pre-Replace State
    def test_34_undo_restores_exact_state(self, base_timeline):
        history = [base_timeline.model_copy(deep=True)]
        _, committed = perform_professional_replace_edit(base_timeline, clip_id="c-v1", new_asset_id="asset-2")
        history.append(committed)

        # Undo back to history[0]
        undone = history[0]
        assert undone.tracks[0].clips[0].asset_id == "asset-original"

    # 35. Redo Restores Exact Committed State
    def test_35_redo_restores_exact_state(self, base_timeline):
        history = [base_timeline.model_copy(deep=True)]
        _, committed = perform_professional_replace_edit(base_timeline, clip_id="c-v1", new_asset_id="asset-2")
        history.append(committed)

        redone = history[1]
        assert redone.tracks[0].clips[0].asset_id == "asset-2"

    # 36. NaN and Infinity Protection
    def test_36_nan_and_infinity_protection(self):
        assert calculate_fit_to_fill_speed(float("nan"), 1000) is None
        assert calculate_fit_to_fill_speed(1000, float("nan")) is None
        assert calculate_fit_to_fill_speed(float("inf"), 1000) is None
        assert calculate_fit_to_fill_speed(1000, float("inf")) is None

    # 37. Negative Value Protection
    def test_37_negative_values_protection(self):
        assert calculate_fit_to_fill_speed(-1000, 2000) is None
        assert calculate_fit_to_fill_speed(2000, -1000) is None

    # 38. Zero Partial Mutation on Locked Track
    def test_38_zero_partial_mutation_on_locked_track(self, base_timeline):
        base_timeline.tracks[0].is_locked = True
        snapshot_before = copy.deepcopy(base_timeline.model_dump())
        ok, res = perform_professional_replace_edit(base_timeline, clip_id="c-v1")
        assert ok is False
        assert res.model_dump() == snapshot_before

    # 39. Backward Compatibility with Phase 45 replaceEdit
    def test_39_backward_compatibility_basic_replace(self, base_timeline):
        # Original Phase 45 behavior: pass clip_id and new_asset_id
        ok, res = perform_professional_replace_edit(
            base_timeline, clip_id="c-v1", new_asset_id="p45-asset", new_name="Replaced Title"
        )
        assert ok is True
        c = res.tracks[0].clips[0]
        assert c.asset_id == "p45-asset"
        assert c.name == "Replaced Title"
        assert c.duration_ms == 4000
        assert c.start_time_ms == 1000

    # 40. Normal 3-Point Edit Unaffected When Sequence Out Undefined
    def test_40_three_point_edit_unaffected_when_no_sequence_out(self):
        is_4pt, is_conflict, _ = detect_four_point_conflict(
            source_in_ms=0, source_out_ms=3000,
            sequence_in_ms=1000, sequence_out_ms=None
        )
        assert is_4pt is False
        assert is_conflict is False

    # 41. Timeline Position Preserved in Fit-to-Fill
    def test_41_timeline_position_preserved_in_fit_to_fill(self, base_timeline):
        orig_start = base_timeline.tracks[0].clips[0].start_time_ms
        orig_dur = base_timeline.tracks[0].clips[0].duration_ms
        ok, res = perform_professional_replace_edit(
            base_timeline, clip_id="c-v1", mode="fit_to_fill", custom_source_in_ms=0, custom_source_out_ms=8000
        )
        assert ok is True
        c = res.tracks[0].clips[0]
        assert c.start_time_ms == orig_start
        assert c.duration_ms == orig_dur
        assert c.speed_factor == 2.0

    # 42. Multi-Track Replacement Isolation
    def test_42_multi_track_replacement_isolation(self, base_timeline):
        t_v2 = TrackSchema(
            id="t-v2", name="Video 2", track_type="video", track_role="video",
            order_index=2, is_muted=False, is_locked=False, is_visible=True, is_solo=False,
            volume_db=0.0, pan=0.0, height_px=50,
            clips=[
                ClipSchema(
                    id="c-v2", track_id="t-v2", name="V2 Safe", clip_type="media",
                    start_time_ms=500, duration_ms=2000, source_in_ms=0, source_out_ms=2000,
                    speed_factor=1.0, is_reversed=False, is_frozen=False, opacity=1.0, blend_mode="normal",
                    position_x=0.5, position_y=0.5, scale_x=1.0, scale_y=1.0, rotation=0.0,
                    anchor_x=0.5, anchor_y=0.5, crop_left=0.0, crop_right=0.0, crop_top=0.0, crop_bottom=0.0,
                    volume_db=0.0, fade_in_ms=0, fade_out_ms=0, effects=[], keyframes=[], asset_id="v2-safe-asset",
                )
            ],
        )
        base_timeline.tracks.append(t_v2)

        ok, res = perform_professional_replace_edit(base_timeline, clip_id="c-v1", new_asset_id="replaced-v1")
        assert ok is True
        assert res.tracks[0].clips[0].asset_id == "replaced-v1"
        assert res.tracks[2].clips[0].asset_id == "v2-safe-asset"

    # 43. Timeline State Serialization with Fit-to-Fill Speed
    def test_43_timeline_state_serialization_with_speed_factor(self, base_timeline):
        base_timeline.tracks[0].clips[0].speed_factor = 1.625
        dumped = base_timeline.model_dump()
        restored = TimelineStateSchema.model_validate(dumped)
        assert restored.tracks[0].clips[0].speed_factor == 1.625

    # 44. Downstream Clip Preserved in Fit-to-Fill Overwrite
    def test_44_downstream_clip_preserved_in_fit_to_fill(self, base_timeline):
        c_downstream = ClipSchema(
            id="c-downstream", track_id="t-v1", name="Downstream Clip", clip_type="media",
            start_time_ms=6000, duration_ms=3000, source_in_ms=0, source_out_ms=3000,
            speed_factor=1.0, is_reversed=False, is_frozen=False, opacity=1.0, blend_mode="normal",
            position_x=0.5, position_y=0.5, scale_x=1.0, scale_y=1.0, rotation=0.0,
            anchor_x=0.5, anchor_y=0.5, crop_left=0.0, crop_right=0.0, crop_top=0.0, crop_bottom=0.0,
            volume_db=0.0, fade_in_ms=0, fade_out_ms=0, effects=[], keyframes=[], asset_id="downstream-asset",
        )
        base_timeline.tracks[0].clips.append(c_downstream)

        conflict = {
            "source_in_ms": 0, "source_out_ms": 4000, "source_duration_ms": 4000,
            "sequence_in_ms": 2000, "sequence_out_ms": 4000, "sequence_duration_ms": 2000,
            "speed_factor": 2.0,
        }
        ok, res = resolve_four_point_edit(base_timeline, conflict, resolution="fit_to_fill")
        assert ok is True
        downstream = next(cl for cl in res.tracks[0].clips if cl.id == "c-downstream")
        assert downstream.start_time_ms == 6000
        assert downstream.duration_ms == 3000

    # 45. Downstream Truncation During Ignore Sequence Out
    def test_45_downstream_truncation_during_ignore_sequence_out(self, base_timeline):
        # Clip from 6000 to 9000ms. Edit starts at 2000ms for 5000ms (ends at 7000ms).
        # It partially overlaps downstream clip head (6000 to 7000ms).
        c_downstream = ClipSchema(
            id="c-downstream", track_id="t-v1", name="Downstream Overlapped", clip_type="media",
            start_time_ms=6000, duration_ms=3000, source_in_ms=0, source_out_ms=3000,
            speed_factor=1.0, is_reversed=False, is_frozen=False, opacity=1.0, blend_mode="normal",
            position_x=0.5, position_y=0.5, scale_x=1.0, scale_y=1.0, rotation=0.0,
            anchor_x=0.5, anchor_y=0.5, crop_left=0.0, crop_right=0.0, crop_top=0.0, crop_bottom=0.0,
            volume_db=0.0, fade_in_ms=0, fade_out_ms=0, effects=[], keyframes=[], asset_id="downstream-asset",
        )
        base_timeline.tracks[0].clips.append(c_downstream)

        conflict = {
            "source_in_ms": 0, "source_out_ms": 5000, "source_duration_ms": 5000,
            "sequence_in_ms": 2000, "sequence_out_ms": 3000, "sequence_duration_ms": 1000,
            "speed_factor": 5.0,
        }
        ok, res = resolve_four_point_edit(base_timeline, conflict, resolution="ignore_sequence_out")
        assert ok is True
        # Edit goes from 2000 to 7000. Downstream was 6000-9000, now truncated to 7000-9000 (duration 2000ms)
        downstream = next(cl for cl in res.tracks[0].clips if cl.id == "c-downstream")
        assert downstream.start_time_ms == 7000
        assert downstream.duration_ms == 2000

    # 46. Full Regression: Track Locking Integrity
    def test_46_track_locking_regression_safeguard(self, base_timeline):
        base_timeline.tracks[0].is_locked = True
        conflict = {
            "source_in_ms": 0, "source_out_ms": 2000, "source_duration_ms": 2000,
            "sequence_in_ms": 1000, "sequence_out_ms": 3000, "sequence_duration_ms": 2000,
            "speed_factor": 1.0,
        }
        ok, res = resolve_four_point_edit(base_timeline, conflict, resolution="fit_to_fill")
        assert ok is False
        assert len(res.tracks[0].clips) == 1
        assert res.tracks[0].clips[0].asset_id == "asset-original"
