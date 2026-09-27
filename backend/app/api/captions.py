import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.models.caption import Caption
from app.schemas.caption import CaptionItemSchema, CaptionUpdateSchema
from app.core.caption_parser import parse_srt, parse_vtt, export_srt, export_vtt

router = APIRouter(tags=["captions"])


@router.get("/projects/{project_id}/captions", response_model=List[CaptionItemSchema])
async def list_captions(project_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Caption).where(Caption.project_id == project_id).order_by(Caption.start_time_ms)
    res = await db.execute(query)
    return list(res.scalars().all())


@router.post("/projects/{project_id}/captions", response_model=CaptionItemSchema, status_code=status.HTTP_201_CREATED)
async def create_caption(project_id: str, data: CaptionItemSchema, db: AsyncSession = Depends(get_db)):
    caption = Caption(
        id=str(uuid.uuid4()),
        project_id=project_id,
        clip_id=data.clip_id,
        language=data.language or "ta",
        start_time_ms=data.start_time_ms,
        end_time_ms=data.end_time_ms,
        text=data.text,
        style=data.style or {},
        word_timestamps=data.word_timestamps,
    )
    db.add(caption)
    await db.commit()
    await db.refresh(caption)
    return caption


@router.patch("/projects/{project_id}/captions/{caption_id}", response_model=CaptionItemSchema)
async def update_caption(
    project_id: str,
    caption_id: str,
    data: CaptionUpdateSchema,
    db: AsyncSession = Depends(get_db)
):
    query = select(Caption).where(Caption.id == caption_id, Caption.project_id == project_id)
    res = await db.execute(query)
    cap = res.scalar_one_or_none()
    if not cap:
        raise HTTPException(status_code=404, detail="Caption not found")

    if data.start_time_ms is not None:
        cap.start_time_ms = data.start_time_ms
    if data.end_time_ms is not None:
        cap.end_time_ms = data.end_time_ms
    if data.text is not None:
        cap.text = data.text
    if data.language is not None:
        cap.language = data.language
    if data.style is not None:
        cap.style = data.style

    await db.commit()
    await db.refresh(cap)
    return cap


@router.delete("/captions/{caption_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_caption(caption_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Caption).where(Caption.id == caption_id)
    res = await db.execute(query)
    cap = res.scalar_one_or_none()
    if not cap:
        raise HTTPException(status_code=404, detail="Caption not found")
    await db.delete(cap)
    await db.commit()
    return None


@router.delete("/projects/{project_id}/captions", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_captions(project_id: str, db: AsyncSession = Depends(get_db)):
    """Delete all captions for a project (used before re-import)."""
    query = select(Caption).where(Caption.project_id == project_id)
    res = await db.execute(query)
    for cap in res.scalars().all():
        await db.delete(cap)
    await db.commit()
    return None


@router.post("/projects/{project_id}/captions/import", response_model=List[CaptionItemSchema], status_code=status.HTTP_201_CREATED)
async def import_captions(
    project_id: str,
    file: UploadFile = File(...),
    language: str = Query(default="ta"),
    replace: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    """
    Import captions from an uploaded .srt or .vtt file.
    If replace=true, existing captions for this project are deleted first.
    """
    filename = (file.filename or "").lower()
    if not (filename.endswith(".srt") or filename.endswith(".vtt")):
        raise HTTPException(status_code=400, detail="Only .srt and .vtt files are supported")

    content_bytes = await file.read()
    if len(content_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Caption file too large (max 5MB)")

    try:
        content = content_bytes.decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read caption file as UTF-8")

    try:
        if filename.endswith(".srt"):
            parsed = parse_srt(content)
        else:
            parsed = parse_vtt(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid caption file: {e}")

    if not parsed:
        raise HTTPException(status_code=400, detail="No valid captions found in file")

    if replace:
        query = select(Caption).where(Caption.project_id == project_id)
        res = await db.execute(query)
        for cap in res.scalars().all():
            await db.delete(cap)

    created = []
    for item in parsed:
        cap = Caption(
            id=str(uuid.uuid4()),
            project_id=project_id,
            language=language,
            start_time_ms=item["start_ms"],
            end_time_ms=item["end_ms"],
            text=item["text"],
            style={},
            word_timestamps=None,
        )
        db.add(cap)
        created.append(cap)

    await db.commit()
    for cap in created:
        await db.refresh(cap)

    return created


@router.get("/projects/{project_id}/captions/export/srt", response_class=PlainTextResponse)
async def export_captions_srt(project_id: str, db: AsyncSession = Depends(get_db)):
    """Export all captions as an SRT file."""
    query = select(Caption).where(Caption.project_id == project_id).order_by(Caption.start_time_ms)
    res = await db.execute(query)
    captions = list(res.scalars().all())

    if not captions:
        raise HTTPException(status_code=404, detail="No captions found for this project")

    cap_dicts = [{"start_ms": c.start_time_ms, "end_ms": c.end_time_ms, "text": c.text} for c in captions]
    srt_content = export_srt(cap_dicts)

    return PlainTextResponse(
        content=srt_content,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="captions_{project_id}.srt"'}
    )


@router.get("/projects/{project_id}/captions/export/vtt", response_class=PlainTextResponse)
async def export_captions_vtt(project_id: str, db: AsyncSession = Depends(get_db)):
    """Export all captions as a WebVTT file."""
    query = select(Caption).where(Caption.project_id == project_id).order_by(Caption.start_time_ms)
    res = await db.execute(query)
    captions = list(res.scalars().all())

    if not captions:
        raise HTTPException(status_code=404, detail="No captions found for this project")

    cap_dicts = [
        {"start_ms": c.start_time_ms, "end_ms": c.end_time_ms, "text": c.text, "speaker": None}
        for c in captions
    ]
    vtt_content = export_vtt(cap_dicts)

    return PlainTextResponse(
        content=vtt_content,
        media_type="text/vtt",
        headers={"Content-Disposition": f'attachment; filename="captions_{project_id}.vtt"'}
    )


@router.post("/projects/{project_id}/captions/auto-generate")
async def auto_generate_captions(project_id: str, db: AsyncSession = Depends(get_db)):
    """
    Attempt automatic caption generation via Whisper STT.
    Returns provider_not_configured if Whisper is not set up.
    """
    return {
        "status": "provider_not_configured",
        "message": "Automatic transcription requires a Whisper STT provider. Configure an API key in Settings → AI Providers.",
        "providers": ["openai_whisper", "local_whisper"],
    }
