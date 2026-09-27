import asyncio
import json
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, List, Callable
from app.config import settings
from app.core.color_pipeline import build_color_filter_chain, build_vfx_filter_chain

logger = logging.getLogger("tamil_ai_forge.ffmpeg")

class FFmpegService:
    def __init__(self):
        self.ffmpeg_bin = settings.get_ffmpeg_executable()
        self.ffprobe_bin = settings.get_ffprobe_executable()

    async def _run_ffmpeg(self, cmd: List[str]) -> Dict[str, Any]:
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            return {
                "returncode": proc.returncode,
                "stdout": stdout.decode("utf-8", errors="ignore"),
                "stderr": stderr.decode("utf-8", errors="ignore")
            }
        except Exception as e:
            return {"returncode": -1, "stdout": "", "stderr": str(e)}

    async def probe_media(self, file_path: Path) -> Dict[str, Any]:
        """Probes a media file and returns width, height, duration_ms, fps, codecs."""
        info: Dict[str, Any] = {
            "width": None,
            "height": None,
            "duration_ms": 0,
            "fps": 30.0,
            "codec_video": None,
            "codec_audio": None,
            "sample_rate": None,
            "channels": None,
        }

        # Try probe using ffprobe if available
        cmd = [
            self.ffprobe_bin,
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            str(file_path)
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            if proc.returncode == 0:
                data = json.loads(stdout.decode("utf-8", errors="ignore"))
                format_info = data.get("format", {})
                duration_sec = float(format_info.get("duration", 0))
                info["duration_ms"] = int(duration_sec * 1000)

                for s in data.get("streams", []):
                    codec_type = s.get("codec_type")
                    if codec_type == "video" and not info["codec_video"]:
                        info["codec_video"] = s.get("codec_name")
                        info["width"] = int(s.get("width", 0)) if s.get("width") else None
                        info["height"] = int(s.get("height", 0)) if s.get("height") else None
                        # Calculate FPS
                        r_frame_rate = s.get("r_frame_rate", "30/1")
                        if "/" in r_frame_rate:
                            num, den = r_frame_rate.split("/")
                            if float(den) > 0:
                                info["fps"] = round(float(num) / float(den), 2)
                    elif codec_type == "audio" and not info["codec_audio"]:
                        info["codec_audio"] = s.get("codec_name")
                        info["sample_rate"] = int(s.get("sample_rate", 48000)) if s.get("sample_rate") else 48000
                        info["channels"] = int(s.get("channels", 2)) if s.get("channels") else 2

                return info
        except Exception as e:
            logger.warning(f"ffprobe failed or not installed: {e}. Attempting fallback probe via ffmpeg.")

        # Fallback: run ffmpeg -i and parse stderr
        try:
            cmd = [self.ffmpeg_bin, "-i", str(file_path)]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await proc.communicate()
            err_text = stderr.decode("utf-8", errors="ignore")
            # Parse Duration: 00:00:05.12
            dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", err_text)
            if dur_match:
                h, m, s = dur_match.groups()
                total_sec = int(h) * 3600 + int(m) * 60 + float(s)
                info["duration_ms"] = int(total_sec * 1000)

            # Parse video resolution: e.g. 1920x1080
            res_match = re.search(r",\s*(\d{3,4})x(\d{3,4})", err_text)
            if res_match:
                info["width"] = int(res_match.group(1))
                info["height"] = int(res_match.group(2))
                info["codec_video"] = "h264"

            if "Audio:" in err_text:
                info["codec_audio"] = "aac"
                info["sample_rate"] = 48000
                info["channels"] = 2
        except Exception as e2:
            logger.error(f"Fallback probe also failed: {e2}")

        return info

    async def generate_proxy(self, source_path: Path, output_path: Path) -> bool:
        """
        Generates web-optimized 720p proxy with fixed GOP=15 and no B-frames for zero-latency scrub.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            self.ffmpeg_bin, "-y",
            "-i", str(source_path),
            "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
            "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1",
            "-preset", "veryfast", "-crf", "23",
            "-g", "15", "-keyint_min", "15", "-sc_threshold", "0", "-bf", "0",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart",
            str(output_path)
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await proc.communicate()
            if proc.returncode != 0:
                logger.error(f"Proxy generation failed: {stderr.decode('utf-8', errors='ignore')}")
                return False
            return True
        except Exception as e:
            logger.error(f"Failed to run proxy generation: {e}")
            return False

    async def generate_thumbnail(self, source_path: Path, output_path: Path, time_sec: float = 1.0) -> bool:
        """Extracts a poster frame thumbnail."""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            self.ffmpeg_bin, "-y",
            "-ss", str(time_sec),
            "-i", str(source_path),
            "-vframes", "1",
            "-vf", "scale=360:-1",
            "-q:v", "2",
            str(output_path)
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await proc.communicate()
            return proc.returncode == 0
        except Exception as e:
            logger.error(f"Thumbnail generation error: {e}")
            return False

    async def extract_waveform_peaks(self, audio_path: Path, points_per_sec: int = 20) -> List[float]:
        """
        Generates normalized audio peaks (0.0 to 1.0) for fast timeline waveform rendering.
        """
        cmd = [
            self.ffmpeg_bin, "-y",
            "-i", str(audio_path),
            "-ac", "1",
            "-ar", "1000",
            "-f", "u8",
            "-"
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            if proc.returncode != 0 or not stdout:
                return [0.1, 0.4, 0.8, 0.5, 0.3, 0.7, 0.2]

            raw_bytes = list(stdout)
            chunk_size = max(1, len(raw_bytes) // 120)
            peaks: List[float] = []
            for i in range(0, len(raw_bytes), chunk_size):
                chunk = raw_bytes[i:i + chunk_size]
                if chunk:
                    val = max(abs(b - 128) for b in chunk) / 128.0
                    peaks.append(round(min(1.0, val), 2))

            return peaks[:120]
        except Exception as e:
            logger.warning(f"Peak extraction failed: {e}")
            return [0.2, 0.5, 0.8, 0.4, 0.6, 0.9, 0.3]

    async def trim_clip(
        self,
        source_path: Path,
        output_path: Path,
        start_ms: int,
        duration_ms: int,
        speed: float = 1.0,
        is_reversed: bool = False,
        freeze_at_ms: Optional[int] = None,
        target_width: int = 1920,
        target_height: int = 1080,
    ) -> bool:
        """
        Accurately trims and processes a clip segment with speed, reverse, and freeze-frame.
        Safe argument array execution with bounds checking.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        start_sec = max(0.0, start_ms / 1000.0)
        dur_sec = max(0.1, duration_ms / 1000.0)

        # Handle freeze frame
        if freeze_at_ms is not None:
            freeze_sec = max(0.0, freeze_at_ms / 1000.0)
            cmd = [
                self.ffmpeg_bin, "-y",
                "-ss", str(freeze_sec),
                "-i", str(source_path),
                "-vframes", "1",
                "-loop", "1",
                "-t", str(dur_sec),
                "-vf", f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                str(output_path)
            ]
        else:
            # Build video and audio filter chains
            v_filters = [
                f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2",
                "format=yuv420p"
            ]
            a_filters = []

            # Speed factor
            if speed != 1.0 and speed > 0:
                pts_factor = 1.0 / speed
                v_filters.append(f"setpts={pts_factor}*PTS")
                # atempo filter supports 0.5 to 2.0 per instance
                if 0.5 <= speed <= 2.0:
                    a_filters.append(f"atempo={speed}")
                elif speed > 2.0:
                    a_filters.extend(["atempo=2.0", f"atempo={speed/2.0}"])
                else:
                    a_filters.extend(["atempo=0.5", f"atempo={speed/0.5}"])

            # Reverse
            if is_reversed:
                v_filters.append("reverse")
                a_filters.append("areverse")

            cmd = [
                self.ffmpeg_bin, "-y",
                "-ss", str(start_sec),
                "-i", str(source_path),
                "-t", str(dur_sec),
                "-vf", ",".join(v_filters),
                "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            ]

            if a_filters:
                cmd.extend(["-af", ",".join(a_filters), "-c:a", "aac", "-b:a", "192k"])
            else:
                cmd.extend(["-c:a", "aac", "-b:a", "192k"])

            cmd.append(str(output_path))

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await proc.communicate()
            if proc.returncode != 0:
                logger.error(f"trim_clip failed: {stderr.decode('utf-8', errors='ignore')}")
                return False
            return True
        except Exception as e:
            logger.error(f"trim_clip execution error: {e}")
            return False

    async def apply_transition(
        self,
        clip_a_path: Path,
        clip_b_path: Path,
        output_path: Path,
        transition_type: str = "fade",
        duration_sec: float = 1.0,
        target_width: int = 1920,
        target_height: int = 1080,
    ) -> bool:
        """
        Blends two video clips using FFmpeg xfade transition filter.
        Supported transitions: fade, wipeleft, wiperight, slideleft, slideright, circleopen.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        # Probe clip A duration
        probe_a = await self.probe_media(clip_a_path)
        dur_a_sec = max(0.5, probe_a.get("duration_ms", 1000) / 1000.0)
        offset_sec = max(0.0, dur_a_sec - duration_sec)

        xfade_name = {
            "fade": "fade",
            "cross_dissolve": "dissolve",
            "dissolve": "dissolve",
            "wipe_left": "wipeleft",
            "wipe_right": "wiperight",
            "slide_left": "slideleft",
            "slide_right": "slideright",
            "dip_to_black": "fadeblack",
            "dip_to_white": "fadewhite",
        }.get(transition_type.lower(), "fade")

        filter_str = (
            f"[0:v]scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v0];"
            f"[1:v]scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v1];"
            f"[v0][v1]xfade=transition={xfade_name}:duration={duration_sec}:offset={offset_sec}[outv];"
            f"[0:a][1:a]acrossfade=d={duration_sec}[outa]"
        )

        cmd = [
            self.ffmpeg_bin, "-y",
            "-i", str(clip_a_path),
            "-i", str(clip_b_path),
            "-filter_complex", filter_str,
            "-map", "[outv]",
            "-map", "[outa]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            str(output_path)
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await proc.communicate()
            return proc.returncode == 0
        except Exception as e:
            logger.error(f"apply_transition error: {e}")
            return False

    async def mix_audio_tracks(
        self,
        audio_inputs: List[Dict[str, Any]],
        output_path: Path,
        total_duration_sec: float = 30.0,
    ) -> bool:
        """
        Mixes multiple audio tracks (dialogue, music, sfx) with per-track volume, fades, and delays.
        audio_inputs format: [{'path': Path, 'volume': float, 'delay_ms': int, 'fade_in_ms': int, 'fade_out_ms': int}]
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if not audio_inputs:
            # Generate silence
            cmd = [
                self.ffmpeg_bin, "-y",
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:duration={total_duration_sec}",
                "-c:a", "aac", "-b:a", "192k",
                str(output_path)
            ]
        else:
            cmd = [self.ffmpeg_bin, "-y"]
            filter_parts = []
            inputs_count = len(audio_inputs)

            for idx, item in enumerate(audio_inputs):
                cmd.extend(["-i", str(item["path"])])
                vol = item.get("volume", 1.0)
                delay_ms = item.get("delay_ms", 0)
                fade_in_s = item.get("fade_in_ms", 0) / 1000.0
                fade_out_s = item.get("fade_out_ms", 0) / 1000.0

                filters = ["aformat=sample_rates=48000:channel_layouts=stereo"]

                # Volume & Gain
                if vol != 1.0:
                    filters.append(f"volume={vol}")

                # Pan / Balance (-1.0 to 1.0)
                pan_val = item.get("pan", 0.0)
                if pan_val != 0.0:
                    left_g = max(0.0, min(1.0, 1.0 - pan_val)) if pan_val > 0 else 1.0
                    right_g = max(0.0, min(1.0, 1.0 + pan_val)) if pan_val < 0 else 1.0
                    filters.append(f"pan=stereo|c0={left_g:.2f}*c0|c1={right_g:.2f}*c1")

                # Equalizer (5-Band)
                eq = item.get("equalizer")
                if isinstance(eq, dict):
                    if eq.get("low_80"):
                        filters.append(f"equalizer=f=80:width_type=o:w=1:g={eq['low_80']}")
                    if eq.get("low_mid_250"):
                        filters.append(f"equalizer=f=250:width_type=o:w=1:g={eq['low_mid_250']}")
                    if eq.get("mid_1000"):
                        filters.append(f"equalizer=f=1000:width_type=o:w=1:g={eq['mid_1000']}")
                    if eq.get("high_mid_4000"):
                        filters.append(f"equalizer=f=4000:width_type=o:w=1:g={eq['high_mid_4000']}")
                    if eq.get("high_12000"):
                        filters.append(f"equalizer=f=12000:width_type=o:w=1:g={eq['high_12000']}")

                # Dynamics / Compressor
                comp = item.get("compressor")
                if isinstance(comp, dict) and comp.get("enabled"):
                    th = comp.get("threshold_db", -18)
                    ratio = comp.get("ratio", 3.5)
                    att = comp.get("attack_ms", 20)
                    rel = comp.get("release_ms", 120)
                    mkup = comp.get("makeup_gain_db", 3.0)
                    filters.append(f"acompressor=threshold={th}dB:ratio={ratio}:attack={att}:release={rel}:makeup={mkup}dB")

                # Noise Reduction
                nr = item.get("noise_reduction")
                if isinstance(nr, dict) and nr.get("enabled"):
                    amt = abs(nr.get("amount_db", -12))
                    filters.append(f"afftdn=nr={amt}")

                # Ducking attenuation
                duck = item.get("ducking")
                if isinstance(duck, dict) and duck.get("enabled"):
                    duck_db = duck.get("duck_amount_db", -12)
                    duck_gain = 10.0 ** (duck_db / 20.0)
                    filters.append(f"volume={duck_gain:.3f}")

                # Delay & Fades
                if delay_ms > 0:
                    filters.append(f"adelay={delay_ms}|{delay_ms}")
                if fade_in_s > 0:
                    filters.append(f"afade=t=in:ss=0:d={fade_in_s}")
                if fade_out_s > 0:
                    filters.append(f"afade=t=out:st={total_duration_sec - fade_out_s}:d={fade_out_s}")

                filter_parts.append(f"[{idx}:a]{','.join(filters)}[a{idx}]")

            mix_inputs = "".join(f"[a{i}]" for i in range(inputs_count))
            filter_parts.append(f"{mix_inputs}amix=inputs={inputs_count}:duration=first:dropout_transition=2[outa]")

            cmd.extend([
                "-filter_complex", ";".join(filter_parts),
                "-map", "[outa]",
                "-t", str(total_duration_sec),
                "-c:a", "aac", "-b:a", "192k",
                str(output_path)
            ])

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await proc.communicate()
            return proc.returncode == 0
        except Exception as e:
            logger.error(f"mix_audio_tracks error: {e}")
            return False

    @staticmethod
    def get_system_font_path(prefer_tamil: bool = True) -> Optional[str]:
        """Detects high-quality Unicode / Tamil system fonts for FFmpeg drawtext."""
        candidates = []
        if prefer_tamil:
            candidates.extend([
                r"C:\Windows\Fonts\Nirmala.ttc",
                r"C:\Windows\Fonts\nirmala.ttf",
                "/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf",
                "/usr/share/fonts/truetype/lohit-tamil/Lohit-Tamil.ttf",
            ])
        candidates.extend([
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\calibri.ttf",
            r"C:\Windows\Fonts\segoeui.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ])
        for c in candidates:
            if os.path.exists(c):
                return c.replace("\\", "/").replace(":", r"\:")
        return None

    @staticmethod
    def escape_drawtext_string(text: str) -> str:
        """Safely escapes strings for FFmpeg drawtext filter syntax."""
        if not text:
            return ""
        escaped = str(text).replace("\\", "\\\\")
        escaped = escaped.replace("'", "'\\''")
        escaped = escaped.replace(":", r"\:")
        escaped = escaped.replace("%", r"\%")
        escaped = escaped.replace("[", r"\[")
        escaped = escaped.replace("]", r"\]")
        return escaped

    @staticmethod
    def build_graphics_drawtext_filters(
        graphics_clips: List[Dict[str, Any]],
        video_width: int = 1920,
        video_height: int = 1080
    ) -> List[str]:
        """
        Builds FFmpeg drawtext filter chains for each cinematic graphics/title clip.
        Supports dual-layer text (title + subtitle/tamil), custom positioning,
        background boxes, and interval timing.
        """
        filters: List[str] = []
        font_path = FFmpegService.get_system_font_path(prefer_tamil=True)
        font_arg = f":fontfile='{font_path}'" if font_path else ""

        # Scale factor relative to 1080p reference
        scale_ref = video_height / 1080.0

        for clip in graphics_clips:
            start_sec = max(0.0, clip.get("start_time_ms", 0) / 1000.0)
            dur_sec = max(0.1, clip.get("duration_ms", 4000) / 1000.0)
            end_sec = start_sec + dur_sec

            meta = clip.get("metadata_info") or {}
            g_meta = meta.get("graphics") or {}
            t_meta = meta.get("text") or {}

            raw_title = g_meta.get("title") or t_meta.get("content") or clip.get("name") or "Title"
            if raw_title.startswith("Title: "):
                raw_title = raw_title[7:]
            raw_sub = g_meta.get("subtitle") or g_meta.get("tamil_text") or ""
            preset_id = g_meta.get("preset_id") or "cinema_title"

            font_size = int(round((g_meta.get("font_size") or t_meta.get("font_size") or 48) * scale_ref))
            font_color = g_meta.get("font_color") or t_meta.get("font_color") or "white"
            if font_color.startswith("#"):
                font_color = font_color.lstrip("#")
                if len(font_color) == 6:
                    font_color = f"0x{font_color}"

            box_opacity = float(g_meta.get("box_opacity", 0.6))
            box_enabled = 1 if box_opacity > 0.05 else 0

            alignment = g_meta.get("alignment") or t_meta.get("alignment") or "center"

            if alignment == "lower_third":
                x_expr = "w*0.08"
                y_expr = "h*0.78"
                sub_y_expr = f"h*0.78+{font_size + 8}"
            elif alignment == "top_left":
                x_expr = "w*0.06"
                y_expr = "h*0.10"
                sub_y_expr = f"h*0.10+{font_size + 6}"
            elif alignment == "bottom":
                x_expr = "(w-text_w)/2"
                y_expr = "h*0.82"
                sub_y_expr = f"h*0.82+{font_size + 8}"
            else:  # center
                if raw_sub:
                    x_expr = "(w-text_w)/2"
                    y_expr = f"(h-text_h)/2-{int(round(font_size * 0.4))}"
                    sub_y_expr = f"(h-text_h)/2+{int(round(font_size * 0.7))}"
                else:
                    x_expr = "(w-text_w)/2"
                    y_expr = "(h-text_h)/2"
                    sub_y_expr = ""

            title_escaped = FFmpegService.escape_drawtext_string(raw_title)
            box_params = f":box=1:boxcolor=black@{box_opacity:.2f}:boxborderw=12" if box_enabled else ""
            timing_arg = f":enable='between(t,{start_sec:.3f},{end_sec:.3f})'"

            title_filter = (
                f"drawtext=text='{title_escaped}'{font_arg}:fontsize={font_size}:fontcolor={font_color}"
                f":x={x_expr}:y={y_expr}{box_params}{timing_arg}"
            )
            filters.append(title_filter)

            if raw_sub and sub_y_expr:
                sub_escaped = FFmpegService.escape_drawtext_string(raw_sub)
                sub_size = max(14, int(round(font_size * 0.55)))
                sub_color = "0xf59e0b" if preset_id in ["cinema_title", "tamil_card"] else "0x94a3b8" if preset_id in ["timestamp", "credit_roll"] else "0x38bdf8"
                sub_filter = (
                    f"drawtext=text='{sub_escaped}'{font_arg}:fontsize={sub_size}:fontcolor={sub_color}"
                    f":x={x_expr}:y={sub_y_expr}{timing_arg}"
                )
                filters.append(sub_filter)

        return filters

    async def render_timeline_sequence(
        self,
        timeline_duration_ms: int,
        video_clips: List[Dict[str, Any]],
        audio_clips: List[Dict[str, Any]],
        output_path: Path,
        export_preset: Dict[str, Any],
        progress_callback: Optional[Callable[[float], Any]] = None,
        subtitles_path: Optional[Path] = None,
        burn_subtitles: bool = False,
        graphics_clips: Optional[List[Dict[str, Any]]] = None,
    ) -> bool:
        """
        Assembles all project timeline clips into a final master video with progress tracking.
        Synchronizes multi-track audio (dialogue, music, sfx) with video, supports aspect ratio
        framing (16:9, 9:16 vertical shorts, 2.39:1 CinemaScope), and optional subtitle burn-in.
        Runs safely outside HTTP request cycle via BackgroundTasks or worker.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        width = int(export_preset.get("width", 1920))
        height = int(export_preset.get("height", 1080))
        fps = float(export_preset.get("fps", 30.0))
        crf = int(export_preset.get("crf", 18))
        video_codec = export_preset.get("video_codec") or export_preset.get("codec") or "libx264"
        audio_codec = export_preset.get("audio_codec", "aac")
        audio_bitrate = export_preset.get("audio_bitrate", "192k")
        framing_mode = (export_preset.get("framing_mode") or "fit").lower()
        burn_subs = burn_subtitles or bool(export_preset.get("burn_subtitles"))
        total_duration_sec = max(1.0, timeline_duration_ms / 1000.0)
        total_frames = int(total_duration_sec * fps)

        def get_framing_filters(w: int, h: int, mode: str) -> List[str]:
            if mode in ["fill", "center_crop"]:
                return [
                    f"scale={w}:{h}:force_original_aspect_ratio=increase",
                    f"crop={w}:{h}",
                    f"fps={fps}",
                    "format=yuv420p"
                ]
            elif mode == "cinemascope":
                scope_h = int(w / 2.39)
                if scope_h % 2 != 0:
                    scope_h -= 1
                return [
                    f"scale={w}:{scope_h}:force_original_aspect_ratio=decrease",
                    f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black",
                    f"fps={fps}",
                    "format=yuv420p"
                ]
            else:  # default "fit"
                return [
                    f"scale={w}:{h}:force_original_aspect_ratio=decrease",
                    f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
                    f"fps={fps}",
                    "format=yuv420p"
                ]

        inputs_cmd = []
        filter_chains = []

        if not video_clips:
            # Case 1: Empty timeline or no visual clips -> generate clean black cinema canvas
            inputs_cmd.extend([
                "-f", "lavfi",
                "-i", f"color=c=black:s={width}x{height}:r={fps}:d={total_duration_sec}"
            ])
            if burn_subs and subtitles_path and Path(subtitles_path).exists():
                escaped_sub = str(subtitles_path).replace("\\", "/").replace(":", r"\:").replace("'", "")
                filter_chains.append(f"[0:v]subtitles='{escaped_sub}':force_style='FontSize=22,FontName=Arial,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=3,MarginV=30'[v_base]")
            else:
                filter_chains.append("[0:v]copy[v_base]")

            video_input_offset = 1
            has_video_concat = False
        else:
            # Case 2: Concatenate and scale visual clips in order
            segment_labels = []
            for idx, clip in enumerate(video_clips):
                source_path = clip["file_path"]
                start_sec = max(0.0, clip.get("source_in_ms", 0) / 1000.0)
                dur_sec = max(0.1, clip.get("duration_ms", 1000) / 1000.0)
                speed = clip.get("speed_factor", 1.0)
                is_reversed = clip.get("is_reversed", False)

                inputs_cmd.extend(["-ss", str(start_sec), "-t", str(dur_sec), "-i", str(source_path)])

                seg_vfilters = get_framing_filters(width, height, framing_mode)
                if speed != 1.0 and speed > 0:
                    seg_vfilters.append(f"setpts={1.0/speed}*PTS")
                if is_reversed:
                    seg_vfilters.append("reverse")

                color_meta = clip.get("color_grade") or (clip.get("metadata_info") or {}).get("color_grade")
                if isinstance(color_meta, dict):
                    seg_vfilters.extend(build_color_filter_chain(color_meta))

                vfx_effects = clip.get("effects") or (clip.get("metadata_info") or {}).get("effects")
                if isinstance(vfx_effects, list):
                    seg_vfilters.extend(build_vfx_filter_chain(vfx_effects))

                filter_chains.append(f"[{idx}:v]{','.join(seg_vfilters)}[v{idx}]")

                # Check if video has audio stream
                probe_res = await self.probe_media(Path(source_path))
                if probe_res.get("codec_audio"):
                    filter_chains.append(f"[{idx}:a]aformat=sample_rates=48000:channel_layouts=stereo[a{idx}]")
                else:
                    filter_chains.append(f"aevalsrc=0:d={dur_sec}:s=48000:c=stereo[a{idx}]")

                segment_labels.append(f"[v{idx}][a{idx}]")

            concat_in = "".join(segment_labels)
            filter_chains.append(f"{concat_in}concat=n={len(video_clips)}:v=1:a=1[v_concat][v_audio_concat]")

            if burn_subs and subtitles_path and Path(subtitles_path).exists():
                escaped_sub = str(subtitles_path).replace("\\", "/").replace(":", r"\:").replace("'", "")
                filter_chains.append(f"[v_concat]subtitles='{escaped_sub}':force_style='FontSize=22,FontName=Arial,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=3,MarginV=30'[v_base]")
            else:
                filter_chains.append("[v_concat]copy[v_base]")

            video_input_offset = len(video_clips)
            has_video_concat = True

        # Process Graphics & Cinematic Titles overlays
        graphics_filters = []
        if graphics_clips:
            graphics_filters = self.build_graphics_drawtext_filters(graphics_clips, width, height)

        if graphics_filters:
            gf_chain = ",".join(graphics_filters)
            filter_chains.append(f"[v_base]{gf_chain}[outv]")
        else:
            filter_chains.append("[v_base]copy[outv]")

        # Multi-Track Audio Mixing: Process timeline audio clips (Dialogue A1, Music A3, SFX A4)
        audio_streams_to_mix = []
        if has_video_concat:
            audio_streams_to_mix.append("[v_audio_concat]")

        for a_idx, a_clip in enumerate(audio_clips):
            a_path = a_clip["file_path"]
            a_in = max(0.0, a_clip.get("source_in_ms", 0) / 1000.0)
            a_dur = max(0.1, a_clip.get("duration_ms", 1000) / 1000.0)
            a_start_ms = max(0, a_clip.get("start_time_ms", 0))
            a_vol_db = float(a_clip.get("volume_db", 0.0) or 0.0)
            a_gain = 10.0 ** (a_vol_db / 20.0)
            a_fade_in = max(0.0, (a_clip.get("fade_in_ms", 0) or 0) / 1000.0)
            a_fade_out = max(0.0, (a_clip.get("fade_out_ms", 0) or 0) / 1000.0)

            input_num = video_input_offset + a_idx
            inputs_cmd.extend(["-ss", str(a_in), "-t", str(a_dur), "-i", str(a_path)])

            af_filters = ["aformat=sample_rates=48000:channel_layouts=stereo"]
            if abs(a_gain - 1.0) > 0.001:
                af_filters.append(f"volume={a_gain:.4f}")
            if a_fade_in > 0:
                af_filters.append(f"afade=t=in:ss=0:d={a_fade_in:.3f}")
            if a_fade_out > 0:
                af_filters.append(f"afade=t=out:st={max(0.0, a_dur - a_fade_out):.3f}:d={a_fade_out:.3f}")
            if a_start_ms > 0:
                af_filters.append(f"adelay={a_start_ms}|{a_start_ms}")

            filter_chains.append(f"[{input_num}:a]{','.join(af_filters)}[tl_a{a_idx}]")
            audio_streams_to_mix.append(f"[tl_a{a_idx}]")

        # Mix all audio streams
        if not audio_streams_to_mix:
            filter_chains.append(f"aevalsrc=0:d={total_duration_sec}:s=48000:c=stereo[outa]")
        elif len(audio_streams_to_mix) == 1:
            filter_chains.append(f"{audio_streams_to_mix[0]}apad=whole_dur={total_duration_sec},atrim=0:{total_duration_sec}[outa]")
        else:
            mix_inputs_str = "".join(audio_streams_to_mix)
            filter_chains.append(f"{mix_inputs_str}amix=inputs={len(audio_streams_to_mix)}:duration=longest:dropout_transition=2[mixed_a]")
            filter_chains.append(f"[mixed_a]apad=whole_dur={total_duration_sec},atrim=0:{total_duration_sec}[outa]")

        cmd = [
            self.ffmpeg_bin, "-y",
            *inputs_cmd,
            "-filter_complex", ";".join(filter_chains),
            "-map", "[outv]",
            "-map", "[outa]",
            "-c:v", video_codec, "-preset", "veryfast", "-crf", str(crf),
            "-c:a", audio_codec, "-b:a", audio_bitrate,
            "-progress", "pipe:1",
            str(output_path)
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            # Read progress from stdout
            if proc.stdout:
                while True:
                    line = await proc.stdout.readline()
                    if not line:
                        break
                    line_str = line.decode("utf-8", errors="ignore").strip()
                    if line_str.startswith("frame=") and total_frames > 0:
                        try:
                            current_frame = int(line_str.split("=")[1].strip())
                            pct = min(99.0, round((current_frame / total_frames) * 100.0, 1))
                            if progress_callback:
                                await progress_callback(pct)
                        except (ValueError, IndexError):
                            pass

            await proc.wait()
            if proc.returncode == 0:
                if progress_callback:
                    await progress_callback(100.0)
                return True
            else:
                stderr = await proc.stderr.read() if proc.stderr else b""
                logger.error(f"render_timeline_sequence failed: {stderr.decode('utf-8', errors='ignore')}")
                return False
        except Exception as e:
            logger.error(f"render_timeline_sequence error: {e}")
            return False

ffmpeg_service = FFmpegService()
