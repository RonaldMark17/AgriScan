from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Notification, PushSubscription
from app.services.realtime_alerts import realtime_alert_hub

try:
    from pywebpush import WebPushException, webpush
except ImportError:  # pragma: no cover - optional dependency for deployments without Web Push.
    WebPushException = None
    webpush = None

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass(slots=True)
class PushDispatchResult:
    attempted: int = 0
    sent: int = 0
    failed: int = 0
    skipped_reason: str | None = None
    realtime_sent: int = 0
    web_push_attempted: int = 0
    web_push_sent: int = 0
    web_push_failed: int = 0


@dataclass(frozen=True, slots=True)
class WebPushConfiguration:
    enabled: bool
    missing: tuple[str, ...] = ()


def web_push_configuration() -> WebPushConfiguration:
    missing = []
    if webpush is None:
        missing.append("pywebpush")
    if not settings.vapid_public_key:
        missing.append("VAPID_PUBLIC_KEY")
    if not settings.vapid_private_key:
        missing.append("VAPID_PRIVATE_KEY")
    if not settings.vapid_subject:
        missing.append("VAPID_SUBJECT")
    return WebPushConfiguration(enabled=not missing, missing=tuple(missing))


def web_push_enabled() -> bool:
    return web_push_configuration().enabled


async def upsert_push_subscription(
    db: AsyncSession,
    *,
    user_id: int,
    endpoint: str,
    keys: dict[str, Any],
) -> PushSubscription:
    result = await db.execute(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    subscription = result.scalar_one_or_none()
    if subscription is None:
        subscription = PushSubscription(user_id=user_id, endpoint=endpoint, keys_json=keys)
        db.add(subscription)
    else:
        subscription.user_id = user_id
        subscription.keys_json = keys
    await db.flush()
    return subscription


async def remove_push_subscription(db: AsyncSession, *, user_id: int, endpoint: str) -> int:
    result = await db.execute(
        delete(PushSubscription).where(PushSubscription.user_id == user_id, PushSubscription.endpoint == endpoint)
    )
    await db.flush()
    return int(result.rowcount or 0)


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
    realtime_sent = await realtime_alert_hub.notify_user(user_id, realtime_payload)
    web_push_result = await _dispatch_web_push_to_user(
        db,
        user_id=user_id,
        title=title,
        body=body,
        url=url,
        payload=payload,
    )
    sent = realtime_sent + web_push_result.sent
    failed = web_push_result.failed
    attempted = realtime_sent + web_push_result.attempted
    skipped_reason = web_push_result.skipped_reason if not sent else None
    logger.info(
        "Notification for user %s saved; realtime=%s web_push=%s/%s failed=%s: %s",
        user_id,
        realtime_sent,
        web_push_result.sent,
        web_push_result.attempted,
        failed,
        title,
    )
    return PushDispatchResult(
        attempted=attempted,
        sent=sent,
        failed=failed,
        skipped_reason=skipped_reason,
        realtime_sent=realtime_sent,
        web_push_attempted=web_push_result.attempted,
        web_push_sent=web_push_result.sent,
        web_push_failed=web_push_result.failed,
    )


async def _dispatch_web_push_to_user(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    body: str,
    url: str,
    payload: dict[str, Any] | None = None,
) -> PushDispatchResult:
    if not web_push_enabled():
        return PushDispatchResult(skipped_reason="web_push_not_configured")

    result = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
    subscriptions = list(result.scalars().all())
    if not subscriptions:
        return PushDispatchResult(skipped_reason="no_web_push_subscriptions")

    data = json.dumps(
        {
            **(payload or {}),
            "title": title,
            "body": body,
            "url": url,
            "timestamp": payload.get("timestamp") if payload else None,
        },
        ensure_ascii=False,
    )
    vapid_claims = {"sub": settings.vapid_subject}
    dispatch_result = PushDispatchResult(attempted=len(subscriptions))
    stale_endpoints: list[str] = []

    for subscription in subscriptions:
        subscription_info = {
            "endpoint": subscription.endpoint,
            "keys": subscription.keys_json,
        }
        try:
            await asyncio.to_thread(
                webpush,
                subscription_info=subscription_info,
                data=data,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims=vapid_claims,
            )
            dispatch_result.sent += 1
        except Exception as exc:
            dispatch_result.failed += 1
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if WebPushException is not None and isinstance(exc, WebPushException) and status_code in {404, 410}:
                stale_endpoints.append(subscription.endpoint)
            logger.warning("Web Push delivery failed for user %s subscription %s: %s", user_id, subscription.id, exc)

    if stale_endpoints:
        await db.execute(delete(PushSubscription).where(PushSubscription.endpoint.in_(stale_endpoints)))
        await db.commit()

    if dispatch_result.sent == 0 and dispatch_result.failed == 0:
        dispatch_result.skipped_reason = "no_web_push_subscriptions"
    return dispatch_result
