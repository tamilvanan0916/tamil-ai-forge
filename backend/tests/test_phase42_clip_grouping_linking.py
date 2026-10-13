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
from app.models.timeline import Timeline, Track, Clip
from app.services.timeline_service import TimelineService


# ─── Pure Algorithm Implementations for Phase 42 Clip Grouping & Linking ───

def get_all_clips(tracks: List[TrackSchema]) -> List[ClipSchema]:
    clips = []
    for t in tracks:
        clips.extend(t.clips)
    return clips


def get_related_clip_ids(tracks: List[TrackSchema], clip_id: str) -> List[str]:
    """Finds all transitively grouped and linked clip IDs."""
    all_clips = get_all_clips(tracks)
    target = next((c for c in all_clips if c.id == clip_id), None)
    if not target:
        return [clip_id]

    visited: Set[str] = {clip_id}
    added = True
    while added:
        added = False
        for current_id in list(visited):
            c = next((item for item in all_clips if item.id == current_id), None)
            if not c:
                continue
            # Group relation
            if c.group_id:
                for sibling in all_clips:
                    if sibling.group_id == c.group_id and sibling.id not in visited:
                        visited.add(sibling.id)
                        added = True
            # Link relation
            if c.linked_clip_id and c.linked_clip_id not in visited:
                partner = next((item for item in all_clips if item.id == c.linked_clip_id), None)
                if partner:
                    visited.add(partner.id)
                    added = True
    return list(visited)


def group_clips(tracks: List[TrackSchema], clip_ids: List[str]) -> Optional[str]:
    """Groups the given clips under a new group_id.
    Requires at least 2 clips. Returns group_id or None if invalid or on locked tracks.
    """
    if len(clip_ids) < 2:
        return None

    # Check locked tracks
    for t in tracks:
        if t.is_locked and any(c.id in clip_ids for c in t.clips):
            return None

    new_group_id = str(uuid.uuid4())
    modified = False
    for t in tracks:
        if t.is_locked:
            continue
        for c in t.clips:
            if c.id in clip_ids:
                c.group_id = new_group_id
                modified = True
    return new_group_id if modified else None


def ungroup_clips(tracks: List[TrackSchema], clip_ids: List[str]) -> bool:
    """Ungroups all groups containing any of the given clips.
    Respects locked tracks.
    """
    if not clip_ids:
        return False

    all_clips = get_all_clips(tracks)
    target_groups = {c.group_id for c in all_clips if c.id in clip_ids and c.group_id}
    if not target_groups:
        return False

    # Check if any clip in target groups is on a locked track
    for t in tracks:
        if t.is_locked and any(c.group_id in target_groups for c in t.clips if c.group_id):
            return False

    for t in tracks:
        if t.is_locked:
            continue
        for c in t.clips:
            if c.group_id in target_groups:
                c.group_id = None
    return True


def link_clips(tracks: List[TrackSchema], clip_a_id: str, clip_b_id: str) -> bool:
    """Bilaterally links two clips (audio/video).
    Fails if either track is locked.
    """
    if clip_a_id == clip_b_id:
        return False

    clip_a = None
    clip_b = None
    for t in tracks:
        for c in t.clips:
            if c.id == clip_a_id:
                if t.is_locked:
                    return False
                clip_a = c
            elif c.id == clip_b_id:
                if t.is_locked:
                    return False
                clip_b = c

    if not clip_a or not clip_b:
        return False

    clip_a.linked_clip_id = clip_b.id
    clip_b.linked_clip_id = clip_a.id
    return True


def unlink_clips(tracks: List[TrackSchema], clip_ids: List[str]) -> bool:
    """Unlinks clips and their bilateral partners.
    Respects locked tracks.
    """
    if not clip_ids:
        return False

    all_clips = get_all_clips(tracks)
    target_pairs: Set[str] = set()
    for c in all_clips:
        if c.id in clip_ids and c.linked_clip_id:
            target_pairs.add(c.id)
            target_pairs.add(c.linked_clip_id)

    if not target_pairs:
        return False

    for t in tracks:
        if t.is_locked and any(c.id in target_pairs for c in t.clips):
            return False

    for t in tracks:
        if t.is_locked:
            continue
        for c in t.clips:
            if c.id in target_pairs:
                c.linked_clip_id = None
    return True


def calculate_sync_drift(clip_a: ClipSchema, clip_b: ClipSchema) -> int:
    """Calculates synchronization drift in milliseconds between linked clips."""
    return clip_a.start_time_ms - clip_b.start_time_ms


def realign_linked_clip(tracks: List[TrackSchema], clip_id: str) -> bool:
    """Realigns target clip start_time_ms to match its linked partner."""
    all_clips = get_all_clips(tracks)
    target = next((c for c in all_clips if c.id == clip_id), None)
    if not target or not target.linked_clip_id:
        return False

    partner = next((c for c in all_clips if c.id == target.linked_clip_id), None)
    if not partner:
        return False

    target_track = next((t for t in tracks if any(c.id == clip_id for c in t.clips)), None)
    if not target_track or target_track.is_locked:
        return False

    target.start_time_ms = partner.start_time_ms
    target_track.clips.sort(key=lambda c: c.start_time_ms)
    return True


def move_coordinated_clips(tracks: List[TrackSchema], anchor_clip_id: str, delta_ms: int) -> bool:
    """Moves all related (grouped and linked) clips together by delta_ms."""
    related_ids = set(get_related_clip_ids(tracks, anchor_clip_id))
    all_clips = get_all_clips(tracks)
    target_clips = [c for c in all_clips if c.id in related_ids]

    # Check locked tracks
    for t in tracks:
        if t.is_locked and any(c.id in related_ids for c in t.clips):
            return False

    # Check non-negative boundary constraint
    for c in target_clips:
        if c.start_time_ms + delta_ms < 0:
            return False

    for c in target_clips:
        c.start_time_ms += delta_ms

    for t in tracks:
        t.clips.sort(key=lambda c: c.start_time_ms)
    return True


def delete_clip_with_linking_cleanup(tracks: List[TrackSchema], clip_id: str) -> bool:
    """Deletes a clip and cleans up dangling linked_clip_id references."""
    target_track = next((t for t in tracks if any(c.id == clip_id for c in t.clips)), None)
    if not target_track or target_track.is_locked:
        return False

    target_track.clips = [c for c in target_track.clips if c.id != clip_id]

    # Clean dangling linked_clip_id
    for t in tracks:
        for c in t.clips:
            if c.linked_clip_id == clip_id:
                c.linked_clip_id = None
    return True


def duplicate_clips_with_group_link(
    tracks: List[TrackSchema],
    clip_ids: List[str],
) -> List[str]:
    """Duplicates clips while preserving internal grouping and cross-linking."""
    all_clips = get_all_clips(tracks)
    to_dup = [c for c in all_clips if c.id in clip_ids]
    if not to_dup:
        return []

    id_map: Dict[str, str] = {c.id: str(uuid.uuid4()) for c in to_dup}
    group_map: Dict[str, str] = {}
    new_clip_ids = []

    min_start = min(c.start_time_ms for c in to_dup)
    max_end = max(c.start_time_ms + c.duration_ms for c in to_dup)
    insert_base = max_end

    for t in tracks:
        if t.is_locked:
            continue
        for c in list(t.clips):
            if c.id in id_map:
                new_id = id_map[c.id]
                new_clip = copy.deepcopy(c)
                new_clip.id = new_id
                rel_offset = c.start_time_ms - min_start
                new_clip.start_time_ms = insert_base + rel_offset

                # Group remapping
                if c.group_id:
                    if c.group_id not in group_map:
                        group_map[c.group_id] = str(uuid.uuid4())
                    new_clip.group_id = group_map[c.group_id]
                else:
                    new_clip.group_id = None

                # Linked partner remapping
                if c.linked_clip_id and c.linked_clip_id in id_map:
                    new_clip.linked_clip_id = id_map[c.linked_clip_id]
                else:
                    new_clip.linked_clip_id = None

                t.clips.append(new_clip)
                new_clip_ids.append(new_id)
        t.clips.sort(key=lambda c: c.start_time_ms)

    return new_clip_ids


def split_single_clip(track: TrackSchema, clip_id: str, cut_time_ms: int) -> Optional[Tuple[ClipSchema, ClipSchema]]:
    if track.is_locked:
        return None
    clip = next((c for c in track.clips if c.id == clip_id), None)
    if not clip:
        return None
    if cut_time_ms <= clip.start_time_ms or cut_time_ms >= clip.start_time_ms + clip.duration_ms:
        return None

    split_offset = cut_time_ms - clip.start_time_ms
    orig_dur = clip.duration_ms

    left_id = str(uuid.uuid4())
    right_id = str(uuid.uuid4())

    left_clip = copy.deepcopy(clip)
    left_clip.id = left_id
    left_clip.duration_ms = split_offset
    left_clip.source_out_ms = left_clip.source_in_ms + split_offset

    right_clip = copy.deepcopy(clip)
    right_clip.id = right_id
    right_clip.start_time_ms = cut_time_ms
    right_clip.duration_ms = orig_dur - split_offset
    right_clip.source_in_ms = left_clip.source_out_ms

    track.clips = [c for c in track.clips if c.id != clip_id]
    track.clips.extend([left_clip, right_clip])
    track.clips.sort(key=lambda c: c.start_time_ms)
    return left_clip, right_clip


def razor_cut_bilateral(
    tracks: List[TrackSchema],
    clip_id: str,
    cut_time_ms: int,
) -> Optional[Dict[str, Any]]:
    """Symmetrical bilateral razor split: cutting target clip also cuts partner and cross-links."""
    target_track = next((t for t in tracks if any(c.id == clip_id for c in t.clips)), None)
    if not target_track or target_track.is_locked:
        return None
    target_clip = next(c for c in target_track.clips if c.id == clip_id)

    # Check if linked
    if target_clip.linked_clip_id:
        partner_track = next((t for t in tracks if any(c.id == target_clip.linked_clip_id for c in t.clips)), None)
        if partner_track and not partner_track.is_locked:
            partner_clip = next(c for c in partner_track.clips if c.id == target_clip.linked_clip_id)
            partner_cut_time = partner_clip.start_time_ms + (cut_time_ms - target_clip.start_time_ms)
            if partner_clip.start_time_ms < partner_cut_time < partner_clip.start_time_ms + partner_clip.duration_ms:
                # Bilateral split both
                target_split = split_single_clip(target_track, target_clip.id, cut_time_ms)
                partner_split = split_single_clip(partner_track, partner_clip.id, partner_cut_time)
                if target_split and partner_split:
                    left_t, right_t = target_split
                    left_p, right_p = partner_split
                    # Cross-link left-to-left and right-to-right
                    left_t.linked_clip_id = left_p.id
                    left_p.linked_clip_id = left_t.id
                    right_t.linked_clip_id = right_p.id
                    right_p.linked_clip_id = right_t.id
                    return {
                        "bilateral": True,
                        "target": (left_t.id, right_t.id),
                        "partner": (left_p.id, right_p.id),
                    }

    # Fallback to single split
    single_split = split_single_clip(target_track, clip_id, cut_time_ms)
    if single_split:
        left_t, right_t = single_split
        right_t.linked_clip_id = None
        return {
            "bilateral": False,
            "target": (left_t.id, right_t.id),
        }
    return None


# ─── Helper Fixtures ───

def create_sample_timeline() -> List[TrackSchema]:
    return [
        TrackSchema(
            id="track-v1",
            track_type="video",
            track_role="video",
            name="Video 1",
            is_locked=False,
            clips=[
                ClipSchema(id="clip-v1", name="Video 1", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000),
                ClipSchema(id="clip-v2", name="Video 2", start_time_ms=5000, duration_ms=3000, source_in_ms=0, source_out_ms=3000),
            ],
        ),
        TrackSchema(
            id="track-a1",
            track_type="audio",
            track_role="dialogue",
            name="Audio 1",
            is_locked=False,
            clips=[
                ClipSchema(id="clip-a1", name="Audio 1", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000),
                ClipSchema(id="clip-a2", name="Audio 2", start_time_ms=5000, duration_ms=3000, source_in_ms=0, source_out_ms=3000),
            ],
        ),
        TrackSchema(
            id="track-a2",
            track_type="audio",
            track_role="music",
            name="Audio 2 (Locked)",
            is_locked=True,
            clips=[
                ClipSchema(id="clip-m1", name="Music 1", start_time_ms=0, duration_ms=8000, source_in_ms=0, source_out_ms=8000),
            ],
        ),
    ]


# ─── TEST SUITE: Phase 42 Clip Grouping & Audio-Video Link / Unlink ───

class TestPhase42ClipGrouping:
    """1. Clip Grouping Operations"""

    def test_group_two_clips_success(self):
        tracks = create_sample_timeline()
        group_id = group_clips(tracks, ["clip-v1", "clip-v2"])
        assert group_id is not None
        v1 = next(c for c in tracks[0].clips if c.id == "clip-v1")
        v2 = next(c for c in tracks[0].clips if c.id == "clip-v2")
        assert v1.group_id == group_id
        assert v2.group_id == group_id

    def test_group_across_multiple_tracks(self):
        tracks = create_sample_timeline()
        group_id = group_clips(tracks, ["clip-v1", "clip-a1"])
        assert group_id is not None
        v1 = next(c for c in tracks[0].clips if c.id == "clip-v1")
        a1 = next(c for c in tracks[1].clips if c.id == "clip-a1")
        assert v1.group_id == group_id
        assert a1.group_id == group_id

    def test_group_single_clip_fails(self):
        tracks = create_sample_timeline()
        result = group_clips(tracks, ["clip-v1"])
        assert result is None

    def test_group_empty_list_fails(self):
        tracks = create_sample_timeline()
        result = group_clips(tracks, [])
        assert result is None

    def test_group_on_locked_track_fails(self):
        tracks = create_sample_timeline()
        result = group_clips(tracks, ["clip-v1", "clip-m1"])
        assert result is None
        m1 = next(c for c in tracks[2].clips if c.id == "clip-m1")
        assert m1.group_id is None

    def test_ungroup_clips_success(self):
        tracks = create_sample_timeline()
        group_id = group_clips(tracks, ["clip-v1", "clip-v2"])
        assert group_id is not None
        ok = ungroup_clips(tracks, ["clip-v1"])
        assert ok is True
        v1 = next(c for c in tracks[0].clips if c.id == "clip-v1")
        v2 = next(c for c in tracks[0].clips if c.id == "clip-v2")
        assert v1.group_id is None
        assert v2.group_id is None

    def test_ungroup_ungrouped_clips_returns_false(self):
        tracks = create_sample_timeline()
        ok = ungroup_clips(tracks, ["clip-v1", "clip-v2"])
        assert ok is False

    def test_ungroup_locked_track_protection(self):
        tracks = create_sample_timeline()
        # Manually force group on locked clip
        tracks[2].clips[0].group_id = "locked-group"
        tracks[0].clips[0].group_id = "locked-group"
        ok = ungroup_clips(tracks, ["clip-v1"])
        assert ok is False
        assert tracks[2].clips[0].group_id == "locked-group"


class TestPhase42AudioVideoLinking:
    """2. Audio-Video Bilateral Clip Linking"""

    def test_link_two_clips_success(self):
        tracks = create_sample_timeline()
        ok = link_clips(tracks, "clip-v1", "clip-a1")
        assert ok is True
        v1 = next(c for c in tracks[0].clips if c.id == "clip-v1")
        a1 = next(c for c in tracks[1].clips if c.id == "clip-a1")
        assert v1.linked_clip_id == "clip-a1"
        assert a1.linked_clip_id == "clip-v1"

    def test_link_same_clip_fails(self):
        tracks = create_sample_timeline()
        ok = link_clips(tracks, "clip-v1", "clip-v1")
        assert ok is False

    def test_link_nonexistent_clip_fails(self):
        tracks = create_sample_timeline()
        ok = link_clips(tracks, "clip-v1", "non-existent")
        assert ok is False

    def test_link_locked_track_fails(self):
        tracks = create_sample_timeline()
        ok = link_clips(tracks, "clip-v1", "clip-m1")
        assert ok is False
        v1 = next(c for c in tracks[0].clips if c.id == "clip-v1")
        assert v1.linked_clip_id is None

    def test_unlink_clips_success(self):
        tracks = create_sample_timeline()
        link_clips(tracks, "clip-v1", "clip-a1")
        ok = unlink_clips(tracks, ["clip-v1"])
        assert ok is True
        v1 = next(c for c in tracks[0].clips if c.id == "clip-v1")
        a1 = next(c for c in tracks[1].clips if c.id == "clip-a1")
        assert v1.linked_clip_id is None
        assert a1.linked_clip_id is None

    def test_unlink_unlinked_clips_returns_false(self):
        tracks = create_sample_timeline()
        ok = unlink_clips(tracks, ["clip-v1"])
        assert ok is False

    def test_unlink_locked_track_protection(self):
        tracks = create_sample_timeline()
        # Manually force link to locked clip
        tracks[0].clips[0].linked_clip_id = "clip-m1"
        tracks[2].clips[0].linked_clip_id = "clip-v1"
        ok = unlink_clips(tracks, ["clip-v1"])
        assert ok is False


class TestPhase42TransitiveDiscovery:
    """3. Transitive Related Clip Discovery"""

    def test_single_unrelated_clip_returns_itself(self):
        tracks = create_sample_timeline()
        related = get_related_clip_ids(tracks, "clip-v1")
        assert related == ["clip-v1"]

    def test_grouped_clips_discovered(self):
        tracks = create_sample_timeline()
        group_clips(tracks, ["clip-v1", "clip-v2"])
        related = get_related_clip_ids(tracks, "clip-v1")
        assert set(related) == {"clip-v1", "clip-v2"}

    def test_linked_clips_discovered(self):
        tracks = create_sample_timeline()
        link_clips(tracks, "clip-v1", "clip-a1")
        related = get_related_clip_ids(tracks, "clip-v1")
        assert set(related) == {"clip-v1", "clip-a1"}

    def test_transitive_group_and_link_discovery(self):
        tracks = create_sample_timeline()
        # v1 and v2 are grouped, v1 is linked to a1
        group_clips(tracks, ["clip-v1", "clip-v2"])
        link_clips(tracks, "clip-v1", "clip-a1")
        related = get_related_clip_ids(tracks, "clip-v2")
        assert set(related) == {"clip-v1", "clip-v2", "clip-a1"}


class TestPhase42CoordinatedMovement:
    """4. Coordinated Clip Movement"""

    def test_move_grouped_clips_together(self):
        tracks = create_sample_timeline()
        group_clips(tracks, ["clip-v1", "clip-v2"])
        ok = move_coordinated_clips(tracks, "clip-v1", 1000)
        assert ok is True
        v1 = next(c for c in tracks[0].clips if c.id == "clip-v1")
        v2 = next(c for c in tracks[0].clips if c.id == "clip-v2")
        assert v1.start_time_ms == 1000
        assert v2.start_time_ms == 6000

    def test_move_linked_clips_together(self):
        tracks = create_sample_timeline()
        link_clips(tracks, "clip-v1", "clip-a1")
        ok = move_coordinated_clips(tracks, "clip-v1", 2000)
        assert ok is True
        v1 = next(c for c in tracks[0].clips if c.id == "clip-v1")
        a1 = next(c for c in tracks[1].clips if c.id == "clip-a1")
        assert v1.start_time_ms == 2000
        assert a1.start_time_ms == 2000

    def test_move_coordinated_boundary_check(self):
        tracks = create_sample_timeline()
        group_clips(tracks, ["clip-v1", "clip-v2"])
        # Delta would make v1 negative (-500)
        ok = move_coordinated_clips(tracks, "clip-v1", -500)
        assert ok is False
        v1 = next(c for c in tracks[0].clips if c.id == "clip-v1")
        assert v1.start_time_ms == 0

    def test_move_coordinated_locked_track_rejection(self):
        tracks = create_sample_timeline()
        tracks[0].clips[0].group_id = "test-g"
        tracks[2].clips[0].group_id = "test-g"
        ok = move_coordinated_clips(tracks, "clip-v1", 1000)
        assert ok is False


class TestPhase42CoordinatedDeletionAndCleanup:
    """5. Coordinated Deletion & Dangling Link Cleanup"""

    def test_delete_clip_cleans_dangling_linked_reference(self):
        tracks = create_sample_timeline()
        link_clips(tracks, "clip-v1", "clip-a1")
        ok = delete_clip_with_linking_cleanup(tracks, "clip-v1")
        assert ok is True
        a1 = next(c for c in tracks[1].clips if c.id == "clip-a1")
        assert a1.linked_clip_id is None

    def test_delete_clip_on_locked_track_fails(self):
        tracks = create_sample_timeline()
        ok = delete_clip_with_linking_cleanup(tracks, "clip-m1")
        assert ok is False
        assert len(tracks[2].clips) == 1


class TestPhase42CoordinatedDuplication:
    """6. Coordinated Duplication of Groups & Links"""

    def test_duplicate_group_preserves_distinct_new_group(self):
        tracks = create_sample_timeline()
        orig_group_id = group_clips(tracks, ["clip-v1", "clip-v2"])
        new_ids = duplicate_clips_with_group_link(tracks, ["clip-v1", "clip-v2"])
        assert len(new_ids) == 2
        new_v1 = next(c for c in tracks[0].clips if c.id == new_ids[0])
        new_v2 = next(c for c in tracks[0].clips if c.id == new_ids[1])
        assert new_v1.group_id is not None
        assert new_v1.group_id == new_v2.group_id
        assert new_v1.group_id != orig_group_id

    def test_duplicate_linked_pair_cross_links_clones(self):
        tracks = create_sample_timeline()
        link_clips(tracks, "clip-v1", "clip-a1")
        new_ids = duplicate_clips_with_group_link(tracks, ["clip-v1", "clip-a1"])
        assert len(new_ids) == 2
        new_v1 = next(c for c in tracks[0].clips if c.id == new_ids[0])
        new_a1 = next(c for c in tracks[1].clips if c.id == new_ids[1])
        assert new_v1.linked_clip_id == new_a1.id
        assert new_a1.linked_clip_id == new_v1.id
        assert new_v1.linked_clip_id != "clip-a1"

    def test_duplicate_single_linked_clip_clears_link(self):
        tracks = create_sample_timeline()
        link_clips(tracks, "clip-v1", "clip-a1")
        new_ids = duplicate_clips_with_group_link(tracks, ["clip-v1"])
        assert len(new_ids) == 1
        new_v1 = next(c for c in tracks[0].clips if c.id == new_ids[0])
        assert new_v1.linked_clip_id is None


class TestPhase42BilateralRazorSplit:
    """7. Symmetrical Bilateral Razor Split"""

    def test_bilateral_razor_splits_both_clips(self):
        tracks = create_sample_timeline()
        link_clips(tracks, "clip-v1", "clip-a1")
        res = razor_cut_bilateral(tracks, "clip-v1", 2000)
        assert res is not None
        assert res["bilateral"] is True
        assert len(tracks[0].clips) == 3  # left_v1, right_v1, v2
        assert len(tracks[1].clips) == 3  # left_a1, right_a1, a2

        left_v_id, right_v_id = res["target"]
        left_a_id, right_a_id = res["partner"]

        left_v = next(c for c in tracks[0].clips if c.id == left_v_id)
        right_v = next(c for c in tracks[0].clips if c.id == right_v_id)
        left_a = next(c for c in tracks[1].clips if c.id == left_a_id)
        right_a = next(c for c in tracks[1].clips if c.id == right_a_id)

        assert left_v.duration_ms == 2000
        assert right_v.duration_ms == 2000
        assert left_a.duration_ms == 2000
        assert right_a.duration_ms == 2000

        # Symmetrical cross-linking: left to left, right to right
        assert left_v.linked_clip_id == left_a.id
        assert left_a.linked_clip_id == left_v.id
        assert right_v.linked_clip_id == right_a.id
        assert right_a.linked_clip_id == right_v.id

    def test_bilateral_razor_preserves_grouping(self):
        tracks = create_sample_timeline()
        group_id = group_clips(tracks, ["clip-v1", "clip-a1"])
        link_clips(tracks, "clip-v1", "clip-a1")
        res = razor_cut_bilateral(tracks, "clip-v1", 1500)
        assert res is not None

        left_v_id, right_v_id = res["target"]
        left_a_id, right_a_id = res["partner"]

        left_v = next(c for c in tracks[0].clips if c.id == left_v_id)
        right_v = next(c for c in tracks[0].clips if c.id == right_v_id)
        left_a = next(c for c in tracks[1].clips if c.id == left_a_id)
        right_a = next(c for c in tracks[1].clips if c.id == right_a_id)

        assert left_v.group_id == group_id
        assert right_v.group_id == group_id
        assert left_a.group_id == group_id
        assert right_a.group_id == group_id

    def test_razor_split_locked_partner_falls_back_to_single_split(self):
        tracks = create_sample_timeline()
        # Link v1 to m1 on locked track
        tracks[0].clips[0].linked_clip_id = "clip-m1"
        tracks[2].clips[0].linked_clip_id = "clip-v1"
        res = razor_cut_bilateral(tracks, "clip-v1", 2000)
        assert res is not None
        assert res["bilateral"] is False
        assert len(tracks[2].clips) == 1  # Locked track untouched


class TestPhase42SyncDriftAndRealignment:
    """8. Sync Drift & In-Sync Realignment"""

    def test_sync_drift_zero_when_aligned(self):
        tracks = create_sample_timeline()
        v1 = tracks[0].clips[0]
        a1 = tracks[1].clips[0]
        drift = calculate_sync_drift(v1, a1)
        assert drift == 0

    def test_sync_drift_calculated_accurately(self):
        tracks = create_sample_timeline()
        v1 = tracks[0].clips[0]
        a1 = tracks[1].clips[0]
        a1.start_time_ms = 250
        drift = calculate_sync_drift(v1, a1)
        assert drift == -250

    def test_realign_linked_clip_restores_sync(self):
        tracks = create_sample_timeline()
        link_clips(tracks, "clip-v1", "clip-a1")
        # Offset audio by +300ms
        tracks[1].clips[0].start_time_ms = 300
        ok = realign_linked_clip(tracks, "clip-a1")
        assert ok is True
        a1 = tracks[1].clips[0]
        v1 = tracks[0].clips[0]
        assert a1.start_time_ms == v1.start_time_ms == 0

    def test_realign_on_locked_track_fails(self):
        tracks = create_sample_timeline()
        tracks[0].clips[0].linked_clip_id = "clip-m1"
        tracks[2].clips[0].linked_clip_id = "clip-v1"
        tracks[2].clips[0].start_time_ms = 500
        # Realigning locked clip-m1 must fail
        ok = realign_linked_clip(tracks, "clip-m1")
        assert ok is False


class TestPhase42SerializationRoundtrip:
    """9. Pydantic Serialization Roundtrip"""

    def test_clip_schema_group_and_link_roundtrip(self):
        data = {
            "name": "Grouped Video",
            "start_time_ms": 1000,
            "duration_ms": 3000,
            "group_id": "test-group-uuid",
            "linked_clip_id": "partner-audio-uuid",
        }
        clip = ClipSchema(**data)
        assert clip.group_id == "test-group-uuid"
        assert clip.linked_clip_id == "partner-audio-uuid"

        exported = clip.model_dump()
        assert exported["group_id"] == "test-group-uuid"
        assert exported["linked_clip_id"] == "partner-audio-uuid"

    def test_timeline_save_request_with_grouped_and_linked_clips(self):
        req_data = {
            "name": "Phase 42 Project",
            "duration_ms": 5000,
            "tracks": [
                {
                    "track_type": "video",
                    "track_role": "video",
                    "name": "V1",
                    "clips": [
                        {
                            "id": "c1",
                            "name": "Clip 1",
                            "start_time_ms": 0,
                            "duration_ms": 5000,
                            "group_id": "grp-1",
                            "linked_clip_id": "c2",
                        }
                    ],
                },
                {
                    "track_type": "audio",
                    "track_role": "dialogue",
                    "name": "A1",
                    "clips": [
                        {
                            "id": "c2",
                            "name": "Clip 2",
                            "start_time_ms": 0,
                            "duration_ms": 5000,
                            "group_id": "grp-1",
                            "linked_clip_id": "c1",
                        }
                    ],
                },
            ],
        }
        save_req = TimelineSaveRequest(**req_data)
        assert len(save_req.tracks) == 2
        assert save_req.tracks[0].clips[0].group_id == "grp-1"
        assert save_req.tracks[0].clips[0].linked_clip_id == "c2"
        assert save_req.tracks[1].clips[0].group_id == "grp-1"
        assert save_req.tracks[1].clips[0].linked_clip_id == "c1"
