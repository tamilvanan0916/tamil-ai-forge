"""
Phase 5: VFX API.
- GET /effects               — list available VFX effects with parameters
- POST /process/chroma-key   — real FFmpeg chromakey on a file
- POST /process/blur         — real FFmpeg gblur on a file
- POST /process/composite    — real FFmpeg blend composite
"""
import uuid
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status
from app.core.ffmpeg import ffmpeg_service
from app.core.color_pipeline import build_chroma_key_filter
from app.core.storage import storage

router = APIRouter(prefix="/vfx", tags=["vfx"])

VFX_EFFECTS: List[Dict[str, Any]] = [
    {
        "id": "chroma-key",
        "name": "Chroma Key (Green/Blue Screen)",
        "category": "compositing",
        "description": "Remove solid background color with spill suppression and matte feathering.",
        "parameters": {
            "color": "#00FF00",
            "similarity": 0.15,
            "blend": 0.08,
        },
    },
    {
        "id": "gaussian-blur",
        "name": "Cinematic Optical Blur",
        "category": "lens",
        "description": "Depth of field simulator with smooth Gaussian falloff.",
        "parameters": {"sigma": 10.0},
    },
    {
        "id": "motion-blur",
        "name": "Natural Motion Blur",
        "category": "motion",
        "description": "180-degree shutter angle optical flow motion blur.",
        "parameters": {"shutter_angle": 180, "samples": 12},
    },
    {
        "id": "sharpen",
        "name": "Detail Sharpen",
        "category": "lens",
        "description": "Unsharp mask sharpening with luma/chroma control.",
        "parameters": {"strength": 1.5},
    },
    {
        "id": "vignette",
        "name": "Cinematic Vignette",
        "category": "lens",
        "description": "Radial edge darkening for film-style framing.",
        "parameters": {"strength": 0.4},
    },
    {
        "id": "film-grain",
        "name": "Authentic Film Grain",
        "category": "film",
        "description": "Temporal noise emulating 35mm grain texture.",
        "parameters": {"strength": 20},
    },
]


class ChromaKeyRequest(BaseModel):
    file_path: str
    color: str = "#00FF00"
    similarity: float = 0.15
    blend: float = 0.08
    output_filename: Optional[str] = None


class BlurRequest(BaseModel):
    file_path: str
    sigma: float = 10.0
    output_filename: Optional[str] = None


class SharpenRequest(BaseModel):
    file_path: str
    strength: float = 1.5
    output_filename: Optional[str] = None


@router.get("/effects", response_model=List[Dict[str, Any]])
async def list_vfx_effects():
    """Return available VFX effects catalog."""
    return VFX_EFFECTS


@router.post("/process/chroma-key")
async def apply_chroma_key(req: ChromaKeyRequest):
    """
    Apply real FFmpeg chromakey filter to remove a background color.
    Returns the output file path on success.
    """
    try:
        input_path = storage.get_local_path(req.file_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not input_path.exists():
        raise HTTPException(status_code=404, detail=f"Source file not found: {req.file_path}")

    # Build chromakey filter string
    filter_str = build_chroma_key_filter({
        "enabled": True,
        "color": req.color,
        "similarity": req.similarity,
        "blend": req.blend,
    })
    if not filter_str:
        raise HTTPException(status_code=400, detail="Invalid chroma key parameters")

    stem = req.output_filename or f"chroma_{uuid.uuid4().hex[:8]}"
    output_dir = storage.get_local_path("renders/vfx")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{stem}.mp4"

    cmd = [
        ffmpeg_service.ffmpeg_bin,
        "-y",
        "-i", str(input_path),
        "-vf", filter_str,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuva420p",
        str(output_path),
    ]

    result = await ffmpeg_service._run_ffmpeg(cmd)
    if result["returncode"] != 0:
        stderr = result.get("stderr", "")
        raise HTTPException(
            status_code=500,
            detail=f"FFmpeg chroma key failed: {stderr[-500:] if stderr else 'unknown error'}"
        )

    return {
        "status": "completed",
        "effect": "chroma-key",
        "filter_applied": filter_str,
        "output_path": f"renders/vfx/{output_path.name}",
    }


@router.post("/process/blur")
async def apply_blur(req: BlurRequest):
    """
    Apply real FFmpeg Gaussian blur to a video file.
    Returns the output file path on success.
    """
    try:
        input_path = storage.get_local_path(req.file_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not input_path.exists():
        raise HTTPException(status_code=404, detail=f"Source file not found: {req.file_path}")

    sigma = max(0.1, min(100.0, float(req.sigma)))
    filter_str = f"gblur=sigma={sigma:.1f}"

    stem = req.output_filename or f"blur_{uuid.uuid4().hex[:8]}"
    output_dir = storage.get_local_path("renders/vfx")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{stem}.mp4"

    cmd = [
        ffmpeg_service.ffmpeg_bin,
        "-y",
        "-i", str(input_path),
        "-vf", filter_str,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "copy",
        str(output_path),
    ]

    result = await ffmpeg_service._run_ffmpeg(cmd)
    if result["returncode"] != 0:
        stderr = result.get("stderr", "")
        raise HTTPException(
            status_code=500,
            detail=f"FFmpeg blur failed: {stderr[-500:] if stderr else 'unknown error'}"
        )

    return {
        "status": "completed",
        "effect": "gaussian-blur",
        "sigma": sigma,
        "filter_applied": filter_str,
        "output_path": f"renders/vfx/{output_path.name}",
    }


@router.post("/process/sharpen")
async def apply_sharpen(req: SharpenRequest):
    """Apply real FFmpeg unsharp mask sharpening."""
    try:
        input_path = storage.get_local_path(req.file_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not input_path.exists():
        raise HTTPException(status_code=404, detail=f"Source file not found: {req.file_path}")

    strength = max(0.01, min(5.0, float(req.strength)))
    filter_str = f"unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount={strength:.2f}"

    stem = req.output_filename or f"sharpen_{uuid.uuid4().hex[:8]}"
    output_dir = storage.get_local_path("renders/vfx")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{stem}.mp4"

    cmd = [
        ffmpeg_service.ffmpeg_bin,
        "-y",
        "-i", str(input_path),
        "-vf", filter_str,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-c:a", "copy",
        str(output_path),
    ]

    result = await ffmpeg_service._run_ffmpeg(cmd)
    if result["returncode"] != 0:
        stderr = result.get("stderr", "")
        raise HTTPException(
            status_code=500,
            detail=f"FFmpeg sharpen failed: {stderr[-500:] if stderr else 'unknown error'}"
        )

    return {
        "status": "completed",
        "effect": "sharpen",
        "strength": strength,
        "filter_applied": filter_str,
        "output_path": f"renders/vfx/{output_path.name}",
    }
