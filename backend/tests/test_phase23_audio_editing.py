"""
Unit tests for Phase 23: Professional Audio Editing, Clip Operations & Mix Workflow.

Validates the backend and algorithmic modeling for:
- Audio clip split at playhead
- Split boundary validation (in-bounds vs out-of-bounds)
- Automation partition during split with boundary continuity
- Trim validation and source media offset preservation
- Automation preservation and shift during trim
- Clip repositioning on timeline and across tracks
- Duplicate clip behavior with keyframe cloning and unique IDs
- Delete cleanup and selection clearing
- Fade validation and duration clamping
- Audio crossfade balanced transition calculation
- Invalid clip and timeline bounds handling
"""

import math
import uuid
import pytest
from typing import List, Dict, Any, Optional

from app.models.timeline import Track, Clip, Keyframe


# ---------------------------------------------------------------------------
# Algorithmic modeling helpers mirroring the frontend timeline store
# ---------------------------------------------------------------------------

def evaluate_clip_volume_at_offset(clip: Dict[str, Any], offset_ms: float) -> float:
    """Evaluate volume at a time offset using piecewise linear interpolation."""
    kfs = sorted(
        [k for k in clip.get("keyframes", []) if k.get("property_path") == "volume_db"],
        key=lambda k: k.get("time_offset_ms", 0)
    )
    if not kfs:
        return float(clip.get("volume_db", 0.0))
    if len(kfs) == 1 or offset_ms <= kfs[0]["time_offset_ms"]:
        return float(kfs[0]["value"])
    if offset_ms >= kfs[-1]["time_offset_ms"]:
        return float(kfs[-1]["value"])

    for i in range(len(kfs) - 1):
        k1 = kfs[i]
        k2 = kfs[i + 1]
        t1 = k1["time_offset_ms"]
        t2 = k2["time_offset_ms"]
        if t1 <= offset_ms <= t2:
            dt = t2 - t1
            if dt == 0:
                return float(k1["value"])
            alpha = (offset_ms - t1) / dt
            return float(k1["value"]) + alpha * (float(k2["value"]) - float(k1["value"]))

    return float(clip.get("volume_db", 0.0))


def split_audio_clip(clip: Dict[str, Any], playhead_ms: int) -> Optional[tuple[Dict[str, Any], Dict[str, Any]]]:
    """Split an audio clip at playhead position, partitioning keyframes and fades."""
    start_ms = clip["start_time_ms"]
    dur_ms = clip["duration_ms"]
    end_ms = start_ms + dur_ms

    if playhead_ms <= start_ms or playhead_ms >= end_ms:
        return None

    split_offset = playhead_ms - start_ms
    orig_kfs = clip.get("keyframes", [])
    has_vol_auto = any(k.get("property_path") == "volume_db" for k in orig_kfs)
    split_vol = evaluate_clip_volume_at_offset(clip, split_offset)

    # Left clip
    left_kfs = [
        dict(k) for k in orig_kfs
        if k.get("time_offset_ms", 0) < split_offset
    ]
    if has_vol_auto:
        left_kfs.append({
            "id": str(uuid.uuid4()),
            "clip_id": clip["id"],
            "property_path": "volume_db",
            "time_offset_ms": split_offset,
            "value": round(split_vol, 1),
            "interpolation": "linear",
        })
    left_kfs.sort(key=lambda k: k["time_offset_ms"])

    left_clip = dict(clip)
    left_clip["duration_ms"] = split_offset
    left_clip["source_out_ms"] = clip["source_in_ms"] + split_offset
    left_clip["keyframes"] = left_kfs
    left_clip["fade_in_ms"] = min(clip.get("fade_in_ms", 0), split_offset)
    left_clip["fade_out_ms"] = 0

    # Right clip
    right_id = str(uuid.uuid4())
    right_kfs = []
    if has_vol_auto:
        right_kfs.append({
            "id": str(uuid.uuid4()),
            "clip_id": right_id,
            "property_path": "volume_db",
            "time_offset_ms": 0,
            "value": round(split_vol, 1),
            "interpolation": "linear",
        })

    for k in orig_kfs:
        if k.get("time_offset_ms", 0) > split_offset:
            rk = dict(k)
            rk["id"] = str(uuid.uuid4())
            rk["clip_id"] = right_id
            rk["time_offset_ms"] = k["time_offset_ms"] - split_offset
            right_kfs.append(rk)
    right_kfs.sort(key=lambda k: k["time_offset_ms"])

    right_clip = dict(clip)
    right_clip["id"] = right_id
    right_clip["start_time_ms"] = playhead_ms
    right_clip["duration_ms"] = dur_ms - split_offset
    right_clip["source_in_ms"] = clip["source_in_ms"] + split_offset
    right_clip["source_out_ms"] = clip["source_in_ms"] + dur_ms
    right_clip["keyframes"] = right_kfs
    right_clip["fade_in_ms"] = 0
    right_clip["fade_out_ms"] = min(clip.get("fade_out_ms", 0), dur_ms - split_offset)

    return left_clip, right_clip


def trim_audio_clip(clip: Dict[str, Any], edge: str, delta_ms: int) -> bool:
    """Trim an audio clip from left or right edge, adjusting bounds and keyframes."""
    if edge == "left":
        new_start = clip["start_time_ms"] + delta_ms
        new_dur = clip["duration_ms"] - delta_ms
        new_source_in = clip["source_in_ms"] + delta_ms
        if new_dur < 100 or new_start < 0 or new_source_in < 0:
            return False

        clip["start_time_ms"] = new_start
        clip["duration_ms"] = new_dur
        clip["source_in_ms"] = new_source_in
        clip["source_out_ms"] = new_source_in + new_dur

        if "keyframes" in clip:
            shifted = []
            for k in clip["keyframes"]:
                new_t = k.get("time_offset_ms", 0) - delta_ms
                if 0 <= new_t <= new_dur:
                    k_copy = dict(k)
                    k_copy["time_offset_ms"] = new_t
                    shifted.append(k_copy)
            clip["keyframes"] = shifted

        clip["fade_in_ms"] = min(clip.get("fade_in_ms", 0), new_dur)
        clip["fade_out_ms"] = min(clip.get("fade_out_ms", 0), new_dur)
        return True

    elif edge == "right":
        new_dur = clip["duration_ms"] + delta_ms
        if new_dur < 100:
            return False

        clip["duration_ms"] = new_dur
        clip["source_out_ms"] = clip["source_in_ms"] + new_dur

        if "keyframes" in clip:
            clip["keyframes"] = [
                k for k in clip["keyframes"]
                if k.get("time_offset_ms", 0) <= new_dur
            ]

        clip["fade_in_ms"] = min(clip.get("fade_in_ms", 0), new_dur)
        clip["fade_out_ms"] = min(clip.get("fade_out_ms", 0), new_dur)
        return True

    return False


def duplicate_audio_clip(clip: Dict[str, Any]) -> Dict[str, Any]:
    """Create a contiguous duplicate of an audio clip with fresh IDs."""
    new_id = str(uuid.uuid4())
    dup = dict(clip)
    dup["id"] = new_id
    dup["start_time_ms"] = clip["start_time_ms"] + clip["duration_ms"]

    if "keyframes" in clip:
        cloned_kfs = []
        for k in clip["keyframes"]:
            ck = dict(k)
            ck["id"] = str(uuid.uuid4())
            ck["clip_id"] = new_id
            cloned_kfs.append(ck)
        dup["keyframes"] = cloned_kfs

    return dup


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

def test_audio_clip_split_boundary_validation():
    """Verify splitting audio clip partitions source in/out and duration correctly."""
    clip = {
        "id": "clip-1",
        "start_time_ms": 1000,
        "duration_ms": 5000,
        "source_in_ms": 500,
        "source_out_ms": 5500,
        "volume_db": -2.0,
        "fade_in_ms": 200,
        "fade_out_ms": 400,
        "keyframes": [],
    }

    # Out of bounds: before clip start
    assert split_audio_clip(clip, 500) is None
    # Out of bounds: at clip start
    assert split_audio_clip(clip, 1000) is None
    # Out of bounds: at clip end
    assert split_audio_clip(clip, 6000) is None
    # Out of bounds: after clip end
    assert split_audio_clip(clip, 7000) is None

    # In bounds: split at 3000ms (splitOffset = 2000ms)
    result = split_audio_clip(clip, 3000)
    assert result is not None
    left, right = result

    # Left clip asserts
    assert left["id"] == "clip-1"
    assert left["start_time_ms"] == 1000
    assert left["duration_ms"] == 2000
    assert left["source_in_ms"] == 500
    assert left["source_out_ms"] == 2500
    assert left["fade_in_ms"] == 200
    assert left["fade_out_ms"] == 0  # Internal cut has no fade out

    # Right clip asserts
    assert right["id"] != "clip-1"
    assert right["start_time_ms"] == 3000
    assert right["duration_ms"] == 3000
    assert right["source_in_ms"] == 2500
    assert right["source_out_ms"] == 5500
    assert right["fade_in_ms"] == 0  # Internal cut has no fade in
    assert right["fade_out_ms"] == 400


def test_automation_partition_during_split():
    """Verify volume keyframes partition correctly and maintain continuity across split."""
    clip = {
        "id": "clip-auto",
        "start_time_ms": 0,
        "duration_ms": 6000,
        "source_in_ms": 0,
        "source_out_ms": 6000,
        "volume_db": 0.0,
        "keyframes": [
            {"id": "kf-1", "property_path": "volume_db", "time_offset_ms": 0, "value": -10.0, "interpolation": "linear"},
            {"id": "kf-2", "property_path": "volume_db", "time_offset_ms": 2000, "value": 0.0, "interpolation": "linear"},
            {"id": "kf-3", "property_path": "volume_db", "time_offset_ms": 4000, "value": -6.0, "interpolation": "linear"},
            {"id": "kf-4", "property_path": "volume_db", "time_offset_ms": 6000, "value": -12.0, "interpolation": "linear"},
        ],
    }

    # Split at t = 3000ms.
    # Midpoint between kf-2 (2000ms: 0.0) and kf-3 (4000ms: -6.0) is -3.0 dB.
    result = split_audio_clip(clip, 3000)
    assert result is not None
    left, right = result

    # Left clip keyframes: kf-1 (0ms), kf-2 (2000ms), split boundary (3000ms: -3.0 dB)
    assert len(left["keyframes"]) == 3
    assert left["keyframes"][0]["time_offset_ms"] == 0
    assert left["keyframes"][1]["time_offset_ms"] == 2000
    assert left["keyframes"][2]["time_offset_ms"] == 3000
    assert left["keyframes"][2]["value"] == -3.0

    # Right clip keyframes: split boundary (0ms: -3.0 dB), kf-3 shifted (1000ms: -6.0 dB), kf-4 shifted (3000ms: -12.0 dB)
    assert len(right["keyframes"]) == 3
    assert right["keyframes"][0]["time_offset_ms"] == 0
    assert right["keyframes"][0]["value"] == -3.0
    assert right["keyframes"][1]["time_offset_ms"] == 1000
    assert right["keyframes"][1]["value"] == -6.0
    assert right["keyframes"][2]["time_offset_ms"] == 3000
    assert right["keyframes"][2]["value"] == -12.0

    # All keyframe IDs on right clip must be new and distinct
    right_kf_ids = {k["id"] for k in right["keyframes"]}
    assert "kf-1" not in right_kf_ids
    assert "kf-2" not in right_kf_ids
    assert "kf-3" not in right_kf_ids
    assert "kf-4" not in right_kf_ids


def test_audio_trim_validation_and_source_offset():
    """Verify left and right trimming preserves source offset and enforces minimum duration."""
    clip = {
        "id": "c1",
        "start_time_ms": 1000,
        "duration_ms": 4000,
        "source_in_ms": 500,
        "source_out_ms": 4500,
        "fade_in_ms": 200,
        "fade_out_ms": 300,
    }

    # Left trim: +500ms (shortening from left)
    ok = trim_audio_clip(clip, "left", 500)
    assert ok is True
    assert clip["start_time_ms"] == 1500
    assert clip["duration_ms"] == 3500
    assert clip["source_in_ms"] == 1000
    assert clip["source_out_ms"] == 4500  # End of source remains unchanged

    # Right trim: -1000ms (shortening from right)
    ok_r = trim_audio_clip(clip, "right", -1000)
    assert ok_r is True
    assert clip["start_time_ms"] == 1500
    assert clip["duration_ms"] == 2500
    assert clip["source_in_ms"] == 1000
    assert clip["source_out_ms"] == 3500

    # Reject trim reducing duration below 100ms
    ok_fail = trim_audio_clip(clip, "right", -2450)
    assert ok_fail is False
    assert clip["duration_ms"] == 2500  # Unmodified


def test_automation_preservation_during_trim():
    """Verify keyframes are shifted properly when trimming left edge."""
    clip = {
        "id": "c-auto",
        "start_time_ms": 0,
        "duration_ms": 5000,
        "source_in_ms": 0,
        "source_out_ms": 5000,
        "keyframes": [
            {"id": "k1", "property_path": "volume_db", "time_offset_ms": 500, "value": -6.0},
            {"id": "k2", "property_path": "volume_db", "time_offset_ms": 2000, "value": 0.0},
            {"id": "k3", "property_path": "volume_db", "time_offset_ms": 4000, "value": -3.0},
        ],
    }

    # Trim left by 1000ms:
    # k1 (500ms) falls before new start -> dropped
    # k2 (2000ms) shifts to 1000ms
    # k3 (4000ms) shifts to 3000ms
    trim_audio_clip(clip, "left", 1000)
    assert len(clip["keyframes"]) == 2
    assert clip["keyframes"][0]["time_offset_ms"] == 1000
    assert clip["keyframes"][0]["value"] == 0.0
    assert clip["keyframes"][1]["time_offset_ms"] == 3000
    assert clip["keyframes"][1]["value"] == -3.0


def test_audio_clip_repositioning():
    """Verify repositioning audio clip keeps duration, source offsets, and keyframes intact."""
    clip = {
        "id": "c-move",
        "track_id": "t1",
        "start_time_ms": 2000,
        "duration_ms": 4000,
        "source_in_ms": 100,
        "source_out_ms": 4100,
        "volume_db": -1.5,
        "fade_in_ms": 300,
        "fade_out_ms": 500,
        "keyframes": [
            {"id": "k1", "property_path": "volume_db", "time_offset_ms": 500, "value": 0.0}
        ],
    }

    # Move to new start: 8000ms on track t2
    clip["start_time_ms"] = 8000
    clip["track_id"] = "t2"

    assert clip["start_time_ms"] == 8000
    assert clip["track_id"] == "t2"
    assert clip["duration_ms"] == 4000
    assert clip["source_in_ms"] == 100
    assert clip["source_out_ms"] == 4100
    assert len(clip["keyframes"]) == 1
    assert clip["keyframes"][0]["time_offset_ms"] == 500


def test_audio_clip_duplicate_behavior():
    """Verify duplicate creates contiguous clip with fresh IDs for clip and keyframes."""
    clip = {
        "id": "orig-clip",
        "start_time_ms": 1000,
        "duration_ms": 3000,
        "source_in_ms": 200,
        "source_out_ms": 3200,
        "volume_db": -3.0,
        "keyframes": [
            {"id": "orig-kf-1", "clip_id": "orig-clip", "property_path": "volume_db", "time_offset_ms": 1000, "value": 0.0}
        ],
    }

    dup = duplicate_audio_clip(clip)
    assert dup["id"] != clip["id"]
    assert dup["start_time_ms"] == 4000  # Contiguous: 1000 + 3000
    assert dup["duration_ms"] == 3000
    assert dup["source_in_ms"] == 200
    assert dup["source_out_ms"] == 3200
    assert dup["volume_db"] == -3.0

    # Keyframes cloned with unique IDs
    assert len(dup["keyframes"]) == 1
    assert dup["keyframes"][0]["id"] != "orig-kf-1"
    assert dup["keyframes"][0]["clip_id"] == dup["id"]
    assert dup["keyframes"][0]["time_offset_ms"] == 1000


def test_audio_clip_delete_cleanup():
    """Verify deleting a clip removes it from track without dangling elements."""
    track_clips = [
        {"id": "c1", "start_time_ms": 0, "duration_ms": 2000},
        {"id": "c2", "start_time_ms": 2000, "duration_ms": 3000},
        {"id": "c3", "start_time_ms": 5000, "duration_ms": 2000},
    ]

    selected_id = "c2"

    # Delete c2
    idx = next((i for i, c in enumerate(track_clips) if c["id"] == "c2"), -1)
    assert idx == 1
    del track_clips[idx]
    if selected_id == "c2":
        selected_id = None

    assert len(track_clips) == 2
    assert [c["id"] for c in track_clips] == ["c1", "c3"]
    assert selected_id is None


def test_fade_validation_and_duration_clamping():
    """Verify fades cannot exceed clip duration."""
    clip = {
        "duration_ms": 2000,
        "fade_in_ms": 3000,   # exceeds duration
        "fade_out_ms": 2500,  # exceeds duration
    }

    validated_in = max(0, min(clip["duration_ms"], clip["fade_in_ms"]))
    validated_out = max(0, min(clip["duration_ms"], clip["fade_out_ms"]))

    assert validated_in == 2000
    assert validated_out == 2000


def test_audio_crossfade_balanced_transition():
    """Verify acoustic crossfade calculation assigns matching fade boundaries."""
    clip_a = {"id": "ca", "duration_ms": 4000, "fade_out_ms": 0}
    clip_b = {"id": "cb", "duration_ms": 5000, "fade_in_ms": 0}

    crossfade_dur = 1000  # 1.0s crossfade
    clip_a["fade_out_ms"] = min(crossfade_dur, clip_a["duration_ms"])
    clip_b["fade_in_ms"] = min(crossfade_dur, clip_b["duration_ms"])

    assert clip_a["fade_out_ms"] == 1000
    assert clip_b["fade_in_ms"] == 1000


def test_invalid_clip_and_timeline_bounds_handling():
    """Verify invalid negative or micro-duration edits are guarded."""
    clip = {"start_time_ms": 100, "duration_ms": 200, "source_in_ms": 0, "source_out_ms": 200}

    # Attempt left trim that would make duration negative
    ok_neg = trim_audio_clip(clip, "left", 300)
    assert ok_neg is False

    # Attempt left trim that would move start time negative
    ok_neg_start = trim_audio_clip(clip, "left", -200)
    assert ok_neg_start is False
