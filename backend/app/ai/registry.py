import os
import logging
from typing import Dict, Any, Optional
from app.providers.factory import (
    get_llm_provider, get_image_provider, get_video_provider,
    get_tts_provider, get_stt_provider, get_lip_sync_provider,
    get_music_gen_provider, UnconfiguredProviderError
)

logger = logging.getLogger("tamil_ai_forge.ai_registry")

# In-memory configuration store for API key presence check (server-side only)
_CONFIGURED_KEYS: Dict[str, str] = {}

def update_provider_api_key(capability: str, api_key: str, provider_name: Optional[str] = None):
    """Store API key safely server-side in environment / in-memory dictionary."""
    if not api_key:
        return
    cap = capability.lower()
    if cap == "video":
        if (provider_name and ("omni" in provider_name.lower() or "hf" in provider_name.lower())) or api_key.startswith("hf_"):
            env_var = "HF_TOKEN"
        elif provider_name and ("8scale" in provider_name.lower() or "eightscale" in provider_name.lower()):
            env_var = "EIGHTSCALE_API_KEY"
        elif provider_name and "luma" in provider_name.lower():
            env_var = "LUMA_API_KEY"
        else:
            from app.config import settings
            active_prov = (settings.VIDEO_PROVIDER or "").lower()
            if active_prov in ["omni_factory", "omnifactory", "omni_video_factory"]:
                env_var = "HF_TOKEN"
            elif active_prov in ["8scale", "eightscale"]:
                env_var = "EIGHTSCALE_API_KEY"
            elif active_prov == "luma":
                env_var = "LUMA_API_KEY"
            else:
                env_var = "RUNWAY_API_KEY"
    else:
        env_map = {
            "llm": "OPENAI_API_KEY",
            "image": "STABILITY_API_KEY",
            "tts": "AZURE_SPEECH_KEY",
            "stt": "OPENAI_API_KEY",
            "lipsync": "SYNCLABS_API_KEY",
            "music": "STABILITY_API_KEY",
        }
        env_var = env_map.get(cap)
    if env_var:
        os.environ[env_var] = api_key
        _CONFIGURED_KEYS[cap] = api_key
        try:
            from app.config import settings
            setattr(settings, env_var, api_key)
        except Exception:
            pass

def is_capability_configured(capability: str) -> bool:
    """Return True if capability has server-side API key configured."""
    cap = capability.lower()
    if cap in _CONFIGURED_KEYS and _CONFIGURED_KEYS[cap]:
        return True

    from app.config import settings

    # Check active provider configuration first for capabilities with multiple providers
    if cap == "video":
        active_prov = (settings.VIDEO_PROVIDER or "").lower()
        if active_prov in ["mock", "mock_video"]:
            return True
        elif active_prov in ["omni_factory", "omnifactory", "omni_video_factory"]:
            val = os.environ.get("HF_TOKEN") or getattr(settings, "HF_TOKEN", None)
            if val and str(val).strip():
                return True
        elif active_prov in ["8scale", "eightscale"]:
            val = os.environ.get("EIGHTSCALE_API_KEY") or getattr(settings, "EIGHTSCALE_API_KEY", None)
            if val and str(val).strip():
                return True
        elif active_prov == "runway":
            val = os.environ.get("RUNWAY_API_KEY") or getattr(settings, "RUNWAY_API_KEY", None)
            if val and str(val).strip():
                return True
        elif active_prov == "luma":
            val = os.environ.get("LUMA_API_KEY") or getattr(settings, "LUMA_API_KEY", None)
            if val and str(val).strip():
                return True
        elif active_prov == "kling":
            val = os.environ.get("KLING_API_KEY") or getattr(settings, "KLING_API_KEY", None)
            if val and str(val).strip():
                return True

    env_check = {
        "llm": ["OPENAI_API_KEY", "GOOGLE_API_KEY", "ANTHROPIC_API_KEY"],
        "image": ["STABILITY_API_KEY", "FLUX_API_KEY", "OPENAI_API_KEY"],
        "video": ["EIGHTSCALE_API_KEY", "HF_TOKEN", "RUNWAY_API_KEY", "KLING_API_KEY", "LUMA_API_KEY"],
        "tts": ["AZURE_SPEECH_KEY", "ELEVENLABS_API_KEY", "GOOGLE_API_KEY"],
        "stt": ["OPENAI_API_KEY", "GOOGLE_API_KEY"],
        "lipsync": ["SYNCLABS_API_KEY"],
        "music": ["STABILITY_API_KEY", "SUNO_API_KEY"],
    }
    keys = env_check.get(cap, [])
    for k in keys:
        val = os.environ.get(k) or getattr(settings, k, None)
        if val and str(val).strip():
            return True
    return False

SUPPORTED_PROVIDERS = {
    "llm": ["openai", "gemini", "claude"],
    "image": ["stability", "flux", "dall-e"],
    "video": ["8scale", "omni_factory", "runway", "luma", "kling", "mock"],
    "tts": ["azure", "elevenlabs", "google"],
    "stt": ["whisper", "google"],
    "lipsync": ["synclabs"],
    "music": ["stability", "suno"]
}

def get_capability_status(capability: str) -> Dict[str, Any]:
    """Return honest provider status object for UI settings."""
    from app.config import settings
    cap = capability.lower()
    configured = is_capability_configured(cap)
    active_prov = getattr(settings, f"{cap.upper()}_PROVIDER", None)
    msg = f"Provider for {capability} is {'configured and ready' if configured else 'not configured. API key required.'}"
    if cap == "video" and (active_prov or "").lower() in ["mock", "mock_video"]:
        msg = "Mock Video Generator is configured and ready (offline simulation mode)"

    return {
        "capability": capability,
        "providers": SUPPORTED_PROVIDERS.get(cap, []),
        "active_provider": active_prov,
        "is_configured": configured,
        "is_enabled": configured,
        "status": "configured" if configured else "provider_not_configured",
        "message": msg
    }

class AIRegistry:
    @staticmethod
    def get_llm():
        return get_llm_provider()

    @staticmethod
    def get_image():
        return get_image_provider()

    @staticmethod
    def get_video():
        return get_video_provider()

    @staticmethod
    def get_tts():
        return get_tts_provider()

    @staticmethod
    def get_stt():
        return get_stt_provider()

    @staticmethod
    def get_lipsync():
        return get_lip_sync_provider()

    @staticmethod
    def get_music():
        return get_music_gen_provider()
