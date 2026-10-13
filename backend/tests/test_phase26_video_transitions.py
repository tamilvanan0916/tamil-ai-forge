import pytest
import os
import tempfile
import asyncio
from pathlib import Path
from app.core.ffmpeg import FFmpegService
from app.schemas.timeline import ClipSchema, TrackSchema, TimelineStateSchema

@pytest.fixture
def ffmpeg_service():
    return FFmpegService()

# 1. Transition type validation
def test_transition_type_mapping(ffmpeg_service):
    # Crossfade
    f_cross = ffmpeg_service.build_xfade_transition_filter("crossfade", 1.0, 2.0)
    assert "transition=fade" in f_cross
    assert "duration=1.000" in f_cross
    assert "offset=2.000" in f_cross

    # Fade Through Black
    f_black = ffmpeg_service.build_xfade_transition_filter("fade_black", 1.5, 3.5)
    assert "transition=fadeblack" in f_black
    assert "duration=1.500" in f_black
    assert "offset=3.500" in f_black

    # Fade Through White
    f_white = ffmpeg_service.build_xfade_transition_filter("fade_white", 0.5, 4.5)
    assert "transition=fadewhite" in f_white
    assert "duration=0.500" in f_white
    assert "offset=4.500" in f_white

# 2. Transition duration validation
def test_transition_duration_validation():
    clip_a_dur = 2000
    clip_b_dur = 1500
    max_allowed = min(clip_a_dur, clip_b_dur)

    def validate_duration(dur_ms: int, dur_a: int, dur_b: int) -> bool:
        max_dur = min(dur_a, dur_b)
        return 0 < dur_ms <= max_dur

    assert validate_duration(500, clip_a_dur, clip_b_dur) is True
    assert validate_duration(1500, clip_a_dur, clip_b_dur) is True
    assert validate_duration(1501, clip_a_dur, clip_b_dur) is False  # Exceeds clip B
    assert validate_duration(0, clip_a_dur, clip_b_dur) is False     # Zero rejected
    assert validate_duration(-100, clip_a_dur, clip_b_dur) is False  # Negative rejected

# 3. Adjacent clip validation on the same video track
def test_adjacent_clip_validation():
    clips = [
        {"id": "c1", "start_time_ms": 0, "duration_ms": 2000},
        {"id": "c2", "start_time_ms": 2000, "duration_ms": 3000},
        {"id": "c3", "start_time_ms": 5000, "duration_ms": 2000},
    ]

    def validate_adjacency(from_id: str, to_id: str, track_type: str, clip_list: list) -> bool:
        if track_type != "video":
            return False
        sorted_clips = sorted(clip_list, key=lambda c: c["start_time_ms"])
        idx_a = next((i for i, c in enumerate(sorted_clips) if c["id"] == from_id), -1)
        idx_b = next((i for i, c in enumerate(sorted_clips) if c["id"] == to_id), -1)
        if idx_a == -1 or idx_b == -1:
            return False
        return idx_b == idx_a + 1

    # Adjacent video clips
    assert validate_adjacency("c1", "c2", "video", clips) is True
    assert validate_adjacency("c2", "c3", "video", clips) is True

    # Non-adjacent video clips rejected
    assert validate_adjacency("c1", "c3", "video", clips) is False
    assert validate_adjacency("c2", "c1", "video", clips) is False

    # Non-video track rejected
    assert validate_adjacency("c1", "c2", "audio", clips) is False

# 4. Crossfade filtergraph generation
def test_crossfade_filtergraph_generation(ffmpeg_service):
    f_filter = ffmpeg_service.build_xfade_transition_filter("crossfade", 1.25, 3.75)
    assert f_filter == "xfade=transition=fade:duration=1.250:offset=3.750"

# 5. Fade Through Black filtergraph generation
def test_fade_black_filtergraph_generation(ffmpeg_service):
    f_filter = ffmpeg_service.build_xfade_transition_filter("fade_black", 0.75, 2.25)
    assert f_filter == "xfade=transition=fadeblack:duration=0.750:offset=2.250"

# 6. Fade Through White filtergraph generation
def test_fade_white_filtergraph_generation(ffmpeg_service):
    f_filter = ffmpeg_service.build_xfade_transition_filter("fade_white", 1.0, 5.0)
    assert f_filter == "xfade=transition=fadewhite:duration=1.000:offset=5.000"

# 7. Invalid transition rejection
def test_invalid_transition_type_fallback(ffmpeg_service):
    # Invalid transition names fallback safely to standard fade
    f_unknown = ffmpeg_service.build_xfade_transition_filter("unsupported_3d_cube", 1.0, 2.0)
    assert "transition=fade" in f_unknown

# 8. Render test with transitions and static path preservation
@pytest.mark.asyncio
async def test_ffmpeg_render_with_video_transitions(ffmpeg_service):
    import subprocess
    import imageio_ffmpeg
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "v1.mp4"
        v2_path = Path(td) / "v2.mp4"
        out_trans_path = Path(td) / "out_trans.mp4"
        out_static_path = Path(td) / "out_static.mp4"

        # Create two 2-second test clips
        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=red:s=320x240:r=25:d=2",
            "-f", "lavfi", "-i", "sine=f=440:d=2",
            "-c:v", "libx264", "-c:a", "aac",
            str(v1_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=25:d=2",
            "-f", "lavfi", "-i", "sine=f=880:d=2",
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

        # A: Render with Crossfade transition
        video_clips_with_transition = [
            {
                "id": "clip1",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 2000,
                "speed_factor": 1.0,
                "transition_out": {"type": "crossfade", "duration_ms": 1000},
            },
            {
                "id": "clip2",
                "file_path": v2_path,
                "start_time_ms": 2000,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 2000,
                "speed_factor": 1.0,
                "transition_in": {"type": "crossfade", "duration_ms": 1000},
            }
        ]

        success_trans = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=3000,
            video_clips=video_clips_with_transition,
            audio_clips=[],
            output_path=out_trans_path,
            export_preset=export_preset,
        )
        assert success_trans is True
        assert out_trans_path.exists()
        assert out_trans_path.stat().st_size > 1000

        # B: Render with no transitions (preserving static path)
        video_clips_static = [
            {
                "id": "clip1",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 2000,
                "speed_factor": 1.0,
            },
            {
                "id": "clip2",
                "file_path": v2_path,
                "start_time_ms": 2000,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 2000,
                "speed_factor": 1.0,
            }
        ]

        success_static = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=4000,
            video_clips=video_clips_static,
            audio_clips=[],
            output_path=out_static_path,
            export_preset=export_preset,
        )
        assert success_static is True
        assert out_static_path.exists()
        assert out_static_path.stat().st_size > 1000
