"""
Phase 5: Color Scopes API.
Generates video scopes (waveform, histogram, vectorscope) for video frames using FFmpeg.
Returns honest 'unavailable' status when media is missing or analysis fails.
No fake or simulated scope data is ever returned.
"""

from typing import Optional, Dict, Any
from pathlib import Path
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status
from app.core.ffmpeg import ffmpeg_service
from app.core.storage import storage

router = APIRouter(prefix="/scopes", tags=["scopes"])


class ScopeAnalysisRequest(BaseModel):
    asset_id: Optional[str] = None
    file_path: Optional[str] = None
    timestamp_ms: int = 0
    scope_type: str = "waveform"  # 'waveform', 'histogram', 'vectorscope'


@router.post("/analyze")
async def analyze_scope(req: ScopeAnalysisRequest):
    """
    Analyze color values of a video frame at timestamp_ms using FFmpeg.
    Returns generated scope image path or honest unavailable status.
    """
    if not req.asset_id and not req.file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either asset_id or file_path is required"
        )

    local_path: Optional[Path] = None
    if req.file_path:
        try:
            local_path = storage.get_local_path(req.file_path)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    elif req.asset_id:
        local_path = storage.get_local_path(f"assets/{req.asset_id}.mp4")

    if not local_path or not local_path.exists():
        return {
            "status": "unavailable",
            "scope_type": req.scope_type,
            "timestamp_ms": req.timestamp_ms,
            "message": f"Media file not found or inaccessible at '{req.file_path or req.asset_id}'",
            "scope_image_url": None,
        }

    output_filename = f"scope_{req.scope_type}_{req.timestamp_ms}ms.png"
    out_path = storage.get_local_path(f"scopes/{output_filename}")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    time_sec = max(0.0, req.timestamp_ms / 1000.0)

    # FFmpeg filter selection
    filter_expr = "waveform=mode=column:intensity=0.1"
    if req.scope_type == "histogram":
        filter_expr = "histogram=display_mode=parade"
    elif req.scope_type == "vectorscope":
        filter_expr = "vectorscope=mode=color3:color=color"

    cmd = [
        ffmpeg_service.ffmpeg_bin,
        "-y",
        "-ss", f"{time_sec:.3f}",
        "-i", str(local_path),
        "-vf", f"{filter_expr},scale=640:360",
        "-vframes", "1",
        str(out_path)
    ]

    res = await ffmpeg_service._run_ffmpeg(cmd)
    if res["returncode"] == 0 and out_path.exists():
        return {
            "status": "ready",
            "scope_type": req.scope_type,
            "timestamp_ms": req.timestamp_ms,
            "scope_image_url": f"/media/scopes/{output_filename}",
            "message": "Scope rendered successfully via FFmpeg filter"
        }
    else:
        err_detail = res.get("stderr", "Unknown FFmpeg error")
        return {
            "status": "unavailable",
            "scope_type": req.scope_type,
            "timestamp_ms": req.timestamp_ms,
            "message": f"FFmpeg scope rendering failed: {err_detail}",
            "scope_image_url": None,
        }
