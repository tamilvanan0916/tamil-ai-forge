import pytest
import uuid
from typing import List
from app.schemas.timeline import (
    ClipSchema,
    TrackSchema,
    TimelineStateSchema,
    TimelineSaveRequest,
    KeyframeSchema,
    EffectSchema,
)

# --- Test 1: ClipSchema compound defaults ---
def test_clip_schema_compound_defaults():
    clip = ClipSchema(name="Test Clip", start_time_ms=0, duration_ms=2000)
    assert clip.is_compound is False
    assert clip.nested_tracks is None

# --- Test 2: ClipSchema compound enabled ---
def test_clip_schema_compound_enabled():
    nested_track = TrackSchema(
        id=str(uuid.uuid4()),
        name="V1",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[
            ClipSchema(id=str(uuid.uuid4()), name="Nested 1", start_time_ms=0, duration_ms=1000),
            ClipSchema(id=str(uuid.uuid4()), name="Nested 2", start_time_ms=1000, duration_ms=1500),
        ]
    )
    compound = ClipSchema(
        id=str(uuid.uuid4()),
        name="Compound 1",
        start_time_ms=500,
        duration_ms=2500,
        is_compound=True,
        nested_tracks=[nested_track]
    )
    assert compound.is_compound is True
    assert compound.nested_tracks is not None
    assert len(compound.nested_tracks) == 1
    assert len(compound.nested_tracks[0].clips) == 2

# --- Test 3: Serialization / Deserialization roundtrip ---
def test_clip_schema_serialization_roundtrip():
    nested_track = TrackSchema(
        name="Audio 1",
        track_type="audio",
        track_role="dialogue",
        order_index=0,
        clips=[
            ClipSchema(name="Dialogue A", start_time_ms=0, duration_ms=3000, volume_db=-3.0)
        ]
    )
    compound = ClipSchema(
        name="Compound Vocals",
        start_time_ms=1000,
        duration_ms=3000,
        is_compound=True,
        nested_tracks=[nested_track]
    )
    dumped = compound.model_dump(mode="json")
    assert dumped["is_compound"] is True
    assert len(dumped["nested_tracks"]) == 1

    loaded = ClipSchema.model_validate(dumped)
    assert loaded.is_compound is True
    assert loaded.nested_tracks[0].name == "Audio 1"
    assert loaded.nested_tracks[0].clips[0].volume_db == -3.0

# --- Test 4: Compound bounding box duration calculation ---
def test_compound_clip_duration_bounding_box():
    clips = [
        {"start_time_ms": 2000, "duration_ms": 4000}, # 2000 to 6000
        {"start_time_ms": 3500, "duration_ms": 5000}, # 3500 to 8500
        {"start_time_ms": 1000, "duration_ms": 2000}, # 1000 to 3000
    ]
    min_start = min(c["start_time_ms"] for c in clips)
    max_end = max(c["start_time_ms"] + c["duration_ms"] for c in clips)
    compound_duration = max_end - min_start

    assert min_start == 1000
    assert max_end == 8500
    assert compound_duration == 7500

# --- Test 5: Child clip offset normalization ---
def test_child_clip_offset_normalization():
    clips = [
        {"id": "c1", "start_time_ms": 1500, "duration_ms": 2000},
        {"id": "c2", "start_time_ms": 3000, "duration_ms": 3000},
    ]
    min_start = min(c["start_time_ms"] for c in clips)
    normalized = [
        {**c, "start_time_ms": c["start_time_ms"] - min_start}
        for c in clips
    ]
    assert normalized[0]["start_time_ms"] == 0
    assert normalized[1]["start_time_ms"] == 1500
    assert all(c["start_time_ms"] >= 0 for c in normalized)

# --- Test 6: Multi-track structure preservation ---
def test_multi_track_structure_preservation():
    track_v = TrackSchema(order_index=0, name="Video", track_type="video", track_role="video")
    track_a = TrackSchema(order_index=1, name="Dialogue", track_type="audio", track_role="dialogue")
    track_m = TrackSchema(order_index=2, name="Music", track_type="audio", track_role="music")

    c_v = ClipSchema(name="VClip", start_time_ms=0, duration_ms=2000)
    c_a = ClipSchema(name="AClip", start_time_ms=0, duration_ms=2000)
    c_m = ClipSchema(name="MClip", start_time_ms=500, duration_ms=1500)

    track_v.clips = [c_v]
    track_a.clips = [c_a]
    track_m.clips = [c_m]

    compound = ClipSchema(
        name="MultiTrack Compound",
        start_time_ms=0,
        duration_ms=2000,
        is_compound=True,
        nested_tracks=[track_v, track_a, track_m]
    )

    assert len(compound.nested_tracks) == 3
    assert [t.track_role for t in compound.nested_tracks] == ["video", "dialogue", "music"]

# --- Test 7: Keyframe preservation in nested clips ---
def test_keyframe_preservation_in_nested_clips():
    kf1 = KeyframeSchema(property_path="opacity", time_offset_ms=0, value=0.0)
    kf2 = KeyframeSchema(property_path="opacity", time_offset_ms=500, value=1.0)
    child = ClipSchema(name="Fading Video", start_time_ms=0, duration_ms=2000, keyframes=[kf1, kf2])

    t = TrackSchema(order_index=0, name="V", track_type="video", clips=[child])
    compound = ClipSchema(name="Compound KF", start_time_ms=1000, duration_ms=2000, is_compound=True, nested_tracks=[t])

    nested_kfs = compound.nested_tracks[0].clips[0].keyframes
    assert len(nested_kfs) == 2
    assert nested_kfs[0].value == 0.0
    assert nested_kfs[1].time_offset_ms == 500
    assert nested_kfs[1].value == 1.0

# --- Test 8: Transition preservation in nested clips ---
def test_transition_preservation_in_nested_clips():
    c1 = ClipSchema(
        id="c1",
        name="Clip 1",
        start_time_ms=0,
        duration_ms=2000,
        transition_out={"type": "crossfade", "duration_ms": 500, "from_clip_id": "c1", "to_clip_id": "c2"}
    )
    c2 = ClipSchema(
        id="c2",
        name="Clip 2",
        start_time_ms=1500,
        duration_ms=2000,
        transition_in={"type": "crossfade", "duration_ms": 500, "from_clip_id": "c1", "to_clip_id": "c2"}
    )
    t = TrackSchema(order_index=0, name="V1", track_type="video", clips=[c1, c2])
    compound = ClipSchema(name="Transition Compound", start_time_ms=0, duration_ms=3500, is_compound=True, nested_tracks=[t])

    clips = compound.nested_tracks[0].clips
    assert clips[0].transition_out["type"] == "crossfade"
    assert clips[1].transition_in["to_clip_id"] == "c2"

# --- Test 9: Speed factor preservation in nested clips ---
def test_speed_factor_preservation_in_nested_clips():
    child = ClipSchema(name="Slow Mo", start_time_ms=0, duration_ms=4000, speed_factor=0.5)
    t = TrackSchema(order_index=0, name="V", track_type="video", clips=[child])
    compound = ClipSchema(name="Speed Compound", start_time_ms=0, duration_ms=4000, is_compound=True, nested_tracks=[t])

    assert compound.nested_tracks[0].clips[0].speed_factor == 0.5

# --- Test 10: Reverse playback preservation in nested clips ---
def test_reverse_playback_preservation_in_nested_clips():
    child = ClipSchema(name="Reversed Video", start_time_ms=0, duration_ms=2000, is_reversed=True)
    t = TrackSchema(order_index=0, name="V", track_type="video", clips=[child])
    compound = ClipSchema(name="Rev Compound", start_time_ms=0, duration_ms=2000, is_compound=True, nested_tracks=[t])

    assert compound.nested_tracks[0].clips[0].is_reversed is True

# --- Test 11: Freeze frame preservation in nested clips ---
def test_freeze_frame_preservation_in_nested_clips():
    child = ClipSchema(
        name="Freeze Video",
        start_time_ms=0,
        duration_ms=3000,
        is_frozen=True,
        freeze_at_ms=1000,
        freeze_duration_ms=2000
    )
    t = TrackSchema(order_index=0, name="V", track_type="video", clips=[child])
    compound = ClipSchema(name="Freeze Compound", start_time_ms=0, duration_ms=3000, is_compound=True, nested_tracks=[t])

    c = compound.nested_tracks[0].clips[0]
    assert c.is_frozen is True
    assert c.freeze_at_ms == 1000
    assert c.freeze_duration_ms == 2000

# --- Test 12: Frame hold preservation in nested clips ---
def test_frame_hold_preservation_in_nested_clips():
    child = ClipSchema(
        name="Hold Video",
        start_time_ms=0,
        duration_ms=3000,
        is_frame_hold=True,
        frame_hold_at_ms=500,
        frame_hold_duration_ms=1000
    )
    t = TrackSchema(order_index=0, name="V", track_type="video", clips=[child])
    compound = ClipSchema(name="Hold Compound", start_time_ms=0, duration_ms=3000, is_compound=True, nested_tracks=[t])

    c = compound.nested_tracks[0].clips[0]
    assert c.is_frame_hold is True
    assert c.frame_hold_at_ms == 500
    assert c.frame_hold_duration_ms == 1000

# --- Test 13: Effects preservation in nested clips ---
def test_effects_preservation_in_nested_clips():
    eff = EffectSchema(effect_type="blur", effect_category="vfx", order_index=0, parameters={"radius": 10})
    child = ClipSchema(name="VFX Clip", start_time_ms=0, duration_ms=2000, effects=[eff])
    t = TrackSchema(order_index=0, name="V", track_type="video", clips=[child])
    compound = ClipSchema(name="FX Compound", start_time_ms=0, duration_ms=2000, is_compound=True, nested_tracks=[t])

    c = compound.nested_tracks[0].clips[0]
    assert len(c.effects) == 1
    assert c.effects[0].effect_type == "blur"
    assert c.effects[0].parameters["radius"] == 10

# --- Test 14: Compound clip deep clone unique IDs ---
def test_compound_clip_deep_clone_unique_ids():
    def clone_clip_deep(clip_data: dict, time_offset_ms: int = 0) -> dict:
        import copy
        new_clip = copy.deepcopy(clip_data)
        new_clip["id"] = str(uuid.uuid4())
        new_clip["start_time_ms"] += time_offset_ms
        if new_clip.get("is_compound") and "nested_tracks" in new_clip:
            new_nested_tracks = []
            for track in new_clip["nested_tracks"]:
                new_track = copy.deepcopy(track)
                new_track["id"] = str(uuid.uuid4())
                new_track["clips"] = [clone_clip_deep(c, 0) for c in track.get("clips", [])]
                for c in new_track["clips"]:
                    c["track_id"] = new_track["id"]
                new_nested_tracks.append(new_track)
            new_clip["nested_tracks"] = new_nested_tracks
        return new_clip

    orig_id = str(uuid.uuid4())
    orig_nested_track_id = str(uuid.uuid4())
    orig_child_id = str(uuid.uuid4())

    orig_data = {
        "id": orig_id,
        "name": "Compound 1",
        "start_time_ms": 1000,
        "duration_ms": 3000,
        "is_compound": True,
        "nested_tracks": [
            {
                "id": orig_nested_track_id,
                "name": "V1",
                "clips": [
                    {"id": orig_child_id, "name": "Child 1", "start_time_ms": 0, "duration_ms": 3000}
                ]
            }
        ]
    }

    cloned = clone_clip_deep(orig_data, 3000)
    assert cloned["id"] != orig_id
    assert cloned["start_time_ms"] == 4000
    assert cloned["nested_tracks"][0]["id"] != orig_nested_track_id
    assert cloned["nested_tracks"][0]["clips"][0]["id"] != orig_child_id
    assert cloned["nested_tracks"][0]["clips"][0]["track_id"] == cloned["nested_tracks"][0]["id"]

# --- Test 15: Compound clip duplicate independence ---
def test_compound_clip_duplicate_independence():
    child1 = ClipSchema(id="c1", name="Original Child", start_time_ms=0, duration_ms=2000)
    track1 = TrackSchema(id="t1", order_index=0, name="V1", track_type="video", clips=[child1])
    compound1 = ClipSchema(id="comp1", name="Orig Compound", start_time_ms=0, duration_ms=2000, is_compound=True, nested_tracks=[track1])

    # Deep duplicate
    dumped = compound1.model_dump()
    dumped["id"] = "comp2"
    dumped["nested_tracks"][0]["id"] = "t2"
    dumped["nested_tracks"][0]["clips"][0]["id"] = "c2"
    dumped["nested_tracks"][0]["clips"][0]["name"] = "Mutated Child"
    compound2 = ClipSchema.model_validate(dumped)

    assert compound1.nested_tracks[0].clips[0].name == "Original Child"
    assert compound2.nested_tracks[0].clips[0].name == "Mutated Child"

# --- Test 16: Compound clip ungroup translation ---
def test_compound_clip_ungroup_translation():
    compound_start_ms = 4500
    nested_clips = [
        {"id": "n1", "start_time_ms": 0, "duration_ms": 1500},
        {"id": "n2", "start_time_ms": 1500, "duration_ms": 2000},
    ]
    unpacked = [
        {**c, "start_time_ms": compound_start_ms + c["start_time_ms"]}
        for c in nested_clips
    ]
    assert unpacked[0]["start_time_ms"] == 4500
    assert unpacked[1]["start_time_ms"] == 6000

# --- Test 17: Ungroup preserves clip properties ---
def test_compound_clip_ungroup_preserves_clip_properties():
    kf = KeyframeSchema(property_path="rotation", time_offset_ms=0, value=45.0)
    nested_clip = ClipSchema(
        name="Rotated Video",
        start_time_ms=200,
        duration_ms=1800,
        speed_factor=1.5,
        opacity=0.8,
        keyframes=[kf]
    )
    t = TrackSchema(order_index=0, name="V", track_type="video", clips=[nested_clip])
    compound = ClipSchema(name="Comp", start_time_ms=3000, duration_ms=2000, is_compound=True, nested_tracks=[t])

    # Simulate ungroup
    unpacked_clip = compound.nested_tracks[0].clips[0].model_copy()
    unpacked_clip.start_time_ms = compound.start_time_ms + unpacked_clip.start_time_ms

    assert unpacked_clip.start_time_ms == 3200
    assert unpacked_clip.duration_ms == 1800
    assert unpacked_clip.speed_factor == 1.5
    assert unpacked_clip.opacity == 0.8
    assert len(unpacked_clip.keyframes) == 1
    assert unpacked_clip.keyframes[0].value == 45.0

# --- Test 18: Ungroup track matching ---
def test_compound_clip_ungroup_track_matching():
    parent_video = TrackSchema(id="p_vid", order_index=0, name="Main Video", track_type="video", track_role="video")
    parent_audio = TrackSchema(id="p_aud", order_index=1, name="Main Audio", track_type="audio", track_role="dialogue")

    nested_v = TrackSchema(id="n_vid", order_index=0, name="Nested Video", track_type="video", track_role="video", clips=[
        ClipSchema(name="Child V", start_time_ms=0, duration_ms=1000)
    ])
    nested_a = TrackSchema(id="n_aud", order_index=1, name="Nested Audio", track_type="audio", track_role="dialogue", clips=[
        ClipSchema(name="Child A", start_time_ms=0, duration_ms=1000)
    ])

    compound = ClipSchema(name="AV Comp", start_time_ms=1000, duration_ms=1000, is_compound=True, nested_tracks=[nested_v, nested_a])

    # Matching logic: match role and type
    tracks_by_role = {(t.track_type, t.track_role): t for t in [parent_video, parent_audio]}
    assert tracks_by_role[(nested_v.track_type, nested_v.track_role)].id == "p_vid"
    assert tracks_by_role[(nested_a.track_type, nested_a.track_role)].id == "p_aud"

# --- Test 19: Move compound clip on parent timeline ---
def test_compound_clip_move_on_parent_timeline():
    compound = ClipSchema(name="Moving Compound", start_time_ms=2000, duration_ms=3000, is_compound=True)
    delta_ms = 1500
    compound.start_time_ms += delta_ms
    assert compound.start_time_ms == 3500
    assert compound.duration_ms == 3000

# --- Test 20: Trim compound clip on parent timeline ---
def test_compound_clip_trim_parent_timeline():
    compound = ClipSchema(name="Trimmed Compound", start_time_ms=1000, duration_ms=4000, is_compound=True)
    # Right trim by -1000ms
    compound.duration_ms += -1000
    assert compound.duration_ms == 3000
    # Left trim by +500ms
    compound.start_time_ms += 500
    compound.duration_ms -= 500
    assert compound.start_time_ms == 1500
    assert compound.duration_ms == 2500

# --- Test 21: Ripple delete compound clip ---
def test_compound_clip_ripple_delete_compatibility():
    track_clips = [
        ClipSchema(id="c1", name="Clip 1", start_time_ms=0, duration_ms=2000),
        ClipSchema(id="comp", name="Compound", start_time_ms=2000, duration_ms=3000, is_compound=True),
        ClipSchema(id="c3", name="Clip 3", start_time_ms=5000, duration_ms=2000),
    ]
    # Ripple delete compound clip
    deleted_duration = 3000
    remaining = [c for c in track_clips if c.id != "comp"]
    for c in remaining:
        if c.start_time_ms >= 2000:
            c.start_time_ms -= deleted_duration

    assert len(remaining) == 2
    assert remaining[0].start_time_ms == 0
    assert remaining[1].start_time_ms == 2000
    assert remaining[1].id == "c3"

# --- Test 22: Split compound clip integrity ---
def test_compound_clip_split_cut_integrity():
    compound = ClipSchema(
        id="comp_orig",
        name="Splitting Compound",
        start_time_ms=1000,
        duration_ms=4000,
        is_compound=True,
        nested_tracks=[
            TrackSchema(order_index=0, name="V", track_type="video", clips=[
                ClipSchema(name="Child", start_time_ms=0, duration_ms=4000)
            ])
        ]
    )
    cut_at_ms = 2500 # split offset = 1500ms
    split_offset = cut_at_ms - compound.start_time_ms

    left_comp = compound.model_copy()
    left_comp.duration_ms = split_offset

    right_comp = compound.model_copy()
    right_comp.id = str(uuid.uuid4())
    right_comp.start_time_ms = cut_at_ms
    right_comp.duration_ms = compound.duration_ms - split_offset

    assert left_comp.duration_ms == 1500
    assert right_comp.start_time_ms == 2500
    assert right_comp.duration_ms == 2500
    assert left_comp.is_compound is True
    assert right_comp.is_compound is True

# --- Test 23: Nested compound clips (hierarchical compound inside compound) ---
def test_nested_compound_clips_hierarchical():
    inner_leaf = ClipSchema(name="Leaf Video", start_time_ms=0, duration_ms=1000)
    inner_track = TrackSchema(order_index=0, name="Inner V", track_type="video", clips=[inner_leaf])
    inner_compound = ClipSchema(name="Inner Compound", start_time_ms=0, duration_ms=1000, is_compound=True, nested_tracks=[inner_track])

    outer_track = TrackSchema(order_index=0, name="Outer V", track_type="video", clips=[inner_compound])
    outer_compound = ClipSchema(name="Outer Compound", start_time_ms=0, duration_ms=1000, is_compound=True, nested_tracks=[outer_track])

    dumped = outer_compound.model_dump(mode="json")
    reloaded = ClipSchema.model_validate(dumped)

    assert reloaded.is_compound is True
    assert reloaded.nested_tracks[0].clips[0].is_compound is True
    assert reloaded.nested_tracks[0].clips[0].nested_tracks[0].clips[0].name == "Leaf Video"

# --- Test 24: Duration expansion when nested clips are edited ---
def test_compound_clip_duration_expansion_on_nested_edit():
    c1 = ClipSchema(name="C1", start_time_ms=0, duration_ms=2000)
    c2 = ClipSchema(name="C2", start_time_ms=2000, duration_ms=2000)
    track = TrackSchema(order_index=0, name="V", track_type="video", clips=[c1, c2])
    compound = ClipSchema(name="Comp", start_time_ms=0, duration_ms=4000, is_compound=True, nested_tracks=[track])

    # Simulate extending c2 duration inside nested timeline
    compound.nested_tracks[0].clips[1].duration_ms = 4000
    max_end = max(c.start_time_ms + c.duration_ms for c in compound.nested_tracks[0].clips)
    compound.duration_ms = max_end

    assert compound.duration_ms == 6000

# --- Test 25: Single clip compound conversion ---
def test_compound_clip_single_clip_packaging():
    single_clip = ClipSchema(id="single1", name="Single Media", start_time_ms=500, duration_ms=3000)
    nested_track = TrackSchema(
        order_index=0,
        name="V1",
        track_type="video",
        clips=[ClipSchema(id="child1", name="Single Media", start_time_ms=0, duration_ms=3000)]
    )
    compound = ClipSchema(
        name="Compound 1",
        start_time_ms=500,
        duration_ms=3000,
        is_compound=True,
        nested_tracks=[nested_track]
    )
    assert compound.start_time_ms == 500
    assert compound.duration_ms == 3000
    assert compound.nested_tracks[0].clips[0].start_time_ms == 0

# --- Test 26: Compound metadata preservation ---
def test_compound_clip_metadata_preservation():
    compound = ClipSchema(
        name="Metadata Compound",
        start_time_ms=0,
        duration_ms=2000,
        is_compound=True,
        metadata_info={"is_compound": True, "original_clip_count": 3, "tags": ["scene_1", "montage"]}
    )
    assert compound.metadata_info["original_clip_count"] == 3
    assert "scene_1" in compound.metadata_info["tags"]

# --- Test 27: Empty nested tracks handled gracefully ---
def test_compound_clip_empty_nested_tracks_validation():
    compound = ClipSchema(name="Empty Comp", start_time_ms=0, duration_ms=1000, is_compound=True, nested_tracks=[])
    assert compound.is_compound is True
    assert compound.nested_tracks == []

# --- Test 28: Compound clip audio volume and pan ---
def test_compound_clip_volume_and_gain_evaluation():
    compound = ClipSchema(
        name="Audio Compound",
        start_time_ms=0,
        duration_ms=2000,
        volume_db=-6.0,
        is_compound=True
    )
    assert compound.volume_db == -6.0

# --- Test 29: TimelineStateSchema serialization with compound clips ---
def test_timeline_state_schema_with_compound_clips():
    child = ClipSchema(name="Child", start_time_ms=0, duration_ms=2000)
    nested_t = TrackSchema(order_index=0, name="Nested Track", track_type="video", clips=[child])
    compound = ClipSchema(name="Compound Clip", start_time_ms=1000, duration_ms=2000, is_compound=True, nested_tracks=[nested_t])
    parent_t = TrackSchema(order_index=0, name="Parent Track", track_type="video", clips=[compound])

    timeline = TimelineStateSchema(
        id="tl-1",
        project_id="proj-1",
        name="Main Sequence",
        duration_ms=30000,
        tracks=[parent_t]
    )
    dumped = timeline.model_dump(mode="json")
    reloaded = TimelineStateSchema.model_validate(dumped)

    assert len(reloaded.tracks) == 1
    assert reloaded.tracks[0].clips[0].is_compound is True
    assert reloaded.tracks[0].clips[0].nested_tracks[0].clips[0].name == "Child"

# --- Test 30: TimelineSaveRequest validation with compound clips ---
def test_timeline_save_request_with_compound_clips():
    compound = ClipSchema(name="Save Compound", start_time_ms=0, duration_ms=2000, is_compound=True, nested_tracks=[])
    track = TrackSchema(order_index=0, name="V", track_type="video", clips=[compound])
    req = TimelineSaveRequest(duration_ms=5000, tracks=[track])

    assert len(req.tracks[0].clips) == 1
    assert req.tracks[0].clips[0].is_compound is True

# --- Test 31: Mixed roles preservation in compound clips ---
def test_compound_clip_mixed_roles_preservation():
    roles = ["video", "dialogue", "voiceover", "music", "sfx", "ambience", "graphics"]
    nested_tracks = [
        TrackSchema(order_index=i, name=f"Track {r}", track_type="audio" if r != "video" and r != "graphics" else "video", track_role=r)
        for i, r in enumerate(roles)
    ]
    compound = ClipSchema(name="Full Orchestra Compound", start_time_ms=0, duration_ms=5000, is_compound=True, nested_tracks=nested_tracks)

    assert len(compound.nested_tracks) == len(roles)
    for idx, r in enumerate(roles):
        assert compound.nested_tracks[idx].track_role == r

# --- Test 32: Timeline duration recalculation with compound bounds ---
def test_compound_clip_nested_recalc_duration():
    compound = ClipSchema(name="Ending Compound", start_time_ms=25000, duration_ms=10000, is_compound=True) # ends at 35000ms
    track = TrackSchema(order_index=0, name="V", track_type="video", clips=[compound])

    max_end = max(c.start_time_ms + c.duration_ms for c in track.clips)
    calc_duration = max(30000, max_end + 2000)

    assert max_end == 35000
    assert calc_duration == 37000
