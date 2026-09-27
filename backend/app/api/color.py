"""
Phase 5: Color Grading API.
- GET /presets  — list Tamil cinema color presets
- POST /apply   — apply color grade via real FFmpeg filter chain
- POST /grade   — apply color grade to a clip asset and return output path
"""
import uuid
from typing import List, Dict, Any, Optional
from pathlib import Path
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status
from app.core.ffmpeg import ffmpeg_service
from app.core.color_pipeline import build_color_filter_chain
from app.core.storage import storage

router = APIRouter(prefix="/color", tags=["color"])

COLOR_PRESETS: List[Dict[str, Any]] = [
    {
        "id": "cinematic-kollywood-warm",
        "name": "Kollywood Golden Glow",
        "description": "Warm golden highlights, deep shadows, rich skin tones for South Indian cinema.",
        "color_grade": {
            "lift": {"r": 0.02, "g": -0.01, "b": -0.04},
            "contrast": 1.18,
            "saturation": 1.12,
            "temperature": 7200,
            "vignette": {"enabled": True, "strength": 0.25},
            "grain": {"enabled": True, "strength": 15},
        },
    },
    {
        "id": "mass-action-high-contrast",
        "name": "Mass Action High Contrast",
        "description": "Punchy desaturated greens, high contrast for intense action sequences.",
        "color_grade": {
            "lift": {"r": -0.02, "g": -0.02, "b": -0.01},
            "contrast": 1.30,
            "saturation": 0.95,
            "temperature": 5800,
            "vignette": {"enabled": True, "strength": 0.35},
            "grain": {"enabled": True, "strength": 20},
        },
    },
    {
        "id": "melody-romantic-pastel",
        "name": "Melody Romantic Pastel",
        "description": "Soft highlights, lifted blacks, gentle pastel tones for romantic melodies.",
        "color_grade": {
            "lift": {"r": 0.04, "g": 0.03, "b": 0.05},
            "contrast": 1.05,
            "saturation": 1.08,
            "temperature": 6800,
        },
    },
    {
        "id": "vintage-classic-retro",
        "name": "Classic Tamil Vintage (80s)",
        "description": "Nostalgic film look with amber cast, warm shadows, 35mm grain.",
        "color_grade": {
            "lift": {"r": 0.05, "g": 0.02, "b": -0.02},
            "contrast": 1.10,
            "saturation": 0.88,
            "temperature": 7500,
            "grain": {"enabled": True, "strength": 35},
        },
    },
    {
        "id": "cyberpunk-neon-nocturne",
        "name": "Neon Nocturne",
        "description": "Deep cyan shadows and vibrant magenta/orange highlights for night scenes.",
        "color_grade": {
            "lift": {"r": -0.04, "g": 0.02, "b": 0.06},
            "contrast": 1.25,
            "saturation": 1.25,
            "temperature": 5000,
        },
    },
]


class ColorApplyRequest(BaseModel):
    file_path: str
    color_grade: Dict[str, Any]
    output_filename: Optional[str] = None


@router.get("/presets", response_model=List[Dict[str, Any]])
async def list_color_presets():
    """Return available Tamil cinema color presets."""
    return COLOR_PRESETS


@router.post("/apply")
async def apply_color_grade(req: ColorApplyRequest):
    """
    Apply a color grade to a media file using real FFmpeg filter chains.
    Accepts a color_grade dict and calls FFmpeg with the built filter string.
    Returns output_path on success or an error detail.
    """
    # 1. Resolve and validate the input path
    try:
        input_path = storage.get_local_path(req.file_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not input_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Source file not found: {req.file_path}"
        )

    # 2. Build FFmpeg filter chain from color_grade
    filters = build_color_filter_chain(req.color_grade)
    if not filters:
        raise HTTPException(
            status_code=400,
            detail="color_grade produced no filter adjustments. Provide at least one grading parameter."
        )

    filter_str = ",".join(filters)

    # 3. Build output path
    stem = req.output_filename or f"graded_{uuid.uuid4().hex[:8]}"
    output_dir = storage.get_local_path("renders/color")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{stem}.mp4"

    # 4. Run FFmpeg
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
            detail=f"FFmpeg color grade failed: {stderr[-500:] if stderr else 'unknown error'}"
        )

    return {
        "status": "completed",
        "output_path": f"renders/color/{output_path.name}",
        "filter_chain": filter_str,
        "input_file": req.file_path,
    }


@router.get("/filter-preview")
async def preview_filter_chain(preset_id: str):
    """Return the FFmpeg filter chain string for a given preset (for UI display/preview)."""
    preset = next((p for p in COLOR_PRESETS if p["id"] == preset_id), None)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    filters = build_color_filter_chain(preset.get("color_grade", {}))
    return {
        "preset_id": preset_id,
        "preset_name": preset["name"],
        "filter_chain": ",".join(filters) if filters else "none",
        "filters": filters,
    }
