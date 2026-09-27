import asyncio
import logging
import os
import uuid
from pathlib import Path
from typing import Optional, Dict, Any

from app.config import settings
from app.core.ffmpeg import ffmpeg_service
from app.providers.base import VideoProvider, GenerationResult

logger = logging.getLogger("tamil_ai_forge.providers.mock_video")


class MockVideoProvider(VideoProvider):
    """
    Offline, development-only Mock Video Generator.
    Generates genuine, playable H.264/AAC MP4 media files using local FFmpeg.
    Passes genuine FFprobe validation with non-null width, height, duration, and codecs.
    Supports simulation modes:
      - 'SUCCESS': generates valid playable MP4
      - 'FAILURE': simulates provider failure
      - 'TIMEOUT': simulates provider timeout
    """

    def __init__(self, mode: Optional[str] = None):
        self.mode = (mode or getattr(settings, "MOCK_VIDEO_MODE", "SUCCESS")).upper()
        self._temp_dir = Path(settings.STORAGE_ROOT) / "temp"
        self._temp_dir.mkdir(parents=True, exist_ok=True)

    async def _simulate_delay(self):
        """Simulates non-blocking async generation latency."""
        await asyncio.sleep(0.3)

    async def _generate_synthetic_mp4(
        self,
        duration_sec: float,
        width: int,
        height: int,
        color: str = "0x1e293b",
        fps: int = 24
    ) -> Path:
        """Generates a genuine, playable H.264/AAC MP4 using local FFmpeg."""
        file_id = str(uuid.uuid4())
        output_file = self._temp_dir / f"mock_video_{file_id}.mp4"

        # Clamping to valid dimensions (even numbers required by H.264)
        w = max(64, width - (width % 2))
        h = max(64, height - (height % 2))
        d = max(0.5, float(duration_sec))

        cmd = [
            ffmpeg_service.ffmpeg_bin,
            "-y",
            "-f", "lavfi",
            "-i", f"color=c={color}:s={w}x{h}:r={fps}:d={d}",
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

        result = await ffmpeg_service._run_ffmpeg(cmd)
        if result["returncode"] != 0:
            err = result.get("stderr", "Unknown FFmpeg error")
            logger.error(f"FFmpeg synthetic video generation failed: {err}")
            raise RuntimeError(f"FFmpeg synthetic video generation failed: {err}")

        return output_file

    async def text_to_video(
        self,
        prompt: str,
        duration_sec: float = 4.0,
        width: int = 1280,
        height: int = 720,
        reference_image: Optional[str] = None
    ) -> GenerationResult:
        """Simulates Text-to-Video generation using local FFmpeg."""
        logger.info(f"MockVideoProvider.text_to_video(mode={self.mode}, prompt='{prompt[:40]}...', dur={duration_sec}s)")
        await self._simulate_delay()

        if self.mode == "FAILURE":
            return GenerationResult(
                success=False,
                error="Mock video generation simulated failure"
            )

        if self.mode == "TIMEOUT":
            return GenerationResult(
                success=False,
                error="Mock video generation simulated timeout (request timed out)"
            )

        try:
            output_file = await self._generate_synthetic_mp4(
                duration_sec=duration_sec,
                width=width,
                height=height,
                color="0x1e293b"
            )
            # Probe to confirm validity
            probe = await ffmpeg_service.probe_media(output_file)
            logger.info(f"MockVideoProvider created valid MP4: {output_file} (probe: {probe})")

            return GenerationResult(
                success=True,
                output_path=str(output_file),
                output_url=str(output_file),
                usage={
                    "provider": "mock",
                    "mode": self.mode,
                    "simulated": True,
                    "duration_sec": duration_sec,
                    "width": probe.get("width", width),
                    "height": probe.get("height", height),
                    "fps": probe.get("fps", 24.0)
                }
            )
        except Exception as e:
            logger.exception(f"MockVideoProvider text_to_video error: {e}")
            return GenerationResult(success=False, error=str(e))

    async def image_to_video(
        self,
        image_path: str,
        prompt: str,
        duration_sec: float = 4.0
    ) -> GenerationResult:
        """Simulates Image-to-Video generation using local FFmpeg."""
        logger.info(f"MockVideoProvider.image_to_video(mode={self.mode}, prompt='{prompt[:40]}...')")
        await self._simulate_delay()

        if self.mode == "FAILURE":
            return GenerationResult(success=False, error="Mock video generation simulated failure")

        if self.mode == "TIMEOUT":
            return GenerationResult(success=False, error="Mock video generation simulated timeout")

        try:
            output_file = await self._generate_synthetic_mp4(
                duration_sec=duration_sec,
                width=1280,
                height=720,
                color="0x2d3748"
            )
            return GenerationResult(
                success=True,
                output_path=str(output_file),
                output_url=str(output_file),
                usage={"provider": "mock", "mode": self.mode, "simulated": True}
            )
        except Exception as e:
            return GenerationResult(success=False, error=str(e))

    async def video_to_video(
        self,
        video_path: str,
        prompt: str,
        strength: float = 0.7
    ) -> GenerationResult:
        """Simulates Video-to-Video generation using local FFmpeg."""
        logger.info(f"MockVideoProvider.video_to_video(mode={self.mode}, prompt='{prompt[:40]}...')")
        await self._simulate_delay()

        if self.mode == "FAILURE":
            return GenerationResult(success=False, error="Mock video generation simulated failure")

        if self.mode == "TIMEOUT":
            return GenerationResult(success=False, error="Mock video generation simulated timeout")

        try:
            output_file = await self._generate_synthetic_mp4(
                duration_sec=4.0,
                width=1280,
                height=720,
                color="0x3b4252"
            )
            return GenerationResult(
                success=True,
                output_path=str(output_file),
                output_url=str(output_file),
                usage={"provider": "mock", "mode": self.mode, "simulated": True}
            )
        except Exception as e:
            return GenerationResult(success=False, error=str(e))

    async def extend(
        self,
        video_path: str,
        prompt: str,
        extend_sec: float = 4.0
    ) -> GenerationResult:
        """Simulates video extension using local FFmpeg."""
        logger.info(f"MockVideoProvider.extend(mode={self.mode}, prompt='{prompt[:40]}...', extend={extend_sec}s)")
        await self._simulate_delay()

        if self.mode == "FAILURE":
            return GenerationResult(success=False, error="Mock video generation simulated failure")

        if self.mode == "TIMEOUT":
            return GenerationResult(success=False, error="Mock video generation simulated timeout")

        try:
            output_file = await self._generate_synthetic_mp4(
                duration_sec=extend_sec,
                width=1280,
                height=720,
                color="0x434c5e"
            )
            return GenerationResult(
                success=True,
                output_path=str(output_file),
                output_url=str(output_file),
                usage={"provider": "mock", "mode": self.mode, "simulated": True}
            )
        except Exception as e:
            return GenerationResult(success=False, error=str(e))
