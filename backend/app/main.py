import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from app.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.storage import storage
from app.services.music_service import MusicService
from app.services.project_service import ProjectService
from app.schemas.project import ProjectCreate, ProjectSettings
from app.api.router import api_router
from app.api.websocket import router as ws_router

from sqlalchemy import text
import app.models  # noqa: F401

async def init_db():
    import app.models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    alter_statements = [
        "ALTER TABLE ai_jobs ADD COLUMN scene_id VARCHAR(36);",
        "ALTER TABLE ai_jobs ADD COLUMN model VARCHAR(255);",
        "ALTER TABLE ai_jobs ADD COLUMN prompt TEXT;",
        "ALTER TABLE ai_jobs ADD COLUMN result_asset_id VARCHAR(36);",
        "ALTER TABLE ai_jobs ADD COLUMN output_url VARCHAR(1024);",
        "ALTER TABLE ai_jobs ADD COLUMN job_metadata JSON;",
        "ALTER TABLE ai_jobs ADD COLUMN started_at DATETIME;",
        "ALTER TABLE characters ADD COLUMN is_locked BOOLEAN DEFAULT 1;",
        "ALTER TABLE characters ADD COLUMN tamil_name VARCHAR(255);",
        "ALTER TABLE characters ADD COLUMN age INTEGER DEFAULT 25;",
        "ALTER TABLE characters ADD COLUMN gender VARCHAR(50) DEFAULT 'unspecified';",
        "ALTER TABLE characters ADD COLUMN appearance TEXT;",
        "ALTER TABLE characters ADD COLUMN clothing TEXT;",
        "ALTER TABLE characters ADD COLUMN hair VARCHAR(100);",
        "ALTER TABLE characters ADD COLUMN skin VARCHAR(100);",
        "ALTER TABLE characters ADD COLUMN voice_id VARCHAR(255);",
        "ALTER TABLE characters ADD COLUMN visual_style VARCHAR(255) DEFAULT 'Cinematic Photorealistic';",
        "ALTER TABLE characters ADD COLUMN reference_images JSON;",
        "ALTER TABLE scenes ADD COLUMN story_id VARCHAR(36);",
        "ALTER TABLE scenes ADD COLUMN duration_sec FLOAT DEFAULT 5.0;",
        "ALTER TABLE scenes ADD COLUMN camera_directions VARCHAR(255) DEFAULT 'Medium Shot, Static';",
        "ALTER TABLE scenes ADD COLUMN shot_type VARCHAR(100) DEFAULT 'Medium Shot';",
        "ALTER TABLE scenes ADD COLUMN lighting VARCHAR(100) DEFAULT 'Natural Daylight';",
        "ALTER TABLE scenes ADD COLUMN dialogue_text TEXT;",
        "ALTER TABLE scenes ADD COLUMN generated_asset_id VARCHAR(36);",
        """CREATE TABLE IF NOT EXISTS production_plans (
            id VARCHAR(36) PRIMARY KEY,
            project_id VARCHAR(36) NOT NULL,
            story_id VARCHAR(36),
            title VARCHAR(255) NOT NULL DEFAULT 'Untitled Production Plan',
            target_duration_sec FLOAT NOT NULL DEFAULT 30.0,
            status VARCHAR(30) NOT NULL DEFAULT 'planned',
            progress_percent FLOAT NOT NULL DEFAULT 0.0,
            plan_data JSON,
            created_at DATETIME,
            updated_at DATETIME
        );""",
        """CREATE TABLE IF NOT EXISTS production_asset_versions (
            id VARCHAR(36) PRIMARY KEY,
            project_id VARCHAR(36) NOT NULL,
            scene_id VARCHAR(36) NOT NULL,
            version_number INTEGER NOT NULL DEFAULT 1,
            strategy VARCHAR(20) DEFAULT 'T2V',
            asset_id VARCHAR(36),
            job_id VARCHAR(36),
            status VARCHAR(30) NOT NULL DEFAULT 'valid',
            is_current BOOLEAN NOT NULL DEFAULT 0,
            prompt TEXT,
            provider VARCHAR(50) NOT NULL DEFAULT 'mock',
            duration_sec FLOAT NOT NULL DEFAULT 5.0,
            error TEXT,
            metadata_json JSON,
            created_at DATETIME
        );""",
        """ALTER TABLE production_asset_versions ADD COLUMN strategy VARCHAR(20) DEFAULT 'T2V';"""
    ]

    for stmt in alter_statements:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception:
            pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Initialize database schema
    await init_db()


    # 2. Seed music folders
    async with AsyncSessionLocal() as session:
        await MusicService.seed_folders(session)

        # 3. Create default project if none exist
        projects = await ProjectService.list_projects(session)
        if not projects:
            await ProjectService.create_project(
                session,
                ProjectCreate(
                    title="Ponniyin Selvan - Cinematic Reimagining",
                    description="Personal cinema project in TAMIL AI FORGE. An epic historical drama reimagined with AI video and Tamil voice.",
                    settings=ProjectSettings(
                        width=1920,
                        height=1080,
                        fps=30.0,
                        sample_rate=48000,
                        color_space="bt709",
                        max_duration_sec=600,
                    ),
                    story_data={
                        "logline": "A secret messenger travels across the Chola kingdom with urgent warnings.",
                        "genre": "Historical Epic",
                        "mood": "Cinematic & Grand",
                    }
                )
            )

    yield

    # Cleanup
    await engine.dispose()

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="Personal-use AI filmmaking and video editing platform. From Words to Cinema.",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Configure CORS for desktop/local development
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include REST API & WebSockets
    app.include_router(api_router)
    app.include_router(ws_router)

    # HTTP Range-Request media streaming endpoint for instant scrubbing
    @app.get("/media/{file_path:path}")
    async def stream_media(file_path: str, request: Request):
        try:
            local_target = storage.get_local_path(file_path)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid path")

        if not local_target.exists():
            raise HTTPException(status_code=404, detail="Media file not found")

        file_size = local_target.stat().st_size
        range_header = request.headers.get("range")

        # Determine media type
        ext = local_target.suffix.lower()
        media_types = {
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".aac": "audio/aac",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
        }
        content_type = media_types.get(ext, "application/octet-stream")

        def iterfile(path: Path, start: int, length: int, chunk_size: int = 64 * 1024):
            with open(path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    read_len = min(chunk_size, remaining)
                    chunk = f.read(read_len)
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        if range_header:
            try:
                h = range_header.replace("bytes=", "").split("-")
                start = int(h[0])
                end = int(h[1]) if h[1] else file_size - 1
            except Exception:
                start = 0
                end = file_size - 1

            content_length = (end - start) + 1
            headers = {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Content-Type": content_type,
            }
            return StreamingResponse(iterfile(local_target, start, content_length), status_code=206, headers=headers)

        return StreamingResponse(
            open(local_target, "rb"),
            media_type=content_type,
            headers={"Accept-Ranges": "bytes", "Content-Length": str(file_size)}
        )

    @app.get("/health")
    async def health_check():
        return {
            "status": "healthy",
            "app": settings.APP_NAME,
            "tagline": settings.APP_TAGLINE,
            "ffmpeg": settings.get_ffmpeg_executable(),
            "storage_backend": settings.STORAGE_BACKEND,
        }

    return app

app = create_app()
