import os
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO, Optional
from app.config import settings

class StorageBackend(ABC):
    @abstractmethod
    async def save_file(self, relative_path: str, file_obj: BinaryIO) -> str:
        """Saves file to storage and returns the storage key or relative path."""
        pass

    @abstractmethod
    async def save_bytes(self, relative_path: str, data: bytes) -> str:
        """Saves raw bytes to storage and returns storage key."""
        pass

    @abstractmethod
    def get_local_path(self, relative_path: str) -> Path:
        """Returns the local filesystem path for the given key/path."""
        pass

    @abstractmethod
    async def delete_file(self, relative_path: str) -> bool:
        """Deletes file from storage."""
        pass

    @abstractmethod
    def exists(self, relative_path: str) -> bool:
        """Checks if file exists."""
        pass

    @abstractmethod
    def get_url(self, relative_path: str) -> str:
        """Returns the URL to access or stream the file."""
        pass


class LocalStorageBackend(StorageBackend):
    def __init__(self, root_dir: Path):
        self.root_dir = root_dir.resolve()
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def _resolve(self, relative_path: str) -> Path:
        clean_path = relative_path.lstrip("/\\")
        resolved = (self.root_dir / clean_path).resolve()
        # Security: Prevent path traversal
        if not str(resolved).startswith(str(self.root_dir)):
            raise ValueError("Invalid storage path traversal attempted.")
        return resolved

    async def save_file(self, relative_path: str, file_obj: BinaryIO) -> str:
        target = self._resolve(relative_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "wb") as buffer:
            shutil.copyfileobj(file_obj, buffer)
        return str(Path(relative_path).as_posix())

    async def save_bytes(self, relative_path: str, data: bytes) -> str:
        target = self._resolve(relative_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "wb") as buffer:
            buffer.write(data)
        return str(Path(relative_path).as_posix())

    def get_local_path(self, relative_path: str) -> Path:
        return self._resolve(relative_path)

    async def delete_file(self, relative_path: str) -> bool:
        target = self._resolve(relative_path)
        if target.exists():
            target.unlink()
            return True
        return False

    def exists(self, relative_path: str) -> bool:
        return self._resolve(relative_path).exists()

    def get_url(self, relative_path: str) -> str:
        clean = relative_path.lstrip("/\\").replace("\\", "/")
        return f"/media/{clean}"


class S3StorageBackend(StorageBackend):
    """S3-compatible storage backend for future cloud deployments."""
    def __init__(self, endpoint: Optional[str], bucket: str, access_key: Optional[str], secret_key: Optional[str], region: str):
        self.endpoint = endpoint
        self.bucket = bucket
        self.access_key = access_key
        self.secret_key = secret_key
        self.region = region
        self.local_cache = LocalStorageBackend(settings.resolved_storage_root / "cache")

    async def save_file(self, relative_path: str, file_obj: BinaryIO) -> str:
        # Save to local cache first
        return await self.local_cache.save_file(relative_path, file_obj)

    async def save_bytes(self, relative_path: str, data: bytes) -> str:
        return await self.local_cache.save_bytes(relative_path, data)

    def get_local_path(self, relative_path: str) -> Path:
        return self.local_cache.get_local_path(relative_path)

    async def delete_file(self, relative_path: str) -> bool:
        return await self.local_cache.delete_file(relative_path)

    def exists(self, relative_path: str) -> bool:
        return self.local_cache.exists(relative_path)

    def get_url(self, relative_path: str) -> str:
        return self.local_cache.get_url(relative_path)


def get_storage() -> StorageBackend:
    if settings.STORAGE_BACKEND == "s3" and settings.S3_ACCESS_KEY:
        return S3StorageBackend(
            endpoint=settings.S3_ENDPOINT,
            bucket=settings.S3_BUCKET,
            access_key=settings.S3_ACCESS_KEY,
            secret_key=settings.S3_SECRET_KEY,
            region=settings.S3_REGION
        )
    return LocalStorageBackend(settings.resolved_storage_root)

storage = get_storage()
