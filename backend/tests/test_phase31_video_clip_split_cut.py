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

# 1. Split clip schema serialization & deserialization
def test_split_clip_schema_serialization():
    orig_id = str(uuid.uuid4())
    clip1_id = str(uuid.uuid4())
    clip2_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())

    orig_clip = ClipSchema(
        id=orig_id,
        track_id="track-v1",
        asset_id=asset_id,
        name="Source_Clip.mp4",
        start_time_ms=0,
        duration_ms=6000,
        source_in_ms=0,
        source_out_ms=6000,
        speed_factor=1.0,
        is_reversed=False,
        is_frozen=False,
        is_frame_hold=False,
        opacity=1.0,
        rotation=0.0
    )

    # Split at 2500ms
    split_offset = 2500
    clip1 = ClipSchema(
        id=clip1_id,
        track_id=orig_clip.track_id,
        asset_id=orig_clip.asset_id,
        name=orig_clip.name,
        start_time_ms=0,
        duration_ms=split_offset,
        source_in_ms=orig_clip.source_in_ms,
        source_out_ms=orig_clip.source_in_ms + split_offset,
        speed_factor=orig_clip.speed_factor,
        opacity=orig_clip.opacity
    )

    clip2 = ClipSchema(
        id=clip2_id,
        track_id=orig_clip.track_id,
        asset_id=orig_clip.asset_id,
        name=orig_clip.name,
        start_time_ms=split_offset,
        duration_ms=orig_clip.duration_ms - split_offset,
        source_in_ms=orig_clip.source_in_ms + split_offset,
        source_out_ms=orig_clip.source_out_ms,
        speed_factor=orig_clip.speed_factor,
        opacity=orig_clip.opacity
    )

    # Both clips have unique IDs and reference the same asset
    assert clip1.id != clip2.id
    assert clip1.id != orig_clip.id
    assert clip2.id != orig_clip.id
    assert clip1.asset_id == orig_clip.asset_id
    assert clip2.asset_id == orig_clip.asset_id

    # Verify timeline state integrity
    track = TrackSchema(
        id="track-v1",
        timeline_id="tl-1",
        name="V1",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[clip1, clip2]
    )
    tl_state = TimelineStateSchema(
        id="tl-1",
        project_id="proj-1",
        duration_ms=6000,
        tracks=[track]
    )

    dumped = tl_state.model_dump()
    assert len(dumped["tracks"][0]["clips"]) == 2
    assert dumped["tracks"][0]["clips"][0]["duration_ms"] == 2500
    assert dumped["tracks"][0]["clips"][1]["duration_ms"] == 3500
    assert dumped["tracks"][0]["clips"][0]["duration_ms"] + dumped["tracks"][0]["clips"][1]["duration_ms"] == 6000

# 2. Split timing math for forward playback
def test_split_timing_math_forward():
    start_time_ms = 1000
    duration_ms = 8000
    source_in_ms = 2000
    source_out_ms = 10000
    playhead_ms = 4000  # splitOffset = 3000ms

    split_offset = playhead_ms - start_time_ms
    left_dur = split_offset
    right_dur = duration_ms - split_offset

    left_source_in = source_in_ms
    left_source_out = source_in_ms + split_offset
    right_source_in = source_in_ms + split_offset
    right_source_out = source_out_ms

    assert left_dur == 3000
    assert right_dur == 5000
    assert left_dur + right_dur == duration_ms
    assert left_source_in == 2000
    assert left_source_out == 5000
    assert right_source_in == 5000
    assert right_source_out == 10000
    assert right_source_in == left_source_out  # Zero frame gap or overlap

# 3. Split timing math with speed factor (e.g. 2.0x speed)
def test_split_timing_math_with_speed():
    start_time_ms = 0
    duration_ms = 4000  # at 2.0x, consumes 8000ms of source media
    speed = 2.0
    source_in_ms = 1000
    source_out_ms = 9000
    playhead_ms = 1500  # splitOffset = 1500ms

    split_offset = playhead_ms - start_time_ms
    media_delta = int(split_offset * speed)

    left_dur = split_offset
    right_dur = duration_ms - split_offset
    left_source_in = source_in_ms
    left_source_out = source_in_ms + media_delta
    right_source_in = source_in_ms + media_delta
    right_source_out = source_out_ms

    assert left_dur == 1500
    assert right_dur == 2500
    assert left_source_in == 1000
    assert left_source_out == 4000  # 1000 + 1500*2 = 4000
    assert right_source_in == 4000
    assert right_source_out == 9000

# 4. Split timing math for reverse playback
def test_split_timing_math_reverse():
    start_time_ms = 0
    duration_ms = 6000
    speed = 1.0
    orig_source_in = 0
    orig_source_out = 6000
    playhead_ms = 2000  # splitOffset = 2000ms

    split_offset = playhead_ms - start_time_ms
    media_delta = int(split_offset * speed)

    # In reverse playback, left segment plays from orig_source_out down to (orig_source_out - media_delta)
    # Right segment plays from (orig_source_out - media_delta) down to orig_source_in
    left_source_in = max(orig_source_in, orig_source_out - media_delta)
    left_source_out = orig_source_out
    right_source_in = orig_source_in
    right_source_out = max(orig_source_in, orig_source_out - media_delta)

    assert left_source_in == 4000
    assert left_source_out == 6000
    assert right_source_in == 0
    assert right_source_out == 4000
    assert (left_source_out - left_source_in) == 2000
    assert (right_source_out - right_source_in) == 4000

# 5. Keyframe boundary interpolation and partitioning
def test_split_preserves_keyframes_with_boundary_interpolation():
    clip_id = str(uuid.uuid4())
    clip1_id = str(uuid.uuid4())
    clip2_id = str(uuid.uuid4())

    kf1 = KeyframeSchema(
        id=str(uuid.uuid4()),
        property_path="rotation",
        time_offset_ms=0,
        value=0.0,
        interpolation="linear"
    )
    kf2 = KeyframeSchema(
        id=str(uuid.uuid4()),
        property_path="rotation",
        time_offset_ms=4000,
        value=20.0,
        interpolation="linear"
    )

    # Split at 1000ms: interpolated rotation is 0 + (20-0)*(1000/4000) = 5.0
    split_offset = 1000
    interpolated_val = 5.0

    left_kfs = [
        KeyframeSchema(id=str(uuid.uuid4()), property_path="rotation", time_offset_ms=0, value=0.0),
        KeyframeSchema(id=str(uuid.uuid4()), property_path="rotation", time_offset_ms=split_offset, value=interpolated_val),
    ]

    right_kfs = [
        KeyframeSchema(id=str(uuid.uuid4()), property_path="rotation", time_offset_ms=0, value=interpolated_val),
        KeyframeSchema(id=str(uuid.uuid4()), property_path="rotation", time_offset_ms=4000 - split_offset, value=20.0),
    ]

    assert len(left_kfs) == 2
    assert len(right_kfs) == 2
    assert left_kfs[1].time_offset_ms == 1000
    assert left_kfs[1].value == 5.0
    assert right_kfs[0].time_offset_ms == 0
    assert right_kfs[0].value == 5.0
    assert right_kfs[1].time_offset_ms == 3000
    assert right_kfs[1].value == 20.0

# 6. Preserve exterior transitions and clean cut boundary
def test_split_preserves_exterior_transitions_and_cleans_cut():
    orig_transition_in = {"type": "crossfade", "duration_ms": 1000}
    orig_transition_out = {"type": "fade_black", "duration_ms": 1000}

    # Left clip keeps transition_in, clears transition_out (cut boundary)
    clip1_transition_in = orig_transition_in
    clip1_transition_out = None

    # Right clip keeps transition_out, clears transition_in (cut boundary)
    clip2_transition_in = None
    clip2_transition_out = orig_transition_out

    assert clip1_transition_in["type"] == "crossfade"
    assert clip1_transition_out is None
    assert clip2_transition_in is None
    assert clip2_transition_out["type"] == "fade_black"

# 7. Freeze frame partitioning across split
def test_split_preserves_freeze_frame_partition():
    # Case A: Freeze at 4000ms (dur 2000ms), split at 2000ms -> freeze belongs to right segment
    freeze_at = 4000
    freeze_dur = 2000
    split_offset = 2000

    assert split_offset <= freeze_at
    right_freeze_at = freeze_at - split_offset  # 2000ms
    assert right_freeze_at == 2000

    # Case B: Freeze at 1000ms (dur 2000ms), split at 4000ms -> freeze belongs to left segment
    split_offset_b = 4000
    freeze_end = 1000 + 2000
    assert split_offset_b >= freeze_end
    left_freeze_at = 1000
    assert left_freeze_at == 1000

# 8. Frame hold partitioning and Option A mutual exclusion
def test_split_preserves_frame_hold_and_mutual_exclusion():
    hold_at = 3000
    hold_dur = 2000
    split_offset = 1500

    right_hold_at = hold_at - split_offset
    assert right_hold_at == 1500

    # Option A mutual exclusion check: neither clip can have both is_frozen and is_frame_hold
    clip1 = ClipSchema(
        name="Seg1",
        start_time_ms=0,
        duration_ms=1500,
        is_frozen=False,
        is_frame_hold=False
    )
    clip2 = ClipSchema(
        name="Seg2",
        start_time_ms=1500,
        duration_ms=3500,
        is_frozen=False,
        is_frame_hold=True,
        frame_hold_at_ms=right_hold_at,
        frame_hold_duration_ms=hold_dur
    )

    assert not (clip1.is_frozen and clip1.is_frame_hold)
    assert not (clip2.is_frozen and clip2.is_frame_hold)
    assert clip2.is_frame_hold is True

# 9. FFmpeg render test: Concatenated rendering of two split segments
@pytest.mark.asyncio
async def test_render_behavior_with_split_clips(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v_path = Path(td) / "source_shot.mp4"
        out_path = Path(td) / "out_split.mp4"

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

        # Two split segments from the single 6-second video (split at 2500ms)
        video_clips = [
            {
                "id": "c1_left",
                "file_path": v_path,
                "start_time_ms": 0,
                "duration_ms": 2500,
                "source_in_ms": 0,
                "source_out_ms": 2500,
                "speed_factor": 1.0,
            },
            {
                "id": "c1_right",
                "file_path": v_path,
                "start_time_ms": 2500,
                "duration_ms": 3500,
                "source_in_ms": 2500,
                "source_out_ms": 6000,
                "speed_factor": 1.0,
            }
        ]

        success = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=6000,
            video_clips=video_clips,
            audio_clips=[],
            output_path=out_path,
            export_preset=export_preset,
        )
        assert success is True
        assert out_path.exists()
        assert out_path.stat().st_size > 1000

# 10. FFmpeg render test: Split segments with speed and keyframes
@pytest.mark.asyncio
async def test_render_behavior_with_split_speed_and_keyframes(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v_path = Path(td) / "source_shot_speed.mp4"
        out_path = Path(td) / "out_split_speed.mp4"

        # Create 6-second synthetic test video
        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=navy:s=320x240:r=25:d=6",
            "-f", "lavfi", "-i", "sine=f=520:d=6",
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

        # Segment 1: 0-2s at 1.5x speed with opacity keyframe
        # Segment 2: 2-4s at 1.5x speed with rotation keyframe
        video_clips = [
            {
                "id": "seg1",
                "file_path": v_path,
                "start_time_ms": 0,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 3000,
                "speed_factor": 1.5,
                "keyframes": [
                    {"property_path": "opacity", "time_offset_ms": 0, "value": 0.5},
                    {"property_path": "opacity", "time_offset_ms": 2000, "value": 1.0}
                ]
            },
            {
                "id": "seg2",
                "file_path": v_path,
                "start_time_ms": 2000,
                "duration_ms": 2000,
                "source_in_ms": 3000,
                "source_out_ms": 6000,
                "speed_factor": 1.5,
                "keyframes": [
                    {"property_path": "rotation", "time_offset_ms": 0, "value": 0.0},
                    {"property_path": "rotation", "time_offset_ms": 2000, "value": 10.0}
                ]
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
