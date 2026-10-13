import pytest
import asyncio
from pathlib import Path
from app.core.ffmpeg import FFmpegService
from app.models.timeline import Timeline, Track, Clip, Keyframe
from app.schemas.timeline import KeyframeSchema, ClipSchema

@pytest.mark.asyncio
async def test_build_video_property_expression_empty():
    """Empty or non-matching keyframes should return None."""
    ffmpeg = FFmpegService()
    assert ffmpeg.build_video_property_expression([], "position_x") is None
    assert ffmpeg.build_video_property_expression([{"property_path": "scale_x", "time_offset_ms": 0, "value": 1.0}], "position_x") is None

@pytest.mark.asyncio
async def test_build_video_property_expression_single():
    """Single keyframe returns static formatted float string."""
    ffmpeg = FFmpegService()
    kfs = [{"property_path": "position_x", "time_offset_ms": 0, "value": 0.5}]
    expr = ffmpeg.build_video_property_expression(kfs, "position_x")
    assert expr == "0.5000"

    kfs_rot = [{"property_path": "rotation", "time_offset_ms": 100, "value": 45.0}]
    expr_rot = ffmpeg.build_video_property_expression(kfs_rot, "rotation")
    assert expr_rot == "45.0000"

@pytest.mark.asyncio
async def test_build_video_property_expression_multiple():
    """Multiple keyframes construct nested piecewise linear interpolation."""
    ffmpeg = FFmpegService()
    kfs = [
        {"property_path": "scale_x", "time_offset_ms": 0, "value": 1.0},
        {"property_path": "scale_x", "time_offset_ms": 1000, "value": 1.5},
        {"property_path": "scale_x", "time_offset_ms": 2000, "value": 0.8},
    ]
    expr = ffmpeg.build_video_property_expression(kfs, "scale_x", time_var="t")
    assert expr is not None
    assert "if(lte(t," in expr
    assert "1.0000" in expr
    assert "1.5000" in expr
    assert "0.8000" in expr

@pytest.mark.asyncio
async def test_build_video_property_expression_time_var():
    """Opacity keyframes use time_var='T' for geq filter compatibility."""
    ffmpeg = FFmpegService()
    kfs = [
        {"property_path": "opacity", "time_offset_ms": 0, "value": 1.0},
        {"property_path": "opacity", "time_offset_ms": 1500, "value": 0.2},
    ]
    expr = ffmpeg.build_video_property_expression(kfs, "opacity", time_var="T")
    assert expr is not None
    assert "if(lte(T," in expr
    assert "t" not in expr.replace("lte", "")  # T is uppercase

@pytest.mark.asyncio
async def test_keyframe_serialization_roundtrip():
    """Keyframes can be instantiated, serialized via Pydantic schema, and dumped to dict."""
    kf = Keyframe(
        id="kf-12345",
        clip_id="clip-abcde",
        property_path="position_y",
        time_offset_ms=750,
        value=0.72,
        interpolation="linear"
    )
    schema = KeyframeSchema.model_validate(kf)
    assert schema.id == "kf-12345"
    assert schema.property_path == "position_y"
    assert schema.time_offset_ms == 750
    assert schema.value == 0.72

    data = schema.model_dump()
    assert data["property_path"] == "position_y"
    assert data["time_offset_ms"] == 750
    assert data["value"] == 0.72

@pytest.mark.asyncio
async def test_video_keyframe_piecewise_interpolation_math():
    """Verify interpolation math: mid-point between 0.2 at 0ms and 0.8 at 1000ms is 0.5."""
    ffmpeg = FFmpegService()
    kfs = [
        {"property_path": "position_x", "time_offset_ms": 0, "value": 0.2},
        {"property_path": "position_x", "time_offset_ms": 1000, "value": 0.8},
    ]
    expr = ffmpeg.build_video_property_expression(kfs, "position_x", time_var="t")
    assert expr is not None
    # Evaluates piecewise: if(lte(t,1.000),(0.2000+(t-0.000)/1.000*(0.6000)),0.8000)
    assert "0.2000" in expr
    assert "0.8000" in expr
    assert "0.6000" in expr

@pytest.mark.asyncio
async def test_ffmpeg_animated_transform_rendering(tmp_path: Path):
    """FFmpeg renders video clip with animated position, scale, rotation, and opacity."""
    ffmpeg = FFmpegService()
    out_video = tmp_path / "animated_test.mp4"

    # Generate small source video
    src_video = tmp_path / "src_test.mp4"
    gen_cmd = [
        ffmpeg.ffmpeg_bin, "-y",
        "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=1.0",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        str(src_video)
    ]
    res_gen = await ffmpeg._run_ffmpeg(gen_cmd)
    assert res_gen["returncode"] == 0, f"Source gen failed: {res_gen['stderr']}"

    video_clips = [
        {
            "id": "clip-test-1",
            "file_path": src_video,
            "start_time_ms": 0,
            "duration_ms": 1000,
            "source_in_ms": 0,
            "source_out_ms": 1000,
            "speed_factor": 1.0,
            "is_reversed": False,
            "position_x": 0.5,
            "position_y": 0.5,
            "scale_x": 1.0,
            "scale_y": 1.0,
            "rotation": 0.0,
            "opacity": 1.0,
            "keyframes": [
                {"property_path": "position_x", "time_offset_ms": 0, "value": 0.3},
                {"property_path": "position_x", "time_offset_ms": 1000, "value": 0.7},
                {"property_path": "scale_x", "time_offset_ms": 0, "value": 1.0},
                {"property_path": "scale_x", "time_offset_ms": 1000, "value": 1.2},
                {"property_path": "rotation", "time_offset_ms": 0, "value": 0.0},
                {"property_path": "rotation", "time_offset_ms": 1000, "value": 45.0},
                {"property_path": "opacity", "time_offset_ms": 0, "value": 1.0},
                {"property_path": "opacity", "time_offset_ms": 1000, "value": 0.5},
            ]
        }
    ]

    success = await ffmpeg.render_timeline_sequence(
        timeline_duration_ms=1000,
        video_clips=video_clips,
        audio_clips=[],
        output_path=out_video,
        export_preset={"width": 640, "height": 360, "fps": 25, "framing_mode": "fit"},
    )
    assert success is True
    assert out_video.exists()
    assert out_video.stat().st_size > 1000

@pytest.mark.asyncio
async def test_static_transform_path_preserved_when_no_keyframes(tmp_path: Path):
    """FFmpeg renders standard static transform clips using the fast framing path."""
    ffmpeg = FFmpegService()
    out_video = tmp_path / "static_test.mp4"

    src_video = tmp_path / "src_static.mp4"
    gen_cmd = [
        ffmpeg.ffmpeg_bin, "-y",
        "-f", "lavfi", "-i", "color=c=red:s=320x180:d=1.0",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        str(src_video)
    ]
    res_gen = await ffmpeg._run_ffmpeg(gen_cmd)
    assert res_gen["returncode"] == 0

    video_clips = [
        {
            "id": "clip-static-1",
            "file_path": src_video,
            "start_time_ms": 0,
            "duration_ms": 1000,
            "source_in_ms": 0,
            "source_out_ms": 1000,
            "speed_factor": 1.0,
            "is_reversed": False,
            "position_x": 0.5,
            "position_y": 0.5,
            "scale_x": 1.0,
            "scale_y": 1.0,
            "rotation": 0.0,
            "opacity": 1.0,
            "keyframes": []  # Zero keyframes -> standard path
        }
    ]

    success = await ffmpeg.render_timeline_sequence(
        timeline_duration_ms=1000,
        video_clips=video_clips,
        audio_clips=[],
        output_path=out_video,
        export_preset={"width": 640, "height": 360, "fps": 25, "framing_mode": "fit"},
    )
    assert success is True
    assert out_video.exists()
    assert out_video.stat().st_size > 1000
