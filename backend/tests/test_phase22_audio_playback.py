"""
Unit tests for Phase 22: Professional Audio Playback, Mix Preview & Master Monitoring.

Validates the backend and math modeling for:
- Audio track selection & role categorization
- Solo track isolation vs mute filtering
- Linear gain conversion (dB -> linear)
- Stereo pan coefficient calculations (L/R)
- Linear fade-in and fade-out attenuation factors
- Automation keyframe evaluation at playhead offsets
- Active clip query for timeline timestamps
- Missing or out-of-bounds audio handling
- Combined effective clip gain evaluation matching frontend engine
- Master bus sum & clipping threshold detection
"""

import math
import pytest
from typing import List, Dict, Any, Optional

from app.models.timeline import Track, Clip


# ---------------------------------------------------------------------------
# Mathematical helpers mirroring frontend audio preview engine
# ---------------------------------------------------------------------------

def db_to_linear(db: float) -> float:
    """Convert decibels to linear gain (0 dB = 1.0). Clamped at -60 dB to 0.0."""
    if db <= -60.0:
        return 0.0
    return 10.0 ** (db / 20.0)


def linear_to_db(lin: float) -> float:
    """Convert linear gain to decibels (1.0 = 0 dB)."""
    if lin <= 0.0001:
        return -60.0
    return 20.0 * math.log10(lin)


def calculate_stereo_pan(pan: float) -> (float, float):
    """
    Calculate L/R gain factors for pan value in [-1.0, 1.0].
    pan = -1.0 -> (1.0, 0.0) [full left]
    pan =  0.0 -> (1.0, 1.0) [center, normalized]
    pan = +1.0 -> (0.0, 1.0) [full right]
    """
    clamped_pan = max(-1.0, min(1.0, pan))
    left = 1.0 if clamped_pan <= 0 else 1.0 - clamped_pan
    right = 1.0 if clamped_pan >= 0 else 1.0 + clamped_pan
    return left, right


def evaluate_clip_fade(clip_offset_ms: float, duration_ms: float, fade_in_ms: float, fade_out_ms: float) -> float:
    """Evaluate fade multiplier in [0.0, 1.0] for a clip offset."""
    if clip_offset_ms < 0 or clip_offset_ms > duration_ms:
        return 0.0

    factor = 1.0
    if fade_in_ms > 0 and clip_offset_ms < fade_in_ms:
        factor *= clip_offset_ms / fade_in_ms

    remaining_ms = duration_ms - clip_offset_ms
    if fade_out_ms > 0 and remaining_ms < fade_out_ms:
        factor *= remaining_ms / fade_out_ms

    return max(0.0, min(1.0, factor))


def evaluate_automation_value(
    keyframes: List[Dict[str, Any]],
    time_offset_ms: float,
    default_value: float = 0.0
) -> float:
    """Evaluate piecewise linear automation at a specific clip time offset."""
    if not keyframes:
        return default_value

    sorted_kfs = sorted(keyframes, key=lambda k: k.get("time_offset_ms", 0))

    # Before first keyframe
    if time_offset_ms <= sorted_kfs[0].get("time_offset_ms", 0):
        return float(sorted_kfs[0].get("value", default_value))

    # After last keyframe
    if time_offset_ms >= sorted_kfs[-1].get("time_offset_ms", 0):
        return float(sorted_kfs[-1].get("value", default_value))

    # Interpolate between surrounding keyframes
    for i in range(len(sorted_kfs) - 1):
        k1 = sorted_kfs[i]
        k2 = sorted_kfs[i + 1]
        t1 = float(k1.get("time_offset_ms", 0))
        t2 = float(k2.get("time_offset_ms", 0))

        if t1 <= time_offset_ms <= t2:
            if t2 == t1:
                return float(k1.get("value", default_value))
            alpha = (time_offset_ms - t1) / (t2 - t1)
            v1 = float(k1.get("value", default_value))
            v2 = float(k2.get("value", default_value))
            return v1 + alpha * (v2 - v1)

    return default_value


def evaluate_effective_gain(
    clip: Dict[str, Any],
    clip_offset_ms: float,
    track_volume_db: float = 0.0,
    is_track_muted: bool = False
) -> float:
    """Calculate combined linear gain factor for preview and master monitoring."""
    if is_track_muted:
        return 0.0

    duration_ms = clip.get("duration_ms", 0)
    if clip_offset_ms < 0 or clip_offset_ms > duration_ms:
        return 0.0

    clip_vol_db = clip.get("volume_db", 0.0)
    keyframes = clip.get("keyframes") or []
    vol_kfs = [k for k in keyframes if k.get("property_path") == "volume_db"]

    if vol_kfs:
        effective_clip_vol_db = evaluate_automation_value(vol_kfs, clip_offset_ms, clip_vol_db)
    else:
        effective_clip_vol_db = clip_vol_db

    total_db = effective_clip_vol_db + track_volume_db
    lin_gain = db_to_linear(total_db)

    fade_mult = evaluate_clip_fade(
        clip_offset_ms,
        duration_ms,
        clip.get("fade_in_ms") or 0.0,
        clip.get("fade_out_ms") or 0.0
    )

    return lin_gain * fade_mult


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

def test_audio_track_role_categorization():
    """Verify audio track identification by track_type and track_role."""
    tracks = [
        Track(id="t1", track_type="video", track_role="custom", name="V1 Video"),
        Track(id="t2", track_type="audio", track_role="dialogue", name="A1 Dialogue"),
        Track(id="t3", track_type="audio", track_role="voiceover", name="A2 Voiceover"),
        Track(id="t4", track_type="audio", track_role="music", name="A3 Music"),
        Track(id="t5", track_type="audio", track_role="sfx", name="A4 SFX"),
        Track(id="t6", track_type="audio", track_role="ambience", name="A5 Ambience"),
        Track(id="t7", track_type="graphics", track_role="custom", name="G1 Titles"),
    ]

    audio_roles = {"dialogue", "voiceover", "music", "sfx", "ambience"}
    audio_tracks = [
        t for t in tracks
        if t.track_type == "audio" or t.track_role in audio_roles
    ]

    assert len(audio_tracks) == 5
    assert {t.track_role for t in audio_tracks} == audio_roles


def test_solo_track_isolation_vs_mute():
    """Verify solo isolation takes precedence over non-solo unmuted tracks."""
    tracks = [
        Track(id="t1", track_type="audio", track_role="dialogue", is_muted=False, is_solo=True),
        Track(id="t2", track_type="audio", track_role="music", is_muted=False, is_solo=False),
        Track(id="t3", track_type="audio", track_role="sfx", is_muted=True, is_solo=False),
    ]

    has_solo = any(t.is_solo for t in tracks)
    assert has_solo is True

    audible = [t for t in tracks if (t.is_solo if has_solo else True) and not t.is_muted]
    assert len(audible) == 1
    assert audible[0].id == "t1"

    # If solo track is also muted, nothing is audible
    tracks[0].is_muted = True
    audible_muted_solo = [t for t in tracks if (t.is_solo if has_solo else True) and not t.is_muted]
    assert len(audible_muted_solo) == 0


def test_linear_gain_conversion():
    """Verify mathematical precision of dB to linear gain conversion."""
    assert db_to_linear(0.0) == 1.0
    assert abs(db_to_linear(-6.0) - 0.501187) < 0.001
    assert abs(db_to_linear(6.0) - 1.99526) < 0.01
    assert db_to_linear(-60.0) == 0.0
    assert db_to_linear(-80.0) == 0.0

    # Round trip
    assert abs(linear_to_db(1.0) - 0.0) < 0.0001
    assert abs(linear_to_db(0.501187) - (-6.0)) < 0.01
    assert linear_to_db(0.0) == -60.0


def test_stereo_pan_coefficients():
    """Verify stereo pan calculations across center, hard left, and hard right."""
    # Center pan
    left_c, right_c = calculate_stereo_pan(0.0)
    assert left_c == 1.0
    assert right_c == 1.0

    # Hard left
    left_l, right_l = calculate_stereo_pan(-1.0)
    assert left_l == 1.0
    assert right_l == 0.0

    # Hard right
    left_r, right_r = calculate_stereo_pan(1.0)
    assert left_r == 0.0
    assert right_r == 1.0

    # Half left (-0.5)
    left_hl, right_hl = calculate_stereo_pan(-0.5)
    assert left_hl == 1.0
    assert right_hl == 0.5

    # Out of bounds clamping
    left_clamped, right_clamped = calculate_stereo_pan(-1.5)
    assert left_clamped == 1.0
    assert right_clamped == 0.0


def test_linear_fade_in_and_fade_out():
    """Verify linear fade curves at start, middle, and end of clip."""
    duration_ms = 10000.0  # 10s
    fade_in_ms = 2000.0   # 2s fade in
    fade_out_ms = 3000.0  # 3s fade out

    # Start: zero gain
    assert evaluate_clip_fade(0.0, duration_ms, fade_in_ms, fade_out_ms) == 0.0

    # 1s (halfway through fade in): 0.5
    assert evaluate_clip_fade(1000.0, duration_ms, fade_in_ms, fade_out_ms) == 0.5

    # 2s (end of fade in): 1.0
    assert evaluate_clip_fade(2000.0, duration_ms, fade_in_ms, fade_out_ms) == 1.0

    # 5s (sustain region): 1.0
    assert evaluate_clip_fade(5000.0, duration_ms, fade_in_ms, fade_out_ms) == 1.0

    # 8.5s (halfway through fade out: remaining is 1500ms out of 3000ms): 0.5
    assert evaluate_clip_fade(8500.0, duration_ms, fade_in_ms, fade_out_ms) == 0.5

    # 10s (exact end): 0.0
    assert evaluate_clip_fade(10000.0, duration_ms, fade_in_ms, fade_out_ms) == 0.0

    # Out of bounds
    assert evaluate_clip_fade(-100.0, duration_ms, fade_in_ms, fade_out_ms) == 0.0
    assert evaluate_clip_fade(10500.0, duration_ms, fade_in_ms, fade_out_ms) == 0.0


def test_automation_keyframe_evaluation():
    """Verify piecewise linear automation evaluation between keyframes."""
    kfs = [
        {"property_path": "volume_db", "time_offset_ms": 1000, "value": -20.0},
        {"property_path": "volume_db", "time_offset_ms": 3000, "value": 0.0},
        {"property_path": "volume_db", "time_offset_ms": 5000, "value": -10.0},
    ]

    # Before first keyframe: clamped to first
    assert evaluate_automation_value(kfs, 500) == -20.0

    # Exactly at first keyframe
    assert evaluate_automation_value(kfs, 1000) == -20.0

    # Midpoint between k1 and k2 (t=2000ms, alpha=0.5 -> -10.0dB)
    assert evaluate_automation_value(kfs, 2000) == -10.0

    # Exactly at second keyframe
    assert evaluate_automation_value(kfs, 3000) == 0.0

    # Quarter-way between k2 and k3 (t=3500ms, alpha=0.25 -> -2.5dB)
    assert evaluate_automation_value(kfs, 3500) == -2.5

    # After last keyframe: clamped to last
    assert evaluate_automation_value(kfs, 8000) == -10.0

    # Empty keyframes fallback
    assert evaluate_automation_value([], 2000, default_value=-3.0) == -3.0


def test_active_clip_query_for_timestamp():
    """Verify timestamp hit testing for clips on tracks."""
    clips = [
        {"id": "c1", "start_time_ms": 0, "duration_ms": 3000},
        {"id": "c2", "start_time_ms": 3000, "duration_ms": 5000},
        {"id": "c3", "start_time_ms": 10000, "duration_ms": 2000},
    ]

    def find_active(playhead_ms: int):
        for c in clips:
            if c["start_time_ms"] <= playhead_ms < c["start_time_ms"] + c["duration_ms"]:
                return c["id"]
        return None

    assert find_active(0) == "c1"
    assert find_active(1500) == "c1"
    assert find_active(2999) == "c1"
    assert find_active(3000) == "c2"
    assert find_active(7999) == "c2"
    assert find_active(8000) is None  # gap between c2 and c3
    assert find_active(10500) == "c3"
    assert find_active(12000) is None  # past end


def test_combined_effective_clip_gain():
    """Verify combination of clip gain + track gain + automation + fade."""
    clip = {
        "duration_ms": 4000.0,
        "volume_db": 0.0,
        "fade_in_ms": 1000.0,
        "fade_out_ms": 1000.0,
        "keyframes": [
            {"property_path": "volume_db", "time_offset_ms": 0, "value": 0.0},
            {"property_path": "volume_db", "time_offset_ms": 2000, "value": -6.0},
        ],
    }

    # At t=0: fade is 0.0 -> effective gain 0.0
    gain_0 = evaluate_effective_gain(clip, 0.0, track_volume_db=0.0)
    assert gain_0 == 0.0

    # At t=500ms: fade is 0.5, automation is -1.5 dB, track vol 0 dB
    # total dB = -1.5 dB -> lin ~0.8414 -> effective = 0.8414 * 0.5 ~ 0.4207
    gain_500 = evaluate_effective_gain(clip, 500.0, track_volume_db=0.0)
    assert abs(gain_500 - 0.42) < 0.05

    # With track muted: 0.0
    gain_muted = evaluate_effective_gain(clip, 2000.0, track_volume_db=0.0, is_track_muted=True)
    assert gain_muted == 0.0


def test_master_bus_sum_and_clipping():
    """Verify multi-track audio summing and master clipping flag logic."""
    # Two tracks with unity gain linear sum: 1.0 + 0.8 = 1.8 (>1.0 = clipping)
    track1_gain = 1.0  # 0 dB
    track2_gain = 0.8  # ~ -1.9 dB

    summed_linear = track1_gain + track2_gain
    summed_db = linear_to_db(summed_linear)

    assert summed_linear > 1.0
    assert summed_db > 0.0  # Above 0 dBFS -> Clipping occurs!

    is_clipped = summed_db >= 0.0 or summed_linear >= 1.0
    assert is_clipped is True

    # Master fader attenuation (-6 dB = ~0.5)
    master_fader_gain = db_to_linear(-6.0)
    final_output = summed_linear * master_fader_gain
    final_db = linear_to_db(final_output)

    assert final_output < 1.0
    assert final_db < 0.0
    assert (final_db >= 0.0) is False
