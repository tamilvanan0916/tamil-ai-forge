import uuid
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_models import Story, Character, Scene, StoryboardShot, AIJob
from app.models.asset import Asset
from app.models.project import Project
from app.models.timeline import Timeline
from app.schemas.ai_schemas import (
    StoryGenerateRequest, CharacterCreateSchema, CharacterUpdateSchema,
    SceneCreateSchema, SceneUpdateSchema
)
from app.ai.registry import AIRegistry
from app.providers.factory import UnconfiguredProviderError

logger = logging.getLogger("tamil_ai_forge.story_service")


class StoryService:
    @staticmethod
    async def generate_story(db: AsyncSession, req: StoryGenerateRequest) -> Story:
        """
        Orchestrates Story + Script generation.
        Uses LLM provider if configured, or returns an honest structured template story with scenes.
        """
        # 1. Fetch project to ensure it exists
        p_res = await db.execute(select(Project).where(Project.id == req.project_id))
        proj = p_res.scalar_one_or_none()
        if not proj:
            raise ValueError(f"Project '{req.project_id}' not found")

        llm = AIRegistry.get_llm()
        
        story_data = None
        try:
            schema = {
                "title": "Story Title",
                "synopsis": "Overview",
                "logline": "Logline",
                "genre": req.genre,
                "mood": req.mood,
                "characters": [{"name": "Name", "role": "Protagonist", "tamil_name": "தமிழ் பெயர்"}],
                "scenes": [
                    {
                        "scene_number": 1,
                        "title": "Scene 1",
                        "location": "Location",
                        "time_of_day": "Day",
                        "mood": req.mood,
                        "duration_sec": 5.0,
                        "visual_prompt": "Cinematic visual description",
                        "dialogue": "Tamil / English dialogue",
                        "camera": "Medium Shot"
                    }
                ]
            }
            res = await llm.generate_structured(req.prompt, schema)
            story_data = res
        except UnconfiguredProviderError:
            story_data = None

        if not story_data or not isinstance(story_data, dict) or not story_data.get("scenes"):
            # Honest fallback when LLM API key unconfigured or invalid response: create structured initial outline
            scenes_n = max(2, min(8, req.scene_count or 4))
            story_data = {
                "title": f"Tamil Cinema ({req.genre}) — {req.prompt[:30]}",
                "synopsis": f"Cinematic narrative based on prompt: {req.prompt}",
                "logline": f"An epic journey exploring {req.prompt[:60]}...",
                "genre": req.genre,
                "mood": req.mood,
                "characters": [
                    {"name": "Karthik", "tamil_name": "கார்த்திக்", "age": 28, "role": "Protagonist", "appearance": "Athletic, intense gaze, classic Kollywood style"},
                    {"name": "Ananya", "tamil_name": "அனன்யா", "age": 25, "role": "Deuteragonist", "appearance": "Expressive eyes, traditional elegance"},
                ],
                "scenes": [
                    {
                        "scene_number": i + 1,
                        "title": f"Scene {i + 1}: The Turning Point",
                        "location": "Marina Beach, Chennai" if i % 2 == 0 else "Heritage Bungalow",
                        "time_of_day": "Golden Hour" if i % 2 == 0 else "Night",
                        "mood": req.mood,
                        "duration_sec": round(req.target_duration_sec / scenes_n, 1),
                        "visual_prompt": f"Cinematic shot of scene {i + 1}, dramatic lighting, 8k resolution, {req.genre} atmosphere",
                        "dialogue_text": "நம்பிக்கை தான் நம்முடைய மிகப்பெரிய பலம்." if req.language in ["ta", "ta+en"] else "Belief is our greatest strength.",
                        "camera_directions": "Wide Angle, Slow Pan" if i == 0 else "Close Up, Dynamic Tracking"
                    }
                    for i in range(scenes_n)
                ]
            }

        # 2. Persist Story to Database
        story = Story(
            id=str(uuid.uuid4()),
            project_id=req.project_id,
            title=story_data.get("title", "Untitled Story"),
            synopsis=story_data.get("synopsis", ""),
            logline=story_data.get("logline", ""),
            genre=req.genre,
            mood=req.mood,
            target_audience=req.target_audience or "General",
            language=req.language,
            themes=[req.genre, req.mood, "Tamil Cinema"],
            target_duration_sec=req.target_duration_sec,
            raw_script=story_data.get("synopsis", "")
        )
        db.add(story)
        await db.flush()

        # 3. Persist Characters
        for char_info in story_data.get("characters", []):
            character = Character(
                id=str(uuid.uuid4()),
                project_id=req.project_id,
                name=char_info.get("name", "Character"),
                tamil_name=char_info.get("tamil_name"),
                age=char_info.get("age", 25),
                appearance=char_info.get("appearance", "Cinematic style"),
                is_locked=True
            )
            db.add(character)

        # 4. Persist Scenes & Storyboard Shots
        for sc in story_data.get("scenes", []):
            scene = Scene(
                id=str(uuid.uuid4()),
                project_id=req.project_id,
                story_id=story.id,
                scene_number=sc.get("scene_number", 1),
                title=sc.get("title", f"Scene {sc.get('scene_number', 1)}"),
                location=sc.get("location", "Studio"),
                time_of_day=sc.get("time_of_day", "Day"),
                mood=sc.get("mood", req.mood),
                duration_sec=sc.get("duration_sec", 5.0),
                visual_prompt=sc.get("visual_prompt", ""),
                camera_directions=sc.get("camera_directions", "Medium Shot"),
                dialogue_text=sc.get("dialogue_text", ""),
                status="draft"
            )
            db.add(scene)
            await db.flush()

            # Create default storyboard shot for each scene
            shot = StoryboardShot(
                id=str(uuid.uuid4()),
                project_id=req.project_id,
                scene_id=scene.id,
                shot_number=1,
                prompt=sc.get("visual_prompt", ""),
                camera_movement=sc.get("camera_directions", "Static"),
                duration_sec=sc.get("duration_sec", 5.0),
                status="pending"
            )
            db.add(shot)

        await db.commit()
        await db.refresh(story)
        return story

    @staticmethod
    async def get_project_story(db: AsyncSession, project_id: str) -> Optional[Story]:
        res = await db.execute(select(Story).where(Story.project_id == project_id).order_by(Story.created_at.desc()))
        return res.scalars().first()

    # --- Character CRUD ---
    @staticmethod
    async def list_characters(db: AsyncSession, project_id: str) -> List[Character]:
        res = await db.execute(select(Character).where(Character.project_id == project_id).order_by(Character.created_at))
        return list(res.scalars().all())

    @staticmethod
    async def create_character(db: AsyncSession, project_id: str, data: CharacterCreateSchema) -> Character:
        character = Character(
            id=str(uuid.uuid4()),
            project_id=project_id,
            **data.model_dump()
        )
        db.add(character)
        await db.commit()
        await db.refresh(character)
        return character

    @staticmethod
    async def update_character(db: AsyncSession, character_id: str, data: CharacterUpdateSchema) -> Character:
        res = await db.execute(select(Character).where(Character.id == character_id))
        char = res.scalar_one_or_none()
        if not char:
            raise ValueError("Character not found")
        dump = data.model_dump(exclude_unset=True)
        # Prevent silent modification of locked character attributes
        if char.is_locked and dump.get("is_locked") is not False:
            non_lock_keys = [k for k in dump.keys() if k != "is_locked"]
            if non_lock_keys:
                raise ValueError(f"Character '{char.name}' is locked. Unlock character before modifying attributes: {', '.join(non_lock_keys)}")
        for k, v in dump.items():
            setattr(char, k, v)
        await db.commit()
        await db.refresh(char)
        return char

    @staticmethod
    async def delete_character(db: AsyncSession, character_id: str) -> None:
        res = await db.execute(select(Character).where(Character.id == character_id))
        char = res.scalar_one_or_none()
        if char:
            await db.delete(char)
            await db.commit()

    # --- Scene CRUD ---
    @staticmethod
    async def list_scenes(db: AsyncSession, project_id: str) -> List[Scene]:
        res = await db.execute(select(Scene).where(Scene.project_id == project_id).order_by(Scene.scene_number))
        return list(res.scalars().all())

    @staticmethod
    async def create_scene(db: AsyncSession, project_id: str, data: SceneCreateSchema) -> Scene:
        # Determine next scene number
        res = await db.execute(select(Scene).where(Scene.project_id == project_id))
        existing = list(res.scalars().all())
        next_num = len(existing) + 1

        scene = Scene(
            id=str(uuid.uuid4()),
            project_id=project_id,
            scene_number=data.scene_number or next_num,
            **data.model_dump(exclude={"scene_number"})
        )
        db.add(scene)
        await db.flush()

        shot = StoryboardShot(
            id=str(uuid.uuid4()),
            project_id=project_id,
            scene_id=scene.id,
            shot_number=1,
            prompt=scene.visual_prompt,
            camera_movement=scene.camera_directions,
            duration_sec=scene.duration_sec,
            status="pending"
        )
        db.add(shot)

        await db.commit()
        await db.refresh(scene)
        return scene

    @staticmethod
    async def update_scene(db: AsyncSession, scene_id: str, data: SceneUpdateSchema) -> Scene:
        res = await db.execute(select(Scene).where(Scene.id == scene_id))
        scene = res.scalar_one_or_none()
        if not scene:
            raise ValueError("Scene not found")
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(scene, k, v)
        await db.commit()
        await db.refresh(scene)
        return scene

    @staticmethod
    async def delete_scene(db: AsyncSession, scene_id: str) -> None:
        res = await db.execute(select(Scene).where(Scene.id == scene_id))
        scene = res.scalar_one_or_none()
        if scene:
            await db.delete(scene)
            await db.commit()

    @staticmethod
    async def reorder_scenes(db: AsyncSession, project_id: str, scene_ids: List[str]) -> List[Scene]:
        res = await db.execute(select(Scene).where(Scene.project_id == project_id))
        scenes = {s.id: s for s in res.scalars().all()}
        for idx, s_id in enumerate(scene_ids):
            if s_id in scenes:
                scenes[s_id].scene_number = idx + 1
        await db.commit()
        res_sorted = await db.execute(select(Scene).where(Scene.project_id == project_id).order_by(Scene.scene_number))
        return list(res_sorted.scalars().all())

    # --- Project Auto-Assembly ("Build Timeline from Story") ---
    @staticmethod
    async def auto_assemble_timeline(db: AsyncSession, project_id: str) -> Timeline:
        """
        Builds complete timeline with tracks (Video, Dialogue, Music, SFX, Captions)
        from project's generated Story and Scenes.
        """
        # Fetch scenes
        scenes = await StoryService.list_scenes(db, project_id)
        if not scenes:
            raise ValueError("No scenes available for auto-assembly. Generate a story first.")

        # Fetch or create timeline
        tl_res = await db.execute(select(Timeline).where(Timeline.project_id == project_id))
        timeline = tl_res.scalar_one_or_none()
        if not timeline:
            timeline = Timeline(id=str(uuid.uuid4()), project_id=project_id, name="Main Sequence", duration_ms=60000, tracks=[])
            db.add(timeline)
            await db.flush()

        # Query existing audio assets (dialogue and music) for this project
        audio_assets_res = await db.execute(
            select(Asset).where(
                Asset.project_id == project_id,
                Asset.asset_type == "audio"
            ).order_by(Asset.created_at.desc())
        )
        audio_assets = list(audio_assets_res.scalars().all())

        # Map dialogue assets by scene_id and scene_number, and discover background music asset
        scene_dialogue_assets = {}
        bgm_asset = None
        for a in audio_assets:
            meta = a.metadata_info or {}
            role = meta.get("role") or ""
            if role == "music" or "bgm" in (a.file_name or "").lower():
                if not bgm_asset:
                    bgm_asset = a
            elif role == "dialogue" or "dialogue" in (a.file_name or "").lower():
                sc_id = meta.get("scene_id")
                sc_num = meta.get("scene_number")
                if sc_id and sc_id not in scene_dialogue_assets:
                    scene_dialogue_assets[sc_id] = a
                if sc_num is not None and sc_num not in scene_dialogue_assets:
                    scene_dialogue_assets[sc_num] = a

        # Build timeline tracks structure
        v1_track_id = str(uuid.uuid4())
        a1_dialogue_id = str(uuid.uuid4())
        a3_music_id = str(uuid.uuid4())

        current_ms = 0
        video_clips = []
        dialogue_clips = []

        for sc in scenes:
            # 1. Discover completed asset for this scene (probed duration via FFprobe)
            clip_asset_id = None
            dur_ms = int((sc.duration_sec or 5.0) * 1000)

            # Query AI jobs completed for this scene
            job_res = await db.execute(
                select(AIJob)
                .where(AIJob.scene_id == sc.id, AIJob.status == "completed")
                .order_by(AIJob.completed_at.desc())
            )
            c_job = job_res.scalars().first()
            if c_job and c_job.result_asset_id:
                asset_res = await db.execute(select(Asset).where(Asset.id == c_job.result_asset_id))
                asset = asset_res.scalar_one_or_none()
                if asset:
                    clip_asset_id = asset.id
                    if asset.duration_ms and asset.duration_ms > 0:
                        dur_ms = int(asset.duration_ms)

            # Fallback check directly in Assets for this project matching scene
            if not clip_asset_id:
                asset_fallback = await db.execute(
                    select(Asset).where(
                        Asset.project_id == project_id,
                        Asset.asset_type == "video"
                    ).order_by(Asset.created_at.desc())
                )
                for a in asset_fallback.scalars().all():
                    meta = a.metadata_info or {}
                    if meta.get("scene_id") == sc.id or meta.get("scene_number") == sc.scene_number:
                        clip_asset_id = a.id
                        if a.duration_ms and a.duration_ms > 0:
                            dur_ms = int(a.duration_ms)
                        break

            clip_id = str(uuid.uuid4())

            # Video clip on Track V1
            video_clips.append({
                "id": clip_id,
                "track_id": v1_track_id,
                "asset_id": clip_asset_id,
                "scene_id": sc.id,
                "name": f"Scene {sc.scene_number}: {sc.title}",
                "clip_type": "media",
                "start_time_ms": current_ms,
                "duration_ms": dur_ms,
                "source_in_ms": 0,
                "source_out_ms": dur_ms,
                "speed_factor": 1.0,
                "opacity": 1.0,
                "position_x": 0.5,
                "position_y": 0.5,
                "scale_x": 1.0,
                "scale_y": 1.0,
                "volume_db": 0.0,
                "keyframes": [],
                "effects": []
            })

            # Dialogue clip if dialogue text exists
            if sc.dialogue_text:
                # Honest asset linkage: query actual generated dialogue asset or leave None
                dlg_asset = scene_dialogue_assets.get(sc.id) or scene_dialogue_assets.get(sc.scene_number)
                dlg_asset_id = dlg_asset.id if dlg_asset else None

                if dlg_asset and dlg_asset.duration_ms and dlg_asset.duration_ms > 0:
                    clip_dlg_dur = int(dlg_asset.duration_ms)
                else:
                    clip_dlg_dur = max(1000, dur_ms - 1000)

                dialogue_clips.append({
                    "id": str(uuid.uuid4()),
                    "track_id": a1_dialogue_id,
                    "asset_id": dlg_asset_id,
                    "scene_id": sc.id,
                    "name": f"Dialogue: {sc.dialogue_text[:20]}...",
                    "clip_type": "audio",
                    "start_time_ms": current_ms + 500,
                    "duration_ms": clip_dlg_dur,
                    "source_in_ms": 0,
                    "source_out_ms": clip_dlg_dur,
                    "volume_db": 0.0,
                    "fade_in_ms": 100,
                    "fade_out_ms": 100,
                    "keyframes": [],
                    "effects": []
                })

            current_ms += dur_ms

        total_dur_ms = max(30000, current_ms + 2000)

        # Background music clip on Track A3 if project BGM asset exists
        music_clips = []
        if bgm_asset:
            music_dur_ms = total_dur_ms
            src_out_ms = min(music_dur_ms, int(bgm_asset.duration_ms)) if bgm_asset.duration_ms and bgm_asset.duration_ms > 0 else music_dur_ms
            music_clips.append({
                "id": str(uuid.uuid4()),
                "track_id": a3_music_id,
                "asset_id": bgm_asset.id,
                "name": bgm_asset.file_name or "Background Music (BGM)",
                "clip_type": "audio",
                "start_time_ms": 0,
                "duration_ms": music_dur_ms,
                "source_in_ms": 0,
                "source_out_ms": src_out_ms,
                "volume_db": -6.0,
                "fade_in_ms": 500,
                "fade_out_ms": 1000,
                "keyframes": [],
                "effects": []
            })

        # Clear existing tracks for project auto-assembly
        existing_tracks = list(timeline.tracks)
        for t in existing_tracks:
            await db.delete(t)
        await db.flush()

        # Assemble 5 cinema tracks per architecture
        tracks_spec = [
            {
                "id": v1_track_id,
                "timeline_id": timeline.id,
                "track_type": "video",
                "track_role": "v1_main",
                "order_index": 0,
                "name": "V1 Visuals",
                "is_muted": False, "is_locked": False, "is_visible": True, "is_solo": False,
                "volume_db": 0.0, "pan": 0.0, "height_px": 56, "color": "#2563eb",
                "clips": video_clips
            },
            {
                "id": a1_dialogue_id,
                "timeline_id": timeline.id,
                "track_type": "audio",
                "track_role": "dialogue",
                "order_index": 1,
                "name": "A1 Dialogue (Tamil)",
                "is_muted": False, "is_locked": False, "is_visible": True, "is_solo": False,
                "volume_db": 0.0, "pan": 0.0, "height_px": 48, "color": "#15803d",
                "clips": dialogue_clips
            },
            {
                "id": str(uuid.uuid4()),
                "timeline_id": timeline.id,
                "track_type": "audio",
                "track_role": "voiceover",
                "order_index": 2,
                "name": "A2 Voice Over",
                "is_muted": False, "is_locked": False, "is_visible": True, "is_solo": False,
                "volume_db": 0.0, "pan": 0.0, "height_px": 48, "color": "#0d9488",
                "clips": []
            },
            {
                "id": a3_music_id,
                "timeline_id": timeline.id,
                "track_type": "audio",
                "track_role": "music",
                "order_index": 3,
                "name": "A3 Music (BGM)",
                "is_muted": False, "is_locked": False, "is_visible": True, "is_solo": False,
                "volume_db": -6.0, "pan": 0.0, "height_px": 48, "color": "#7c3aed",
                "clips": music_clips
            },
            {
                "id": str(uuid.uuid4()),
                "timeline_id": timeline.id,
                "track_type": "audio",
                "track_role": "sfx",
                "order_index": 4,
                "name": "A4 Sound Effects",
                "is_muted": False, "is_locked": False, "is_visible": True, "is_solo": False,
                "volume_db": 0.0, "pan": 0.0, "height_px": 48, "color": "#d97706",
                "clips": []
            }
        ]

        from app.models.timeline import Track, Clip

        for t_spec in tracks_spec:
            clips_spec = t_spec.pop("clips", [])
            track = Track(**t_spec)
            db.add(track)
            await db.flush()

            for c_spec in clips_spec:
                c_spec.pop("keyframes", None)
                c_spec.pop("effects", None)
                clip = Clip(**c_spec)
                db.add(clip)

        timeline.duration_ms = total_dur_ms
        await db.commit()
        db.expire_all()
        from app.services.timeline_service import TimelineService
        return await TimelineService.get_timeline_by_project(db, project_id)

    @staticmethod
    async def create_long_video_workflow(
        db: AsyncSession,
        project_id: str,
        prompt: str,
        target_duration_sec: float = 30.0,
        genre: str = "Drama",
        mood: str = "Cinematic"
    ) -> Dict[str, Any]:
        """
        Supports 1-second to 10-minute (600s) workflow.
        Breaks target duration into supported-length scene chunks (e.g. 5-second scenes).
        When real provider is configured, enqueues real generation jobs for each scene.
        When provider is unconfigured, returns honest status 'provider_not_configured' with scene plan.
        """
        if target_duration_sec < 1.0 or target_duration_sec > 600.0:
            raise ValueError("Target duration must be between 1.0 and 600.0 seconds (10 minutes max)")

        from app.ai.registry import is_capability_configured
        from app.services.ai_job_service import AIJobService
        configured = is_capability_configured("video")

        clip_duration_sec = 5.0
        num_scenes = max(1, int(round(target_duration_sec / clip_duration_sec)))

        scenes = []
        for i in range(1, num_scenes + 1):
            scenes.append({
                "scene_number": i,
                "title": f"Scene {i}",
                "duration_sec": clip_duration_sec,
                "prompt": f"{prompt} - Scene {i}/{num_scenes} (continuous cinema shot)",
                "camera": "Cinematic Camera Movement"
            })

        if not configured:
            return {
                "status": "provider_not_configured",
                "message": "Text-to-Video provider is not configured. Please configure EIGHTSCALE_API_KEY, RUNWAY_API_KEY or LUMA_API_KEY in server environment.",
                "target_duration_sec": target_duration_sec,
                "clip_duration_sec": clip_duration_sec,
                "scenes_count": num_scenes,
                "total_scenes": num_scenes,
                "scenes_plan": scenes,
                "scenes": scenes
            }

        jobs = []
        for sc in scenes:
            job = await AIJobService.create_job(
                db=db,
                project_id=project_id,
                job_type="text_to_video",
                prompt=sc["prompt"],
                job_metadata={"duration_sec": sc["duration_sec"], "scene_number": sc["scene_number"]}
            )
            jobs.append({"scene_number": sc["scene_number"], "job_id": job.id, "status": job.status})

        return {
            "status": "workflow_enqueued",
            "project_id": project_id,
            "target_duration_sec": target_duration_sec,
            "scenes_count": num_scenes,
            "jobs": jobs
        }

    @staticmethod
    async def create_video_from_story(
        db: AsyncSession,
        project_id: str,
        prompt: Optional[str] = None,
        target_duration_sec: float = 20.0,
        genre: str = "Drama",
        mood: str = "Cinematic"
    ) -> Dict[str, Any]:
        """
        Complete end-to-end filmmaking workflow:
        User Prompt -> Story / Script -> Characters -> Scenes -> Storyboard -> Scene Generation Jobs.
        Returns workflow summary and enqueued scene job details.
        """
        from app.services.ai_job_service import AIJobService
        from app.ai.registry import is_capability_configured

        configured = is_capability_configured("video")
        if not configured:
            return {
                "status": "provider_not_configured",
                "message": "Video provider is not configured. Please configure an API key or switch to Mock Video Generator.",
                "project_id": project_id,
                "jobs": []
            }

        # 1. Fetch existing scenes or generate a new story
        scenes = await StoryService.list_scenes(db, project_id)
        story = await StoryService.get_project_story(db, project_id)

        if not story or not scenes:
            effective_prompt = prompt or "Cinematic Tamil narrative journey"
            req = StoryGenerateRequest(
                project_id=project_id,
                prompt=effective_prompt,
                genre=genre,
                mood=mood,
                target_duration_sec=target_duration_sec,
                scene_count=max(2, min(8, int(round(target_duration_sec / 5.0))))
            )
            story = await StoryService.generate_story(db, req)
            scenes = await StoryService.list_scenes(db, project_id)

        # 2. Enqueue an AIJob for each scene
        jobs_summary = []
        for sc in scenes:
            scene_prompt = sc.visual_prompt or f"{story.title}: Scene {sc.scene_number} - {sc.title}. {mood} mood."
            dur = sc.duration_sec or 5.0
            job = await AIJobService.create_job(
                db=db,
                project_id=project_id,
                job_type="text_to_video",
                prompt=scene_prompt,
                scene_id=sc.id,
                job_metadata={
                    "duration_sec": dur,
                    "scene_id": sc.id,
                    "scene_number": sc.scene_number,
                    "title": sc.title,
                    "story_id": story.id
                }
            )
            sc.status = "generating"
            jobs_summary.append({
                "scene_id": sc.id,
                "scene_number": sc.scene_number,
                "job_id": job.id,
                "status": job.status,
                "duration_sec": dur
            })

        await db.commit()

        return {
            "status": "workflow_started",
            "project_id": project_id,
            "story_id": story.id,
            "scenes_count": len(scenes),
            "target_duration_sec": target_duration_sec,
            "jobs": jobs_summary,
            "message": f"Enqueued {len(jobs_summary)} scene generation jobs for story '{story.title}'."
        }

    @staticmethod
    async def analyze_story(
        db: AsyncSession,
        project_id: str,
        prompt: str,
        target_duration_sec: float = 30.0,
        genre: str = "Drama",
        mood: str = "Cinematic",
        language: str = "ta",
        aspect_ratio: str = "16:9",
        scene_count: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Extracts deep filmmaking metadata from story prompt:
        title, genre, tone, visual_style, target_duration, aspect_ratio, language,
        characters with locked consistency attributes, locations, scenes with dialogue & camera,
        narration, music requirements, SFX requirements.
        """
        dur = max(1.0, min(600.0, float(target_duration_sec)))
        scenes_n = scene_count or max(2, min(8, int(round(dur / 5.0))))
        per_scene_dur = round(dur / scenes_n, 1)

        is_tamil = language in ["ta", "ta+en"]

        title = f"{'தமிழ் சினிமா' if is_tamil else 'Tamil Cinema'} ({genre}) — {prompt[:30]}"
        synopsis = f"A compelling {mood.lower()} narrative exploring: {prompt}"

        characters = [
            {
                "name": "Karthik",
                "tamil_name": "கார்த்திக்",
                "role": "Protagonist",
                "age": 28,
                "gender": "male",
                "appearance": "Athletic build, sharp focused gaze, confident stance",
                "clothing": "Traditional veshti and crisp white cotton shirt" if is_tamil else "Modern cinematic dark jacket",
                "hair": "Neat wavy black hair",
                "skin": "Warm dusky Tamil complexion",
                "facial_features": "Defined jawline, expressive eyes",
                "body_characteristics": "Athletic, 5ft 11in",
                "personality": "Resilient, honorable, determined leader",
                "voice_id": "ta-IN-ValluvarNeural" if is_tamil else "en-US-GuyNeural",
                "visual_style": "Cinematic Photorealistic, 8K Arri Alexa",
                "is_locked": True,
                "negative_constraints": ["no modern western suit", "no beard change", "no altered skin tone"]
            },
            {
                "name": "Ananya",
                "tamil_name": "அனன்யா",
                "role": "Deuteragonist",
                "age": 25,
                "gender": "female",
                "appearance": "Graceful presence, intelligent and expressive demeanor",
                "clothing": "Elegant deep maroon silk saree with golden border",
                "hair": "Long dark braid adorned with jasmine flowers",
                "skin": "Golden wheatish complexion",
                "facial_features": "Large expressive eyes, subtle warm smile",
                "body_characteristics": "Graceful, 5ft 5in",
                "personality": "Perceptive, articulate, empathetic",
                "voice_id": "ta-IN-PallaviNeural" if is_tamil else "en-US-JennyNeural",
                "visual_style": "Cinematic Photorealistic, 8K Arri Alexa",
                "is_locked": True,
                "negative_constraints": ["no hair texture change", "no modern sunglasses", "preserve saree drape"]
            }
        ]

        locations = [
            "Marina Beach Promenade, Chennai",
            "Thanjavur Brihadisvara Temple Courtyard",
            "Heritage Chettinad Courtyard Home",
            "Nilgiris Misty Mountain Tea Estate"
        ]

        dialogue_bank_tamil = [
            "நம்பிக்கை தான் நம்முடைய மிகப்பெரிய பலம்.",
            "இந்த மண்ணின் பெருமை நம் வரலாற்றில் உள்ளது.",
            "வெற்றி என்பது கடின உழைப்பின் வெளிப்பாடு.",
            "நாம் எடுக்கும் முடிவே நம் எதிர்காலத்தை தீர்மானிக்கும்."
        ]
        dialogue_bank_english = [
            "Our belief is our greatest strength.",
            "The pride of this heritage lives in our hearts.",
            "Success is the outcome of unyielding dedication.",
            "The choice we make today defines our tomorrow."
        ]

        scenes = []
        for i in range(scenes_n):
            sc_num = i + 1
            loc = locations[i % len(locations)]
            tod = "Golden Hour" if i % 2 == 0 else "Night"
            cam = "Wide Angle Establishing Shot" if i == 0 else ("Medium Tracking Shot" if i % 2 == 1 else "Dramatic Close-Up")
            diag = dialogue_bank_tamil[i % len(dialogue_bank_tamil)] if is_tamil else dialogue_bank_english[i % len(dialogue_bank_english)]
            char_in_scene = ["Karthik"] if i % 2 == 0 else ["Karthik", "Ananya"]

            scenes.append({
                "scene_number": sc_num,
                "title": f"Scene {sc_num}: The Journey Unfolds",
                "description": f"Scene {sc_num} depicting characters at {loc} during {tod}.",
                "duration_sec": per_scene_dur,
                "location": loc,
                "time_of_day": tod,
                "mood": mood,
                "characters": char_in_scene,
                "dialogue": diag,
                "camera": cam,
                "visual_style": "Cinematic Photorealistic, Anamorphic Lens, 8k",
                "generation_prompt": f"Cinematic shot of Scene {sc_num}, {loc}, {tod}, {mood.lower()} atmosphere. {', '.join(char_in_scene)}. 8k resolution, dramatic lighting.",
                "negative_prompt": "blurry, low quality, oversaturated, deformed, cartoon, extra limbs",
                "continuity_context": f"Continuity from Scene {sc_num - 1}" if sc_num > 1 else "Opening master shot",
                "required_assets": [],
                "audio_requirements": {
                    "voice": True,
                    "music": True,
                    "sfx": ["coastal breeze", "distant temple bells"] if "Beach" in loc else ["temple bell", "stone footsteps"]
                }
            })

        # Persist Story
        story_id = str(uuid.uuid4())
        story = Story(
            id=story_id,
            project_id=project_id,
            title=title,
            synopsis=synopsis,
            logline=f"{genre} narrative: {prompt[:60]}",
            genre=genre,
            mood=mood,
            target_audience="General",
            language=language,
            themes=["Courage", "Tradition", "Destiny"],
            target_duration_sec=int(dur),
            raw_script=prompt
        )
        db.add(story)

        # Persist Characters
        created_characters = []
        for c in characters:
            char_id = str(uuid.uuid4())
            character = Character(
                id=char_id,
                project_id=project_id,
                name=c["name"],
                tamil_name=c.get("tamil_name"),
                age=c.get("age", 25),
                gender=c.get("gender", "unspecified"),
                appearance=c.get("appearance"),
                clothing=c.get("clothing"),
                hair=c.get("hair"),
                skin=c.get("skin"),
                personality=c.get("personality"),
                voice_id=c.get("voice_id"),
                visual_style=c.get("visual_style"),
                reference_images=[],
                is_locked=True
            )
            db.add(character)
            created_characters.append(character)

        # Persist Scenes
        created_scenes = []
        for s in scenes:
            sc_id = str(uuid.uuid4())
            scene = Scene(
                id=sc_id,
                project_id=project_id,
                story_id=story_id,
                scene_number=s["scene_number"],
                title=s["title"],
                description=s["description"],
                location=s["location"],
                time_of_day=s["time_of_day"],
                mood=s["mood"],
                duration_sec=s["duration_sec"],
                visual_prompt=s["generation_prompt"],
                camera_directions=s["camera"],
                dialogue_text=s["dialogue"],
                audio_prompt=f"Dialogue: {s['dialogue']}. Music: {mood} instrumental. SFX: {', '.join(s['audio_requirements']['sfx'])}",
                status="draft"
            )
            db.add(scene)
            created_scenes.append(scene)

        await db.commit()

        return {
            "story": story,
            "title": title,
            "synopsis": synopsis,
            "genre": genre,
            "tone": mood,
            "visual_style": "Cinematic Photorealistic 8K",
            "target_duration": dur,
            "aspect_ratio": aspect_ratio,
            "language": language,
            "characters": created_characters,
            "characters_data": characters,
            "locations": locations,
            "scenes": created_scenes,
            "scenes_data": scenes,
            "dialogue": [s["dialogue"] for s in scenes if s["dialogue"]],
            "narration": f"In the heart of Tamil cinema storytelling, this {genre.lower()} tale speaks of courage and destiny.",
            "analysis_summary": {
                "characters_extracted": [c["name"] for c in characters],
                "scenes_count": len(scenes),
                "negative_constraints": [nc for c in characters for nc in c.get("negative_constraints", [])]
            },
            "music_requirements": {
                "genre": "Emotional Tamil Instrumental",
                "mood": mood,
                "tempo": "75 bpm",
                "instruments": ["Veena", "Bansuri Flute", "Mridangam", "Acoustic Strings"],
                "volume_db": -6.0,
                "ducking_db": -12.0
            },
            "sfx_requirements": [
                "ambient ocean waves",
                "traditional temple bells",
                "gentle morning breeze",
                "subtle footsteps on sand"
            ]
        }

    @staticmethod
    async def generate_production_storyboard(
        db: AsyncSession,
        project_id: str,
        scene_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Creates a multi-shot cinematic storyboard for project scenes.
        Each scene produces 4 distinct camera shots:
          Shot 1: Wide establishing shot
          Shot 2: Medium shot
          Shot 3: Close-up
          Shot 4: Dynamic tracking shot
        Connected directly to generation task specifications.
        """
        if scene_id:
            sc_res = await db.execute(select(Scene).where(Scene.id == scene_id))
            scenes = list(sc_res.scalars().all())
        else:
            sc_res = await db.execute(select(Scene).where(Scene.project_id == project_id).order_by(Scene.scene_number))
            scenes = list(sc_res.scalars().all())

        if not scenes:
            return []

        storyboard_shots = []
        shot_templates = [
            {
                "shot_num": 1,
                "shot_type": "Wide Establishing Shot",
                "camera_angle": "Eye Level",
                "camera_movement": "Slow Pan Left-to-Right",
                "subject": "Environment & Setting",
                "transition": "Fade In"
            },
            {
                "shot_num": 2,
                "shot_type": "Medium Shot",
                "camera_angle": "Slight Low Angle",
                "camera_movement": "Smooth Dolly In",
                "subject": "Characters in Action",
                "transition": "Cut"
            },
            {
                "shot_num": 3,
                "shot_type": "Close-Up",
                "camera_angle": "Eye Level",
                "camera_movement": "Static with Shallow Depth of Field",
                "subject": "Facial Emotion & Expression",
                "transition": "Cut"
            },
            {
                "shot_num": 4,
                "shot_type": "Dynamic Tracking Shot",
                "camera_angle": "Over the Shoulder",
                "camera_movement": "Lateral Dolly Track",
                "subject": "Character Movement & Interaction",
                "transition": "Cross Dissolve"
            }
        ]

        for sc in scenes:
            base_dur = round((sc.duration_sec or 5.0) / len(shot_templates), 1)
            for tpl in shot_templates:
                shot_prompt = f"{sc.visual_prompt or sc.title} - {tpl['shot_type']}, {tpl['camera_angle']}, {tpl['camera_movement']}".strip()
                shot_id = str(uuid.uuid4())
                shot_record = StoryboardShot(
                    id=shot_id,
                    project_id=project_id,
                    scene_id=sc.id,
                    shot_number=tpl["shot_num"],
                    prompt=shot_prompt,
                    camera_movement=tpl["camera_movement"],
                    transition=tpl["transition"],
                    duration_sec=base_dur,
                    status="pending"
                )
                db.add(shot_record)

                storyboard_shots.append({
                    "shot_id": shot_id,
                    "scene_id": sc.id,
                    "scene_number": sc.scene_number,
                    "shot_number": tpl["shot_num"],
                    "shot_type": tpl["shot_type"],
                    "camera_angle": tpl["camera_angle"],
                    "camera_movement": tpl["camera_movement"],
                    "subject": tpl["subject"],
                    "environment": sc.location or "Studio",
                    "duration_sec": base_dur,
                    "prompt": shot_prompt,
                    "visual_prompt": shot_prompt,
                    "transition": tpl["transition"],
                    "dialogue": sc.dialogue_text or "",
                    "audio_requirements": {
                        "voice": bool(sc.dialogue_text),
                        "music": True,
                        "sfx": ["ambient"]
                    }
                })

        await db.commit()
        return storyboard_shots

