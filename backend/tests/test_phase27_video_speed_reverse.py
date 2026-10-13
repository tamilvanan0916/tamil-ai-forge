import pytest
import os
import tempfile
import subprocess
import asyncio
from pathlib import Path
from app.core.ffmpeg import FFmpegService
from app.schemas.timeline import ClipSchema, TrackSchema, TimelineStateSchema

@pytest.fixture
def ffmpeg_service():
    return FFmpegService()

# 1. Speed value validation
def test_speed_value_validation(ffmpeg_service):
    for preset in [0.25, 0.5, 1.0, 1.5, 2.0, 4.0]:
        validated = ffmpeg_service.validate_clip_speed(preset)
        assert validated == preset
        assert isinstance(validated, float)

# 2. Invalid speed rejection
def test_invalid_speed_rejection(ffmpeg_service):
    assert ffmpeg_service.validate_clip_speed(0) == 1.0
    assert ffmpeg_service.validate_clip_speed(-1.5) == 1.0
    assert ffmpeg_service.validate_clip_speed("invalid") == 1.0
    assert ffmpeg_service.validate_clip_speed(float("nan")) == 1.0
    assert ffmpeg_service.validate_clip_speed(float("inf")) == 1.0
    assert ffmpeg_service.validate_clip_speed(-999.0) == 1.0
    assert ffmpeg_service.validate_clip_speed(0.0001) == 1.0

# 3. Reverse state validation
def test_reverse_state_validation(ffmpeg_service):
    assert ffmpeg_service.validate_clip_reverse(True) is True
    assert ffmpeg_service.validate_clip_reverse(False) is False
    assert ffmpeg_service.validate_clip_reverse(1) is True
    assert ffmpeg_service.validate_clip_reverse(0) is False
    assert ffmpeg_service.validate_clip_reverse(None) is False

# 4. Speed state serialization
def test_speed_state_serialization():
    clip = ClipSchema(
        name="Speed Test Clip",
        start_time_ms=0,
        duration_ms=4000,
        speed_factor=2.0,
        is_reversed=False,
    )
    dumped = clip.model_dump()
    assert dumped["speed_factor"] == 2.0
    assert dumped["is_reversed"] is False

    reloaded = ClipSchema(**dumped)
    assert reloaded.speed_factor == 2.0
    assert reloaded.is_reversed is False

# 5. Reverse state serialization
def test_reverse_state_serialization():
    clip = ClipSchema(
        name="Reverse Test Clip",
        start_time_ms=0,
        duration_ms=3000,
        speed_factor=1.0,
        is_reversed=True,
    )
    dumped = clip.model_dump()
    assert dumped["is_reversed"] is True
    assert dumped["speed_factor"] == 1.0

    reloaded = ClipSchema(**dumped)
    assert reloaded.is_reversed is True

# 6. FFmpeg speed filter generation
def test_ffmpeg_speed_filter_generation(ffmpeg_service):
    f_double = ffmpeg_service.build_speed_filter(2.0)
    assert "setpts=0.5000*PTS" in f_double

    f_half = ffmpeg_service.build_speed_filter(0.5)
    assert "setpts=2.0000*PTS" in f_half

    f_quad = ffmpeg_service.build_speed_filter(4.0)
    assert "setpts=0.2500*PTS" in f_quad

    f_normal = ffmpeg_service.build_speed_filter(1.0)
    assert f_normal == ""

# 7. FFmpeg reverse filter generation
def test_ffmpeg_reverse_filter_generation(ffmpeg_service):
    f_rev = ffmpeg_service.build_reverse_filter()
    assert f_rev == "reverse"

# 8. Default 1.0x Forward path preservation
def test_default_speed_forward_path_preservation(ffmpeg_service):
    assert ffmpeg_service.build_speed_filter(1.0) == ""
    assert ffmpeg_service.validate_clip_reverse(False) is False

# 9. Render behavior with non-default speed
@pytest.mark.asyncio
async def test_render_behavior_with_non_default_speed(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "v_speed.mp4"
        out_path = Path(td) / "out_speed.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=25:d=4",
            "-f", "lavfi", "-i", "sine=f=440:d=4",
            "-c:v", "libx264", "-c:a", "aac",
            str(v1_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        export_preset = {
            "width": 320,
            "height": 240,
            "fps": 25,
            "crf": 23,
            "video_codec": "libx264",
            "audio_codec": "aac",
        }

        video_clips = [
            {
                "id": "clip_speed",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 4000,
                "speed_factor": 2.0,
                "is_reversed": False,
            }
        ]

        success = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=2000,
            video_clips=video_clips,
            audio_clips=[],
            output_path=out_path,
            export_preset=export_preset,
        )
        assert success is True
        assert out_path.exists()
        assert out_path.stat().st_size > 1000

# 10. Render behavior with reverse
@pytest.mark.asyncio
async def test_render_behavior_with_reverse(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "v_rev.mp4"
        out_path = Path(td) / "out_rev.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=green:s=320x240:r=25:d=3",
            "-f", "lavfi", "-i", "sine=f=550:d=3",
            "-c:v", "libx264", "-c:a", "aac",
            str(v1_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        export_preset = {
            "width": 320,
            "height": 240,
            "fps": 25,
            "crf": 23,
            "video_codec": "libx264",
            "audio_codec": "aac",
        }

        video_clips = [
            {
                "id": "clip_rev",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 2000,
                "speed_factor": 1.0,
                "is_reversed": True,
            }
        ]

        success = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=2000,
            video_clips=video_clips,
            audio_clips=[],
            output_path=out_path,
            export_preset=export_preset,
        )
        assert success is True
        assert out_path.exists()
        assert out_path.stat().st_size > 1000

# 11. Compatibility with existing transition rendering
@pytest.mark.asyncio
async def test_compatibility_with_transition_rendering(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "v1_trans.mp4"
        v2_path = Path(td) / "v2_trans.mp4"
        out_path = Path(td) / "out_speed_trans.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=red:s=320x240:r=25:d=3",
            "-f", "lavfi", "-i", "sine=f=440:d=3",
            "-c:v", "libx264", "-c:a", "aac",
            str(v1_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=purple:s=320x240:r=25:d=3",
            "-f", "lavfi", "-i", "sine=f=660:d=3",
            "-c:v", "libx264", "-c:a", "aac",
            str(v2_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        export_preset = {
            "width": 320,
            "height": 240,
            "fps": 25,
            "crf": 23,
            "video_codec": "libx264",
            "audio_codec": "aac",
        }

        video_clips = [
            {
                "id": "c1",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 3000,
                "speed_factor": 1.5,
                "is_reversed": False,
                "transition_out": {"type": "crossfade", "duration_ms": 500},
            },
            {
                "id": "c2",
                "file_path": v2_path,
                "start_time_ms": 2000,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 2000,
                "speed_factor": 1.0,
                "is_reversed": False,
                "transition_in": {"type": "crossfade", "duration_ms": 500},
            }
        ]

        success = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=3500,
            video_clips=video_clips,
            audio_clips=[],
            output_path=out_path,
            export_preset=export_preset,
        )
        assert success is True
        assert out_path.exists()
        assert out_path.stat().st_size > 1000
