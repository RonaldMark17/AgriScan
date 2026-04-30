from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification
from app.services.realtime_alerts import realtime_alert_hub

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class PushDispatchResult:
    attempted: int = 0
    sent: int = 0
    failed: int = 0
    skipped_reason: str | None = None


async def create_notification(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    body: str,
    notification_type: str = "system",
    payload: dict[str, Any] | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        title=title[:160],
        body=body,
        type=notification_type,
        payload=payload,
    )
    db.add(notification)
    await db.flush()
    return notification


async def dispatch_push_to_user(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    body: str,
    url: str = "/",
    payload: dict[str, Any] | None = None,
) -> PushDispatchResult:
    realtime_payload = {
        "type": "notifications.changed",
        "title": title,
        "body": body,
        "url": url,
        "payload": payload or {},
    }
    sent = await realtime_alert_hub.notify_user(user_id, realtime_payload)
    logger.info(
        "Notification for user %s saved; realtime signal sent to %s connection(s): %s",
        user_id,
        sent,
        title,
    )
    return PushDispatchResult(attempted=sent, sent=sent, skipped_reason="manual_service_worker" if not sent else None)
