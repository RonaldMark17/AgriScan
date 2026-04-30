from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Notification, PushSubscription, User
from app.schemas.common import MessageResponse
from app.schemas.domain import NotificationRead, PushSubscriptionRequest
from app.services.push_notifications import create_notification, dispatch_push_to_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
async def list_notifications(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[Notification]:
    result = await db.execute(
        select(Notification).where(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).limit(100)
    )
    return list(result.scalars().all())


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


@router.post("/push/subscribe", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def subscribe_push(
    payload: PushSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if not payload.keys.get("p256dh") or not payload.keys.get("auth"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Push subscription keys are incomplete.")

    result = await db.execute(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
    subscription = result.scalar_one_or_none()
    if subscription is None:
        subscription = PushSubscription(user_id=current_user.id, endpoint=payload.endpoint, keys_json=payload.keys)
        db.add(subscription)
    else:
        subscription.user_id = current_user.id
        subscription.keys_json = payload.keys
    await db.commit()
    return MessageResponse(message="Push subscription saved.")


@router.post("/push/test", response_model=MessageResponse)
async def send_test_push(
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
        return MessageResponse(message=f"Test notification saved and sent to {dispatch.sent} device(s).")
    if dispatch.skipped_reason == "vapid_not_configured":
        return MessageResponse(message="Test notification saved. Manual browser notifications do not need VAPID keys.")
    if dispatch.skipped_reason == "pywebpush_not_installed":
        return MessageResponse(message="Test notification saved. Manual browser notifications are available in the web app.")
    if dispatch.skipped_reason == "no_subscriptions":
        return MessageResponse(message="Test notification saved. AgriScan will show it while the web app is open.")
    return MessageResponse(message="Test notification saved, but no browser push was delivered.")
