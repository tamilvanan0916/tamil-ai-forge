import os
import asyncio
import logging
from typing import Optional, Dict, Any
import httpx

from app.providers.base import VideoProvider, GenerationResult

logger = logging.getLogger("tamil_ai_forge.providers.luma")


class LumaVideoProvider(VideoProvider):
    """
    Real Text-to-Video provider using Luma Dream Machine API.
    API documentation: https://docs.lumalabs.ai/
    """
    DEFAULT_BASE_URL = "https://api.lumalabs.ai/dream-machine/v1"

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or os.environ.get("LUMA_API_KEY")
        self.base_url = (base_url or os.environ.get("LUMA_BASE_URL") or self.DEFAULT_BASE_URL).rstrip("/")

    def _get_headers(self) -> Dict[str, str]:
        if not self.api_key:
            from app.providers.factory import UnconfiguredProviderError
            raise UnconfiguredProviderError(
                "Luma API key is missing. Please set LUMA_API_KEY in your server environment."
            )
        return {
            "Authorization": f"Bearer {self.api_key}",
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
        Submits generation to Luma Dream Machine API and polls until completion.
        """
        headers = self._get_headers()
        aspect_ratio = "9:16" if height > width else "16:9"

        payload: Dict[str, Any] = {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "loop": False
        }

        if reference_image:
            payload["keyframes"] = {
                "frame0": {
                    "type": "image",
                    "url": reference_image
                }
            }

        create_url = f"{self.base_url}/generations"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(create_url, json=payload, headers=headers)
                if res.status_code == 401:
                    return GenerationResult(success=False, error="Invalid Luma API Key (HTTP 401 Unauthorized)")
                elif res.status_code == 429:
                    return GenerationResult(success=False, error="Luma API rate limit reached (HTTP 429)")
                elif res.status_code >= 400:
                    return GenerationResult(success=False, error=f"Luma API error (HTTP {res.status_code}): {res.text}")

                data = res.json()
                generation_id = data.get("id")
                if not generation_id:
                    return GenerationResult(success=False, error=f"Luma returned response without generation ID: {data}")

                logger.info(f"Luma generation submitted: {generation_id}")

                poll_url = f"{self.base_url}/generations/{generation_id}"
                elapsed = 0.0

                while elapsed < max_poll_time:
                    await asyncio.sleep(poll_interval)
                    elapsed += poll_interval

                    poll_res = await client.get(poll_url, headers=headers)
                    if poll_res.status_code >= 400:
                        return GenerationResult(success=False, error=f"Error polling Luma generation {generation_id}: {poll_res.text}")

                    gen_data = poll_res.json()
                    state = gen_data.get("state", "").lower()

                    if state == "completed":
                        assets = gen_data.get("assets", {})
                        video_url = assets.get("video")
                        if video_url:
                            return GenerationResult(
                                success=True,
                                output_url=video_url,
                                output_data={"generation_id": generation_id, "aspect_ratio": aspect_ratio},
                                usage={"duration_sec": 5.0, "provider": "luma", "model": "dream-machine"}
                            )
                        else:
                            return GenerationResult(success=False, error="Luma generation completed but returned no video asset")

                    elif state == "failed":
                        reason = gen_data.get("failure_reason", "Luma generation failed")
                        return GenerationResult(success=False, error=f"Luma generation failed: {reason}")

                    logger.debug(f"Luma generation {generation_id} state: {state} ({elapsed:.1f}s elapsed)")

                return GenerationResult(success=False, error=f"Luma generation timed out after {max_poll_time} seconds")

        except httpx.RequestError as exc:
            return GenerationResult(success=False, error=f"Luma network connection error: {str(exc)}")
        except Exception as exc:
            return GenerationResult(success=False, error=f"Unexpected error in Luma provider: {str(exc)}")

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
        return GenerationResult(success=False, error="video_to_video is not supported by Luma Dream Machine API")

    async def extend(
        self,
        video_path: str,
        prompt: str,
        extend_sec: float = 5.0
    ) -> GenerationResult:
        return GenerationResult(success=False, error="extend is not supported directly by Luma Dream Machine API")
