import os
import asyncio
import logging
from typing import Optional, Dict, Any
import httpx

from app.providers.base import VideoProvider, GenerationResult

logger = logging.getLogger("tamil_ai_forge.providers.eightscale")


class EightScaleVideoProvider(VideoProvider):
    """
    Real Text-to-Video and Image-to-Video provider using 8Scale Wan 2.2 14B API.
    API documentation: https://8scale.com/model/wan-2.2/14b/text-to-video/api
    Official Base URL: https://8scale.run
    Endpoint: POST https://8scale.run/wan-2.2/14b/text-to-video
    """
    DEFAULT_BASE_URL = "https://8scale.run"

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or os.environ.get("EIGHTSCALE_API_KEY")
        if not self.api_key:
            from app.config import settings
            self.api_key = getattr(settings, "EIGHTSCALE_API_KEY", None)

        raw_base = base_url or os.environ.get("EIGHTSCALE_BASE_URL")
        if not raw_base:
            from app.config import settings
            raw_base = getattr(settings, "EIGHTSCALE_BASE_URL", None)
        self.base_url = (raw_base or self.DEFAULT_BASE_URL).rstrip("/")

    def _get_headers(self) -> Dict[str, str]:
        if not self.api_key:
            from app.providers.factory import UnconfiguredProviderError
            raise UnconfiguredProviderError(
                "8Scale API key is missing. Please set EIGHTSCALE_API_KEY in your server environment."
            )
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    @staticmethod
    def _map_resolution(height: int) -> str:
        """Maps output height to 8Scale supported resolution string."""
        if height <= 480:
            return "480p"
        elif height <= 580:
            return "580p"
        return "720p"

    @staticmethod
    def _map_aspect_ratio(width: int, height: int) -> str:
        """Maps aspect ratio to 8Scale supported aspect ratio string."""
        if abs(width - height) < 50 or width == height:
            return "1:1"
        elif height > width:
            return "9:16"
        return "16:9"

    @staticmethod
    def _extract_output_url(data: Dict[str, Any]) -> Optional[str]:
        """Extracts media output URL from various response key patterns."""
        output = data.get("output")
        if isinstance(output, str) and output.strip():
            return output.strip()
        elif isinstance(output, list) and len(output) > 0 and isinstance(output[0], str):
            return output[0].strip()

        video_url = data.get("video_url") or data.get("url")
        if isinstance(video_url, str) and video_url.strip():
            return video_url.strip()

        return None

    async def text_to_video(
        self,
        prompt: str,
        duration_sec: float = 5.0,
        width: int = 1280,
        height: int = 720,
        reference_image: Optional[str] = None,
        poll_interval: float = 1.5,
        max_poll_time: float = 180.0
    ) -> GenerationResult:
        """
        Submits text-to-video generation to 8Scale Wan 2.2 14B API.
        Handles both immediate completed output (Case A) and status polling (Case B).
        """
        headers = self._get_headers()
        resolution = self._map_resolution(height)
        aspect_ratio = self._map_aspect_ratio(width, height)

        payload: Dict[str, Any] = {
            "prompt": prompt.strip(),
            "resolution": resolution,
            "aspect_ratio": aspect_ratio
        }

        if reference_image:
            create_url = f"{self.base_url}/wan-2.2/14b/image-to-video"
            payload["image"] = reference_image
        else:
            create_url = f"{self.base_url}/wan-2.2/14b/text-to-video"

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                res = await client.post(create_url, json=payload, headers=headers)
                if res.status_code == 401:
                    return GenerationResult(success=False, error="Invalid 8Scale API Key (HTTP 401 Unauthorized)")
                elif res.status_code == 429:
                    return GenerationResult(success=False, error="8Scale API rate limit reached (HTTP 429)")
                elif res.status_code >= 400:
                    return GenerationResult(success=False, error=f"8Scale API error (HTTP {res.status_code}): {res.text}")

                try:
                    data = res.json()
                except Exception:
                    return GenerationResult(success=False, error=f"8Scale returned non-JSON response: {res.text[:200]}")

                # CASE A: Response already contains completed output URL
                output_url = self._extract_output_url(data)
                status = str(data.get("status", "")).upper()

                if output_url and status in ["COMPLETED", "SUCCESS", "SUCCEEDED", ""]:
                    request_id = data.get("requestId") or data.get("id") or "direct"
                    logger.info(f"8Scale generation completed immediately (request: {request_id})")
                    return GenerationResult(
                        success=True,
                        output_url=output_url,
                        output_data={
                            "requestId": request_id,
                            "resolution": resolution,
                            "aspect_ratio": aspect_ratio,
                            "executionTimeMs": data.get("executionTimeMs")
                        },
                        usage={
                            "provider": "8scale",
                            "model": "wan-2.2-14b",
                            "duration_sec": duration_sec,
                            "resolution": resolution
                        }
                    )

                # Check for immediate failure in POST response
                if status in ["FAILED", "ERROR"]:
                    reason = data.get("failureReason") or data.get("error") or "8Scale generation failed"
                    return GenerationResult(success=False, error=f"8Scale generation failed: {reason}")

                # CASE B: Asynchronous response with requestId -> poll /status/{requestId}
                request_id = data.get("requestId") or data.get("id")
                if not request_id:
                    return GenerationResult(
                        success=False,
                        error=f"8Scale returned response without output URL or requestId: {data}"
                    )

                logger.info(f"8Scale generation task submitted: {request_id}. Polling for completion...")
                poll_url = f"{self.base_url}/status/{request_id}"
                elapsed = 0.0

                while elapsed < max_poll_time:
                    await asyncio.sleep(poll_interval)
                    elapsed += poll_interval

                    poll_res = await client.get(poll_url, headers=headers)
                    if poll_res.status_code == 401:
                        return GenerationResult(success=False, error="Invalid 8Scale API Key (HTTP 401 Unauthorized)")
                    elif poll_res.status_code >= 400:
                        return GenerationResult(success=False, error=f"Error polling 8Scale task {request_id} (HTTP {poll_res.status_code}): {poll_res.text}")

                    try:
                        poll_data = poll_res.json()
                    except Exception:
                        continue

                    poll_status = str(poll_data.get("status", "")).upper()

                    if poll_status in ["COMPLETED", "SUCCESS", "SUCCEEDED"]:
                        poll_output_url = self._extract_output_url(poll_data)
                        if poll_output_url:
                            logger.info(f"8Scale task {request_id} completed successfully in {elapsed:.1f}s")
                            return GenerationResult(
                                success=True,
                                output_url=poll_output_url,
                                output_data={
                                    "requestId": request_id,
                                    "resolution": resolution,
                                    "aspect_ratio": aspect_ratio,
                                    "executionTimeMs": poll_data.get("executionTimeMs")
                                },
                                usage={
                                    "provider": "8scale",
                                    "model": "wan-2.2-14b",
                                    "duration_sec": duration_sec,
                                    "resolution": resolution
                                }
                            )
                        else:
                            return GenerationResult(success=False, error="8Scale task succeeded but returned no media output URL")

                    elif poll_status in ["FAILED", "ERROR"]:
                        failure_reason = poll_data.get("failureReason") or poll_data.get("error") or "8Scale generation failed"
                        return GenerationResult(success=False, error=f"8Scale generation failed: {failure_reason}")

                    elif poll_status == "CANCELLED":
                        return GenerationResult(success=False, error="8Scale generation task was cancelled")

                    logger.debug(f"8Scale task {request_id} status: {poll_status} ({elapsed:.1f}s elapsed)")

                return GenerationResult(success=False, error=f"8Scale generation timed out after {max_poll_time} seconds")

        except httpx.RequestError as exc:
            return GenerationResult(success=False, error=f"8Scale network connection error: {str(exc)}")
        except Exception as exc:
            return GenerationResult(success=False, error=f"Unexpected error in 8Scale provider: {str(exc)}")

    async def image_to_video(
        self,
        image_path: str,
        prompt: str,
        duration_sec: float = 5.0
    ) -> GenerationResult:
        return await self.text_to_video(prompt=prompt, duration_sec=duration_sec, reference_image=image_path)

    async def video_to_video(
        self,
        video_path: str,
        prompt: str,
        strength: float = 0.7
    ) -> GenerationResult:
        return GenerationResult(success=False, error="video_to_video is not supported by 8Scale Wan 2.2 endpoint")

    async def extend(
        self,
        video_path: str,
        prompt: str,
        extend_sec: float = 5.0
    ) -> GenerationResult:
        return GenerationResult(success=False, error="extend is not supported directly by 8Scale Wan 2.2 endpoint")
