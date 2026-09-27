import logging
from typing import Optional
from app.config import settings
from app.providers.base import (
    LLMProvider, ImageProvider, VideoProvider,
    TTSProvider, STTProvider, LipSyncProvider, MusicGenProvider, GenerationResult
)

logger = logging.getLogger("tamil_ai_forge.providers")

class UnconfiguredProviderError(Exception):
    pass

class BaseUnconfiguredProvider:
    def __init__(self, capability: str, provider_name: str, key_env_var: str):
        self.capability = capability
        self.provider_name = provider_name
        self.key_env_var = key_env_var

    def _raise(self):
        raise UnconfiguredProviderError(
            f"{self.capability} provider '{self.provider_name}' requires an API key in {self.key_env_var}. "
            f"Please set this in your .env file."
        )

class UnconfiguredLLM(BaseUnconfiguredProvider, LLMProvider):
    async def generate(self, prompt: str, system_prompt: str = "", temperature: float = 0.7, max_tokens: int = 4096) -> str:
        self._raise()
    async def generate_structured(self, prompt: str, schema: dict, system_prompt: str = "") -> dict:
        self._raise()

class UnconfiguredImage(BaseUnconfiguredProvider, ImageProvider):
    async def generate(self, prompt: str, negative_prompt: str = "", width: int = 1024, height: int = 1024, num_images: int = 1, reference_images = None, style = None):
        self._raise()
    async def edit(self, image_path: str, prompt: str, mask_path = None):
        self._raise()

class UnconfiguredVideo(BaseUnconfiguredProvider, VideoProvider):
    async def text_to_video(self, prompt: str, duration_sec: float = 4.0, width: int = 1280, height: int = 720, reference_image = None) -> GenerationResult:
        self._raise()
    async def image_to_video(self, image_path: str, prompt: str, duration_sec: float = 4.0) -> GenerationResult:
        self._raise()
    async def video_to_video(self, video_path: str, prompt: str, strength: float = 0.7) -> GenerationResult:
        self._raise()
    async def extend(self, video_path: str, prompt: str, extend_sec: float = 4.0) -> GenerationResult:
        self._raise()

class UnconfiguredTTS(BaseUnconfiguredProvider, TTSProvider):
    async def synthesize(self, text: str, voice_id: str, language: str = "ta", speed: float = 1.0, pitch: float = 1.0, emotion: str = "neutral") -> GenerationResult:
        self._raise()
    async def list_voices(self, language: Optional[str] = None):
        # Default Tamil voice descriptors for UI listing
        return [
            {"id": "ta-IN-ValluvarNeural", "name": "Valluvar (Male - Azure)", "language": "ta-IN", "gender": "male", "sample_rate": 24000},
            {"id": "ta-IN-PallaviNeural", "name": "Pallavi (Female - Azure)", "language": "ta-IN", "gender": "female", "sample_rate": 24000},
            {"id": "ta-IN-Standard-A", "name": "Google Tamil Voice A (Female)", "language": "ta-IN", "gender": "female", "sample_rate": 24000},
            {"id": "ta-IN-Standard-B", "name": "Google Tamil Voice B (Male)", "language": "ta-IN", "gender": "male", "sample_rate": 24000},
            {"id": "sarvam-bulbul-v3-male", "name": "Sarvam Bulbul (Native Tamil Male)", "language": "ta-IN", "gender": "male", "sample_rate": 24000},
            {"id": "sarvam-bulbul-v3-female", "name": "Sarvam Bulbul (Native Tamil Female)", "language": "ta-IN", "gender": "female", "sample_rate": 24000},
        ]

class UnconfiguredSTT(BaseUnconfiguredProvider, STTProvider):
    async def transcribe(self, audio_path: str, language: str = "ta", word_timestamps: bool = True):
        self._raise()

class UnconfiguredLipSync(BaseUnconfiguredProvider, LipSyncProvider):
    async def sync(self, video_path: str, audio_path: str, face_region = None) -> GenerationResult:
        self._raise()

class UnconfiguredMusicGen(BaseUnconfiguredProvider, MusicGenProvider):
    async def generate(self, prompt: str, duration_sec: float = 30.0, genre = None, mood = None, bpm = None, key = None, instrumental: bool = True) -> GenerationResult:
        self._raise()

def get_llm_provider() -> LLMProvider:
    return UnconfiguredLLM("LLM", settings.LLM_PROVIDER, "GOOGLE_API_KEY / OPENAI_API_KEY")

def get_image_provider() -> ImageProvider:
    return UnconfiguredImage("Image Generation", settings.IMAGE_PROVIDER, "STABILITY_API_KEY / FLUX_API_KEY")

def get_video_provider() -> VideoProvider:
    import os
    provider_choice = (settings.VIDEO_PROVIDER or "").lower()

    if provider_choice in ["mock", "mock_video"]:
        from app.providers.mock_video import MockVideoProvider
        mode = os.environ.get("MOCK_VIDEO_MODE") or getattr(settings, "MOCK_VIDEO_MODE", "SUCCESS")
        return MockVideoProvider(mode=mode)

    elif provider_choice in ["omni_factory", "omnifactory", "omni_video_factory"]:
        hf_token = os.environ.get("HF_TOKEN") or getattr(settings, "HF_TOKEN", None)
        if hf_token:
            from app.providers.omni_factory import OmniVideoFactoryProvider
            return OmniVideoFactoryProvider(hf_token=hf_token)
        return UnconfiguredVideo("Video Generation", "omni_factory", "HF_TOKEN")

    elif provider_choice in ["8scale", "eightscale"]:
        eightscale_key = os.environ.get("EIGHTSCALE_API_KEY") or getattr(settings, "EIGHTSCALE_API_KEY", None)
        if eightscale_key:
            from app.providers.eightscale import EightScaleVideoProvider
            base_url = os.environ.get("EIGHTSCALE_BASE_URL") or getattr(settings, "EIGHTSCALE_BASE_URL", "https://8scale.run")
            return EightScaleVideoProvider(api_key=eightscale_key, base_url=base_url)
        return UnconfiguredVideo("Video Generation", "8scale", "EIGHTSCALE_API_KEY")

    elif provider_choice == "runway":
        runway_key = os.environ.get("RUNWAY_API_KEY") or settings.RUNWAY_API_KEY
        if runway_key:
            from app.providers.runway import RunwayVideoProvider
            return RunwayVideoProvider(api_key=runway_key)
        return UnconfiguredVideo("Video Generation", "runway", "RUNWAY_API_KEY")

    elif provider_choice == "luma":
        luma_key = os.environ.get("LUMA_API_KEY") or settings.LUMA_API_KEY
        if luma_key:
            from app.providers.luma import LumaVideoProvider
            return LumaVideoProvider(api_key=luma_key)
        return UnconfiguredVideo("Video Generation", "luma", "LUMA_API_KEY")

    # Generic fallback based on any available configured key
    eightscale_key = os.environ.get("EIGHTSCALE_API_KEY") or getattr(settings, "EIGHTSCALE_API_KEY", None)
    if eightscale_key:
        from app.providers.eightscale import EightScaleVideoProvider
        base_url = os.environ.get("EIGHTSCALE_BASE_URL") or getattr(settings, "EIGHTSCALE_BASE_URL", "https://8scale.run")
        return EightScaleVideoProvider(api_key=eightscale_key, base_url=base_url)

    hf_token = os.environ.get("HF_TOKEN") or getattr(settings, "HF_TOKEN", None)
    if hf_token:
        from app.providers.omni_factory import OmniVideoFactoryProvider
        return OmniVideoFactoryProvider(hf_token=hf_token)

    runway_key = os.environ.get("RUNWAY_API_KEY") or settings.RUNWAY_API_KEY
    if runway_key:
        from app.providers.runway import RunwayVideoProvider
        return RunwayVideoProvider(api_key=runway_key)

    luma_key = os.environ.get("LUMA_API_KEY") or settings.LUMA_API_KEY
    if luma_key:
        from app.providers.luma import LumaVideoProvider
        return LumaVideoProvider(api_key=luma_key)

    return UnconfiguredVideo("Video Generation", settings.VIDEO_PROVIDER or "8scale", "EIGHTSCALE_API_KEY / HF_TOKEN / RUNWAY_API_KEY / LUMA_API_KEY")

def get_tts_provider() -> TTSProvider:
    return UnconfiguredTTS("Text-to-Speech", settings.TTS_PROVIDER, "AZURE_SPEECH_KEY / GOOGLE_API_KEY")

def get_stt_provider() -> STTProvider:
    return UnconfiguredSTT("Speech-to-Text", settings.STT_PROVIDER, "Local Whisper / GOOGLE_API_KEY")

def get_lip_sync_provider() -> LipSyncProvider:
    return UnconfiguredLipSync("Lip Sync", settings.LIP_SYNC_PROVIDER, "SYNCLABS_API_KEY")

def get_music_gen_provider() -> MusicGenProvider:
    return UnconfiguredMusicGen("Music Generation", settings.MUSIC_PROVIDER, "STABILITY_API_KEY")
