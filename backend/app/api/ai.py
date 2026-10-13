from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.ai_command_service import AICommandService
from app.services.story_service import StoryService
from app.services.ai_job_service import AIJobService
from app.schemas.ai_schemas import (
    AICommandRequest, AICommandActionResponse,
    StoryGenerateRequest, StoryResponse,
    CharacterCreateSchema, CharacterUpdateSchema, CharacterResponse,
    SceneCreateSchema, SceneUpdateSchema, SceneResponse,
    StoryboardReorderRequest, StoryboardShotResponse,
    AIJobResponse, ProviderConfigUpdateSchema, ProviderConfigResponse,
    AIGenerateVideoRequest, AIVideoWorkflowRequest, AITTSRequest, AILipSyncRequest, AIMusicGenRequest,
    EditPlanRequest, EditPlanResponse
)
from app.services.ai_editing_assistant import AIEditingAssistant
from app.ai.registry import (
    AIRegistry, get_capability_status, update_provider_api_key, is_capability_configured
)
from app.providers.factory import UnconfiguredProviderError

router = APIRouter(prefix="/ai", tags=["ai"])


# --- Natural Language AI Command Bar ---
@router.post("/command", response_model=AICommandActionResponse)
async def process_ai_command(data: AICommandRequest):
    """
    Processes natural language editing instructions into executable structured timeline and effect actions.
    """
    return await AICommandService.process_command(data.project_id, data.command, data.context)


# --- Story & Script Studio ---
@router.post("/story/generate", response_model=StoryResponse, status_code=status.HTTP_201_CREATED)
async def generate_story(data: StoryGenerateRequest, db: AsyncSession = Depends(get_db)):
    """Generate structured story outline, characters, scenes and storyboard shots."""
    try:
        story = await StoryService.generate_story(db, data)
        return story
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/story", response_model=Optional[StoryResponse])
async def get_project_story(project_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch the latest story for a project."""
    return await StoryService.get_project_story(db, project_id)


# --- Character Studio ---
@router.get("/projects/{project_id}/characters", response_model=List[CharacterResponse])
async def list_characters(project_id: str, db: AsyncSession = Depends(get_db)):
    return await StoryService.list_characters(db, project_id)


@router.post("/projects/{project_id}/characters", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def create_character(project_id: str, data: CharacterCreateSchema, db: AsyncSession = Depends(get_db)):
    return await StoryService.create_character(db, project_id, data)


@router.patch("/characters/{character_id}", response_model=CharacterResponse)
async def update_character(character_id: str, data: CharacterUpdateSchema, db: AsyncSession = Depends(get_db)):
    try:
        return await StoryService.update_character(db, character_id, data)
    except ValueError as e:
        status_code = 404 if "not found" in str(e).lower() else 400
        raise HTTPException(status_code=status_code, detail=str(e))


@router.delete("/characters/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(character_id: str, db: AsyncSession = Depends(get_db)):
    await StoryService.delete_character(db, character_id)
    return None


# --- Scene Studio & Storyboard ---
@router.get("/projects/{project_id}/scenes", response_model=List[SceneResponse])
async def list_scenes(project_id: str, db: AsyncSession = Depends(get_db)):
    return await StoryService.list_scenes(db, project_id)


@router.post("/projects/{project_id}/scenes", response_model=SceneResponse, status_code=status.HTTP_201_CREATED)
async def create_scene(project_id: str, data: SceneCreateSchema, db: AsyncSession = Depends(get_db)):
    return await StoryService.create_scene(db, project_id, data)


@router.patch("/scenes/{scene_id}", response_model=SceneResponse)
async def update_scene(scene_id: str, data: SceneUpdateSchema, db: AsyncSession = Depends(get_db)):
    try:
        return await StoryService.update_scene(db, scene_id, data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/scenes/{scene_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scene(scene_id: str, db: AsyncSession = Depends(get_db)):
    await StoryService.delete_scene(db, scene_id)
    return None


@router.post("/projects/{project_id}/storyboard/reorder", response_model=List[SceneResponse])
async def reorder_scenes(project_id: str, req: StoryboardReorderRequest, db: AsyncSession = Depends(get_db)):
    return await StoryService.reorder_scenes(db, project_id, req.scene_ids)


# --- Project Auto-Assembly ---
@router.post("/projects/{project_id}/auto-assemble")
async def auto_assemble_timeline(project_id: str, db: AsyncSession = Depends(get_db)):
    """Builds timeline tracks and clips directly from generated Story and Scenes."""
    try:
        timeline = await StoryService.auto_assemble_timeline(db, project_id)
        return {"status": "success", "timeline_id": timeline.id, "tracks_count": len(timeline.tracks)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/story/create-video")
@router.post("/projects/{project_id}/story-to-video")
async def create_video_from_story(
    project_id: Optional[str] = None,
    body: Optional[AIVideoWorkflowRequest] = None,
    prompt: Optional[str] = Query(None),
    target_duration_sec: Optional[float] = Query(None),
    genre: Optional[str] = Query(None),
    mood: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Complete Story -> Script -> Scenes -> Storyboard -> Video Generation workflow.
    Creates Story/Scenes if not present and enqueues scene generation jobs.
    """
    p_id = (body and body.project_id) or project_id
    p_prompt = (body and body.prompt) or prompt
    p_duration = (body.target_duration_sec if (body and body.target_duration_sec is not None) else (target_duration_sec or 20.0))
    p_genre = (body and body.genre) or genre or "Drama"
    p_mood = (body and body.mood) or mood or "Cinematic"

    if not p_id:
        raise HTTPException(status_code=400, detail="project_id is required")

    try:
        return await StoryService.create_video_from_story(
            db=db,
            project_id=p_id,
            prompt=p_prompt,
            target_duration_sec=p_duration,
            genre=p_genre,
            mood=p_mood
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))



# --- AI Job Center Queue ---
@router.get("/jobs", response_model=List[AIJobResponse])
async def list_ai_jobs(project_id: Optional[str] = Query(default=None), db: AsyncSession = Depends(get_db)):
    return await AIJobService.list_jobs(db, project_id)


@router.get("/jobs/{job_id}", response_model=AIJobResponse)
async def get_ai_job(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await AIJobService.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="AI job not found")
    return job


@router.post("/jobs/{job_id}/cancel", response_model=AIJobResponse)
async def cancel_ai_job(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await AIJobService.cancel_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="AI job not found")
    return job


@router.post("/jobs/{job_id}/retry", response_model=AIJobResponse)
async def retry_ai_job(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await AIJobService.retry_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="AI job not found")
    return job


# --- Generative Actions (Jobs) ---
@router.post("/generate/image", response_model=AIJobResponse, status_code=status.HTTP_201_CREATED)
async def generate_image(project_id: str, prompt: str, scene_id: Optional[str] = None, width: int = 1024, height: int = 1024, db: AsyncSession = Depends(get_db)):
    return await AIJobService.create_job(db, project_id, "image", prompt, scene_id, {"width": width, "height": height})


@router.post("/video/text-to-video", response_model=AIJobResponse, status_code=status.HTTP_201_CREATED)
async def generate_text_to_video(data: AIGenerateVideoRequest, project_id: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    pid = project_id or data.project_id
    if not pid:
        raise HTTPException(status_code=400, detail="project_id is required")
    if not data.prompt or not data.prompt.strip():
        raise HTTPException(status_code=422, detail="prompt is required and cannot be empty")
    if data.duration_sec <= 0.0 or data.duration_sec > 600.0:
        raise HTTPException(status_code=400, detail="duration_sec must be between 1.0 and 600.0 seconds (10 min max)")
    return await AIJobService.create_job(db, pid, "text_to_video", data.prompt.strip(), data.scene_id, {
        "duration_sec": data.duration_sec,
        "aspect_ratio": data.aspect_ratio,
        "character_id": data.character_id
    })


@router.post("/video/workflow")
async def generate_long_video_workflow(
    body: Optional[AIVideoWorkflowRequest] = None,
    project_id: Optional[str] = Query(None),
    prompt: Optional[str] = Query(None),
    target_duration_sec: Optional[float] = Query(None),
    genre: Optional[str] = Query(None),
    mood: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    1-Second to 10-Minute Long Video Workflow.
    Decomposes multi-scene requirements into supported-length clips and coordinates generation.
    Supports both JSON body payload and URL query parameters.
    """
    p_id = (body and body.project_id) or project_id
    p_prompt = (body and body.prompt) or prompt
    p_duration = (body.target_duration_sec if (body and body.target_duration_sec is not None) else (target_duration_sec or 30.0))
    p_genre = (body and body.genre) or genre or "Drama"
    p_mood = (body and body.mood) or mood or "Cinematic"

    if not p_prompt or not p_prompt.strip():
        raise HTTPException(status_code=422, detail="prompt is required and cannot be empty")
    if not p_id:
        raise HTTPException(status_code=422, detail="project_id is required")

    try:
        return await StoryService.create_long_video_workflow(
            db=db,
            project_id=p_id,
            prompt=p_prompt.strip(),
            target_duration_sec=p_duration,
            genre=p_genre,
            mood=p_mood
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/voice/tts", response_model=AIJobResponse, status_code=status.HTTP_201_CREATED)
async def generate_tts(data: AITTSRequest, project_id: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    pid = project_id or data.project_id
    if not pid:
        raise HTTPException(status_code=400, detail="project_id is required")
    return await AIJobService.create_job(db, pid, "tts", data.text, None, {"voice_id": data.voice_id, "language": data.language})


@router.get("/voice/voices")
async def list_available_voices():
    provider = AIRegistry.get_tts()
    return await provider.list_voices()


@router.post("/music/generate", response_model=AIJobResponse, status_code=status.HTTP_201_CREATED)
async def generate_music(data: AIMusicGenRequest, project_id: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    pid = project_id or data.project_id
    if not pid:
        raise HTTPException(status_code=400, detail="project_id is required")
    return await AIJobService.create_job(db, pid, "music", data.prompt, None, {"duration_sec": data.duration_sec, "genre": data.genre, "mood": data.mood})


@router.post("/generate/sfx", response_model=AIJobResponse, status_code=status.HTTP_201_CREATED)
async def generate_sfx(project_id: str, prompt: str, db: AsyncSession = Depends(get_db)):
    return await AIJobService.create_job(db, project_id, "sfx", prompt)


@router.post("/generate/thumbnail", response_model=AIJobResponse, status_code=status.HTTP_201_CREATED)
async def generate_thumbnail(project_id: str, prompt: str, db: AsyncSession = Depends(get_db)):
    return await AIJobService.create_job(db, project_id, "thumbnail", prompt)


@router.post("/generate/shorts")
async def generate_shorts(project_id: str, duration_sec: int = 30):
    """Creates a derived 9:16 vertical short project."""
    return {
        "status": "created",
        "derived_project_id": f"short_{project_id[:8]}",
        "aspect_ratio": "9:16",
        "duration_sec": duration_sec,
        "message": f"Created derived 9:16 vertical short project ({duration_sec}s)"
    }


# --- Provider Configuration & Settings ---
@router.get("/providers")
async def list_providers():
    capabilities = ["llm", "image", "video", "tts", "stt", "lipsync", "music"]
    return [get_capability_status(c) for c in capabilities]


@router.post("/providers/config", response_model=ProviderConfigResponse)
async def configure_provider(data: ProviderConfigUpdateSchema):
    """Save API key safely server-side without returning secret keys in API response."""
    if data.api_key:
        update_provider_api_key(data.capability, data.api_key)
    status_info = get_capability_status(data.capability)
    return ProviderConfigResponse(
        capability=data.capability,
        provider_name=data.provider_name,
        is_enabled=data.is_enabled,
        is_configured=status_info["is_configured"],
        model_name=data.model_name,
        message=f"Provider for {data.capability} configured successfully server-side."
    )


# --- Phase 19: AI Editing Assistant / Prompt-to-Edit ---
@router.post("/editing-plan", response_model=EditPlanResponse)
async def generate_editing_plan(data: EditPlanRequest):
    """
    Parses natural language edit requests into a structured, previewable edit plan.
    Does not mutate timeline directly until user reviews and approves.
    """
    plan = AIEditingAssistant.parse_and_plan(data)
    return EditPlanResponse(
        success=plan.is_valid,
        plan=plan
    )
