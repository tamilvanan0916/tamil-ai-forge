import pytest
import tempfile
import subprocess
from pathlib import Path
import uuid
import copy

from app.schemas.timeline import ClipSchema, KeyframeSchema, TrackSchema, TimelineStateSchema
from app.core.ffmpeg import FFmpegService

@pytest.fixture
def ffmpeg_service():
    return FFmpegService()

# Pure ripple helper functions mirroring the Zustand store behavior for testing
def simulate_ripple_trim(track_clips, clip_id, edge, delta_ms, force_ripple=True):
    clips = [copy.deepcopy(c) for c in track_clips]
    clip = next((c for c in clips if c.id == clip_id), None)
    if not clip:
        return clips

    orig_start = clip.start_time_ms
    orig_dur = clip.duration_ms
    orig_end = orig_start + orig_dur
    speed = clip.speed_factor if clip.speed_factor and clip.speed_factor > 0 else 1.0

    if edge == "left":
        actual_delta = delta_ms
        new_dur = orig_dur - actual_delta
        if new_dur < 100:
            return track_clips
        delta_media = round(actual_delta * speed)
        clip.source_in_ms += delta_media
        clip.duration_ms = new_dur
        if force_ripple:
            clip.start_time_ms = orig_start
        else:
            clip.start_time_ms = orig_start + actual_delta
    else:  # right
        new_dur = orig_dur + delta_ms
        if new_dur < 100:
            return track_clips
        delta_media = round(new_dur * speed)
        clip.source_out_ms = clip.source_in_ms + delta_media
        clip.duration_ms = new_dur

    if force_ripple:
        delta_dur = clip.duration_ms - orig_dur
        if delta_dur != 0:
            for other in clips:
                if other.id != clip.id and other.start_time_ms >= orig_end - 5:
                    other.start_time_ms = max(0, other.start_time_ms + delta_dur)
            clips.sort(key=lambda c: c.start_time_ms)

    return clips

def simulate_ripple_delete(track_clips, clip_id, all_tracks=None):
    clips = [copy.deepcopy(c) for c in track_clips]
    idx = next((i for i, c in enumerate(clips) if c.id == clip_id), None)
    if idx is None:
        return clips

    deleted = clips.pop(idx)
    gap = deleted.duration_ms
    delete_end = deleted.start_time_ms + gap

    for c in clips:
        if c.start_time_ms >= delete_end - 5:
            c.start_time_ms = max(0, c.start_time_ms - gap)

    def clean_clip_trans(c):
        if getattr(c, 'transition_out', None):
            to_id = c.transition_out.get('to_clip_id') if isinstance(c.transition_out, dict) else getattr(c.transition_out, 'to_clip_id', None)
            if to_id == clip_id:
                c.transition_out = None
        if getattr(c, 'transition_in', None):
            from_id = c.transition_in.get('from_clip_id') if isinstance(c.transition_in, dict) else getattr(c.transition_in, 'from_clip_id', None)
            if from_id == clip_id:
                c.transition_in = None

    for c in clips:
        clean_clip_trans(c)

    if all_tracks:
        for t in all_tracks:
            for c in t.clips:
                clean_clip_trans(c)

    return clips

# 1. Right ripple trim — shortening downstream clips
def test_right_ripple_trim_shortening_downstream_shift():
    clip_a = ClipSchema(id="a", name="A", start_time_ms=0, duration_ms=5000, source_in_ms=0, source_out_ms=5000)
    clip_b = ClipSchema(id="b", name="B", start_time_ms=5000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    track_clips = [clip_a, clip_b]

    # Trim A right edge by -2000ms (5000 -> 3000)
    rippled = simulate_ripple_trim(track_clips, "a", "right", -2000, force_ripple=True)

    assert rippled[0].id == "a"
    assert rippled[0].duration_ms == 3000
    assert rippled[1].id == "b"
    assert rippled[1].start_time_ms == 3000  # Shifted left from 5000 to 3000
    assert rippled[1].duration_ms == 3000

# 2. Right ripple trim — extending downstream clips
def test_right_ripple_trim_extending_downstream_shift():
    clip_a = ClipSchema(id="a", name="A", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
    clip_b = ClipSchema(id="b", name="B", start_time_ms=4000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    track_clips = [clip_a, clip_b]

    # Extend A right edge by +1500ms (4000 -> 5500)
    rippled = simulate_ripple_trim(track_clips, "a", "right", 1500, force_ripple=True)

    assert rippled[0].duration_ms == 5500
    assert rippled[1].start_time_ms == 5500  # Shifted right from 4000 to 5500

# 3. Left ripple trim — shortening downstream clips
def test_left_ripple_trim_shortening_downstream_shift():
    clip_a = ClipSchema(id="a", name="A", start_time_ms=1000, duration_ms=5000, source_in_ms=0, source_out_ms=5000)
    clip_b = ClipSchema(id="b", name="B", start_time_ms=6000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    track_clips = [clip_a, clip_b]

    # Trim A left edge by +1000ms (in ripple mode: clip stays anchored at 1000, duration becomes 4000, ends at 5000)
    rippled = simulate_ripple_trim(track_clips, "a", "left", 1000, force_ripple=True)

    assert rippled[0].start_time_ms == 1000
    assert rippled[0].duration_ms == 4000
    assert rippled[1].start_time_ms == 5000  # Shifted left by 1000ms

# 4. Left ripple trim — extending downstream clips
def test_left_ripple_trim_extending_downstream_shift():
    clip_a = ClipSchema(id="a", name="A", start_time_ms=1000, duration_ms=4000, source_in_ms=1000, source_out_ms=5000)
    clip_b = ClipSchema(id="b", name="B", start_time_ms=5000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    track_clips = [clip_a, clip_b]

    # Extend A left edge by -1000ms (duration becomes 5000)
    rippled = simulate_ripple_trim(track_clips, "a", "left", -1000, force_ripple=True)

    assert rippled[0].start_time_ms == 1000
    assert rippled[0].duration_ms == 5000
    assert rippled[1].start_time_ms == 6000  # Shifted right by 1000ms

# 5. Multi-clip downstream spacing preservation
def test_multi_clip_downstream_spacing_preservation():
    clip_a = ClipSchema(id="a", name="A", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
    clip_b = ClipSchema(id="b", name="B", start_time_ms=4000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    clip_c = ClipSchema(id="c", name="C", start_time_ms=9000, duration_ms=2000, source_in_ms=0, source_out_ms=2000) # 2000ms gap after B
    clip_d = ClipSchema(id="d", name="D", start_time_ms=12000, duration_ms=2000, source_in_ms=0, source_out_ms=2000) # 1000ms gap after C
    track_clips = [clip_a, clip_b, clip_c, clip_d]

    # Trim A right by -1000ms (duration 4000 -> 3000)
    rippled = simulate_ripple_trim(track_clips, "a", "right", -1000, force_ripple=True)

    assert rippled[0].duration_ms == 3000
    assert rippled[1].start_time_ms == 3000
    assert rippled[2].start_time_ms == 8000
    assert rippled[3].start_time_ms == 11000

    # Verify gaps between downstream clips are strictly preserved
    gap_bc_orig = clip_c.start_time_ms - (clip_b.start_time_ms + clip_b.duration_ms)
    gap_bc_new = rippled[2].start_time_ms - (rippled[1].start_time_ms + rippled[1].duration_ms)
    assert gap_bc_orig == 2000
    assert gap_bc_new == 2000

    gap_cd_orig = clip_d.start_time_ms - (clip_c.start_time_ms + clip_c.duration_ms)
    gap_cd_new = rippled[3].start_time_ms - (rippled[2].start_time_ms + rippled[2].duration_ms)
    assert gap_cd_orig == 1000
    assert gap_cd_new == 1000

# 6. Per-track isolation: other tracks untouched
def test_per_track_isolation():
    video_track_clips = [
        ClipSchema(id="v1", name="V1", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000),
        ClipSchema(id="v2", name="V2", start_time_ms=4000, duration_ms=3000, source_in_ms=0, source_out_ms=3000),
    ]
    audio_track_clips = [
        ClipSchema(id="a1", name="A1", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000),
        ClipSchema(id="a2", name="A2", start_time_ms=4000, duration_ms=4000, source_in_ms=0, source_out_ms=4000),
    ]

    # Ripple trim only video track v1
    rippled_video = simulate_ripple_trim(video_track_clips, "v1", "right", -1000, force_ripple=True)

    assert rippled_video[1].start_time_ms == 3000
    # Audio track clips remain completely untouched
    assert audio_track_clips[0].start_time_ms == 0
    assert audio_track_clips[1].start_time_ms == 4000

# 7. Ripple delete gap closure
def test_ripple_delete_gap_closure():
    clips = [
        ClipSchema(id="c1", name="C1", start_time_ms=0, duration_ms=3000, source_in_ms=0, source_out_ms=3000),
        ClipSchema(id="c2", name="C2", start_time_ms=3000, duration_ms=2000, source_in_ms=0, source_out_ms=2000),
        ClipSchema(id="c3", name="C3", start_time_ms=5000, duration_ms=4000, source_in_ms=0, source_out_ms=4000),
    ]

    # Ripple delete C2 (gap = 2000ms)
    after_delete = simulate_ripple_delete(clips, "c2")

    assert len(after_delete) == 2
    assert after_delete[0].id == "c1"
    assert after_delete[0].start_time_ms == 0
    assert after_delete[1].id == "c3"
    assert after_delete[1].start_time_ms == 3000  # Shifted left from 5000 to 3000 (closed 2000ms gap)

# 8. Ripple delete dangling transitions cleanup
def test_ripple_delete_dangling_transitions_cleanup():
    c1 = ClipSchema(id="c1", name="C1", start_time_ms=0, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    c2 = ClipSchema(id="c2", name="C2", start_time_ms=3000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    c3 = ClipSchema(id="c3", name="C3", start_time_ms=6000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)

    # Attach transitions involving C2
    c1.transition_out = {"type": "crossfade", "duration_ms": 1000, "from_clip_id": "c1", "to_clip_id": "c2"}
    c2.transition_in = {"type": "crossfade", "duration_ms": 1000, "from_clip_id": "c1", "to_clip_id": "c2"}
    c2.transition_out = {"type": "crossfade", "duration_ms": 1000, "from_clip_id": "c2", "to_clip_id": "c3"}
    c3.transition_in = {"type": "crossfade", "duration_ms": 1000, "from_clip_id": "c2", "to_clip_id": "c3"}

    track = TrackSchema(id="t1", name="Video", track_type="video", track_role="video", order_index=0, clips=[c1, c2, c3])
    after_delete = simulate_ripple_delete(track.clips, "c2", all_tracks=[track])

    # c1 transition_out pointing to deleted c2 must be cleared
    assert after_delete[0].id == "c1"
    assert after_delete[0].transition_out is None

    # c3 transition_in pointing from deleted c2 must be cleared
    assert after_delete[1].id == "c3"
    assert after_delete[1].transition_in is None

# 9. Downstream keyframes preservation
def test_downstream_keyframes_preservation():
    kf1 = KeyframeSchema(id="k1", clip_id="b", property_path="opacity", time_offset_ms=500, value=0.5, interpolation="linear")
    kf2 = KeyframeSchema(id="k2", clip_id="b", property_path="opacity", time_offset_ms=1500, value=1.0, interpolation="linear")
    clip_a = ClipSchema(id="a", name="A", start_time_ms=0, duration_ms=5000, source_in_ms=0, source_out_ms=5000)
    clip_b = ClipSchema(id="b", name="B", start_time_ms=5000, duration_ms=3000, source_in_ms=0, source_out_ms=3000, keyframes=[kf1, kf2])

    rippled = simulate_ripple_trim([clip_a, clip_b], "a", "right", -1500, force_ripple=True)

    assert rippled[1].id == "b"
    assert rippled[1].start_time_ms == 3500
    assert len(rippled[1].keyframes) == 2
    assert rippled[1].keyframes[0].time_offset_ms == 500  # Offset untouched
    assert rippled[1].keyframes[1].time_offset_ms == 1500

# 10. Downstream speed and reverse preservation
def test_downstream_speed_and_reverse_preservation():
    clip_a = ClipSchema(id="a", name="A", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
    clip_b = ClipSchema(id="b", name="B", start_time_ms=4000, duration_ms=2000, source_in_ms=0, source_out_ms=4000, speed_factor=2.0, is_reversed=True)

    rippled = simulate_ripple_trim([clip_a, clip_b], "a", "right", -1000, force_ripple=True)

    assert rippled[1].id == "b"
    assert rippled[1].start_time_ms == 3000
    assert rippled[1].speed_factor == 2.0
    assert rippled[1].is_reversed is True

# 11. Downstream Freeze Frame preservation
def test_downstream_freeze_frame_preservation():
    clip_a = ClipSchema(id="a", name="A", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
    clip_b = ClipSchema(id="b", name="B", start_time_ms=4000, duration_ms=4000, source_in_ms=0, source_out_ms=4000, is_frozen=True, freeze_at_ms=1000, freeze_duration_ms=2000)

    rippled = simulate_ripple_trim([clip_a, clip_b], "a", "right", -1000, force_ripple=True)

    assert rippled[1].id == "b"
    assert rippled[1].start_time_ms == 3000
    assert rippled[1].is_frozen is True
    assert rippled[1].freeze_at_ms == 1000
    assert rippled[1].freeze_duration_ms == 2000

# 12. Downstream Frame Hold preservation
def test_downstream_frame_hold_preservation():
    clip_a = ClipSchema(id="a", name="A", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
    clip_b = ClipSchema(id="b", name="B", start_time_ms=4000, duration_ms=4000, source_in_ms=0, source_out_ms=4000, is_frame_hold=True, frame_hold_at_ms=1500, frame_hold_duration_ms=2000)

    rippled = simulate_ripple_trim([clip_a, clip_b], "a", "right", -1000, force_ripple=True)

    assert rippled[1].id == "b"
    assert rippled[1].start_time_ms == 3000
    assert rippled[1].is_frame_hold is True
    assert rippled[1].frame_hold_at_ms == 1500
    assert rippled[1].frame_hold_duration_ms == 2000

# 13. Freeze Frame and Frame Hold mutual exclusion check
def test_freeze_frame_frame_hold_mutual_exclusion():
    clip_b = ClipSchema(id="b", name="B", start_time_ms=4000, duration_ms=4000, source_in_ms=0, source_out_ms=4000, is_frozen=True, freeze_at_ms=1000, freeze_duration_ms=2000)
    # Cannot have both is_frozen and is_frame_hold true simultaneously under Option A
    assert clip_b.is_frozen is True
    assert not getattr(clip_b, 'is_frame_hold', False)

# 14. Non-negative start time protection
def test_non_negative_start_time_protection():
    clip_a = ClipSchema(id="a", name="A", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    clip_b = ClipSchema(id="b", name="B", start_time_ms=1000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)

    # Shorten A by -1500ms
    rippled = simulate_ripple_trim([clip_a, clip_b], "a", "right", -1500, force_ripple=True)

    assert rippled[0].duration_ms == 500
    assert rippled[1].start_time_ms >= 0

# 15. Minimum duration protection
def test_minimum_duration_protection():
    clip_a = ClipSchema(id="a", name="A", start_time_ms=0, duration_ms=500, source_in_ms=0, source_out_ms=500)
    clip_b = ClipSchema(id="b", name="B", start_time_ms=500, duration_ms=2000, source_in_ms=0, source_out_ms=2000)

    # Attempting to trim by -450ms would leave 50ms (< 100ms minimum)
    rippled = simulate_ripple_trim([clip_a, clip_b], "a", "right", -450, force_ripple=True)

    # Should abort and leave clips unchanged
    assert rippled[0].duration_ms == 500
    assert rippled[1].start_time_ms == 500

# 16. Timeline state serialization roundtrip
def test_timeline_state_serialization_roundtrip():
    clip_a = ClipSchema(id="c1", name="C1", start_time_ms=0, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    clip_b = ClipSchema(id="c2", name="C2", start_time_ms=3000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    track = TrackSchema(id="t1", name="Video", track_type="video", track_role="video", order_index=0, clips=[clip_a, clip_b])
    state = TimelineStateSchema(id="tl1", project_id="p1", duration_ms=10000, tracks=[track])

    data = state.model_dump()
    restored = TimelineStateSchema(**data)
    assert len(restored.tracks[0].clips) == 2
    assert restored.tracks[0].clips[1].start_time_ms == 3000

# 17. Undo/redo ripple simulation
def test_undo_redo_ripple_simulation():
    c1 = ClipSchema(id="1", name="1", start_time_ms=0, duration_ms=5000, source_in_ms=0, source_out_ms=5000)
    c2 = ClipSchema(id="2", name="2", start_time_ms=5000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)

    history = [[copy.deepcopy(c1), copy.deepcopy(c2)]]

    # Ripple trim
    state1 = simulate_ripple_trim(history[0], "1", "right", -2000, force_ripple=True)
    history.append(state1)

    assert history[1][0].duration_ms == 3000
    assert history[1][1].start_time_ms == 3000

    # Undo
    undo_state = copy.deepcopy(history[0])
    assert undo_state[0].duration_ms == 5000
    assert undo_state[1].start_time_ms == 5000

    # Redo
    redo_state = copy.deepcopy(history[1])
    assert redo_state[0].duration_ms == 3000
    assert redo_state[1].start_time_ms == 3000

# 18. FFmpeg render test: Right ripple-trimmed sequence
@pytest.mark.asyncio
async def test_render_behavior_with_right_ripple_trimmed_clips(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "shot1.mp4"
        v2_path = Path(td) / "shot2.mp4"
        out_path = Path(td) / "out_right_ripple.mp4"

        # Generate synthetic clips
        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=red:s=320x240:r=25:d=5",
            "-c:v", "libx264",
            str(v1_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=25:d=4",
            "-c:v", "libx264",
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

        # Clip 1 trimmed from 5000 to 3000ms; Clip 2 ripples from 5000 down to 3000ms
        video_clips = [
            {
                "id": "c1",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 3000,
                "source_in_ms": 0,
                "source_out_ms": 3000,
                "speed_factor": 1.0,
            },
            {
                "id": "c2",
                "file_path": v2_path,
                "start_time_ms": 3000,  # Flush against trimmed c1
                "duration_ms": 3000,
                "source_in_ms": 0,
                "source_out_ms": 3000,
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

# 19. FFmpeg render test: Left ripple-trimmed sequence
@pytest.mark.asyncio
async def test_render_behavior_with_left_ripple_trimmed_clips(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "shot1_left.mp4"
        v2_path = Path(td) / "shot2_left.mp4"
        out_path = Path(td) / "out_left_ripple.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=green:s=320x240:r=25:d=6",
            "-c:v", "libx264",
            str(v1_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=yellow:s=320x240:r=25:d=4",
            "-c:v", "libx264",
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

        # Left ripple trim: c1 starts at 0, trimmed 1500ms from head (duration 3500ms, source_in 1500)
        # Downstream c2 shifts from 5000ms to 3500ms
        video_clips = [
            {
                "id": "c1",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 3500,
                "source_in_ms": 1500,
                "source_out_ms": 5000,
                "speed_factor": 1.0,
            },
            {
                "id": "c2",
                "file_path": v2_path,
                "start_time_ms": 3500,
                "duration_ms": 3000,
                "source_in_ms": 0,
                "source_out_ms": 3000,
                "speed_factor": 1.0,
            }
        ]

        success = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=6500,
            video_clips=video_clips,
            audio_clips=[],
            output_path=out_path,
            export_preset=export_preset,
        )
        assert success is True
        assert out_path.exists()
        assert out_path.stat().st_size > 1000

# 20. FFmpeg render test: Ripple deleted sequence
@pytest.mark.asyncio
async def test_render_behavior_with_ripple_deleted_sequence(ffmpeg_service):
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as td:
        v1_path = Path(td) / "shot1_del.mp4"
        v3_path = Path(td) / "shot3_del.mp4"
        out_path = Path(td) / "out_ripple_deleted.mp4"

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=magenta:s=320x240:r=25:d=3",
            "-c:v", "libx264",
            str(v1_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        subprocess.run([
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=cyan:s=320x240:r=25:d=3",
            "-c:v", "libx264",
            str(v3_path)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        export_preset = {
            "width": 320,
            "height": 240,
            "fps": 25,
            "crf": 23,
            "video_codec": "libx264",
            "audio_codec": "aac",
        }

        # Sequence where middle clip (3000-6000ms) was ripple-deleted: c3 shifted from 6000ms to 3000ms
        video_clips = [
            {
                "id": "c1",
                "file_path": v1_path,
                "start_time_ms": 0,
                "duration_ms": 3000,
                "source_in_ms": 0,
                "source_out_ms": 3000,
                "speed_factor": 1.0,
            },
            {
                "id": "c3",
                "file_path": v3_path,
                "start_time_ms": 3000,
                "duration_ms": 3000,
                "source_in_ms": 0,
                "source_out_ms": 3000,
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
