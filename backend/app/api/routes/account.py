from datetime import UTC, datetime, timedelta
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import generate_otp, get_password_hash, verify_password
from app.models import AppealRequest, Role, User, UserAccountStatus
from app.schemas.common import MessageResponse
from app.schemas.domain import AccountStatusRead, AppealRequestCreate, UserRead
from app.services.account_security import (
    account_status_message,
    effective_account_status,
    latest_active_suspension,
    latest_pending_appeal,
    record_security_event,
)
from app.services.audit import write_audit_log
from app.services.push_notifications import create_notification
from app.services.push_notifications import verify_firebase_id_token
from app.services.sms import (
    normalize_phone_number,
    phone_number_is_valid,
    send_sms,
    sms_configuration,
)

router = APIRouter(prefix="/account", tags=["account security"])
PHONE_VERIFICATION_CODE_MINUTES = 10
PHONE_VERIFICATION_COOLDOWN_SECONDS = 60
PHONE_VERIFICATION_MAX_ATTEMPTS = 5


class PhoneUpdateRequest(BaseModel):
    phone: str | None = Field(default=None, max_length=32)


class PhoneVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class FirebasePhoneVerifyRequest(BaseModel):
    id_token: str = Field(min_length=20)


class PhoneVerificationSendResponse(BaseModel):
    message: str
    test_mode: bool = False
    debug_code: str | None = None


class SmsAlertPreferenceRequest(BaseModel):
    enabled: bool


class SmsStatusResponse(BaseModel):
    provider: str
    available: bool
    test_mode: bool
    missing: list[str]
    phone: str | None
    phone_verified: bool
    phone_verified_at: datetime | None = None
    sms_alerts_enabled: bool
    cooldown_seconds: int = 0
    verification_expires_at: datetime | None = None


def _as_utc(timestamp: datetime | None) -> datetime | None:
    if timestamp is None:
        return None
    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=UTC)
    return timestamp.astimezone(UTC)


def _verification_cooldown_seconds(user: User) -> int:
    sent_at = _as_utc(user.phone_verification_sent_at)
    if sent_at is None:
        return 0
    return max(0, PHONE_VERIFICATION_COOLDOWN_SECONDS - ceil((datetime.now(UTC) - sent_at).total_seconds()))


def _clear_phone_verification_challenge(user: User) -> None:
    user.phone_verification_otp_hash = None
    user.phone_verification_expires_at = None
    user.phone_verification_attempts = 0


def _reset_phone_verification(user: User) -> None:
    user.phone_verified = False
    user.phone_verified_at = None
    user.sms_alerts_enabled = False
    _clear_phone_verification_challenge(user)
    user.phone_verification_sent_at = None


def _sms_status_payload(user: User) -> SmsStatusResponse:
    config = sms_configuration()
    return SmsStatusResponse(
        provider=config.provider,
        available=config.enabled,
        test_mode=config.test_mode,
        missing=list(config.missing),
        phone=user.phone,
        phone_verified=bool(user.phone_verified),
        phone_verified_at=user.phone_verified_at,
        sms_alerts_enabled=bool(user.sms_alerts_enabled),
        cooldown_seconds=_verification_cooldown_seconds(user),
        verification_expires_at=user.phone_verification_expires_at,
    )


@router.get("/status", response_model=AccountStatusRead)
async def account_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    suspension = await latest_active_suspension(db, current_user.id)
    pending_appeal = await latest_pending_appeal(db, current_user.id)
    return {
        "account_status": effective_account_status(current_user),
        "account_status_until": current_user.account_status_until,
        "message": account_status_message(current_user),
        "suspension": suspension,
        "pending_appeal": pending_appeal,
    }


@router.get("/sms/status", response_model=SmsStatusResponse)
async def sms_status(current_user: User = Depends(get_current_user)) -> SmsStatusResponse:
    return _sms_status_payload(current_user)


@router.patch("/phone", response_model=UserRead)
async def update_phone_number(
    payload: PhoneUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    normalized_phone = normalize_phone_number(payload.phone)
    if payload.phone and not phone_number_is_valid(normalized_phone):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use a valid phone number such as +639171234567.")

    if normalized_phone != current_user.phone:
        current_user.phone = normalized_phone
        _reset_phone_verification(current_user)
        await write_audit_log(db, request, "account.phone_updated", actor=current_user, resource_type="user", resource_id=current_user.id)
        await db.commit()
        await db.refresh(current_user, ["role"])
    return current_user


@router.post("/phone/send-code", response_model=PhoneVerificationSendResponse)
async def send_phone_verification_code(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PhoneVerificationSendResponse:
    normalized_phone = normalize_phone_number(current_user.phone)
    if not phone_number_is_valid(normalized_phone):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Add a valid phone number such as +639171234567 before requesting a code.")

    cooldown_seconds = _verification_cooldown_seconds(current_user)
    if cooldown_seconds > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {cooldown_seconds} seconds before requesting another SMS code.",
            headers={"Retry-After": str(cooldown_seconds)},
        )

    code = generate_otp()
    delivery = await send_sms(
        normalized_phone,
        f"Your AgriScan phone verification code is {code}. It expires in {PHONE_VERIFICATION_CODE_MINUTES} minutes.",
    )
    if not delivery.sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=delivery.error or "SMS verification code could not be sent right now.",
        )

    current_user.phone = normalized_phone
    current_user.phone_verification_otp_hash = get_password_hash(code)
    current_user.phone_verification_expires_at = datetime.now(UTC) + timedelta(minutes=PHONE_VERIFICATION_CODE_MINUTES)
    current_user.phone_verification_attempts = 0
    current_user.phone_verification_sent_at = datetime.now(UTC)
    await write_audit_log(db, request, "account.phone_verification_sent", actor=current_user, resource_type="user", resource_id=current_user.id)
    await db.commit()

    debug_code = code if delivery.test_mode and get_settings().environment != "production" else None
    message = (
        "Test SMS accepted. Use the displayed development code to verify this phone."
        if debug_code
        else "Verification code sent by SMS."
    )
    return PhoneVerificationSendResponse(message=message, test_mode=delivery.test_mode, debug_code=debug_code)


@router.post("/phone/verify", response_model=UserRead)
async def verify_phone_number(
    payload: PhoneVerifyRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    expires_at = _as_utc(current_user.phone_verification_expires_at)
    if not current_user.phone_verification_otp_hash or expires_at is None or expires_at < datetime.now(UTC):
        _clear_phone_verification_challenge(current_user)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone verification code is invalid or expired.")
    if current_user.phone_verification_attempts >= PHONE_VERIFICATION_MAX_ATTEMPTS:
        _clear_phone_verification_challenge(current_user)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many phone verification attempts. Request a new code.")
    if not verify_password(payload.code, current_user.phone_verification_otp_hash):
        current_user.phone_verification_attempts += 1
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone verification code is incorrect.")

    current_user.phone_verified = True
    current_user.phone_verified_at = datetime.now(UTC)
    current_user.sms_alerts_enabled = True
    _clear_phone_verification_challenge(current_user)
    await write_audit_log(db, request, "account.phone_verified", actor=current_user, resource_type="user", resource_id=current_user.id)
    await db.commit()
    await db.refresh(current_user, ["role"])
    return current_user


@router.post("/phone/verify-firebase", response_model=UserRead)
async def verify_phone_number_with_firebase(
    payload: FirebasePhoneVerifyRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    normalized_phone = normalize_phone_number(current_user.phone)
    if not phone_number_is_valid(normalized_phone):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Add a valid phone number such as +639171234567 before verifying with Firebase.")

    try:
        decoded_token = verify_firebase_id_token(payload.id_token)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Firebase phone verification could not be confirmed.") from exc

    firebase_phone = normalize_phone_number(str(decoded_token.get("phone_number") or ""))
    if firebase_phone != normalized_phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Firebase verified a different phone number.")

    current_user.phone = normalized_phone
    current_user.phone_verified = True
    current_user.phone_verified_at = datetime.now(UTC)
    current_user.sms_alerts_enabled = False
    _clear_phone_verification_challenge(current_user)
    await write_audit_log(db, request, "account.phone_verified_firebase", actor=current_user, resource_type="user", resource_id=current_user.id)
    await db.commit()
    await db.refresh(current_user, ["role"])
    return current_user


@router.patch("/sms-alerts", response_model=UserRead)
async def update_sms_alert_preference(
    payload: SmsAlertPreferenceRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    if payload.enabled and not current_user.phone_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verify your phone number before enabling SMS alerts.")
    current_user.sms_alerts_enabled = payload.enabled
    await write_audit_log(
        db,
        request,
        "account.sms_alerts_updated",
        actor=current_user,
        resource_type="user",
        resource_id=current_user.id,
        metadata={"enabled": payload.enabled},
    )
    await db.commit()
    await db.refresh(current_user, ["role"])
    return current_user


@router.post("/sms/test", response_model=MessageResponse)
async def send_test_sms(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if not current_user.phone_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verify your phone number before sending a test SMS.")
    if not current_user.sms_alerts_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enable SMS alerts before sending a test SMS.")

    delivery = await send_sms(
        current_user.phone,
        "AgriScan SMS alerts are ready. You will receive urgent crop and account notices here. Reply STOP to opt out.",
    )
    if not delivery.sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=delivery.error or "Test SMS could not be sent right now.",
        )
    await write_audit_log(db, request, "account.sms_test_sent", actor=current_user, resource_type="user", resource_id=current_user.id)
    await db.commit()
    if delivery.test_mode and get_settings().environment != "production":
        return MessageResponse(message="Test SMS accepted in development mode. Set SMS_TEST_MODE=false to deliver real SMS.")
    return MessageResponse(message="Test SMS sent.")


@router.post("/appeals", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def submit_appeal(
    payload: AppealRequestCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    status_value = effective_account_status(current_user)
    if status_value == UserAccountStatus.active.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only restricted accounts can submit an appeal.")
    if status_value == UserAccountStatus.disabled.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Disabled accounts must contact an administrator directly.")

    pending = await latest_pending_appeal(db, current_user.id)
    if pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A review request is already pending.")

    suspension = await latest_active_suspension(db, current_user.id)
    appeal = AppealRequest(
        user_id=current_user.id,
        suspension_log_id=suspension.id if suspension else None,
        explanation=payload.explanation,
        supporting_message=payload.supporting_message,
        updated_information=payload.updated_information,
    )
    db.add(appeal)
    await db.flush()

    await record_security_event(
        db,
        request,
        event_type="appeal_submitted",
        severity="info",
        user=current_user,
        email=current_user.email,
        metadata={"appeal_id": appeal.id, "account_status": status_value},
    )
    await write_audit_log(
        db,
        request,
        "account.appeal_submitted",
        actor=current_user,
        resource_type="appeal_request",
        resource_id=appeal.id,
        metadata={"account_status": status_value},
    )

    admin_result = await db.execute(select(User).join(Role, Role.id == User.role_id).where(Role.name == "admin", User.is_active.is_(True)))
    for admin in admin_result.scalars().all():
        await create_notification(
            db,
            user_id=admin.id,
            title="Suspension appeal pending",
            body=f"{current_user.full_name} submitted an account review request.",
            notification_type="appeal_pending",
            payload={"type": "appeal_pending", "url": "/admin/users", "appeal_id": appeal.id},
        )

    await db.commit()
    return MessageResponse(message="Your appeal request has been submitted for administrator review.")
