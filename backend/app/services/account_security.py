from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AdminAction,
    AppealRequest,
    AppealStatus,
    Notification,
    SecurityEvent,
    SuspensionLog,
    User,
    UserAccountStatus,
)
from app.services.audit import write_audit_log
from app.services.push_notifications import create_notification

SUSPENSION_NOTICE = (
    "Your account has been temporarily suspended due to suspicious activity. "
    "Please contact the administrator or submit an appeal request."
)
DEFAULT_SUSPENSION_DAYS = 7
AUTO_SUSPENSION_MINUTES = 30
AUTO_SUSPEND_FAILED_LOGIN_THRESHOLD = 7
SENSITIVE_ACCOUNT_STATUSES = {
    UserAccountStatus.suspended.value,
    UserAccountStatus.disabled.value,
    UserAccountStatus.pending_review.value,
}


def get_request_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def effective_account_status(user: User) -> str:
    if not user.is_active or user.account_status == UserAccountStatus.disabled.value:
        return UserAccountStatus.disabled.value
    if (
        user.account_status in {UserAccountStatus.suspended.value, UserAccountStatus.pending_review.value}
        and user.account_status_until
    ):
        status_until = user.account_status_until
        if status_until.tzinfo is None:
            status_until = status_until.replace(tzinfo=UTC)
        if status_until <= datetime.now(UTC):
            return UserAccountStatus.active.value
    return user.account_status or UserAccountStatus.active.value


def account_status_message(user: User) -> str:
    status = effective_account_status(user)
    if status == UserAccountStatus.suspended.value:
        return SUSPENSION_NOTICE
    if status == UserAccountStatus.pending_review.value:
        return "Your account is pending security review. Please submit or monitor your review request."
    if status == UserAccountStatus.disabled.value:
        return "Your account has been disabled by an administrator. Please contact support for assistance."
    return "Your account is active."


def status_action_name(status_value: str) -> str:
    if status_value == UserAccountStatus.active.value:
        return "account_reactivated"
    if status_value == UserAccountStatus.disabled.value:
        return "account_disabled"
    if status_value == UserAccountStatus.pending_review.value:
        return "account_pending_review"
    return "account_suspended"


def default_status_until(status_value: str, status_until: datetime | None = None) -> datetime | None:
    if status_value != UserAccountStatus.suspended.value:
        return status_until
    return status_until or (datetime.now(UTC) + timedelta(days=DEFAULT_SUSPENSION_DAYS))


async def latest_active_suspension(db: AsyncSession, user_id: int) -> SuspensionLog | None:
    result = await db.execute(
        select(SuspensionLog)
        .where(SuspensionLog.user_id == user_id, SuspensionLog.is_active.is_(True))
        .order_by(SuspensionLog.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def latest_pending_appeal(db: AsyncSession, user_id: int) -> AppealRequest | None:
    result = await db.execute(
        select(AppealRequest)
        .where(AppealRequest.user_id == user_id, AppealRequest.status == AppealStatus.pending.value)
        .order_by(AppealRequest.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def record_security_event(
    db: AsyncSession,
    request: Request | None,
    *,
    event_type: str,
    severity: str = "info",
    user: User | None = None,
    email: str | None = None,
    device_name: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> SecurityEvent:
    event = SecurityEvent(
        user_id=user.id if user else None,
        email=(email or user.email if user else email),
        event_type=event_type,
        severity=severity,
        ip_address=get_request_ip(request) if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        device_name=device_name,
        metadata_json=metadata,
    )
    db.add(event)
    await db.flush()
    return event


async def record_admin_action(
    db: AsyncSession,
    request: Request | None,
    *,
    admin: User | None,
    action: str,
    affected_user: User | None = None,
    reason: str | None = None,
    description: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AdminAction:
    admin_action = AdminAction(
        admin_user_id=admin.id if admin else None,
        affected_user_id=affected_user.id if affected_user else None,
        action=action,
        reason=reason,
        description=description,
        ip_address=get_request_ip(request) if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        metadata_json=metadata,
    )
    db.add(admin_action)
    await db.flush()
    return admin_action


async def close_active_suspension_logs(db: AsyncSession, user_id: int) -> None:
    await db.execute(
        update(SuspensionLog)
        .where(SuspensionLog.user_id == user_id, SuspensionLog.is_active.is_(True))
        .values(is_active=False)
    )
    await db.flush()


async def apply_account_status_change(
    db: AsyncSession,
    request: Request | None,
    *,
    target_user: User,
    admin_user: User | None,
    status_value: str,
    reason: str,
    description: str,
    status_until: datetime | None = None,
    metadata: dict[str, Any] | None = None,
) -> SuspensionLog:
    previous_status = effective_account_status(target_user)
    action = status_action_name(status_value)
    resolved_until = default_status_until(status_value, status_until)

    await close_active_suspension_logs(db, target_user.id)

    target_user.account_status = status_value
    target_user.account_status_until = resolved_until
    target_user.is_active = status_value != UserAccountStatus.disabled.value

    suspension_log = SuspensionLog(
        user_id=target_user.id,
        admin_user_id=admin_user.id if admin_user else None,
        action=action,
        previous_status=previous_status,
        new_status=status_value,
        reason=reason,
        description=description,
        starts_at=datetime.now(UTC),
        ends_at=resolved_until,
        is_active=status_value in SENSITIVE_ACCOUNT_STATUSES,
        metadata_json=metadata,
    )
    db.add(suspension_log)
    await db.flush()

    await record_admin_action(
        db,
        request,
        admin=admin_user,
        action=f"admin.{action}",
        affected_user=target_user,
        reason=reason,
        description=description,
        metadata={
            "previous_status": previous_status,
            "new_status": status_value,
            "status_until": resolved_until.isoformat() if resolved_until else None,
            **(metadata or {}),
        },
    )
    await write_audit_log(
        db,
        request,
        f"admin.{action}",
        actor=admin_user,
        resource_type="user",
        resource_id=target_user.id,
        metadata={
            "previous_status": previous_status,
            "new_status": status_value,
            "reason": reason,
            "description": description,
            "status_until": resolved_until.isoformat() if resolved_until else None,
            **(metadata or {}),
        },
    )

    if status_value == UserAccountStatus.suspended.value:
        await create_notification(
            db,
            user_id=target_user.id,
            title="Account temporarily suspended",
            body=SUSPENSION_NOTICE,
            notification_type="account_suspended",
            payload={"type": "account_suspended", "url": "/account/suspended", "reason": reason},
        )
    elif status_value == UserAccountStatus.active.value:
        await create_notification(
            db,
            user_id=target_user.id,
            title="Account reactivated",
            body="Your AgriScan account has been reactivated after administrator review.",
            notification_type="account_reactivated",
            payload={"type": "account_reactivated", "url": "/"},
        )

    return suspension_log


async def auto_suspend_after_failed_logins(
    db: AsyncSession,
    request: Request | None,
    *,
    user: User,
    device_name: str | None,
) -> SuspensionLog | None:
    if user.failed_login_attempts < AUTO_SUSPEND_FAILED_LOGIN_THRESHOLD:
        return None
    if effective_account_status(user) in {UserAccountStatus.suspended.value, UserAccountStatus.disabled.value}:
        return None

    return await apply_account_status_change(
        db,
        request,
        target_user=user,
        admin_user=None,
        status_value=UserAccountStatus.suspended.value,
        reason="Multiple failed login attempts",
        description=(
            "The account was temporarily suspended after repeated failed login attempts. "
            "This automatic control protects the farmer account from unauthorized access."
        ),
        status_until=datetime.now(UTC) + timedelta(minutes=AUTO_SUSPENSION_MINUTES),
        metadata={"source": "automatic_failed_login_control", "device_name": device_name},
    )
