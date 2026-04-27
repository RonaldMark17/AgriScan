from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.api.api import api_router
from app.core.config import get_settings
from app.core.database import Base, AsyncSessionLocal, engine
from app.core.middleware import SecurityHeadersMiddleware
from app.models import Role

settings = get_settings()


async def seed_roles() -> None:
    role_seed = {
        "admin": ("System administrator", True),
        "farmer": ("Farm owner or operator", False),
        "inspector": ("Agriculture office staff or inspector", True),
        "buyer": ("Harvest buyer or cooperative purchaser", False),
    }
    async with AsyncSessionLocal() as db:
        for name, (description, requires_mfa) in role_seed.items():
            result = await db.execute(select(Role).where(Role.name == name))
            role = result.scalar_one_or_none()
            if role is None:
                db.add(Role(name=name, description=description, requires_mfa=requires_mfa))
            else:
                role.description = description
                if name in {"admin", "inspector"}:
                    role.requires_mfa = True
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.auto_create_tables:
        async with engine.begin() as conn:
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
    app.add_middleware(HTTPSRedirectMiddleware)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir, check_dir=False), name="uploads")


@app.get("/health", tags=["system"])
async def health() -> dict:
    return {"status": "ok", "service": "agriscan-api"}
