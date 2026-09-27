from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.asset_service import AssetService
from app.schemas.asset import AssetResponse, AssetFolderUpdate, AssetFavoriteToggle

router = APIRouter(tags=["assets"])

@router.get("/projects/{project_id}/assets", response_model=List[AssetResponse])
async def list_project_assets(
    project_id: str,
    asset_type: Optional[str] = None,
    folder_path: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    return await AssetService.list_assets(db, project_id, asset_type, folder_path)

@router.post("/projects/{project_id}/assets/upload", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    project_id: str,
    file: UploadFile = File(...),
    folder_path: str = Form("/"),
    asset_type: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    return await AssetService.upload_asset(db, project_id, file, folder_path, asset_type)

@router.get("/assets/{asset_id}", response_model=AssetResponse)
async def get_asset(asset_id: str, db: AsyncSession = Depends(get_db)):
    asset = await AssetService.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset

@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(asset_id: str, db: AsyncSession = Depends(get_db)):
    deleted = await AssetService.delete_asset(db, asset_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Asset not found")
    return None

@router.get("/assets/{asset_id}/waveform")
async def get_asset_waveform(asset_id: str, db: AsyncSession = Depends(get_db)):
    """Return pre-computed waveform peak data (list of floats 0.0–1.0)."""
    asset = await AssetService.get_asset(db, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"asset_id": asset_id, "peaks": asset.waveform_data or []}
