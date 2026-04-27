from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models import AuditLog, Farm, Role, User
from app.schemas.domain import AuditLogRead, FarmRead

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/audit-logs", response_model=list[AuditLogRead])
async def audit_logs(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)) -> list[AuditLog]:
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(300))
    return list(result.scalars().all())


@router.get("/pending-farms", response_model=list[FarmRead])
async def pending_farms(_: User = Depends(require_roles("admin", "inspector")), db: AsyncSession = Depends(get_db)) -> list[Farm]:
    result = await db.execute(select(Farm).where(Farm.status == "pending").order_by(Farm.created_at.desc()).limit(200))
    return list(result.scalars().all())


@router.get("/mfa-policy")
async def mfa_policy(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Role).order_by(Role.name))
    return {"roles": [{"name": role.name, "requires_mfa": role.requires_mfa} for role in result.scalars().all()]}
