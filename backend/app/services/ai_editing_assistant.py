import re
import uuid
import logging
from typing import Dict, Any, List, Optional
from app.schemas.ai_schemas import (
    EditPlan, EditOperation, EditOperationType, EditPlanStatus, EditPlanRequest
)

logger = logging.getLogger("tamil_ai_forge.ai_editing_assistant")

DANGEROUS_KEYWORDS = [
    "rm -rf", "drop table", "delete project", "delete database",
    "sudo", "bash", "sh ", "curl ", "wget ", "exec(", "eval(", "os.system"
]

AMBIGUOUS_KEYWORDS = [
    "make it viral", "make it cool", "make it awesome", "fix the video",
    "make it good", "do something", "enhance the vibe", "magic edit", "surprise me"
]


class AIEditingAssistant:
    """
    Deterministic natural-language editing assistant that converts user prompts
    into structured, safe, validated edit plans against active timeline context.
    """

    @staticmethod
    def parse_and_plan(request_data: EditPlanRequest) -> EditPlan:
        prompt = request_data.prompt.strip()
        cmd_lower = prompt.lower()
        plan_id = f"plan_{uuid.uuid4().hex[:8]}"

        # 1. Reject dangerous / injection commands
        if any(dk in cmd_lower for dk in DANGEROUS_KEYWORDS):
            return EditPlan(
                plan_id=plan_id,
                request=prompt,
                summary="Rejected unsafe command.",
                confidence=0.0,
                status=EditPlanStatus.UNSUPPORTED,
                is_valid=False,
                validation_errors=["The request contains prohibited system or destructive keywords."],
                requires_confirmation=False,
                operations=[]
            )

        # 2. Reject overly ambiguous / non-actionable prompts
        if any(ak in cmd_lower for ak in AMBIGUOUS_KEYWORDS) or len(cmd_lower.split()) < 2:
            return EditPlan(
                plan_id=plan_id,
                request=prompt,
                summary="Ambiguous prompt cannot be converted into concrete timeline operations.",
                confidence=0.3,
                status=EditPlanStatus.AMBIGUOUS,
                is_valid=False,
                validation_errors=["The instruction is too ambiguous. Specify concrete actions like 'Trim first clip to 5s' or 'Mute music'."],
                clarification_prompt="Try: 'Trim the first clip to 5 seconds', 'Mute background music', 'Add 1s crossfade', or 'Add title at the beginning'.",
                requires_confirmation=False,
                operations=[]
            )

        # 3. Extract timeline context
        timeline_ctx = request_data.timeline_context or {}
        tracks: List[Dict[str, Any]] = timeline_ctx.get("tracks", [])
        
        # Helper to collect all video clips in chronological order
        video_clips: List[Dict[str, Any]] = []
        music_tracks: List[Dict[str, Any]] = []
        all_tracks: Dict[str, Dict[str, Any]] = {}

        for tr in tracks:
            tr_id = tr.get("id", "")
            tr_type = tr.get("track_type", "")
            tr_role = tr.get("track_role", "")
            all_tracks[tr_id] = tr

            tr_name = tr.get("name", "").lower()
            if tr_role == "music" or "music" in tr_name or "bgm" in tr_name:
                music_tracks.append(tr)
            elif tr_type == "audio" and not music_tracks:
                music_tracks.append(tr)

            if tr_type == "video" or tr_role == "video" or "video" in tr_name or "v1" in tr_name or tr_type != "audio":
                for cl in tr.get("clips", []):
                    c_copy = dict(cl)
                    c_copy["track_id"] = tr_id
                    video_clips.append(c_copy)

        video_clips.sort(key=lambda c: c.get("start_time_ms", 0))

        # Helper to resolve target clip
        def resolve_clip(ref: str) -> Optional[Dict[str, Any]]:
            ref_l = ref.lower()
            if "first" in ref_l or "1st" in ref_l or "clip 1" in ref_l or "scene 1" in ref_l:
                return video_clips[0] if len(video_clips) > 0 else None
            elif "second" in ref_l or "2nd" in ref_l or "clip 2" in ref_l or "scene 2" in ref_l:
                return video_clips[1] if len(video_clips) > 1 else None
            elif "third" in ref_l or "3rd" in ref_l or "clip 3" in ref_l or "scene 3" in ref_l:
                return video_clips[2] if len(video_clips) > 2 else None
            elif "last" in ref_l:
                return video_clips[-1] if len(video_clips) > 0 else None
            elif request_data.selected_clip_id:
                for c in video_clips:
                    if c.get("id") == request_data.selected_clip_id:
                        return c
            # Fallback to first clip if only one exists
            return video_clips[0] if len(video_clips) == 1 else None

        operations: List[EditOperation] = []
        validation_errors: List[str] = []
        summary = ""

        # --- OPERATION 1: TRIM CLIP ---
        trim_match = re.search(r'(?:trim|shorten|cut)\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|last|this|selected)?\s*(?:clip|scene)?\s*(?:to|by)?\s*(\d+(?:\.\d+)?)\s*(?:seconds|sec|s)', cmd_lower)
        if trim_match:
            ref_word = trim_match.group(1) or "first"
            sec = float(trim_match.group(2))
            target_clip = resolve_clip(ref_word)
            if target_clip:
                new_dur_ms = int(sec * 1000)
                clip_id = target_clip.get("id", "clip_1")
                clip_name = target_clip.get("name", "Clip")
                cur_dur_ms = target_clip.get("duration_ms", 10000)
                delta_ms = new_dur_ms - cur_dur_ms

                operations.append(EditOperation(
                    id=f"op_{uuid.uuid4().hex[:6]}",
                    type=EditOperationType.TRIM,
                    target_type="clip",
                    target_id=clip_id,
                    target_name=clip_name,
                    track_id=target_clip.get("track_id"),
                    description=f"Trim clip '{clip_name}' duration to {sec:.1f} seconds (delta: {delta_ms/1000:+.1f}s).",
                    parameters={"edge": "right", "new_duration_ms": new_dur_ms, "delta_ms": delta_ms}
                ))
                summary = f"Trim '{clip_name}' to {sec:.1f}s."
            else:
                validation_errors.append(f"Cannot resolve target clip for reference '{ref_word}'. Ensure the timeline has clips.")

        # --- OPERATION 2: REMOVE / DELETE CLIP ---
        elif any(w in cmd_lower for w in ["remove", "delete", "ripple"]) and any(w in cmd_lower for w in ["clip", "scene"]):
            del_match = re.search(r'(?:remove|delete|ripple delete)?\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|last|this|selected)?\s*(?:clip|scene)', cmd_lower)
            ref_word = del_match.group(1) if del_match else "selected"
            target_clip = resolve_clip(ref_word or "selected")
            is_ripple = "ripple" in cmd_lower
            if target_clip:
                clip_id = target_clip.get("id", "clip_1")
                clip_name = target_clip.get("name", "Clip")
                op_type = EditOperationType.RIPPLE_DELETE if is_ripple else EditOperationType.DELETE
                operations.append(EditOperation(
                    id=f"op_{uuid.uuid4().hex[:6]}",
                    type=op_type,
                    target_type="clip",
                    target_id=clip_id,
                    target_name=clip_name,
                    track_id=target_clip.get("track_id"),
                    description=f"Remove clip '{clip_name}' from track{' and ripple close gap' if is_ripple else ''}.",
                    parameters={"ripple": is_ripple}
                ))
                summary = f"{'Ripple remove' if is_ripple else 'Remove'} clip '{clip_name}'."
            else:
                validation_errors.append(f"Cannot resolve clip to delete ('{ref_word or 'selected'}'). Select a clip or specify 'first clip'.")

        # --- OPERATION 3: SPLIT CLIP ---
        elif "split" in cmd_lower:
            split_match = re.search(r'split\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|this|selected)?\s*(?:clip|scene)?\s*(?:at\s*)?(\d+(?:\.\d+)?)?\s*(?:seconds|sec|s)?', cmd_lower)
            ref_word = split_match.group(1) if split_match else "first"
            sec_str = split_match.group(2) if split_match else None
            target_clip = resolve_clip(ref_word or "first")
            if target_clip:
                clip_id = target_clip.get("id", "clip_1")
                clip_name = target_clip.get("name", "Clip")
                split_ms = int(float(sec_str) * 1000) if sec_str else (request_data.playhead_ms or 5000)
                operations.append(EditOperation(
                    id=f"op_{uuid.uuid4().hex[:6]}",
                    type=EditOperationType.SPLIT,
                    target_type="clip",
                    target_id=clip_id,
                    target_name=clip_name,
                    track_id=target_clip.get("track_id"),
                    description=f"Split clip '{clip_name}' at {split_ms / 1000:.1f} seconds.",
                    parameters={"split_time_ms": split_ms, "playhead_ms": split_ms}
                ))
                summary = f"Split '{clip_name}' at {split_ms / 1000:.1f}s."
            else:
                validation_errors.append("Target clip for split operation could not be resolved.")

        # --- OPERATION 4: MUTE / VOLUME ---
        elif any(w in cmd_lower for w in ["mute", "lower music", "unmute", "music volume", "sound volume", "volume"]):
            vol_match = re.search(r'(-?\d+(?:\.\d+)?)\s*(?:db)?', cmd_lower)
            if "unmute" in cmd_lower:
                target_tr = music_tracks[0] if music_tracks else (tracks[1] if len(tracks) > 1 else None)
                if target_tr:
                    tr_id = target_tr.get("id")
                    tr_name = target_tr.get("name", "Audio Track")
                    operations.append(EditOperation(
                        id=f"op_{uuid.uuid4().hex[:6]}",
                        type=EditOperationType.VOLUME,
                        target_type="track",
                        target_id=tr_id,
                        target_name=tr_name,
                        track_id=tr_id,
                        description=f"Unmute audio track '{tr_name}'.",
                        parameters={"action": "unmute", "is_muted": False, "volume_db": 0.0}
                    ))
                    summary = f"Unmute '{tr_name}'."
                else:
                    validation_errors.append("No audio or music track found to unmute.")
            elif vol_match and ("volume" in cmd_lower or "db" in cmd_lower):
                target_tr = music_tracks[0] if music_tracks else (tracks[1] if len(tracks) > 1 else None)
                vol_db = float(vol_match.group(1))
                if target_tr:
                    tr_id = target_tr.get("id")
                    tr_name = target_tr.get("name", "Music Track")
                    operations.append(EditOperation(
                        id=f"op_{uuid.uuid4().hex[:6]}",
                        type=EditOperationType.VOLUME,
                        target_type="track",
                        target_id=tr_id,
                        target_name=tr_name,
                        track_id=tr_id,
                        description=f"Set track '{tr_name}' volume to {vol_db:.1f} dB.",
                        parameters={"action": "set_volume", "volume_db": vol_db}
                    ))
                    summary = f"Set music volume to {vol_db:.1f} dB."
                else:
                    validation_errors.append("No music track found to adjust volume.")
            elif "lower music" in cmd_lower or "ducking" in cmd_lower:
                target_tr = music_tracks[0] if music_tracks else (tracks[1] if len(tracks) > 1 else None)
                if target_tr:
                    tr_id = target_tr.get("id")
                    tr_name = target_tr.get("name", "Music Track")
                    operations.append(EditOperation(
                        id=f"op_{uuid.uuid4().hex[:6]}",
                        type=EditOperationType.VOLUME,
                        target_type="track",
                        target_id=tr_id,
                        target_name=tr_name,
                        track_id=tr_id,
                        description=f"Lower track '{tr_name}' volume to -12.0 dB for dialogue ducking.",
                        parameters={"action": "set_volume", "volume_db": -12.0}
                    ))
                    summary = f"Lower music volume to -12.0 dB."
                else:
                    validation_errors.append("No music track found to adjust volume.")
            else:
                # Standard mute
                target_tr = music_tracks[0] if music_tracks else (tracks[1] if len(tracks) > 1 else None)
                if target_tr:
                    tr_id = target_tr.get("id")
                    tr_name = target_tr.get("name", "Music Track")
                    operations.append(EditOperation(
                        id=f"op_{uuid.uuid4().hex[:6]}",
                        type=EditOperationType.MUTE,
                        target_type="track",
                        target_id=tr_id,
                        target_name=tr_name,
                        track_id=tr_id,
                        description=f"Mute audio track '{tr_name}'.",
                        parameters={"action": "mute", "is_muted": True}
                    ))
                    summary = f"Mute audio track '{tr_name}'."
                else:
                    validation_errors.append("No audio or music track found to mute.")

        # --- OPERATION 5: TRANSITION ---
        elif "transition" in cmd_lower or "crossfade" in cmd_lower or "fade" in cmd_lower:
            trans_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:second|sec|s)?\s*(?:crossfade|fade)?', cmd_lower)
            sec = float(trans_match.group(1)) if trans_match and trans_match.group(1) else 1.0
            dur_ms = int(sec * 1000)
            target_clip = resolve_clip("first")
            if target_clip:
                clip_id = target_clip.get("id", "clip_1")
                clip_name = target_clip.get("name", "Clip")
                t_type = "fade_to_black" if "black" in cmd_lower else "crossfade"
                operations.append(EditOperation(
                    id=f"op_{uuid.uuid4().hex[:6]}",
                    type=EditOperationType.TRANSITION,
                    target_type="clip",
                    target_id=clip_id,
                    target_name=clip_name,
                    track_id=target_clip.get("track_id"),
                    description=f"Add {sec:.1f}s {t_type} transition to clip '{clip_name}'.",
                    parameters={"edge": "out", "transition_type": t_type, "duration_ms": dur_ms}
                ))
                summary = f"Add {sec:.1f}s {t_type} transition to '{clip_name}'."
            else:
                validation_errors.append("No video clip found to attach transition.")

        # --- OPERATION 6: TITLE / INTRO ---
        elif any(w in cmd_lower for w in ["title", "intro"]):
            # Extract potential title text
            title_quote = re.search(r'[\'"]([^\'"]+)[\'"]', prompt)
            extracted_title = title_quote.group(1) if title_quote else "TAMIL AI FORGE"
            preset_id = "lower_third" if "lower third" in cmd_lower else ("tamil_card" if "tamil" in cmd_lower else "cinema_title")
            
            # Find or target graphics track
            graphics_tr = next((t for t in tracks if t.get("track_role") == "graphics" or "graphics" in t.get("name", "").lower()), None)
            tr_id = graphics_tr.get("id") if graphics_tr else "track_graphics"

            operations.append(EditOperation(
                id=f"op_{uuid.uuid4().hex[:6]}",
                type=EditOperationType.TITLE,
                target_type="track",
                target_id=tr_id,
                target_name="Cinematic Titles",
                track_id=tr_id,
                description=f"Add cinematic title '{extracted_title}' (preset: {preset_id}) at beginning (0s - 5s).",
                parameters={
                    "preset_id": preset_id,
                    "title": extracted_title,
                    "text": extracted_title,
                    "start_time_ms": 0,
                    "duration_ms": 5000,
                    "position_x": 0.5,
                    "position_y": 0.5
                }
            ))
            summary = f"Add title '{extracted_title}' at beginning."

        # --- OPERATION 7: MOVE / REORDER CLIP ---
        elif "move" in cmd_lower and any(w in cmd_lower for w in ["after", "before", "track"]):
            move_match = re.search(r'move\s+(?:the\s+)?(first|1st|second|2nd|this|selected)?\s*(?:clip)?\s*(after|before)\s+(?:the\s+)?(second|2nd|first|1st|next|last)?\s*(?:clip)?', cmd_lower)
            if move_match:
                src_ref = move_match.group(1) or "first"
                rel = move_match.group(2)
                tgt_ref = move_match.group(3) or "second"
                src_clip = resolve_clip(src_ref)
                tgt_clip = resolve_clip(tgt_ref)
                if src_clip and tgt_clip:
                    src_id = src_clip.get("id")
                    src_name = src_clip.get("name", "Clip")
                    tgt_name = tgt_clip.get("name", "Clip")
                    tgt_start = tgt_clip.get("start_time_ms", 0)
                    tgt_dur = tgt_clip.get("duration_ms", 5000)
                    new_start_ms = (tgt_start + tgt_dur) if rel == "after" else max(0, tgt_start - src_clip.get("duration_ms", 5000))

                    operations.append(EditOperation(
                        id=f"op_{uuid.uuid4().hex[:6]}",
                        type=EditOperationType.MOVE,
                        target_type="clip",
                        target_id=src_id,
                        target_name=src_name,
                        track_id=src_clip.get("track_id"),
                        description=f"Move clip '{src_name}' {rel} '{tgt_name}' to timecode {new_start_ms/1000:.1f}s.",
                        parameters={"new_start_time_ms": new_start_ms, "relation": rel, "reference_clip_id": tgt_clip.get("id")}
                    ))
                    summary = f"Move '{src_name}' {rel} '{tgt_name}'."
                else:
                    validation_errors.append("Could not resolve both source and target clips for move operation.")
            else:
                validation_errors.append("Move syntax not recognized. Use: 'Move first clip after second clip'.")

        # --- OPERATION 8: DURATION ---
        elif "seconds long" in cmd_lower or "total duration" in cmd_lower:
            dur_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:seconds|sec|s)\s*long', cmd_lower)
            if dur_match:
                target_sec = float(dur_match.group(1))
                operations.append(EditOperation(
                    id=f"op_{uuid.uuid4().hex[:6]}",
                    type=EditOperationType.DURATION,
                    target_type="timeline",
                    target_id=timeline_ctx.get("id", "timeline_main"),
                    target_name="Main Sequence",
                    description=f"Adjust overall timeline duration to {target_sec:.1f} seconds.",
                    parameters={"target_duration_ms": int(target_sec * 1000)}
                ))
                summary = f"Set video duration to {target_sec:.1f} seconds."
            else:
                validation_errors.append("Could not parse target duration in seconds.")

        # --- OPERATION 9: CAPTIONS ---
        elif "caption" in cmd_lower or "subtitle" in cmd_lower:
            caption_quote = re.search(r'[\'"]([^\'"]+)[\'"]', prompt)
            cap_text = caption_quote.group(1) if caption_quote else "Cinematic Tamil dialogue caption"
            operations.append(EditOperation(
                id=f"op_{uuid.uuid4().hex[:6]}",
                type=EditOperationType.CAPTION,
                target_type="track",
                target_id="track_captions",
                target_name="Captions Track",
                description=f"Add caption '{cap_text}' to subtitle track.",
                parameters={"text": cap_text, "start_time_ms": request_data.playhead_ms or 0, "duration_ms": 3000}
            ))
            summary = f"Add caption '{cap_text}'."

        # If nothing matched
        if not operations and not validation_errors:
            return EditPlan(
                plan_id=plan_id,
                request=prompt,
                summary="Unsupported editing instruction.",
                confidence=0.2,
                status=EditPlanStatus.UNSUPPORTED,
                is_valid=False,
                validation_errors=[
                    f"The instruction '{prompt}' does not match any supported timeline editing action.",
                    "Supported operations: Trim clip, Split clip, Remove clip, Move clip, Add transition, Mute/unmute track, Add title, Add caption."
                ],
                requires_confirmation=False,
                operations=[]
            )

        is_valid = len(validation_errors) == 0 and len(operations) > 0
        status = EditPlanStatus.READY_FOR_REVIEW if is_valid else EditPlanStatus.INVALID

        return EditPlan(
            plan_id=plan_id,
            request=prompt,
            summary=summary or "Proposed timeline edits.",
            confidence=0.95 if is_valid else 0.4,
            status=status,
            is_valid=is_valid,
            validation_errors=validation_errors,
            requires_confirmation=True,
            operations=operations
        )
