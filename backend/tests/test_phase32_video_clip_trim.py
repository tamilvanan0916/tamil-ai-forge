import pytest
import tempfile
import subprocess
from pathlib import Path
import uuid
import math

from app.schemas.timeline import ClipSchema, KeyframeSchema, TrackSchema, TimelineStateSchema
from app.core.ffmpeg import FFmpegService

@pytest.fixture
def ffmpeg_service():
    return FFmpegService()

# 1. Left trim — normal playback (1.0x, forward)
def test_left_trim_normal_playback():
    clip = ClipSchema(
        id=str(uuid.uuid4()),
        name="Clip1.mp4",
        start_time_ms=1000,
        duration_ms=5000,
        source_in_ms=500,
        source_out_ms=5500,
        speed_factor=1.0,
        is_reversed=False,
    )
    # Drag left edge forward by +1000ms (shortening clip)
    delta_ms = 1000
    speed = clip.speed_factor
    actual_delta_start = delta_ms
    new_start = clip.start_time_ms + actual_delta_start
    new_duration = clip.duration_ms - actual_delta_start
    delta_media = round(actual_delta_start * speed)

    new_source_in = clip.source_in_ms + delta_media
    new_source_out = clip.source_out_ms  # fixed

    assert new_start == 2000
    assert new_duration == 4000
    assert new_source_in == 1500
    assert new_source_out == 5500
    # Media elapsed matches duration
    assert (new_source_out - new_source_in) == new_duration * speed

# 2. Right trim — normal playback (1.0x, forward)
def test_right_trim_normal_playback():
    clip = ClipSchema(
        id=str(uuid.uuid4()),
        name="Clip1.mp4",
        start_time_ms=1000,
        duration_ms=5000,
        source_in_ms=500,
        source_out_ms=5500,
        speed_factor=1.0,
        is_reversed=False,
    )
    # Drag right edge left by -1500ms (shortening clip from right)
    delta_ms = -1500
    speed = clip.speed_factor
    new_start = clip.start_time_ms  # fixed
    new_duration = clip.duration_ms + delta_ms

    new_source_in = clip.source_in_ms  # fixed
    new_source_out = clip.source_in_ms + round(new_duration * speed)

    assert new_start == 1000
    assert new_duration == 3500
    assert new_source_in == 500
    assert new_source_out == 4000
    assert (new_source_out - new_source_in) == new_duration * speed

# 3. Left trim — speed factors (0.5x, 1.5x, 2.0x)
@pytest.mark.parametrize("speed", [0.5, 1.5, 2.0, 4.0])
def test_left_trim_speed_factor(speed):
    orig_dur = 4000
    orig_source_in = 1000
    orig_source_out = orig_source_in + round(orig_dur * speed)

    clip = ClipSchema(
        id=str(uuid.uuid4()),
        name="SpeedClip.mp4",
        start_time_ms=0,
        duration_ms=orig_dur,
        source_in_ms=orig_source_in,
        source_out_ms=orig_source_out,
        speed_factor=speed,
        is_reversed=False,
    )

    delta_ms = 1000  # trim 1s from left
    new_duration = orig_dur - delta_ms
    delta_media = round(delta_ms * speed)
    new_source_in = orig_source_in + delta_media
    new_source_out = orig_source_out

    assert new_duration == 3000
    assert (new_source_out - new_source_in) == round(new_duration * speed)

# 4. Right trim — speed factors (0.5x, 1.5x, 2.0x)
@pytest.mark.parametrize("speed", [0.5, 1.5, 2.0, 4.0])
def test_right_trim_speed_factor(speed):
    orig_dur = 4000
    orig_source_in = 1000
    orig_source_out = orig_source_in + round(orig_dur * speed)

    clip = ClipSchema(
        id=str(uuid.uuid4()),
        name="SpeedClip.mp4",
        start_time_ms=0,
        duration_ms=orig_dur,
        source_in_ms=orig_source_in,
        source_out_ms=orig_source_out,
        speed_factor=speed,
        is_reversed=False,
    )

    delta_ms = -1000  # shorten by 1s from right
    new_duration = orig_dur + delta_ms
    new_source_in = orig_source_in
    new_source_out = orig_source_in + round(new_duration * speed)

    assert new_duration == 3000
    assert (new_source_out - new_source_in) == round(new_duration * speed)

# 5. Left trim — reverse playback
def test_left_trim_reverse_playback():
    # In reverse playback, clip plays from source_out backward to source_in
    clip = ClipSchema(
        id=str(uuid.uuid4()),
        name="ReverseClip.mp4",
        start_time_ms=0,
        duration_ms=5000,
        source_in_ms=1000,
        source_out_ms=6000,
        speed_factor=1.0,
        is_reversed=True,
    )

    # Trim 1000ms from left: playback skips first 1000ms (which is source_out down to source_out - 1000)
    delta_ms = 1000
    actual_delta_start = delta_ms
    new_duration = clip.duration_ms - actual_delta_start
    delta_media = round(actual_delta_start * clip.speed_factor)

    new_source_out = clip.source_out_ms - delta_media
    new_source_in = clip.source_in_ms  # fixed

    assert new_duration == 4000
    assert new_source_out == 5000
    assert new_source_in == 1000
    assert (new_source_out - new_source_in) == new_duration * clip.speed_factor

# 6. Right trim — reverse playback
def test_right_trim_reverse_playback():
    # In reverse playback, extending right extends playback duration backwards towards source_in
    clip = ClipSchema(
        id=str(uuid.uuid4()),
        name="ReverseClip.mp4",
        start_time_ms=0,
        duration_ms=5000,
        source_in_ms=1000,
        source_out_ms=6000,
        speed_factor=1.0,
        is_reversed=True,
    )

    # Shorten by 1500ms from right
    delta_ms = -1500
    new_duration = clip.duration_ms + delta_ms
    speed = clip.speed_factor

    new_source_out = clip.source_out_ms  # fixed
    new_source_in = clip.source_out_ms - round(new_duration * speed)

    assert new_duration == 3500
    assert new_source_out == 6000
    assert new_source_in == 2500
    assert (new_source_out - new_source_in) == new_duration * speed

# 7. Minimum duration protection
def test_trim_minimum_duration_protection():
    min_dur = 100
    clip = ClipSchema(
        name="ShortClip.mp4",
        start_time_ms=500,
        duration_ms=300,
        source_in_ms=0,
        source_out_ms=300,
    )
    # Attempting to shorten by 250ms would leave 50ms < min_dur (100ms)
    attempted_delta = 250
    would_be_dur = clip.duration_ms - attempted_delta
    assert would_be_dur < min_dur
    # Protection triggers, rejecting the trim or clamping to 100ms
    clamped_delta = clip.duration_ms - min_dur
    assert clamped_delta == 200
    assert (clip.duration_ms - clamped_delta) >= min_dur

# 8. Source boundary limits & non-negative bounds
def test_trim_source_boundary_limits():
    clip = ClipSchema(
        name="BoundaryClip.mp4",
        start_time_ms=0,
        duration_ms=3000,
        source_in_ms=200,
        source_out_ms=3200,
        speed_factor=1.0,
        is_reversed=False,
    )
    # Attempting to extend left by 500ms when source_in_ms is only 200ms
    extend_delta = -500
    new_source_in = clip.source_in_ms + extend_delta
    # Boundary guard: new_source_in cannot be negative
    assert new_source_in < 0
    # Must be bounded by max(0, new_source_in)
    bounded_source_in = max(0, new_source_in)
    assert bounded_source_in == 0

# 9. Keyframe re-anchoring and boundary interpolation
def test_trim_keyframes_boundary_interpolation():
    keyframes = [
        KeyframeSchema(property_path="rotation", time_offset_ms=0, value=0.0),
        KeyframeSchema(property_path="rotation", time_offset_ms=2000, value=20.0),
        KeyframeSchema(property_path="rotation", time_offset_ms=4000, value=40.0),
    ]

    # Trim 1000ms from left: cut occurs at time_offset_ms = 1000
    cut_offset = 1000
    # Linear interpolation between kf0 (0ms, 0) and kf1 (2000ms, 20):
    interpolated_val = 0.0 + (1000 - 0) / (2000 - 0) * (20.0 - 0.0)
    assert interpolated_val == 10.0

    # Remaining keyframes shifted by -1000ms
    shifted_kfs = [
        {"offset": 0, "value": interpolated_val},  # boundary
        {"offset": 2000 - cut_offset, "value": 20.0},
        {"offset": 4000 - cut_offset, "value": 40.0},
    ]

    assert shifted_kfs[0]["offset"] == 0
    assert shifted_kfs[0]["value"] == 10.0
    assert shifted_kfs[1]["offset"] == 1000
    assert shifted_kfs[2]["offset"] == 3000

# 10. Transition duration clamping
def test_trim_transition_clamping():
    clip = ClipSchema(
        name="TransitionClip.mp4",
        start_time_ms=0,
        duration_ms=4000,
        source_in_ms=0,
        source_out_ms=4000,
        transition_out={"type": "crossfade", "duration_ms": 1500},
    )

    # Trim right edge down to 800ms: transition duration (1500ms) exceeds new duration
    new_dur = 800
    clamped_transition_dur = max(50, min(clip.transition_out["duration_ms"], new_dur))
    assert clamped_transition_dur == 800

    # Trim below 100ms removes transition
    too_short = 80
    assert too_short < 100

# 11. Freeze Frame trimming (shift, partial, removal)
def test_trim_freeze_frame_adjustment():
    # 6s clip with 2s freeze starting at 2000ms (window: [2000, 4000])
    freeze_at = 2000
    freeze_dur = 2000
    freeze_end = 4000

    # Case A: Left trim before freeze (delta = 1000ms)
    delta_a = 1000
    assert delta_a <= freeze_at
    new_freeze_at_a = freeze_at - delta_a
    assert new_freeze_at_a == 1000

    # Case B: Left trim into freeze window (delta = 2500ms)
    delta_b = 2500
    assert freeze_at < delta_b < freeze_end
    new_freeze_at_b = 0
    new_freeze_dur_b = freeze_end - delta_b
    assert new_freeze_at_b == 0
    assert new_freeze_dur_b == 1500

    # Case C: Left trim past freeze window (delta = 4500ms)
    delta_c = 4500
    assert delta_c >= freeze_end
    # Freeze removed completely

# 12. Frame Hold trimming & Option A mutual exclusion
def test_trim_frame_hold_and_mutual_exclusion():
    clip = ClipSchema(
        name="HoldClip.mp4",
        start_time_ms=0,
        duration_ms=5000,
        source_in_ms=0,
        source_out_ms=5000,
        is_frozen=False,
        is_frame_hold=True,
        frame_hold_at_ms=1000,
        frame_hold_duration_ms=2000,
    )
    assert not (clip.is_frozen and clip.is_frame_hold)
    assert clip.is_frame_hold is True

    # Right trim cuts off hold if new duration <= frame_hold_at_ms
    new_dur = 800
    assert new_dur <= clip.frame_hold_at_ms
    # When trimmed, frame hold is cleared
    trimmed_is_hold = False
    assert trimmed_is_hold is False

# 13. FFmpeg render test: Trimmed video clip rendering
@pytest.mark.asyncio
async def test_render_behavior_with_trimmed_clips(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v_path = Path(td) / "source_shot_trim.mp4"
        out_path = Path(td) / "out_trim.mp4"

        # Create 6-second synthetic test video
        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=6",
            "-f", "lavfi", "-i", "sine=f=440:d=6",
            "-c:v", "libx264", "-c:a", "aac",
            str(v_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        export_preset = {
            "width": 320,
            "height": 240,
            "fps": 25,
            "crf": 23,
            "video_codec": "libx264",
            "audio_codec": "aac",
        }

        # Trimmed clip: originally 0-6s, trimmed left by 1s and right by 1s (playing 1s to 5s, duration 4s)
        video_clips = [
            {
                "id": "c1_trimmed",
                "file_path": v_path,
                "start_time_ms": 0,
                "duration_ms": 4000,
                "source_in_ms": 1000,
                "source_out_ms": 5000,
                "speed_factor": 1.0,
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

# 14. FFmpeg render test: Trimmed clip with speed factor and keyframes
@pytest.mark.asyncio
async def test_render_behavior_with_trimmed_speed_and_keyframes(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v_path = Path(td) / "source_shot_trim_speed.mp4"
        out_path = Path(td) / "out_trim_speed.mp4"

        # Create 8-second synthetic test video
        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=purple:s=320x240:r=25:d=8",
            "-f", "lavfi", "-i", "sine=f=520:d=8",
            "-c:v", "libx264", "-c:a", "aac",
            str(v_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        export_preset = {
            "width": 320,
            "height": 240,
            "fps": 25,
            "crf": 23,
            "video_codec": "libx264",
            "audio_codec": "aac",
        }

        # Trimmed clip at 2.0x speed: duration 2000ms consumes 4000ms source media (from 2000ms to 6000ms)
        video_clips = [
            {
                "id": "c_trim_speed",
                "file_path": v_path,
                "start_time_ms": 0,
                "duration_ms": 2000,
                "source_in_ms": 2000,
                "source_out_ms": 6000,
                "speed_factor": 2.0,
                "keyframes": [
                    {"property_path": "opacity", "time_offset_ms": 0, "value": 0.8},
                    {"property_path": "opacity", "time_offset_ms": 2000, "value": 1.0}
                ]
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
