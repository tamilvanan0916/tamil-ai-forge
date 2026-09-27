from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.project import Project
from app.models.ai_models import Story, Scene, ProductionPlan
from app.models.asset import Asset
from app.models.caption import Caption
from app.services.production_orchestrator import AIProductionOrchestrator
from app.services.story_service import StoryService
from app.services.project_service import ProjectService
from app.schemas.project import ProjectCreate
from app.schemas.production_schemas import (
    FilmCreateRequest, FilmAnalyzeRequest, SceneGenerateRequest,
    SceneRegenerateRequest, SceneExtendRequest, FilmProduceAllRequest
)

router = APIRouter(prefix="/film", tags=["film"])


@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_film(
    req: FilmCreateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Creates an end-to-end AI Film Production project from a user prompt/idea:
    Project -> Story & Script -> Characters -> Scenes -> Storyboard -> Production Plan.
    """
    title = req.title or f"Film: {req.prompt[:30]}..."
    proj = await ProjectService.create_project(
        db,
        ProjectCreate(
            title=title,
            description=f"AI Film Production: {req.prompt}"
        )
    )

    # 1. Story Analysis & Generation
    analysis = await StoryService.analyze_story(
        db=db,
        project_id=proj.id,
        prompt=req.prompt,
        target_duration_sec=req.target_duration_sec,
        genre=req.genre,
        mood=req.mood,
        language=req.language,
        aspect_ratio=req.aspect_ratio
    )

    # 2. Create Production Plan
    plan = await AIProductionOrchestrator.create_production_plan(
        db=db,
        project_id=proj.id,
        prompt=req.prompt,
        target_duration_sec=req.target_duration_sec,
        genre=req.genre,
        mood=req.mood,
        aspect_ratio=req.aspect_ratio
    )

    # 3. Generate Storyboard
    storyboard = await StoryService.generate_production_storyboard(db, proj.id)

    chars_list = [
        {
            "id": c.id,
            "name": c.name,
            "tamil_name": c.tamil_name,
            "age": c.age,
            "gender": c.gender,
            "appearance": c.appearance,
            "clothing": c.clothing,
            "hair": c.hair,
            "skin": c.skin,
            "personality": c.personality,
            "voice_id": c.voice_id,
            "visual_style": c.visual_style,
            "is_locked": c.is_locked
        } for c in analysis.get("characters", [])
    ]
    scenes_list = [
        {
            "id": s.id,
            "scene_number": s.scene_number,
            "title": s.title,
            "description": s.description,
            "duration_sec": s.duration_sec,
            "location": s.location,
            "time_of_day": s.time_of_day,
            "mood": s.mood,
            "visual_prompt": s.visual_prompt,
            "camera_directions": s.camera_directions,
            "dialogue_text": s.dialogue_text,
            "audio_prompt": s.audio_prompt,
            "status": s.status
        } for s in analysis.get("scenes", [])
    ]
    story_obj = analysis.get("story")
    story_data = {
        "id": story_obj.id if story_obj else None,
        "title": story_obj.title if story_obj else None,
        "synopsis": story_obj.synopsis if story_obj else None,
        "genre": story_obj.genre if story_obj else None
    }

    return {
        "status": "created",
        "project_id": proj.id,
        "title": title,
        "plan_id": plan.id,
        "project": {
            "id": proj.id,
            "title": proj.title,
            "aspect_ratio": req.aspect_ratio or "16:9"
        },
        "story": story_data,
        "characters": chars_list,
        "scenes": scenes_list,
        "storyboards": storyboard,
        "analysis": {
            "title": analysis.get("title"),
            "synopsis": analysis.get("synopsis"),
            "genre": analysis.get("genre"),
            "tone": analysis.get("tone"),
            "visual_style": analysis.get("visual_style"),
            "target_duration": analysis.get("target_duration"),
            "characters": chars_list,
            "scenes": scenes_list,
            "analysis_summary": analysis.get("analysis_summary", {})
        },
        "scenes_count": len(scenes_list),
        "storyboard_shots_count": len(storyboard)
    }


@router.get("/{project_id}")
async def get_film(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves the complete state of a film production project.
    """
    p_res = await db.execute(select(Project).where(Project.id == project_id))
    proj = p_res.scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    status_data = await AIProductionOrchestrator.get_production_status(db, project_id)
    story = await StoryService.get_project_story(db, project_id)
    characters = await StoryService.list_characters(db, project_id)
    scenes = await StoryService.list_scenes(db, project_id)

    return {
        "project_id": project_id,
        "title": proj.title,
        "story": {
            "id": story.id if story else None,
            "title": story.title if story else None,
            "synopsis": story.synopsis if story else None,
            "genre": story.genre if story else None
        } if story else None,
        "characters_count": len(characters),
        "scenes_count": len(scenes),
        "production_status": status_data,
        "master_render": status_data.get("master_render")
    }


@router.get("/{project_id}/master")
async def get_film_master(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the completed master film render asset and playback metadata.
    """
    status_data = await AIProductionOrchestrator.get_production_status(db, project_id)
    master = status_data.get("master_render")
    if not master:
        render_info = status_data.get("breakdown", {}).get("render", {})
        raise HTTPException(
            status_code=404,
            detail=f"No completed master render found for project '{project_id}'. Current render status: {render_info.get('status', 'IDLE')}"
        )
    return master


@router.post("/{project_id}/analyze")
async def analyze_film_story(
    project_id: str,
    req: FilmAnalyzeRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Performs deep story and script analysis for the project, extracting
    characters, scenes, camera movements, dialogue, music, and SFX.
    """
    try:
        return await StoryService.analyze_story(
            db=db,
            project_id=project_id,
            prompt=req.prompt,
            target_duration_sec=req.target_duration_sec,
            genre=req.genre,
            mood=req.mood,
            language=req.language,
            aspect_ratio=req.aspect_ratio
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/generate")
async def generate_film_scenes(
    project_id: str,
    force: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """
    Launches or resumes generation for all planned scenes in the film project.
    """
    pl_res = await db.execute(
        select(ProductionPlan)
        .where(ProductionPlan.project_id == project_id)
        .order_by(ProductionPlan.created_at.desc())
    )
    plan = pl_res.scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail=f"No ProductionPlan found for project '{project_id}'")

    try:
        res = await AIProductionOrchestrator.start_production_plan(
            db=db,
            plan_id=plan.id,
            force=force
        )
        return {
            "status": "generating",
            "project_id": project_id,
            "plan_id": plan.id,
            "tasks": res.get("enqueued_tasks", []),
            "enqueued_tasks": res.get("enqueued_tasks", []),
            "skipped_tasks": res.get("skipped_idempotent_tasks", [])
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{project_id}/progress")
async def get_film_progress(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Returns live multi-stage production progress:
    Overall, Story, Characters, Scenes, Video, Voice, Music, Captions, Render.
    """
    return await AIProductionOrchestrator.get_production_status(db, project_id)


@router.post("/scenes/{scene_id}/generate")
async def generate_scene(
    scene_id: str,
    req: Optional[SceneGenerateRequest] = None,
    strategy: str = Query("text_to_video"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates a single scene using Text-to-Video, Image-to-Video, or Video-to-Video.
    """
    strat = (req and req.strategy) or strategy
    p = req and req.prompt
    ref_img = req and req.reference_image
    src_vid = req and req.source_video
    dur = req and req.duration_sec

    try:
        return await AIProductionOrchestrator.create_scene_generation_task(
            db=db,
            scene_id=scene_id,
            strategy=strat,
            prompt=p,
            reference_image=ref_img,
            source_video=src_vid,
            duration_sec=dur
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/scenes/{scene_id}/regenerate")
async def regenerate_scene(
    scene_id: str,
    req: Optional[SceneRegenerateRequest] = None,
    prompt: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Regenerates a single scene. Preserves previous valid asset if regeneration fails.
    """
    custom_p = (req and req.prompt) or prompt
    try:
        return await AIProductionOrchestrator.regenerate_scene(
            db=db,
            scene_id=scene_id,
            custom_prompt=custom_p
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/scenes/{scene_id}/extend")
async def extend_scene(
    scene_id: str,
    req: Optional[SceneExtendRequest] = None,
    extend_sec: float = Query(4.0),
    prompt: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Extends a scene's duration. Requires an existing valid video asset.
    """
    sec = (req and req.extend_sec) or extend_sec
    custom_p = (req and req.prompt) or prompt
    try:
        return await AIProductionOrchestrator.extend_scene(
            db=db,
            scene_id=scene_id,
            extend_sec=sec,
            custom_prompt=custom_p
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/scenes/{scene_id}/versions")
async def get_scene_versions(
    scene_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves all generation versions for a scene.
    """
    return await AIProductionOrchestrator.get_scene_versions(db, scene_id)


@router.post("/{project_id}/generate-audio")
async def generate_film_audio(
    project_id: str,
    language: str = Query("ta"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates dialogue audio assets and background music for the film.
    """
    dialogue = await AIProductionOrchestrator.orchestrate_dialogue_audio(db, project_id, language=language)
    music = await AIProductionOrchestrator.orchestrate_music(db, project_id)
    return {
        "project_id": project_id,
        "dialogue_tasks": dialogue,
        "music": music
    }


@router.post("/{project_id}/generate-captions")
async def generate_film_captions(
    project_id: str,
    language: str = Query("ta"),
    db: AsyncSession = Depends(get_db)
):
    """
    Generates timed captions from scene dialogue and narration.
    """
    captions = await AIProductionOrchestrator.orchestrate_captions(db, project_id, language=language)
    return {
        "project_id": project_id,
        "captions_count": len(captions),
        "captions": captions
    }


@router.post("/{project_id}/assemble")
async def assemble_film_timeline(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Assembles the film timeline using strictly probed FFprobe media durations.
    """
    try:
        timeline = await AIProductionOrchestrator.auto_assemble_production_timeline(db, project_id)
        return {
            "success": True,
            "status": "success",
            "timeline_id": timeline.id,
            "duration_ms": timeline.duration_ms,
            "tracks_count": len(timeline.tracks)
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/render")
async def render_film(
    project_id: str,
    req: Optional[Dict[str, Any]] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Enqueues the final film production for rendering.
    """
    from app.services.render_service import RenderService
    from app.services.timeline_service import TimelineService
    from app.schemas.render import RenderEnqueueRequest, ExportPreset
    from app.models.timeline import Timeline

    tl_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
    tl = tl_res.scalar_one_or_none()
    if not tl:
        tl = await TimelineService.get_or_create_timeline(db, project_id)

    fmt = (req and req.get("export_format")) or (req and req.get("format")) or "mp4"
    preset_kwargs = {
        "format": fmt,
        "width": (req and req.get("width")) or 1920,
        "height": (req and req.get("height")) or 1080,
    }
    if req:
        for k in ["framing_mode", "burn_subtitles", "export_stems", "fps", "video_codec", "audio_codec", "crf"]:
            if k in req:
                preset_kwargs[k] = req[k]

    req_render = RenderEnqueueRequest(
        timeline_id=tl.id,
        export_preset=ExportPreset(**preset_kwargs)
    )
    job = await RenderService.enqueue_render(db, project_id, req_render)
    return {
        "status": "queued",
        "job_id": job.id,
        "render_job_id": job.id,
        "project_id": project_id,
        "resolution": f"{preset_kwargs.get('width', 1920)}x{preset_kwargs.get('height', 1080)}",
        "message": "Film render job queued successfully."
    }


@router.post("/{project_id}/produce-all")
async def produce_all_film(
    project_id: str,
    req: Optional[FilmProduceAllRequest] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Executes the complete "From Words to Cinema" end-to-end production pipeline:
    Story/Plan -> Scene Media -> Dialogue Audio -> Music -> Captions -> Timeline Assembly -> Render Enqueue.
    """
    prompt = req.prompt if req else None
    target_dur = req.target_duration_sec if req else 30.0
    genre = req.genre if req else "Emotional Tamil"
    mood = req.mood if req else "Cinematic"
    language = req.language if req else "ta"
    aspect_ratio = req.aspect_ratio if req else "16:9"
    force = req.force if req else False

    try:
        res = await AIProductionOrchestrator.produce_full_film(
            db=db,
            project_id=project_id,
            prompt=prompt,
            target_duration_sec=target_dur,
            genre=genre,
            mood=mood,
            language=language,
            aspect_ratio=aspect_ratio,
            force=force
        )
        if res.get("status") == "failed":
            raise HTTPException(status_code=400, detail=res.get("error", "Production pipeline failed."))
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{project_id}/deliverables")
async def get_film_deliverables(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Returns the complete film delivery package:
    - Master video (MP4) with FFprobe metadata
    - Subtitled master video (if burned or available)
    - Separated audio stems (Dialogue, Music, SFX)
    - Subtitle files (SRT, VTT)
    - Deliverables file inventory ready for client/festival submission
    """
    p_res = await db.execute(select(Project).where(Project.id == project_id))
    proj = p_res.scalar_one_or_none()
    if not proj:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    status_data = await AIProductionOrchestrator.get_production_status(db, project_id)
    master = status_data.get("master_render")

    # Audio Stems resolution
    stems = {
        "dialogue": None,
        "music": None,
        "sfx": None
    }

    # First check master asset metadata
    if master and master.get("asset_id"):
        a_res = await db.execute(select(Asset).where(Asset.id == master["asset_id"]))
        master_asset = a_res.scalar_one_or_none()
        if master_asset and master_asset.metadata_info and "stems" in master_asset.metadata_info:
            for role, stem_info in master_asset.metadata_info["stems"].items():
                if role in stems:
                    stems[role] = stem_info

    # Also search project assets for audio stems if not already resolved
    stems_assets_res = await db.execute(
        select(Asset).where(
            Asset.project_id == project_id,
            Asset.asset_type == "audio"
        )
    )
    for a in stems_assets_res.scalars().all():
        role = (a.metadata_info or {}).get("role") or (a.metadata_info or {}).get("stem")
        if role in stems and not stems[role]:
            stems[role] = {
                "asset_id": a.id,
                "role": role,
                "file_name": a.file_name,
                "media_url": f"/api/v1/media/{a.storage_key}" if a.storage_key else None,
                "file_size_bytes": a.file_size_bytes or 0,
                "duration_ms": a.duration_ms or 0
            }

    # Captions check
    cap_res = await db.execute(select(Caption).where(Caption.project_id == project_id))
    captions_list = list(cap_res.scalars().all())
    has_captions = len(captions_list) > 0

    subtitles_info = {
        "count": len(captions_list),
        "has_subtitles": has_captions,
        "srt_url": f"/api/v1/projects/{project_id}/captions/export/srt" if has_captions else None,
        "vtt_url": f"/api/v1/projects/{project_id}/captions/export/vtt" if has_captions else None,
    }

    # Subtitled video: if master was burned in or separate
    subtitled_video = None
    if master:
        preset = master.get("export_preset") or {}
        if preset.get("burn_subtitles"):
            subtitled_video = master.get("media_url") or master.get("download_url")

    # Inventory of all deliverables
    inventory = []
    if master and (master.get("media_url") or master.get("download_url")):
        inventory.append({
            "name": f"{proj.title} - Master Video",
            "type": "video_master",
            "format": str(master.get("format") or "mp4").upper(),
            "url": master.get("media_url") or master.get("download_url"),
            "resolution": f"{master.get('width', 1920)}x{master.get('height', 1080)}",
            "fps": master.get("fps", 30.0),
            "size_bytes": master.get("file_size", 0)
        })

    if subtitled_video:
        inventory.append({
            "name": f"{proj.title} - Subtitled Master (Burned-in)",
            "type": "video_subtitled",
            "format": str(master.get("format") or "mp4").upper(),
            "url": subtitled_video,
            "resolution": f"{master.get('width', 1920)}x{master.get('height', 1080)}",
            "fps": master.get("fps", 30.0),
            "size_bytes": master.get("file_size", 0)
        })

    for stem_role, stem_data in stems.items():
        if stem_data and (stem_data.get("media_url") or stem_data.get("url")):
            inventory.append({
                "name": f"{proj.title} - {stem_role.capitalize()} Stem",
                "type": f"audio_stem_{stem_role}",
                "format": "WAV",
                "url": stem_data.get("media_url") or stem_data.get("url"),
                "size_bytes": stem_data.get("file_size_bytes", 0)
            })

    if has_captions:
        inventory.append({
            "name": f"{proj.title} - Subtitles (SRT)",
            "type": "subtitles_srt",
            "format": "SRT",
            "url": f"/api/v1/projects/{project_id}/captions/export/srt",
            "size_bytes": None
        })
        inventory.append({
            "name": f"{proj.title} - Subtitles (WebVTT)",
            "type": "subtitles_vtt",
            "format": "VTT",
            "url": f"/api/v1/projects/{project_id}/captions/export/vtt",
            "size_bytes": None
        })

    return {
        "project_id": project_id,
        "title": proj.title,
        "has_master": master is not None,
        "master_video": master,
        "subtitled_video": subtitled_video,
        "audio_stems": stems,
        "subtitles": subtitles_info,
        "deliverables": inventory,
        "total_deliverables_count": len(inventory),
        "is_master_stale": status_data.get("is_master_stale", False),
    }

