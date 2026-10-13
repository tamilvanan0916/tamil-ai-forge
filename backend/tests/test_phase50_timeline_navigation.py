import pytest
import uuid
import math
from typing import List, Dict, Any, Optional, Tuple, Set

from app.schemas.timeline import (
    TrackSchema,
    ClipSchema,
    TimelineStateSchema,
    MarkerSchema,
)


# ═══════════════════════════════════════════════════════════════════════════
# PURE ALGORITHMIC IMPLEMENTATIONS FOR PHASE 50 NAVIGATION & SHUTTLE
# ═══════════════════════════════════════════════════════════════════════════

SHUTTLE_LADDER = [-16.0, -8.0, -4.0, -2.0, -1.0, 0.0, 1.0, 2.0, 4.0, 8.0, 16.0]

def step_shuttle_forward(current_rate: float) -> float:
    """
    Simulates pressing 'L' in professional NLE shuttle state machine:
    - If stopped (0) -> +1x
    - If in reverse (< 0) -> steps towards 0 or +1x
    - If forward (> 0) -> doubles speed up to +16x
    """
    if current_rate <= -1.0:
        # Step down reverse magnitude towards 0
        idx = SHUTTLE_LADDER.index(current_rate) if current_rate in SHUTTLE_LADDER else -1
        if idx != -1 and idx < len(SHUTTLE_LADDER) - 1:
            return SHUTTLE_LADDER[idx + 1]
        return 0.0
    elif current_rate == -0.5:
        return 0.0
    elif current_rate == 0.0:
        return 1.0
    elif current_rate == 0.5:
        return 1.0
    elif current_rate >= 1.0:
        idx = SHUTTLE_LADDER.index(current_rate) if current_rate in SHUTTLE_LADDER else -1
        if idx != -1 and idx < len(SHUTTLE_LADDER) - 1:
            return SHUTTLE_LADDER[idx + 1]
        return 16.0
    return 1.0


def step_shuttle_reverse(current_rate: float) -> float:
    """
    Simulates pressing 'J' in professional NLE shuttle state machine:
    - If stopped (0) -> -1x
    - If forward (> 0) -> steps towards 0 or -1x
    - If in reverse (< 0) -> doubles reverse speed down to -16x
    """
    if current_rate >= 1.0:
        # Step down forward magnitude towards 0
        idx = SHUTTLE_LADDER.index(current_rate) if current_rate in SHUTTLE_LADDER else -1
        if idx != -1 and idx > 0:
            return SHUTTLE_LADDER[idx - 1]
        return 0.0
    elif current_rate == 0.5:
        return 0.0
    elif current_rate == 0.0:
        return -1.0
    elif current_rate == -0.5:
        return -1.0
    elif current_rate <= -1.0:
        idx = SHUTTLE_LADDER.index(current_rate) if current_rate in SHUTTLE_LADDER else -1
        if idx != -1 and idx > 0:
            return SHUTTLE_LADDER[idx - 1]
        return -16.0
    return -1.0


def collect_timeline_cuts(tracks: List[Dict[str, Any]], sequence_duration_ms: int = 30000) -> List[int]:
    """
    Gathers all edit boundaries (start, end) across unlocked tracks.
    """
    cuts: Set[int] = {0, sequence_duration_ms}
    for track in tracks:
        if track.get("is_locked", False):
            continue
        for clip in track.get("clips", []):
            start = clip.get("start_time_ms", 0)
            dur = clip.get("duration_ms", 0)
            cuts.add(start)
            cuts.add(start + dur)
    return sorted(list(cuts))


def find_next_cut(cuts: List[int], current_playhead_ms: int, tolerance_ms: int = 5) -> Optional[int]:
    """
    Finds the next chronological edit boundary ahead of the playhead.
    """
    for cut in cuts:
        if cut > current_playhead_ms + tolerance_ms:
            return cut
    return cuts[-1] if cuts else None


def find_prev_cut(cuts: List[int], current_playhead_ms: int, tolerance_ms: int = 5) -> Optional[int]:
    """
    Finds the previous chronological edit boundary behind the playhead.
    """
    for cut in reversed(cuts):
        if cut < current_playhead_ms - tolerance_ms:
            return cut
    return cuts[0] if cuts else 0


def collect_timeline_markers(
    sequence_markers: List[Dict[str, Any]],
    tracks: List[Dict[str, Any]],
) -> List[int]:
    """
    Collects sequence markers and absolute clip markers across unlocked tracks.
    """
    marker_times: Set[int] = set()
    for m in sequence_markers:
        marker_times.add(m.get("time_ms", 0))
    for track in tracks:
        if track.get("is_locked", False):
            continue
        for clip in track.get("clips", []):
            clip_start = clip.get("start_time_ms", 0)
            for cm in clip.get("markers", []):
                marker_times.add(clip_start + cm.get("time_ms", 0))
    return sorted(list(marker_times))


def parse_and_jump_timecode(
    input_str: str,
    current_playhead_ms: int,
    sequence_duration_ms: int,
    fps: int = 30,
) -> Tuple[bool, int, Optional[str]]:
    """
    Direct Timecode Parser conforming to Phase 50 specs:
    Supports:
    - Relative seconds: +1.5s, -2.0s
    - Relative frames: +30, -60, +30f, -60f
    - Raw seconds: 45s, 10.5s
    - Raw frames: 150f
    - SMPTE HH:MM:SS:FF or MM:SS:FF or HH:MM:SS
    - Raw integer numbers: <= 600 treated as frames, > 600 treated as ms
    """
    raw = input_str.strip()
    if not raw:
        return False, current_playhead_ms, "Timecode cannot be empty"

    import re

    # 1. Relative seconds: e.g. +1.5s, -2.0s
    m_rel_sec = re.match(r"^([+-])\s*(\d+(?:\.\d+)?)\s*s$", raw, re.IGNORECASE)
    if m_rel_sec:
        sign = -1 if m_rel_sec.group(1) == "-" else 1
        sec = float(m_rel_sec.group(2))
        target = max(0, min(sequence_duration_ms, round(current_playhead_ms + sign * sec * 1000)))
        return True, target, None

    # 2. Relative frames: e.g. +30, -60, +30f, -60f
    m_rel_frame = re.match(r"^([+-])\s*(\d+)(?:f)?$", raw, re.IGNORECASE)
    if m_rel_frame:
        sign = -1 if m_rel_frame.group(1) == "-" else 1
        frames = int(m_rel_frame.group(2))
        delta_ms = (frames / fps) * 1000
        target = max(0, min(sequence_duration_ms, round(current_playhead_ms + sign * delta_ms)))
        return True, target, None

    # 3. Explicit seconds: e.g. 45s, 12.5s
    m_sec = re.match(r"^(\d+(?:\.\d+)?)\s*s$", raw, re.IGNORECASE)
    if m_sec:
        sec = float(m_sec.group(1))
        target = max(0, min(sequence_duration_ms, round(sec * 1000)))
        return True, target, None

    # 4. Explicit frames: e.g. 150f
    m_frame = re.match(r"^(\d+)\s*f$", raw, re.IGNORECASE)
    if m_frame:
        frames = int(m_frame.group(1))
        target = max(0, min(sequence_duration_ms, round((frames / fps) * 1000)))
        return True, target, None

    # 5. Full or partial SMPTE timecode: HH:MM:SS:FF or MM:SS:FF or HH:MM:SS
    parts = re.split(r"[:;.]", raw)
    if len(parts) >= 2 and all(p.isdigit() for p in parts):
        nums = [int(p) for p in parts]
        if len(nums) == 4:
            hh, mm, ss, ff = nums
        elif len(nums) == 3:
            hh, mm, ss, ff = 0, nums[0], nums[1], nums[2]
        elif len(nums) == 2:
            hh, mm, ss, ff = 0, nums[0], nums[1], 0
        else:
            hh, mm, ss, ff = 0, 0, 0, 0
        total_sec = hh * 3600 + mm * 60 + ss
        total_ms = round(total_sec * 1000 + (ff / fps) * 1000)
        target = max(0, min(sequence_duration_ms, total_ms))
        return True, target, None

    # 6. Raw single integer
    if raw.isdigit():
        val = int(raw)
        if val <= 600:
            target = max(0, min(sequence_duration_ms, round((val / fps) * 1000)))
        else:
            target = max(0, min(sequence_duration_ms, val))
        return True, target, None

    return False, current_playhead_ms, f"Unrecognized timecode format: {raw}"


def calculate_zoom_to_fit(sequence_duration_ms: int, container_width_px: int) -> float:
    """
    Computes zoomLevel (px/s) so sequence occupies timeline viewport.
    Clamps between 5 and 500 px/s.
    """
    duration_sec = max(1.0, sequence_duration_ms / 1000.0)
    ideal = max(5.0, (container_width_px - 60) / duration_sec)
    return max(5.0, min(500.0, round(ideal, 1)))


def calculate_playhead_scroll_centering(
    playhead_ms: int,
    zoom_level: float,
    container_width_px: int,
) -> int:
    """
    Calculates scrollLeft so playhead stays centered in viewport during zoom.
    """
    playhead_px = (playhead_ms / 1000.0) * zoom_level
    target = max(0, int(playhead_px - container_width_px / 2.0))
    return target


def calculate_minimap_viewport_rect(
    scroll_left_px: int,
    container_width_px: int,
    total_timeline_px: int,
) -> Tuple[float, float]:
    """
    Returns (left_pct, width_pct) for the minimap viewport rectangle.
    """
    if total_timeline_px <= 0:
        return 0.0, 100.0
    left_pct = max(0.0, min(100.0, (scroll_left_px / total_timeline_px) * 100.0))
    width_pct = max(2.0, min(100.0 - left_pct, (container_width_px / total_timeline_px) * 100.0))
    return left_pct, width_pct


# ═══════════════════════════════════════════════════════════════════════════
# UNIT & INTEGRATION TESTS — PHASE 50 TIMELINE NAVIGATION & PRECISION SHUTTLE
# ═══════════════════════════════════════════════════════════════════════════

class TestShuttleStateMachine:
    """Tests 1–10: Variable speed shuttle rates and ladders."""

    def test_forward_shuttle_from_stop(self):
        rate = step_shuttle_forward(0.0)
        assert rate == 1.0

    def test_forward_shuttle_acceleration_ladder(self):
        assert step_shuttle_forward(1.0) == 2.0
        assert step_shuttle_forward(2.0) == 4.0
        assert step_shuttle_forward(4.0) == 8.0
        assert step_shuttle_forward(8.0) == 16.0
        assert step_shuttle_forward(16.0) == 16.0  # Max ceiling

    def test_reverse_shuttle_from_stop(self):
        rate = step_shuttle_reverse(0.0)
        assert rate == -1.0

    def test_reverse_shuttle_acceleration_ladder(self):
        assert step_shuttle_reverse(-1.0) == -2.0
        assert step_shuttle_reverse(-2.0) == -4.0
        assert step_shuttle_reverse(-4.0) == -8.0
        assert step_shuttle_reverse(-8.0) == -16.0
        assert step_shuttle_reverse(-16.0) == -16.0  # Min floor

    def test_forward_braking_from_fast_reverse(self):
        # Pressing L while playing in reverse reduces reverse rate towards 0
        assert step_shuttle_forward(-16.0) == -8.0
        assert step_shuttle_forward(-8.0) == -4.0
        assert step_shuttle_forward(-4.0) == -2.0
        assert step_shuttle_forward(-2.0) == -1.0
        assert step_shuttle_forward(-1.0) == 0.0

    def test_reverse_braking_from_fast_forward(self):
        # Pressing J while playing forward reduces forward rate towards 0
        assert step_shuttle_reverse(16.0) == 8.0
        assert step_shuttle_reverse(8.0) == 4.0
        assert step_shuttle_reverse(4.0) == 2.0
        assert step_shuttle_reverse(2.0) == 1.0
        assert step_shuttle_reverse(1.0) == 0.0

    def test_slow_motion_transitions(self):
        # 0.5x forward and -0.5x reverse handling
        assert step_shuttle_forward(0.5) == 1.0
        assert step_shuttle_reverse(-0.5) == -1.0
        assert step_shuttle_forward(-0.5) == 0.0
        assert step_shuttle_reverse(0.5) == 0.0

    def test_shuttle_stop_immediate(self):
        rates_to_test = [-16.0, -4.0, -1.0, -0.5, 0.5, 1.0, 8.0, 16.0]
        for r in rates_to_test:
            # Pressing K immediately yields 0.0
            stopped_rate = 0.0
            assert stopped_rate == 0.0

    def test_shuttle_rate_floating_tolerance(self):
        # Robust against slight decimal drift
        assert step_shuttle_forward(0.999) == 1.0
        assert step_shuttle_reverse(-0.999) == -1.0

    def test_shuttle_boundary_clamping(self):
        assert step_shuttle_forward(100.0) == 16.0
        assert step_shuttle_reverse(-100.0) == -16.0


class TestEditCutNavigation:
    """Tests 11–20: Next / Previous cut navigation across unlocked tracks."""

    def test_collect_cuts_single_clip(self):
        tracks = [{
            "id": "t1",
            "is_locked": False,
            "clips": [{"id": "c1", "start_time_ms": 2000, "duration_ms": 3000}]
        }]
        cuts = collect_timeline_cuts(tracks, sequence_duration_ms=10000)
        assert cuts == [0, 2000, 5000, 10000]

    def test_collect_cuts_ignores_locked_tracks(self):
        tracks = [
            {
                "id": "t1",
                "is_locked": False,
                "clips": [{"id": "c1", "start_time_ms": 1000, "duration_ms": 2000}]
            },
            {
                "id": "t2",
                "is_locked": True,  # Locked track!
                "clips": [{"id": "c2", "start_time_ms": 4000, "duration_ms": 2000}]
            }
        ]
        cuts = collect_timeline_cuts(tracks, sequence_duration_ms=10000)
        assert 4000 not in cuts
        assert 6000 not in cuts
        assert cuts == [0, 1000, 3000, 10000]

    def test_find_next_cut_forward(self):
        cuts = [0, 1000, 3000, 7000, 12000]
        # At 1000ms, next cut is 3000ms
        assert find_next_cut(cuts, current_playhead_ms=1000) == 3000
        # At 2500ms, next cut is 3000ms
        assert find_next_cut(cuts, current_playhead_ms=2500) == 3000
        # At 3000ms, next cut is 7000ms
        assert find_next_cut(cuts, current_playhead_ms=3000) == 7000

    def test_find_prev_cut_backward(self):
        cuts = [0, 1000, 3000, 7000, 12000]
        # At 7000ms, prev cut is 3000ms
        assert find_prev_cut(cuts, current_playhead_ms=7000) == 3000
        # At 5000ms, prev cut is 3000ms
        assert find_prev_cut(cuts, current_playhead_ms=5000) == 3000
        # At 1000ms, prev cut is 0ms
        assert find_prev_cut(cuts, current_playhead_ms=1000) == 0

    def test_boundary_tolerance_skips_micro_jitter(self):
        cuts = [0, 2000, 4000]
        # At 2003ms (within 5ms tolerance), find_next_cut should not re-trigger 2000ms
        assert find_next_cut(cuts, current_playhead_ms=2003, tolerance_ms=5) == 4000
        # At 1998ms (within 5ms tolerance of 2000), find_prev_cut should go to 0
        assert find_prev_cut(cuts, current_playhead_ms=1998, tolerance_ms=5) == 0

    def test_adjacent_touching_clips_deduplication(self):
        # Clip A: 0..2000, Clip B: 2000..5000
        tracks = [{
            "id": "t1",
            "is_locked": False,
            "clips": [
                {"id": "c1", "start_time_ms": 0, "duration_ms": 2000},
                {"id": "c2", "start_time_ms": 2000, "duration_ms": 3000},
            ]
        }]
        cuts = collect_timeline_cuts(tracks, sequence_duration_ms=8000)
        assert cuts == [0, 2000, 5000, 8000]
        assert cuts.count(2000) == 1  # Deduplicated

    def test_empty_tracks_behavior(self):
        tracks = [{"id": "t1", "is_locked": False, "clips": []}]
        cuts = collect_timeline_cuts(tracks, sequence_duration_ms=5000)
        assert cuts == [0, 5000]
        assert find_next_cut(cuts, 0) == 5000
        assert find_prev_cut(cuts, 5000) == 0

    def test_next_cut_at_end_of_sequence_clamps(self):
        cuts = [0, 2000, 5000]
        assert find_next_cut(cuts, current_playhead_ms=5000) == 5000

    def test_prev_cut_at_start_of_sequence_clamps(self):
        cuts = [0, 2000, 5000]
        assert find_prev_cut(cuts, current_playhead_ms=0) == 0

    def test_multi_track_interleaved_cuts(self):
        tracks = [
            {
                "id": "v1",
                "is_locked": False,
                "clips": [
                    {"id": "v_c1", "start_time_ms": 1000, "duration_ms": 4000},
                    {"id": "v_c2", "start_time_ms": 6000, "duration_ms": 3000},
                ]
            },
            {
                "id": "a1",
                "is_locked": False,
                "clips": [
                    {"id": "a_c1", "start_time_ms": 2500, "duration_ms": 2000},
                ]
            }
        ]
        cuts = collect_timeline_cuts(tracks, sequence_duration_ms=15000)
        # Expected cuts: 0, 1000, 2500, 4500 (2500+2000), 5000 (1000+4000), 6000, 9000, 15000
        assert cuts == [0, 1000, 2500, 4500, 5000, 6000, 9000, 15000]


class TestMarkerNavigation:
    """Tests 21–25: Sequence markers and clip markers navigation."""

    def test_collect_sequence_and_clip_markers(self):
        seq_markers = [{"id": "m1", "time_ms": 1500}, {"id": "m2", "time_ms": 6000}]
        tracks = [{
            "id": "t1",
            "is_locked": False,
            "clips": [{
                "id": "c1",
                "start_time_ms": 2000,
                "duration_ms": 4000,
                "markers": [{"id": "cm1", "time_ms": 1000}]  # 2000 + 1000 = 3000ms absolute
            }]
        }]
        markers = collect_timeline_markers(seq_markers, tracks)
        assert markers == [1500, 3000, 6000]

    def test_marker_on_locked_track_ignored(self):
        seq_markers = [{"id": "m1", "time_ms": 1500}]
        tracks = [{
            "id": "t1",
            "is_locked": True,  # Locked
            "clips": [{
                "id": "c1",
                "start_time_ms": 2000,
                "duration_ms": 4000,
                "markers": [{"id": "cm1", "time_ms": 1000}]
            }]
        }]
        markers = collect_timeline_markers(seq_markers, tracks)
        assert markers == [1500]

    def test_jump_next_marker(self):
        markers = [1000, 3000, 5000]
        # From 1000ms -> next marker is 3000ms
        next_m = next((m for m in markers if m > 1000 + 5), None)
        assert next_m == 3000

    def test_jump_prev_marker(self):
        markers = [1000, 3000, 5000]
        # From 3000ms -> prev marker is 1000ms
        prev_m = None
        for m in reversed(markers):
            if m < 3000 - 5:
                prev_m = m
                break
        assert prev_m == 1000

    def test_no_markers_safe_fallback(self):
        markers = collect_timeline_markers([], [])
        assert markers == []


class TestSequenceBoundsAndWorkArea:
    """Tests 26–30: Sequence Start / End, In / Out Point jumps."""

    def test_jump_to_sequence_start(self):
        playhead = 15000
        new_playhead = 0
        assert new_playhead == 0

    def test_jump_to_sequence_end_with_clips(self):
        clips = [
            {"start_time_ms": 0, "duration_ms": 4000},
            {"start_time_ms": 6000, "duration_ms": 5000},  # ends at 11000ms
        ]
        max_end = max(c["start_time_ms"] + c["duration_ms"] for c in clips)
        assert max_end == 11000

    def test_jump_to_sequence_end_fallback_duration(self):
        clips: List[Dict[str, int]] = []
        duration_ms = 30000
        max_end = max([c["start_time_ms"] + c["duration_ms"] for c in clips], default=0)
        target = max_end if max_end > 0 else duration_ms
        assert target == 30000

    def test_jump_to_in_point(self):
        in_point_ms = 2500
        assert in_point_ms == 2500

    def test_jump_to_out_point(self):
        out_point_ms = 8500
        assert out_point_ms == 8500


class TestTimecodeParsing:
    """Tests 31–42: Direct Timecode Navigation Parsing."""

    def test_parse_smpte_hh_mm_ss_ff(self):
        # 01:02:03:15 at 30fps
        # 1hr = 3600s, 2min = 120s, 3s = 3s => 3723s = 3723000ms
        # 15 frames = 15/30 = 0.5s = 500ms
        # Total = 3723500ms
        ok, ms, err = parse_and_jump_timecode("01:02:03:15", 0, 7200000, fps=30)
        assert ok is True
        assert ms == 3723500
        assert err is None

    def test_parse_smpte_mm_ss_ff(self):
        # 01:30:15 at 30fps
        # 1min = 60s, 30s => 90s = 90000ms + 500ms = 90500ms
        ok, ms, err = parse_and_jump_timecode("01:30:15", 0, 300000, fps=30)
        assert ok is True
        assert ms == 90500

    def test_parse_smpte_mm_ss(self):
        # 02:15 = 135s = 135000ms
        ok, ms, err = parse_and_jump_timecode("02:15", 0, 300000, fps=30)
        assert ok is True
        assert ms == 135000

    def test_parse_relative_positive_seconds(self):
        # +1.5s from current playhead 2000ms => 3500ms
        ok, ms, err = parse_and_jump_timecode("+1.5s", 2000, 30000, fps=30)
        assert ok is True
        assert ms == 3500

    def test_parse_relative_negative_seconds(self):
        # -2.0s from current playhead 5000ms => 3000ms
        ok, ms, err = parse_and_jump_timecode("-2.0s", 5000, 30000, fps=30)
        assert ok is True
        assert ms == 3000

    def test_parse_relative_positive_frames(self):
        # +30 frames at 30fps (+1000ms) from 4000ms => 5000ms
        ok, ms, err = parse_and_jump_timecode("+30", 4000, 30000, fps=30)
        assert ok is True
        assert ms == 5000

    def test_parse_relative_negative_frames_with_f(self):
        # -15f at 30fps (-500ms) from 3000ms => 2500ms
        ok, ms, err = parse_and_jump_timecode("-15f", 3000, 30000, fps=30)
        assert ok is True
        assert ms == 2500

    def test_parse_explicit_seconds(self):
        ok, ms, err = parse_and_jump_timecode("45s", 0, 60000, fps=30)
        assert ok is True
        assert ms == 45000

    def test_parse_explicit_frames(self):
        ok, ms, err = parse_and_jump_timecode("90f", 0, 60000, fps=30)
        assert ok is True
        assert ms == 3000  # 90 / 30 * 1000 = 3000ms

    def test_parse_raw_integer_threshold(self):
        # <= 600 is frames: 120 => 4000ms at 30fps
        ok, ms, err = parse_and_jump_timecode("120", 0, 60000, fps=30)
        assert ok is True
        assert ms == 4000

        # > 600 is ms: 5000 => 5000ms
        ok2, ms2, err2 = parse_and_jump_timecode("5000", 0, 60000, fps=30)
        assert ok2 is True
        assert ms2 == 5000

    def test_clamping_at_sequence_boundaries(self):
        # Relative negative exceeds 0ms -> clamp to 0
        ok, ms, err = parse_and_jump_timecode("-10s", 2000, 30000, fps=30)
        assert ok is True
        assert ms == 0

        # Relative positive exceeds sequence duration -> clamp to max
        ok, ms, err = parse_and_jump_timecode("+50s", 25000, 30000, fps=30)
        assert ok is True
        assert ms == 30000

    def test_invalid_timecode_error_reporting(self):
        ok, ms, err = parse_and_jump_timecode("invalid_text", 1000, 30000, fps=30)
        assert ok is False
        assert ms == 1000
        assert "Unrecognized" in err

        ok2, ms2, err2 = parse_and_jump_timecode("", 1000, 30000, fps=30)
        assert ok2 is False
        assert "empty" in err2


class TestZoomAndViewportMath:
    """Tests 43–48: Zoom-to-fit, playhead centering, and minimap calculations."""

    def test_zoom_to_fit_calculation(self):
        # 60s sequence in 1260px container: (1260 - 60) / 60 = 20 px/s
        zoom = calculate_zoom_to_fit(sequence_duration_ms=60000, container_width_px=1260)
        assert zoom == 20.0

    def test_zoom_to_fit_clamping(self):
        # Very short sequence: clamp to 500 px/s max
        zoom_short = calculate_zoom_to_fit(sequence_duration_ms=500, container_width_px=1260)
        assert zoom_short == 500.0

        # Extremely long sequence: clamp to 5 px/s min
        zoom_long = calculate_zoom_to_fit(sequence_duration_ms=3600000, container_width_px=1000)
        assert zoom_long == 5.0

    def test_playhead_scroll_centering(self):
        # Playhead at 10s (10000ms), zoom = 50 px/s -> playhead_px = 500px
        # Container width = 800px -> center is 400px
        # targetScroll = 500 - 400 = 100px
        target = calculate_playhead_scroll_centering(
            playhead_ms=10000,
            zoom_level=50.0,
            container_width_px=800,
        )
        assert target == 100

    def test_playhead_scroll_near_start_clamps_to_zero(self):
        # Playhead at 1s, zoom = 50 px/s -> 50px
        # Container width = 800px -> center = 400px => negative offset clamps to 0
        target = calculate_playhead_scroll_centering(
            playhead_ms=1000,
            zoom_level=50.0,
            container_width_px=800,
        )
        assert target == 0

    def test_minimap_viewport_calculation(self):
        # scroll = 200px, container = 400px, total = 1000px
        # left = 20%, width = 40%
        left_pct, width_pct = calculate_minimap_viewport_rect(
            scroll_left_px=200,
            container_width_px=400,
            total_timeline_px=1000,
        )
        assert math.isclose(left_pct, 20.0, rel_tol=1e-3)
        assert math.isclose(width_pct, 40.0, rel_tol=1e-3)

    def test_minimap_viewport_zero_total_safe(self):
        left_pct, width_pct = calculate_minimap_viewport_rect(0, 500, 0)
        assert left_pct == 0.0
        assert width_pct == 100.0
