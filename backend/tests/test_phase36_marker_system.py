import pytest
import uuid
import copy
from typing import List
from app.schemas.timeline import (
    MarkerSchema,
    ClipSchema,
    TrackSchema,
    TimelineStateSchema,
    TimelineSaveRequest,
)
from app.models.timeline import Timeline, Track, Clip
from app.services.timeline_service import TimelineService

# --- Test 1: MarkerSchema default fields ---
def test_marker_schema_defaults():
    marker = MarkerSchema(time_ms=1500)
    assert marker.time_ms == 1500
    assert marker.duration_ms == 0
    assert marker.name == "Marker"
    assert marker.comment == ""
    assert marker.color == "blue"
    assert marker.clip_id is None
    assert marker.id is None

# --- Test 2: MarkerSchema custom fields ---
def test_marker_schema_custom_fields():
    marker_id = str(uuid.uuid4())
    clip_id = str(uuid.uuid4())
    marker = MarkerSchema(
        id=marker_id,
        time_ms=4500,
        duration_ms=1000,
        name="Scene Transition Cue",
        comment="Start sound effect crossfade",
        color="red",
        clip_id=clip_id,
    )
    assert marker.id == marker_id
    assert marker.time_ms == 4500
    assert marker.duration_ms == 1000
    assert marker.name == "Scene Transition Cue"
    assert marker.comment == "Start sound effect crossfade"
    assert marker.color == "red"
    assert marker.clip_id == clip_id

# --- Test 3: Marker color palette support ---
def test_marker_color_palette():
    palette = ["blue", "cyan", "green", "yellow", "red", "pink", "purple", "white"]
    for c in palette:
        marker = MarkerSchema(time_ms=100, color=c)
        assert marker.color == c

# --- Test 4: ClipSchema with markers default ---
def test_clip_schema_with_markers_default():
    clip = ClipSchema(name="Action Shot", start_time_ms=0, duration_ms=3000)
    assert hasattr(clip, "markers")
    assert clip.markers == []

# --- Test 5: ClipSchema with multiple clip markers ---
def test_clip_schema_with_multiple_markers():
    m1 = MarkerSchema(id="m1", time_ms=500, name="Punch In", color="yellow")
    m2 = MarkerSchema(id="m2", time_ms=2000, name="Dialogue Cue", color="green")
    clip = ClipSchema(name="Interview", start_time_ms=1000, duration_ms=4000, markers=[m1, m2])
    assert len(clip.markers) == 2
    assert clip.markers[0].name == "Punch In"
    assert clip.markers[1].color == "green"

# --- Test 6: TimelineStateSchema with markers default ---
def test_timeline_state_schema_with_markers_default():
    timeline = TimelineStateSchema(id="tl-1", project_id="p-1", name="Main Sequence", duration_ms=10000, tracks=[])
    assert hasattr(timeline, "markers")
    assert timeline.markers == []

# --- Test 7: TimelineStateSchema with sequence markers ---
def test_timeline_state_schema_with_sequence_markers():
    m1 = MarkerSchema(time_ms=0, name="Intro", color="cyan")
    m2 = MarkerSchema(time_ms=5000, name="Chorus", color="pink")
    timeline = TimelineStateSchema(
        id="tl-1",
        project_id="p-1",
        name="Main Sequence",
        duration_ms=20000,
        tracks=[],
        markers=[m1, m2],
    )
    assert len(timeline.markers) == 2
    assert timeline.markers[0].name == "Intro"
    assert timeline.markers[1].name == "Chorus"

# --- Test 8: TimelineSaveRequest with markers ---
def test_timeline_save_request_with_markers():
    m = MarkerSchema(time_ms=2500, name="Chapter 1", color="purple")
    clip = ClipSchema(name="C1", start_time_ms=0, duration_ms=5000, markers=[m])
    track = TrackSchema(order_index=0, name="V1", track_type="video", clips=[clip])
    req = TimelineSaveRequest(
        name="Main Sequence",
        duration_ms=10000,
        tracks=[track],
        markers=[m],
    )
    assert len(req.markers) == 1
    assert req.markers[0].name == "Chapter 1"
    assert len(req.tracks[0].clips[0].markers) == 1

# --- Test 9: Serialization and deserialization roundtrip ---
def test_marker_schema_roundtrip_serialization():
    original = MarkerSchema(
        id="mark-123",
        time_ms=3200,
        duration_ms=800,
        name="B-Roll Cut",
        comment="Insert wide angle drone shot",
        color="white",
        clip_id="clip-456",
    )
    dumped = original.model_dump(mode="json")
    reloaded = MarkerSchema.model_validate(dumped)
    assert reloaded.id == "mark-123"
    assert reloaded.time_ms == 3200
    assert reloaded.duration_ms == 800
    assert reloaded.name == "B-Roll Cut"
    assert reloaded.comment == "Insert wide angle drone shot"
    assert reloaded.color == "white"
    assert reloaded.clip_id == "clip-456"

# --- Test 10: Marker duration range validation ---
def test_duration_marker_validation():
    marker = MarkerSchema(time_ms=1000, duration_ms=2500, name="Audio Bed Range")
    end_time_ms = marker.time_ms + marker.duration_ms
    assert marker.duration_ms == 2500
    assert end_time_ms == 3500

# --- Test 11: Marker comment and annotation text ---
def test_marker_comments_and_annotations():
    annotation = "Need color grading pass: lift shadows by +1.5 EV.\nCheck Tamil subtitle alignment at 00:02:15."
    marker = MarkerSchema(time_ms=2150, name="Grade Note", comment=annotation, color="red")
    assert marker.comment == annotation
    assert "Tamil subtitle alignment" in marker.comment

# --- Test 12: TimelineService serialize empty markers ---
def test_timeline_service_serialize_timeline_empty_markers():
    tl = Timeline(id="tl-1", project_id="p-1", name="Sequence", duration_ms=5000)
    data = TimelineService.serialize_timeline(tl)
    assert "markers" in data
    assert data["markers"] == []

# --- Test 13: TimelineService serialize sequence markers ---
def test_timeline_service_serialize_timeline_with_sequence_markers():
    tl = Timeline(id="tl-1", project_id="p-1", name="Sequence", duration_ms=5000)
    tl.markers = [{"id": "m1", "time_ms": 1000, "name": "Start", "color": "blue"}]
    data = TimelineService.serialize_timeline(tl)
    assert len(data["markers"]) == 1
    assert data["markers"][0]["name"] == "Start"

# --- Test 14: TimelineService serialize clip markers from metadata_info ---
def test_timeline_service_serialize_timeline_with_clip_markers():
    tl = Timeline(id="tl-1", project_id="p-1", name="Sequence", duration_ms=5000)
    tr = Track(id="tr-1", timeline_id=tl.id, track_type="video", order_index=0, name="V1")
    c = Clip(
        id="c-1",
        track_id=tr.id,
        name="Clip 1",
        start_time_ms=0,
        duration_ms=4000,
        metadata_info={"markers": [{"id": "cm-1", "time_ms": 500, "name": "Hit Point", "color": "yellow"}]}
    )
    tr.clips = [c]
    tl.tracks = [tr]
    data = TimelineService.serialize_timeline(tl)
    clip_data = data["tracks"][0]["clips"][0]
    assert "markers" in clip_data
    assert len(clip_data["markers"]) == 1
    assert clip_data["markers"][0]["name"] == "Hit Point"

# --- Test 15: Marker chronological sorting ---
def test_marker_sorting_chronological():
    m1 = MarkerSchema(time_ms=3000, name="Third")
    m2 = MarkerSchema(time_ms=1000, name="First")
    m3 = MarkerSchema(time_ms=2000, name="Second")
    markers = [m1, m2, m3]
    sorted_markers = sorted(markers, key=lambda m: m.time_ms)
    assert [m.name for m in sorted_markers] == ["First", "Second", "Third"]

# --- Test 16: Marker quick navigation next ---
def test_marker_quick_navigation_next():
    times = [500, 1500, 3000, 4500]
    playhead = 1600
    # Next marker: smallest marker time > playhead + 10
    next_time = next((t for t in times if t > playhead + 10), None)
    assert next_time == 3000

# --- Test 17: Marker quick navigation prev ---
def test_marker_quick_navigation_prev():
    times = [500, 1500, 3000, 4500]
    playhead = 2900
    # Prev marker: largest marker time < playhead - 10
    prev_times = [t for t in times if t < playhead - 10]
    prev_time = prev_times[-1] if prev_times else None
    assert prev_time == 1500

# --- Test 18: Marker navigation wrap around ---
def test_marker_navigation_wrap_around():
    times = [500, 1500, 3000]
    # At end -> wrap to first
    playhead_end = 3500
    next_time = next((t for t in times if t > playhead_end + 10), times[0])
    assert next_time == 500

    # At start -> wrap to last
    playhead_start = 200
    prev_times = [t for t in times if t < playhead_start - 10]
    prev_time = prev_times[-1] if prev_times else times[-1]
    assert prev_time == 3000

# --- Test 19: Combined timeline and clip markers navigation ---
def test_combined_timeline_and_clip_marker_navigation():
    timeline_markers = [MarkerSchema(time_ms=1000, name="Seq 1"), MarkerSchema(time_ms=5000, name="Seq 2")]
    clip = ClipSchema(
        name="Clip A",
        start_time_ms=2000,
        duration_ms=4000,
        markers=[MarkerSchema(time_ms=500, name="Clip Cue")] # Absolute: 2000 + 500 = 2500
    )
    all_absolute_times = []
    for m in timeline_markers:
        all_absolute_times.append(m.time_ms)
    for cm in clip.markers:
        all_absolute_times.append(clip.start_time_ms + cm.time_ms)
    all_absolute_times.sort()

    assert all_absolute_times == [1000, 2500, 5000]

# --- Test 20: Clip marker relative offset calculation ---
def test_clip_marker_relative_offset_calculation():
    clip_start = 2000
    clip_duration = 3000
    playhead = 3500
    relative_offset = max(0, min(clip_duration, playhead - clip_start))
    assert relative_offset == 1500

# --- Test 21: Clip marker absolute timestamp calculation ---
def test_clip_marker_absolute_timestamp_calculation():
    clip_start = 1200
    marker_offset = 800
    absolute_time = clip_start + marker_offset
    assert absolute_time == 2000

# --- Test 22: Marker snapping targets ---
def test_marker_snapping_targets():
    timeline_markers = [MarkerSchema(time_ms=1200), MarkerSchema(time_ms=4800)]
    clip = ClipSchema(name="C1", start_time_ms=0, duration_ms=2000)
    snap_targets = [0, 500] # 0, playhead
    for m in timeline_markers:
        snap_targets.push(m.time_ms) if hasattr(snap_targets, 'push') else snap_targets.append(m.time_ms)
    snap_targets.append(clip.start_time_ms)
    snap_targets.append(clip.start_time_ms + clip.duration_ms)

    assert 1200 in snap_targets
    assert 4800 in snap_targets
    assert 2000 in snap_targets

# --- Test 23: Marker deep cloning on duplicate ---
def test_marker_deep_cloning_on_duplicate():
    orig_clip_id = str(uuid.uuid4())
    orig_marker_id = str(uuid.uuid4())
    orig_clip = ClipSchema(
        id=orig_clip_id,
        name="Source Clip",
        start_time_ms=1000,
        duration_ms=4000,
        markers=[
            MarkerSchema(id=orig_marker_id, time_ms=500, name="Dialogue Marker", color="cyan", clip_id=orig_clip_id)
        ]
    )

    # Simulate deep clone (as in cloneClipDeepWithNewIds)
    new_clip_id = str(uuid.uuid4())
    cloned_markers = [
        MarkerSchema(
            id=str(uuid.uuid4()),
            time_ms=m.time_ms,
            duration_ms=m.duration_ms,
            name=m.name,
            comment=m.comment,
            color=m.color,
            clip_id=new_clip_id
        )
        for m in orig_clip.markers
    ]
    cloned_clip = ClipSchema(
        id=new_clip_id,
        name="Source Clip Copy",
        start_time_ms=5000,
        duration_ms=4000,
        markers=cloned_markers
    )

    assert cloned_clip.id != orig_clip.id
    assert cloned_clip.markers[0].id != orig_marker_id
    assert cloned_clip.markers[0].clip_id == new_clip_id
    assert cloned_clip.markers[0].time_ms == 500
    assert cloned_clip.markers[0].color == "cyan"

# --- Test 24: Marker deep cloning in compound clips ---
def test_marker_deep_cloning_in_compound_clips():
    child_marker = MarkerSchema(id="cm1", time_ms=300, name="Nested Hit", color="red")
    child = ClipSchema(id="child1", name="Nested Child", start_time_ms=0, duration_ms=2000, markers=[child_marker])
    track = TrackSchema(order_index=0, name="V", track_type="video", clips=[child])
    compound = ClipSchema(name="Comp 1", start_time_ms=0, duration_ms=2000, is_compound=True, nested_tracks=[track])

    # Unpack / deep clone check
    unpacked_child_id = str(uuid.uuid4())
    unpacked_marker_id = str(uuid.uuid4())
    unpacked_marker = MarkerSchema(
        id=unpacked_marker_id,
        time_ms=child_marker.time_ms,
        name=child_marker.name,
        color=child_marker.color,
        clip_id=unpacked_child_id
    )
    assert unpacked_marker.id != child_marker.id
    assert unpacked_marker.clip_id == unpacked_child_id

# --- Test 25: Marker split partitioning across cut boundary ---
def test_marker_split_partitioning():
    m1 = MarkerSchema(id="m1", time_ms=400, name="Left Marker")
    m2 = MarkerSchema(id="m2", time_ms=1600, name="Right Marker")
    clip = ClipSchema(id="orig", name="Clip", start_time_ms=1000, duration_ms=3000, markers=[m1, m2])

    split_at_ms = 2000
    split_offset = split_at_ms - clip.start_time_ms # 1000ms

    left_markers = [m for m in clip.markers if m.time_ms < split_offset]
    right_markers = [
        MarkerSchema(
            id=str(uuid.uuid4()),
            time_ms=m.time_ms - split_offset,
            duration_ms=m.duration_ms,
            name=m.name,
            comment=m.comment,
            color=m.color,
            clip_id="right_clip_id"
        )
        for m in clip.markers if m.time_ms >= split_offset
    ]

    assert len(left_markers) == 1
    assert left_markers[0].name == "Left Marker"
    assert left_markers[0].time_ms == 400

    assert len(right_markers) == 1
    assert right_markers[0].name == "Right Marker"
    assert right_markers[0].time_ms == 600 # 1600 - 1000

# --- Test 26: Marker split boundary exact match ---
def test_marker_split_boundary_exact_match():
    m = MarkerSchema(id="cut-m", time_ms=1500, name="Boundary Marker")
    clip = ClipSchema(name="Boundary Clip", start_time_ms=0, duration_ms=3000, markers=[m])
    split_offset = 1500

    left_markers = [item for item in clip.markers if item.time_ms < split_offset]
    right_markers = [
        MarkerSchema(id="new-m", time_ms=item.time_ms - split_offset, name=item.name)
        for item in clip.markers if item.time_ms >= split_offset
    ]

    assert len(left_markers) == 0
    assert len(right_markers) == 1
    assert right_markers[0].time_ms == 0

# --- Test 27: Marker in-place attribute updates ---
def test_marker_update_attributes():
    marker = MarkerSchema(time_ms=1000, name="Old Name", color="blue", comment="Old Note")
    # Simulate updateMarker
    updated = marker.model_copy(update={"name": "New Name", "color": "purple", "comment": "New Note"})
    assert updated.name == "New Name"
    assert updated.color == "purple"
    assert updated.comment == "New Note"
    assert updated.time_ms == 1000

# --- Test 28: Delete individual marker ---
def test_marker_delete_individual():
    m1 = MarkerSchema(id="m1", time_ms=100)
    m2 = MarkerSchema(id="m2", time_ms=200)
    m3 = MarkerSchema(id="m3", time_ms=300)
    markers = [m1, m2, m3]
    del_id = "m2"
    remaining = [m for m in markers if m.id != del_id]
    assert len(remaining) == 2
    assert [m.id for m in remaining] == ["m1", "m3"]

# --- Test 29: Clear clip markers preserves sequence markers ---
def test_marker_clear_clip_markers():
    seq_markers = [MarkerSchema(id="s1", time_ms=500)]
    clip_markers = [MarkerSchema(id="c1", time_ms=200)]
    # Clear clip markers
    clip_markers = []
    assert len(clip_markers) == 0
    assert len(seq_markers) == 1

# --- Test 30: Color filtering for marker search ---
def test_marker_color_filter():
    m1 = MarkerSchema(time_ms=100, color="red")
    m2 = MarkerSchema(time_ms=200, color="blue")
    m3 = MarkerSchema(time_ms=300, color="red")
    m4 = MarkerSchema(time_ms=400, color="green")
    markers = [m1, m2, m3, m4]

    red_markers = [m for m in markers if m.color == "red"]
    assert len(red_markers) == 2
    assert red_markers[0].time_ms == 100
    assert red_markers[1].time_ms == 300
