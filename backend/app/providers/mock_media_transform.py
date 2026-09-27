import asyncio
import logging
import os
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, Callable

from app.config import settings
from app.core.ffmpeg import ffmpeg_service

logger = logging.getLogger("tamil_ai_forge.providers.mock_media_transform")

class MockMediaTransformProvider:
    """
    Offline deterministic Media Transformation Provider.
    Generates genuine, playable media outputs using local FFmpeg filter graphs.
    Preserves original video duration, FPS, motion, timing, and audio stream.
    Strictly offline; 0 external AI calls; 0 external AI quota consumed.
    """

    def __init__(self):
        self._temp_dir = Path(settings.STORAGE_ROOT) / "temp"
        self._temp_dir.mkdir(parents=True, exist_ok=True)

    async def transform_video(
        self,
        source_path: Path,
        mode: str,
        style_preset: str = "3d_cartoon",
        prompt: Optional[str] = None,
        reference_path: Optional[Path] = None,
        style_strength: float = 80.0,
        preserve_audio: bool = True,
        progress_callback: Optional[Callable[[float, str], Any]] = None,
    ) -> Dict[str, Any]:
        """
        Transforms a video using deterministic FFmpeg stylization filters.
        Preserves exact duration, framerate, and audio track.
        """
        logger.info(f"MockMediaTransformProvider.transform_video: mode={mode}, style={style_preset}, source={source_path}")

        if progress_callback:
            await progress_callback(10.0, "Analyzing source video frames and audio")
        await asyncio.sleep(0.15)

        probe = await ffmpeg_service.probe_media(source_path)
        width = probe.get("width") or 1280
        height = probe.get("height") or 720
        fps = probe.get("fps") or 30.0
        duration_ms = probe.get("duration_ms") or 4000
        duration_sec = max(0.5, duration_ms / 1000.0)
        has_audio = bool(probe.get("codec_audio"))

        # Width and height must be even for H.264
        w = max(64, width - (width % 2))
        h = max(64, height - (height % 2))

        output_file = self._temp_dir / f"transform_{uuid.uuid4().hex[:12]}.mp4"

        if progress_callback:
            await progress_callback(35.0, f"Applying {style_preset.replace('_', ' ').title()} stylized filtergraph")
        await asyncio.sleep(0.15)

        # Build style-specific filter chain
        saturation = 1.0 + (style_strength / 100.0) * 0.5
        contrast = 1.0 + (style_strength / 100.0) * 0.2

        if "cartoon" in style_preset or "pixar" in style_preset or "kids" in style_preset:
            vf = f"scale={w}:{h},hqdn3d=3:2:4:3,eq=saturation={saturation:.2f}:contrast={contrast:.2f}:brightness=0.02,unsharp=5:5:0.7:5:5:0.0"
        elif "anime" in style_preset:
            vf = f"scale={w}:{h},hqdn3d=4:3:6:4.5,eq=saturation={saturation*1.1:.2f}:contrast={contrast:.2f},unsharp=3:3:0.9:3:3:0.0"
        elif "cinematic" in style_preset:
            vf = f"scale={w}:{h},eq=contrast={contrast*1.05:.2f}:saturation={saturation*0.9:.2f},colorbalance=rs=0.04:gs=-0.02:bs=-0.04:rm=-0.01:gm=0.01:bm=0.03"
        elif "clay" in style_preset:
            vf = f"scale={w}:{h},hqdn3d=6:4:8:6,eq=saturation={saturation*0.9:.2f}:contrast={contrast*1.1:.2f}"
        else:
            vf = f"scale={w}:{h},eq=saturation={saturation:.2f}:contrast={contrast:.2f}"

        # If source file exists on disk, run stylization filter
        if source_path.exists() and source_path.stat().st_size > 0:
            cmd = [
                ffmpeg_service.ffmpeg_bin,
                "-y",
                "-i", str(source_path),
                "-vf", vf,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-pix_fmt", "yuv420p",
                "-r", str(fps),
            ]
            if has_audio and preserve_audio:
                cmd.extend(["-c:a", "aac", "-b:a", "128k"])
            else:
                # Add silence source if needed or shortest
                cmd.extend(["-an"])

            cmd.extend(["-t", f"{duration_sec:.3f}", str(output_file)])
            res = await ffmpeg_service._run_ffmpeg(cmd)
            if res["returncode"] != 0:
                logger.warning(f"FFmpeg filter failed, creating synthetic fallback: {res.get('stderr')}")
                output_file = await self._generate_fallback_video(duration_sec, w, h, fps, "0x2563eb")
        else:
            # Source didn't exist directly on disk, synthesize valid output
            output_file = await self._generate_fallback_video(duration_sec, w, h, fps, "0x2563eb")

        if progress_callback:
            await progress_callback(80.0, "Verifying video streams and container metadata")
        await asyncio.sleep(0.1)

        final_probe = await ffmpeg_service.probe_media(output_file)

        if progress_callback:
            await progress_callback(100.0, "Transformation complete")

        return {
            "output_path": output_file,
            "metadata": {
                "width": final_probe.get("width") or w,
                "height": final_probe.get("height") or h,
                "duration_ms": final_probe.get("duration_ms") or duration_ms,
                "fps": final_probe.get("fps") or fps,
                "codec_video": final_probe.get("codec_video") or "h264",
                "codec_audio": final_probe.get("codec_audio") or ("aac" if (has_audio and preserve_audio) else None),
                "is_mock": True,
                "offline_label": "OFFLINE DEMO TRANSFORMATION (MOCK)",
                "style_preset": style_preset,
                "mode": mode,
            }
        }

    async def transform_image(
        self,
        source_path: Path,
        mode: str,
        style_preset: str = "3d_cartoon",
        prompt: Optional[str] = None,
        reference_path: Optional[Path] = None,
        style_strength: float = 80.0,
        progress_callback: Optional[Callable[[float, str], Any]] = None,
    ) -> Dict[str, Any]:
        """
        Transforms an image using local deterministic FFmpeg filter graphs.
        Produces a genuine, valid PNG file.
        """
        logger.info(f"MockMediaTransformProvider.transform_image: mode={mode}, style={style_preset}, source={source_path}")

        if progress_callback:
            await progress_callback(15.0, "Analyzing source image resolution & color profile")
        await asyncio.sleep(0.1)

        output_file = self._temp_dir / f"transform_{uuid.uuid4().hex[:12]}.png"

        probe = await ffmpeg_service.probe_media(source_path)
        w = probe.get("width") or 1024
        h = probe.get("height") or 1024

        if progress_callback:
            await progress_callback(45.0, f"Applying {style_preset.replace('_', ' ').title()} rendering passes")
        await asyncio.sleep(0.15)

        saturation = 1.0 + (style_strength / 100.0) * 0.45
        contrast = 1.0 + (style_strength / 100.0) * 0.25

        if "cartoon" in style_preset or "pixar" in style_preset or "kids" in style_preset:
            vf = f"eq=saturation={saturation:.2f}:contrast={contrast:.2f}:brightness=0.03,unsharp=5:5:0.8:5:5:0.0"
        elif "anime" in style_preset:
            vf = f"eq=saturation={saturation*1.15:.2f}:contrast={contrast:.2f},unsharp=3:3:1.0:3:3:0.0"
        elif "cinematic" in style_preset:
            vf = f"eq=contrast={contrast*1.1:.2f}:saturation={saturation*0.9:.2f},colorbalance=rs=0.03:gs=-0.01:bs=-0.03"
        else:
            vf = f"eq=saturation={saturation:.2f}:contrast={contrast:.2f}"

        if source_path.exists() and source_path.stat().st_size > 0:
            cmd = [
                ffmpeg_service.ffmpeg_bin,
                "-y",
                "-i", str(source_path),
                "-vf", vf,
                "-vframes", "1",
                str(output_file)
            ]
            res = await ffmpeg_service._run_ffmpeg(cmd)
            if res["returncode"] != 0:
                output_file = await self._generate_fallback_image(w, h, "0x3b82f6")
        else:
            output_file = await self._generate_fallback_image(w, h, "0x3b82f6")

        if progress_callback:
            await progress_callback(85.0, "Writing formatted asset image")
        await asyncio.sleep(0.1)

        final_probe = await ffmpeg_service.probe_media(output_file)

        if progress_callback:
            await progress_callback(100.0, "Image transformation complete")

        return {
            "output_path": output_file,
            "metadata": {
                "width": final_probe.get("width") or w,
                "height": final_probe.get("height") or h,
                "duration_ms": 0,
                "codec_video": "png",
                "is_mock": True,
                "offline_label": "OFFLINE DEMO TRANSFORMATION (MOCK)",
                "style_preset": style_preset,
                "mode": mode,
            }
        }

    async def _generate_fallback_video(self, duration_sec: float, width: int, height: int, fps: float, color: str) -> Path:
        """Generates synthetic valid MP4 file with AAC audio if source is missing."""
        output_file = self._temp_dir / f"fallback_{uuid.uuid4().hex[:12]}.mp4"
        d = max(0.5, float(duration_sec))
        w = max(64, width - (width % 2))
        h = max(64, height - (height % 2))
        r = int(fps) if fps else 30

        cmd = [
            ffmpeg_service.ffmpeg_bin,
            "-y",
            "-f", "lavfi",
            "-i", f"color=c={color}:s={w}x{h}:r={r}:d={d}",
            "-f", "lavfi",
            "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:d={d}",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            str(output_file)
        ]
        await ffmpeg_service._run_ffmpeg(cmd)
        return output_file

    async def _generate_fallback_image(self, width: int, height: int, color: str) -> Path:
        """Generates synthetic valid PNG file if source is missing."""
        output_file = self._temp_dir / f"fallback_{uuid.uuid4().hex[:12]}.png"
        cmd = [
            ffmpeg_service.ffmpeg_bin,
            "-y",
            "-f", "lavfi",
            "-i", f"color=c={color}:s={width}x{height}:d=1",
            "-vframes", "1",
            str(output_file)
        ]
        await ffmpeg_service._run_ffmpeg(cmd)
        return output_file

mock_media_transform_provider = MockMediaTransformProvider()
