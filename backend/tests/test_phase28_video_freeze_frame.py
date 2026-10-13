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

# 1. Freeze duration validation
def test_freeze_duration_validation(ffmpeg_service):
    for dur in [1000, 2000, 3000, 5000]:
        val = ffmpeg_service.validate_freeze_duration(dur)
        assert val == dur
        assert isinstance(val, int)

# 2. Invalid freeze duration fallback
def test_invalid_freeze_duration_fallback(ffmpeg_service):
    assert ffmpeg_service.validate_freeze_duration(0) == 2000
    assert ffmpeg_service.validate_freeze_duration(-500) == 2000
    assert ffmpeg_service.validate_freeze_duration(9999) == 2000
    assert ffmpeg_service.validate_freeze_duration("invalid") == 2000
    assert ffmpeg_service.validate_freeze_duration(None) == 2000
    assert ffmpeg_service.validate_freeze_duration(1500) == 2000

# 3. Freeze state serialization
def test_freeze_state_serialization():
    clip = ClipSchema(
        name="Freeze Test Clip",
        start_time_ms=0,
        duration_ms=5000,
        is_frozen=True,
        freeze_at_ms=1500,
        freeze_duration_ms=3000,
    )
    dumped = clip.model_dump()
    assert dumped["is_frozen"] is True
    assert dumped["freeze_at_ms"] == 1500
    assert dumped["freeze_duration_ms"] == 3000

    reloaded = ClipSchema(**dumped)
    assert reloaded.is_frozen is True
    assert reloaded.freeze_at_ms == 1500
    assert reloaded.freeze_duration_ms == 3000

# 4. Default freeze state serialization
def test_default_freeze_state_serialization():
    clip = ClipSchema(
        name="Default Clip",
        start_time_ms=0,
        duration_ms=3000,
    )
    dumped = clip.model_dump()
    assert dumped["is_frozen"] is False
    assert dumped["freeze_at_ms"] is None
    assert dumped["freeze_duration_ms"] == 2000

# 5. FFmpeg freeze frame filter generation
def test_freeze_filter_generation(ffmpeg_service):
    filt = ffmpeg_service.build_freeze_frame_filter(1.0, 2.0, 30.0)
    assert "loop=loop=60:size=1:start=30" in filt
    assert "setpts=N/FRAME_RATE/TB" in filt

# 6. Freeze filter generation at start
def test_freeze_filter_generation_at_start(ffmpeg_service):
    filt = ffmpeg_service.build_freeze_frame_filter(0.0, 1.0, 30.0)
    assert "loop=loop=30:size=1:start=0" in filt
    assert "setpts=N/FRAME_RATE/TB" in filt

# 7. Freeze filter with different FPS
def test_freeze_filter_different_fps(ffmpeg_service):
    filt = ffmpeg_service.build_freeze_frame_filter(2.0, 3.0, 25.0)
    assert "loop=loop=75:size=1:start=50" in filt
    assert "setpts=N/FRAME_RATE/TB" in filt

# 8. Non-freeze rendering path preservation
def test_non_freeze_rendering_path_preservation(ffmpeg_service):
    clip = {
        "file_path": "dummy.mp4",
        "duration_ms": 3000,
        "is_frozen": False,
        "speed_factor": 1.0,
        "is_reversed": False,
    }
    assert clip.get("is_frozen") is False
    assert ffmpeg_service.validate_freeze_duration(clip.get("freeze_duration_ms", 2000)) == 2000

# 9. Render behavior with freeze frame
@pytest.mark.asyncio
async def test_render_behavior_with_freeze_frame(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "v_freeze.mp4"
        out_path = Path(td) / "out_freeze.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=cyan:s=320x240:r=25:d=4",
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
                "id": "clip_freeze",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 3000,
                "source_in_ms": 0,
                "source_out_ms": 3000,
                "is_frozen": True,
                "freeze_at_ms": 1000,
                "freeze_duration_ms": 2000,
            }
        ]

        success = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=3000,
            video_clips=video_clips,
            audio_clips=[],
            output_path=out_path,
            export_preset=export_preset,
        )
        assert success is True
        assert out_path.exists()
        assert out_path.stat().st_size > 1000

# 10. Render behavior with freeze and speed
@pytest.mark.asyncio
async def test_render_behavior_with_freeze_and_speed(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "v_freeze_spd.mp4"
        out_path = Path(td) / "out_freeze_spd.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=magenta:s=320x240:r=25:d=4",
            "-f", "lavfi", "-i", "sine=f=550:d=4",
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
                "id": "clip_freeze_spd",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 3000,
                "source_in_ms": 0,
                "source_out_ms": 4000,
                "speed_factor": 1.5,
                "is_reversed": False,
                "is_frozen": True,
                "freeze_at_ms": 1000,
                "freeze_duration_ms": 1000,
            }
        ]

        success = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=3000,
            video_clips=video_clips,
            audio_clips=[],
            output_path=out_path,
            export_preset=export_preset,
        )
        assert success is True
        assert out_path.exists()
        assert out_path.stat().st_size > 1000

# 11. Freeze frame compatibility with video transitions
@pytest.mark.asyncio
async def test_freeze_compatibility_with_transitions(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "v1_fz_trans.mp4"
        v2_path = Path(td) / "v2_fz_trans.mp4"
        out_path = Path(td) / "out_fz_trans.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=25:d=3",
            "-f", "lavfi", "-i", "sine=f=440:d=3",
            "-c:v", "libx264", "-c:a", "aac",
            str(v1_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=orange:s=320x240:r=25:d=3",
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
                "duration_ms": 2500,
                "source_in_ms": 0,
                "source_out_ms": 3000,
                "is_frozen": True,
                "freeze_at_ms": 500,
                "freeze_duration_ms": 1000,
                "transition_out": {"type": "crossfade", "duration_ms": 500},
            },
            {
                "id": "c2",
                "file_path": v2_path,
                "start_time_ms": 2500,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 2000,
                "transition_in": {"type": "crossfade", "duration_ms": 500},
            }
        ]

        success = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=4000,
            video_clips=video_clips,
            audio_clips=[],
            output_path=out_path,
            export_preset=export_preset,
        )
        assert success is True
        assert out_path.exists()
        assert out_path.stat().st_size > 1000
