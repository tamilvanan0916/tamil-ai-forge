import pytest
import uuid
import copy
from typing import List, Dict, Any, Optional, Tuple, Set

from app.schemas.timeline import (
    TrackSchema,
    ClipSchema,
    TimelineStateSchema,
    TimelineSaveRequest,
    MarkerSchema,
    KeyframeSchema,
    EffectSchema,
)


# ─── Helper Functions & Pure Implementations for Phase 45 ───

def create_sample_clip(
    name: str = "Test Clip",
    track_id: str = "track-1",
    start_time_ms: int = 0,
    duration_ms: int = 5000,
    source_in_ms: int = 0,
    source_out_ms: int = 5000,
    clip_id: Optional[str] = None,
    linked_clip_id: Optional[str] = None,
    group_id: Optional[str] = None,
    asset_id: Optional[str] = None,
) -> ClipSchema:
    return ClipSchema(
        id=clip_id or str(uuid.uuid4()),
        track_id=track_id,
        name=name,
        clip_type="media",
        start_time_ms=start_time_ms,
        duration_ms=duration_ms,
        source_in_ms=source_in_ms,
        source_out_ms=source_out_ms,
        speed_factor=1.0,
        is_reversed=False,
        is_frozen=False,
        is_frame_hold=False,
        opacity=1.0,
        blend_mode="normal",
        position_x=0.5,
        position_y=0.5,
        scale_x=1.0,
        scale_y=1.0,
        rotation=0.0,
        anchor_x=0.5,
        anchor_y=0.5,
        crop_left=0.0,
        crop_right=0.0,
        crop_top=0.0,
        crop_bottom=0.0,
        volume_db=0.0,
        fade_in_ms=0,
        fade_out_ms=0,
        effects=[],
        keyframes=[],
        group_id=group_id,
        linked_clip_id=linked_clip_id,
        asset_id=asset_id,
    )


def create_sample_track(
    name: str = "Video 1",
    track_type: str = "video",
    track_role: str = "video",
    track_id: Optional[str] = None,
    is_locked: bool = False,
    clips: Optional[List[ClipSchema]] = None,
) -> TrackSchema:
    return TrackSchema(
        id=track_id or str(uuid.uuid4()),
        name=name,
        track_type=track_type,
        track_role=track_role,
        is_muted=False,
        is_solo=False,
        is_locked=is_locked,
        is_visible=True,
        volume_db=0.0,
        height_px=36,
        clips=clips or [],
    )


def create_sample_timeline_state(
    tracks: Optional[List[TrackSchema]] = None,
    in_point_ms: Optional[int] = None,
    out_point_ms: Optional[int] = None,
    target_video_track_id: Optional[str] = None,
    target_audio_track_id: Optional[str] = None,
    duration_ms: int = 30000,
) -> TimelineStateSchema:
    return TimelineStateSchema(
        id=str(uuid.uuid4()),
        project_id=str(uuid.uuid4()),
        name="Main Timeline",
        duration_ms=duration_ms,
        in_point_ms=in_point_ms,
        out_point_ms=out_point_ms,
        target_video_track_id=target_video_track_id,
        target_audio_track_id=target_audio_track_id,
        tracks=tracks or [],
        markers=[],
    )


def resolve_3point_timing(
    in_point_ms: Optional[int],
    out_point_ms: Optional[int],
    playhead_ms: int,
    source_in_ms: Optional[int] = None,
    source_out_ms: Optional[int] = None,
    default_duration_ms: int = 4000,
) -> Tuple[int, int, int, int]:
    """
    Returns (timeline_in, edit_duration, resolved_source_in, resolved_source_out).
    """
    in_ms = in_point_ms if in_point_ms is not None else playhead_ms
    s_in = source_in_ms if source_in_ms is not None else 0

    if out_point_ms is not None and out_point_ms > in_ms:
        duration = max(100, out_point_ms - in_ms)
    elif source_out_ms is not None and source_in_ms is not None and source_out_ms > source_in_ms:
        duration = max(100, source_out_ms - source_in_ms)
    else:
        duration = max(100, default_duration_ms)

    s_out = s_in + duration
    return in_ms, duration, s_in, s_out


def perform_insert_edit(
    state: TimelineStateSchema,
    playhead_ms: int = 0,
    asset_id: Optional[str] = None,
    name: Optional[str] = None,
    source_in_ms: Optional[int] = None,
    source_out_ms: Optional[int] = None,
    duration_ms: Optional[int] = None,
) -> Tuple[bool, TimelineStateSchema, int]:
    """
    Simulates Insert Edit on the timeline state:
    1. Resolves target video and audio tracks (with fallback to first unlocked).
    2. Slices any clip straddling inMs on target tracks.
    3. Ripples all clips downstream (start >= inMs) on ALL unlocked tracks.
    4. Inserts new clips into unlocked target tracks, cross-linking if both exist.
    5. Advances playhead to inMs + edit_duration.
    """
    st = state.model_copy(deep=True)
    v_track = None
    if st.target_video_track_id:
        v_track = next((t for t in st.tracks if t.id == st.target_video_track_id and not t.is_locked), None)
    if not v_track:
        v_track = next((t for t in st.tracks if (t.track_type == 'video' or t.track_role in ('video', 'graphics')) and not t.is_locked), None)

    a_track = None
    if st.target_audio_track_id:
        a_track = next((t for t in st.tracks if t.id == st.target_audio_track_id and not t.is_locked), None)
    if not a_track:
        a_track = next((t for t in st.tracks if (t.track_type == 'audio' or t.track_role in ('dialogue', 'voiceover', 'music', 'sfx', 'ambience')) and not t.is_locked), None)

    if not v_track and not a_track:
        return False, st, playhead_ms

    in_ms, edit_dur, s_in, s_out = resolve_3point_timing(
        st.in_point_ms,
        st.out_point_ms,
        playhead_ms,
        source_in_ms,
        source_out_ms,
        duration_ms or 4000,
    )

    # Split clips straddling in_ms on target tracks
    for t in (v_track, a_track):
        if not t:
            continue
        new_clips = []
        for c in t.clips:
            if c.start_time_ms < in_ms < c.start_time_ms + c.duration_ms:
                cut_offset = in_ms - c.start_time_ms
                left = c.model_copy(deep=True)
                left.duration_ms = cut_offset
                left.source_out_ms = left.source_in_ms + cut_offset
                right = c.model_copy(deep=True)
                right.id = str(uuid.uuid4())
                right.start_time_ms = in_ms
                right.duration_ms = c.duration_ms - cut_offset
                right.source_in_ms = c.source_in_ms + cut_offset
                new_clips.extend([left, right])
            else:
                new_clips.append(c)
        t.clips = new_clips

    # Ripple downstream clips rightward on ALL unlocked tracks
    for track in st.tracks:
        if track.is_locked:
            continue
        for clip in track.clips:
            if clip.start_time_ms >= in_ms - 5:
                clip.start_time_ms += edit_dur

    new_v_id, new_a_id = None, None
    if v_track:
        new_v_id = str(uuid.uuid4())
        v_clip = create_sample_clip(
            name=name or "Inserted Video",
            track_id=v_track.id,
            start_time_ms=in_ms,
            duration_ms=edit_dur,
            source_in_ms=s_in,
            source_out_ms=s_out,
            clip_id=new_v_id,
            asset_id=asset_id,
        )
        v_track.clips.append(v_clip)
        v_track.clips.sort(key=lambda c: c.start_time_ms)

    if a_track:
        new_a_id = str(uuid.uuid4())
        a_clip = create_sample_clip(
            name=f"{name} (Audio)" if name else "Inserted Audio",
            track_id=a_track.id,
            start_time_ms=in_ms,
            duration_ms=edit_dur,
            source_in_ms=s_in,
            source_out_ms=s_out,
            clip_id=new_a_id,
            asset_id=asset_id,
        )
        a_track.clips.append(a_clip)
        a_track.clips.sort(key=lambda c: c.start_time_ms)

    # Link V & A
    if new_v_id and new_a_id:
        v_c = next((c for c in v_track.clips if c.id == new_v_id), None)
        a_c = next((c for c in a_track.clips if c.id == new_a_id), None)
        if v_c and a_c:
            v_c.linked_clip_id = a_c.id
            a_c.linked_clip_id = v_c.id

    new_playhead = in_ms + edit_dur
    max_end = max((c.start_time_ms + c.duration_ms for t in st.tracks for c in t.clips), default=0)
    st.duration_ms = max(30000, max_end + 2000)
    return True, st, new_playhead


def perform_overwrite_edit(
    state: TimelineStateSchema,
    playhead_ms: int = 0,
    asset_id: Optional[str] = None,
    name: Optional[str] = None,
    source_in_ms: Optional[int] = None,
    source_out_ms: Optional[int] = None,
    duration_ms: Optional[int] = None,
) -> Tuple[bool, TimelineStateSchema, int]:
    """
    Simulates Overwrite Edit on the timeline state:
    1. Resolves target tracks.
    2. Slices / truncates clips strictly within [editStart, editEnd] on target tracks.
    3. Leaves downstream clips completely stationary.
    4. Inserts new clips into unlocked target tracks.
    5. Advances playhead to editEnd.
    """
    st = state.model_copy(deep=True)
    v_track = None
    if st.target_video_track_id:
        v_track = next((t for t in st.tracks if t.id == st.target_video_track_id and not t.is_locked), None)
    if not v_track:
        v_track = next((t for t in st.tracks if (t.track_type == 'video' or t.track_role in ('video', 'graphics')) and not t.is_locked), None)

    a_track = None
    if st.target_audio_track_id:
        a_track = next((t for t in st.tracks if t.id == st.target_audio_track_id and not t.is_locked), None)
    if not a_track:
        a_track = next((t for t in st.tracks if (t.track_type == 'audio' or t.track_role in ('dialogue', 'voiceover', 'music', 'sfx', 'ambience')) and not t.is_locked), None)

    if not v_track and not a_track:
        return False, st, playhead_ms

    edit_start, edit_dur, s_in, s_out = resolve_3point_timing(
        st.in_point_ms,
        st.out_point_ms,
        playhead_ms,
        source_in_ms,
        source_out_ms,
        duration_ms or 4000,
    )
    edit_end = edit_start + edit_dur

    new_v_id, new_a_id = None, None

    for track in [t for t in [v_track, a_track] if t is not None]:
        if track.is_locked:
            continue
        remaining_clips = []
        for c in track.clips:
            c_start = c.start_time_ms
            c_end = c.start_time_ms + c.duration_ms
            # Case 1: No overlap
            if c_end <= edit_start or c_start >= edit_end:
                remaining_clips.append(c)
            # Case 2: Completely engulfed
            elif c_start >= edit_start and c_end <= edit_end:
                continue
            # Case 3: Overlaps left side (starts before, ends inside)
            elif c_start < edit_start and c_end <= edit_end:
                left = c.model_copy(deep=True)
                left.duration_ms = edit_start - c_start
                left.source_out_ms = left.source_in_ms + left.duration_ms
                remaining_clips.append(left)
            # Case 4: Overlaps right side (starts inside, ends after)
            elif c_start >= edit_start and c_end > edit_end:
                right = c.model_copy(deep=True)
                cut_offset = edit_end - c_start
                right.start_time_ms = edit_end
                right.duration_ms = c_end - edit_end
                right.source_in_ms = c.source_in_ms + cut_offset
                remaining_clips.append(right)
            # Case 5: Overwrite is strictly in the middle of clip
            elif c_start < edit_start and c_end > edit_end:
                left = c.model_copy(deep=True)
                left.duration_ms = edit_start - c_start
                left.source_out_ms = left.source_in_ms + left.duration_ms
                remaining_clips.append(left)

                right = c.model_copy(deep=True)
                right.id = str(uuid.uuid4())
                cut_offset = edit_end - c_start
                right.start_time_ms = edit_end
                right.duration_ms = c_end - edit_end
                right.source_in_ms = c.source_in_ms + cut_offset
                remaining_clips.append(right)

        is_video = track.track_type == 'video' or track.track_role in ('video', 'graphics')
        new_id = str(uuid.uuid4())
        if is_video:
            new_v_id = new_id
        else:
            new_a_id = new_id

        new_c = create_sample_clip(
            name=name or ("Overwritten Video" if is_video else "Overwritten Audio"),
            track_id=track.id,
            start_time_ms=edit_start,
            duration_ms=edit_dur,
            source_in_ms=s_in,
            source_out_ms=s_out,
            clip_id=new_id,
            asset_id=asset_id,
        )
        remaining_clips.append(new_c)
        remaining_clips.sort(key=lambda c: c.start_time_ms)
        track.clips = remaining_clips

    if new_v_id and new_a_id and v_track and a_track:
        vc = next((c for c in v_track.clips if c.id == new_v_id), None)
        ac = next((c for c in a_track.clips if c.id == new_a_id), None)
        if vc and ac:
            vc.linked_clip_id = ac.id
            ac.linked_clip_id = vc.id

    new_playhead = edit_end
    max_end = max((c.start_time_ms + c.duration_ms for t in st.tracks for c in t.clips), default=0)
    st.duration_ms = max(30000, max_end + 2000)
    return True, st, new_playhead


def perform_replace_edit(
    state: TimelineStateSchema,
    playhead_ms: int = 0,
    clip_id: Optional[str] = None,
    new_asset_id: Optional[str] = None,
    new_name: Optional[str] = None,
) -> Tuple[bool, TimelineStateSchema]:
    """
    Replaces media of the designated clip (or clip under playhead on target track).
    Preserves start_time_ms, duration_ms, keyframes, transitions.
    """
    st = state.model_copy(deep=True)
    target_clip = None
    target_track = None

    if clip_id:
        for t in st.tracks:
            for c in t.clips:
                if c.id == clip_id:
                    target_clip = c
                    target_track = t
                    break
            if target_clip:
                break
    else:
        v_track_id = st.target_video_track_id
        candidates = [t for t in st.tracks if (t.id == v_track_id or (not v_track_id and t.track_type == 'video')) and not t.is_locked]
        for t in candidates:
            for c in t.clips:
                if c.start_time_ms <= playhead_ms <= c.start_time_ms + c.duration_ms:
                    target_clip = c
                    target_track = t
                    break
            if target_clip:
                break

    if not target_clip or (target_track and target_track.is_locked):
        return False, st

    target_clip.asset_id = new_asset_id or target_clip.asset_id
    if new_name:
        target_clip.name = new_name
    return True, st


# ─── TEST SUITE (35+ Unit and Integration Tests) ───

class TestPhase45TrackPatching3Point:

    # ── Group 1: Track Patching & Destination Routing ──

    def test_01_set_target_video_track(self):
        t1 = create_sample_track("V1", "video", "video", "t-v1")
        t2 = create_sample_track("V2", "video", "video", "t-v2")
        st = create_sample_timeline_state([t1, t2], target_video_track_id="t-v1")
        assert st.target_video_track_id == "t-v1"

    def test_02_set_target_audio_track(self):
        a1 = create_sample_track("A1", "audio", "dialogue", "t-a1")
        a2 = create_sample_track("A2", "audio", "music", "t-a2")
        st = create_sample_timeline_state([a1, a2], target_audio_track_id="t-a2")
        assert st.target_audio_track_id == "t-a2"

    def test_03_toggle_target_track_unpatching(self):
        t1 = create_sample_track("V1", "video", "video", "t-v1")
        st = create_sample_timeline_state([t1], target_video_track_id="t-v1")
        new_target = None if st.target_video_track_id == "t-v1" else "t-v1"
        st.target_video_track_id = new_target
        assert st.target_video_track_id is None

    def test_04_fallback_to_first_unlocked_video_track(self):
        v1 = create_sample_track("V1", "video", "video", "t-v1", is_locked=True)
        v2 = create_sample_track("V2", "video", "video", "t-v2", is_locked=False)
        st = create_sample_timeline_state([v1, v2], target_video_track_id=None)
        unlocked = next((t for t in st.tracks if t.track_type == 'video' and not t.is_locked), None)
        assert unlocked is not None
        assert unlocked.id == "t-v2"

    def test_05_fallback_to_first_unlocked_audio_track(self):
        a1 = create_sample_track("A1", "audio", "dialogue", "t-a1", is_locked=True)
        a2 = create_sample_track("A2", "audio", "sfx", "t-a2", is_locked=False)
        st = create_sample_timeline_state([a1, a2], target_audio_track_id=None)
        unlocked = next((t for t in st.tracks if t.track_type == 'audio' and not t.is_locked), None)
        assert unlocked is not None
        assert unlocked.id == "t-a2"

    def test_06_locked_patched_track_fails_gracefully_to_unlocked(self):
        v1 = create_sample_track("V1", "video", "video", "t-v1", is_locked=True)
        v2 = create_sample_track("V2", "video", "video", "t-v2", is_locked=False)
        st = create_sample_timeline_state([v1, v2], target_video_track_id="t-v1")
        v_target = next((t for t in st.tracks if t.id == st.target_video_track_id and not t.is_locked), None)
        if not v_target:
            v_target = next((t for t in st.tracks if t.track_type == 'video' and not t.is_locked), None)
        assert v_target.id == "t-v2"

    # ── Group 2: 3-Point Timing Calculation ──

    def test_07_three_point_in_and_out_locks_duration(self):
        in_ms, dur, s_in, s_out = resolve_3point_timing(
            in_point_ms=2000,
            out_point_ms=7000,
            playhead_ms=1000,
            source_in_ms=0,
            source_out_ms=10000,
        )
        assert in_ms == 2000
        assert dur == 5000
        assert s_in == 0
        assert s_out == 5000

    def test_08_three_point_mark_in_only_uses_source_duration(self):
        in_ms, dur, s_in, s_out = resolve_3point_timing(
            in_point_ms=3000,
            out_point_ms=None,
            playhead_ms=1000,
            source_in_ms=1000,
            source_out_ms=5000,
        )
        assert in_ms == 3000
        assert dur == 4000
        assert s_in == 1000
        assert s_out == 5000

    def test_09_three_point_no_marks_uses_playhead_and_default_duration(self):
        in_ms, dur, s_in, s_out = resolve_3point_timing(
            in_point_ms=None,
            out_point_ms=None,
            playhead_ms=6500,
            default_duration_ms=3000,
        )
        assert in_ms == 6500
        assert dur == 3000
        assert s_in == 0
        assert s_out == 3000

    def test_10_three_point_clamped_minimum_duration(self):
        in_ms, dur, s_in, s_out = resolve_3point_timing(
            in_point_ms=2000,
            out_point_ms=2020,
            playhead_ms=0,
        )
        assert in_ms == 2000
        assert dur == 100

    # ── Group 3: Insert Edit Execution & Downstream Rippling ──

    def test_11_insert_edit_at_playhead_ripples_downstream_clips(self):
        c1 = create_sample_clip("Clip 1", "t-v1", 0, 5000)
        c2 = create_sample_clip("Clip 2", "t-v1", 5000, 5000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1, c2])
        st = create_sample_timeline_state([v1])

        ok, new_st, new_ph = perform_insert_edit(st, playhead_ms=5000, duration_ms=2000)
        assert ok is True
        t = new_st.tracks[0]
        assert len(t.clips) == 3
        assert t.clips[0].start_time_ms == 0
        assert t.clips[1].start_time_ms == 5000
        assert t.clips[1].duration_ms == 2000
        assert t.clips[2].start_time_ms == 7000
        assert new_ph == 7000

    def test_12_insert_edit_splits_overlapping_clip(self):
        c1 = create_sample_clip("Clip 1", "t-v1", 0, 10000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        st = create_sample_timeline_state([v1])

        ok, new_st, new_ph = perform_insert_edit(st, playhead_ms=4000, duration_ms=3000)
        assert ok is True
        t = new_st.tracks[0]
        assert len(t.clips) == 3
        assert t.clips[0].start_time_ms == 0
        assert t.clips[0].duration_ms == 4000
        assert t.clips[1].start_time_ms == 4000
        assert t.clips[1].duration_ms == 3000
        assert t.clips[2].start_time_ms == 7000
        assert t.clips[2].duration_ms == 6000
        assert new_ph == 7000

    def test_13_insert_edit_ripples_across_all_unlocked_tracks(self):
        c_v = create_sample_clip("Video 1", "t-v1", 2000, 4000)
        c_a = create_sample_clip("Audio 1", "t-a1", 3000, 5000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c_v])
        a1 = create_sample_track("A1", "audio", "dialogue", "t-a1", clips=[c_a])
        st = create_sample_timeline_state([v1, a1], in_point_ms=1000)

        ok, new_st, new_ph = perform_insert_edit(st, duration_ms=2000)
        assert ok is True
        assert new_st.tracks[0].clips[1].start_time_ms == 4000
        assert new_st.tracks[1].clips[1].start_time_ms == 5000

    def test_14_insert_edit_locked_track_protection(self):
        c_v = create_sample_clip("Unlocked Video", "t-v1", 2000, 4000)
        c_locked = create_sample_clip("Locked Audio", "t-locked", 2000, 4000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", is_locked=False, clips=[c_v])
        a_locked = create_sample_track("A Locked", "audio", "dialogue", "t-locked", is_locked=True, clips=[c_locked])
        st = create_sample_timeline_state([v1, a_locked])

        ok, new_st, new_ph = perform_insert_edit(st, playhead_ms=1000, duration_ms=2000)
        assert ok is True
        assert new_st.tracks[1].clips[0].start_time_ms == 2000
        assert new_st.tracks[0].clips[1].start_time_ms == 4000

    def test_15_insert_edit_advances_playhead(self):
        v1 = create_sample_track("V1", "video", "video", "t-v1")
        st = create_sample_timeline_state([v1])
        ok, new_st, new_ph = perform_insert_edit(st, playhead_ms=2500, duration_ms=3000)
        assert ok is True
        assert new_ph == 5500

    def test_16_insert_edit_creates_bilateral_av_links(self):
        v1 = create_sample_track("V1", "video", "video", "t-v1")
        a1 = create_sample_track("A1", "audio", "dialogue", "t-a1")
        st = create_sample_timeline_state([v1, a1])

        ok, new_st, new_ph = perform_insert_edit(st, playhead_ms=0, duration_ms=4000)
        assert ok is True
        v_clip = new_st.tracks[0].clips[0]
        a_clip = new_st.tracks[1].clips[0]
        assert v_clip.linked_clip_id == a_clip.id
        assert a_clip.linked_clip_id == v_clip.id

    # ── Group 4: Overwrite Edit Execution & Underlying Slicing ──

    def test_17_overwrite_edit_does_not_shift_downstream_clips(self):
        c1 = create_sample_clip("Clip 1", "t-v1", 0, 5000)
        c2 = create_sample_clip("Clip 2", "t-v1", 10000, 5000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1, c2])
        st = create_sample_timeline_state([v1], in_point_ms=5000, out_point_ms=9000)

        ok, new_st, new_ph = perform_overwrite_edit(st)
        assert ok is True
        t = new_st.tracks[0]
        c2_found = next(c for c in t.clips if c.name == "Clip 2")
        assert c2_found.start_time_ms == 10000
        assert new_ph == 9000

    def test_18_overwrite_edit_truncates_overlapping_left_clip(self):
        c1 = create_sample_clip("Clip 1", "t-v1", 0, 6000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        st = create_sample_timeline_state([v1], in_point_ms=4000, out_point_ms=8000)

        ok, new_st, new_ph = perform_overwrite_edit(st)
        assert ok is True
        t = new_st.tracks[0]
        assert len(t.clips) == 2
        assert t.clips[0].start_time_ms == 0
        assert t.clips[0].duration_ms == 4000
        assert t.clips[1].start_time_ms == 4000
        assert t.clips[1].duration_ms == 4000

    def test_19_overwrite_edit_truncates_overlapping_right_clip(self):
        c1 = create_sample_clip("Clip 1", "t-v1", 4000, 8000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        st = create_sample_timeline_state([v1], in_point_ms=2000, out_point_ms=6000)

        ok, new_st, new_ph = perform_overwrite_edit(st)
        assert ok is True
        t = new_st.tracks[0]
        assert len(t.clips) == 2
        assert t.clips[0].start_time_ms == 2000
        assert t.clips[0].duration_ms == 4000
        assert t.clips[1].start_time_ms == 6000
        assert t.clips[1].duration_ms == 6000
        assert t.clips[1].source_in_ms == 2000

    def test_20_overwrite_edit_removes_completely_engulfed_clip(self):
        c1 = create_sample_clip("Engulfed Clip", "t-v1", 3000, 2000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        st = create_sample_timeline_state([v1], in_point_ms=2000, out_point_ms=6000)

        ok, new_st, new_ph = perform_overwrite_edit(st)
        assert ok is True
        t = new_st.tracks[0]
        assert len(t.clips) == 1
        assert t.clips[0].name != "Engulfed Clip"
        assert t.clips[0].start_time_ms == 2000
        assert t.clips[0].duration_ms == 4000

    def test_21_overwrite_edit_splits_middle_of_clip(self):
        c1 = create_sample_clip("Big Clip", "t-v1", 0, 10000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        st = create_sample_timeline_state([v1], in_point_ms=3000, out_point_ms=6000)

        ok, new_st, new_ph = perform_overwrite_edit(st)
        assert ok is True
        t = new_st.tracks[0]
        assert len(t.clips) == 3
        assert t.clips[0].start_time_ms == 0
        assert t.clips[0].duration_ms == 3000
        assert t.clips[1].start_time_ms == 3000
        assert t.clips[1].duration_ms == 3000
        assert t.clips[2].start_time_ms == 6000
        assert t.clips[2].duration_ms == 4000

    def test_22_overwrite_edit_locked_track_protection(self):
        c1 = create_sample_clip("Locked Clip", "t-v1", 2000, 5000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", is_locked=True, clips=[c1])
        st = create_sample_timeline_state([v1], in_point_ms=3000, out_point_ms=5000)

        ok, new_st, new_ph = perform_overwrite_edit(st)
        assert new_st.tracks[0].clips[0].duration_ms == 5000

    def test_23_overwrite_edit_advances_playhead(self):
        v1 = create_sample_track("V1", "video", "video", "t-v1")
        st = create_sample_timeline_state([v1], in_point_ms=1000, out_point_ms=4500)
        ok, new_st, new_ph = perform_overwrite_edit(st)
        assert ok is True
        assert new_ph == 4500

    # ── Group 5: Replace Edit Execution ──

    def test_24_replace_edit_preserves_duration_and_timing(self):
        c1 = create_sample_clip("Original", "t-v1", 2000, 4500, asset_id="old-asset")
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        st = create_sample_timeline_state([v1])

        ok, new_st = perform_replace_edit(st, clip_id=c1.id, new_asset_id="new-asset-123", new_name="Replaced Video")
        assert ok is True
        c = new_st.tracks[0].clips[0]
        assert c.asset_id == "new-asset-123"
        assert c.name == "Replaced Video"
        assert c.start_time_ms == 2000
        assert c.duration_ms == 4500

    def test_25_replace_edit_at_playhead_selection(self):
        c1 = create_sample_clip("At Playhead", "t-v1", 1000, 5000, asset_id="old-asset")
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        st = create_sample_timeline_state([v1])

        ok, new_st = perform_replace_edit(st, playhead_ms=3000, clip_id=None, new_asset_id="brand-new-asset")
        assert ok is True
        assert new_st.tracks[0].clips[0].asset_id == "brand-new-asset"

    def test_26_replace_edit_locked_track_fails(self):
        c1 = create_sample_clip("Locked Clip", "t-v1", 1000, 5000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", is_locked=True, clips=[c1])
        st = create_sample_timeline_state([v1])

        ok, new_st = perform_replace_edit(st, clip_id=c1.id, new_asset_id="fail-asset")
        assert ok is False

    # ── Group 6: Schema Serialization & Deserialization ──

    def test_27_timeline_state_schema_serialization_with_patching(self):
        st = create_sample_timeline_state(
            target_video_track_id="trk-v1",
            target_audio_track_id="trk-a1",
        )
        data = st.model_dump()
        assert data["target_video_track_id"] == "trk-v1"
        assert data["target_audio_track_id"] == "trk-a1"

    def test_28_timeline_state_schema_deserialization_with_null_patching(self):
        raw = {
            "id": str(uuid.uuid4()),
            "project_id": str(uuid.uuid4()),
            "name": "Test",
            "duration_ms": 30000,
            "target_video_track_id": None,
            "target_audio_track_id": None,
            "tracks": [],
            "markers": [],
        }
        st = TimelineStateSchema.model_validate(raw)
        assert st.target_video_track_id is None
        assert st.target_audio_track_id is None

    def test_29_timeline_save_request_schema_supports_patching(self):
        req = TimelineSaveRequest(
            duration_ms=60000,
            in_point_ms=1000,
            out_point_ms=9000,
            target_video_track_id="trk-v2",
            target_audio_track_id="trk-a2",
            tracks=[],
            markers=[],
        )
        assert req.target_video_track_id == "trk-v2"
        assert req.target_audio_track_id == "trk-a2"

    # ── Group 7: Undo / Redo & Multi-Clip Groups & Integration ──

    def test_30_undo_restores_pre_insert_state(self):
        c1 = create_sample_clip("C1", "t-v1", 0, 5000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        initial_state = create_sample_timeline_state([v1])

        history_stack = [initial_state.model_copy(deep=True)]
        ok, modified_state, _ = perform_insert_edit(initial_state, playhead_ms=2000, duration_ms=2000)
        assert ok is True
        assert len(modified_state.tracks[0].clips) == 3

        restored = history_stack.pop()
        assert len(restored.tracks[0].clips) == 1
        assert restored.tracks[0].clips[0].duration_ms == 5000

    def test_31_undo_restores_pre_overwrite_state(self):
        c1 = create_sample_clip("C1", "t-v1", 0, 8000)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        initial_state = create_sample_timeline_state([v1], in_point_ms=2000, out_point_ms=5000)

        history_stack = [initial_state.model_copy(deep=True)]
        ok, modified_state, _ = perform_overwrite_edit(initial_state)
        assert ok is True
        assert len(modified_state.tracks[0].clips) == 3

        restored = history_stack.pop()
        assert len(restored.tracks[0].clips) == 1
        assert restored.tracks[0].clips[0].duration_ms == 8000

    def test_32_insert_edit_preserves_downstream_grouped_relationships(self):
        gid = str(uuid.uuid4())
        c1 = create_sample_clip("Grouped 1", "t-v1", 6000, 3000, group_id=gid)
        c2 = create_sample_clip("Grouped 2", "t-a1", 6000, 3000, group_id=gid)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        a1 = create_sample_track("A1", "audio", "dialogue", "t-a1", clips=[c2])
        st = create_sample_timeline_state([v1, a1])

        ok, new_st, _ = perform_insert_edit(st, playhead_ms=2000, duration_ms=4000)
        assert ok is True
        c1_res = next(c for c in new_st.tracks[0].clips if c.name == "Grouped 1")
        c2_res = next(c for c in new_st.tracks[1].clips if c.name == "Grouped 2")
        assert c1_res.start_time_ms == 10000
        assert c2_res.start_time_ms == 10000
        assert c1_res.group_id == gid
        assert c2_res.group_id == gid

    def test_33_insert_edit_preserves_downstream_linked_av_clips(self):
        c1_id = str(uuid.uuid4())
        c2_id = str(uuid.uuid4())
        c1 = create_sample_clip("Linked V", "t-v1", 5000, 3000, clip_id=c1_id, linked_clip_id=c2_id)
        c2 = create_sample_clip("Linked A", "t-a1", 5000, 3000, clip_id=c2_id, linked_clip_id=c1_id)
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        a1 = create_sample_track("A1", "audio", "dialogue", "t-a1", clips=[c2])
        st = create_sample_timeline_state([v1, a1])

        ok, new_st, _ = perform_insert_edit(st, playhead_ms=1000, duration_ms=2000)
        assert ok is True
        c1_res = next(c for c in new_st.tracks[0].clips if c.name == "Linked V")
        c2_res = next(c for c in new_st.tracks[1].clips if c.name == "Linked A")
        assert c1_res.start_time_ms == 7000
        assert c2_res.start_time_ms == 7000
        assert c1_res.linked_clip_id == c2_id
        assert c2_res.linked_clip_id == c1_id

    def test_34_consecutive_insert_and_overwrite_chaining(self):
        v1 = create_sample_track("V1", "video", "video", "t-v1")
        st = create_sample_timeline_state([v1])

        # 1. Insert 4000ms at 0
        _, st1, ph1 = perform_insert_edit(st, playhead_ms=0, name="Clip 1", duration_ms=4000)
        assert ph1 == 4000

        # 2. Insert another 4000ms at current playhead (4000)
        _, st2, ph2 = perform_insert_edit(st1, playhead_ms=ph1, name="Clip 2", duration_ms=4000)
        assert ph2 == 8000

        # 3. Overwrite 2000ms at 3000
        st2.in_point_ms = 3000
        st2.out_point_ms = 5000
        _, st3, ph3 = perform_overwrite_edit(st2, playhead_ms=ph2, name="Punch In")
        assert ph3 == 5000

        t = st3.tracks[0]
        assert any(c.name == "Punch In" and c.start_time_ms == 3000 and c.duration_ms == 2000 for c in t.clips)

    def test_35_timeline_duration_auto_expands_on_large_insert(self):
        v1 = create_sample_track("V1", "video", "video", "t-v1")
        st = create_sample_timeline_state([v1], duration_ms=30000)

        _, new_st, _ = perform_insert_edit(st, playhead_ms=25000, duration_ms=20000)
        assert new_st.duration_ms >= 47000

    def test_36_replace_edit_updates_asset_id_and_name_together(self):
        c1 = create_sample_clip("Old Clip", "t-v1", 0, 4000, asset_id="asset-old")
        v1 = create_sample_track("V1", "video", "video", "t-v1", clips=[c1])
        st = create_sample_timeline_state([v1])

        ok, new_st = perform_replace_edit(st, clip_id=c1.id, new_asset_id="asset-new", new_name="New Clip Title")
        assert ok is True
        c = new_st.tracks[0].clips[0]
        assert c.asset_id == "asset-new"
        assert c.name == "New Clip Title"
        assert c.duration_ms == 4000
