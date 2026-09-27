from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class GenerationResult(BaseModel):
    success: bool
    output_path: Optional[str] = None
    output_url: Optional[Any] = None
    output_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None

class ProviderConfig(BaseModel):
    provider_name: str
    api_key: Optional[str] = None
    api_base_url: Optional[str] = None
    model: Optional[str] = None
    timeout: int = 300
    max_retries: int = 3

class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, system_prompt: str = "",
                       temperature: float = 0.7, max_tokens: int = 4096) -> str:
        pass

    @abstractmethod
    async def generate_structured(self, prompt: str, schema: dict,
                                   system_prompt: str = "") -> dict:
        pass

class ImageProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, negative_prompt: str = "",
                       width: int = 1024, height: int = 1024,
                       num_images: int = 1,
                       reference_images: Optional[List[str]] = None,
                       style: Optional[str] = None) -> List[GenerationResult]:
        pass

class VideoProvider(ABC):
    @abstractmethod
    async def text_to_video(self, prompt: str, duration_sec: float = 4.0,
                            width: int = 1280, height: int = 720,
                            reference_image: Optional[str] = None) -> GenerationResult:
        pass

    @abstractmethod
    async def image_to_video(self, image_path: str, prompt: str,
                             duration_sec: float = 4.0) -> GenerationResult:
        pass

    @abstractmethod
    async def video_to_video(self, video_path: str, prompt: str,
                             strength: float = 0.7) -> GenerationResult:
        pass

    @abstractmethod
    async def extend(self, video_path: str, prompt: str,
                     extend_sec: float = 4.0) -> GenerationResult:
        pass

class TTSProvider(ABC):
    @abstractmethod
    async def synthesize(self, text: str, voice_id: str,
                         language: str = "ta",
                         speed: float = 1.0, pitch: float = 1.0,
                         emotion: str = "neutral") -> GenerationResult:
        pass

    @abstractmethod
    async def list_voices(self, language: Optional[str] = None) -> List[Dict[str, Any]]:
        pass

class STTProvider(ABC):
    @abstractmethod
    async def transcribe(self, audio_path: str, language: str = "ta",
                         word_timestamps: bool = True) -> Dict[str, Any]:
        pass

class LipSyncProvider(ABC):
    @abstractmethod
    async def sync(self, video_path: str, audio_path: str,
                   face_region: Optional[Dict[str, Any]] = None) -> GenerationResult:
        pass

class MusicGenProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, duration_sec: float = 30.0,
                       genre: Optional[str] = None, mood: Optional[str] = None,
                       bpm: Optional[int] = None, key: Optional[str] = None,
                       instrumental: bool = True) -> GenerationResult:
        pass
