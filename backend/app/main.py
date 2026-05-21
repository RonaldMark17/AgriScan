import asyncio
import logging
import os
import re
import subprocess
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

logger = logging.getLogger(__name__)
settings = get_settings()
BACKEND_ROOT = Path(__file__).resolve().parents[1]
API_ROOT_PATH = settings.api_v1_prefix.strip("/").split("/", 1)[0]
FRONTEND_RESERVED_PATHS = {"uploads", "docs", "redoc", "openapi.json"}
if API_ROOT_PATH:
    FRONTEND_RESERVED_PATHS.add(API_ROOT_PATH)
HASHED_ASSET_PATTERN = re.compile(r"^(?P<base>.+)-[A-Za-z0-9_-]{6,}$")
FRONTEND_SOURCE_PATTERNS = (
    "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.*",
    "postcss.config.*",
    "tailwind.config.*",
    "scripts/**/*",
    "src/**/*",
    "public/**/*",
)
FRONTEND_EXTRA_SOURCE_FILES = (
    BACKEND_ROOT / "app" / "ml" / "artifacts" / "visual_memory_examples.json",
    BACKEND_ROOT / "app" / "ml" / "export_visual_memory_runtime.py",
)
FRONTEND_BUILD_LOCK = asyncio.Lock()


def get_frontend_dist_root() -> Path:
    dist_root = Path(settings.frontend_dist_dir)
    if not dist_root.is_absolute():
        dist_root = BACKEND_ROOT / dist_root
    return dist_root.resolve()


def get_frontend_source_root() -> Path:
    return settings.frontend_source_path.resolve()


def get_frontend_source_dist_root() -> Path:
    return (get_frontend_source_root() / "dist").resolve()


def frontend_index_path(dist_root: Path) -> Path:
    return dist_root / "index.html"


def frontend_bundle_exists(dist_root: Path) -> bool:
    return frontend_index_path(dist_root).is_file()


def get_frontend_candidate_roots() -> list[Path]:
    candidate_roots = [get_frontend_dist_root()]
    source_dist_root = get_frontend_source_dist_root()
    if source_dist_root not in candidate_roots:
        candidate_roots.append(source_dist_root)
    return candidate_roots


def resolve_frontend_dist_root() -> Path:
    candidate_roots = get_frontend_candidate_roots()
    primary_root = candidate_roots[0]

    if frontend_bundle_exists(primary_root):
        return primary_root

    for fallback_root in candidate_roots[1:]:
        if frontend_bundle_exists(fallback_root):
            logger.warning(
                "Frontend backend bundle missing at %s; serving fallback build from %s instead.",
                primary_root,
                fallback_root,
            )
            return fallback_root

    return primary_root


def frontend_bundle_error_detail() -> str:
    checked_paths = ", ".join(str(frontend_index_path(root)) for root in get_frontend_candidate_roots())
    return (
        "Frontend index.html not found. "
        f"Checked: {checked_paths}. "
        "Run `npm run build:backend` from the frontend folder, or verify FRONTEND_DIST_DIR."
    )


def iter_frontend_source_files(source_root: Path):
    seen: set[Path] = set()
    for pattern in FRONTEND_SOURCE_PATTERNS:
        for candidate in source_root.glob(pattern):
            if not candidate.is_file():
                continue
            resolved = candidate.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            yield resolved
    for candidate in FRONTEND_EXTRA_SOURCE_FILES:
        if not candidate.is_file():
            continue
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        yield resolved


def latest_file_mtime(file_paths) -> float | None:
    latest: float | None = None
    for path in file_paths:
        try:
            mtime = path.stat().st_mtime
        except OSError:
            continue
        latest = mtime if latest is None else max(latest, mtime)
    return latest


def frontend_bundle_is_stale(source_root: Path, dist_root: Path) -> bool:
    if not source_root.is_dir():
        return False

    source_mtime = latest_file_mtime(iter_frontend_source_files(source_root))
    if source_mtime is None:
        return False

    if not dist_root.is_dir():
        return True

    dist_mtime = latest_file_mtime(path for path in dist_root.rglob("*") if path.is_file())
    if dist_mtime is None:
        return True

    return source_mtime > dist_mtime


def build_frontend_bundle(source_root: Path) -> None:
    npm_command = "npm.cmd" if os.name == "nt" else "npm"
    result = subprocess.run(
        [npm_command, "run", "build:backend"],
        cwd=source_root,
        capture_output=True,
        text=True,
        timeout=settings.frontend_auto_build_timeout_seconds,
        check=False,
        env=os.environ.copy(),
    )
    if result.returncode != 0:
        output = "\n".join(part for part in (result.stdout.strip(), result.stderr.strip()) if part).strip()
        raise RuntimeError(output or "Frontend build failed without diagnostic output.")


async def ensure_frontend_dev_bundle(dist_root: Path) -> None:
    if not settings.frontend_auto_build:
        return

    source_root = get_frontend_source_root()
    if not source_root.is_dir():
        return

    source_dist_root = get_frontend_source_dist_root()
    primary_bundle_missing = not frontend_bundle_exists(dist_root)
    fallback_bundle_exists = source_dist_root != dist_root and frontend_bundle_exists(source_dist_root)

    if settings.environment == "production":
        if not primary_bundle_missing or fallback_bundle_exists:
            return
    else:
        if not primary_bundle_missing and not frontend_bundle_is_stale(source_root, dist_root):
            return

    async with FRONTEND_BUILD_LOCK:
        primary_bundle_missing = not frontend_bundle_exists(dist_root)
        fallback_bundle_exists = source_dist_root != dist_root and frontend_bundle_exists(source_dist_root)

        if settings.environment == "production":
            if not primary_bundle_missing or fallback_bundle_exists:
                return
            logger.warning(
                "Frontend backend bundle missing at %s; rebuilding backend static bundle from %s.",
                dist_root,
                source_root,
            )
        else:
            if not primary_bundle_missing and not frontend_bundle_is_stale(source_root, dist_root):
                return
            logger.info("Frontend source files changed; rebuilding backend static bundle from %s.", source_root)
        try:
            await asyncio.to_thread(build_frontend_bundle, source_root)
        except Exception as exc:
            logger.exception("Automatic frontend build failed.", exc_info=exc)
            raise HTTPException(
                status_code=500,
                detail=(
                    "Frontend auto-build failed. "
                    "Run `npm run build:backend` from the frontend folder, "
                    "or verify Node.js/npm are installed on the server."
                ),
            ) from exc


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
    primary_dist_root = get_frontend_dist_root()
    clean_path = full_path.strip("/")
    path_suffix = Path(clean_path).suffix
    if not clean_path or not path_suffix:
        await ensure_frontend_dev_bundle(primary_dist_root)

    dist_root = resolve_frontend_dist_root()

    if not dist_root.is_dir():
        raise HTTPException(status_code=500, detail=frontend_bundle_error_detail())

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

        if path_suffix:
            fallback_candidate = resolve_hashed_asset_fallback(dist_root, clean_path)
            if fallback_candidate is not None:
                return frontend_file_response(dist_root, fallback_candidate)
            raise HTTPException(status_code=404, detail="Not found")

    index_path = frontend_index_path(dist_root)
    if not index_path.is_file():
        raise HTTPException(status_code=500, detail=frontend_bundle_error_detail())
    return frontend_file_response(dist_root, index_path)
