import os
import asyncio
import logging
from typing import Optional, Dict, Any
import httpx

from app.providers.base import VideoProvider, GenerationResult

logger = logging.getLogger("tamil_ai_forge.providers.runway")


class RunwayVideoProvider(VideoProvider):
    """
    Real Text-to-Video and Image-to-Video provider using Runway Gen-4.5 API.
    API documentation: https://docs.dev.runwayml.com/
    """
    DEFAULT_BASE_URL = "https://api.dev.runwayml.com/v1"
    API_VERSION = "2024-11-06"

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or os.environ.get("RUNWAY_API_KEY")
        self.base_url = (base_url or os.environ.get("RUNWAY_BASE_URL") or self.DEFAULT_BASE_URL).rstrip("/")

    def _get_headers(self) -> Dict[str, str]:
        if not self.api_key:
            from app.providers.factory import UnconfiguredProviderError
            raise UnconfiguredProviderError(
                "Runway API key is missing. Please set RUNWAY_API_KEY in your server environment."
            )
        return {
            "Authorization": f"Bearer {self.api_key}",
            "X-Runway-Version": self.API_VERSION,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    async def text_to_video(
        self,
        prompt: str,
        duration_sec: float = 5.0,
        width: int = 1280,
        height: int = 720,
        reference_image: Optional[str] = None,
        poll_interval: float = 3.0,
        max_poll_time: float = 300.0
    ) -> GenerationResult:
        """
        Submits a text-to-video task to Runway Gen-4.5 and polls until completion.
        Official model: gen4.5
        Duration: 2-10 seconds
        Ratio: '1280:720' or '720:1280'
        """
        headers = self._get_headers()

        valid_duration = min(10, max(2, int(round(duration_sec))))
        ratio = "720:1280" if height > width else "1280:720"

        payload: Dict[str, Any] = {
            "promptText": prompt,
            "model": "gen4.5",
            "duration": valid_duration,
            "ratio": ratio
        }

        if reference_image:
            create_url = f"{self.base_url}/image_to_video"
            payload["promptImage"] = reference_image
        else:
            create_url = f"{self.base_url}/text_to_video"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(create_url, json=payload, headers=headers)
                if res.status_code == 401:
                    return GenerationResult(success=False, error="Invalid Runway API Key (HTTP 401 Unauthorized)")
                elif res.status_code == 429:
                    return GenerationResult(success=False, error="Runway API rate limit reached (HTTP 429)")
                elif res.status_code >= 400:
                    return GenerationResult(success=False, error=f"Runway API error (HTTP {res.status_code}): {res.text}")

                data = res.json()
                task_id = data.get("id")
                if not task_id:
                    return GenerationResult(success=False, error=f"Runway returned response without task ID: {data}")

                logger.info(f"Runway task submitted successfully: {task_id}")

                poll_url = f"{self.base_url}/tasks/{task_id}"
                elapsed = 0.0

                while elapsed < max_poll_time:
                    await asyncio.sleep(poll_interval)
                    elapsed += poll_interval

                    poll_res = await client.get(poll_url, headers=headers)
                    if poll_res.status_code >= 400:
                        return GenerationResult(success=False, error=f"Error polling Runway task {task_id}: {poll_res.text}")

                    task_data = poll_res.json()
                    status = task_data.get("status", "").upper()

                    if status == "SUCCEEDED":
                        output_list = task_data.get("output", [])
                        if output_list and len(output_list) > 0:
                            video_url = output_list[0]
                            return GenerationResult(
                                success=True,
                                output_url=video_url,
                                output_data={"task_id": task_id, "duration": valid_duration, "ratio": ratio},
                                usage={"duration_sec": valid_duration, "provider": "runway", "model": "gen4.5"}
                            )
                        else:
                            return GenerationResult(success=False, error="Runway task succeeded but returned no output media URL")

                    elif status == "FAILED":
                        failure_reason = task_data.get("failure", "Runway generation failed")
                        failure_code = task_data.get("failureCode", "UNKNOWN")
                        return GenerationResult(success=False, error=f"Runway generation failed [{failure_code}]: {failure_reason}")

                    elif status == "CANCELLED":
                        return GenerationResult(success=False, error="Runway generation task was cancelled")

                    logger.debug(f"Runway task {task_id} status: {status} ({elapsed:.1f}s elapsed)")

                return GenerationResult(success=False, error=f"Runway generation timed out after {max_poll_time} seconds")

        except httpx.RequestError as exc:
            return GenerationResult(success=False, error=f"Runway network connection error: {str(exc)}")
        except Exception as exc:
            return GenerationResult(success=False, error=f"Unexpected error in Runway provider: {str(exc)}")

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
        return GenerationResult(success=False, error="video_to_video is not supported by Runway Gen-4.5 endpoint")

    async def extend(
        self,
        video_path: str,
        prompt: str,
        extend_sec: float = 5.0
    ) -> GenerationResult:
        return GenerationResult(success=False, error="extend requires Gen-2 endpoint or existing task ID")
