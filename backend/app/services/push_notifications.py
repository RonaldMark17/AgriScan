from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Notification, PushSubscription
from app.services.realtime_alerts import realtime_alert_hub

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
except ImportError:  # pragma: no cover - Firebase is configured only in push-enabled deployments.
    firebase_admin = None
    credentials = None
    messaging = None

logger = logging.getLogger(__name__)
settings = get_settings()
FCM_PROVIDER = "firebase"


@dataclass(slots=True)
class PushDispatchResult:
    attempted: int = 0
    sent: int = 0
    failed: int = 0
    skipped_reason: str | None = None
    realtime_sent: int = 0
    firebase_attempted: int = 0
    firebase_sent: int = 0
    firebase_failed: int = 0


@dataclass(frozen=True, slots=True)
class FirebasePushConfiguration:
    enabled: bool
    missing: tuple[str, ...] = ()
    client_config: dict[str, str] | None = None
    vapid_key: str | None = None


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _service_account_path() -> Path | None:
    return settings.firebase_service_account_path


def _firebase_client_config() -> dict[str, str]:
    config = {
        "apiKey": _clean(settings.firebase_api_key),
        "authDomain": _clean(settings.firebase_auth_domain),
        "projectId": _clean(settings.firebase_project_id),
        "messagingSenderId": _clean(settings.firebase_messaging_sender_id),
        "appId": _clean(settings.firebase_app_id),
        "measurementId": _clean(settings.firebase_measurement_id),
    }
    return {key: value for key, value in config.items() if value}


def firebase_push_configuration() -> FirebasePushConfiguration:
    client_config = _firebase_client_config()
    missing: list[str] = []

    if firebase_admin is None or credentials is None or messaging is None:
        missing.append("firebase-admin")

    for env_name, config_key in {
        "FIREBASE_API_KEY": "apiKey",
        "FIREBASE_PROJECT_ID": "projectId",
        "FIREBASE_MESSAGING_SENDER_ID": "messagingSenderId",
        "FIREBASE_APP_ID": "appId",
    }.items():
        if not client_config.get(config_key):
            missing.append(env_name)

    vapid_key = _clean(settings.firebase_vapid_key)
    if not vapid_key:
        missing.append("FIREBASE_VAPID_KEY")

    service_account_json = _clean(settings.firebase_service_account_json)
    service_account_path = _service_account_path()
    if service_account_json:
        try:
            json.loads(service_account_json)
        except json.JSONDecodeError:
            missing.append("FIREBASE_SERVICE_ACCOUNT_JSON")
    elif service_account_path is None:
        missing.append("FIREBASE_SERVICE_ACCOUNT_FILE or FIREBASE_SERVICE_ACCOUNT_JSON")
    elif service_account_path is not None and not service_account_path.is_file():
        missing.append("FIREBASE_SERVICE_ACCOUNT_FILE")

    return FirebasePushConfiguration(
        enabled=not missing,
        missing=tuple(missing),
        client_config=client_config,
        vapid_key=vapid_key,
    )


def firebase_push_enabled() -> bool:
    return firebase_push_configuration().enabled


@lru_cache
def _firebase_app():
    config = firebase_push_configuration()
    if not config.enabled or firebase_admin is None or credentials is None:
        return None

    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    try:
        service_account_json = _clean(settings.firebase_service_account_json)
        if service_account_json:
            try:
                certificate_data = json.loads(service_account_json)
            except json.JSONDecodeError:
                logger.exception("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.")
                return None
            credential = credentials.Certificate(certificate_data)
        else:
            service_account_path = _service_account_path()
            if service_account_path is None:
                return None
            credential = credentials.Certificate(str(service_account_path))

        return firebase_admin.initialize_app(credential, {"projectId": settings.firebase_project_id})
    except Exception as exc:
        logger.exception("Firebase Admin could not initialize; push delivery will be skipped.", exc_info=exc)
        return None


async def upsert_push_subscription(
    db: AsyncSession,
    *,
    user_id: int,
    token: str,
) -> PushSubscription:
    result = await db.execute(select(PushSubscription).where(PushSubscription.endpoint == token))
    subscription = result.scalar_one_or_none()
    keys_json = {"provider": FCM_PROVIDER}
    if subscription is None:
        subscription = PushSubscription(user_id=user_id, endpoint=token, keys_json=keys_json)
        db.add(subscription)
    else:
        subscription.user_id = user_id
        subscription.keys_json = keys_json
    await db.flush()
    return subscription


async def remove_push_subscription(db: AsyncSession, *, user_id: int, token: str) -> int:
    result = await db.execute(
        delete(PushSubscription).where(PushSubscription.user_id == user_id, PushSubscription.endpoint == token)
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
    try:
        firebase_result = await _dispatch_firebase_push_to_user(
            db,
            user_id=user_id,
            title=title,
            body=body,
            url=url,
            payload=payload,
        )
    except Exception as exc:
        logger.exception("Firebase push dispatch failed for user %s; continuing without push delivery.", user_id, exc_info=exc)
        firebase_result = PushDispatchResult(attempted=1, failed=1, skipped_reason="firebase_dispatch_failed")
    sent = realtime_sent + firebase_result.sent
    failed = firebase_result.failed
    attempted = realtime_sent + firebase_result.attempted
    skipped_reason = firebase_result.skipped_reason if not sent else None
    logger.info(
        "Notification for user %s saved; realtime=%s firebase=%s/%s failed=%s: %s",
        user_id,
        realtime_sent,
        firebase_result.sent,
        firebase_result.attempted,
        failed,
        title,
    )
    return PushDispatchResult(
        attempted=attempted,
        sent=sent,
        failed=failed,
        skipped_reason=skipped_reason,
        realtime_sent=realtime_sent,
        firebase_attempted=firebase_result.attempted,
        firebase_sent=firebase_result.sent,
        firebase_failed=firebase_result.failed,
    )


def _notification_data(*, title: str, body: str, url: str, payload: dict[str, Any] | None) -> dict[str, str]:
    data: dict[str, str] = {
        "title": title,
        "body": body,
        "url": url,
        "tag": str((payload or {}).get("notification_id") or (payload or {}).get("type") or "agriscan-notification"),
    }
    for key, value in (payload or {}).items():
        if value is None:
            continue
        if isinstance(value, (dict, list)):
            data[key] = json.dumps(value, ensure_ascii=False)
        else:
            data[key] = str(value)
    return data


def _is_stale_firebase_token_error(exc: Exception) -> bool:
    error_name = exc.__class__.__name__
    error_text = str(exc).lower()
    return error_name in {"UnregisteredError", "SenderIdMismatchError"} or "registration-token-not-registered" in error_text


async def _dispatch_firebase_push_to_user(
    db: AsyncSession,
    *,
    user_id: int,
    title: str,
    body: str,
    url: str,
    payload: dict[str, Any] | None = None,
) -> PushDispatchResult:
    if not firebase_push_enabled():
        return PushDispatchResult(skipped_reason="firebase_not_configured")

    app = _firebase_app()
    if app is None or messaging is None:
        return PushDispatchResult(skipped_reason="firebase_not_initialized")

    result = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
    subscriptions = [
        subscription
        for subscription in result.scalars().all()
        if isinstance(subscription.keys_json, dict) and subscription.keys_json.get("provider") == FCM_PROVIDER
    ]
    if not subscriptions:
        return PushDispatchResult(skipped_reason="no_firebase_tokens")

    data = _notification_data(title=title, body=body, url=url, payload=payload)
    dispatch_result = PushDispatchResult(attempted=len(subscriptions))
    stale_tokens: list[str] = []

    for subscription in subscriptions:
        message = messaging.Message(
            token=subscription.endpoint,
            data=data,
            webpush=messaging.WebpushConfig(headers={"TTL": "86400"}),
        )
        try:
            await asyncio.to_thread(messaging.send, message, app=app)
            dispatch_result.sent += 1
        except Exception as exc:
            dispatch_result.failed += 1
            if _is_stale_firebase_token_error(exc):
                stale_tokens.append(subscription.endpoint)
            logger.warning("Firebase push delivery failed for user %s subscription %s: %s", user_id, subscription.id, exc)

    if stale_tokens:
        await db.execute(delete(PushSubscription).where(PushSubscription.endpoint.in_(stale_tokens)))
        await db.commit()

    if dispatch_result.sent == 0 and dispatch_result.failed == 0:
        dispatch_result.skipped_reason = "no_firebase_tokens"
    return dispatch_result
