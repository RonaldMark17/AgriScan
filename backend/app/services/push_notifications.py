from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Notification, PushSubscription

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
    settings = get_settings()
    if not settings.vapid_private_key or not settings.vapid_public_key:
        logger.info("Skipping push notification because VAPID keys are not configured.")
        return PushDispatchResult(skipped_reason="vapid_not_configured")

    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("Skipping push notification because pywebpush is not installed.")
        return PushDispatchResult(skipped_reason="pywebpush_not_installed")

    result = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
    subscriptions = list(result.scalars().all())
    if not subscriptions:
        return PushDispatchResult(skipped_reason="no_subscriptions")

    message = {
        "title": title,
        "body": body,
        "url": url,
        **(payload or {}),
    }
    dispatch = PushDispatchResult(attempted=len(subscriptions))
    stale_subscriptions: list[PushSubscription] = []

    for subscription in subscriptions:
        subscription_info = _subscription_info(subscription)
        if subscription_info is None:
            dispatch.failed += 1
            stale_subscriptions.append(subscription)
            continue

        try:
            await asyncio.to_thread(
                webpush,
                subscription_info=subscription_info,
                data=json.dumps(message),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},
            )
            dispatch.sent += 1
        except WebPushException as exc:
            dispatch.failed += 1
            response = getattr(exc, "response", None)
            status_code = getattr(response, "status_code", None)
            if status_code in {404, 410}:
                stale_subscriptions.append(subscription)
            else:
                logger.info("Push notification failed for user %s: %s", user_id, exc)
        except Exception:
            dispatch.failed += 1
            logger.info("Push notification failed for user %s.", user_id, exc_info=True)

    if stale_subscriptions:
        for subscription in stale_subscriptions:
            await db.delete(subscription)
        await db.commit()

    return dispatch


def _subscription_info(subscription: PushSubscription) -> dict[str, Any] | None:
    keys = subscription.keys_json or {}
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")
    if not subscription.endpoint or not p256dh or not auth:
        return None
    return {
        "endpoint": subscription.endpoint,
        "keys": {
            "p256dh": str(p256dh),
            "auth": str(auth),
        },
    }
