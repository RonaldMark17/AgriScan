from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

TEXTBELT_SEND_URL = "https://textbelt.com/text"
TEXTBELT_PROVIDER = "textbelt"
FIREBASE_PROVIDER = "firebase"
DISABLED_PROVIDERS = {"", "none", "disabled", "off", "false"}
PUBLIC_TEXTBELT_KEYS = {"textbelt", "textbelt_test"}
E164_PATTERN = re.compile(r"^\+[1-9]\d{7,14}$")


@dataclass(slots=True)
class SmsDeliveryResult:
    attempted: bool = False
    sent: bool = False
    provider: str = TEXTBELT_PROVIDER
    test_mode: bool = False
    phone: str | None = None
    text_id: str | None = None
    quota_remaining: int | None = None
    error: str | None = None
    skipped_reason: str | None = None


@dataclass(frozen=True, slots=True)
class SmsConfiguration:
    provider: str
    enabled: bool
    test_mode: bool
    missing: tuple[str, ...] = ()


def normalize_phone_number(value: str | None) -> str | None:
    if value is None:
        return None

    raw = value.strip()
    if not raw:
        return None

    if raw.startswith("+"):
        digits = re.sub(r"\D", "", raw)
        return f"+{digits}" if digits else None

    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None

    if digits.startswith("00"):
        return f"+{digits[2:]}"
    if digits.startswith("09") and len(digits) == 11:
        return f"+63{digits[1:]}"
    if digits.startswith("9") and len(digits) == 10:
        return f"+63{digits}"
    if digits.startswith("63"):
        return f"+{digits}"

    return f"+{digits}"


def phone_number_is_valid(phone: str | None) -> bool:
    return bool(phone and E164_PATTERN.fullmatch(phone))


def sms_configuration() -> SmsConfiguration:
    provider = (settings.sms_provider or "").strip().lower()
    enabled = provider not in DISABLED_PROVIDERS
    test_mode = bool(settings.sms_test_mode)
    missing: list[str] = []

    if enabled and provider not in {TEXTBELT_PROVIDER, FIREBASE_PROVIDER}:
        missing.append("supported SMS provider")
    if enabled and provider == TEXTBELT_PROVIDER and not test_mode and not _configured_textbelt_key():
        missing.append("paid Textbelt API key")

    return SmsConfiguration(
        provider=provider or "disabled",
        enabled=enabled and not missing,
        test_mode=test_mode,
        missing=tuple(missing),
    )


def _raw_textbelt_key() -> str:
    return (settings.textbelt_api_key or settings.sms_api_key or "").strip()


def _configured_textbelt_key() -> str | None:
    key = _raw_textbelt_key()
    return key if key and key.lower() not in PUBLIC_TEXTBELT_KEYS else None


def _textbelt_key() -> str:
    key = _raw_textbelt_key() or "textbelt"
    if settings.sms_test_mode and key and not key.endswith("_test"):
        return f"{key}_test"
    return key


async def send_sms(phone: str | None, message: str, *, sender: str = "AgriScan") -> SmsDeliveryResult:
    normalized_phone = normalize_phone_number(phone)
    config = sms_configuration()
    result = SmsDeliveryResult(
        provider=config.provider,
        test_mode=config.test_mode,
        phone=normalized_phone,
    )

    if not config.enabled:
        result.skipped_reason = "sms_not_configured"
        if config.missing:
            result.error = (
                f"SMS is not configured: missing {', '.join(config.missing)}. "
                "Set SMS_API_KEY or TEXTBELT_API_KEY to a paid Textbelt key, then restart the backend."
            )
        return result
    if not phone_number_is_valid(normalized_phone):
        result.skipped_reason = "invalid_phone"
        result.error = "Use an E.164 phone number such as +639171234567."
        return result

    if config.provider != TEXTBELT_PROVIDER:
        result.skipped_reason = "unsupported_provider"
        if config.provider != FIREBASE_PROVIDER:
            result.error = f"Unsupported SMS provider: {config.provider}"
        return result

    payload: dict[str, Any] = {
        "phone": normalized_phone,
        "message": message,
        "key": _textbelt_key(),
        "sender": sender,
    }
    result.attempted = True

    try:
        async with httpx.AsyncClient(timeout=settings.sms_timeout_seconds) as client:
            response = await client.post(TEXTBELT_SEND_URL, data=payload)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        logger.warning("Textbelt SMS delivery failed for %s: %s", normalized_phone, exc)
        result.error = "SMS provider request failed."
        return result

    result.sent = bool(data.get("success"))
    result.text_id = str(data.get("textId")) if data.get("textId") is not None else None
    quota_remaining = data.get("quotaRemaining")
    result.quota_remaining = quota_remaining if isinstance(quota_remaining, int) else None
    result.error = str(data.get("error")) if data.get("error") else None
    if result.error and "free sms are disabled" in result.error.lower():
        result.error = (
            "Textbelt rejected the free SMS route for this country. "
            "Set SMS_API_KEY or TEXTBELT_API_KEY to a paid Textbelt key, then restart the backend."
        )
    if not result.sent and not result.error:
        result.error = "SMS provider did not accept the message."
    return result


async def send_password_reset_sms(user: Any, otp: str) -> SmsDeliveryResult:
    if not getattr(user, "phone_verified", False):
        return SmsDeliveryResult(skipped_reason="phone_not_verified", phone=normalize_phone_number(getattr(user, "phone", None)))
    return await send_sms(
        getattr(user, "phone", None),
        f"Your AgriScan password reset code is {otp}. It expires in 10 minutes.",
    )


async def send_field_alert_sms(user: Any, body: str) -> SmsDeliveryResult:
    if not getattr(user, "phone_verified", False):
        return SmsDeliveryResult(skipped_reason="phone_not_verified", phone=normalize_phone_number(getattr(user, "phone", None)))
    if not getattr(user, "sms_alerts_enabled", False):
        return SmsDeliveryResult(skipped_reason="sms_alerts_disabled", phone=normalize_phone_number(getattr(user, "phone", None)))

    sms_body = f"AgriScan field alert: {body} Reply STOP to opt out."
    return await send_sms(getattr(user, "phone", None), sms_body[:320])
