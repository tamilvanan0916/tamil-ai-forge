"""
Phase 5: Object/Feature Tracking API.
Performs real optical motion tracking across video frames using OpenCV when available.
Returns honest 'unavailable' status when OpenCV or media file is missing.
No synthetic or fake coordinates are ever generated.
"""

from typing import Optional, List, Dict, Any
from pathlib import Path
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status
from app.core.storage import storage

router = APIRouter(prefix="/tracking", tags=["tracking"])


class TrackingRequest(BaseModel):
    asset_id: Optional[str] = None
    file_path: Optional[str] = None
    bbox: List[float] = [0.4, 0.4, 0.2, 0.2]  # [x, y, w, h] normalized (0.0 - 1.0)
    start_frame: int = 0
    end_frame: int = 100


def _get_opencv_tracker(cv2_mod: Any) -> Any:
    """Helper to instantiate OpenCV object tracker across OpenCV versions."""
    for factory_name in ["TrackerCSRT_create", "TrackerKCF_create", "TrackerMIL_create"]:
        if hasattr(cv2_mod, factory_name):
            return getattr(cv2_mod, factory_name)()
    if hasattr(cv2_mod, "legacy"):
        for factory_name in ["TrackerCSRT_create", "TrackerKCF_create", "TrackerMIL_create"]:
            if hasattr(cv2_mod.legacy, factory_name):
                return getattr(cv2_mod.legacy, factory_name)()
    return None


@router.post("/analyze")
async def analyze_tracking(req: TrackingRequest):
    """
    Analyzes object motion across video frames using OpenCV tracker.
    Returns honest 'unavailable' state if OpenCV is not installed or file is missing.
    """
    if not req.asset_id and not req.file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either asset_id or file_path is required"
        )

    # 1. Resolve local path
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
            "message": f"Media file not found or inaccessible at '{req.file_path or req.asset_id}'",
            "required_dependency": None,
            "tracked_points": [],
        }

    # 2. Check OpenCV dependency
    try:
        import cv2
    except ImportError:
        return {
            "status": "unavailable",
            "message": "OpenCV motion tracking module is not installed in python environment.",
            "required_dependency": "opencv-contrib-python",
            "tracked_points": [],
        }

    tracker = _get_opencv_tracker(cv2)
    if tracker is None:
        return {
            "status": "unavailable",
            "message": "OpenCV tracking modules (CSRT/KCF/MIL) are unavailable in this opencv build.",
            "required_dependency": "opencv-contrib-python",
            "tracked_points": [],
        }

    # 3. Perform REAL OpenCV VideoCapture and tracking
    cap = cv2.VideoCapture(str(local_path))
    if not cap.isOpened():
        return {
            "status": "unavailable",
            "message": f"Could not open video stream from '{local_path.name}'",
            "required_dependency": None,
            "tracked_points": [],
        }

    img_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1920)
    img_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1080)

    # Seek to start frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, req.start_frame)
    ret, frame = cap.read()
    if not ret or frame is None:
        cap.release()
        return {
            "status": "unavailable",
            "message": f"Frame {req.start_frame} could not be read from video.",
            "required_dependency": None,
            "tracked_points": [],
        }

    # Convert normalized bbox to pixel coordinates (x, y, w, h)
    bx, by, bw, bh = req.bbox
    pixel_bbox = (
        int(bx * img_w),
        int(by * img_h),
        max(5, int(bw * img_w)),
        max(5, int(bh * img_h)),
    )

    try:
        tracker.init(frame, pixel_bbox)
    except Exception as e:
        cap.release()
        return {
            "status": "unavailable",
            "message": f"OpenCV tracker initialization error: {e}",
            "required_dependency": None,
            "tracked_points": [],
        }

    tracked_points: List[Dict[str, Any]] = []
    current_frame_idx = req.start_frame

    # Initial frame point
    tracked_points.append({
        "frame": current_frame_idx,
        "x": round(bx, 4),
        "y": round(by, 4),
        "w": round(bw, 4),
        "h": round(bh, 4),
        "confidence": 1.0,
    })

    while cap.isOpened() and current_frame_idx < req.end_frame:
        ret, frame = cap.read()
        if not ret or frame is None:
            break
        current_frame_idx += 1

        success, new_box = tracker.update(frame)
        if success:
            nx, ny, nw, nh = new_box
            tracked_points.append({
                "frame": current_frame_idx,
                "x": round(nx / img_w, 4),
                "y": round(ny / img_h, 4),
                "w": round(nw / img_w, 4),
                "h": round(nh / img_h, 4),
                "confidence": 0.9,
            })
        else:
            # Tracking lost
            break

    cap.release()

    return {
        "status": "completed",
        "start_frame": req.start_frame,
        "end_frame": current_frame_idx,
        "tracked_points": tracked_points,
    }
