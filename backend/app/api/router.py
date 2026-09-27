from fastapi import APIRouter
from app.api.projects import router as projects_router
from app.api.timelines import router as timelines_router
from app.api.assets import router as assets_router
from app.api.music import router as music_router
from app.api.render import router as render_router
from app.api.characters import router as characters_router
from app.api.scenes import router as scenes_router
from app.api.ai import router as ai_router
from app.api.captions import router as captions_router
from app.api.color import router as color_router
from app.api.vfx import router as vfx_router
from app.api.sfx import router as sfx_router
from app.api.luts import router as luts_router
from app.api.scopes import router as scopes_router
from app.api.tracking import router as tracking_router
from app.api.stabilization import router as stabilization_router
from app.api.production import router as production_router
from app.api.film import router as film_router
from app.api.media_transform import router as media_transform_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(projects_router)
api_router.include_router(timelines_router)
api_router.include_router(assets_router)
api_router.include_router(music_router)
api_router.include_router(render_router)
api_router.include_router(characters_router)
api_router.include_router(scenes_router)
api_router.include_router(ai_router)
api_router.include_router(captions_router)
api_router.include_router(color_router)
api_router.include_router(vfx_router)
api_router.include_router(sfx_router)
api_router.include_router(luts_router)
api_router.include_router(scopes_router)
api_router.include_router(tracking_router)
api_router.include_router(stabilization_router)
api_router.include_router(production_router)
api_router.include_router(film_router)
api_router.include_router(media_transform_router)


