"""
Phase 5: Caption Parser — real SRT and VTT parsing.

SRT format:
    1
    00:00:01,000 --> 00:00:03,500
    Caption text here

VTT format:
    WEBVTT

    00:00:01.000 --> 00:00:03.500
    Caption text here
"""

import re
from typing import Any, Dict, List, Tuple


def _parse_srt_timestamp(ts: str) -> int:
    """Parse SRT timestamp HH:MM:SS,mmm to milliseconds."""
    ts = ts.strip()
    match = re.match(r"(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})", ts)
    if not match:
        raise ValueError(f"Invalid SRT timestamp: {ts}")
    h, m, s, ms = match.groups()
    ms_padded = ms.ljust(3, "0")
    return int(h) * 3_600_000 + int(m) * 60_000 + int(s) * 1_000 + int(ms_padded)


def _parse_vtt_timestamp(ts: str) -> int:
    """Parse VTT timestamp [HH:]MM:SS.mmm to milliseconds."""
    ts = ts.strip()
    match = re.match(r"(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{1,3})", ts)
    if not match:
        raise ValueError(f"Invalid VTT timestamp: {ts}")
    h, m, s, ms = match.groups()
    h = int(h) if h else 0
    ms_padded = ms.ljust(3, "0")
    return h * 3_600_000 + int(m) * 60_000 + int(s) * 1_000 + int(ms_padded)


def parse_srt(content: str) -> List[Dict[str, Any]]:
    """
    Parse SRT subtitle file content into a list of caption dicts.
    Each dict: {start_ms, end_ms, text, speaker}
    """
    captions = []
    # Normalize line endings
    content = content.replace("\r\n", "\n").replace("\r", "\n").strip()
    # Split into blocks by blank lines
    blocks = re.split(r"\n{2,}", content)

    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 2:
            continue

        # First line: sequence number (ignore)
        # Second line: timestamps
        # Remaining: text

        # Find timestamp line (may not be line 2 if block starts differently)
        ts_line_idx = None
        for i, line in enumerate(lines):
            if "-->" in line:
                ts_line_idx = i
                break

        if ts_line_idx is None:
            continue

        try:
            ts_parts = lines[ts_line_idx].split("-->")
            if len(ts_parts) != 2:
                continue
            start_ms = _parse_srt_timestamp(ts_parts[0])
            end_ms   = _parse_srt_timestamp(ts_parts[1].split()[0])  # strip position tags
        except ValueError:
            continue

        text_lines = lines[ts_line_idx + 1:]
        text = "\n".join(text_lines).strip()
        if not text:
            continue

        # Validate timing
        if end_ms <= start_ms:
            end_ms = start_ms + 2000  # auto-fix to 2s

        captions.append({
            "start_ms": start_ms,
            "end_ms":   end_ms,
            "text":     text,
            "speaker":  None,
        })

    return captions


def parse_vtt(content: str) -> List[Dict[str, Any]]:
    """
    Parse WebVTT subtitle file content into a list of caption dicts.
    Each dict: {start_ms, end_ms, text, speaker}
    """
    captions = []
    content = content.replace("\r\n", "\n").replace("\r", "\n").strip()

    # Must start with WEBVTT
    if not content.startswith("WEBVTT"):
        raise ValueError("Not a valid WebVTT file (missing WEBVTT header)")

    # Remove header line and optional header block
    lines = content.splitlines()
    body_start = 1
    for i in range(1, len(lines)):
        if lines[i].strip() == "":
            body_start = i + 1
            break

    body = "\n".join(lines[body_start:])
    blocks = re.split(r"\n{2,}", body)

    for block in blocks:
        lines = block.strip().splitlines()
        if not lines:
            continue

        # Find timestamp line
        ts_line_idx = None
        for i, line in enumerate(lines):
            if "-->" in line:
                ts_line_idx = i
                break

        if ts_line_idx is None:
            continue

        try:
            ts_parts = lines[ts_line_idx].split("-->")
            if len(ts_parts) != 2:
                continue
            start_ms = _parse_vtt_timestamp(ts_parts[0])
            # Strip VTT cue settings after timestamp
            end_ts_raw = ts_parts[1].strip().split()[0]
            end_ms     = _parse_vtt_timestamp(end_ts_raw)
        except ValueError:
            continue

        text_lines = lines[ts_line_idx + 1:]
        # Remove VTT tags like <c>, <b>, <i>, <v Speaker>
        text = "\n".join(text_lines)
        # Extract speaker from <v Speaker Name> tags
        speaker_match = re.search(r"<v\s+([^>]+)>", text)
        speaker = speaker_match.group(1).strip() if speaker_match else None
        # Strip all tags
        text = re.sub(r"<[^>]+>", "", text).strip()

        if not text:
            continue

        if end_ms <= start_ms:
            end_ms = start_ms + 2000

        captions.append({
            "start_ms": start_ms,
            "end_ms":   end_ms,
            "text":     text,
            "speaker":  speaker,
        })

    return captions


def format_srt_timestamp(ms: int) -> str:
    """Format milliseconds as SRT timestamp HH:MM:SS,mmm"""
    h   = ms // 3_600_000;   ms %= 3_600_000
    m   = ms //    60_000;   ms %=    60_000
    s   = ms //     1_000;   ms %=     1_000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def format_vtt_timestamp(ms: int) -> str:
    """Format milliseconds as VTT timestamp HH:MM:SS.mmm"""
    h   = ms // 3_600_000;   ms %= 3_600_000
    m   = ms //    60_000;   ms %=    60_000
    s   = ms //     1_000;   ms %=     1_000
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def export_srt(captions: List[Dict[str, Any]]) -> str:
    """Convert caption list to SRT format string."""
    lines = []
    for i, cap in enumerate(sorted(captions, key=lambda c: c["start_ms"]), start=1):
        lines.append(str(i))
        lines.append(f"{format_srt_timestamp(cap['start_ms'])} --> {format_srt_timestamp(cap['end_ms'])}")
        lines.append(cap["text"])
        lines.append("")
    return "\n".join(lines)


def export_vtt(captions: List[Dict[str, Any]]) -> str:
    """Convert caption list to WebVTT format string."""
    lines = ["WEBVTT", ""]
    for i, cap in enumerate(sorted(captions, key=lambda c: c["start_ms"]), start=1):
        lines.append(str(i))
        lines.append(f"{format_vtt_timestamp(cap['start_ms'])} --> {format_vtt_timestamp(cap['end_ms'])}")
        if cap.get("speaker"):
            lines.append(f"<v {cap['speaker']}>{cap['text']}")
        else:
            lines.append(cap["text"])
        lines.append("")
    return "\n".join(lines)
