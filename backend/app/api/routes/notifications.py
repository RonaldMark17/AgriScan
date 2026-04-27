from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Notification, PushSubscription, User
from app.schemas.common import MessageResponse
from app.schemas.domain import NotificationRead, PushSubscriptionRequest

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
