from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import AppealRequest, Role, User, UserAccountStatus
from app.schemas.common import MessageResponse
from app.schemas.domain import AccountStatusRead, AppealRequestCreate
from app.services.account_security import (
    account_status_message,
    effective_account_status,
    latest_active_suspension,
    latest_pending_appeal,
    record_security_event,
)
from app.services.audit import write_audit_log
from app.services.push_notifications import create_notification

router = APIRouter(prefix="/account", tags=["account security"])


@router.get("/status", response_model=AccountStatusRead)
async def account_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    suspension = await latest_active_suspension(db, current_user.id)
    pending_appeal = await latest_pending_appeal(db, current_user.id)
    return {
        "account_status": effective_account_status(current_user),
        "account_status_until": current_user.account_status_until,
        "message": account_status_message(current_user),
        "suspension": suspension,
        "pending_appeal": pending_appeal,
    }


@router.post("/appeals", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def submit_appeal(
    payload: AppealRequestCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    status_value = effective_account_status(current_user)
    if status_value == UserAccountStatus.active.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only restricted accounts can submit an appeal.")
    if status_value == UserAccountStatus.disabled.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Disabled accounts must contact an administrator directly.")

    pending = await latest_pending_appeal(db, current_user.id)
    if pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A review request is already pending.")

    suspension = await latest_active_suspension(db, current_user.id)
    appeal = AppealRequest(
        user_id=current_user.id,
        suspension_log_id=suspension.id if suspension else None,
        explanation=payload.explanation,
        supporting_message=payload.supporting_message,
        updated_information=payload.updated_information,
    )
    db.add(appeal)
    await db.flush()

    await record_security_event(
        db,
        request,
        event_type="appeal_submitted",
        severity="info",
        user=current_user,
        email=current_user.email,
        metadata={"appeal_id": appeal.id, "account_status": status_value},
    )
    await write_audit_log(
        db,
        request,
        "account.appeal_submitted",
        actor=current_user,
        resource_type="appeal_request",
        resource_id=appeal.id,
        metadata={"account_status": status_value},
    )

    admin_result = await db.execute(select(User).join(Role, Role.id == User.role_id).where(Role.name == "admin", User.is_active.is_(True)))
    for admin in admin_result.scalars().all():
        await create_notification(
            db,
            user_id=admin.id,
            title="Suspension appeal pending",
            body=f"{current_user.full_name} submitted an account review request.",
            notification_type="appeal_pending",
            payload={"type": "appeal_pending", "url": "/admin/users", "appeal_id": appeal.id},
        )

    await db.commit()
    return MessageResponse(message="Your appeal request has been submitted for administrator review.")
