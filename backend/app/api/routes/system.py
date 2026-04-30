from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/public-config")
async def public_config() -> dict[str, str]:
    settings = get_settings()
    return {
        "vapid_public_key": settings.vapid_public_key or "",
    }
