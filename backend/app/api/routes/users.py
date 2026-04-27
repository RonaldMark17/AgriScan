from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models import DeviceLoginHistory, Role, User
from app.schemas.common import MessageResponse
from app.schemas.domain import UserRead, UserUpdate
from app.services.audit import write_audit_log

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
async def list_users(
    _: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    result = await db.execute(select(User).options(selectinload(User.role)).order_by(User.created_at.desc()).limit(200))
    return list(result.scalars().all())


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(select(User).options(selectinload(User.role)).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    data = payload.model_dump(exclude_unset=True)
    if "role" in data and data["role"]:
        role_result = await db.execute(select(Role).where(Role.name == data.pop("role")))
        role = role_result.scalar_one_or_none()
        if role is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role.")
        user.role_id = role.id
    for field, value in data.items():
        setattr(user, field, value)

    await write_audit_log(db, request, "admin.user_updated", actor=current_user, resource_type="user", resource_id=user.id)
    await db.commit()
    await db.refresh(user, ["role"])
    return user


@router.get("/devices")
async def my_device_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(DeviceLoginHistory).where(DeviceLoginHistory.user_id == current_user.id).order_by(DeviceLoginHistory.created_at.desc()).limit(20)
    )
    return [
        {
            "id": item.id,
            "ip_address": item.ip_address,
            "user_agent": item.user_agent,
            "device_name": item.device_name,
            "success": item.success,
            "created_at": item.created_at,
        }
        for item in result.scalars().all()
    ]


@router.post("/{user_id}/force-mfa", response_model=MessageResponse)
async def force_user_role_mfa(
    user_id: int,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    result = await db.execute(select(User).options(selectinload(User.role)).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.role.requires_mfa = True
    await write_audit_log(db, request, "admin.force_mfa", actor=current_user, resource_type="user", resource_id=user.id)
    await db.commit()
    return MessageResponse(message=f"MFA is now required for role {user.role.name}.")
