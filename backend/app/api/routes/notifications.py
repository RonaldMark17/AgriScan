from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models import Notification, User
from app.schemas.common import MessageResponse
from app.schemas.domain import NotificationRead
from app.services.push_notifications import (
    create_notification,
    dispatch_push_to_user,
    remove_push_subscription,
    upsert_push_subscription,
    web_push_configuration,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])
settings = get_settings()


class BrowserPushKeys(BaseModel):
    p256dh: str = Field(min_length=1)
    auth: str = Field(min_length=1)


class BrowserPushSubscription(BaseModel):
    endpoint: str = Field(min_length=1, max_length=700)
    keys: BrowserPushKeys


@router.get("", response_model=list[NotificationRead])
async def list_notifications(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[Notification]:
    result = await db.execute(
        select(Notification).where(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).limit(100)
    )
    return list(result.scalars().all())


@router.patch("/read-all", response_model=MessageResponse)
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.commit()
    return MessageResponse(message="All notifications marked as read.")


@router.get("/push/public-key")
async def web_push_public_key(_: User = Depends(get_current_user)) -> dict:
    config = web_push_configuration()
    return {
        "enabled": config.enabled,
        "public_key": settings.vapid_public_key if config.enabled else None,
        "missing": list(config.missing),
    }


@router.post("/push/subscribe", response_model=MessageResponse)
async def subscribe_web_push(
    payload: BrowserPushSubscription,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    config = web_push_configuration()
    if not config.enabled:
        detail = "Web Push is not configured."
        if config.missing:
            detail = f"{detail} Missing: {', '.join(config.missing)}."
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)
    await upsert_push_subscription(
        db,
        user_id=current_user.id,
        endpoint=payload.endpoint,
        keys=payload.keys.model_dump(),
    )
    await db.commit()
    return MessageResponse(message="Web Push notifications enabled.")


@router.post("/push/unsubscribe", response_model=MessageResponse)
async def unsubscribe_web_push(
    payload: BrowserPushSubscription,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await remove_push_subscription(db, user_id=current_user.id, endpoint=payload.endpoint)
    await db.commit()
    return MessageResponse(message="Web Push notifications disabled.")


@router.patch("/{notification_id}/read", response_model=MessageResponse)
async def mark_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == current_user.id)
    )
    notification = result.scalar_one_or_none()
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    notification.is_read = True
    await db.commit()
    return MessageResponse(message="Notification marked as read.")


@router.post("/test", response_model=MessageResponse)
async def send_test_notification(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    title = "AgriScan notifications ready"
    body = "You will receive alerts after important crop scans and farm updates."
    notification = await create_notification(
        db,
        user_id=current_user.id,
        title=title,
        body=body,
        notification_type="system",
        payload={"url": "/settings/security"},
    )
    await db.commit()

    dispatch = await dispatch_push_to_user(
        db,
        user_id=current_user.id,
        title=title,
        body=body,
        url="/settings/security",
        payload={"notification_id": notification.id, "type": "system"},
    )
    if dispatch.sent:
        if dispatch.web_push_sent:
            return MessageResponse(message=f"Test notification saved. Web Push sent to {dispatch.web_push_sent} device(s).")
        return MessageResponse(message=f"Test notification saved. Realtime signal sent to {dispatch.realtime_sent} open device(s).")
    return MessageResponse(message="Test notification saved. Enable Web Push to receive alerts when AgriScan is closed.")
