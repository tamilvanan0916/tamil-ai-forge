import os
import shutil
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # App
    APP_NAME: str = "TAMIL AI FORGE"
    APP_TAGLINE: str = "From Words to Cinema."
    APP_ENV: str = "development"
    DEBUG: bool = True
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    FRONTEND_URL: str = "http://localhost:5173"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./storage/tamil_ai_forge.db"

    # Storage
    STORAGE_BACKEND: str = "local"
    STORAGE_ROOT: str = "./storage"
    S3_ENDPOINT: Optional[str] = None
    S3_BUCKET: str = "tamil-ai-forge"
    S3_ACCESS_KEY: Optional[str] = None
    S3_SECRET_KEY: Optional[str] = None
    S3_REGION: str = "us-east-1"

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"

    # AI Providers (Server-side only)
    LLM_PROVIDER: str = "google"
    IMAGE_PROVIDER: str = "stability"
    VIDEO_PROVIDER: str = "runway"
    TTS_PROVIDER: str = "google"
    STT_PROVIDER: str = "whisper"
    LIP_SYNC_PROVIDER: str = "wav2lip"
    MUSIC_PROVIDER: str = "musicgen"

    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None
    STABILITY_API_KEY: Optional[str] = None
    FLUX_API_KEY: Optional[str] = None
    RUNWAY_API_KEY: Optional[str] = None
    KLING_API_KEY: Optional[str] = None
    LUMA_API_KEY: Optional[str] = None
    EIGHTSCALE_API_KEY: Optional[str] = None
    EIGHTSCALE_BASE_URL: str = "https://8scale.run"
    ELEVENLABS_API_KEY: Optional[str] = None
    AZURE_SPEECH_KEY: Optional[str] = None
    AZURE_SPEECH_REGION: Optional[str] = None
    SYNCLABS_API_KEY: Optional[str] = None
    HF_TOKEN: Optional[str] = None
    MOCK_VIDEO_MODE: str = "SUCCESS"

    # FFmpeg executable path
    FFMPEG_PATH: Optional[str] = None
    FFPROBE_PATH: Optional[str] = None
    _backend_dir = Path(__file__).resolve().parent.parent
    _root_dir = _backend_dir.parent

    model_config = SettingsConfigDict(
        env_file=(str(_root_dir / ".env"), str(_backend_dir / ".env")),
        extra="allow",
    )

    @property
    def resolved_storage_root(self) -> Path:
        p = Path(self.STORAGE_ROOT).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    def get_ffmpeg_executable(self) -> str:
        """Returns the FFmpeg binary path, falling back to imageio-ffmpeg."""
        if self.FFMPEG_PATH and os.path.exists(self.FFMPEG_PATH):
            return self.FFMPEG_PATH

        system_ffmpeg = shutil.which("ffmpeg")
        if system_ffmpeg:
            return system_ffmpeg

        try:
            import imageio_ffmpeg
            exe = imageio_ffmpeg.get_ffmpeg_exe()
            if exe and os.path.exists(exe):
                return exe
        except Exception:
            pass

        return "ffmpeg"

    def get_ffprobe_executable(self) -> str:
        if self.FFPROBE_PATH and os.path.exists(self.FFPROBE_PATH):
            return self.FFPROBE_PATH

        system_ffprobe = shutil.which("ffprobe")
        if system_ffprobe:
            return system_ffprobe

        import sys
        venv_ffprobe = Path(sys.prefix) / "Scripts" / "ffprobe.exe"
        if venv_ffprobe.exists():
            return str(venv_ffprobe)

        # Many tools can use ffmpeg -i as fallback if ffprobe isn't present
        return "ffprobe"

settings = Settings()
