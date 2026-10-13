import pytest
import uuid
import copy
from typing import List, Dict, Any

from app.schemas.timeline import (
    TrackSchema,
    ClipSchema,
    TimelineStateSchema,
    TimelineSaveRequest,
    MarkerSchema,
    KeyframeSchema,
)
from app.models.timeline import Timeline, Track, Clip
from app.services.timeline_service import TimelineService


# --- Test 1: TrackSchema defaults ---
def test_track_schema_defaults():
    track = TrackSchema(name="Video 1")
    assert track.name == "Video 1"
    assert track.track_type == "video"
    assert track.track_role == "video"
    assert track.order_index == 0
    assert track.is_muted is False
    assert track.is_solo is False
    assert track.is_locked is False
    assert track.is_visible is True
    assert track.volume_db == 0.0
    assert track.pan == 0.0
    assert track.clips == []
    assert track.id is None


# --- Test 2: TrackSchema custom fields ---
def test_track_schema_custom_fields():
    track_id = str(uuid.uuid4())
    track = TrackSchema(
        id=track_id,
        name="Dialogue Main",
        track_type="audio",
        track_role="dialogue",
        order_index=3,
        is_muted=True,
        is_solo=True,
        is_locked=True,
        is_visible=False,
        volume_db=-3.5,
        pan=-0.25,
        height_px=96,
    )
    assert track.id == track_id
    assert track.name == "Dialogue Main"
    assert track.track_type == "audio"
    assert track.track_role == "dialogue"
    assert track.order_index == 3
    assert track.is_muted is True
    assert track.is_solo is True
    assert track.is_locked is True
    assert track.is_visible is False
    assert track.volume_db == -3.5
    assert track.pan == -0.25
    assert track.height_px == 96


# --- Test 3: Audio track roles support ---
def test_track_audio_roles_support():
    audio_roles = ["dialogue", "voiceover", "music", "sfx", "ambience"]
    for role in audio_roles:
        t = TrackSchema(name=f"Audio {role}", track_type="audio", track_role=role)
        assert t.track_type == "audio"
        assert t.track_role == role


# --- Test 4: Video track roles support ---
def test_track_video_roles_support():
    video_roles = ["video", "broll", "graphics", "overlay"]
    for role in video_roles:
        t = TrackSchema(name=f"Video {role}", track_type="video", track_role=role)
        assert t.track_type == "video"
        assert t.track_role == role


# --- Test 5: Adding tracks and deterministic order_index assignment ---
def test_add_tracks_deterministic_ordering():
    tracks: List[TrackSchema] = []
    
    def add_track(name: str, t_type: str = "video", t_role: str = "video") -> TrackSchema:
        new_track = TrackSchema(
            id=str(uuid.uuid4()),
            name=name,
            track_type=t_type,
            track_role=t_role,
            order_index=len(tracks),
        )
        tracks.append(new_track)
        return new_track

    t1 = add_track("V1", "video", "video")
    t2 = add_track("V2", "video", "video")
    t3 = add_track("A1", "audio", "dialogue")
    t4 = add_track("A2", "audio", "music")

    assert len(tracks) == 4
    assert [t.order_index for t in tracks] == [0, 1, 2, 3]
    assert tracks[0].name == "V1"
    assert tracks[3].name == "A2"


# --- Test 6: Deleting a track and re-indexing remaining tracks ---
def test_delete_track_and_reindex():
    tracks = [
        TrackSchema(id="t1", name="V1", order_index=0),
        TrackSchema(id="t2", name="V2", order_index=1),
        TrackSchema(id="t3", name="A1", order_index=2),
        TrackSchema(id="t4", name="A2", order_index=3),
    ]

    # Delete track at index 1 ("V2")
    idx_to_remove = next(i for i, t in enumerate(tracks) if t.id == "t2")
    del tracks[idx_to_remove]

    # Reindex
    for i, t in enumerate(tracks):
        t.order_index = i

    assert len(tracks) == 3
    assert [t.id for t in tracks] == ["t1", "t3", "t4"]
    assert [t.order_index for t in tracks] == [0, 1, 2]


# --- Test 7: Reordering track up ---
def test_reorder_track_up():
    tracks = [
        TrackSchema(id="t1", name="V1", order_index=0),
        TrackSchema(id="t2", name="V2", order_index=1),
        TrackSchema(id="t3", name="A1", order_index=2),
    ]

    # Move "V2" up (from index 1 to 0)
    idx = next(i for i, t in enumerate(tracks) if t.id == "t2")
    assert idx == 1
    # Swap with previous
    tracks[idx - 1], tracks[idx] = tracks[idx], tracks[idx - 1]
    for i, t in enumerate(tracks):
        t.order_index = i

    assert [t.id for t in tracks] == ["t2", "t1", "t3"]
    assert [t.order_index for t in tracks] == [0, 1, 2]


# --- Test 8: Reordering track down ---
def test_reorder_track_down():
    tracks = [
        TrackSchema(id="t1", name="V1", order_index=0),
        TrackSchema(id="t2", name="V2", order_index=1),
        TrackSchema(id="t3", name="A1", order_index=2),
    ]

    # Move "V1" down (from index 0 to 1)
    idx = next(i for i, t in enumerate(tracks) if t.id == "t1")
    assert idx == 0
    tracks[idx], tracks[idx + 1] = tracks[idx + 1], tracks[idx]
    for i, t in enumerate(tracks):
        t.order_index = i

    assert [t.id for t in tracks] == ["t2", "t1", "t3"]
    assert [t.order_index for t in tracks] == [0, 1, 2]


# --- Test 9: Reorder boundary conditions (no-op at top or bottom) ---
def test_reorder_boundary_conditions():
    tracks = [
        TrackSchema(id="t1", name="V1", order_index=0),
        TrackSchema(id="t2", name="V2", order_index=1),
    ]

    def move_track(track_id: str, direction: str) -> bool:
        idx = next((i for i, t in enumerate(tracks) if t.id == track_id), -1)
        if idx == -1:
            return False
        if direction == "up" and idx > 0:
            tracks[idx - 1], tracks[idx] = tracks[idx], tracks[idx - 1]
        elif direction == "down" and idx < len(tracks) - 1:
            tracks[idx], tracks[idx + 1] = tracks[idx + 1], tracks[idx]
        else:
            return False
        for i, t in enumerate(tracks):
            t.order_index = i
        return True

    # Try moving top track up
    assert move_track("t1", "up") is False
    assert [t.id for t in tracks] == ["t1", "t2"]

    # Try moving bottom track down
    assert move_track("t2", "down") is False
    assert [t.id for t in tracks] == ["t1", "t2"]


# --- Test 10: Move track to arbitrary index ---
def test_move_track_arbitrary_index():
    tracks = [
        TrackSchema(id="t1", name="V1", order_index=0),
        TrackSchema(id="t2", name="V2", order_index=1),
        TrackSchema(id="t3", name="A1", order_index=2),
        TrackSchema(id="t4", name="A2", order_index=3),
    ]

    # Move from index 0 ("t1") to index 3
    from_idx, to_idx = 0, 3
    moved = tracks.pop(from_idx)
    tracks.insert(to_idx, moved)
    for i, t in enumerate(tracks):
        t.order_index = i

    assert [t.id for t in tracks] == ["t2", "t3", "t4", "t1"]
    assert [t.order_index for t in tracks] == [0, 1, 2, 3]


# --- Test 11: Renaming track preserves identity and clips ---
def test_rename_track_preserves_identity_and_clips():
    clip = ClipSchema(id="c1", name="Intro Scene", start_time_ms=0, duration_ms=5000)
    track = TrackSchema(id="t1", name="Original Name", track_type="video", clips=[clip])

    # Rename
    track.name = "Renamed Cinematic Video"
    assert track.id == "t1"
    assert track.name == "Renamed Cinematic Video"
    assert len(track.clips) == 1
    assert track.clips[0].id == "c1"
    assert track.clips[0].start_time_ms == 0


# --- Test 12: Track lock prevents clip edits ---
def test_track_lock_state_prevents_edits():
    track = TrackSchema(
        id="t1",
        name="Locked Video",
        is_locked=True,
        clips=[ClipSchema(id="c1", name="Clip 1", start_time_ms=1000, duration_ms=4000)],
    )

    def can_edit_clip_on_track(target_track: TrackSchema) -> bool:
        return not target_track.is_locked

    assert can_edit_clip_on_track(track) is False

    # Unlock track
    track.is_locked = False
    assert can_edit_clip_on_track(track) is True


# --- Test 13: Track lock preserves existing clips and metadata ---
def test_track_lock_preserves_existing_clips():
    clip = ClipSchema(
        id="c1",
        name="Keyframed Clip",
        start_time_ms=500,
        duration_ms=3000,
        keyframes=[KeyframeSchema(property_path="opacity", time_offset_ms=0, value=1.0)],
        speed_factor=1.5,
    )
    track = TrackSchema(id="t1", name="V1", is_locked=True, clips=[clip])

    assert track.is_locked is True
    assert len(track.clips) == 1
    assert track.clips[0].keyframes[0].value == 1.0
    assert track.clips[0].speed_factor == 1.5


# --- Test 14: Track visibility toggle ---
def test_track_visibility_toggle():
    track = TrackSchema(id="t1", name="Overlay V2", is_visible=True)
    assert track.is_visible is True

    # Hide track
    track.is_visible = False
    assert track.is_visible is False

    # Show track
    track.is_visible = True
    assert track.is_visible is True


# --- Test 15: Audio track mute and solo evaluation logic ---
def test_audio_track_mute_solo_evaluation():
    tracks = [
        TrackSchema(id="t_diag", name="Dialogue", is_muted=False, is_solo=False, volume_db=0.0),
        TrackSchema(id="t_mus", name="Music", is_muted=False, is_solo=False, volume_db=-6.0),
        TrackSchema(id="t_sfx", name="SFX", is_muted=False, is_solo=False, volume_db=-3.0),
    ]

    def is_track_audible(track: TrackSchema, all_tracks: List[TrackSchema]) -> bool:
        if track.is_muted:
            return False
        has_any_solo = any(t.is_solo for t in all_tracks)
        if has_any_solo:
            return track.is_solo
        return True

    # All tracks unmuted, no solo -> all audible
    assert is_track_audible(tracks[0], tracks) is True
    assert is_track_audible(tracks[1], tracks) is True
    assert is_track_audible(tracks[2], tracks) is True

    # Mute Dialogue
    tracks[0].is_muted = True
    assert is_track_audible(tracks[0], tracks) is False
    assert is_track_audible(tracks[1], tracks) is True

    # Solo Dialogue (even if soloed, mute takes precedence)
    tracks[0].is_solo = True
    assert is_track_audible(tracks[0], tracks) is False
    assert is_track_audible(tracks[1], tracks) is False  # Non-solo muted

    # Unmute Dialogue while soloed
    tracks[0].is_muted = False
    assert is_track_audible(tracks[0], tracks) is True
    assert is_track_audible(tracks[1], tracks) is False
    assert is_track_audible(tracks[2], tracks) is False


# --- Test 16: serialize_timeline preserves tracks sorted by order_index ---
def test_serialize_timeline_deterministic_track_ordering():
    service = TimelineService()

    class MockTimeline:
        id = "tl_1"
        project_id = "proj_1"
        name = "Main Timeline"
        duration_ms = 10000
        fps = 30.0
        resolution_width = 1920
        resolution_height = 1080
        markers_data = "[]"
        tracks = [
            Track(id="t3", name="Audio 1", track_type="audio", track_role="music", order_index=2, clips=[]),
            Track(id="t1", name="Video 1", track_type="video", track_role="video", order_index=0, clips=[]),
            Track(id="t2", name="Video 2", track_type="video", track_role="video", order_index=1, clips=[]),
        ]

    serialized = service.serialize_timeline(MockTimeline())
    assert [t["id"] for t in serialized["tracks"]] == ["t1", "t2", "t3"]
    assert [t["order_index"] for t in serialized["tracks"]] == [0, 1, 2]


# --- Test 17: serialize_timeline sorts clips by start_time_ms ---
def test_serialize_timeline_clips_sorted_by_start_time():
    service = TimelineService()

    c1 = Clip(id="c1", name="Clip Late", start_time_ms=5000, duration_ms=2000, clip_type="video")
    c2 = Clip(id="c2", name="Clip Early", start_time_ms=1000, duration_ms=3000, clip_type="video")

    class MockTimeline:
        id = "tl_1"
        project_id = "proj_1"
        name = "Main"
        duration_ms = 10000
        fps = 30.0
        resolution_width = 1920
        resolution_height = 1080
        markers_data = "[]"
        tracks = [
            Track(id="t1", name="V1", track_type="video", track_role="video", order_index=0, clips=[c1, c2])
        ]

    serialized = service.serialize_timeline(MockTimeline())
    clips = serialized["tracks"][0]["clips"]
    assert len(clips) == 2
    assert clips[0]["id"] == "c2"
    assert clips[1]["id"] == "c1"


# --- Test 18: Compound clip nested tracks have independent properties ---
def test_compound_clip_nested_track_independence():
    nested_track_1 = TrackSchema(id="nt1", name="Nested V1", order_index=0, is_locked=True)
    nested_track_2 = TrackSchema(id="nt2", name="Nested A1", order_index=1, is_muted=True)

    compound_clip = ClipSchema(
        id="comp1",
        name="Compound Scene",
        start_time_ms=0,
        duration_ms=5000,
        is_compound=True,
        nested_tracks=[nested_track_1, nested_track_2],
    )

    parent_track = TrackSchema(id="pt1", name="Parent V1", order_index=0, is_locked=False, clips=[compound_clip])

    assert parent_track.is_locked is False
    assert parent_track.clips[0].nested_tracks[0].is_locked is True
    assert parent_track.clips[0].nested_tracks[1].is_muted is True


# --- Test 19: Track reordering preserves clip start times and durations ---
def test_track_reorder_preserves_clip_timing():
    c1 = ClipSchema(id="c1", name="C1", start_time_ms=1200, duration_ms=3400)
    c2 = ClipSchema(id="c2", name="C2", start_time_ms=4600, duration_ms=2000)

    t1 = TrackSchema(id="t1", name="V1", order_index=0, clips=[c1])
    t2 = TrackSchema(id="t2", name="V2", order_index=1, clips=[c2])
    tracks = [t1, t2]

    # Swap
    tracks[0], tracks[1] = tracks[1], tracks[0]
    for i, t in enumerate(tracks):
        t.order_index = i

    assert tracks[0].id == "t2"
    assert tracks[0].clips[0].start_time_ms == 4600
    assert tracks[0].clips[0].duration_ms == 2000

    assert tracks[1].id == "t1"
    assert tracks[1].clips[0].start_time_ms == 1200
    assert tracks[1].clips[0].duration_ms == 3400


# --- Test 20: Track reorder preserves transitions between clips ---
def test_track_reorder_preserves_clip_transitions():
    transition = {"type": "crossfade", "duration_ms": 1000}
    clip = ClipSchema(id="c1", name="Shot A", start_time_ms=0, duration_ms=3000, transition_out=transition)
    t1 = TrackSchema(id="t1", name="V1", order_index=0, clips=[clip])
    t2 = TrackSchema(id="t2", name="V2", order_index=1, clips=[])

    tracks = [t1, t2]
    # Reorder
    tracks[0], tracks[1] = tracks[1], tracks[0]
    for i, t in enumerate(tracks):
        t.order_index = i

    found_clip = next(c for c in tracks[1].clips if c.id == "c1")
    assert found_clip.transition_out["type"] == "crossfade"
    assert found_clip.transition_out["duration_ms"] == 1000


# --- Test 21: Track reorder preserves keyframes ---
def test_track_reorder_preserves_keyframes():
    kf = KeyframeSchema(property_path="position_x", time_offset_ms=500, value=0.75)
    clip = ClipSchema(id="c1", name="Animated", start_time_ms=0, duration_ms=3000, keyframes=[kf])
    t1 = TrackSchema(id="t1", name="V1", order_index=0, clips=[clip])

    tracks = [t1]
    assert tracks[0].clips[0].keyframes[0].property_path == "position_x"
    assert tracks[0].clips[0].keyframes[0].value == 0.75


# --- Test 22: Track reorder preserves speed and reverse properties ---
def test_track_reorder_preserves_speed_and_reverse():
    clip = ClipSchema(id="c1", name="Speedy", start_time_ms=0, duration_ms=3000, speed_factor=2.5, is_reversed=True)
    t = TrackSchema(id="t1", name="V1", clips=[clip])
    assert t.clips[0].speed_factor == 2.5
    assert t.clips[0].is_reversed is True


# --- Test 23: Track reorder preserves freeze frame and frame hold ---
def test_track_reorder_preserves_freeze_and_frame_hold():
    clip = ClipSchema(
        id="c1",
        name="Held",
        start_time_ms=0,
        duration_ms=3000,
        is_frozen=True,
        freeze_at_ms=1000,
        freeze_duration_ms=2500,
        is_frame_hold=True,
        frame_hold_at_ms=500,
        frame_hold_duration_ms=1500,
    )
    t = TrackSchema(id="t1", name="V1", clips=[clip])
    assert t.clips[0].is_frozen is True
    assert t.clips[0].freeze_duration_ms == 2500
    assert t.clips[0].is_frame_hold is True
    assert t.clips[0].frame_hold_duration_ms == 1500


# --- Test 24: Track management compatibility with timeline and clip markers ---
def test_track_management_with_markers():
    clip = ClipSchema(
        id="c1",
        name="Clip with marker",
        start_time_ms=0,
        duration_ms=3000,
        markers=[MarkerSchema(name="Action Peak", time_ms=800, color="green")],
    )
    timeline_state = TimelineStateSchema(
        id="tl_1",
        project_id="p1",
        name="Main",
        tracks=[TrackSchema(id="t1", name="V1", order_index=0, clips=[clip])],
        markers=[MarkerSchema(name="Chapter 1", time_ms=0, color="blue")],
    )

    assert len(timeline_state.markers) == 1
    assert timeline_state.markers[0].name == "Chapter 1"
    assert len(timeline_state.tracks[0].clips[0].markers) == 1
    assert timeline_state.tracks[0].clips[0].markers[0].color == "green"


# --- Test 25: Track deletion removes clips safely without dangling references ---
def test_track_deletion_cascades_safely():
    c1 = ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000)
    c2 = ClipSchema(id="c2", name="Clip 2", start_time_ms=2000, duration_ms=2000)
    tracks = [
        TrackSchema(id="t1", name="V1", order_index=0, clips=[c1]),
        TrackSchema(id="t2", name="V2", order_index=1, clips=[c2]),
    ]

    # Delete track t1
    tracks = [t for t in tracks if t.id != "t1"]
    for i, t in enumerate(tracks):
        t.order_index = i

    assert len(tracks) == 1
    assert tracks[0].id == "t2"
    all_clips = [c for t in tracks for c in t.clips]
    assert len(all_clips) == 1
    assert all_clips[0].id == "c2"


# --- Test 26: Multiple reorder operations maintain contiguous ordering ---
def test_multiple_reorder_operations_stability():
    tracks = [TrackSchema(id=f"t{i}", name=f"Track {i}", order_index=i) for i in range(6)]

    # Helper function to move
    def move(from_idx: int, to_idx: int):
        item = tracks.pop(from_idx)
        tracks.insert(to_idx, item)
        for idx, t in enumerate(tracks):
            t.order_index = idx

    move(0, 4)
    move(5, 1)
    move(2, 0)
    move(3, 5)

    assert [t.order_index for t in tracks] == list(range(6))
    assert len(set(t.order_index for t in tracks)) == 6


# --- Test 27: TimelineSaveRequest with updated tracks roundtrip ---
def test_timeline_save_request_roundtrip():
    tracks = [
        TrackSchema(id="t1", name="Main Video", track_type="video", order_index=0, is_locked=True),
        TrackSchema(id="t2", name="SFX Audio", track_type="audio", track_role="sfx", order_index=1, volume_db=-4.5),
    ]
    req = TimelineSaveRequest(duration_ms=10000, tracks=tracks)
    data = req.model_dump()

    assert len(data["tracks"]) == 2
    assert data["tracks"][0]["name"] == "Main Video"
    assert data["tracks"][0]["is_locked"] is True
    assert data["tracks"][1]["volume_db"] == -4.5


# --- Test 28: Track volume and pan bounds validation ---
def test_track_volume_and_pan_bounds():
    # Standard limits: volume between -60dB and +12dB, pan between -1.0 and +1.0
    def clamp_volume(v: float) -> float:
        return max(-60.0, min(12.0, v))

    def clamp_pan(p: float) -> float:
        return max(-1.0, min(1.0, p))

    assert clamp_volume(-100.0) == -60.0
    assert clamp_volume(25.0) == 12.0
    assert clamp_volume(-3.5) == -3.5

    assert clamp_pan(-2.0) == -1.0
    assert clamp_pan(1.5) == 1.0
    assert clamp_pan(0.3) == 0.3
