import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Notification, User
from app.schemas.common import MessageResponse
from app.schemas.domain import NotificationRead
from app.services.push_notifications import (
    create_notification,
    dispatch_push_to_user,
    firebase_push_configuration,
    remove_push_subscription,
    upsert_push_subscription,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


class FirebasePushSubscription(BaseModel):
    token: str = Field(min_length=1, max_length=700)


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


def _firebase_push_config_payload() -> dict:
    config = firebase_push_configuration()
    return {
        "provider": "firebase",
        "enabled": config.enabled,
        "firebase_config": config.client_config if config.enabled else None,
        "vapid_key": config.vapid_key if config.enabled else None,
        "missing": list(config.missing),
    }


@router.get("/push/firebase-sw-config.js", include_in_schema=False)
async def firebase_sw_config() -> Response:
    config = firebase_push_configuration()
    content = (
        "self.AGRISCAN_FIREBASE_PUSH_CONFIG = "
        f"{json.dumps(_firebase_push_config_payload(), ensure_ascii=False)};\n"
        f"self.AGRISCAN_FIREBASE_PUSH_ENABLED = {json.dumps(config.enabled)};\n"
    )
    return Response(
        content=content,
        media_type="application/javascript",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/push/config")
async def firebase_push_config(_: User = Depends(get_current_user)) -> dict:
    return _firebase_push_config_payload()


@router.get("/push/public-key")
async def legacy_push_public_key(_: User = Depends(get_current_user)) -> dict:
    return _firebase_push_config_payload()


@router.post("/push/subscribe", response_model=MessageResponse)
async def subscribe_firebase_push(
    payload: FirebasePushSubscription,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    config = firebase_push_configuration()
    if not config.enabled:
        detail = "Firebase push is not configured."
        if config.missing:
            detail = f"{detail} Missing: {', '.join(config.missing)}."
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)
    await upsert_push_subscription(
        db,
        user_id=current_user.id,
        token=payload.token,
    )
    await db.commit()
    return MessageResponse(message="Firebase push notifications enabled.")


@router.post("/push/unsubscribe", response_model=MessageResponse)
async def unsubscribe_firebase_push(
    payload: FirebasePushSubscription,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await remove_push_subscription(db, user_id=current_user.id, token=payload.token)
    await db.commit()
    return MessageResponse(message="Firebase push notifications disabled.")


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
        if dispatch.firebase_sent:
            return MessageResponse(message=f"Test notification saved. Firebase push sent to {dispatch.firebase_sent} device(s).")
        return MessageResponse(message=f"Test notification saved. Realtime signal sent to {dispatch.realtime_sent} open device(s).")
    return MessageResponse(message="Test notification saved. Enable Firebase push to receive alerts when AgriScan is closed.")
