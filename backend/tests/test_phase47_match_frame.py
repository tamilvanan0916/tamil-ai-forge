import pytest
import uuid
import copy
import sys
import os
from typing import List, Dict, Any, Optional, Tuple

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.schemas.timeline import (
    TrackSchema,
    ClipSchema,
    TimelineStateSchema,
    TimelineSaveRequest,
    MarkerSchema,
)


# ─── Mock Classes for Phase 47 Match Frame Engine ───

class MockAsset:
    def __init__(
        self,
        asset_id: str = "asset-1",
        file_name: str = "raw_take.mp4",
        asset_type: str = "video",
        duration_ms: int = 15000,
        storage_key: str = "/storage/assets/raw_take.mp4",
    ):
        self.id = asset_id
        self.file_name = file_name
        self.asset_type = asset_type
        self.duration_ms = duration_ms
        self.storage_key = storage_key


class MatchFrameEngine:
    """
    Python reference model for Phase 47 Match Frame and Bi-Directional
    Source-Timeline media navigation, mirroring frontend/src/stores/useTimelineStore.ts.
    """
    def __init__(self, timeline: TimelineStateSchema, assets: Optional[List[MockAsset]] = None):
        self.timeline = timeline
        self.assets: Dict[str, MockAsset] = {a.id: a for a in (assets or [])}
        self.playhead_ms: int = 0
        self.selected_clip_id: Optional[str] = None
        self.target_video_track_id: Optional[str] = None
        self.target_audio_track_id: Optional[str] = None
        self.highlighted_asset_id: Optional[str] = None

        # Source Monitor State
        self.source_asset: Optional[MockAsset] = None
        self.source_playhead_ms: int = 0
        self.source_in_point_ms: Optional[int] = None
        self.source_out_point_ms: Optional[int] = None
        self.active_monitor_focus: str = "program"
        self.history_snapshots: List[Dict[str, Any]] = []

    def set_playhead(self, ms: int):
        self.playhead_ms = max(0, ms)

    def select_clip(self, clip_id: Optional[str]):
        self.selected_clip_id = clip_id

    def set_target_tracks(self, video_track_id: Optional[str], audio_track_id: Optional[str]):
        self.target_video_track_id = video_track_id
        self.target_audio_track_id = audio_track_id

    def set_highlighted_asset(self, asset_id: Optional[str]):
        self.highlighted_asset_id = asset_id

    # ── Match Frame (Timeline -> Source Monitor) ──
    def match_frame(self, options: Optional[Any] = None) -> bool:
        opts: Dict[str, Any] = {}
        if isinstance(options, str):
            opts = {"clipId": options}
        elif isinstance(options, dict):
            opts = options

        target_clip: Optional[ClipSchema] = None
        target_track: Optional[TrackSchema] = None

        # 1. If explicit clipId or currently selected clip
        candidate_clip_id = opts.get("clipId") or self.selected_clip_id
        if candidate_clip_id:
            for t in self.timeline.tracks:
                for c in t.clips:
                    if c.id == candidate_clip_id:
                        target_clip = c
                        target_track = t
                        break
                if target_clip:
                    break

        # 2. If explicit trackId provided in options
        if not target_clip and opts.get("trackId"):
            track_id = opts["trackId"]
            for t in self.timeline.tracks:
                if t.id == track_id:
                    for c in t.clips:
                        if self.playhead_ms >= c.start_time_ms and self.playhead_ms < c.start_time_ms + c.duration_ms:
                            target_clip = c
                            target_track = t
                            break
                    break

        # 3. Check patched video destination track [V1]
        if not target_clip and self.target_video_track_id:
            for t in self.timeline.tracks:
                if t.id == self.target_video_track_id:
                    for c in t.clips:
                        if self.playhead_ms >= c.start_time_ms and self.playhead_ms < c.start_time_ms + c.duration_ms:
                            target_clip = c
                            target_track = t
                            break
                    break

        # 4. Check patched audio destination track [A1]
        if not target_clip and self.target_audio_track_id:
            for t in self.timeline.tracks:
                if t.id == self.target_audio_track_id:
                    for c in t.clips:
                        if self.playhead_ms >= c.start_time_ms and self.playhead_ms < c.start_time_ms + c.duration_ms:
                            target_clip = c
                            target_track = t
                            break
                    break

        # 5. Fallback: inspect video tracks (order index ascending), then audio
        if not target_clip:
            sorted_tracks = sorted(
                self.timeline.tracks,
                key=lambda x: (0 if x.track_type == 'video' else 1, x.order_index)
            )
            for t in sorted_tracks:
                for c in t.clips:
                    if self.playhead_ms >= c.start_time_ms and self.playhead_ms < c.start_time_ms + c.duration_ms:
                        target_clip = c
                        target_track = t
                        break
                if target_clip:
                    break

        if not target_clip or not getattr(target_clip, 'asset_id', None):
            return False

        # Find or synthesize asset
        asset = self.assets.get(target_clip.asset_id)
        if not asset:
            dur = getattr(target_clip, 'source_out_ms', None) or target_clip.duration_ms or 4000
            asset = MockAsset(
                asset_id=target_clip.asset_id,
                file_name=target_clip.name or "Matched Asset",
                asset_type="audio" if getattr(target_track, 'track_type', 'video') == 'audio' else "video",
                duration_ms=dur,
            )
            self.assets[asset.id] = asset

        # Frame-accurate calculation
        speed = target_clip.speed_factor if getattr(target_clip, 'speed_factor', 1.0) and target_clip.speed_factor > 0 else 1.0
        offset_ms = 0.0
        if self.playhead_ms >= target_clip.start_time_ms and self.playhead_ms <= target_clip.start_time_ms + target_clip.duration_ms:
            offset_ms = (self.playhead_ms - target_clip.start_time_ms) * speed

        source_in = getattr(target_clip, 'source_in_ms', 0) or 0
        source_out = getattr(target_clip, 'source_out_ms', None) or (target_clip.duration_ms or 4000)

        if getattr(target_clip, 'is_reversed', False):
            target_source_playhead = source_out - offset_ms
        else:
            target_source_playhead = source_in + offset_ms

        max_dur = asset.duration_ms or source_out or 60000
        target_source_playhead = max(0, min(target_source_playhead, max_dur))

        # Update Source Monitor
        self.source_asset = asset
        self.source_playhead_ms = round(target_source_playhead)
        self.source_in_point_ms = source_in
        self.source_out_point_ms = source_out
        self.active_monitor_focus = "source"
        return True

    # ── Reverse Match Frame (Source Monitor -> Timeline Sequence) ──
    def reverse_match_frame(self) -> bool:
        if not self.source_asset:
            return False

        matching_clips: List[Tuple[ClipSchema, TrackSchema, float]] = []
        for t in self.timeline.tracks:
            for c in t.clips:
                if getattr(c, 'asset_id', None) == self.source_asset.id:
                    s_in = getattr(c, 'source_in_ms', 0) or 0
                    s_out = getattr(c, 'source_out_ms', None) or (c.duration_ms or 4000)
                    speed = c.speed_factor if getattr(c, 'speed_factor', 1.0) and c.speed_factor > 0 else 1.0

                    if self.source_playhead_ms >= s_in and self.source_playhead_ms <= s_out:
                        if getattr(c, 'is_reversed', False):
                            offset_in_clip = (s_out - self.source_playhead_ms) / speed
                        else:
                            offset_in_clip = (self.source_playhead_ms - s_in) / speed
                        seq_time = c.start_time_ms + offset_in_clip
                        matching_clips.append((c, t, seq_time))
                    else:
                        matching_clips.append((c, t, float(c.start_time_ms)))

        if not matching_clips:
            return False

        matching_clips.sort(key=lambda m: m[2])

        # Cycle to the next match chronologically after current playhead
        next_match = None
        for m in matching_clips:
            if m[2] > self.playhead_ms + 50:
                next_match = m
                break
        if not next_match:
            next_match = matching_clips[0]

        self.playhead_ms = round(next_match[2])
        self.selected_clip_id = next_match[0].id
        self.active_monitor_focus = "program"
        return True

    # ── Find Asset Occurrences & Timeline Usage ──
    def find_asset_timeline_occurrences(self, asset_id: str) -> List[Dict[str, Any]]:
        occurrences = []
        for t in self.timeline.tracks:
            for c in t.clips:
                if getattr(c, 'asset_id', None) == asset_id:
                    occurrences.append({
                        "clipId": c.id,
                        "clipName": c.name,
                        "trackId": t.id,
                        "trackName": t.name,
                        "trackType": t.track_type,
                        "startMs": c.start_time_ms,
                        "durationMs": c.duration_ms,
                        "sourceInMs": getattr(c, 'source_in_ms', 0) or 0,
                        "sourceOutMs": getattr(c, 'source_out_ms', None) or c.duration_ms,
                    })
        occurrences.sort(key=lambda x: x["startMs"])
        return occurrences

    def jump_to_timeline_occurrence(self, clip_id: str) -> bool:
        for t in self.timeline.tracks:
            for c in t.clips:
                if c.id == clip_id:
                    self.set_playhead(c.start_time_ms)
                    self.select_clip(c.id)
                    self.active_monitor_focus = "program"
                    return True
        return False


# ─── Fixtures ───

@pytest.fixture
def base_assets():
    return [
        MockAsset("asset-video-1", "Hero_Shot.mp4", "video", 30000),
        MockAsset("asset-video-2", "B_Roll_Park.mp4", "video", 20000),
        MockAsset("asset-audio-1", "Dialogue_Take1.wav", "audio", 45000),
        MockAsset("asset-unused", "Unused_Interview.mp4", "video", 10000),
    ]

@pytest.fixture
def multi_track_timeline(base_assets):
    v1 = TrackSchema(
        id="track-v1",
        timeline_id="tl-1",
        name="V1",
        track_type="video",
        track_role="video",
        order_index=0,
        is_muted=False,
        is_locked=False,
        is_visible=True,
        is_solo=False,
        volume_db=0.0,
        pan=0.0,
        height_px=64,
        clips=[
            ClipSchema(
                id="clip-v1-1",
                track_id="track-v1",
                asset_id="asset-video-1",
                name="Hero Shot Take 1",
                clip_type="media",
                start_time_ms=0,
                duration_ms=5000,
                source_in_ms=1000,
                source_out_ms=6000,
                speed_factor=1.0,
                is_reversed=False,
            ),
            ClipSchema(
                id="clip-v1-2",
                track_id="track-v1",
                asset_id="asset-video-1",
                name="Hero Shot Take 2",
                clip_type="media",
                start_time_ms=7000,
                duration_ms=4000,
                source_in_ms=8000,
                source_out_ms=12000,
                speed_factor=1.0,
                is_reversed=False,
            ),
        ]
    )

    v2 = TrackSchema(
        id="track-v2",
        timeline_id="tl-1",
        name="V2",
        track_type="video",
        track_role="video",
        order_index=1,
        is_muted=False,
        is_locked=False,
        is_visible=True,
        is_solo=False,
        volume_db=0.0,
        pan=0.0,
        height_px=64,
        clips=[
            ClipSchema(
                id="clip-v2-1",
                track_id="track-v2",
                asset_id="asset-video-2",
                name="B-Roll Overlay",
                clip_type="media",
                start_time_ms=2000,
                duration_ms=4000,
                source_in_ms=500,
                source_out_ms=4500,
                speed_factor=1.0,
                is_reversed=False,
            ),
        ]
    )

    a1 = TrackSchema(
        id="track-a1",
        timeline_id="tl-1",
        name="A1",
        track_type="audio",
        track_role="dialogue",
        order_index=2,
        is_muted=False,
        is_locked=False,
        is_visible=True,
        is_solo=False,
        volume_db=0.0,
        pan=0.0,
        height_px=56,
        clips=[
            ClipSchema(
                id="clip-a1-1",
                track_id="track-a1",
                asset_id="asset-audio-1",
                name="Main Dialogue",
                clip_type="media",
                start_time_ms=0,
                duration_ms=10000,
                source_in_ms=2000,
                source_out_ms=12000,
                speed_factor=1.0,
                is_reversed=False,
            ),
        ]
    )

    tl = TimelineStateSchema(
        id="tl-1",
        project_id="proj-1",
        name="Main Edit",
        duration_ms=20000,
        tracks=[v1, v2, a1],
        markers=[],
        in_point_ms=None,
        out_point_ms=None,
        target_video_track_id=None,
        target_audio_track_id=None,
    )
    return tl


# ─── 42 Unit Tests for Phase 47 ───

def test_01_match_frame_basic_success(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(2000)
    engine.select_clip("clip-v1-1")
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_asset is not None
    assert engine.source_asset.id == "asset-video-1"
    # Clip starts at 0, source_in is 1000, playhead at 2000 -> offset is 2000 -> source playhead = 3000
    assert engine.source_playhead_ms == 3000
    assert engine.source_in_point_ms == 1000
    assert engine.source_out_point_ms == 6000
    assert engine.active_monitor_focus == "source"


def test_02_match_frame_at_clip_start(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(0)
    engine.select_clip("clip-v1-1")
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_playhead_ms == 1000  # Exactly source_in_ms


def test_03_match_frame_at_clip_end(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(5000)
    engine.select_clip("clip-v1-1")
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_playhead_ms == 6000  # Exactly source_out_ms


def test_04_match_frame_speed_factor_double(multi_track_timeline, base_assets):
    # Set speed factor 2.0x
    clip = multi_track_timeline.tracks[0].clips[0]
    clip.speed_factor = 2.0
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(1500)
    engine.select_clip("clip-v1-1")
    ok = engine.match_frame()

    assert ok is True
    # delta in sequence = 1500 ms * 2.0 = 3000 ms source delta
    # source_in = 1000 -> source_playhead = 4000
    assert engine.source_playhead_ms == 4000


def test_05_match_frame_speed_factor_half(multi_track_timeline, base_assets):
    # Set speed factor 0.5x
    clip = multi_track_timeline.tracks[0].clips[0]
    clip.speed_factor = 0.5
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(2000)
    engine.select_clip("clip-v1-1")
    ok = engine.match_frame()

    assert ok is True
    # delta in sequence = 2000 ms * 0.5 = 1000 ms source delta
    # source_in = 1000 -> source_playhead = 2000
    assert engine.source_playhead_ms == 2000


def test_06_match_frame_reversed_clip(multi_track_timeline, base_assets):
    clip = multi_track_timeline.tracks[0].clips[0]
    clip.is_reversed = True
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(1000)
    engine.select_clip("clip-v1-1")
    ok = engine.match_frame()

    assert ok is True
    # source_out = 6000, sequence offset = 1000 -> source playhead = 6000 - 1000 = 5000
    assert engine.source_playhead_ms == 5000


def test_07_match_frame_reversed_with_speed(multi_track_timeline, base_assets):
    clip = multi_track_timeline.tracks[0].clips[0]
    clip.is_reversed = True
    clip.speed_factor = 2.0
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(1000)
    engine.select_clip("clip-v1-1")
    ok = engine.match_frame()

    assert ok is True
    # source_out = 6000, sequence offset = 1000 * 2.0 = 2000 -> source playhead = 4000
    assert engine.source_playhead_ms == 4000


def test_08_match_frame_explicit_clip_id_string(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(8000)
    ok = engine.match_frame("clip-v1-2")

    assert ok is True
    assert engine.source_asset.id == "asset-video-1"
    # clip-v1-2: start=7000, source_in=8000. playhead=8000 -> offset=1000 -> source_playhead=9000
    assert engine.source_playhead_ms == 9000
    assert engine.source_in_point_ms == 8000
    assert engine.source_out_point_ms == 12000


def test_09_match_frame_explicit_clip_id_dict(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(8000)
    ok = engine.match_frame({"clipId": "clip-v1-2"})

    assert ok is True
    assert engine.source_playhead_ms == 9000


def test_10_match_frame_patched_v1_target_priority(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    # At 3000ms, both clip-v1-1 (on V1) and clip-v2-1 (on V2) overlap!
    engine.set_playhead(3000)
    engine.set_target_tracks(video_track_id="track-v1", audio_track_id=None)
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_asset.id == "asset-video-1"  # Matches V1 because target_video_track_id is track-v1


def test_11_match_frame_patched_v2_target_priority(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    # At 3000ms, both clip-v1-1 and clip-v2-1 overlap
    engine.set_playhead(3000)
    engine.set_target_tracks(video_track_id="track-v2", audio_track_id=None)
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_asset.id == "asset-video-2"  # Matches V2 because target is V2


def test_12_match_frame_audio_target_priority(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(1000)
    # Patch only audio target track A1
    engine.set_target_tracks(video_track_id=None, audio_track_id="track-a1")
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_asset.id == "asset-audio-1"
    assert engine.source_playhead_ms == 3000  # source_in=2000 + 1000 offset


def test_13_match_frame_unpatched_fallback_video_order(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    # At 3000ms, no targets patched. Track V1 has order_index 0, V2 has order_index 1
    engine.set_playhead(3000)
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_asset.id == "asset-video-1"  # Order index 0 video track prioritized


def test_14_match_frame_empty_space_returns_false(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(15000)  # No clips exist here
    ok = engine.match_frame()

    assert ok is False
    assert engine.source_asset is None


def test_15_match_frame_synthetic_asset_fallback(multi_track_timeline):
    # Assets dictionary is empty, engine should synthesize metadata
    engine = MatchFrameEngine(multi_track_timeline, assets=[])
    engine.set_playhead(2000)
    engine.select_clip("clip-v1-1")
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_asset is not None
    assert engine.source_asset.id == "asset-video-1"
    assert engine.source_asset.duration_ms == 6000


def test_16_match_frame_clamps_playhead_to_asset_duration(multi_track_timeline, base_assets):
    base_assets[0].duration_ms = 4000  # Shorter than clip's source_out
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(4500)
    engine.select_clip("clip-v1-1")
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_playhead_ms <= 4000


def test_17_reverse_match_frame_basic_success(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.source_asset = base_assets[0]  # asset-video-1
    engine.source_playhead_ms = 3000      # falls inside clip-v1-1 (source_in=1000, source_out=6000)

    ok = engine.reverse_match_frame()
    assert ok is True
    # clip-v1-1 starts at 0, source_in=1000 -> seq time = 0 + (3000 - 1000) = 2000
    assert engine.playhead_ms == 2000
    assert engine.selected_clip_id == "clip-v1-1"
    assert engine.active_monitor_focus == "program"


def test_18_reverse_match_frame_second_instance_match(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.source_asset = base_assets[0]  # asset-video-1
    # clip-v1-2 has source_in=8000, source_out=12000, start=7000
    engine.source_playhead_ms = 9500

    ok = engine.reverse_match_frame()
    assert ok is True
    # seq time = 7000 + (9500 - 8000) = 8500
    assert engine.playhead_ms == 8500
    assert engine.selected_clip_id == "clip-v1-2"


def test_19_reverse_match_frame_speed_compensated(multi_track_timeline, base_assets):
    clip = multi_track_timeline.tracks[0].clips[0]
    clip.speed_factor = 2.0
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.source_asset = base_assets[0]
    engine.source_playhead_ms = 3000  # delta = 2000 source ms -> seq delta = 2000 / 2.0 = 1000 ms

    ok = engine.reverse_match_frame()
    assert ok is True
    assert engine.playhead_ms == 1000


def test_20_reverse_match_frame_reversed_clip_compensated(multi_track_timeline, base_assets):
    clip = multi_track_timeline.tracks[0].clips[0]
    clip.is_reversed = True
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.source_asset = base_assets[0]
    # source_out=6000, source_playhead=5000 -> offset = (6000 - 5000) = 1000 ms
    engine.source_playhead_ms = 5000

    ok = engine.reverse_match_frame()
    assert ok is True
    assert engine.playhead_ms == 1000


def test_21_reverse_match_frame_cyclical_navigation(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.source_asset = base_assets[0]
    # Both clips have asset-video-1. Set source playhead to 0 (outside in/out ranges)
    engine.source_playhead_ms = 0
    engine.set_playhead(0)

    # First reverse match frame jumps to second instance (start=7000) because it's after playhead (0)
    ok = engine.reverse_match_frame()
    assert ok is True
    assert engine.selected_clip_id == "clip-v1-2"
    assert engine.playhead_ms == 7000

    # Next reverse match frame wraps around to first instance (start=0)
    ok2 = engine.reverse_match_frame()
    assert ok2 is True
    assert engine.selected_clip_id == "clip-v1-1"
    assert engine.playhead_ms == 0


def test_22_reverse_match_frame_no_asset_loaded(multi_track_timeline):
    engine = MatchFrameEngine(multi_track_timeline)
    engine.source_asset = None
    ok = engine.reverse_match_frame()
    assert ok is False


def test_23_reverse_match_frame_unused_asset(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.source_asset = base_assets[3]  # asset-unused
    ok = engine.reverse_match_frame()
    assert ok is False


def test_24_find_asset_occurrences_multiple(multi_track_timeline):
    engine = MatchFrameEngine(multi_track_timeline)
    occs = engine.find_asset_timeline_occurrences("asset-video-1")

    assert len(occs) == 2
    assert occs[0]["clipId"] == "clip-v1-1"
    assert occs[0]["startMs"] == 0
    assert occs[0]["durationMs"] == 5000
    assert occs[1]["clipId"] == "clip-v1-2"
    assert occs[1]["startMs"] == 7000


def test_25_find_asset_occurrences_single(multi_track_timeline):
    engine = MatchFrameEngine(multi_track_timeline)
    occs = engine.find_asset_timeline_occurrences("asset-video-2")

    assert len(occs) == 1
    assert occs[0]["clipId"] == "clip-v2-1"
    assert occs[0]["trackName"] == "V2"


def test_26_find_asset_occurrences_unused(multi_track_timeline):
    engine = MatchFrameEngine(multi_track_timeline)
    occs = engine.find_asset_timeline_occurrences("asset-unused")

    assert len(occs) == 0


def test_27_jump_to_timeline_occurrence_success(multi_track_timeline):
    engine = MatchFrameEngine(multi_track_timeline)
    engine.set_playhead(0)
    engine.active_monitor_focus = "source"

    ok = engine.jump_to_timeline_occurrence("clip-v1-2")
    assert ok is True
    assert engine.playhead_ms == 7000
    assert engine.selected_clip_id == "clip-v1-2"
    assert engine.active_monitor_focus == "program"


def test_28_jump_to_timeline_occurrence_nonexistent(multi_track_timeline):
    engine = MatchFrameEngine(multi_track_timeline)
    ok = engine.jump_to_timeline_occurrence("nonexistent-clip")
    assert ok is False


def test_29_roundtrip_match_and_reverse_match(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    orig_playhead = 2500
    engine.set_playhead(orig_playhead)
    engine.select_clip("clip-v1-1")

    # Forward: Timeline -> Source
    ok1 = engine.match_frame()
    assert ok1 is True
    assert engine.active_monitor_focus == "source"

    # Reset sequence playhead to simulate user movement
    engine.set_playhead(0)

    # Reverse: Source -> Timeline
    ok2 = engine.reverse_match_frame()
    assert ok2 is True
    assert engine.playhead_ms == orig_playhead
    assert engine.active_monitor_focus == "program"


def test_30_roundtrip_with_speed_factor(multi_track_timeline, base_assets):
    clip = multi_track_timeline.tracks[0].clips[0]
    clip.speed_factor = 1.5
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    orig_playhead = 3000
    engine.set_playhead(orig_playhead)
    engine.select_clip("clip-v1-1")

    engine.match_frame()
    engine.set_playhead(0)
    engine.reverse_match_frame()

    assert engine.playhead_ms == orig_playhead


def test_31_roundtrip_with_reversed_clip(multi_track_timeline, base_assets):
    clip = multi_track_timeline.tracks[0].clips[0]
    clip.is_reversed = True
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    orig_playhead = 2000
    engine.set_playhead(orig_playhead)
    engine.select_clip("clip-v1-1")

    engine.match_frame()
    engine.set_playhead(0)
    engine.reverse_match_frame()

    assert engine.playhead_ms == orig_playhead


def test_32_highlighted_asset_state_setting(multi_track_timeline):
    engine = MatchFrameEngine(multi_track_timeline)
    assert engine.highlighted_asset_id is None

    engine.set_highlighted_asset("asset-video-1")
    assert engine.highlighted_asset_id == "asset-video-1"

    engine.set_highlighted_asset(None)
    assert engine.highlighted_asset_id is None


def test_33_match_frame_non_mutating(multi_track_timeline, base_assets):
    snapshot_before = multi_track_timeline.model_dump()
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(2000)
    engine.select_clip("clip-v1-1")
    engine.match_frame()

    snapshot_after = engine.timeline.model_dump()
    assert snapshot_before == snapshot_after  # Zero mutations to tracks/clips/markers


def test_34_reverse_match_frame_non_mutating(multi_track_timeline, base_assets):
    snapshot_before = multi_track_timeline.model_dump()
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.source_asset = base_assets[0]
    engine.source_playhead_ms = 3000
    engine.reverse_match_frame()

    snapshot_after = engine.timeline.model_dump()
    assert snapshot_before == snapshot_after


def test_35_match_frame_locked_track_clip(multi_track_timeline, base_assets):
    # Lock V1 track - Match Frame should still work (read-only navigation)
    multi_track_timeline.tracks[0].is_locked = True
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(2000)
    engine.select_clip("clip-v1-1")
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_asset.id == "asset-video-1"


def test_36_match_frame_muted_audio_track(multi_track_timeline, base_assets):
    # Mute audio track - Match Frame should still locate source media
    multi_track_timeline.tracks[2].is_muted = True
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(3000)
    engine.select_clip("clip-a1-1")
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_asset.id == "asset-audio-1"


def test_37_audio_reverse_match_frame(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.source_asset = base_assets[2]  # asset-audio-1
    engine.source_playhead_ms = 5000      # falls inside clip-a1-1 (source_in=2000)

    ok = engine.reverse_match_frame()
    assert ok is True
    # seq = 0 + (5000 - 2000) = 3000
    assert engine.playhead_ms == 3000
    assert engine.selected_clip_id == "clip-a1-1"


def test_38_large_timecode_match_frame(multi_track_timeline, base_assets):
    # Long documentary timeline clip at 1 hour (3,600,000 ms)
    long_clip = ClipSchema(
        id="clip-long-doc",
        track_id="track-v1",
        asset_id="asset-video-1",
        name="Long Feature",
        clip_type="media",
        start_time_ms=3600000,
        duration_ms=60000,
        source_in_ms=10000,
        source_out_ms=70000,
        speed_factor=1.0,
        is_reversed=False,
    )
    multi_track_timeline.tracks[0].clips.append(long_clip)
    base_assets[0].duration_ms = 100000

    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(3615000)  # 15s into the clip
    engine.select_clip("clip-long-doc")
    ok = engine.match_frame()

    assert ok is True
    # source_in=10000 + 15000 = 25000
    assert engine.source_playhead_ms == 25000


def test_39_single_frame_clip_match_frame(multi_track_timeline, base_assets):
    short_clip = ClipSchema(
        id="clip-flash",
        track_id="track-v1",
        asset_id="asset-video-1",
        name="Flash Frame",
        clip_type="media",
        start_time_ms=12000,
        duration_ms=33,  # 1 frame at 30fps
        source_in_ms=500,
        source_out_ms=533,
        speed_factor=1.0,
        is_reversed=False,
    )
    multi_track_timeline.tracks[0].clips.append(short_clip)

    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(12010)
    engine.select_clip("clip-flash")
    ok = engine.match_frame()

    assert ok is True
    assert engine.source_playhead_ms == 510


def test_40_match_frame_explicit_track_id_option(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    engine.set_playhead(3000)
    # Explicitly request track-v2
    ok = engine.match_frame({"trackId": "track-v2"})

    assert ok is True
    assert engine.source_asset.id == "asset-video-2"


def test_41_occurrences_correct_sort_order(multi_track_timeline):
    # Add an occurrence before clip-v1-1
    pre_clip = ClipSchema(
        id="clip-early",
        track_id="track-v2",
        asset_id="asset-video-1",
        name="Early Use",
        clip_type="media",
        start_time_ms=500,
        duration_ms=1000,
        source_in_ms=0,
        source_out_ms=1000,
        speed_factor=1.0,
        is_reversed=False,
    )
    multi_track_timeline.tracks[1].clips.append(pre_clip)
    engine = MatchFrameEngine(multi_track_timeline)
    occs = engine.find_asset_timeline_occurrences("asset-video-1")

    assert len(occs) == 3
    assert occs[0]["startMs"] == 0
    assert occs[1]["startMs"] == 500
    assert occs[2]["startMs"] == 7000


def test_42_rapid_sequential_match_frame(multi_track_timeline, base_assets):
    engine = MatchFrameEngine(multi_track_timeline, base_assets)
    # Rapidly jump playhead and match frame 10 times
    for t in range(0, 5000, 500):
        engine.set_playhead(t)
        engine.select_clip("clip-v1-1")
        ok = engine.match_frame()
        assert ok is True
        assert engine.source_playhead_ms == 1000 + t
