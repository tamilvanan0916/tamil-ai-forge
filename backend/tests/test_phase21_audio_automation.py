import pytest
import asyncio
from pathlib import Path
from app.core.ffmpeg import FFmpegService
from app.config import settings
from app.models.timeline import Timeline, Track, Clip, Keyframe
from app.services.timeline_service import TimelineService
from app.core.database import AsyncSessionLocal

@pytest.mark.asyncio
async def test_build_volume_automation_expression_empty():
    """Empty or non-volume keyframes should return None."""
    ffmpeg = FFmpegService()
    assert ffmpeg.build_volume_automation_expression([]) is None
    assert ffmpeg.build_volume_automation_expression([{"property_path": "opacity", "time_offset_ms": 0, "value": 0.5}]) is None

@pytest.mark.asyncio
async def test_build_volume_automation_expression_single():
    """Single keyframe returns static linear gain string."""
    ffmpeg = FFmpegService()
    kfs = [{"property_path": "volume_db", "time_offset_ms": 0, "value": 0.0}]
    expr = ffmpeg.build_volume_automation_expression(kfs)
    assert expr == "1.0000"

    kfs_neg = [{"property_path": "volume_db", "time_offset_ms": 500, "value": -6.0}]
    expr_neg = ffmpeg.build_volume_automation_expression(kfs_neg)
    assert expr_neg is not None
    assert abs(float(expr_neg) - 0.5012) < 0.01

@pytest.mark.asyncio
async def test_build_volume_automation_expression_multiple():
    """Multiple keyframes construct nested piecewise linear interpolation."""
    ffmpeg = FFmpegService()
    kfs = [
        {"property_path": "volume_db", "time_offset_ms": 0, "value": -60.0},
        {"property_path": "volume_db", "time_offset_ms": 1000, "value": 0.0},
        {"property_path": "volume_db", "time_offset_ms": 3000, "value": -6.0},
    ]
    expr = ffmpeg.build_volume_automation_expression(kfs)
    assert expr is not None
    assert "if(lte(t," in expr
    assert "0.0010" in expr or "0.0000" in expr or "1.0000" in expr

@pytest.mark.asyncio
async def test_build_volume_automation_expression_with_track_volume():
    """Track volume offset is incorporated into keyframe values."""
    ffmpeg = FFmpegService()
    kfs = [{"property_path": "volume_db", "time_offset_ms": 0, "value": 0.0}]
    # 0dB + (-6dB track volume) -> gain ~0.5012
    expr = ffmpeg.build_volume_automation_expression(kfs, track_vol_db=-6.0)
    assert expr is not None
    assert abs(float(expr) - 0.5012) < 0.01

@pytest.mark.asyncio
async def test_ffmpeg_eval_frame_execution(tmp_path: Path):
    """FFmpeg successfully renders audio with volume=eval=frame:volume='...'."""
    ffmpeg = FFmpegService()
    out_file = tmp_path / "auto_test.aac"
    kfs = [
        {"property_path": "volume_db", "time_offset_ms": 0, "value": -20.0},
        {"property_path": "volume_db", "time_offset_ms": 1000, "value": 0.0},
        {"property_path": "volume_db", "time_offset_ms": 2000, "value": -12.0},
    ]
    expr = ffmpeg.build_volume_automation_expression(kfs)
    assert expr is not None

    cmd = [
        ffmpeg.ffmpeg_bin, "-y",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
        "-af", f"volume=eval=frame:volume='{expr}'",
        "-c:a", "aac", "-b:a", "128k",
        str(out_file)
    ]
    res = await ffmpeg._run_ffmpeg(cmd)
    assert res["returncode"] == 0
    assert out_file.exists()
    assert out_file.stat().st_size > 0

@pytest.mark.asyncio
async def test_mix_audio_tracks_with_automation(tmp_path: Path):
    """mix_audio_tracks correctly accepts and processes keyframes on inputs."""
    ffmpeg = FFmpegService()
    src1 = tmp_path / "src1.aac"
    out_mix = tmp_path / "mixed.aac"

    # Generate test sine tone
    init_cmd = [
        ffmpeg.ffmpeg_bin, "-y",
        "-f", "lavfi", "-i", "sine=frequency=880:duration=4",
        "-c:a", "aac", str(src1)
    ]
    await ffmpeg._run_ffmpeg(init_cmd)
    assert src1.exists()

    audio_inputs = [
        {
            "path": src1,
            "volume": 1.0,
            "delay_ms": 0,
            "fade_in_ms": 0,
            "fade_out_ms": 0,
            "keyframes": [
                {"property_path": "volume_db", "time_offset_ms": 0, "value": -12.0},
                {"property_path": "volume_db", "time_offset_ms": 2000, "value": 0.0},
            ]
        }
    ]

    success = await ffmpeg.mix_audio_tracks(audio_inputs, out_mix, total_duration_sec=4.0)
    assert success is True
    assert out_mix.exists()
    assert out_mix.stat().st_size > 0
