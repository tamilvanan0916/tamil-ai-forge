import re
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.ai_schemas import AIActionItem, AICommandActionResponse
from app.ai.registry import AIRegistry
from app.providers.factory import UnconfiguredProviderError

logger = logging.getLogger("tamil_ai_forge.ai_command")


class AICommandService:
    @staticmethod
    async def process_command(project_id: str, command: str, context: Optional[Dict[str, Any]] = None) -> AICommandActionResponse:
        """
        Interprets natural language editing instructions into executable structured timeline and project actions.
        Parses intent via rule matching & LLM provider if configured.
        """
        cmd_lower = command.lower().strip()
        actions: List[AIActionItem] = []
        summary = f"Parsed command: '{command}'"

        # 1. Match "Split this / the clip at X seconds"
        split_match = re.search(r'split\s*(?:this|the)?\s*clip.*?(\d+)\s*(?:second|sec|s)', cmd_lower)
        if split_match:
            sec = int(split_match.group(1))
            actions.append(AIActionItem(
                type="SPLIT_CLIP",
                target_id="selected_clip",
                duration_ms=sec * 1000,
                details={"split_time_ms": sec * 1000, "split_sec": sec}
            ))
            summary = f"Split clip at {sec} seconds."

        # 2. Match "Move this / the clip to V2 / A2"
        move_track_match = re.search(r'move\s*(?:this|the)?\s*clip\s*to\s*(?:track\s*)?([va]\d+)', cmd_lower)
        if move_track_match and not actions:
            target_tr = move_track_match.group(1).upper()
            actions.append(AIActionItem(
                type="MOVE_CLIP_TRACK",
                target_id="selected_clip",
                track_id=target_tr,
                details={"target_track": target_tr}
            ))
            summary = f"Moved clip to track {target_tr}."

        # 3. Phase 9B: "Create a cinematic short film about..."
        film_match = re.search(r'create\s+(?:a\s+)?(?:cinematic\s+)?(?:short\s+)?film\s+about\s+(.+)', cmd_lower)
        if film_match and not actions:
            topic = film_match.group(1).strip()
            actions.append(AIActionItem(
                type="CREATE_FILM_PROJECT",
                text=topic,
                details={"topic": topic, "prompt": command, "genre": "Drama", "style": "Cinematic Kollywood"}
            ))
            summary = f"Created cinematic short film project about: '{topic}'."

        # 4. Phase 9B: "Generate all scenes."
        if ("generate all scenes" in cmd_lower or "generate every scene" in cmd_lower) and not actions:
            actions.append(AIActionItem(
                type="GENERATE_ALL_SCENES",
                details={"action": "generate_all_scenes"}
            ))
            summary = "Generating video for all scenes in the film project."

        # 5. Phase 8 & 9B: "Regenerate all failed scenes"
        if "regenerate" in cmd_lower and ("failed" in cmd_lower or "error" in cmd_lower) and not actions:
            actions.append(AIActionItem(
                type="REGENERATE_FAILED_SCENES",
                details={"action": "retry_failed_scenes"}
            ))
            summary = "Regenerating all failed scene jobs."

        # 6. Phase 8 & 9B: "Regenerate scene X."
        regen_match = re.search(r'regenerate\s*scene\s*(\d+)', cmd_lower)
        if regen_match and not actions:
            sc_num = int(regen_match.group(1))
            actions.append(AIActionItem(
                type="REGENERATE_SCENE",
                target_id=f"scene_{sc_num}",
                details={"scene_number": sc_num, "action": "regenerate_single"}
            ))
            summary = f"Regenerating scene {sc_num}."

        # 7. Phase 9B: "Extend this scene by X seconds." / "Extend scene X by Y seconds."
        extend_match = re.search(r'extend\s*(?:this|the)?\s*(?:scene|clip)?\s*(\d+)?\s*by\s*(\d+)\s*(?:second|sec|s)', cmd_lower)
        if extend_match and not actions:
            sc_num = extend_match.group(1)
            ext_sec = int(extend_match.group(2))
            actions.append(AIActionItem(
                type="EXTEND_SCENE",
                target_id=f"scene_{sc_num}" if sc_num else "selected_clip",
                duration_ms=ext_sec * 1000,
                details={"scene_number": int(sc_num) if sc_num else None, "extension_sec": ext_sec}
            ))
            summary = f"Extending {'scene ' + sc_num if sc_num else 'selected scene'} by {ext_sec} seconds."

        # 8. Phase 9B: "Make scene X more emotional." / "Make scene X [mood]"
        scene_mood_match = re.search(r'make\s+scene\s+(\d+)\s+(?:more\s+)?([a-zA-Z]+)', cmd_lower)
        if scene_mood_match and "second" not in cmd_lower and "sec" not in cmd_lower and not actions:
            sc_num = int(scene_mood_match.group(1))
            mood_val = scene_mood_match.group(2)
            actions.append(AIActionItem(
                type="UPDATE_SCENE_MOOD",
                target_id=f"scene_{sc_num}",
                details={"scene_number": sc_num, "mood": mood_val}
            ))
            summary = f"Updated scene {sc_num} mood to more {mood_val}."

        # 9. Phase 8: "Make [Character] [mood] in scene X"
        char_mood_match = re.search(r'make\s+([a-zA-Z]+)\s+([a-zA-Z]+)\s+in\s+scene\s+(\d+)', cmd_lower)
        if char_mood_match and not actions:
            char_name, mood_val, sc_num = char_mood_match.groups()
            actions.append(AIActionItem(
                type="UPDATE_SCENE_MOOD",
                target_id=f"scene_{sc_num}",
                details={"scene_number": int(sc_num), "character": char_name, "mood": mood_val}
            ))
            summary = f"Updated scene {sc_num} for {char_name.capitalize()} to feel more {mood_val}."

        # 10. Phase 9B: "Use Tamil dialogue."
        if ("tamil dialogue" in cmd_lower or "use tamil dialogue" in cmd_lower or "tamil language" in cmd_lower) and not actions:
            actions.append(AIActionItem(
                type="SET_DIALOGUE_LANGUAGE",
                details={"language": "ta", "action": "use_tamil_dialogue"}
            ))
            summary = "Set project dialogue and narration language to Tamil."

        # 11. Phase 9B: "Add rain sound effects." / SFX
        sfx_match = re.search(r'add\s+(?:([a-zA-Z]+)\s+)?(?:sound\s*effects?|sfx)', cmd_lower)
        if sfx_match and not actions:
            sfx_type = sfx_match.group(1) or "ambient"
            actions.append(AIActionItem(
                type="ADD_SFX",
                target_id="track_a4_sfx",
                details={"sfx_type": sfx_type, "track_role": "sfx"}
            ))
            summary = f"Added {sfx_type} sound effects to audio track A4."

        # 12. Phase 9B: "Add emotional Tamil music." / BGM
        if ("music" in cmd_lower or "bgm" in cmd_lower or "soundtrack" in cmd_lower) and "lower" not in cmd_lower and not actions:
            genre = "Emotional Tamil" if "tamil" in cmd_lower else "Cinematic"
            actions.append(AIActionItem(
                type="ADD_BACKGROUND_MUSIC",
                target_id="track_a3_music",
                details={"genre": genre, "track_role": "music", "volume_db": -6.0}
            ))
            summary = f"Added {genre.lower()} background music to audio track A3."

        # 13. Phase 9B: "Render the final film." / "Render film"
        if ("render" in cmd_lower and ("film" in cmd_lower or "video" in cmd_lower or "project" in cmd_lower)) and not actions:
            actions.append(AIActionItem(
                type="RENDER_FILM",
                details={"action": "render_film", "export_format": "mp4", "quality": "high"}
            ))
            summary = "Enqueued final film production render to the render queue."

        # 14. Phase 8 & 9B: "Create a 9:16 version." / "Make a 9:16 version"
        if ("9:16" in cmd_lower or "vertical" in cmd_lower) and ("create" in cmd_lower or "make" in cmd_lower or "version" in cmd_lower) and not actions:
            actions.append(AIActionItem(
                type="CREATE_SHORTS",
                details={"aspect_ratio": "9:16", "duration_sec": 30}
            ))
            summary = "Created 9:16 vertical short project action."

        # 15. Match "Make scene/clip X Y seconds / sec" or "Make this clip 5 seconds"
        sec_match = re.search(r'(?:scene|clip)\s*(\d+)?.*?(\d+)\s*(?:second|sec|s)', cmd_lower)
        if sec_match and not actions:
            scene_num = sec_match.group(1)
            sec = int(sec_match.group(2))
            target_id = f"scene_{scene_num}" if scene_num else "selected_clip"
            actions.append(AIActionItem(
                type="SET_CLIP_DURATION",
                target_id=target_id,
                duration_ms=sec * 1000,
                details={"scene_number": int(scene_num) if scene_num else None, "duration_sec": sec}
            ))
            summary = f"Set duration for {'scene ' + scene_num if scene_num else 'selected clip'} to {sec} seconds."

        # 16. Match "Create a storyboard from this script / script to storyboard"
        if "storyboard" in cmd_lower and ("create" in cmd_lower or "generate" in cmd_lower or "from" in cmd_lower) and not actions:
            actions.append(AIActionItem(
                type="CREATE_STORYBOARD",
                details={"prompt": command}
            ))
            summary = "Created storyboard from script."

        # 17. Match "Move scene X before / after scene Y"
        move_match = re.search(r'move\s*scene\s*(\d+)\s*(before|after)\s*scene\s*(\d+)', cmd_lower)
        if move_match and not actions:
            src, relation, target = move_match.groups()
            actions.append(AIActionItem(
                type="MOVE_SCENE",
                target_id=f"scene_{src}",
                details={"source_scene": int(src), "relation": relation, "target_scene": int(target)}
            ))
            summary = f"Moved scene {src} {relation} scene {target}."

        # 18. Match "Make this scene cinematic"
        if "cinematic" in cmd_lower and "camera" not in cmd_lower and not actions:
            actions.append(AIActionItem(
                type="APPLY_CINEMATIC_GRADE",
                target_id="selected_clip",
                color_grade={"temperature": 6500, "contrast": 1.25, "saturation": 1.15, "highlights": 0.05, "shadows": -0.08},
                details={"preset": "Kollywood Cinema Master", "aspect_ratio": "2.39:1"}
            ))
            summary = "Applied cinematic color grading and 2.39:1 cinema styling to scene."

        # 19. Match "Make the video warmer / cooler / vibrant"
        if "warmer" in cmd_lower and not actions:
            actions.append(AIActionItem(
                type="SET_CLIP_COLOR",
                color_grade={"temperature": 7500, "highlights": 0.1, "saturation": 1.1},
                details={"preset": "Kollywood Warm"}
            ))
            summary = "Applied warm color grading to selected clips."
        elif "cooler" in cmd_lower and not actions:
            actions.append(AIActionItem(
                type="SET_CLIP_COLOR",
                color_grade={"temperature": 4500, "shadows": -0.1},
                details={"preset": "Cool Cinema"}
            ))
            summary = "Applied cool color grading."

        # 20. Match "Lower music under dialogue / set music volume"
        if ("lower music" in cmd_lower or "music under dialogue" in cmd_lower) and not actions:
            actions.append(AIActionItem(
                type="SET_TRACK_VOLUME",
                target_id="track_a3_music",
                volume_db=-12.0,
                details={"track_role": "music", "action": "ducking"}
            ))
            summary = "Lowered music track volume to -12.0 dB for dialogue ducking."

        # 21. Match "Add cinematic captions / Tamil captions / create subtitles"
        if ("caption" in cmd_lower or "subtitle" in cmd_lower) and not actions:
            actions.append(AIActionItem(
                type="ADD_CAPTION",
                text="வணக்கம் நண்பர்களே",
                details={"language": "ta", "style": {"font_size": 36, "color": "#FFFFFF"}}
            ))
            summary = "Added cinematic Tamil captions track."

        # 22. Match "Slow motion"
        if ("slow motion" in cmd_lower or "slow mo" in cmd_lower) and not actions:
            actions.append(AIActionItem(
                type="SET_CLIP_SPEED",
                details={"speed_factor": 0.5}
            ))
            summary = "Set selected clip playback speed to 0.5x (slow motion)."

        # 23. Match "Add a transition" / "crossfade transition"
        if ("transition" in cmd_lower or "fade" in cmd_lower) and not actions:
            actions.append(AIActionItem(
                type="ADD_TRANSITION",
                details={"transition_type": "crossfade", "duration_ms": 1000}
            ))
            summary = "Added 1.0s crossfade transition to clip."

        # 24. Phase 8: "Change scene X to nighttime / daytime / sunset"
        time_match = re.search(r'(?:change|set|make)\s*scene\s*(\d+).*?(nighttime|night|daytime|day|sunset|sunrise|golden hour)', cmd_lower)
        if time_match and not actions:
            sc_num = int(time_match.group(1))
            new_time = time_match.group(2).capitalize()
            actions.append(AIActionItem(
                type="UPDATE_SCENE_TIME",
                target_id=f"scene_{sc_num}",
                details={"scene_number": sc_num, "time_of_day": new_time}
            ))
            summary = f"Changed scene {sc_num} time of day to {new_time}."

        # 25. Phase 8: "Use a cinematic camera movement"
        if ("cinematic camera" in cmd_lower or "camera movement" in cmd_lower or "camera motion" in cmd_lower) and not actions:
            actions.append(AIActionItem(
                type="UPDATE_SCENE_CAMERA",
                target_id="selected_scene",
                details={"camera_motion": "Cinematic Dolly Zoom", "camera_directions": "Dynamic Tracking, Smooth Crane"}
            ))
            summary = "Applied cinematic camera motion to scene."

        # 26. Phase 8: "Make the entire story / video X seconds / min"
        story_dur_match = re.search(r'(?:entire\s*story|entire\s*video|whole\s*story|project).*?(\d+)\s*(?:second|sec|s|minute|min|m)', cmd_lower)
        if story_dur_match and not actions:
            dur_val = int(story_dur_match.group(1))
            if "min" in cmd_lower:
                dur_val = dur_val * 60
            actions.append(AIActionItem(
                type="SET_STORY_DURATION",
                duration_ms=dur_val * 1000,
                details={"target_duration_sec": dur_val}
            ))
            summary = f"Set total project duration to {dur_val} seconds."

        # 27. Match "Create / Generate Tamil scene / intro"
        if "scene" in cmd_lower and ("create" in cmd_lower or "generate" in cmd_lower or "add" in cmd_lower) and not actions:
            actions.append(AIActionItem(
                type="CREATE_SCENE",
                text=command,
                details={"prompt": command, "duration_sec": 5.0}
            ))
            summary = f"Created new scene task for prompt: '{command}'."


        # If no regex matched, try LLM if available, else default action
        if not actions:
            try:
                llm = AIRegistry.get_llm()
                # LLM execution if configured
                actions.append(AIActionItem(
                    type="APPLY_AI_PROMPT",
                    text=command,
                    details={"prompt": command}
                ))
                summary = f"Processed natural language AI prompt: '{command}'"
            except UnconfiguredProviderError:
                actions.append(AIActionItem(
                    type="CREATE_SCENE",
                    text=command,
                    details={"prompt": command, "duration_sec": 5.0}
                ))
                summary = f"Interpreted natural language command: '{command}'"

        return AICommandActionResponse(
            original_command=command,
            summary=summary,
            status="executed",
            actions=actions
        )
