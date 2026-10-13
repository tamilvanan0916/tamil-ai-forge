import pytest
import uuid
import copy
from typing import List, Dict, Any, Optional

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


# ─── Pure Algorithm Implementations for Phase 40 Ripple Delete & Gap Management ───

class TimelineGap:
    def __init__(self, track_id: str, start_time_ms: int, duration_ms: int, end_time_ms: int):
        self.track_id = track_id
        self.start_time_ms = start_time_ms
        self.duration_ms = duration_ms
        self.end_time_ms = end_time_ms

    def to_dict(self) -> Dict[str, Any]:
        return {
            "track_id": self.track_id,
            "start_time_ms": self.start_time_ms,
            "duration_ms": self.duration_ms,
            "end_time_ms": self.end_time_ms,
        }


def calculate_track_gaps(track: TrackSchema) -> List[TimelineGap]:
    """Calculates all canonical empty intervals between clips on a track."""
    if not track.clips:
        return []
    sorted_clips = sorted(track.clips, key=lambda c: c.start_time_ms)
    gaps: List[TimelineGap] = []

    # Leading gap before first clip
    if sorted_clips[0].start_time_ms > 0:
        gaps.append(TimelineGap(
            track_id=track.id,
            start_time_ms=0,
            duration_ms=sorted_clips[0].start_time_ms,
            end_time_ms=sorted_clips[0].start_time_ms,
        ))

    # Gaps between consecutive clips
    current_end = sorted_clips[0].start_time_ms + sorted_clips[0].duration_ms
    for i in range(1, len(sorted_clips)):
        next_clip = sorted_clips[i]
        if next_clip.start_time_ms > current_end:
            gap_dur = next_clip.start_time_ms - current_end
            gaps.append(TimelineGap(
                track_id=track.id,
                start_time_ms=current_end,
                duration_ms=gap_dur,
                end_time_ms=next_clip.start_time_ms,
            ))
        current_end = max(current_end, next_clip.start_time_ms + next_clip.duration_ms)

    return gaps


def delete_gap(
    timeline: TimelineStateSchema,
    track_id: str,
    start_ms: int,
    ripple_scope: str = "track",
) -> bool:
    """Closes an identified gap by shifting downstream clips earlier by gap duration."""
    target_track = next((t for t in timeline.tracks if t.id == track_id), None)
    if not target_track:
        return False

    if target_track.is_locked:
        return False

    gaps = calculate_track_gaps(target_track)
    gap = next((g for g in gaps if abs(g.start_time_ms - start_ms) <= 50), None)
    if not gap:
        return False

    shift_ms = gap.duration_ms
    gap_end = gap.end_time_ms

    if ripple_scope == "all":
        # Check if any unlocked track would be affected, abort if locked tracks prevent global ripple
        for track in timeline.tracks:
            if track.is_locked and any(c.start_time_ms >= gap_end - 5 for c in track.clips):
                return False

        for track in timeline.tracks:
            for clip in track.clips:
                if clip.start_time_ms >= gap_end - 5:
                    clip.start_time_ms = max(0, clip.start_time_ms - shift_ms)
            track.clips.sort(key=lambda c: c.start_time_ms)

        # Shift sequence markers
        if timeline.markers:
            for m in timeline.markers:
                if m.time_ms >= gap_end - 5:
                    m.time_ms = max(0, m.time_ms - shift_ms)
    else:
        for clip in target_track.clips:
            if clip.start_time_ms >= gap_end - 5:
                clip.start_time_ms = max(0, clip.start_time_ms - shift_ms)
        target_track.clips.sort(key=lambda c: c.start_time_ms)

    # Recalculate timeline duration
    max_end = 0
    for t in timeline.tracks:
        for c in t.clips:
            max_end = max(max_end, c.start_time_ms + c.duration_ms)
    timeline.duration_ms = max(max_end, 1000)
    return True


def ripple_delete_clip(
    timeline: TimelineStateSchema,
    clip_id: str,
    ripple_scope: str = "track",
) -> bool:
    """Removes a clip and shifts all downstream clips earlier to eliminate the void."""
    target_track = None
    target_clip = None
    for track in timeline.tracks:
        for clip in track.clips:
            if clip.id == clip_id:
                target_track = track
                target_clip = clip
                break
        if target_clip:
            break

    if not target_track or not target_clip:
        return False

    if target_track.is_locked:
        return False

    shift_amount = target_clip.duration_ms
    removed_start = target_clip.start_time_ms

    if ripple_scope == "all":
        for track in timeline.tracks:
            if track.is_locked and any(c.start_time_ms > removed_start for c in track.clips):
                return False

        target_track.clips = [c for c in target_track.clips if c.id != clip_id]
        for track in timeline.tracks:
            for clip in track.clips:
                if clip.start_time_ms > removed_start:
                    clip.start_time_ms = max(0, clip.start_time_ms - shift_amount)
            track.clips.sort(key=lambda c: c.start_time_ms)

        if timeline.markers:
            for m in timeline.markers:
                if m.time_ms > removed_start:
                    m.time_ms = max(0, m.time_ms - shift_amount)
    else:
        target_track.clips = [c for c in target_track.clips if c.id != clip_id]
        for clip in target_track.clips:
            if clip.start_time_ms > removed_start:
                clip.start_time_ms = max(0, clip.start_time_ms - shift_amount)
        target_track.clips.sort(key=lambda c: c.start_time_ms)

    max_end = 0
    for t in timeline.tracks:
        for c in t.clips:
            max_end = max(max_end, c.start_time_ms + c.duration_ms)
    timeline.duration_ms = max(max_end, 1000)
    return True


def ripple_delete_multiple_clips(
    timeline: TimelineStateSchema,
    clip_ids: List[str],
    ripple_scope: str = "track",
) -> bool:
    """Removes multiple clips and coordinates ripple shift per track or sequence."""
    if not clip_ids:
        return False

    # Check for locked tracks
    for track in timeline.tracks:
        if track.is_locked and any(c.id in clip_ids for c in track.clips):
            return False

    # Group clips by track
    clips_to_remove = set(clip_ids)
    changed = False

    for track in timeline.tracks:
        track_clip_ids = [c.id for c in track.clips if c.id in clips_to_remove]
        if not track_clip_ids:
            continue

        # Sort clips descending by start time to shift safely
        track_clips_sorted = sorted(
            [c for c in track.clips if c.id in clips_to_remove],
            key=lambda c: c.start_time_ms,
            reverse=True,
        )

        for c_to_del in track_clips_sorted:
            shift = c_to_del.duration_ms
            c_start = c_to_del.start_time_ms
            track.clips = [c for c in track.clips if c.id != c_to_del.id]
            for c in track.clips:
                if c.start_time_ms > c_start:
                    c.start_time_ms = max(0, c.start_time_ms - shift)
            changed = True

        track.clips.sort(key=lambda c: c.start_time_ms)

    if changed:
        max_end = 0
        for t in timeline.tracks:
            for c in t.clips:
                max_end = max(max_end, c.start_time_ms + c.duration_ms)
        timeline.duration_ms = max(max_end, 1000)

    return changed


# ─── Fixtures ───

@pytest.fixture
def sample_timeline():
    return TimelineStateSchema(
        id="tl-sample",
        project_id="proj-sample",
        tracks=[
            TrackSchema(
                id="t1",
                name="Video Track 1",
                track_type="video",
                track_role="video",
                order_index=0,
                is_locked=False,
                is_visible=True,
                clips=[
                    ClipSchema(
                        id="c1",
                        track_id="t1",
                        name="Intro",
                        start_time_ms=0,
                        duration_ms=2000,
                        source_in_ms=0,
                        source_out_ms=2000,
                        clip_type="video",
                    ),
                    ClipSchema(
                        id="c2",
                        track_id="t1",
                        name="Middle",
                        start_time_ms=3000,  # Gap of 1000ms [2000, 3000]
                        duration_ms=2000,
                        source_in_ms=1000,
                        source_out_ms=3000,
                        clip_type="video",
                    ),
                    ClipSchema(
                        id="c3",
                        track_id="t1",
                        name="Outro",
                        start_time_ms=6000,  # Gap of 1000ms [5000, 6000]
                        duration_ms=2000,
                        source_in_ms=0,
                        source_out_ms=2000,
                        clip_type="video",
                    ),
                ],
            ),
            TrackSchema(
                id="t2",
                name="Audio Track 1",
                track_type="audio",
                track_role="music",
                order_index=1,
                is_locked=False,
                is_visible=True,
                clips=[
                    ClipSchema(
                        id="a1",
                        track_id="t2",
                        name="Soundtrack",
                        start_time_ms=0,
                        duration_ms=8000,
                        source_in_ms=0,
                        source_out_ms=8000,
                        clip_type="audio",
                    ),
                ],
            ),
        ],
        markers=[
            MarkerSchema(id="m1", time_ms=2500, name="Marker 1", color="blue"),
            MarkerSchema(id="m2", time_ms=5500, name="Marker 2", color="red"),
        ],
        duration_ms=8000,
    )


# ─── 1. Gap Detection Unit Tests ───

def test_detect_leading_and_internal_gaps():
    track = TrackSchema(
        id="t-gaps",
        name="Gap Test Track",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[
            ClipSchema(id="c1", track_id="t-gaps", name="C1", start_time_ms=1000, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
            ClipSchema(id="c2", track_id="t-gaps", name="C2", start_time_ms=5000, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
        ]
    )
    gaps = calculate_track_gaps(track)
    assert len(gaps) == 2
    # Leading gap: [0, 1000]
    assert gaps[0].start_time_ms == 0
    assert gaps[0].duration_ms == 1000
    assert gaps[0].end_time_ms == 1000

    # Internal gap: [3000, 5000]
    assert gaps[1].start_time_ms == 3000
    assert gaps[1].duration_ms == 2000
    assert gaps[1].end_time_ms == 5000


def test_zero_gaps_on_touching_clips():
    track = TrackSchema(
        id="t-touch",
        name="Touching Track",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[
            ClipSchema(id="c1", track_id="t-touch", name="C1", start_time_ms=0, duration_ms=3000, source_in_ms=0, source_out_ms=3000, clip_type="video"),
            ClipSchema(id="c2", track_id="t-touch", name="C2", start_time_ms=3000, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
        ]
    )
    gaps = calculate_track_gaps(track)
    assert len(gaps) == 0


def test_zero_gaps_on_empty_track():
    track = TrackSchema(id="t-empty", name="Empty", track_type="video", track_role="video", order_index=0, clips=[])
    gaps = calculate_track_gaps(track)
    assert len(gaps) == 0


def test_single_clip_at_zero_has_no_gaps():
    track = TrackSchema(
        id="t-single",
        name="Single",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[ClipSchema(id="c1", track_id="t-single", name="C1", start_time_ms=0, duration_ms=5000, source_in_ms=0, source_out_ms=5000, clip_type="video")]
    )
    gaps = calculate_track_gaps(track)
    assert len(gaps) == 0


# ─── 2. Delete Gap / Close Gap Tests ───

def test_delete_internal_gap_shifts_downstream_clips(sample_timeline):
    # Track 1 has gaps at [2000, 3000] (1000ms) and [5000, 6000] (1000ms)
    ok = delete_gap(sample_timeline, "t1", 2000, ripple_scope="track")
    assert ok is True

    t1 = next(t for t in sample_timeline.tracks if t.id == "t1")
    c1 = next(c for c in t1.clips if c.id == "c1")
    c2 = next(c for c in t1.clips if c.id == "c2")
    c3 = next(c for c in t1.clips if c.id == "c3")

    # c1 is upstream: untouched at start 0, duration 2000
    assert c1.start_time_ms == 0
    assert c1.duration_ms == 2000

    # c2 was at 3000, now shifted by 1000ms to 2000 (now touching c1!)
    assert c2.start_time_ms == 2000
    assert c2.duration_ms == 2000

    # c3 was at 6000, shifted by 1000ms to 5000
    assert c3.start_time_ms == 5000
    assert c3.duration_ms == 2000

    # Audio track t2 was untouched because ripple_scope='track'
    t2 = next(t for t in sample_timeline.tracks if t.id == "t2")
    assert t2.clips[0].start_time_ms == 0
    assert t2.clips[0].duration_ms == 8000


def test_delete_leading_gap():
    tl = TimelineStateSchema(
        id="tl-lead",
        project_id="proj-lead",
        tracks=[
            TrackSchema(
                id="t1",
                name="V1",
                track_type="video",
                track_role="video",
                order_index=0,
                clips=[
                    ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=2500, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
                    ClipSchema(id="c2", track_id="t1", name="C2", start_time_ms=5500, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
                ]
            )
        ],
        duration_ms=7500,
    )
    ok = delete_gap(tl, "t1", 0, ripple_scope="track")
    assert ok is True

    t1 = tl.tracks[0]
    assert t1.clips[0].start_time_ms == 0  # 2500 - 2500
    assert t1.clips[1].start_time_ms == 3000  # 5500 - 2500


def test_delete_gap_all_tracks_and_markers(sample_timeline):
    # Close gap [2000, 3000] with ripple_scope='all'
    ok = delete_gap(sample_timeline, "t1", 2000, ripple_scope="all")
    assert ok is True

    # Marker m1 was at 2500 (inside gap), marker m2 was at 5500
    m2 = next(m for m in sample_timeline.markers if m.id == "m2")
    assert m2.time_ms == 4500  # 5500 - 1000ms


def test_delete_gap_on_locked_track_fails(sample_timeline):
    sample_timeline.tracks[0].is_locked = True
    ok = delete_gap(sample_timeline, "t1", 2000, ripple_scope="track")
    assert ok is False
    # No clips modified
    assert sample_timeline.tracks[0].clips[1].start_time_ms == 3000


def test_delete_gap_nonexistent_returns_false(sample_timeline):
    ok = delete_gap(sample_timeline, "t1", 99999, ripple_scope="track")
    assert ok is False


# ─── 3. Single Clip Ripple Delete Tests ───

def test_ripple_delete_single_clip_middle(sample_timeline):
    # c1: [0, 2000], c2: [3000, 5000], c3: [6000, 8000]
    ok = ripple_delete_clip(sample_timeline, "c2", ripple_scope="track")
    assert ok is True

    t1 = sample_timeline.tracks[0]
    assert len(t1.clips) == 2
    c1 = next(c for c in t1.clips if c.id == "c1")
    c3 = next(c for c in t1.clips if c.id == "c3")

    # c1 untouched
    assert c1.start_time_ms == 0
    # c3 shifted earlier by c2 duration (2000ms): was 6000, now 4000
    assert c3.start_time_ms == 4000
    assert c3.duration_ms == 2000


def test_ripple_delete_first_clip(sample_timeline):
    ok = ripple_delete_clip(sample_timeline, "c1", ripple_scope="track")
    assert ok is True

    t1 = sample_timeline.tracks[0]
    assert len(t1.clips) == 2
    c2 = next(c for c in t1.clips if c.id == "c2")
    c3 = next(c for c in t1.clips if c.id == "c3")

    # c2 was at 3000, shifted earlier by c1 duration (2000ms): now 1000
    assert c2.start_time_ms == 1000
    # c3 was at 6000, shifted earlier by 2000ms: now 4000
    assert c3.start_time_ms == 4000


def test_ripple_delete_last_clip(sample_timeline):
    ok = ripple_delete_clip(sample_timeline, "c3", ripple_scope="track")
    assert ok is True

    t1 = sample_timeline.tracks[0]
    assert len(t1.clips) == 2
    # c1 and c2 untouched
    assert t1.clips[0].start_time_ms == 0
    assert t1.clips[1].start_time_ms == 3000


def test_ripple_delete_on_locked_track_fails(sample_timeline):
    sample_timeline.tracks[0].is_locked = True
    ok = ripple_delete_clip(sample_timeline, "c2", ripple_scope="track")
    assert ok is False
    # Clip was NOT deleted
    assert len(sample_timeline.tracks[0].clips) == 3


def test_ripple_delete_nonexistent_clip_fails(sample_timeline):
    ok = ripple_delete_clip(sample_timeline, "c_unknown", ripple_scope="track")
    assert ok is False


# ─── 4. Multi-Clip Ripple Delete Tests ───

def test_ripple_delete_multiple_clips_same_track(sample_timeline):
    # Delete c1 (2000ms) and c2 (2000ms) together
    ok = ripple_delete_multiple_clips(sample_timeline, ["c1", "c2"], ripple_scope="track")
    assert ok is True

    t1 = sample_timeline.tracks[0]
    assert len(t1.clips) == 1
    c3 = t1.clips[0]
    # c3 was at 6000, shifted earlier by 4000ms: now 2000
    assert c3.start_time_ms == 2000


def test_ripple_delete_multiple_clips_across_tracks():
    tl = TimelineStateSchema(
        id="tl-multi",
        project_id="proj-multi",
        tracks=[
            TrackSchema(
                id="t1",
                name="V1",
                track_type="video",
                track_role="video",
                order_index=0,
                clips=[
                    ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
                    ClipSchema(id="c2", track_id="t1", name="C2", start_time_ms=2000, duration_ms=3000, source_in_ms=0, source_out_ms=3000, clip_type="video"),
                    ClipSchema(id="c3", track_id="t1", name="C3", start_time_ms=5000, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
                ]
            ),
            TrackSchema(
                id="t2",
                name="A1",
                track_type="audio",
                track_role="music",
                order_index=1,
                clips=[
                    ClipSchema(id="a1", track_id="t2", name="A1", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000, clip_type="audio"),
                    ClipSchema(id="a2", track_id="t2", name="A2", start_time_ms=4000, duration_ms=4000, source_in_ms=0, source_out_ms=4000, clip_type="audio"),
                ]
            )
        ],
        duration_ms=8000,
    )
    # Ripple delete c2 from t1 and a1 from t2
    ok = ripple_delete_multiple_clips(tl, ["c2", "a1"], ripple_scope="track")
    assert ok is True

    # t1: c1 at 0, c3 shifted from 5000 to 2000
    assert len(tl.tracks[0].clips) == 2
    assert tl.tracks[0].clips[1].start_time_ms == 2000

    # t2: a1 deleted, a2 shifted from 4000 to 0
    assert len(tl.tracks[1].clips) == 1
    assert tl.tracks[1].clips[0].start_time_ms == 0


def test_ripple_delete_multi_clips_fails_if_any_track_locked(sample_timeline):
    sample_timeline.tracks[0].is_locked = True
    ok = ripple_delete_multiple_clips(sample_timeline, ["c1", "a1"])
    assert ok is False


# ─── 5. Distinct Normal Delete vs Ripple Delete ───

def test_normal_delete_leaves_gap_intact(sample_timeline):
    # Normal delete simply removes clip without shifting downstream clips
    t1 = sample_timeline.tracks[0]
    t1.clips = [c for c in t1.clips if c.id != "c2"]

    # c3 remains at 6000ms
    c3 = next(c for c in t1.clips if c.id == "c3")
    assert c3.start_time_ms == 6000

    # Now a large gap exists between c1 (ends at 2000) and c3 (starts at 6000): 4000ms gap
    gaps = calculate_track_gaps(t1)
    assert len(gaps) == 1
    assert gaps[0].start_time_ms == 2000
    assert gaps[0].duration_ms == 4000


# ─── 6. Preservation of Clip Properties During Ripple Delete ───

def test_downstream_clip_properties_fully_preserved():
    kf = KeyframeSchema(id="kf1", property_path="volume", time_offset_ms=500, value=0.5, interpolation="linear")
    marker = MarkerSchema(id="cm1", time_ms=300, name="Beat", color="yellow")
    effect = EffectSchema(id="ef1", effect_type="blur", effect_category="vfx", parameters={"radius": 5})

    track = TrackSchema(
        id="t-props",
        name="Props Track",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[
            ClipSchema(id="c1", track_id="t-props", name="C1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
            ClipSchema(
                id="c2",
                track_id="t-props",
                name="Complex Clip",
                start_time_ms=4000,
                duration_ms=3000,
                source_in_ms=1000,
                source_out_ms=4000,
                speed_factor=1.5,
                is_reversed=True,
                is_frozen=True,
                freeze_at_ms=500,
                freeze_duration_ms=1000,
                is_frame_hold=False,
                is_compound=True,
                keyframes=[kf],
                markers=[marker],
                effects=[effect],
                clip_type="video",
            )
        ]
    )
    tl = TimelineStateSchema(id="tl-props", project_id="proj-props", tracks=[track], duration_ms=7000)

    # Ripple delete c1
    ok = ripple_delete_clip(tl, "c1", ripple_scope="track")
    assert ok is True

    c2 = tl.tracks[0].clips[0]
    # start_time_ms shifted from 4000 to 2000 (shifted by 2000ms)
    assert c2.start_time_ms == 2000
    # Everything else completely preserved
    assert c2.duration_ms == 3000
    assert c2.source_in_ms == 1000
    assert c2.source_out_ms == 4000
    assert c2.speed_factor == 1.5
    assert c2.is_reversed is True
    assert c2.is_frozen is True
    assert c2.freeze_at_ms == 500
    assert c2.freeze_duration_ms == 1000
    assert c2.is_compound is True
    assert len(c2.keyframes) == 1
    assert c2.keyframes[0].id == "kf1"
    assert len(c2.markers) == 1
    assert c2.markers[0].id == "cm1"
    assert len(c2.effects) == 1
    assert c2.effects[0].id == "ef1"


# ─── 7. Hand-off to Phase 39 Rolling Edit ───

def test_closing_gap_enables_rolling_edit():
    track = TrackSchema(
        id="t-handoff",
        name="Handoff Track",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[
            ClipSchema(id="c1", track_id="t-handoff", name="C1", start_time_ms=0, duration_ms=3000, source_in_ms=0, source_out_ms=3000, clip_type="video"),
            ClipSchema(id="c2", track_id="t-handoff", name="C2", start_time_ms=4500, duration_ms=3000, source_in_ms=0, source_out_ms=3000, clip_type="video"),
        ]
    )
    tl = TimelineStateSchema(id="tl-handoff", project_id="proj-handoff", tracks=[track], duration_ms=7500)

    # Initially clips are separated by a 1500ms gap ([3000, 4500])
    is_adjacent_before = abs((track.clips[0].start_time_ms + track.clips[0].duration_ms) - track.clips[1].start_time_ms) <= 5
    assert is_adjacent_before is False

    # Close gap
    ok = delete_gap(tl, "t-handoff", 3000, ripple_scope="track")
    assert ok is True

    # Now clips are touching adjacent!
    c1 = tl.tracks[0].clips[0]
    c2 = tl.tracks[0].clips[1]
    assert c1.start_time_ms + c1.duration_ms == c2.start_time_ms
    assert c2.start_time_ms == 3000

    is_adjacent_after = abs((c1.start_time_ms + c1.duration_ms) - c2.start_time_ms) <= 5
    assert is_adjacent_after is True


# ─── 8. Serialization & Schema Roundtrip ───

def test_pydantic_schema_roundtrip_with_gaps(sample_timeline):
    gaps_t1 = calculate_track_gaps(sample_timeline.tracks[0])
    assert len(gaps_t1) == 2

    # Serialize to JSON dict
    serialized = sample_timeline.model_dump()
    assert "tracks" in serialized
    assert len(serialized["tracks"]) == 2

    # Reconstruct from JSON dict
    reconstructed = TimelineStateSchema.model_validate(serialized)
    assert len(reconstructed.tracks) == 2
    assert reconstructed.tracks[0].clips[1].start_time_ms == 3000

    gaps_reconstructed = calculate_track_gaps(reconstructed.tracks[0])
    assert len(gaps_reconstructed) == 2
    assert gaps_reconstructed[0].duration_ms == 1000
    assert gaps_reconstructed[1].duration_ms == 1000


def test_timeline_service_save_and_reopen_gap_state(tmp_path):
    # Verify timeline save request compatibility
    request = TimelineSaveRequest(
        project_id="proj-p40",
        tracks=[
            TrackSchema(
                id="t1",
                name="Track 1",
                track_type="video",
                track_role="video",
                order_index=0,
                clips=[
                    ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
                    ClipSchema(id="c2", track_id="t1", name="C2", start_time_ms=5000, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
                ]
            )
        ],
        markers=[],
        duration_ms=7000,
    )
    dumped = request.model_dump()
    assert len(dumped["tracks"][0]["clips"]) == 2
    gaps = calculate_track_gaps(request.tracks[0])
    assert len(gaps) == 1
    assert gaps[0].start_time_ms == 2000
    assert gaps[0].duration_ms == 3000


# ─── 9. Additional Advanced Edge Cases & State Invariants ───

def test_delete_gap_creates_zero_residual_time():
    track = TrackSchema(
        id="t-res",
        name="Residual Track",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[
            ClipSchema(id="c1", track_id="t-res", name="C1", start_time_ms=0, duration_ms=1500, source_in_ms=0, source_out_ms=1500, clip_type="video"),
            ClipSchema(id="c2", track_id="t-res", name="C2", start_time_ms=2750, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
        ]
    )
    tl = TimelineStateSchema(id="tl-res", project_id="p-res", tracks=[track], duration_ms=5000)
    gaps = calculate_track_gaps(track)
    assert len(gaps) == 1
    assert gaps[0].duration_ms == 1250

    ok = delete_gap(tl, "t-res", 1500, ripple_scope="track")
    assert ok is True
    # The gap is completely closed
    gaps_after = calculate_track_gaps(tl.tracks[0])
    assert len(gaps_after) == 0
    assert tl.tracks[0].clips[1].start_time_ms == 1500


def test_ripple_delete_preserves_audio_waveforms_and_pan():
    track = TrackSchema(
        id="t-audio",
        name="Dialogue",
        track_type="audio",
        track_role="dialogue",
        order_index=0,
        clips=[
            ClipSchema(id="a1", track_id="t-audio", name="Line 1", start_time_ms=0, duration_ms=3000, source_in_ms=0, source_out_ms=3000, clip_type="audio"),
            ClipSchema(id="a2", track_id="t-audio", name="Line 2", start_time_ms=4000, duration_ms=2500, source_in_ms=500, source_out_ms=3000, volume_db=2.5, metadata_info={"pan": -0.5}, clip_type="audio"),
        ]
    )
    tl = TimelineStateSchema(id="tl-aud", project_id="p-aud", tracks=[track], duration_ms=7000)

    ok = ripple_delete_clip(tl, "a1", ripple_scope="track")
    assert ok is True

    surviving = tl.tracks[0].clips[0]
    assert surviving.id == "a2"
    assert surviving.start_time_ms == 1000  # 4000 - 3000ms
    assert surviving.duration_ms == 2500
    assert surviving.volume_db == 2.5
    assert surviving.metadata_info["pan"] == -0.5


def test_ripple_delete_compound_clip_nested_hierarchy_invariant():
    nested_track = TrackSchema(
        id="nt1",
        name="Nested Video",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[ClipSchema(id="nc1", track_id="nt1", name="Inside 1", start_time_ms=0, duration_ms=4000, source_in_ms=0, source_out_ms=4000, clip_type="video")]
    )
    compound = ClipSchema(
        id="comp1",
        track_id="t-main",
        name="Compound 1",
        start_time_ms=0,
        duration_ms=4000,
        source_in_ms=0,
        source_out_ms=4000,
        is_compound=True,
        nested_tracks=[nested_track],
        clip_type="video",
    )
    clip_after = ClipSchema(
        id="c_after",
        track_id="t-main",
        name="Regular Clip",
        start_time_ms=5000,
        duration_ms=3000,
        source_in_ms=0,
        source_out_ms=3000,
        clip_type="video",
    )
    track = TrackSchema(id="t-main", name="Main V", track_type="video", track_role="video", order_index=0, clips=[compound, clip_after])
    tl = TimelineStateSchema(id="tl-comp", project_id="p-comp", tracks=[track], duration_ms=9000)

    # Ripple delete compound clip
    ok = ripple_delete_clip(tl, "comp1", ripple_scope="track")
    assert ok is True

    assert len(tl.tracks[0].clips) == 1
    # regular clip shifted by compound's 4000ms duration: was 5000, now 1000
    assert tl.tracks[0].clips[0].start_time_ms == 1000


def test_multi_gap_consecutive_deletions():
    track = TrackSchema(
        id="t-mg",
        name="Multi Gap",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[
            ClipSchema(id="c1", track_id="t-mg", name="C1", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=1000, clip_type="video"),
            ClipSchema(id="c2", track_id="t-mg", name="C2", start_time_ms=2000, duration_ms=1000, source_in_ms=0, source_out_ms=1000, clip_type="video"),
            ClipSchema(id="c3", track_id="t-mg", name="C3", start_time_ms=4000, duration_ms=1000, source_in_ms=0, source_out_ms=1000, clip_type="video"),
        ]
    )
    tl = TimelineStateSchema(id="tl-mg", project_id="p-mg", tracks=[track], duration_ms=6000)

    # Two gaps: [1000, 2000] and [3000, 4000]
    gaps1 = calculate_track_gaps(tl.tracks[0])
    assert len(gaps1) == 2

    # Delete first gap
    ok1 = delete_gap(tl, "t-mg", 1000, ripple_scope="track")
    assert ok1 is True
    # Now c1: [0, 1000], c2: [1000, 2000], c3: [3000, 4000]
    assert tl.tracks[0].clips[1].start_time_ms == 1000
    assert tl.tracks[0].clips[2].start_time_ms == 3000

    # Remaining gap: [2000, 3000]
    gaps2 = calculate_track_gaps(tl.tracks[0])
    assert len(gaps2) == 1
    assert gaps2[0].start_time_ms == 2000

    # Delete second gap
    ok2 = delete_gap(tl, "t-mg", 2000, ripple_scope="track")
    assert ok2 is True
    # Now all three clips are seamlessly contiguous: [0, 1000], [1000, 2000], [2000, 3000]
    assert tl.tracks[0].clips[0].start_time_ms == 0
    assert tl.tracks[0].clips[1].start_time_ms == 1000
    assert tl.tracks[0].clips[2].start_time_ms == 2000
    assert len(calculate_track_gaps(tl.tracks[0])) == 0


def test_delete_gap_preserves_other_tracks_in_track_mode():
    t1 = TrackSchema(
        id="t1",
        name="V1",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[
            ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
            ClipSchema(id="c2", track_id="t1", name="C2", start_time_ms=4000, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
        ]
    )
    t2 = TrackSchema(
        id="t2",
        name="V2",
        track_type="video",
        track_role="video",
        order_index=1,
        clips=[
            ClipSchema(id="c3", track_id="t2", name="C3", start_time_ms=3000, duration_ms=3000, source_in_ms=0, source_out_ms=3000, clip_type="video"),
        ]
    )
    tl = TimelineStateSchema(id="tl-isol", project_id="p-isol", tracks=[t1, t2], duration_ms=8000)

    # Delete gap on t1 only
    ok = delete_gap(tl, "t1", 2000, ripple_scope="track")
    assert ok is True

    # t1 clip c2 shifted
    assert tl.tracks[0].clips[1].start_time_ms == 2000
    # t2 clip c3 strictly untouched
    assert tl.tracks[1].clips[0].start_time_ms == 3000


def test_undo_redo_gap_closure_simulation():
    track = TrackSchema(
        id="t1",
        name="V1",
        track_type="video",
        track_role="video",
        order_index=0,
        clips=[
            ClipSchema(id="c1", track_id="t1", name="C1", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
            ClipSchema(id="c2", track_id="t1", name="C2", start_time_ms=5000, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video"),
        ]
    )
    tl = TimelineStateSchema(id="tl-undo", project_id="p-undo", tracks=[track], duration_ms=8000)

    history_stack = [copy.deepcopy(tl)]
    delete_gap(tl, "t1", 2000, ripple_scope="track")
    history_stack.append(copy.deepcopy(tl))

    # Before closure (initial state)
    state_before = history_stack[0]
    assert state_before.tracks[0].clips[1].start_time_ms == 5000
    assert len(calculate_track_gaps(state_before.tracks[0])) == 1

    # After closure
    state_after = history_stack[1]
    assert state_after.tracks[0].clips[1].start_time_ms == 2000
    assert len(calculate_track_gaps(state_after.tracks[0])) == 0


def test_empty_track_gap_delete_noop():
    track = TrackSchema(id="t-empty", name="Empty", track_type="video", track_role="video", order_index=0, clips=[])
    tl = TimelineStateSchema(id="tl-empty", project_id="p-empty", tracks=[track], duration_ms=1000)
    ok = delete_gap(tl, "t-empty", 0)
    assert ok is False


def test_ripple_delete_single_clip_preserves_speed_and_reverse():
    c1 = ClipSchema(id="c1", name="Intro", start_time_ms=0, duration_ms=2000, source_in_ms=0, source_out_ms=2000, clip_type="video")
    c2 = ClipSchema(
        id="c2",
        name="Fast Reverse",
        start_time_ms=3000,
        duration_ms=2000,
        source_in_ms=0,
        source_out_ms=2000,
        speed_factor=2.0,
        is_reversed=True,
        clip_type="video",
    )
    track = TrackSchema(id="t1", name="V1", track_type="video", track_role="video", order_index=0, clips=[c1, c2])
    tl = TimelineStateSchema(id="tl-speed", project_id="p-speed", tracks=[track], duration_ms=6000)

    ok = ripple_delete_clip(tl, "c1", ripple_scope="track")
    assert ok is True

    survivor = tl.tracks[0].clips[0]
    assert survivor.id == "c2"
    assert survivor.start_time_ms == 1000  # 3000 - 2000ms
    assert survivor.speed_factor == 2.0
    assert survivor.is_reversed is True


def test_ripple_delete_selected_clips_preserves_order():
    c1 = ClipSchema(id="c1", name="C1", start_time_ms=0, duration_ms=1000, source_in_ms=0, source_out_ms=1000, clip_type="video")
    c2 = ClipSchema(id="c2", name="C2", start_time_ms=1000, duration_ms=1000, source_in_ms=0, source_out_ms=1000, clip_type="video")
    c3 = ClipSchema(id="c3", name="C3", start_time_ms=2000, duration_ms=1000, source_in_ms=0, source_out_ms=1000, clip_type="video")
    c4 = ClipSchema(id="c4", name="C4", start_time_ms=3000, duration_ms=1000, source_in_ms=0, source_out_ms=1000, clip_type="video")
    track = TrackSchema(id="t1", name="V1", track_type="video", track_role="video", order_index=0, clips=[c1, c2, c3, c4])
    tl = TimelineStateSchema(id="tl-ord", project_id="p-ord", tracks=[track], duration_ms=5000)

    # Ripple delete c2 and c3
    ok = ripple_delete_multiple_clips(tl, ["c2", "c3"], ripple_scope="track")
    assert ok is True

    assert len(tl.tracks[0].clips) == 2
    assert tl.tracks[0].clips[0].id == "c1"
    assert tl.tracks[0].clips[0].start_time_ms == 0
    assert tl.tracks[0].clips[1].id == "c4"
    assert tl.tracks[0].clips[1].start_time_ms == 1000  # Shifted from 3000 by 2000ms

