from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.timeline_service import TimelineService
from app.schemas.timeline import TimelineStateSchema, TimelineSaveRequest, GraphicsClipCreateRequest

router = APIRouter(tags=["timelines"])

@router.get("/projects/{project_id}/timeline", response_model=TimelineStateSchema)
async def get_timeline(project_id: str, db: AsyncSession = Depends(get_db)):
    timeline = await TimelineService.get_timeline_by_project(db, project_id)
    if not timeline:
        raise HTTPException(status_code=404, detail="Timeline not found for project")
    return timeline

@router.put("/projects/{project_id}/timeline", response_model=TimelineStateSchema)
async def save_timeline(project_id: str, data: TimelineSaveRequest, db: AsyncSession = Depends(get_db)):
    saved = await TimelineService.save_timeline(db, project_id, data)
    return saved


@router.get("/projects/{project_id}/revisions")
@router.get("/projects/{project_id}/timeline/revisions")
@router.get("/timelines/projects/{project_id}/revisions")
async def list_timeline_revisions(project_id: str, db: AsyncSession = Depends(get_db)):
    """Lists all saved revisions for a project's timeline."""
    revisions = await TimelineService.get_revisions(db, project_id)
    return [
        {
            "id": r.id,
            "timeline_id": r.timeline_id,
            "revision_number": r.revision_number,
            "description": r.description,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "tracks_count": len(r.snapshot.get("tracks", [])) if isinstance(r.snapshot, dict) else 0,
            "duration_ms": r.snapshot.get("duration_ms", 0) if isinstance(r.snapshot, dict) else 0,
        }
        for r in revisions
    ]


@router.get("/projects/{project_id}/revisions/{revision_id}")
@router.get("/projects/{project_id}/timeline/revisions/{revision_id}")
@router.get("/timelines/revisions/{revision_id}")
async def get_timeline_revision(project_id: str = None, revision_id: str = None, db: AsyncSession = Depends(get_db)):
    """Returns a specific timeline revision with its snapshot."""
    rev = await TimelineService.get_revision(db, project_id, revision_id)
    if not rev:
        raise HTTPException(status_code=404, detail=f"Revision '{revision_id}' not found")
    return {
        "id": rev.id,
        "timeline_id": rev.timeline_id,
        "revision_number": rev.revision_number,
        "description": rev.description,
        "snapshot": rev.snapshot,
        "created_at": rev.created_at.isoformat() if rev.created_at else None,
    }


@router.post("/projects/{project_id}/revisions/{revision_id}/restore", response_model=TimelineStateSchema)
@router.post("/projects/{project_id}/timeline/revisions/{revision_id}/restore", response_model=TimelineStateSchema)
@router.post("/timelines/revisions/{revision_id}/restore", response_model=TimelineStateSchema)
async def restore_timeline_revision(project_id: str = None, revision_id: str = None, db: AsyncSession = Depends(get_db)):
    """Restores the timeline to the state in the specified revision snapshot."""
    try:
        restored = await TimelineService.restore_revision(db, project_id, revision_id)
        return restored
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


CINEMATIC_GRAPHICS_PRESETS = [
    {
        "id": "cinema_title",
        "name": "Cinema Title",
        "category": "cinematic",
        "title": "TAMIL AI FORGE",
        "subtitle": "EPIC FEATURE PRESENTATION",
        "tamil_text": "தமிழ் திரைப்படம்",
        "font_family": "Nirmala UI",
        "font_size": 48,
        "font_color": "#ffffff",
        "box_color": "#000000",
        "box_opacity": 0.6,
        "alignment": "center",
        "position_x": 0.5,
        "position_y": 0.5,
        "fade_in_ms": 600,
        "fade_out_ms": 600,
        "style_variant": "epic_title"
    },
    {
        "id": "lower_third",
        "name": "Character Lower Third",
        "category": "broadcast",
        "title": "AADHIRAN",
        "subtitle": "Cyberpunk Architect • Sector 7",
        "tamil_text": "ஆதிரன்",
        "font_family": "Nirmala UI",
        "font_size": 36,
        "font_color": "#ffffff",
        "box_color": "#000000",
        "box_opacity": 0.75,
        "alignment": "lower_third",
        "position_x": 0.08,
        "position_y": 0.80,
        "fade_in_ms": 400,
        "fade_out_ms": 400,
        "style_variant": "accent_badge"
    },
    {
        "id": "tamil_card",
        "name": "Tamil Typography Card",
        "category": "typography",
        "title": "வீரம் விளைந்த பூமி",
        "subtitle": "வரலாற்றுப் பின்னணி",
        "tamil_text": "வீரம் விளைந்த பூமி",
        "font_family": "Nirmala UI",
        "font_size": 44,
        "font_color": "#fbbf24",
        "box_color": "#050505",
        "box_opacity": 0.8,
        "alignment": "center",
        "position_x": 0.5,
        "position_y": 0.5,
        "fade_in_ms": 500,
        "fade_out_ms": 500,
        "style_variant": "tamil_gold"
    },
    {
        "id": "timestamp",
        "name": "Location / Timestamp",
        "category": "narrative",
        "title": "CHENNAI HARBOR • 04:42 IST",
        "subtitle": "COORDINATES: 13.0827° N, 80.2707° E",
        "tamil_text": "சென்னை துறைமுகம்",
        "font_family": "Consolas",
        "font_size": 24,
        "font_color": "#10b981",
        "box_color": "#000000",
        "box_opacity": 0.65,
        "alignment": "top_left",
        "position_x": 0.06,
        "position_y": 0.12,
        "fade_in_ms": 300,
        "fade_out_ms": 300,
        "style_variant": "terminal"
    },
    {
        "id": "chapter_heading",
        "name": "Chapter Heading",
        "category": "story",
        "title": "CHAPTER I: THE AWAKENING",
        "subtitle": "ஒரு புதிய விடியல்",
        "tamil_text": "அத்தியாயம் ஒன்று",
        "font_family": "Nirmala UI",
        "font_size": 40,
        "font_color": "#f1f5f9",
        "box_color": "#000000",
        "box_opacity": 0.5,
        "alignment": "center",
        "position_x": 0.5,
        "position_y": 0.48,
        "fade_in_ms": 500,
        "fade_out_ms": 500,
        "style_variant": "chapter_divider"
    },
    {
        "id": "credit_roll",
        "name": "Closing Credit Roll",
        "category": "credits",
        "title": "WRITTEN & DIRECTED BY",
        "subtitle": "TAMIL AI FORGE CINEMA ENGINE",
        "tamil_text": "இயக்கம் மற்றும் உருவாக்கம்",
        "font_family": "Nirmala UI",
        "font_size": 26,
        "font_color": "#cbd5e1",
        "box_color": "#000000",
        "box_opacity": 0.7,
        "alignment": "center",
        "position_x": 0.5,
        "position_y": 0.75,
        "fade_in_ms": 400,
        "fade_out_ms": 400,
        "style_variant": "credit_block"
    }
]


@router.get("/timelines/graphics-presets")
@router.get("/projects/{project_id}/timeline/graphics-presets")
async def list_graphics_presets(project_id: str = None):
    """Returns the list of 6 cinematic title and motion graphics presets."""
    return CINEMATIC_GRAPHICS_PRESETS


@router.post("/projects/{project_id}/timeline/graphics-clip")
async def create_graphics_clip(
    project_id: str,
    data: GraphicsClipCreateRequest,
    db: AsyncSession = Depends(get_db)
):
    """Creates a cinematic title / motion graphics clip on the timeline's graphics track."""
    res = await TimelineService.create_graphics_clip(db, project_id, data)
    return res


