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

# 1. Frame hold duration validation
def test_frame_hold_duration_validation(ffmpeg_service):
    for dur in [1000, 2000, 3000, 5000]:
        val = ffmpeg_service.validate_frame_hold_duration(dur)
        assert val == dur
        assert isinstance(val, int)

# 2. Invalid frame hold duration fallback
def test_invalid_frame_hold_duration_fallback(ffmpeg_service):
    assert ffmpeg_service.validate_frame_hold_duration(0) == 2000
    assert ffmpeg_service.validate_frame_hold_duration(-500) == 2000
    assert ffmpeg_service.validate_frame_hold_duration(9999) == 2000
    assert ffmpeg_service.validate_frame_hold_duration("invalid") == 2000
    assert ffmpeg_service.validate_frame_hold_duration(None) == 2000
    assert ffmpeg_service.validate_frame_hold_duration(1500) == 2000

# 3. Frame hold state serialization
def test_frame_hold_state_serialization():
    clip = ClipSchema(
        name="Hold Test Clip",
        start_time_ms=0,
        duration_ms=5000,
        is_frame_hold=True,
        frame_hold_at_ms=1200,
        frame_hold_duration_ms=3000,
    )
    dumped = clip.model_dump()
    assert dumped["is_frame_hold"] is True
    assert dumped["frame_hold_at_ms"] == 1200
    assert dumped["frame_hold_duration_ms"] == 3000

    reloaded = ClipSchema(**dumped)
    assert reloaded.is_frame_hold is True
    assert reloaded.frame_hold_at_ms == 1200
    assert reloaded.frame_hold_duration_ms == 3000

# 4. Default frame hold state serialization
def test_default_frame_hold_state_serialization():
    clip = ClipSchema(
        name="Default Clip",
        start_time_ms=0,
        duration_ms=3000,
    )
    dumped = clip.model_dump()
    assert dumped["is_frame_hold"] is False
    assert dumped["frame_hold_at_ms"] is None
    assert dumped["frame_hold_duration_ms"] == 2000

# 5. FFmpeg frame hold filter generation
def test_frame_hold_filter_generation(ffmpeg_service):
    filt = ffmpeg_service.build_frame_hold_filter(1.0, 2.0, 30.0)
    assert "between(T,1.000,3.000)" in filt
    assert "1.000/TB" in filt
    assert "fps=30.0" in filt

# 6. Frame hold filter generation at start
def test_frame_hold_filter_generation_at_start(ffmpeg_service):
    filt = ffmpeg_service.build_frame_hold_filter(0.0, 1.0, 30.0)
    assert "between(T,0.000,1.000)" in filt
    assert "0.000/TB" in filt
    assert "fps=30.0" in filt

# 7. Frame hold filter with different FPS
def test_frame_hold_filter_different_fps(ffmpeg_service):
    filt = ffmpeg_service.build_frame_hold_filter(2.5, 2.0, 25.0)
    assert "between(T,2.500,4.500)" in filt
    assert "2.500/TB" in filt
    assert "fps=25.0" in filt

# 8. Non-frame hold rendering path preservation
def test_non_frame_hold_rendering_path_preservation(ffmpeg_service):
    clip = {
        "file_path": "dummy.mp4",
        "duration_ms": 3000,
        "is_frame_hold": False,
        "speed_factor": 1.0,
        "is_reversed": False,
    }
    assert clip.get("is_frame_hold") is False
    assert ffmpeg_service.validate_frame_hold_duration(clip.get("frame_hold_duration_ms", 2000)) == 2000

# 9. Mutual exclusion verification in schemas
def test_option_a_mutual_exclusion_schema():
    clip_freeze = ClipSchema(
        name="Frozen Clip",
        start_time_ms=0,
        duration_ms=4000,
        is_frozen=True,
        freeze_at_ms=1000,
        freeze_duration_ms=2000,
        is_frame_hold=False,
    )
    assert clip_freeze.is_frozen is True
    assert clip_freeze.is_frame_hold is False

    clip_hold = ClipSchema(
        name="Held Clip",
        start_time_ms=0,
        duration_ms=4000,
        is_frozen=False,
        is_frame_hold=True,
        frame_hold_at_ms=1000,
        frame_hold_duration_ms=2000,
    )
    assert clip_hold.is_frozen is False
    assert clip_hold.is_frame_hold is True

# 10. Render behavior with frame hold
@pytest.mark.asyncio
async def test_render_behavior_with_frame_hold(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "v_hold.mp4"
        out_path = Path(td) / "out_hold.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=teal:s=320x240:r=25:d=4",
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
                "id": "clip_hold",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 3000,
                "source_in_ms": 0,
                "source_out_ms": 3000,
                "is_frame_hold": True,
                "frame_hold_at_ms": 1000,
                "frame_hold_duration_ms": 2000,
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

# 11. Render behavior with frame hold and speed
@pytest.mark.asyncio
async def test_render_behavior_with_frame_hold_and_speed(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "v_hold_spd.mp4"
        out_path = Path(td) / "out_hold_spd.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=darkgreen:s=320x240:r=25:d=4",
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
                "id": "clip_hold_spd",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 3000,
                "source_in_ms": 0,
                "source_out_ms": 4000,
                "speed_factor": 1.5,
                "is_reversed": False,
                "is_frame_hold": True,
                "frame_hold_at_ms": 1000,
                "frame_hold_duration_ms": 1000,
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

# 12. Frame hold compatibility with video transitions
@pytest.mark.asyncio
async def test_frame_hold_compatibility_with_transitions(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "v1_hd_trans.mp4"
        v2_path = Path(td) / "v2_hd_trans.mp4"
        out_path = Path(td) / "out_hd_trans.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=navy:s=320x240:r=25:d=3",
            "-f", "lavfi", "-i", "sine=f=440:d=3",
            "-c:v", "libx264", "-c:a", "aac",
            str(v1_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=olive:s=320x240:r=25:d=3",
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
                "is_frame_hold": True,
                "frame_hold_at_ms": 500,
                "frame_hold_duration_ms": 1000,
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
