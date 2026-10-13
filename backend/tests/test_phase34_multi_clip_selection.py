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

# ─────────────────────────────────────────────────────────────────────────────
# Pure python simulation helpers mirroring Zustand store multi-clip logic
# ─────────────────────────────────────────────────────────────────────────────

def simulate_multi_clip_move(tracks_clips, selected_clip_ids, delta_ms):
    """
    Simulates multi-clip move mathematics:
    1. Collects all selected clips across tracks
    2. min_start = min(clip.start_time_ms)
    3. effective_delta = max(-min_start, round(delta_ms))
    4. For each selected clip: start_time_ms += effective_delta
    """
    all_tracks = copy.deepcopy(tracks_clips)
    selected_clips = []
    for t_id, clips in all_tracks.items():
        for c in clips:
            if c.id in selected_clip_ids:
                selected_clips.append(c)

    if not selected_clips or delta_ms == 0:
        return all_tracks

    min_start = min(c.start_time_ms for c in selected_clips)
    effective_delta = max(-min_start, round(delta_ms))

    for c in selected_clips:
        c.start_time_ms = max(0, c.start_time_ms + effective_delta)

    for t_id, clips in all_tracks.items():
        clips.sort(key=lambda c: c.start_time_ms)

    return all_tracks


def simulate_multi_clip_duplicate(tracks_clips, selected_clip_ids, insert_base_ms=None):
    """
    Simulates multi-clip duplication:
    1. Deep clones selected clips with new UUIDs.
    2. Preserves relative offsets: start = insert_base_ms + (clip.start - min_start).
    3. Clones keyframes with fresh UUIDs.
    4. Remaps transitions between clips within the selection; strips outside transitions.
    """
    all_tracks = copy.deepcopy(tracks_clips)
    selected_clips = []
    for t_id, clips in all_tracks.items():
        for c in clips:
            if c.id in selected_clip_ids:
                selected_clips.append((t_id, c))

    if not selected_clips:
        return all_tracks, []

    min_start = min(c.start_time_ms for _, c in selected_clips)
    max_end = max(c.start_time_ms + c.duration_ms for _, c in selected_clips)

    if insert_base_ms is None:
        insert_base_ms = max_end

    id_map = {}
    new_clip_ids = []
    for _, c in selected_clips:
        new_id = str(uuid.uuid4())
        id_map[c.id] = new_id
        new_clip_ids.append(new_id)

    duplicated_clips = []
    for t_id, c in selected_clips:
        new_id = id_map[c.id]
        rel_offset = c.start_time_ms - min_start
        new_start = insert_base_ms + rel_offset

        dup_c = copy.deepcopy(c)
        dup_c.id = new_id
        dup_c.start_time_ms = new_start

        # Remap keyframes
        if dup_c.keyframes:
            new_keyframes = []
            for kf in dup_c.keyframes:
                kf_copy = copy.deepcopy(kf)
                kf_copy.id = str(uuid.uuid4())
                new_keyframes.append(kf_copy)
            dup_c.keyframes = new_keyframes

        # Remap transitions
        if dup_c.transition_in:
            from_id = dup_c.transition_in.get("from_clip_id")
            if from_id and from_id in id_map:
                dup_c.transition_in["from_clip_id"] = id_map[from_id]
                dup_c.transition_in["to_clip_id"] = new_id
            else:
                dup_c.transition_in = None

        if dup_c.transition_out:
            to_id = dup_c.transition_out.get("to_clip_id")
            if to_id and to_id in id_map:
                dup_c.transition_out["to_clip_id"] = id_map[to_id]
                dup_c.transition_out["from_clip_id"] = new_id
            else:
                dup_c.transition_out = None

        all_tracks[t_id].append(dup_c)
        all_tracks[t_id].sort(key=lambda x: x.start_time_ms)
        duplicated_clips.append(dup_c)

    return all_tracks, new_clip_ids


def simulate_multi_clip_delete(tracks_clips, selected_clip_ids):
    """
    Simulates non-ripple multi-clip deletion:
    1. Removes all selected clips.
    2. Cleans dangling transitions referencing deleted clips.
    """
    all_tracks = copy.deepcopy(tracks_clips)
    target_set = set(selected_clip_ids)

    for t_id in all_tracks:
        all_tracks[t_id] = [c for c in all_tracks[t_id] if c.id not in target_set]

    # Clean dangling transitions
    for t_id, clips in all_tracks.items():
        for c in clips:
            if c.transition_out and c.transition_out.get("to_clip_id") in target_set:
                c.transition_out = None
            if c.transition_in and c.transition_in.get("from_clip_id") in target_set:
                c.transition_in = None

    return all_tracks


def simulate_multi_clip_ripple_delete(tracks_clips, selected_clip_ids):
    """
    Simulates multi-clip ripple delete:
    1. On each track, remaining clips shift left by sum of upstream deleted durations.
    2. Gaps between remaining clips are preserved; zero double-shifting.
    3. Cleans dangling transitions across all tracks.
    """
    all_tracks = copy.deepcopy(tracks_clips)
    target_set = set(selected_clip_ids)

    for t_id, clips in all_tracks.items():
        deleted_on_track = [c for c in clips if c.id in target_set]
        if not deleted_on_track:
            continue

        remaining = [c for c in clips if c.id not in target_set]

        for c in remaining:
            shift = 0
            for d in deleted_on_track:
                d_end = d.start_time_ms + d.duration_ms
                if d_end <= c.start_time_ms + 5:
                    shift += d.duration_ms
            c.start_time_ms = max(0, c.start_time_ms - shift)

        all_tracks[t_id] = remaining
        all_tracks[t_id].sort(key=lambda x: x.start_time_ms)

    # Clean dangling transitions
    for t_id, clips in all_tracks.items():
        for c in clips:
            if c.transition_out and c.transition_out.get("to_clip_id") in target_set:
                c.transition_out = None
            if c.transition_in and c.transition_in.get("from_clip_id") in target_set:
                c.transition_in = None

    return all_tracks


def simulate_range_selection(track_clips, anchor_id, target_id):
    """
    Simulates Shift+Click range selection on a track.
    Returns list of clip IDs between anchor and target inclusive.
    """
    sorted_clips = sorted(track_clips, key=lambda c: c.start_time_ms)
    anchor_idx = next((i for i, c in enumerate(sorted_clips) if c.id == anchor_id), -1)
    target_idx = next((i for i, c in enumerate(sorted_clips) if c.id == target_id), -1)
    if anchor_idx == -1 or target_idx == -1:
        return [target_id]
    start = min(anchor_idx, target_idx)
    end = max(anchor_idx, target_idx)
    return [c.id for c in sorted_clips[start:end+1]]


# ─────────────────────────────────────────────────────────────────────────────
# Test 1–5: Multi-Clip Move Invariants & Boundary Clamping
# ─────────────────────────────────────────────────────────────────────────────

def test_multi_clip_move_preserves_relative_offsets():
    """Test 1: Moving multiple clips preserves exact delta between clip start times."""
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=1000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", track_id="t1", name="Clip 2", start_time_ms=4000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    c3 = ClipSchema(id="c3", track_id="t1", name="Clip 3", start_time_ms=9000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)

    tracks = {"t1": [c1, c2, c3]}
    res = simulate_multi_clip_move(tracks, ["c1", "c2"], delta_ms=1500)

    mc1 = next(c for c in res["t1"] if c.id == "c1")
    mc2 = next(c for c in res["t1"] if c.id == "c2")
    mc3 = next(c for c in res["t1"] if c.id == "c3")

    assert mc1.start_time_ms == 2500
    assert mc2.start_time_ms == 5500
    assert mc3.start_time_ms == 9000  # unselected untouched
    assert (mc2.start_time_ms - mc1.start_time_ms) == (c2.start_time_ms - c1.start_time_ms)


def test_multi_clip_move_clamps_to_zero_as_group():
    """Test 2: Dragging group leftward past 0 clamps entire group without compressing offsets."""
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=1000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", track_id="t1", name="Clip 2", start_time_ms=5000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)

    tracks = {"t1": [c1, c2]}
    # Attempting to move -3000ms, but min_start is 1000ms -> effectiveDelta is -1000ms
    res = simulate_multi_clip_move(tracks, ["c1", "c2"], delta_ms=-3000)

    mc1 = next(c for c in res["t1"] if c.id == "c1")
    mc2 = next(c for c in res["t1"] if c.id == "c2")

    assert mc1.start_time_ms == 0
    assert mc2.start_time_ms == 4000
    assert (mc2.start_time_ms - mc1.start_time_ms) == 4000  # strictly constant!


def test_multi_clip_move_across_different_tracks():
    """Test 3: Selected clips on multiple different tracks move with identical delta."""
    c1 = ClipSchema(id="c1", track_id="v1", name="Video 1", start_time_ms=2000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    c2 = ClipSchema(id="c2", track_id="a1", name="Audio 1", start_time_ms=2500, duration_ms=4000, source_in_ms=0, source_out_ms=4000)

    tracks = {"v1": [c1], "a1": [c2]}
    res = simulate_multi_clip_move(tracks, ["c1", "c2"], delta_ms=2000)

    mv1 = res["v1"][0]
    ma1 = res["a1"][0]

    assert mv1.start_time_ms == 4000
    assert ma1.start_time_ms == 4500
    assert (ma1.start_time_ms - mv1.start_time_ms) == 500


def test_multi_clip_move_zero_delta_noop():
    """Test 4: Move with delta_ms=0 does not alter clips."""
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=1000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    tracks = {"t1": [c1]}
    res = simulate_multi_clip_move(tracks, ["c1"], delta_ms=0)
    assert res["t1"][0].start_time_ms == 1000


def test_multi_clip_move_non_adjacent_gap_preservation():
    """Test 5: Moving non-adjacent clips preserves gaps and leaves unselected intervening clips untouched."""
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=1000, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    c2 = ClipSchema(id="c2", track_id="t1", name="Middle", start_time_ms=3000, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    c3 = ClipSchema(id="c3", track_id="t1", name="Clip 3", start_time_ms=6000, duration_ms=1000, source_in_ms=0, source_out_ms=1000)

    tracks = {"t1": [c1, c2, c3]}
    res = simulate_multi_clip_move(tracks, ["c1", "c3"], delta_ms=1000)

    mc1 = next(c for c in res["t1"] if c.id == "c1")
    mc2 = next(c for c in res["t1"] if c.id == "c2")
    mc3 = next(c for c in res["t1"] if c.id == "c3")

    assert mc1.start_time_ms == 2000
    assert mc2.start_time_ms == 3000  # unchanged
    assert mc3.start_time_ms == 7000
    assert mc3.start_time_ms - mc1.start_time_ms == 5000


# ─────────────────────────────────────────────────────────────────────────────
# Test 6–10: Multi-Clip Duplication & Deep Independence
# ─────────────────────────────────────────────────────────────────────────────

def test_multi_clip_duplicate_generates_unique_ids():
    """Test 6: Duplicating multiple clips assigns unique IDs to all clones."""
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", track_id="t1", name="Clip 2", start_time_ms=3000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)

    tracks = {"t1": [c1, c2]}
    res, new_ids = simulate_multi_clip_duplicate(tracks, ["c1", "c2"])

    assert len(new_ids) == 2
    assert len(set(new_ids)) == 2
    assert "c1" not in new_ids
    assert "c2" not in new_ids
    assert len(res["t1"]) == 4


def test_multi_clip_duplicate_preserves_relative_spacing():
    """Test 7: Duplicated clips maintain the exact same inter-clip time interval."""
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=1000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", track_id="t1", name="Clip 2", start_time_ms=5000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)

    tracks = {"t1": [c1, c2]}
    # max_end is 7000, so base is 7000. c1 offset=0 -> 7000; c2 offset=4000 -> 11000
    res, new_ids = simulate_multi_clip_duplicate(tracks, ["c1", "c2"])

    d1 = next(c for c in res["t1"] if c.id == new_ids[0])
    d2 = next(c for c in res["t1"] if c.id == new_ids[1])

    assert d1.start_time_ms == 7000
    assert d2.start_time_ms == 11000
    assert (d2.start_time_ms - d1.start_time_ms) == (c2.start_time_ms - c1.start_time_ms)


def test_multi_clip_duplicate_deep_clones_keyframes():
    """Test 8: Duplicating clips clones keyframes with new keyframe IDs."""
    kf1 = KeyframeSchema(id="kf1", property_path="volume_db", time_offset_ms=500, value=-6.0)
    kf2 = KeyframeSchema(id="kf2", property_path="volume_db", time_offset_ms=1500, value=0.0)
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, keyframes=[kf1, kf2])

    tracks = {"t1": [c1]}
    res, new_ids = simulate_multi_clip_duplicate(tracks, ["c1"])
    dup = next(c for c in res["t1"] if c.id == new_ids[0])

    assert len(dup.keyframes) == 2
    assert dup.keyframes[0].id != "kf1"
    assert dup.keyframes[0].value == -6.0
    assert dup.keyframes[1].id != "kf2"


def test_multi_clip_duplicate_remaps_internal_transitions():
    """Test 9: Internal transitions between duplicated clips are remapped; external stripped."""
    t_out = {"type": "crossfade", "duration_ms": 1000, "from_clip_id": "c1", "to_clip_id": "c2"}
    t_in = {"type": "crossfade", "duration_ms": 1000, "from_clip_id": "c1", "to_clip_id": "c2"}
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=0, duration_ms=3000, source_in_ms=0, source_out_ms=3000, transition_out=t_out)
    c2 = ClipSchema(id="c2", track_id="t1", name="Clip 2", start_time_ms=3000, duration_ms=3000, source_in_ms=0, source_out_ms=3000, transition_in=t_in)

    tracks = {"t1": [c1, c2]}
    res, new_ids = simulate_multi_clip_duplicate(tracks, ["c1", "c2"])

    d1 = next(c for c in res["t1"] if c.id == new_ids[0])
    d2 = next(c for c in res["t1"] if c.id == new_ids[1])

    assert d1.transition_out is not None
    assert d1.transition_out["to_clip_id"] == d2.id
    assert d1.transition_out["from_clip_id"] == d1.id

    assert d2.transition_in is not None
    assert d2.transition_in["from_clip_id"] == d1.id
    assert d2.transition_in["to_clip_id"] == d2.id


def test_multi_clip_duplicate_preserves_speed_reverse_freeze_hold():
    """Test 10: Speed, reverse playback, freeze frame, and frame hold properties are cloned."""
    c1 = ClipSchema(
        id="c1", track_id="t1", name="Clip 1", start_time_ms=0, duration_ms=2000,
        source_in_ms=0, source_out_ms=2000, speed_factor=2.0, is_reversed=True,
        is_frozen=True, freeze_at_ms=500, freeze_duration_ms=2000
    )
    c2 = ClipSchema(
        id="c2", track_id="t1", name="Clip 2", start_time_ms=3000, duration_ms=3000,
        source_in_ms=0, source_out_ms=3000, speed_factor=0.5, is_reversed=False,
        is_frame_hold=True, frame_hold_at_ms=1000, frame_hold_duration_ms=3000
    )

    tracks = {"t1": [c1, c2]}
    res, new_ids = simulate_multi_clip_duplicate(tracks, ["c1", "c2"])

    d1 = next(c for c in res["t1"] if c.id == new_ids[0])
    d2 = next(c for c in res["t1"] if c.id == new_ids[1])

    assert d1.speed_factor == 2.0
    assert d1.is_reversed is True
    assert d1.is_frozen is True
    assert d1.freeze_at_ms == 500

    assert d2.speed_factor == 0.5
    assert d2.is_frame_hold is True
    assert d2.frame_hold_at_ms == 1000


# ─────────────────────────────────────────────────────────────────────────────
# Test 11–15: Multi-Clip Deletion & Transition Cleanup
# ─────────────────────────────────────────────────────────────────────────────

def test_multi_clip_delete_atomic_removal():
    """Test 11: Non-ripple multi-clip deletion removes selected clips without shifting others."""
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", track_id="t1", name="Clip 2", start_time_ms=3000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c3 = ClipSchema(id="c3", track_id="t1", name="Clip 3", start_time_ms=6000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)

    tracks = {"t1": [c1, c2, c3]}
    res = simulate_multi_clip_delete(tracks, ["c1", "c2"])

    assert len(res["t1"]) == 1
    assert res["t1"][0].id == "c3"
    assert res["t1"][0].start_time_ms == 6000  # unchanged


def test_multi_clip_delete_cleans_dangling_transitions():
    """Test 12: Transitions pointing to deleted clips are cleanly cleared across tracks."""
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, transition_out={"to_clip_id": "c2"})
    c2 = ClipSchema(id="c2", track_id="t1", name="Clip 2", start_time_ms=2000, duration_ms=2000, source_in_ms=0, source_out_ms=2000, transition_in={"from_clip_id": "c1"}, transition_out={"to_clip_id": "c3"})
    c3 = ClipSchema(id="c3", track_id="t1", name="Clip 3", start_time_ms=4000, duration_ms=2000, source_in_ms=0, source_out_ms=2000, transition_in={"from_clip_id": "c2"})

    tracks = {"t1": [c1, c2, c3]}
    res = simulate_multi_clip_delete(tracks, ["c2"])

    rem_c1 = next(c for c in res["t1"] if c.id == "c1")
    rem_c3 = next(c for c in res["t1"] if c.id == "c3")

    assert rem_c1.transition_out is None
    assert rem_c3.transition_in is None


def test_multi_clip_delete_across_multiple_tracks():
    """Test 13: Deleting multiple clips on different tracks simultaneously."""
    v1 = ClipSchema(id="v1", track_id="video", name="V1", start_time_ms=0, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    v2 = ClipSchema(id="v2", track_id="video", name="V2", start_time_ms=3000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    a1 = ClipSchema(id="a1", track_id="audio", name="A1", start_time_ms=0, duration_ms=5000, source_in_ms=0, source_out_ms=5000)
    a2 = ClipSchema(id="a2", track_id="audio", name="A2", start_time_ms=5000, duration_ms=5000, source_in_ms=0, source_out_ms=5000)

    tracks = {"video": [v1, v2], "audio": [a1, a2]}
    res = simulate_multi_clip_delete(tracks, ["v1", "a2"])

    assert len(res["video"]) == 1 and res["video"][0].id == "v2"
    assert len(res["audio"]) == 1 and res["audio"][0].id == "a1"


def test_multi_clip_delete_empty_selection_noop():
    """Test 14: Deleting with empty selection does nothing."""
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    tracks = {"t1": [c1]}
    res = simulate_multi_clip_delete(tracks, [])
    assert len(res["t1"]) == 1


def test_multi_clip_delete_all_clips():
    """Test 15: Deleting all clips empties the tracks cleanly."""
    c1 = ClipSchema(id="c1", track_id="t1", name="Clip 1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", track_id="t1", name="Clip 2", start_time_ms=2000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    tracks = {"t1": [c1, c2]}
    res = simulate_multi_clip_delete(tracks, ["c1", "c2"])
    assert len(res["t1"]) == 0


# ─────────────────────────────────────────────────────────────────────────────
# Test 16–20: Multi-Clip Ripple Deletion Mathematics
# ─────────────────────────────────────────────────────────────────────────────

def test_multi_clip_ripple_delete_contiguous():
    """Test 16: Contiguous deleted clips ripple downstream clips by total combined duration."""
    c1 = ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", track_id="t1", name="C2", start_time_ms=2000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    c3 = ClipSchema(id="c3", track_id="t1", name="C3", start_time_ms=5000, duration_ms=4000, source_in_ms=0, source_out_ms=4000)

    tracks = {"t1": [c1, c2, c3]}
    # Delete c1 (2000ms) and c2 (3000ms) -> total 5000ms
    res = simulate_multi_clip_ripple_delete(tracks, ["c1", "c2"])

    assert len(res["t1"]) == 1
    assert res["t1"][0].id == "c3"
    assert res["t1"][0].start_time_ms == 0


def test_multi_clip_ripple_delete_non_contiguous_zero_double_shifting():
    """Test 17: Non-contiguous ripple deletion shifts each remaining clip ONLY by preceding deleted clips."""
    c1 = ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)    # deleted
    c2 = ClipSchema(id="c2", track_id="t1", name="C2", start_time_ms=3000, duration_ms=2000, source_in_ms=0, source_out_ms=2000) # remaining
    c3 = ClipSchema(id="c3", track_id="t1", name="C3", start_time_ms=6000, duration_ms=3000, source_in_ms=0, source_out_ms=3000) # deleted
    c4 = ClipSchema(id="c4", track_id="t1", name="C4", start_time_ms=10000, duration_ms=2000, source_in_ms=0, source_out_ms=2000) # remaining

    tracks = {"t1": [c1, c2, c3, c4]}
    # Delete c1 (2s) and c3 (3s)
    # c2 is after c1 (shifts by 2s -> 3000 - 2000 = 1000)
    # c4 is after c1 and c3 (shifts by 2s + 3s = 5s -> 10000 - 5000 = 5000)
    res = simulate_multi_clip_ripple_delete(tracks, ["c1", "c3"])

    rem_c2 = next(c for c in res["t1"] if c.id == "c2")
    rem_c4 = next(c for c in res["t1"] if c.id == "c4")

    assert rem_c2.start_time_ms == 1000
    assert rem_c4.start_time_ms == 5000
    # Gap before c2 was 1000 (2000 to 3000) -> now gap is 1000 (0 to 1000)!
    assert rem_c2.start_time_ms == 1000


def test_multi_clip_ripple_delete_multi_track_independent():
    """Test 18: Multi-track ripple delete computes shifts per track independently."""
    v1 = ClipSchema(id="v1", track_id="v", name="V1", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000)
    v2 = ClipSchema(id="v2", track_id="v", name="V2", start_time_ms=4000, duration_ms=3000, source_in_ms=0, source_out_ms=3000)
    a1 = ClipSchema(id="a1", track_id="a", name="A1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    a2 = ClipSchema(id="a2", track_id="a", name="A2", start_time_ms=2000, duration_ms=5000, source_in_ms=0, source_out_ms=5000)

    tracks = {"v": [v1, v2], "a": [a1, a2]}
    # Delete v1 (4000ms) on video track, and a1 (2000ms) on audio track
    res = simulate_multi_clip_ripple_delete(tracks, ["v1", "a1"])

    assert res["v"][0].id == "v2"
    assert res["v"][0].start_time_ms == 0

    assert res["a"][0].id == "a2"
    assert res["a"][0].start_time_ms == 0


def test_multi_clip_ripple_delete_preserves_internal_gaps():
    """Test 19: Ripple delete preserves silence/gap between downstream clips."""
    c1 = ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c2 = ClipSchema(id="c2", track_id="t1", name="C2", start_time_ms=3000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)
    c3 = ClipSchema(id="c3", track_id="t1", name="C3", start_time_ms=7000, duration_ms=2000, source_in_ms=0, source_out_ms=2000)

    tracks = {"t1": [c1, c2, c3]}
    res = simulate_multi_clip_ripple_delete(tracks, ["c1"])

    rc2 = next(c for c in res["t1"] if c.id == "c2")
    rc3 = next(c for c in res["t1"] if c.id == "c3")

    assert rc2.start_time_ms == 1000
    assert rc3.start_time_ms == 5000
    # Original gap between c2 end (5000) and c3 start (7000) was 2000
    # New gap between rc2 end (3000) and rc3 start (5000) is 2000!
    assert (rc3.start_time_ms - (rc2.start_time_ms + rc2.duration_ms)) == 2000


def test_multi_clip_ripple_delete_transition_cleanup():
    """Test 20: Dangling transitions referencing any ripple-deleted clip are cleared."""
    c1 = ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, transition_out={"to_clip_id": "c2"})
    c2 = ClipSchema(id="c2", track_id="t1", name="C2", start_time_ms=2000, duration_ms=2000, source_in_ms=0, source_out_ms=2000, transition_in={"from_clip_id": "c1"})
    tracks = {"t1": [c1, c2]}
    res = simulate_multi_clip_ripple_delete(tracks, ["c2"])
    assert res["t1"][0].transition_out is None


# ─────────────────────────────────────────────────────────────────────────────
# Test 21–23: Selection Store Model (Contiguous Range & Invariants)
# ─────────────────────────────────────────────────────────────────────────────

def test_selection_range_contiguous_selection():
    """Test 21: Shift+Click range selection collects all clips between anchor and clicked clip."""
    c1 = ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    c2 = ClipSchema(id="c2", track_id="t1", name="C2", start_time_ms=1500, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    c3 = ClipSchema(id="c3", track_id="t1", name="C3", start_time_ms=3000, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    c4 = ClipSchema(id="c4", track_id="t1", name="C4", start_time_ms=4500, duration_ms=1000, source_in_ms=0, source_out_ms=1000)

    track_clips = [c1, c2, c3, c4]
    selected = simulate_range_selection(track_clips, anchor_id="c1", target_id="c3")
    assert selected == ["c1", "c2", "c3"]


def test_selection_range_reverse_direction():
    """Test 22: Shift+Click works when target clip is earlier on timeline than anchor."""
    c1 = ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    c2 = ClipSchema(id="c2", track_id="t1", name="C2", start_time_ms=1500, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    c3 = ClipSchema(id="c3", track_id="t1", name="C3", start_time_ms=3000, duration_ms=1000, source_in_ms=0, source_out_ms=1000)

    track_clips = [c1, c2, c3]
    selected = simulate_range_selection(track_clips, anchor_id="c3", target_id="c1")
    assert selected == ["c1", "c2", "c3"]


def test_selection_range_unknown_anchor_fallback():
    """Test 23: Range selection with non-matching anchor falls back to selecting target only."""
    c1 = ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=1000)
    track_clips = [c1]
    selected = simulate_range_selection(track_clips, anchor_id="nonexistent", target_id="c1")
    assert selected == ["c1"]


# ─────────────────────────────────────────────────────────────────────────────
# Test 24–25: FFmpeg Export Pipeline with Multi-Clip Modifications
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_multi_clip_moved_timeline_renders_ffmpeg(ffmpeg_service):
    """Test 24: Timeline with multi-clip moved clips produces valid FFmpeg command and renders successfully."""
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        vid_path = tmp_path / "src.mp4"

        # Generate 3-second test clip
        cmd = [
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=25:d=3",
            "-c:v", "libx264",
            str(vid_path)
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        c1 = ClipSchema(id="c1", track_id="v1", name="C1", start_time_ms=0, duration_ms=1500, source_in_ms=0, source_out_ms=1500, asset_id=str(vid_path))
        c2 = ClipSchema(id="c2", track_id="v1", name="C2", start_time_ms=1500, duration_ms=1500, source_in_ms=1500, source_out_ms=3000, asset_id=str(vid_path))

        # Multi-clip move by 500ms
        tracks = {"v1": [c1, c2]}
        res = simulate_multi_clip_move(tracks, ["c1", "c2"], delta_ms=500)

        out_path = tmp_path / "output.mp4"
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
                "id": c.id,
                "file_path": vid_path,
                "start_time_ms": c.start_time_ms,
                "duration_ms": c.duration_ms,
                "source_in_ms": c.source_in_ms,
                "source_out_ms": c.source_out_ms,
                "speed_factor": 1.0,
            }
            for c in res["v1"]
        ]

        success = await ffmpeg_service.render_timeline_sequence(
            timeline_duration_ms=3500,
            video_clips=video_clips,
            audio_clips=[],
            output_path=out_path,
            export_preset=export_preset,
        )
        assert success is True
        assert out_path.exists()
        assert out_path.stat().st_size > 0


@pytest.mark.asyncio
async def test_multi_clip_duplicated_timeline_renders_ffmpeg(ffmpeg_service):
    """Test 25: Duplicated multi-clips assemble and render cleanly through FFmpeg."""
    ffmpeg_exe = ffmpeg_service.ffmpeg_bin

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        vid_path = tmp_path / "src2.mp4"

        cmd = [
            ffmpeg_exe, "-y",
            "-f", "lavfi", "-i", "color=c=green:s=320x240:r=25:d=2",
            "-c:v", "libx264",
            str(vid_path)
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        c1 = ClipSchema(id="c1", track_id="v1", name="C1", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=1000, asset_id=str(vid_path))
        c2 = ClipSchema(id="c2", track_id="v1", name="C2", start_time_ms=1000, duration_ms=1000, source_in_ms=1000, source_out_ms=2000, asset_id=str(vid_path))

        tracks = {"v1": [c1, c2]}
        res, new_ids = simulate_multi_clip_duplicate(tracks, ["c1", "c2"])

        assert len(res["v1"]) == 4

        out_path = tmp_path / "multi_dupe_out.mp4"
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
                "id": c.id,
                "file_path": vid_path,
                "start_time_ms": c.start_time_ms,
                "duration_ms": c.duration_ms,
                "source_in_ms": c.source_in_ms,
                "source_out_ms": c.source_out_ms,
                "speed_factor": 1.0,
            }
            for c in res["v1"]
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
        assert out_path.stat().st_size > 0
