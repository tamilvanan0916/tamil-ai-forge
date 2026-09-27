import uuid
from typing import List, Optional, Dict, Any
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.project import Project
from app.models.timeline import Timeline, Track
from app.schemas.project import ProjectCreate, ProjectUpdate

DEFAULT_TRACKS = [
    # Video layers (V5 on top, down to V1)
    {"name": "V5 - Overlays", "track_type": "video", "track_role": "video", "order_index": 0, "color": "#1e40af", "height_px": 56},
    {"name": "V4 - B-Roll", "track_type": "video", "track_role": "video", "order_index": 1, "color": "#1e3a8a", "height_px": 56},
    {"name": "V3 - Secondary", "track_type": "video", "track_role": "video", "order_index": 2, "color": "#1d4ed8", "height_px": 56},
    {"name": "V2 - Cutaways", "track_type": "video", "track_role": "video", "order_index": 3, "color": "#2563eb", "height_px": 56},
    {"name": "V1 - Primary Video", "track_type": "video", "track_role": "video", "order_index": 4, "color": "#3b82f6", "height_px": 64},
    # Adjustment & Graphics
    {"name": "Adjustment Layer", "track_type": "adjustment", "track_role": "adjustment", "order_index": 5, "color": "#7e22ce", "height_px": 44},
    {"name": "Graphics & Titles", "track_type": "video", "track_role": "graphics", "order_index": 6, "color": "#9333ea", "height_px": 48},
    {"name": "Captions / Subtitles", "track_type": "subtitle", "track_role": "captions", "order_index": 7, "color": "#ea580c", "height_px": 44},
    # Audio stems
    {"name": "A1 - Dialogue (Tamil)", "track_type": "audio", "track_role": "dialogue", "order_index": 8, "color": "#15803d", "height_px": 56},
    {"name": "A2 - Voice Over", "track_type": "audio", "track_role": "voiceover", "order_index": 9, "color": "#166534", "height_px": 52},
    {"name": "A3 - Background Music", "track_type": "audio", "track_role": "music", "order_index": 10, "color": "#a21caf", "height_px": 56},
    {"name": "A4 - Sound Effects", "track_type": "audio", "track_role": "sfx", "order_index": 11, "color": "#be185d", "height_px": 48},
    {"name": "A5 - Ambience", "track_type": "audio", "track_role": "ambience", "order_index": 12, "color": "#4d7c0f", "height_px": 48},
    {"name": "A6 - Additional Audio", "track_type": "audio", "track_role": "custom", "order_index": 13, "color": "#334155", "height_px": 48},
]

class ProjectService:
    @staticmethod
    async def list_projects(db: AsyncSession) -> List[Project]:
        query = select(Project).order_by(desc(Project.updated_at))
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_project(db: AsyncSession, project_id: str) -> Optional[Project]:
        query = select(Project).where(Project.id == project_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_project(db: AsyncSession, data: ProjectCreate) -> Project:
        project = Project(
            title=data.title,
            description=data.description,
            settings=data.settings.model_dump() if data.settings else {
                "width": 1920,
                "height": 1080,
                "fps": 30.0,
                "sample_rate": 48000,
                "color_space": "bt709",
                "max_duration_sec": 600,
            },
            story_data=data.story_data,
        )
        db.add(project)
        await db.flush()

        # Initialize Default Timeline with all professional tracks
        timeline = Timeline(
            project_id=project.id,
            name="Main Sequence",
            duration_ms=0,
        )
        db.add(timeline)
        await db.flush()

        for track_spec in DEFAULT_TRACKS:
            track = Track(
                timeline_id=timeline.id,
                name=track_spec["name"],
                track_type=track_spec["track_type"],
                track_role=track_spec["track_role"],
                order_index=track_spec["order_index"],
                color=track_spec["color"],
                height_px=track_spec["height_px"],
            )
            db.add(track)

        await db.commit()
        await db.refresh(project)
        return project

    @staticmethod
    async def update_project(db: AsyncSession, project_id: str, data: ProjectUpdate) -> Optional[Project]:
        project = await ProjectService.get_project(db, project_id)
        if not project:
            return None

        if data.title is not None:
            project.title = data.title
        if data.description is not None:
            project.description = data.description
        if data.settings is not None:
            project.settings = data.settings.model_dump()
        if data.story_data is not None:
            project.story_data = data.story_data
        if data.thumbnail_url is not None:
            project.thumbnail_url = data.thumbnail_url

        await db.commit()
        await db.refresh(project)
        return project

    @staticmethod
    async def delete_project(db: AsyncSession, project_id: str) -> bool:
        project = await ProjectService.get_project(db, project_id)
        if not project:
            return False

        # Explicitly delete timeline hierarchy first to avoid FK RESTRICT conflicts with assets
        from app.models.timeline import Timeline
        tl_query = select(Timeline).where(Timeline.project_id == project_id)
        tl_res = await db.execute(tl_query)
        for tl in tl_res.scalars().all():
            await db.delete(tl)
        await db.flush()

        await db.delete(project)
        await db.commit()
        return True

    @staticmethod
    async def duplicate_project(db: AsyncSession, project_id: str) -> Optional[Project]:
        source = await ProjectService.get_project(db, project_id)
        if not source:
            return None

        from app.models.ai_models import Story, Character, Scene
        from app.models.asset import Asset
        from app.models.timeline import Clip

        new_project = Project(
            title=f"{source.title} (Copy)",
            description=source.description,
            settings=dict(source.settings),
            story_data=dict(source.story_data) if source.story_data else None,
            thumbnail_url=source.thumbnail_url,
        )
        db.add(new_project)
        await db.flush()

        # 1. Duplicate Assets with old -> new ID mapping to avoid cross-project asset linkage
        old_to_new_asset_map: Dict[str, str] = {}
        a_query = select(Asset).where(Asset.project_id == project_id)
        a_res = await db.execute(a_query)
        for a in a_res.scalars().all():
            new_asset = Asset(
                id=str(uuid.uuid4()),
                project_id=new_project.id,
                asset_type=a.asset_type,
                file_name=a.file_name,
                storage_key=a.storage_key,
                file_size_bytes=a.file_size_bytes,
                mime_type=a.mime_type,
                duration_ms=a.duration_ms,
                has_proxy=a.has_proxy,
                proxy_storage_key=a.proxy_storage_key,
                thumbnail_url=a.thumbnail_url,
                waveform_data=a.waveform_data,
                metadata_info=dict(a.metadata_info) if a.metadata_info else {},
                tags=list(a.tags) if a.tags else [],
                is_favorite=a.is_favorite,
                folder_path=a.folder_path,
            )
            db.add(new_asset)
            await db.flush()
            old_to_new_asset_map[a.id] = new_asset.id

        # 2. Duplicate Characters
        old_to_new_char_map: Dict[str, str] = {}
        ch_query = select(Character).where(Character.project_id == project_id)
        ch_res = await db.execute(ch_query)
        for ch in ch_res.scalars().all():
            new_ref_images = []
            for img in (ch.reference_images or []):
                if isinstance(img, dict) and "asset_id" in img:
                    new_ref_images.append({**img, "asset_id": old_to_new_asset_map.get(img["asset_id"], img["asset_id"])})
                else:
                    new_ref_images.append(img)

            new_char = Character(
                id=str(uuid.uuid4()),
                project_id=new_project.id,
                name=ch.name,
                tamil_name=ch.tamil_name,
                age=ch.age,
                gender=ch.gender,
                appearance=ch.appearance,
                clothing=ch.clothing,
                hair=ch.hair,
                skin=ch.skin,
                personality=ch.personality,
                voice_id=ch.voice_id,
                visual_style=ch.visual_style,
                reference_images=new_ref_images,
                is_locked=ch.is_locked,
            )
            db.add(new_char)
            await db.flush()
            old_to_new_char_map[ch.id] = new_char.id

        # 3. Duplicate Story
        old_to_new_story_map: Dict[str, str] = {}
        st_query = select(Story).where(Story.project_id == project_id)
        st_res = await db.execute(st_query)
        for st in st_res.scalars().all():
            new_story = Story(
                id=str(uuid.uuid4()),
                project_id=new_project.id,
                title=st.title,
                synopsis=st.synopsis,
                logline=st.logline,
                genre=st.genre,
                mood=st.mood,
                target_duration_sec=st.target_duration_sec,
                themes=st.themes,
                language=st.language,
                raw_script=st.raw_script,
            )
            db.add(new_story)
            await db.flush()
            old_to_new_story_map[st.id] = new_story.id

        # 4. Duplicate Scenes
        sc_query = select(Scene).where(Scene.project_id == project_id).order_by(Scene.scene_number)
        sc_res = await db.execute(sc_query)
        for sc in sc_res.scalars().all():
            new_scene = Scene(
                id=str(uuid.uuid4()),
                project_id=new_project.id,
                story_id=old_to_new_story_map.get(sc.story_id, sc.story_id) if sc.story_id else None,
                scene_number=sc.scene_number,
                title=sc.title,
                description=sc.description,
                duration_sec=sc.duration_sec,
                location=sc.location,
                time_of_day=sc.time_of_day,
                mood=sc.mood,
                visual_prompt=sc.visual_prompt,
                camera_directions=sc.camera_directions,
                dialogue_text=sc.dialogue_text,
                audio_prompt=sc.audio_prompt,
                status=sc.status,
                generated_asset_id=old_to_new_asset_map.get(sc.generated_asset_id, sc.generated_asset_id) if sc.generated_asset_id else None,
            )
            db.add(new_scene)

        # 5. Duplicate Timeline and Clips
        query = select(Timeline).where(Timeline.project_id == project_id).options(
            selectinload(Timeline.tracks).selectinload(Track.clips)
        )
        result = await db.execute(query)
        source_timeline = result.scalar_one_or_none()

        if source_timeline:
            new_timeline = Timeline(
                id=str(uuid.uuid4()),
                project_id=new_project.id,
                name=source_timeline.name,
                duration_ms=source_timeline.duration_ms,
            )
            db.add(new_timeline)
            await db.flush()

            for t in source_timeline.tracks:
                new_track = Track(
                    id=str(uuid.uuid4()),
                    timeline_id=new_timeline.id,
                    name=t.name,
                    track_type=t.track_type,
                    track_role=t.track_role,
                    order_index=t.order_index,
                    color=t.color,
                    height_px=t.height_px,
                    volume_db=t.volume_db,
                    pan=t.pan,
                )
                db.add(new_track)
                await db.flush()

                for c in (t.clips or []):
                    new_asset_id = old_to_new_asset_map.get(c.asset_id, c.asset_id) if c.asset_id else None
                    new_clip = Clip(
                        id=str(uuid.uuid4()),
                        track_id=new_track.id,
                        asset_id=new_asset_id,
                        name=c.name,
                        start_time_ms=c.start_time_ms,
                        duration_ms=c.duration_ms,
                        source_in_ms=c.source_in_ms,
                        source_out_ms=c.source_out_ms,
                        speed_factor=c.speed_factor,
                        volume_db=c.volume_db,
                        opacity=c.opacity,
                        clip_type=c.clip_type,
                        metadata_info=dict(c.metadata_info) if c.metadata_info else {},
                        transition_in=dict(c.transition_in) if c.transition_in else None,
                        transition_out=dict(c.transition_out) if c.transition_out else None,
                    )
                    db.add(new_clip)
        else:
            # Create default tracks
            timeline = Timeline(id=str(uuid.uuid4()), project_id=new_project.id, name="Main Sequence", duration_ms=0)
            db.add(timeline)
            await db.flush()
            for track_spec in DEFAULT_TRACKS:
                db.add(Track(id=str(uuid.uuid4()), timeline_id=timeline.id, **track_spec))

        await db.commit()
        await db.refresh(new_project)
        return new_project

    @staticmethod
    async def get_unified_status(db: AsyncSession, project_id: str) -> Optional[Dict[str, Any]]:
        project = await ProjectService.get_project(db, project_id)
        if not project:
            return None

        from app.models.ai_models import Story, Scene, Character, AIJob
        from app.models.asset import Asset
        from app.models.timeline import Timeline, Track, Clip
        from app.models.caption import Caption
        from app.models.render_job import RenderJob

        # 1. Story
        st_res = await db.execute(select(Story).where(Story.project_id == project_id))
        story = st_res.scalar_one_or_none()
        has_story = story is not None

        # 2. Scenes
        sc_res = await db.execute(select(Scene).where(Scene.project_id == project_id).order_by(Scene.scene_number))
        scenes = list(sc_res.scalars().all())
        total_scenes = len(scenes)
        ready_scenes = sum(1 for s in scenes if s.generated_asset_id or s.status == "ready")

        # 3. Audio & Music Assets
        a_res = await db.execute(select(Asset).where(Asset.project_id == project_id))
        all_assets = list(a_res.scalars().all())
        audio_assets = [a for a in all_assets if a.asset_type == "audio"]
        dialogue_assets = [a for a in audio_assets if "dialogue" in (a.folder_path or "").lower() or "voice" in (a.file_name or "").lower()]
        music_assets = [a for a in audio_assets if "music" in (a.folder_path or "").lower() or "bgm" in (a.file_name or "").lower()]
        transformed_assets = [a for a in all_assets if "/AI Transforms" in (a.folder_path or "") or (a.metadata_info or {}).get("transformation_mode")]

        # 4. Captions
        cap_res = await db.execute(select(Caption).where(Caption.project_id == project_id))
        captions_list = list(cap_res.scalars().all())
        has_captions = len(captions_list) > 0

        # 5. Timeline
        tl_query = select(Timeline).where(Timeline.project_id == project_id).options(
            selectinload(Timeline.tracks).selectinload(Track.clips)
        )
        tl_res = await db.execute(tl_query)
        timeline = tl_res.scalar_one_or_none()
        tracks_count = len(timeline.tracks) if timeline else 0
        clips_count = sum(len(t.clips) for t in (timeline.tracks or [])) if timeline else 0
        tl_duration_ms = timeline.duration_ms if timeline else 0

        # 6. Transformation Jobs
        tj_res = await db.execute(
            select(AIJob)
            .where(AIJob.project_id == project_id, AIJob.job_type.like("media_transform%"))
            .order_by(AIJob.created_at.desc())
        )
        transform_jobs = list(tj_res.scalars().all())
        transform_job_count = len(transform_jobs)
        latest_transform = transform_jobs[0] if transform_jobs else None

        # 7. Render Jobs & Master Render
        rj_res = await db.execute(
            select(RenderJob)
            .where(RenderJob.project_id == project_id)
            .order_by(RenderJob.created_at.desc())
        )
        latest_render = rj_res.scalars().first()
        render_status = (latest_render.status if latest_render else "idle").lower()
        render_progress = float(latest_render.progress_percent or 0.0) if latest_render else 0.0
        render_output_available = bool(latest_render and latest_render.status == "completed" and latest_render.output_asset_id)

        # Stale master detection
        is_master_stale = False
        if (
            latest_render
            and latest_render.status == "completed"
            and latest_render.completed_at
            and timeline
            and timeline.updated_at
        ):
            tl_up = timeline.updated_at
            rn_done = latest_render.completed_at
            if hasattr(tl_up, "tzinfo") and tl_up.tzinfo is not None:
                from datetime import timezone as _tz
                tl_up = tl_up.astimezone(_tz.utc).replace(tzinfo=None)
            if hasattr(rn_done, "tzinfo") and rn_done.tzinfo is not None:
                from datetime import timezone as _tz
                rn_done = rn_done.astimezone(_tz.utc).replace(tzinfo=None)
            if tl_up > rn_done:
                is_master_stale = True

        # 8. Deliverables inventory
        deliverables_count = 0
        if render_output_available and not is_master_stale:
            deliverables_count += 1  # Master video
            if len(dialogue_assets) > 0:
                deliverables_count += 1  # Dialogue stem
            if len(music_assets) > 0:
                deliverables_count += 1  # Music stem
            if has_captions:
                deliverables_count += 2  # SRT + VTT
        has_deliverables = deliverables_count > 0

        pct = 10.0
        current_stage = "PROJECT_SETUP"
        if has_story:
            pct += 15.0
            current_stage = "STORY_DEVELOPED"
        if total_scenes > 0:
            scene_ratio = (ready_scenes / total_scenes) if total_scenes else 0.0
            pct += (25.0 * scene_ratio)
            if ready_scenes == total_scenes:
                current_stage = "SCENES_COMPLETED"
            elif ready_scenes > 0:
                current_stage = "SCENES_IN_PROGRESS"
        if len(audio_assets) > 0:
            pct += 10.0
        if has_captions:
            pct += 10.0
        if clips_count > 0:
            pct += 10.0
            current_stage = "TIMELINE_ASSEMBLED"
        if render_output_available and not is_master_stale:
            pct += 15.0
            current_stage = "RENDERED_MASTER"
        elif render_status in ["queued", "processing"]:
            current_stage = "RENDERING"
        if has_deliverables:
            pct += 5.0
            current_stage = "DELIVERABLES_READY"

        completion_pct = min(100.0, round(pct, 1))

        if has_deliverables:
            honest_msg = "Deliverables package ready for release & distribution."
        elif render_output_available and not is_master_stale:
            honest_msg = "Master film render complete and ready for screening."
        elif render_status in ["queued", "processing"]:
            honest_msg = f"Film rendering in progress ({render_progress:.0f}%)."
        elif is_master_stale:
            honest_msg = "Timeline has been modified since last render. Re-render recommended."
        elif clips_count > 0:
            honest_msg = f"Timeline assembled with {clips_count} clips. Ready to render."
        elif ready_scenes > 0:
            honest_msg = f"{ready_scenes}/{total_scenes} scenes generated. Assembly pending."
        elif has_story:
            honest_msg = "Story created. Scene planning/generation pending."
        else:
            honest_msg = "Project initialized. Ready for story development or media upload."

        return {
            "project_id": project.id,
            "title": project.title,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "current_stage": current_stage,
            "completion_percent": completion_pct,
            "honest_message": honest_msg,
            "offline_label": "OFFLINE DEMO MODE (MOCK)",
            "stages": {
                "project_setup": {
                    "status": "completed",
                    "title": project.title,
                    "resolution": f"{project.settings.get('width', 1920)}x{project.settings.get('height', 1080)}",
                    "fps": project.settings.get("fps", 30.0)
                },
                "story": {
                    "status": "completed" if has_story else "none",
                    "has_story": has_story,
                    "title": getattr(story, "title", None) if story else None,
                    "genre": getattr(story, "genre", None) if story else None,
                    "mood": getattr(story, "mood", None) if story else None
                },
                "scene_generation": {
                    "status": "completed" if (total_scenes > 0 and ready_scenes == total_scenes) else ("in_progress" if ready_scenes > 0 else ("planned" if total_scenes > 0 else "none")),
                    "total_scenes": total_scenes,
                    "ready_scenes": ready_scenes
                },
                "audio": {
                    "status": "completed" if len(dialogue_assets) > 0 else "none",
                    "dialogue_count": len(dialogue_assets),
                    "total_audio_count": len(audio_assets)
                },
                "music": {
                    "status": "completed" if len(music_assets) > 0 else "none",
                    "music_count": len(music_assets)
                },
                "captions": {
                    "status": "completed" if has_captions else "none",
                    "captions_count": len(captions_list)
                },
                "timeline": {
                    "status": "ready" if clips_count > 0 else "empty",
                    "tracks_count": tracks_count,
                    "clips_count": clips_count,
                    "duration_ms": tl_duration_ms
                },
                "transformation": {
                    "status": "completed" if any(j.status == "completed" for j in transform_jobs) else ("in_progress" if any(j.status in ["queued", "processing"] for j in transform_jobs) else "none"),
                    "jobs_count": transform_job_count,
                    "transformed_assets_count": len(transformed_assets),
                    "latest_mode": latest_transform.input_data.get("mode") if (latest_transform and latest_transform.input_data) else None
                },
                "rendering": {
                    "status": render_status,
                    "progress_percent": render_progress,
                    "file_available": render_output_available,
                    "is_master_stale": is_master_stale,
                    "job_id": latest_render.id if latest_render else None
                },
                "deliverables": {
                    "status": "ready" if has_deliverables else "none",
                    "package_ready": has_deliverables,
                    "files_count": deliverables_count
                }
            }
        }
