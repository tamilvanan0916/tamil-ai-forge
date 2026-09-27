"""
Phase 5: LUT Management API.
Supports uploading, listing, and deleting .cube files for 3D LUT color grading.
"""

import uuid
from typing import List, Dict, Any
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, status
from app.core.storage import storage
from app.core.color_pipeline import validate_cube_lut

router = APIRouter(prefix="/luts", tags=["luts"])

LUT_DIR = storage.get_local_path("luts")
LUT_DIR.mkdir(parents=True, exist_ok=True)


@router.get("", response_model=List[Dict[str, Any]])
async def list_luts():
    """List all available .cube LUT files."""
    luts = []
    # Seed built-in LUT entries if directory is scanned
    for lut_file in LUT_DIR.glob("*.cube"):
        luts.append({
            "id": lut_file.stem,
            "name": lut_file.stem.replace("_", " ").title(),
            "filename": lut_file.name,
            "path": f"storage/luts/{lut_file.name}",
            "size_bytes": lut_file.stat().st_size,
        })
    return luts


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_lut(file: UploadFile = File(...)):
    """Upload and validate a .cube 3D LUT file."""
    if not file.filename or not file.filename.lower().endswith(".cube"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .cube LUT files are supported"
        )

    content = await file.read()
    is_valid, err_msg = validate_cube_lut(content)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid .cube LUT file: {err_msg}"
        )

    # Sanitize filename
    safe_stem = "".join(c for c in Path(file.filename).stem if c.isalnum() or c in ("-", "_")).strip()
    if not safe_stem:
        safe_stem = f"lut_{uuid.uuid4().hex[:8]}"

    target_filename = f"{safe_stem}.cube"
    target_path = LUT_DIR / target_filename

    target_path.write_bytes(content)

    return {
        "id": safe_stem,
        "name": safe_stem.replace("_", " ").title(),
        "filename": target_filename,
        "path": f"storage/luts/{target_filename}",
        "size_bytes": len(content),
        "message": "LUT uploaded successfully",
    }


@router.delete("/{lut_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lut(lut_id: str):
    """Delete a LUT file by ID."""
    target_path = LUT_DIR / f"{lut_id}.cube"
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="LUT not found")
    target_path.unlink()
    return None
