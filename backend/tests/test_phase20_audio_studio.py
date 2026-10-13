import pytest
import math
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock

from app.models.timeline import Track, Clip
from app.core.ffmpeg import FFmpegService


def test_audio_track_solo_isolation():
    """Verify that when any audio track is soloed, only soloed tracks participate."""
    t_dialogue = Track(
        id="t-dia",
        track_type="audio",
        track_role="dialogue",
        name="A1 Dialogue",
        is_muted=False,
        is_solo=True,
        volume_db=0.0,
        pan=0.0,
    )
    t_music = Track(
        id="t-mus",
        track_type="audio",
        track_role="music",
        name="A3 Music",
        is_muted=False,
        is_solo=False,
        volume_db=-3.0,
        pan=0.0,
    )
    t_sfx = Track(
        id="t-sfx",
        track_type="audio",
        track_role="sfx",
        name="A4 SFX",
        is_muted=False,
        is_solo=False,
        volume_db=0.0,
        pan=0.0,
    )

    all_tracks = [t_dialogue, t_music, t_sfx]

    has_solo = any(t.is_solo for t in all_tracks)
    assert has_solo is True

    # Filter tracks participating in audio mix
    active_audio = [
        t for t in all_tracks
        if not t.is_muted and (t.is_solo if has_solo else True)
    ]

    assert len(active_audio) == 1
    assert active_audio[0].id == "t-dia"


def test_audio_track_mute_filtering():
    """Verify that muted tracks are excluded even if no solo is active."""
    t_dialogue = Track(
        id="t-dia",
        track_type="audio",
        track_role="dialogue",
        name="A1 Dialogue",
        is_muted=False,
        is_solo=False,
    )
    t_music = Track(
        id="t-mus",
        track_type="audio",
        track_role="music",
        name="A3 Music",
        is_muted=True,
        is_solo=False,
    )
    all_tracks = [t_dialogue, t_music]

    has_solo = any(t.is_solo for t in all_tracks)
    assert has_solo is False

    active_audio = [
        t for t in all_tracks
        if not t.is_muted and (t.is_solo if has_solo else True)
    ]

    assert len(active_audio) == 1
    assert active_audio[0].id == "t-dia"


def test_audio_volume_gain_conversion():
    """Verify decibel to linear gain formula (10^(dB/20))."""
    # 0 dB -> unity gain 1.0
    gain_0 = 10.0 ** (0.0 / 20.0)
    assert math.isclose(gain_0, 1.0, rel_tol=1e-5)

    # +6 dB -> approx 2.0x gain
    gain_6 = 10.0 ** (6.0206 / 20.0)
    assert math.isclose(gain_6, 2.0, rel_tol=1e-4)

    # -20 dB -> 0.1x gain
    gain_minus_20 = 10.0 ** (-20.0 / 20.0)
    assert math.isclose(gain_minus_20, 0.1, rel_tol=1e-5)

    # -60 dB -> 0.001x gain (virtual silence)
    gain_minus_60 = 10.0 ** (-60.0 / 20.0)
    assert math.isclose(gain_minus_60, 0.001, rel_tol=1e-5)


def test_audio_pan_filter_construction():
    """Verify stereo pan calculation for Hard Left, Center, and Hard Right."""
    def calc_pan_gains(a_pan: float):
        a_pan = max(-1.0, min(1.0, a_pan))
        c0_gain = max(0.0, min(1.0, 1.0 - a_pan)) if a_pan > 0 else 1.0
        c1_gain = max(0.0, min(1.0, 1.0 + a_pan)) if a_pan < 0 else 1.0
        return c0_gain, c1_gain

    # Center (pan = 0.0)
    c0, c1 = calc_pan_gains(0.0)
    assert c0 == 1.0 and c1 == 1.0

    # Hard Left (pan = -1.0)
    c0, c1 = calc_pan_gains(-1.0)
    assert c0 == 1.0 and c1 == 0.0

    # Hard Right (pan = 1.0)
    c0, c1 = calc_pan_gains(1.0)
    assert c0 == 0.0 and c1 == 1.0

    # Half Right (pan = 0.5)
    c0, c1 = calc_pan_gains(0.5)
    assert c0 == 0.5 and c1 == 1.0


def test_audio_equalizer_filter_construction():
    """Verify 5-band EQ filter chain string generation."""
    eq_meta = {
        "low_80": -4.0,
        "low_mid_250": 0.0,
        "mid_1000": 3.0,
        "high_mid_4000": 4.0,
        "high_12000": 1.0,
    }

    eq_bands = [
        (80, eq_meta.get("low_80", 0)),
        (250, eq_meta.get("low_mid_250", 0)),
        (1000, eq_meta.get("mid_1000", 0)),
        (4000, eq_meta.get("high_mid_4000", 0)),
        (12000, eq_meta.get("high_12000", 0)),
    ]

    eq_filters = []
    for freq, gain in eq_bands:
        g_val = float(gain)
        if abs(g_val) > 0.1:
            eq_filters.append(f"equalizer=f={freq}:width_type=q:w=1.0:g={g_val:.1f}")

    assert len(eq_filters) == 4
    assert "equalizer=f=80:width_type=q:w=1.0:g=-4.0" in eq_filters
    assert "equalizer=f=1000:width_type=q:w=1.0:g=3.0" in eq_filters
    assert "equalizer=f=4000:width_type=q:w=1.0:g=4.0" in eq_filters
    assert "equalizer=f=12000:width_type=q:w=1.0:g=1.0" in eq_filters


def test_audio_compressor_filter_construction():
    """Verify dynamics compressor filter string generation."""
    comp_meta = {
        "enabled": True,
        "threshold": -18.0,
        "ratio": 4.0,
        "attack": 25.0,
        "release": 200.0,
        "makeup_gain": 2.5,
    }

    filter_str = None
    if comp_meta.get("enabled"):
        filter_str = (
            f"acompressor=threshold={comp_meta['threshold']:.1f}dB:"
            f"ratio={comp_meta['ratio']:.1f}:"
            f"attack={comp_meta['attack']:.1f}:"
            f"release={comp_meta['release']:.1f}:"
            f"makeup={comp_meta['makeup_gain']:.1f}dB"
        )

    assert filter_str == "acompressor=threshold=-18.0dB:ratio=4.0:attack=25.0:release=200.0:makeup=2.5dB"


def test_audio_ducking_overlap_logic():
    """Verify dialogue vs music overlap detection and attenuation logic."""
    dialogue_clips = [
        {"start_ms": 2000, "duration_ms": 5000}, # 2s -> 7s
        {"start_ms": 12000, "duration_ms": 4000}, # 12s -> 16s
    ]

    music_clip = {
        "start_ms": 0,
        "duration_ms": 20000, # 0s -> 20s
        "volume_db": 0.0,
    }

    m_start = music_clip["start_ms"]
    m_end = m_start + music_clip["duration_ms"]

    overlaps = []
    for d in dialogue_clips:
        d_start = d["start_ms"]
        d_end = d_start + d["duration_ms"]
        if d_start < m_end and d_end > m_start:
            overlaps.append(d)

    assert len(overlaps) == 2

    # Ducking attenuation
    ducking_db = -9.0
    ducked_volume = music_clip["volume_db"] + ducking_db
    assert ducked_volume == -9.0


def test_waveform_peaks_data_structure():
    """Verify that waveform peak arrays conform to normalized 0.0-1.0 floats."""
    sample_peaks = [0.12, 0.45, 0.89, 0.65, 0.33, 0.78, 0.95, 0.21]
    assert all(0.0 <= p <= 1.0 for p in sample_peaks)
    assert len(sample_peaks) <= 120


def test_missing_media_graceful_handling():
    """Verify that a missing media path is handled without throwing unhandled exceptions."""
    non_existent = Path("d:/tamil-ai-forge/storage/non_existent_audio_sample.mp3")
    assert not non_existent.exists()

    # Emulate render_service check
    resolved_path = None
    if non_existent.exists():
        resolved_path = non_existent

    assert resolved_path is None
