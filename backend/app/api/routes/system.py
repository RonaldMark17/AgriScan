from fastapi import APIRouter

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/public-config")
async def public_config() -> dict[str, str]:
    return {
        "notifications": "manual_service_worker",
    }
