import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DIRS = [
    "backend/app/api",
    "backend/app/core",
    "backend/app/models",
    "backend/app/schemas",
    "backend/app/services",
    "backend/app/providers",
    "backend/app/tasks",
    "backend/alembic/versions",
    "backend/tests",
    "storage/projects",
    "storage/sfx-library",
    "storage/fonts",
    "storage/luts",
    "storage/templates",
    "storage/cache/proxies",
    "storage/cache/thumbnails",
    "storage/cache/waveforms",
    "storage/cache/chunks",
    # Music library
    "storage/music-library/tamil-songs/melody",
    "storage/music-library/tamil-songs/love",
    "storage/music-library/tamil-songs/sad",
    "storage/music-library/tamil-songs/mass",
    "storage/music-library/tamil-songs/folk",
    "storage/music-library/tamil-songs/devotional",
    "storage/music-library/tamil-songs/kids",
    "storage/music-library/tamil-songs/instrumental",
    "storage/music-library/tamil-instrumental",
    "storage/music-library/english-songs",
    "storage/music-library/background-music",
    "storage/music-library/cinematic",
    "storage/music-library/emotional",
    "storage/music-library/action",
    "storage/music-library/romance",
    "storage/music-library/happy",
    "storage/music-library/sad",
    "storage/music-library/kids",
    "storage/music-library/ambient",
    "storage/music-library/ai-generated",
    "storage/music-library/my-uploads",
]

def main():
    for d in DIRS:
        p = BASE_DIR / d
        p.mkdir(parents=True, exist_ok=True)
    print(f"Successfully initialized {len(DIRS)} directories.")

if __name__ == "__main__":
    main()
