import asyncio
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import delete, select, update

from app.api.api import api_router
from app.core.config import get_settings
from app.core.database import Base, AsyncSessionLocal, engine, run_schema_compatibility_migrations
from app.core.middleware import SecurityHeadersMiddleware
from app.core.security import decode_token
from app.models import Role, User
from app.services.firebase_storage import restore_upload_from_firebase
from app.services.realtime_alerts import realtime_alert_hub

settings = get_settings()
BACKEND_ROOT = Path(__file__).resolve().parents[1]
API_ROOT_PATH = settings.api_v1_prefix.strip("/").split("/", 1)[0]
FRONTEND_RESERVED_PATHS = {"uploads", "docs", "redoc", "openapi.json"}
if API_ROOT_PATH:
    FRONTEND_RESERVED_PATHS.add(API_ROOT_PATH)
HASHED_ASSET_PATTERN = re.compile(r"^(?P<base>.+)-[A-Za-z0-9_-]{6,}$")


def get_frontend_dist_root() -> Path:
    dist_root = Path(settings.frontend_dist_dir)
    if not dist_root.is_absolute():
        dist_root = BACKEND_ROOT / dist_root
    return dist_root.resolve()


def frontend_file_response(dist_root: Path, file_path: Path, *, media_type: str | None = None) -> FileResponse:
    relative_path = file_path.relative_to(dist_root).as_posix()
    headers: dict[str, str] = {}

    if relative_path in {"index.html", "manifest.webmanifest", "offline.html", "sw.js"}:
        headers["Cache-Control"] = "no-cache"
    elif relative_path.startswith("assets/"):
        headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif relative_path.startswith(("icons/", "screenshots/")):
        headers["Cache-Control"] = "public, max-age=86400"

    return FileResponse(file_path, media_type=media_type, headers=headers)


def resolve_hashed_asset_fallback(dist_root: Path, clean_path: str) -> Path | None:
    relative_path = Path(clean_path.replace("\\", "/"))
    if not relative_path.parts or relative_path.parts[0] != "assets":
        return None

    match = HASHED_ASSET_PATTERN.match(relative_path.stem)
    if not match:
        return None

    asset_dir = (dist_root / relative_path.parent).resolve()
    try:
        asset_dir.relative_to(dist_root)
    except ValueError:
        return None

    if not asset_dir.is_dir():
        return None

    base_name = match.group("base")
    candidates = [candidate for candidate in asset_dir.glob(f"{base_name}-*{relative_path.suffix}") if candidate.is_file()]
    if not candidates:
        return None

    candidates.sort(key=lambda candidate: (candidate.stat().st_mtime, candidate.name), reverse=True)
    return candidates[0]


async def seed_roles() -> None:
    role_seed = {
        "admin": ("System administrator", True),
        "farmer": ("Farm owner or operator", False),
    }
    async with AsyncSessionLocal() as db:
        for name, (description, requires_mfa) in role_seed.items():
            result = await db.execute(select(Role).where(Role.name == name))
            role = result.scalar_one_or_none()
            if role is None:
                db.add(Role(name=name, description=description, requires_mfa=requires_mfa))
            else:
                role.description = description
                role.requires_mfa = requires_mfa

        await db.flush()
        farmer_result = await db.execute(select(Role).where(Role.name == "farmer"))
        farmer_role = farmer_result.scalar_one()
        legacy_result = await db.execute(select(Role).where(Role.name.in_(("inspector", "buyer"))))
        legacy_roles = list(legacy_result.scalars().all())
        legacy_role_ids = [role.id for role in legacy_roles]
        if legacy_role_ids:
            await db.execute(update(User).where(User.role_id.in_(legacy_role_ids)).values(role_id=farmer_role.id))
            await db.execute(delete(Role).where(Role.id.in_(legacy_role_ids)))
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.auto_create_tables:
        async with engine.begin() as conn:
            await run_schema_compatibility_migrations(conn)
            await conn.run_sync(Base.metadata.create_all)
    if settings.auto_create_tables:
        await seed_roles()
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="AgriScan: AI-powered smart farming PWA backend for crop monitoring and disease detection.",
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)
if settings.environment == "production":
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)
    if settings.force_https_redirect:
        app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)
settings.upload_path.mkdir(parents=True, exist_ok=True)


@app.get("/health", tags=["system"])
async def health() -> dict:
    return {"status": "ok", "service": "agriscan-api"}


@app.get("/uploads/{filename:path}", include_in_schema=False)
async def serve_upload(filename: str):
    image_name = Path(filename.replace("\\", "/")).name
    if not image_name:
        raise HTTPException(status_code=404, detail="Not found")

    local_path = settings.upload_path / image_name
    if not local_path.is_file():
        restored_path = await asyncio.to_thread(restore_upload_from_firebase, image_name)
        if restored_path is not None:
            local_path = restored_path

    if not local_path.is_file():
        raise HTTPException(status_code=404, detail="Not found")

    return FileResponse(local_path)


@app.websocket(f"{settings.api_v1_prefix}/notifications/stream")
async def notification_stream(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_token(token, "access")
        if not payload.get("mfa", True):
            raise ValueError("MFA verification required.")
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await realtime_alert_hub.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await realtime_alert_hub.disconnect(user_id, websocket)
    except Exception:
        await realtime_alert_hub.disconnect(user_id, websocket)
        await websocket.close()


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    dist_root = get_frontend_dist_root()
    if not dist_root.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"Frontend build not found at {dist_root}. Run `npm run build:backend` from the frontend folder.",
        )

    clean_path = full_path.strip("/")
    first_segment = clean_path.split("/", 1)[0]
    if first_segment in FRONTEND_RESERVED_PATHS:
        raise HTTPException(status_code=404, detail="Not found")

    if clean_path == "favicon.ico":
        icon_path = dist_root / "icons" / "icon.svg"
        if icon_path.is_file():
            return frontend_file_response(dist_root, icon_path, media_type="image/svg+xml")

    if clean_path:
        candidate = (dist_root / clean_path).resolve()
        try:
            candidate.relative_to(dist_root)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Not found") from exc

        if candidate.is_file():
            return frontend_file_response(dist_root, candidate)

        if Path(clean_path).suffix:
            fallback_candidate = resolve_hashed_asset_fallback(dist_root, clean_path)
            if fallback_candidate is not None:
                return frontend_file_response(dist_root, fallback_candidate)
            raise HTTPException(status_code=404, detail="Not found")

    index_path = dist_root / "index.html"
    if not index_path.is_file():
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
    return frontend_file_response(dist_root, index_path)
