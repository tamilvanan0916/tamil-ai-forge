import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified
from app.models.timeline import Timeline, Track, Clip, Effect, Keyframe, TimelineRevision
from app.models.project import Project
from app.schemas.timeline import TimelineSaveRequest, GraphicsClipCreateRequest

class TimelineService:
    @staticmethod
    async def get_timeline_by_project(db: AsyncSession, project_id: str) -> Optional[Timeline]:
        query = select(Timeline).where(Timeline.project_id == project_id).options(
            selectinload(Timeline.tracks).selectinload(Track.clips).selectinload(Clip.effects),
            selectinload(Timeline.tracks).selectinload(Track.clips).selectinload(Clip.keyframes),
        )
        result = await db.execute(query)
        timeline = result.scalar_one_or_none()
        if timeline:
            project = await db.get(Project, project_id)
            if project and project.settings:
                timeline.markers = (project.settings or {}).get("timeline_markers", [])
                timeline.in_point_ms = (project.settings or {}).get("timeline_in_point_ms")
                timeline.out_point_ms = (project.settings or {}).get("timeline_out_point_ms")
                timeline.target_video_track_id = (project.settings or {}).get("target_video_track_id")
                timeline.target_audio_track_id = (project.settings or {}).get("target_audio_track_id")
        return timeline

    @staticmethod
    async def save_timeline(db: AsyncSession, project_id: str, data: TimelineSaveRequest) -> Timeline:
        project = await db.get(Project, project_id)
        if not project:
            project = Project(
                id=project_id,
                title="Untitled Project",
                settings={"width": 1920, "height": 1080, "fps": 30.0}
            )
            db.add(project)
            await db.flush()

        timeline = await TimelineService.get_timeline_by_project(db, project_id)
        is_new_timeline = False
        if not timeline:
            timeline = Timeline(project_id=project_id, name=data.name or "Main Sequence", duration_ms=data.duration_ms)
            timeline.tracks = []
            db.add(timeline)
            await db.flush()
            is_new_timeline = True

        # Save sequence markers, work area, and target track patching in project settings
        if project:
            settings = dict(project.settings or {})
            if data.markers is not None:
                settings["timeline_markers"] = [m.model_dump() if hasattr(m, 'model_dump') else dict(m) for m in data.markers]
                timeline.markers = settings["timeline_markers"]
            settings["timeline_in_point_ms"] = data.in_point_ms
            settings["timeline_out_point_ms"] = data.out_point_ms
            settings["target_video_track_id"] = getattr(data, "target_video_track_id", None)
            settings["target_audio_track_id"] = getattr(data, "target_audio_track_id", None)
            project.settings = settings
            flag_modified(project, "settings")
            timeline.in_point_ms = data.in_point_ms
            timeline.out_point_ms = data.out_point_ms
            timeline.target_video_track_id = getattr(data, "target_video_track_id", None)
            timeline.target_audio_track_id = getattr(data, "target_audio_track_id", None)

        # Create revision snapshot before applying modifications (only for existing timelines)
        if not is_new_timeline and timeline.id:
            await TimelineService.create_revision_snapshot(db, timeline.id, description="Auto-save", timeline_obj=timeline)

        timeline.duration_ms = data.duration_ms
        if data.name:
            timeline.name = data.name

        # Sync tracks and clips
        # Delete current tracks and recreate (or update in place)
        existing_tracks = list(timeline.tracks) if ("tracks" in getattr(timeline, "__dict__", {}) and timeline.tracks) else []
        for t in existing_tracks:
            await db.delete(t)
        await db.flush()

        for t_spec in data.tracks:
            track = Track(
                id=t_spec.id or str(uuid.uuid4()),
                timeline_id=timeline.id,
                track_type=t_spec.track_type,
                track_role=t_spec.track_role,
                order_index=t_spec.order_index,
                name=t_spec.name,
                is_muted=t_spec.is_muted,
                is_locked=t_spec.is_locked,
                is_visible=t_spec.is_visible,
                is_solo=t_spec.is_solo,
                volume_db=t_spec.volume_db,
                pan=t_spec.pan,
                height_px=t_spec.height_px,
                color=t_spec.color or "#1e3a8a",
            )
            db.add(track)
            await db.flush()

            for c_spec in t_spec.clips:
                clip = Clip(
                    id=c_spec.id or str(uuid.uuid4()),
                    track_id=track.id,
                    asset_id=c_spec.asset_id,
                    scene_id=c_spec.scene_id,
                    name=c_spec.name,
                    clip_type=c_spec.clip_type,
                    start_time_ms=c_spec.start_time_ms,
                    duration_ms=c_spec.duration_ms,
                    source_in_ms=c_spec.source_in_ms,
                    source_out_ms=c_spec.source_out_ms,
                    speed_factor=c_spec.speed_factor,
                    is_reversed=c_spec.is_reversed,
                    is_frozen=c_spec.is_frozen,
                    freeze_at_ms=c_spec.freeze_at_ms,
                    opacity=c_spec.opacity,
                    blend_mode=c_spec.blend_mode,
                    position_x=c_spec.position_x,
                    position_y=c_spec.position_y,
                    scale_x=c_spec.scale_x,
                    scale_y=c_spec.scale_y,
                    rotation=c_spec.rotation,
                    anchor_x=c_spec.anchor_x,
                    anchor_y=c_spec.anchor_y,
                    crop_left=c_spec.crop_left,
                    crop_right=c_spec.crop_right,
                    crop_top=c_spec.crop_top,
                    crop_bottom=c_spec.crop_bottom,
                    volume_db=c_spec.volume_db,
                    fade_in_ms=c_spec.fade_in_ms,
                    fade_out_ms=c_spec.fade_out_ms,
                    transition_in=c_spec.transition_in,
                    transition_out=c_spec.transition_out,
                    metadata_info={
                        **(c_spec.metadata_info or {}),
                        **({"color_grade": c_spec.color_grade} if c_spec.color_grade else {}),
                        **({"is_frame_hold": c_spec.is_frame_hold, "frame_hold_at_ms": c_spec.frame_hold_at_ms, "frame_hold_duration_ms": c_spec.frame_hold_duration_ms} if getattr(c_spec, "is_frame_hold", False) else {}),
                        **({"is_compound": bool(c_spec.is_compound)} if getattr(c_spec, "is_compound", False) else {}),
                        **({"nested_tracks": [t.model_dump() if hasattr(t, 'model_dump') else dict(t) for t in c_spec.nested_tracks]} if getattr(c_spec, "nested_tracks", None) else {}),
                        **({"markers": [m.model_dump() if hasattr(m, 'model_dump') else dict(m) for m in c_spec.markers]} if getattr(c_spec, "markers", None) else {}),
                        **({"group_id": c_spec.group_id} if getattr(c_spec, "group_id", None) else {}),
                        **({"linked_clip_id": c_spec.linked_clip_id} if getattr(c_spec, "linked_clip_id", None) else {}),
                        **({"freeze_duration_ms": c_spec.freeze_duration_ms} if getattr(c_spec, "freeze_duration_ms", None) else {}),
                    },
                )
                db.add(clip)
                await db.flush()

                for ef in c_spec.effects:
                    effect = Effect(
                        id=ef.id or str(uuid.uuid4()),
                        clip_id=clip.id,
                        effect_type=ef.effect_type,
                        effect_category=ef.effect_category,
                        order_index=ef.order_index,
                        is_enabled=ef.is_enabled,
                        parameters=ef.parameters,
                    )
                    db.add(effect)

                for kf in c_spec.keyframes:
                    keyframe = Keyframe(
                        id=kf.id or str(uuid.uuid4()),
                        clip_id=clip.id,
                        property_path=kf.property_path,
                        time_offset_ms=kf.time_offset_ms,
                        value=kf.value,
                        interpolation=kf.interpolation,
                        bezier_handles=kf.bezier_handles,
                    )
                    db.add(keyframe)

        await db.commit()
        db.expire_all()
        return await TimelineService.get_timeline_by_project(db, project_id)

    @staticmethod
    async def get_or_create_timeline(db: AsyncSession, project_id: str, name: str = "Main Sequence") -> Timeline:
        timeline = await TimelineService.get_timeline_by_project(db, project_id)
        if not timeline:
            timeline = Timeline(project_id=project_id, name=name, duration_ms=0)
            db.add(timeline)
            await db.commit()
            db.expire_all()
            timeline = await TimelineService.get_timeline_by_project(db, project_id)
        return timeline

    @staticmethod
    def serialize_timeline(timeline: Timeline) -> Dict[str, Any]:
        """Serializes full timeline hierarchy including tracks, clips, effects, and keyframes."""
        tracks_data = []
        tracks_raw = []
        if timeline:
            if hasattr(timeline, "__dict__") and "tracks" in timeline.__dict__:
                tracks_raw = timeline.tracks or []
            elif hasattr(timeline, "tracks"):
                try:
                    from sqlalchemy.orm import inspect as sa_inspect
                    insp = sa_inspect(timeline)
                    if hasattr(insp, "unloaded") and "tracks" in insp.unloaded:
                        tracks_raw = []
                    else:
                        tracks_raw = timeline.tracks or []
                except Exception:
                    tracks_raw = getattr(timeline, "tracks", []) or []

        sorted_tracks = sorted(tracks_raw, key=lambda tr: getattr(tr, 'order_index', 0))
        for t in sorted_tracks:
            clips_data = []
            clips_raw = []
            if hasattr(t, "__dict__") and "clips" in t.__dict__:
                clips_raw = t.clips or []
            elif hasattr(t, "clips"):
                try:
                    from sqlalchemy.orm import inspect as sa_inspect
                    insp = sa_inspect(t)
                    if hasattr(insp, "unloaded") and "clips" in insp.unloaded:
                        clips_raw = []
                    else:
                        clips_raw = t.clips or []
                except Exception:
                    clips_raw = getattr(t, "clips", []) or []

            sorted_clips = sorted(clips_raw, key=lambda cl: getattr(cl, 'start_time_ms', 0))
            for c in sorted_clips:
                effects_raw = []
                if hasattr(c, "__dict__") and "effects" in c.__dict__:
                    effects_raw = c.effects or []
                elif hasattr(c, "effects"):
                    try:
                        from sqlalchemy.orm import inspect as sa_inspect
                        insp = sa_inspect(c)
                        if hasattr(insp, "unloaded") and "effects" in insp.unloaded:
                            effects_raw = []
                        else:
                            effects_raw = c.effects or []
                    except Exception:
                        effects_raw = getattr(c, "effects", []) or []

                effects_data = [
                    {
                        "id": ef.id,
                        "effect_type": ef.effect_type,
                        "effect_category": ef.effect_category,
                        "order_index": ef.order_index,
                        "is_enabled": ef.is_enabled,
                        "parameters": ef.parameters or {}
                    }
                    for ef in effects_raw
                ]

                keyframes_raw = []
                if hasattr(c, "__dict__") and "keyframes" in c.__dict__:
                    keyframes_raw = c.keyframes or []
                elif hasattr(c, "keyframes"):
                    try:
                        from sqlalchemy.orm import inspect as sa_inspect
                        insp = sa_inspect(c)
                        if hasattr(insp, "unloaded") and "keyframes" in insp.unloaded:
                            keyframes_raw = []
                        else:
                            keyframes_raw = c.keyframes or []
                    except Exception:
                        keyframes_raw = getattr(c, "keyframes", []) or []

                keyframes_data = [
                    {
                        "id": kf.id,
                        "property_path": kf.property_path,
                        "time_offset_ms": kf.time_offset_ms,
                        "value": kf.value,
                        "interpolation": kf.interpolation,
                        "bezier_handles": kf.bezier_handles
                    }
                    for kf in keyframes_raw
                ]
                clips_data.append({
                    "id": c.id,
                    "asset_id": c.asset_id,
                    "scene_id": c.scene_id,
                    "name": c.name,
                    "clip_type": c.clip_type,
                    "start_time_ms": c.start_time_ms,
                    "duration_ms": c.duration_ms,
                    "source_in_ms": c.source_in_ms,
                    "source_out_ms": c.source_out_ms,
                    "speed_factor": c.speed_factor,
                    "is_reversed": c.is_reversed,
                    "is_frozen": c.is_frozen,
                    "freeze_at_ms": c.freeze_at_ms,
                    "is_frame_hold": bool((c.metadata_info or {}).get("is_frame_hold", False)),
                    "frame_hold_at_ms": (c.metadata_info or {}).get("frame_hold_at_ms"),
                    "frame_hold_duration_ms": (c.metadata_info or {}).get("frame_hold_duration_ms", 2000),
                    "opacity": c.opacity,
                    "blend_mode": c.blend_mode,
                    "position_x": c.position_x,
                    "position_y": c.position_y,
                    "scale_x": c.scale_x,
                    "scale_y": c.scale_y,
                    "rotation": c.rotation,
                    "anchor_x": c.anchor_x,
                    "anchor_y": c.anchor_y,
                    "crop_left": c.crop_left,
                    "crop_right": c.crop_right,
                    "crop_top": c.crop_top,
                    "crop_bottom": c.crop_bottom,
                    "volume_db": c.volume_db,
                    "fade_in_ms": c.fade_in_ms,
                    "fade_out_ms": c.fade_out_ms,
                    "transition_in": c.transition_in,
                    "transition_out": c.transition_out,
                    "is_compound": bool((c.metadata_info or {}).get("is_compound", False)),
                    "nested_tracks": (c.metadata_info or {}).get("nested_tracks"),
                    "markers": (c.metadata_info or {}).get("markers", []),
                    "group_id": (c.metadata_info or {}).get("group_id"),
                    "linked_clip_id": (c.metadata_info or {}).get("linked_clip_id"),
                    "freeze_duration_ms": (c.metadata_info or {}).get("freeze_duration_ms", 2000),
                    "metadata_info": c.metadata_info or {},
                    "effects": effects_data,
                    "keyframes": keyframes_data
                })
            tracks_data.append({
                "id": t.id,
                "track_type": t.track_type,
                "track_role": t.track_role,
                "order_index": t.order_index,
                "name": t.name,
                "is_muted": t.is_muted,
                "is_locked": t.is_locked,
                "is_visible": t.is_visible,
                "is_solo": t.is_solo,
                "volume_db": t.volume_db,
                "pan": t.pan,
                "height_px": t.height_px,
                "color": t.color,
                "clips": clips_data
            })

        return {
            "timeline_id": timeline.id,
            "project_id": timeline.project_id,
            "name": timeline.name,
            "duration_ms": timeline.duration_ms,
            "tracks": tracks_data,
            "markers": getattr(timeline, "markers", []) or [],
            "in_point_ms": getattr(timeline, "in_point_ms", None),
            "out_point_ms": getattr(timeline, "out_point_ms", None),
        }

    @staticmethod
    async def create_revision_snapshot(
        db: AsyncSession,
        timeline_id: str,
        description: str = "",
        timeline_obj: Optional[Timeline] = None
    ) -> Optional[TimelineRevision]:
        # Count existing revisions
        query = select(TimelineRevision).where(TimelineRevision.timeline_id == timeline_id).order_by(desc(TimelineRevision.revision_number))
        result = await db.execute(query)
        revisions = list(result.scalars().all())
        latest = revisions[0] if revisions else None
        next_rev = (latest.revision_number + 1) if latest else 1

        # Fetch timeline if not provided or if relationships are not loaded
        tl = timeline_obj
        if not tl or "tracks" not in getattr(tl, "__dict__", {}):
            tl_query = select(Timeline).where(Timeline.id == timeline_id).options(
                selectinload(Timeline.tracks).selectinload(Track.clips).selectinload(Clip.effects),
                selectinload(Timeline.tracks).selectinload(Track.clips).selectinload(Clip.keyframes),
            )
            tl_res = await db.execute(tl_query)
            tl = tl_res.scalar_one_or_none()

        snapshot_data = TimelineService.serialize_timeline(tl) if tl else {"timeline_id": timeline_id, "tracks": [], "duration_ms": 0}

        revision = TimelineRevision(
            timeline_id=timeline_id,
            revision_number=next_rev,
            description=description or f"Revision {next_rev}",
            snapshot=snapshot_data
        )
        db.add(revision)

        # Enforce max 50 server snapshots per timeline
        if len(revisions) >= 50:
            for old_rev in revisions[49:]:
                await db.delete(old_rev)

        return revision

    @staticmethod
    async def get_revisions(db: AsyncSession, project_id: str) -> List[TimelineRevision]:
        tl = await TimelineService.get_timeline_by_project(db, project_id)
        if not tl:
            return []
        query = select(TimelineRevision).where(TimelineRevision.timeline_id == tl.id).order_by(desc(TimelineRevision.revision_number))
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def get_revision(db: AsyncSession, project_id: str, revision_id: str) -> Optional[TimelineRevision]:
        tl = await TimelineService.get_timeline_by_project(db, project_id)
        if not tl:
            return None
        query = select(TimelineRevision).where(
            TimelineRevision.id == revision_id,
            TimelineRevision.timeline_id == tl.id
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def restore_revision(db: AsyncSession, project_id: str, revision_id: str) -> Timeline:
        """Restores a timeline to the exact state stored in a TimelineRevision snapshot."""
        revision = await TimelineService.get_revision(db, project_id, revision_id)
        if not revision:
            raise ValueError(f"Revision '{revision_id}' not found for project '{project_id}'")

        timeline = await TimelineService.get_timeline_by_project(db, project_id)
        if not timeline:
            raise ValueError(f"Timeline not found for project '{project_id}'")

        # Create pre-restore snapshot
        await TimelineService.create_revision_snapshot(
            db, timeline.id, description=f"Backup before restoring Rev #{revision.revision_number}", timeline_obj=timeline
        )

        # Delete current tracks
        for t in list(timeline.tracks):
            await db.delete(t)
        await db.flush()

        snapshot = revision.snapshot or {}
        timeline.duration_ms = snapshot.get("duration_ms", timeline.duration_ms)
        if snapshot.get("name"):
            timeline.name = snapshot["name"]

        if "markers" in snapshot:
            project = await db.get(Project, project_id)
            if project:
                settings = dict(project.settings or {})
                settings["timeline_markers"] = snapshot.get("markers", [])
                project.settings = settings
                timeline.markers = settings["timeline_markers"]

        # Rebuild tracks from snapshot
        for t_data in snapshot.get("tracks", []):
            track = Track(
                id=t_data.get("id") or str(uuid.uuid4()),
                timeline_id=timeline.id,
                track_type=t_data.get("track_type", "video"),
                track_role=t_data.get("track_role"),
                order_index=t_data.get("order_index", 0),
                name=t_data.get("name", "Track"),
                is_muted=t_data.get("is_muted", False),
                is_locked=t_data.get("is_locked", False),
                is_visible=t_data.get("is_visible", True),
                is_solo=t_data.get("is_solo", False),
                volume_db=t_data.get("volume_db", 0.0),
                pan=t_data.get("pan", 0.0),
                height_px=t_data.get("height_px", 64),
                color=t_data.get("color", "#1e3a8a")
            )
            db.add(track)
            await db.flush()

            for c_data in t_data.get("clips", []):
                clip = Clip(
                    id=c_data.get("id") or str(uuid.uuid4()),
                    track_id=track.id,
                    asset_id=c_data.get("asset_id"),
                    scene_id=c_data.get("scene_id"),
                    name=c_data.get("name", "Clip"),
                    clip_type=c_data.get("clip_type", "video"),
                    start_time_ms=c_data.get("start_time_ms", 0),
                    duration_ms=c_data.get("duration_ms", 0),
                    source_in_ms=c_data.get("source_in_ms", 0),
                    source_out_ms=c_data.get("source_out_ms", c_data.get("duration_ms", 0)),
                    speed_factor=c_data.get("speed_factor", 1.0),
                    is_reversed=c_data.get("is_reversed", False),
                    is_frozen=c_data.get("is_frozen", False),
                    freeze_at_ms=c_data.get("freeze_at_ms"),
                    opacity=c_data.get("opacity", 1.0),
                    blend_mode=c_data.get("blend_mode", "normal"),
                    position_x=c_data.get("position_x", 0.0),
                    position_y=c_data.get("position_y", 0.0),
                    scale_x=c_data.get("scale_x", 1.0),
                    scale_y=c_data.get("scale_y", 1.0),
                    rotation=c_data.get("rotation", 0.0),
                    anchor_x=c_data.get("anchor_x", 0.5),
                    anchor_y=c_data.get("anchor_y", 0.5),
                    crop_left=c_data.get("crop_left", 0.0),
                    crop_right=c_data.get("crop_right", 0.0),
                    crop_top=c_data.get("crop_top", 0.0),
                    crop_bottom=c_data.get("crop_bottom", 0.0),
                    volume_db=c_data.get("volume_db", 0.0),
                    fade_in_ms=c_data.get("fade_in_ms", 0),
                    fade_out_ms=c_data.get("fade_out_ms", 0),
                    transition_in=c_data.get("transition_in"),
                    transition_out=c_data.get("transition_out"),
                    metadata_info={
                        **(c_data.get("metadata_info", {}) or {}),
                        **({"is_frame_hold": c_data.get("is_frame_hold", False), "frame_hold_at_ms": c_data.get("frame_hold_at_ms"), "frame_hold_duration_ms": c_data.get("frame_hold_duration_ms", 2000)} if c_data.get("is_frame_hold") else {}),
                        **({"is_compound": c_data.get("is_compound", False), "nested_tracks": c_data.get("nested_tracks")} if c_data.get("is_compound") else {}),
                        **({"markers": c_data.get("markers", [])} if c_data.get("markers") else {}),
                        **({"group_id": c_data.get("group_id")} if c_data.get("group_id") else {}),
                        **({"linked_clip_id": c_data.get("linked_clip_id")} if c_data.get("linked_clip_id") else {}),
                        **({"freeze_duration_ms": c_data.get("freeze_duration_ms", 2000)} if c_data.get("freeze_duration_ms") else {}),
                    }
                )
                db.add(clip)
                await db.flush()

                for ef_data in c_data.get("effects", []):
                    effect = Effect(
                        id=ef_data.get("id") or str(uuid.uuid4()),
                        clip_id=clip.id,
                        effect_type=ef_data.get("effect_type", "filter"),
                        effect_category=ef_data.get("effect_category", "video"),
                        order_index=ef_data.get("order_index", 0),
                        is_enabled=ef_data.get("is_enabled", True),
                        parameters=ef_data.get("parameters", {})
                    )
                    db.add(effect)

                for kf_data in c_data.get("keyframes", []):
                    keyframe = Keyframe(
                        id=kf_data.get("id") or str(uuid.uuid4()),
                        clip_id=clip.id,
                        property_path=kf_data.get("property_path", "opacity"),
                        time_offset_ms=kf_data.get("time_offset_ms", 0),
                        value=kf_data.get("value", 0.0),
                        interpolation=kf_data.get("interpolation", "linear"),
                        bezier_handles=kf_data.get("bezier_handles")
                    )
                    db.add(keyframe)

        await db.commit()
        db.expire_all()
        return await TimelineService.get_timeline_by_project(db, project_id)

    @staticmethod
    async def create_graphics_clip(
        db: AsyncSession,
        project_id: str,
        data: GraphicsClipCreateRequest
    ) -> Dict[str, Any]:
        """
        Creates a cinematic graphics / title clip on the project's graphics track.
        If no graphics track exists, one is automatically created.
        """
        timeline = await TimelineService.get_timeline_by_project(db, project_id)
        if not timeline:
            timeline = Timeline(project_id=project_id, name="Main Sequence", duration_ms=data.duration_ms + data.start_time_ms)
            db.add(timeline)
            await db.flush()

        # Find or create graphics track
        graphics_track = None
        for track in timeline.tracks:
            if track.track_role == "graphics" or track.name.lower() == "graphics":
                graphics_track = track
                break

        if not graphics_track:
            graphics_track = Track(
                id=str(uuid.uuid4()),
                timeline_id=timeline.id,
                track_type="video",
                track_role="graphics",
                order_index=len(timeline.tracks),
                name="Graphics",
                color="#ea580c",
                height_px=60,
                is_visible=True,
                is_muted=False,
                is_locked=False,
            )
            db.add(graphics_track)
            await db.flush()

        # Create the title/graphics clip
        clip_id = str(uuid.uuid4())
        clip_name = f"Title: {data.title}" if not data.title.startswith("Title:") else data.title
        metadata = {
            "graphics": {
                "preset_id": data.preset_id,
                "title": data.title,
                "subtitle": data.subtitle or "",
                "tamil_text": data.tamil_text or "",
                "font_family": data.font_family,
                "font_size": data.font_size,
                "font_color": data.font_color,
                "box_color": data.box_color,
                "box_opacity": data.box_opacity,
                "alignment": data.alignment,
                "style_variant": data.style_variant or "default",
            },
            "text": {
                "content": data.title,
                "font_size": data.font_size,
                "font_color": data.font_color,
                "bg_color": data.box_color,
                "font_family": data.font_family,
                "alignment": data.alignment,
            }
        }

        clip = Clip(
            id=clip_id,
            track_id=graphics_track.id,
            name=clip_name,
            clip_type="title",
            start_time_ms=data.start_time_ms,
            duration_ms=data.duration_ms,
            source_in_ms=0,
            source_out_ms=data.duration_ms,
            position_x=data.position_x,
            position_y=data.position_y,
            fade_in_ms=data.fade_in_ms,
            fade_out_ms=data.fade_out_ms,
            opacity=1.0,
            metadata_info=metadata,
        )
        db.add(clip)

        # Update timeline duration if new clip extends beyond current duration
        end_time_ms = data.start_time_ms + data.duration_ms
        if end_time_ms > timeline.duration_ms:
            timeline.duration_ms = end_time_ms

        await db.commit()
        db.expire_all()

        updated_timeline = await TimelineService.get_timeline_by_project(db, project_id)
        return {
            "status": "success",
            "project_id": project_id,
            "timeline_id": timeline.id,
            "track_id": graphics_track.id,
            "clip_id": clip_id,
            "clip": {
                "id": clip_id,
                "name": clip_name,
                "clip_type": "title",
                "start_time_ms": data.start_time_ms,
                "duration_ms": data.duration_ms,
                "metadata_info": metadata,
            },
            "timeline": updated_timeline
        }


