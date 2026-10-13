import pytest
import os
import tempfile
import subprocess
import asyncio
import uuid
from pathlib import Path
from app.core.ffmpeg import FFmpegService
from app.schemas.timeline import ClipSchema, TrackSchema, TimelineStateSchema, KeyframeSchema

@pytest.fixture
def ffmpeg_service():
    return FFmpegService()

# 1. Duplicate clip schema serialization & independence
def test_duplicate_clip_schema_serialization():
    orig_id = str(uuid.uuid4())
    dupe_id = str(uuid.uuid4())

    orig_clip = ClipSchema(
        id=orig_id,
        name="Source Shot.mp4",
        start_time_ms=0,
        duration_ms=4000,
        source_in_ms=500,
        source_out_ms=4500,
        speed_factor=1.5,
        is_reversed=False,
        is_frozen=False,
        is_frame_hold=False,
        opacity=0.9,
        position_x=0.6,
        position_y=0.4,
        scale_x=1.2,
        scale_y=1.2,
        rotation=5.0,
    )

    # Simulate duplicate creation
    dupe_dict = orig_clip.model_dump()
    dupe_dict["id"] = dupe_id
    dupe_dict["start_time_ms"] = orig_clip.start_time_ms + orig_clip.duration_ms
    dupe_clip = ClipSchema(**dupe_dict)

    assert dupe_clip.id != orig_clip.id
    assert dupe_clip.id == dupe_id
    assert dupe_clip.start_time_ms == 4000
    assert dupe_clip.duration_ms == orig_clip.duration_ms
    assert dupe_clip.source_in_ms == orig_clip.source_in_ms
    assert dupe_clip.source_out_ms == orig_clip.source_out_ms
    assert dupe_clip.speed_factor == orig_clip.speed_factor
    assert dupe_clip.rotation == orig_clip.rotation
    assert dupe_clip.opacity == orig_clip.opacity

# 2. Keyframe cloning and ID independence on duplicate
def test_duplicate_clip_preserves_keyframes():
    orig_id = str(uuid.uuid4())
    dupe_id = str(uuid.uuid4())
    orig_kf_id = str(uuid.uuid4())
    dupe_kf_id = str(uuid.uuid4())

    orig_clip = ClipSchema(
        id=orig_id,
        name="Keyframed Clip",
        start_time_ms=0,
        duration_ms=3000,
        keyframes=[
            KeyframeSchema(
                id=orig_kf_id,
                property_path="rotation",
                time_offset_ms=500,
                value=15.0,
                interpolation="linear"
            )
        ]
    )

    dupe_dict = orig_clip.model_dump()
    dupe_dict["id"] = dupe_id
    dupe_dict["start_time_ms"] = 3000
    dupe_dict["keyframes"] = [
        {**kf, "id": dupe_kf_id}
        for kf in dupe_dict["keyframes"]
    ]
    dupe_clip = ClipSchema(**dupe_dict)

    assert len(dupe_clip.keyframes) == 1
    assert dupe_clip.keyframes[0].id == dupe_kf_id
    assert dupe_clip.keyframes[0].id != orig_clip.keyframes[0].id
    assert dupe_clip.keyframes[0].property_path == "rotation"
    assert dupe_clip.keyframes[0].value == 15.0

# 3. Duplicate clip preserves speed & reverse
def test_duplicate_clip_preserves_speed_reverse():
    clip = ClipSchema(
        name="Reversed Speed Clip",
        start_time_ms=0,
        duration_ms=5000,
        speed_factor=2.0,
        is_reversed=True,
    )
    dupe_dict = clip.model_dump()
    dupe_dict["id"] = str(uuid.uuid4())
    dupe_dict["start_time_ms"] = 5000
    dupe = ClipSchema(**dupe_dict)

    assert dupe.speed_factor == 2.0
    assert dupe.is_reversed is True

# 4. Duplicate clip preserves freeze frame
def test_duplicate_clip_preserves_freeze_frame():
    clip = ClipSchema(
        name="Freeze Clip",
        start_time_ms=0,
        duration_ms=4000,
        is_frozen=True,
        freeze_at_ms=1500,
        freeze_duration_ms=2000,
    )
    dupe_dict = clip.model_dump()
    dupe_dict["id"] = str(uuid.uuid4())
    dupe_dict["start_time_ms"] = 4000
    dupe = ClipSchema(**dupe_dict)

    assert dupe.is_frozen is True
    assert dupe.freeze_at_ms == 1500
    assert dupe.freeze_duration_ms == 2000

# 5. Duplicate clip preserves frame hold
def test_duplicate_clip_preserves_frame_hold():
    clip = ClipSchema(
        name="Hold Clip",
        start_time_ms=0,
        duration_ms=4000,
        is_frame_hold=True,
        frame_hold_at_ms=2000,
        frame_hold_duration_ms=3000,
    )
    dupe_dict = clip.model_dump()
    dupe_dict["id"] = str(uuid.uuid4())
    dupe_dict["start_time_ms"] = 4000
    dupe = ClipSchema(**dupe_dict)

    assert dupe.is_frame_hold is True
    assert dupe.frame_hold_at_ms == 2000
    assert dupe.frame_hold_duration_ms == 3000

# 6. Mutual exclusion preserved on duplicate
def test_mutual_exclusion_preserved_on_duplicate():
    clip = ClipSchema(
        name="Exclusion Clip",
        start_time_ms=0,
        duration_ms=4000,
        is_frozen=False,
        is_frame_hold=True,
        frame_hold_at_ms=1000,
        frame_hold_duration_ms=2000,
    )
    dupe_dict = clip.model_dump()
    dupe_dict["id"] = str(uuid.uuid4())
    dupe = ClipSchema(**dupe_dict)

    assert dupe.is_frame_hold is True
    assert dupe.is_frozen is False

# 7. Timeline state schema with duplicate clips
def test_timeline_state_with_duplicates():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=3000)
    c2 = ClipSchema(id="c2", name="Clip 1 (Duplicate)", start_time_ms=3000, duration_ms=3000)
    c3 = ClipSchema(id="c3", name="Clip 2", start_time_ms=6000, duration_ms=4000)

    track = TrackSchema(
        id="v1",
        track_type="video",
        order_index=0,
        name="V1 Video",
        clips=[c1, c2, c3]
    )

    timeline = TimelineStateSchema(
        id="tl1",
        project_id="p1",
        duration_ms=10000,
        tracks=[track]
    )

    dumped = timeline.model_dump()
    assert len(dumped["tracks"][0]["clips"]) == 3
    assert dumped["tracks"][0]["clips"][1]["id"] == "c2"
    assert dumped["tracks"][0]["clips"][1]["start_time_ms"] == 3000

# 8. Render behavior with duplicate clips pointing to same source media
@pytest.mark.asyncio
async def test_render_behavior_with_duplicate_clips(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v_path = Path(td) / "source_shot.mp4"
        out_path = Path(td) / "out_duplicates.mp4"

        # Create 4-second synthetic video
        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=purple:s=320x240:r=25:d=4",
            "-f", "lavfi", "-i", "sine=f=440:d=4",
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

        # Sequence with original and duplicate clip referencing the same media
        video_clips = [
            {
                "id": "c1",
                "file_path": v_path,
                "start_time_ms": 0,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 2000,
            },
            {
                "id": "c1_duplicate",
                "file_path": v_path,
                "start_time_ms": 2000,
                "duration_ms": 2000,
                "source_in_ms": 1000,
                "source_out_ms": 3000,
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

# 9. Render behavior with duplicate clips and transition
@pytest.mark.asyncio
async def test_render_behavior_with_duplicate_and_transitions(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v_path = Path(td) / "source_shot.mp4"
        out_path = Path(td) / "out_dupe_transition.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=coral:s=320x240:r=25:d=4",
            "-f", "lavfi", "-i", "sine=f=520:d=4",
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

        video_clips = [
            {
                "id": "c1",
                "file_path": v_path,
                "start_time_ms": 0,
                "duration_ms": 2500,
                "source_in_ms": 0,
                "source_out_ms": 2500,
                "transition_out": {"type": "crossfade", "duration_ms": 500},
            },
            {
                "id": "c1_duplicate",
                "file_path": v_path,
                "start_time_ms": 2500,
                "duration_ms": 2500,
                "source_in_ms": 500,
                "source_out_ms": 3000,
                "transition_in": {"type": "crossfade", "duration_ms": 500},
            }
        ]

        success = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=4500,
            video_clips=video_clips,
            audio_clips=[],
            output_path=out_path,
            export_preset=export_preset,
        )
        assert success is True
        assert out_path.exists()
        assert out_path.stat().st_size > 1000

# 10. Render behavior with duplicate clips with keyframes and speed
@pytest.mark.asyncio
async def test_render_behavior_with_duplicate_and_speed_keyframes(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v_path = Path(td) / "source_shot.mp4"
        out_path = Path(td) / "out_dupe_speed_kf.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=indigo:s=320x240:r=25:d=5",
            "-f", "lavfi", "-i", "sine=f=600:d=5",
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

        video_clips = [
            {
                "id": "c1",
                "file_path": v_path,
                "start_time_ms": 0,
                "duration_ms": 2000,
                "source_in_ms": 0,
                "source_out_ms": 2000,
            },
            {
                "id": "c1_duplicate",
                "file_path": v_path,
                "start_time_ms": 2000,
                "duration_ms": 2000,
                "source_in_ms": 1000,
                "source_out_ms": 4000,
                "speed_factor": 1.5,
                "keyframes": [
                    {
                        "property_path": "rotation",
                        "time_offset_ms": 500,
                        "value": 10.0,
                    }
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
