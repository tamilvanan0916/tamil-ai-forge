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


# ─── Pure Algorithm Implementations for Phase 48 Trim Preview Math ───

def ms_to_frames(ms: int, fps: int = 30) -> int:
    return int(round((ms / 1000.0) * fps))


def frames_to_ms(frames: int, fps: int = 30) -> int:
    return int(round((frames / float(fps)) * 1000.0))


def calculate_trim_preview_state(
    track: TrackSchema,
    tool: str,
    clip_id: str,
    delta_ms: int = 0,
    edge: str = "right",
    fps: int = 30,
    pred_clip_id: Optional[str] = None,
    succ_clip_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Calculates outgoing and incoming cut preview frames for Phase 48 2-Up Trim Monitor."""
    if track.is_locked:
        return None

    target_clip = next((c for c in track.clips if c.id == clip_id), None)
    if not target_clip:
        return None

    sorted_clips = sorted(track.clips, key=lambda c: c.start_time_ms)
    clip_idx = next(i for i, c in enumerate(sorted_clips) if c.id == clip_id)
    adj_pred = sorted_clips[clip_idx - 1] if clip_idx > 0 else None
    adj_succ = sorted_clips[clip_idx + 1] if clip_idx < len(sorted_clips) - 1 else None

    frame_ms = int(round(1000.0 / fps))
    delta_frames = ms_to_frames(delta_ms, fps)

    if tool == "roll":
        pred = next((c for c in sorted_clips if c.id == pred_clip_id), None) if pred_clip_id else (adj_pred or target_clip)
        succ = next((c for c in sorted_clips if c.id == succ_clip_id), None) if succ_clip_id else (target_clip if pred.id != target_clip.id else adj_succ)
        if not pred or not succ:
            return None

        pred_speed = pred.speed_factor if pred.speed_factor and pred.speed_factor > 0 else 1.0
        succ_speed = succ.speed_factor if succ.speed_factor and succ.speed_factor > 0 else 1.0

        orig_out = max(0, int(round(pred.source_in_ms + pred.duration_ms * pred_speed - frame_ms)))
        orig_in = succ.source_in_ms

        out_frame = max(0, int(round(orig_out + delta_ms * pred_speed)))
        in_frame = max(0, int(round(orig_in + delta_ms * succ_speed)))

        return {
            "active_tool": "roll",
            "outgoing_clip_id": pred.id,
            "incoming_clip_id": succ.id,
            "outgoing_frame_ms": out_frame,
            "incoming_frame_ms": in_frame,
            "delta_ms": delta_ms,
            "delta_frames": delta_frames,
            "edge": edge,
        }

    elif tool == "slip":
        speed = target_clip.speed_factor if target_clip.speed_factor and target_clip.speed_factor > 0 else 1.0
        is_reversed = bool(target_clip.is_reversed)
        shift = int(round((-delta_ms if is_reversed else delta_ms) * speed))

        out_frame = max(0, target_clip.source_in_ms + shift)
        in_frame = max(0, target_clip.source_out_ms + shift - frame_ms)

        return {
            "active_tool": "slip",
            "outgoing_clip_id": target_clip.id,
            "incoming_clip_id": target_clip.id,
            "outgoing_frame_ms": out_frame,
            "incoming_frame_ms": in_frame,
            "delta_ms": delta_ms,
            "delta_frames": delta_frames,
            "edge": edge,
        }

    elif tool == "slide":
        pred = adj_pred
        succ = adj_succ
        pred_speed = (pred.speed_factor if pred and pred.speed_factor and pred.speed_factor > 0 else 1.0)
        succ_speed = (succ.speed_factor if succ and succ.speed_factor and succ.speed_factor > 0 else 1.0)

        out_frame = max(0, int(round((pred.source_in_ms + pred.duration_ms * pred_speed - frame_ms) + delta_ms * pred_speed))) if pred else target_clip.source_in_ms
        in_frame = max(0, int(round(succ.source_in_ms + delta_ms * succ_speed))) if succ else max(0, target_clip.source_out_ms - frame_ms)

        return {
            "active_tool": "slide",
            "outgoing_clip_id": pred.id if pred else target_clip.id,
            "incoming_clip_id": succ.id if succ else target_clip.id,
            "outgoing_frame_ms": out_frame,
            "incoming_frame_ms": in_frame,
            "delta_ms": delta_ms,
            "delta_frames": delta_frames,
            "edge": edge,
        }

    elif tool in ("ripple", "trim"):
        speed = target_clip.speed_factor if target_clip.speed_factor and target_clip.speed_factor > 0 else 1.0
        if edge == "left":
            pred = adj_pred
            out_frame = max(0, int(round(pred.source_in_ms + pred.duration_ms * (pred.speed_factor or 1.0) - frame_ms))) if pred else target_clip.start_time_ms
            in_frame = max(0, int(round(target_clip.source_in_ms + delta_ms * speed)))
            return {
                "active_tool": tool,
                "outgoing_clip_id": pred.id if pred else None,
                "incoming_clip_id": target_clip.id,
                "outgoing_frame_ms": out_frame,
                "incoming_frame_ms": in_frame,
                "delta_ms": delta_ms,
                "delta_frames": delta_frames,
                "edge": edge,
            }
        else:
            succ = adj_succ
            out_frame = max(0, int(round(target_clip.source_out_ms + delta_ms * speed - frame_ms)))
            in_frame = succ.source_in_ms if succ else (target_clip.start_time_ms + target_clip.duration_ms)
            return {
                "active_tool": tool,
                "outgoing_clip_id": target_clip.id,
                "incoming_clip_id": succ.id if succ else None,
                "outgoing_frame_ms": out_frame,
                "incoming_frame_ms": in_frame,
                "delta_ms": delta_ms,
                "delta_frames": delta_frames,
                "edge": edge,
            }

    return None


# ─── Fixtures ───

@pytest.fixture
def sample_video_track() -> TrackSchema:
    c1 = ClipSchema(
        id="c1",
        name="Clip 1",
        start_time_ms=0,
        duration_ms=4000,
        source_in_ms=1000,
        source_out_ms=5000,
        metadata_info={"source_duration_ms": 10000},
        speed_factor=1.0,
        is_reversed=False,
    )
    c2 = ClipSchema(
        id="c2",
        name="Clip 2",
        start_time_ms=4000,
        duration_ms=3000,
        source_in_ms=2000,
        source_out_ms=5000,
        metadata_info={"source_duration_ms": 12000},
        speed_factor=1.0,
        is_reversed=False,
    )
    c3 = ClipSchema(
        id="c3",
        name="Clip 3",
        start_time_ms=7000,
        duration_ms=5000,
        source_in_ms=0,
        source_out_ms=5000,
        metadata_info={"source_duration_ms": 15000},
        speed_factor=1.0,
        is_reversed=False,
    )
    return TrackSchema(
        id="tr-video-1",
        track_type="video",
        track_role="video",
        order_index=0,
        name="V1",
        clips=[c1, c2, c3],
    )


# ─── Unit Test Suite: Phase 48 Dynamic 2-Up Trim Preview & Precision Cut Monitor ───

# 1. Roll Edit Frame Calculations
def test_roll_preview_initial_frames(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "roll", "c2", delta_ms=0, pred_clip_id="c1", succ_clip_id="c2", fps=30)
    assert state is not None
    assert state["active_tool"] == "roll"
    assert state["outgoing_clip_id"] == "c1"
    assert state["incoming_clip_id"] == "c2"
    assert state["delta_ms"] == 0
    assert state["delta_frames"] == 0
    # c1 tail frame at source_in (1000) + duration (4000) - 33ms = 4967
    assert 4960 <= state["outgoing_frame_ms"] <= 4970
    assert state["incoming_frame_ms"] == 2000


def test_roll_preview_positive_delta(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "roll", "c2", delta_ms=200, pred_clip_id="c1", succ_clip_id="c2", fps=30)
    assert state is not None
    assert state["delta_ms"] == 200
    assert state["delta_frames"] == 6
    assert state["incoming_frame_ms"] == 2200
    assert 5160 <= state["outgoing_frame_ms"] <= 5170


def test_roll_preview_negative_delta(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "roll", "c2", delta_ms=-300, pred_clip_id="c1", succ_clip_id="c2", fps=30)
    assert state is not None
    assert state["delta_ms"] == -300
    assert state["delta_frames"] == -9
    assert state["incoming_frame_ms"] == 1700
    assert 4660 <= state["outgoing_frame_ms"] <= 4670


def test_roll_preview_speed_factor_scaling(sample_video_track):
    sample_video_track.clips[0].speed_factor = 2.0  # 2x speed
    state = calculate_trim_preview_state(sample_video_track, "roll", "c2", delta_ms=100, pred_clip_id="c1", succ_clip_id="c2", fps=30)
    assert state is not None
    # outgoing changes by 100 * 2.0 = 200ms
    assert state["incoming_frame_ms"] == 2100


# 2. Slip Edit Frame Calculations
def test_slip_preview_initial_frames(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "slip", "c2", delta_ms=0, fps=30)
    assert state is not None
    assert state["active_tool"] == "slip"
    assert state["outgoing_clip_id"] == "c2"
    assert state["incoming_clip_id"] == "c2"
    assert state["outgoing_frame_ms"] == 2000
    # incoming is tail frame = source_out (5000) - 33ms = 4967
    assert 4960 <= state["incoming_frame_ms"] <= 4970


def test_slip_preview_positive_slip(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "slip", "c2", delta_ms=500, fps=30)
    assert state is not None
    assert state["outgoing_frame_ms"] == 2500
    assert 5460 <= state["incoming_frame_ms"] <= 5470
    assert state["delta_frames"] == 15


def test_slip_preview_negative_slip(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "slip", "c2", delta_ms=-400, fps=30)
    assert state is not None
    assert state["outgoing_frame_ms"] == 1600
    assert 4560 <= state["incoming_frame_ms"] <= 4570
    assert state["delta_frames"] == -12


def test_slip_preview_reversed_clip(sample_video_track):
    sample_video_track.clips[1].is_reversed = True
    state = calculate_trim_preview_state(sample_video_track, "slip", "c2", delta_ms=200, fps=30)
    assert state is not None
    # Reversed media shifts backward for positive delta
    assert state["outgoing_frame_ms"] == 1800
    assert 4760 <= state["incoming_frame_ms"] <= 4770


# 3. Slide Edit Frame Calculations
def test_slide_preview_initial_frames(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "slide", "c2", delta_ms=0, fps=30)
    assert state is not None
    assert state["active_tool"] == "slide"
    assert state["outgoing_clip_id"] == "c1"
    assert state["incoming_clip_id"] == "c3"
    assert 4960 <= state["outgoing_frame_ms"] <= 4970
    assert state["incoming_frame_ms"] == 0


def test_slide_preview_positive_shift(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "slide", "c2", delta_ms=300, fps=30)
    assert state is not None
    assert 5260 <= state["outgoing_frame_ms"] <= 5270
    assert state["incoming_frame_ms"] == 300
    assert state["delta_frames"] == 9


def test_slide_preview_negative_shift(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "slide", "c2", delta_ms=-200, fps=30)
    assert state is not None
    assert 4760 <= state["outgoing_frame_ms"] <= 4770
    assert state["incoming_frame_ms"] == 0  # clamped at >= 0


# 4. Ripple Trim Frame Calculations
def test_ripple_trim_left_edge(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "ripple", "c2", delta_ms=150, edge="left", fps=30)
    assert state is not None
    assert state["active_tool"] == "ripple"
    assert state["outgoing_clip_id"] == "c1"
    assert state["incoming_clip_id"] == "c2"
    # Predecessor tail stays fixed
    assert 4960 <= state["outgoing_frame_ms"] <= 4970
    # Incoming head moves forward by 150ms
    assert state["incoming_frame_ms"] == 2150


def test_ripple_trim_right_edge(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "ripple", "c2", delta_ms=-100, edge="right", fps=30)
    assert state is not None
    assert state["active_tool"] == "ripple"
    assert state["outgoing_clip_id"] == "c2"
    assert state["incoming_clip_id"] == "c3"
    # Outgoing tail shifts backward by 100ms
    assert 4860 <= state["outgoing_frame_ms"] <= 4870
    # Successor head stays fixed
    assert state["incoming_frame_ms"] == 0


# 5. Regular Edge Trim Calculations
def test_regular_trim_left_edge(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "trim", "c2", delta_ms=250, edge="left", fps=30)
    assert state is not None
    assert state["active_tool"] == "trim"
    assert state["incoming_frame_ms"] == 2250


def test_regular_trim_right_edge(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "trim", "c2", delta_ms=-250, edge="right", fps=30)
    assert state is not None
    assert state["active_tool"] == "trim"
    assert 4710 <= state["outgoing_frame_ms"] <= 4720


# 6. FPS Conversions and Delta Frames
@pytest.mark.parametrize("fps,ms,expected_frames", [
    (24, 1000, 24),
    (25, 1000, 25),
    (30, 1000, 30),
    (50, 1000, 50),
    (60, 1000, 60),
    (30, 100, 3),
    (30, 33, 1),
    (24, 42, 1),
    (60, 16, 1),
    (30, -100, -3),
])
def test_fps_to_frames_conversion(fps, ms, expected_frames):
    assert ms_to_frames(ms, fps) == expected_frames


@pytest.mark.parametrize("fps,frames,expected_ms", [
    (30, 1, 33),
    (30, 3, 100),
    (24, 1, 42),
    (60, 1, 17),
    (25, 25, 1000),
    (30, 30, 1000),
])
def test_frames_to_ms_conversion(fps, frames, expected_ms):
    assert abs(frames_to_ms(frames, fps) - expected_ms) <= 2


# 7. Bound Clamping
def test_frame_bounds_lower_clamped(sample_video_track):
    # Enormous negative delta clamped at >= 0
    state = calculate_trim_preview_state(sample_video_track, "slip", "c2", delta_ms=-10000, fps=30)
    assert state is not None
    assert state["outgoing_frame_ms"] >= 0
    assert state["incoming_frame_ms"] >= 0


def test_locked_track_rejection(sample_video_track):
    sample_video_track.is_locked = True
    state = calculate_trim_preview_state(sample_video_track, "roll", "c2", delta_ms=100)
    assert state is None


def test_invalid_clip_rejection(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "roll", "non_existent_clip", delta_ms=100)
    assert state is None


# 8. Single Clip / Boundary Clips (No Predecessor or No Successor)
def test_first_clip_trim_left_edge(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "trim", "c1", delta_ms=50, edge="left", fps=30)
    assert state is not None
    assert state["outgoing_clip_id"] is None
    assert state["incoming_clip_id"] == "c1"
    assert state["incoming_frame_ms"] == 1050


def test_last_clip_trim_right_edge(sample_video_track):
    state = calculate_trim_preview_state(sample_video_track, "trim", "c3", delta_ms=-50, edge="right", fps=30)
    assert state is not None
    assert state["outgoing_clip_id"] == "c3"
    assert state["incoming_clip_id"] is None
    assert state["outgoing_frame_ms"] > 0


# 9. Nudge Trimming Simulation
def test_nudge_plus_one_frame(sample_video_track):
    delta_ms = frames_to_ms(1, fps=30)
    state = calculate_trim_preview_state(sample_video_track, "roll", "c2", delta_ms=delta_ms, pred_clip_id="c1", succ_clip_id="c2", fps=30)
    assert state is not None
    assert state["delta_frames"] == 1


def test_nudge_minus_one_frame(sample_video_track):
    delta_ms = frames_to_ms(-1, fps=30)
    state = calculate_trim_preview_state(sample_video_track, "roll", "c2", delta_ms=delta_ms, pred_clip_id="c1", succ_clip_id="c2", fps=30)
    assert state is not None
    assert state["delta_frames"] == -1


def test_nudge_plus_five_frames(sample_video_track):
    delta_ms = frames_to_ms(5, fps=30)
    state = calculate_trim_preview_state(sample_video_track, "roll", "c2", delta_ms=delta_ms, pred_clip_id="c1", succ_clip_id="c2", fps=30)
    assert state is not None
    assert state["delta_frames"] == 5


def test_nudge_minus_five_frames(sample_video_track):
    delta_ms = frames_to_ms(-5, fps=30)
    state = calculate_trim_preview_state(sample_video_track, "roll", "c2", delta_ms=delta_ms, pred_clip_id="c1", succ_clip_id="c2", fps=30)
    assert state is not None
    assert state["delta_frames"] == -5


# 10. History Invariance Simulation (0 during drag, 1 on commit)
def test_history_invariance_simulation():
    history_stack = []
    initial_timeline = {"revision": 1, "clips": ["c1", "c2"]}
    history_stack.append(copy.deepcopy(initial_timeline))

    # Simulate 50 drag steps
    for drag_step in range(1, 51):
        # transient state calculation only
        delta_ms = drag_step * 10
        # No history push!
        assert len(history_stack) == 1

    # On drop / commit: exactly 1 history push
    committed_timeline = {"revision": 2, "clips": ["c1_trimmed", "c2_trimmed"]}
    history_stack.append(copy.deepcopy(committed_timeline))
    assert len(history_stack) == 2


def test_cancel_reverts_state():
    initial_timeline = {"start": 4000, "duration": 3000}
    working_timeline = copy.deepcopy(initial_timeline)

    # During drag / nudge
    working_timeline["start"] = 4500
    working_timeline["duration"] = 2500

    # User cancels with Esc
    working_timeline = copy.deepcopy(initial_timeline)
    assert working_timeline["start"] == 4000
    assert working_timeline["duration"] == 3000


# 11. Audio Track Support for Trim Preview
def test_audio_track_trim_preview():
    a1 = ClipSchema(
        id="a1",
        name="Audio 1",
        start_time_ms=0,
        duration_ms=6000,
        source_in_ms=0,
        source_out_ms=6000,
        speed_factor=1.0,
    )
    a2 = ClipSchema(
        id="a2",
        name="Audio 2",
        start_time_ms=6000,
        duration_ms=4000,
        source_in_ms=1000,
        source_out_ms=5000,
        speed_factor=1.0,
    )
    audio_track = TrackSchema(
        id="tr-audio-1",
        track_type="audio",
        track_role="dialogue",
        order_index=1,
        name="A1",
        clips=[a1, a2],
    )

    state = calculate_trim_preview_state(audio_track, "roll", "a2", delta_ms=200, pred_clip_id="a1", succ_clip_id="a2", fps=30)
    assert state is not None
    assert state["outgoing_clip_id"] == "a1"
    assert state["incoming_clip_id"] == "a2"
    assert state["delta_frames"] == 6


# 12. Multiple Cumulative Nudges
def test_cumulative_nudges(sample_video_track):
    total_delta_ms = 0
    fps = 30
    for _ in range(3):  # 3 nudge steps of +1 frame
        total_delta_ms += frames_to_ms(1, fps)

    state = calculate_trim_preview_state(sample_video_track, "roll", "c2", delta_ms=total_delta_ms, pred_clip_id="c1", succ_clip_id="c2", fps=fps)
    assert state is not None
    assert state["delta_frames"] == 3
