import os
import asyncio
import logging
import json
from urllib.parse import urlparse
from typing import Optional, Dict, Any, List
from app.providers.base import VideoProvider, GenerationResult

logger = logging.getLogger("tamil_ai_forge.providers.omni_factory")


def _safe_diagnostic_summary(val: Any, depth: int = 0) -> Any:
    """Helper to safely inspect Gradio output structures without logging tokens or secrets."""
    if depth > 4:
        return {"type": type(val).__name__}

    if val is None:
        return {"type": "NoneType", "value": None}

    val_type = type(val).__name__

    if isinstance(val, (int, float, bool)):
        return {"type": val_type, "value": val}

    if isinstance(val, str):
        s = val.strip()
        info: Dict[str, Any] = {"type": "str", "length": len(s)}
        if s.startswith(("http://", "https://", "/file=", "file=")):
            parsed = urlparse(s)
            info["is_url"] = True
            info["url_scheme"] = parsed.scheme or ("file" if s.startswith(("/file=", "file=")) else "")
            info["url_host"] = parsed.netloc
            info["url_path"] = parsed.path
            info["is_file_url"] = s.startswith(("/file=", "file="))
            info["has_query_params"] = bool(parsed.query)
        else:
            exists = os.path.exists(s)
            info["is_path"] = True
            info["path_exists"] = exists
            info["is_local"] = exists
            info["extension"] = os.path.splitext(s)[1]
            if exists:
                try:
                    info["size_bytes"] = os.path.getsize(s)
                except Exception:
                    pass
        return info

    if isinstance(val, (list, tuple)):
        return {
            "type": val_type,
            "length": len(val),
            "items": [
                {
                    "index": i,
                    "type": type(item).__name__,
                    "details": _safe_diagnostic_summary(item, depth + 1)
                }
                for i, item in enumerate(val)
            ]
        }

    if isinstance(val, dict):
        d_info: Dict[str, Any] = {
            "type": "dict",
            "keys": list(val.keys()),
            "fields": {}
        }
        for k in ("path", "url", "orig_name", "mime_type", "size", "is_stream", "video", "meta"):
            if k in val:
                d_info["fields"][k] = _safe_diagnostic_summary(val[k], depth + 1)
        return d_info

    # General Object / Class instance
    safe_attrs = [a for a in dir(val) if not a.startswith("_") and not callable(getattr(val, a, None))]
    obj_info: Dict[str, Any] = {
        "type": "object",
        "class_name": val.__class__.__name__,
        "public_attributes": safe_attrs
    }
    for attr in ("path", "url", "size", "mime_type"):
        if hasattr(val, attr):
            obj_info[attr] = _safe_diagnostic_summary(getattr(val, attr), depth + 1)
    return obj_info


COMFYUI_WORKFLOW_FAILURE_ERROR = (
    "Remote Space ComfyUI runtime failed on ZeroGPU "
    "(upstream error in FrameAI4687/Omni-Video-Factory). "
    "The remote Space container is currently failing to execute its internal model graph."
)


class OmniVideoFactoryProvider(VideoProvider):
    """
    Real Text-to-Video provider using Hugging Face ZeroGPU Omni Video Factory Space.
    Space: FrameAI4687/Omni-Video-Factory
    Direct Host: https://frameai4687-omni-video-factory.hf.space
    API Name: /_submit_t2v_manual
    Execution Strategy: gradio_client.Client.submit() asynchronous Job polling
    """
    DEFAULT_SPACE_ID = "FrameAI4687/Omni-Video-Factory"
    API_NAME = "/_submit_t2v_manual"

    def __init__(self, hf_token: Optional[str] = None, space_id: Optional[str] = None):
        self.hf_token = hf_token or os.environ.get("HF_TOKEN")
        if not self.hf_token:
            from app.config import settings
            self.hf_token = getattr(settings, "HF_TOKEN", None)
        self.space_id = space_id or self.DEFAULT_SPACE_ID

    def _get_client(self):
        """Instantiates gradio_client.Client safely."""
        from gradio_client import Client
        if self.hf_token:
            return Client(self.space_id, token=self.hf_token, verbose=False)
        return Client(self.space_id, verbose=False)

    @staticmethod
    def _map_resolution(height: int) -> int:
        """Maps output pixel height to Omni Video Factory resolution (384 or 512)."""
        if height > 400:
            return 512
        return 384

    @staticmethod
    def _map_duration(duration_sec: float) -> int:
        """Maps duration to allowed seconds_per_scene (3 or 5)."""
        if duration_sec >= 4.0:
            return 5
        return 3

    @staticmethod
    def _map_aspect_ratio(width: int, height: int) -> str:
        """Maps target aspect ratio to Omni Video Factory supported ratio string."""
        if height <= 0:
            return "16:9"
        ratio = width / height
        ratios = {
            "16:9": 16 / 9,
            "4:3": 4 / 3,
            "1:1": 1.0,
            "3:4": 3 / 4,
            "9:16": 9 / 16,
        }
        return min(ratios.keys(), key=lambda k: abs(ratio - ratios[k]))

    @staticmethod
    def _prepare_prompt(prompt: str) -> str:
        """Ensures prompt satisfies minimum length constraints for manual scene input."""
        p = (prompt or "").strip()
        if len(p) < 10:
            p = f"{p}, cinematic high quality motion"
        return p

    @classmethod
    def _extract_video_output(
        cls,
        video_data: Any,
        space_host: str = "https://frameai4687-omni-video-factory.hf.space"
    ) -> Optional[str]:
        """
        Extracts media filepath or URL from gradio gr.Video output structure.
        Priority:
        1. Local path if present (FileData['path'])
        2. Remote HTTP/HTTPS URL (FileData['url'])
        3. Server-relative /file= URL resolved against space_host
        4. Name fallback (FileData['name'])
        """
        if not video_data:
            return None

        if isinstance(video_data, str):
            s = video_data.strip()
            if not s:
                return None
            if s.startswith("/file="):
                return f"{space_host.rstrip('/')}{s}"
            if s.startswith("file="):
                return f"{space_host.rstrip('/')}/{s}"
            return s

        if isinstance(video_data, (list, tuple)):
            for item in video_data:
                res = cls._extract_video_output(item, space_host=space_host)
                if res:
                    return res
            return None

        if isinstance(video_data, dict):
            # Check nested 'video' component if present
            video_sub = video_data.get("video")
            if video_sub is not None:
                sub_res = cls._extract_video_output(video_sub, space_host=space_host)
                if sub_res:
                    return sub_res

            # 1. Prioritize path key (local downloaded file or server path)
            path_val = video_data.get("path")
            if path_val and isinstance(path_val, str) and path_val.strip():
                p = path_val.strip()
                if p.startswith("/file="):
                    return f"{space_host.rstrip('/')}{p}"
                if p.startswith("file="):
                    return f"{space_host.rstrip('/')}/{p}"
                return p

            # 2. Check url key
            url_val = video_data.get("url")
            if url_val and isinstance(url_val, str) and url_val.strip():
                u = url_val.strip()
                if u.startswith("/file="):
                    return f"{space_host.rstrip('/')}{u}"
                if u.startswith("file="):
                    return f"{space_host.rstrip('/')}/{u}"
                return u

            # 3. Check name key
            name_val = video_data.get("name")
            if name_val and isinstance(name_val, str) and name_val.strip():
                n = name_val.strip()
                if n.startswith("/file="):
                    return f"{space_host.rstrip('/')}{n}"
                return n

        return None

    async def text_to_video(
        self,
        prompt: str,
        duration_sec: float = 5.0,
        width: int = 1280,
        height: int = 720,
        reference_image: Optional[str] = None,
        max_wait_sec: float = 180.0,
        poll_interval: float = 1.0,
    ) -> GenerationResult:
        """
        Executes Text-to-Video generation on Omni Video Factory using Client.submit().
        Handles job polling without blocking FastAPI event loop.
        """
        if not self.hf_token:
            from app.providers.factory import UnconfiguredProviderError
            raise UnconfiguredProviderError(
                "Hugging Face token is missing. Please set HF_TOKEN in your server environment."
            )

        clean_prompt = self._prepare_prompt(prompt)
        resolution = self._map_resolution(height)
        seconds_per_scene = self._map_duration(duration_sec)
        aspect_ratio = self._map_aspect_ratio(width, height)

        max_attempts = 2
        for attempt in range(max_attempts):
            try:
                client = await asyncio.to_thread(self._get_client)

                # Submit job asynchronously via gradio_client
                job = await asyncio.to_thread(
                    client.submit,
                    1,                  # scene_count
                    seconds_per_scene,  # seconds_per_scene
                    resolution,         # resolution
                    aspect_ratio,       # aspect_ratio
                    clean_prompt,       # base_prompt
                    clean_prompt,       # s1
                    "",                 # s2
                    "",                 # s3
                    "",                 # s4
                    api_name=self.API_NAME,
                )

                # Bounded asynchronous wait for job completion
                start_time = asyncio.get_event_loop().time()
                while not job.done():
                    elapsed = asyncio.get_event_loop().time() - start_time
                    if elapsed > max_wait_sec:
                        try:
                            job.cancel()
                        except Exception:
                            pass
                        return GenerationResult(
                            success=False,
                            error=f"Omni Video Factory job timed out after {int(elapsed)}s",
                        )
                    await asyncio.sleep(poll_interval)

                # Retrieve output tuple
                outputs = await asyncio.to_thread(job.result, 15.0)
                logger.info(
                    f"[DIAGNOSTIC] Omni Video Factory job.result() raw structure: {json.dumps(_safe_diagnostic_summary(outputs))}"
                )
                if not outputs or not isinstance(outputs, (list, tuple)) or len(outputs) < 2:
                    return GenerationResult(
                        success=False,
                        error="Omni Video Factory returned empty or malformed outputs list",
                    )

                status_text = str(outputs[0] or "")
                video_data = outputs[1]
                logger.info(
                    f"[DIAGNOSTIC] Omni Video Factory outputs[1] (video component): {json.dumps(_safe_diagnostic_summary(video_data))}"
                )

                # Check for ComfyUI workflow failure (NON-RETRYABLE remote runtime error)
                if "comfyui workflow execution failed" in status_text.lower():
                    return GenerationResult(
                        success=False,
                        error=COMFYUI_WORKFLOW_FAILURE_ERROR,
                    )

                # Check for transient warmup status requiring backoff retry
                if "warming up" in status_text.lower():
                    if attempt < max_attempts - 1:
                        logger.warning("Omni Video Factory warming up. Retrying after 15s backoff...")
                        await asyncio.sleep(15.0)
                        continue
                    return GenerationResult(
                        success=False,
                        error="Omni Video Factory ZeroGPU is warming up. Please retry in 30 seconds.",
                    )

                # Check for NSFW policy filter
                if "nsfw blocked" in status_text.lower():
                    return GenerationResult(
                        success=False,
                        error="Video generation was blocked by Omni Video Factory NSFW policy.",
                    )

                space_host = f"https://{self.space_id.replace('/', '-').lower()}.hf.space"
                video_path_or_url = self._extract_video_output(video_data, space_host=space_host)
                logger.info(
                    f"[DIAGNOSTIC] Omni Video Factory extracted video_path_or_url: {json.dumps(_safe_diagnostic_summary(video_path_or_url))}"
                )
                if not video_path_or_url:
                    if "comfyui workflow execution failed" in status_text.lower():
                        return GenerationResult(
                            success=False,
                            error=COMFYUI_WORKFLOW_FAILURE_ERROR,
                        )
                    return GenerationResult(
                        success=False,
                        error=f"Omni Video Factory did not produce a valid video output. Status: {status_text}",
                    )

                return GenerationResult(
                    success=True,
                    output_url=video_path_or_url,
                    output_data={"duration_sec": float(seconds_per_scene)},
                    usage={
                        "provider": "omni_factory",
                        "space": self.space_id,
                        "resolution": f"{resolution}p",
                        "aspect_ratio": aspect_ratio,
                        "status": status_text,
                    },
                )

            except Exception as exc:
                exc_str = str(exc)
                if "comfyui workflow execution failed" in exc_str.lower():
                    return GenerationResult(
                        success=False,
                        error=COMFYUI_WORKFLOW_FAILURE_ERROR,
                    )
                if "quota" in exc_str.lower() or "exceeded" in exc_str.lower() or "429" in exc_str:
                    return GenerationResult(
                        success=False,
                        error=f"ZeroGPU daily quota exceeded or rate limited: {exc_str}",
                    )
                logger.error(f"Omni Video Factory generation error: {exc}", exc_info=True)
                return GenerationResult(
                    success=False,
                    error=f"Omni Video Factory generation failed: {exc_str}",
                )

        return GenerationResult(success=False, error="Omni Video Factory generation could not be completed.")

    async def image_to_video(self, image_path: str, prompt: str, duration_sec: float = 4.0) -> GenerationResult:
        return GenerationResult(success=False, error="image_to_video is not yet supported for Omni Video Factory in this phase.")

    async def video_to_video(self, video_path: str, prompt: str, strength: float = 0.7) -> GenerationResult:
        return GenerationResult(success=False, error="video_to_video is not yet supported for Omni Video Factory in this phase.")

    async def extend(self, video_path: str, prompt: str, extend_sec: float = 4.0) -> GenerationResult:
        return GenerationResult(success=False, error="extend is not yet supported for Omni Video Factory in this phase.")
