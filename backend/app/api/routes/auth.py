from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import bearer_scheme, get_current_user, get_request_ip, get_user_from_mfa_token
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_mfa_token,
    create_refresh_token,
    decode_token,
    generate_otp,
    get_password_hash,
    hash_token,
    verify_password,
)
from app.models import DeviceLoginHistory, LoginAttempt, MFASetting, PasswordResetOTP, RefreshToken, Role, User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    MFADisableRequest,
    LogoutRequest,
    MFASetupResponse,
    MFASetupStartRequest,
    MFASetupVerifyRequest,
    MFASetupVerifyResponse,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    VerifyMFARequest,
)
from app.schemas.common import MessageResponse
from app.schemas.domain import UserRead
from app.services.audit import write_audit_log
from app.services.email import send_new_login_alert, send_password_reset_otp
from app.services.mfa import (
    build_otpauth_url,
    create_totp_secret,
    enable_mfa_and_issue_recovery_codes,
    get_user_mfa_secret,
    qr_code_data_url,
    upsert_mfa_secret,
    verify_recovery_code,
    verify_totp,
)
from app.services.rate_limiter import login_limiter, validate_captcha

router = APIRouter(prefix="/auth", tags=["authentication"])
settings = get_settings()


def _user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role.name,
        "mfa_enabled": bool(user.mfa_setting and user.mfa_setting.enabled),
    }


def _is_expired(timestamp: datetime | None) -> bool:
    if timestamp is None:
        return True
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    return timestamp < datetime.now(UTC)


async def _issue_token_pair(
    db: AsyncSession,
    user: User,
    request: Request | None,
    device_name: str | None = None,
) -> tuple[str, str]:
    access_token = create_access_token(user.id, user.role.name, mfa_verified=True)
    refresh_token = create_refresh_token(user.id, user.role.name)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            device_name=device_name,
            ip_address=get_request_ip(request) if request else None,
            user_agent=request.headers.get("user-agent") if request else None,
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    await db.flush()
    return access_token, refresh_token


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    if settings.use_secure_cookies:
        response.set_cookie(
            "agriscan_refresh",
            refresh_token,
            httponly=True,
            secure=True,
            samesite="strict",
            max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        )


async def _resolve_setup_user(
    payload_token: str | None,
    credentials: HTTPAuthorizationCredentials | None,
    db: AsyncSession,
) -> User:
    if payload_token:
        return await get_user_from_mfa_token(payload_token, db, expected_purpose="setup")
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing setup token or bearer token.")
    try:
        decoded = decode_token(credentials.credentials, "access")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    result = await db.execute(
        select(User).options(selectinload(User.role), selectinload(User.mfa_setting)).where(User.id == int(decoded["sub"]))
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive or missing user.")
    return user


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)) -> User:
    existing = await db.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered.")

    role_result = await db.execute(select(Role).where(Role.name == payload.role))
    role = role_result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Role seed data is missing.")

    user = User(
        email=payload.email.lower(),
        phone=payload.phone,
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        role_id=role.id,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user, ["role", "mfa_setting"])
    await write_audit_log(db, request, "user.registered", actor=user, resource_type="user", resource_id=user.id)
    await db.commit()
    return user


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    ip_address = get_request_ip(request)
    limiter_key = f"{payload.email.lower()}:{ip_address}"
    limit = login_limiter.check(limiter_key)
    if not limit.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {limit.retry_after_seconds} seconds.",
        )
    if limit.captcha_required and not validate_captcha(payload.captcha_token):
        return LoginResponse(status="captcha_required", captcha_required=True, message="CAPTCHA verification is required.")

    result = await db.execute(
        select(User).options(selectinload(User.role), selectinload(User.mfa_setting)).where(User.email == payload.email.lower())
    )
    user = result.scalar_one_or_none()
    success = bool(user and user.is_active and verify_password(payload.password, user.hashed_password))

    db.add(LoginAttempt(email=payload.email.lower(), ip_address=ip_address, success=success))
    db.add(
        DeviceLoginHistory(
            user_id=user.id if user else None,
            ip_address=ip_address,
            user_agent=request.headers.get("user-agent"),
            device_name=payload.device_name,
            success=success,
        )
    )

    if not success:
        login_limiter.record_failure(limiter_key)
        if user:
            user.failed_login_attempts += 1
            user.captcha_required = user.failed_login_attempts >= 3
        await write_audit_log(db, request, "auth.login_failed", actor=user, resource_type="user", resource_id=user.id if user else None)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    login_limiter.record_success(limiter_key)
    user.failed_login_attempts = 0
    user.captcha_required = False
    user.last_login_at = datetime.now(UTC)
    await write_audit_log(db, request, "auth.password_verified", actor=user, resource_type="user", resource_id=user.id)

    mfa_enabled = bool(user.mfa_setting and user.mfa_setting.enabled)
    role_requires_mfa = user.role.requires_mfa or (settings.require_admin_mfa and user.role.name == "admin")
    if role_requires_mfa and not mfa_enabled:
        setup_token = create_mfa_token(user.id, purpose="setup")
        await db.commit()
        return LoginResponse(status="mfa_setup_required", setup_token=setup_token, user=_user_payload(user))

    if mfa_enabled:
        mfa_token = create_mfa_token(user.id, purpose="challenge")
        await db.commit()
        return LoginResponse(status="mfa_required", mfa_token=mfa_token, user=_user_payload(user))

    access_token, refresh_token = await _issue_token_pair(db, user, request, payload.device_name)
    await send_new_login_alert(user.email, payload.device_name, ip_address)
    await write_audit_log(db, request, "auth.login_success", actor=user, resource_type="user", resource_id=user.id)
    await db.commit()
    _set_refresh_cookie(response, refresh_token)
    return LoginResponse(status="ok", access_token=access_token, refresh_token=refresh_token, user=_user_payload(user))


@router.post("/mfa/verify", response_model=LoginResponse)
async def verify_mfa(
    payload: VerifyMFARequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    user = await get_user_from_mfa_token(payload.mfa_token, db, expected_purpose="challenge")
    secret = get_user_mfa_secret(user)
    code_ok = bool(secret and verify_totp(secret, payload.code))
    if not code_ok:
        code_ok = await verify_recovery_code(db, user, payload.code)
    if not code_ok:
        await write_audit_log(db, request, "auth.mfa_failed", actor=user, resource_type="user", resource_id=user.id)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authenticator or recovery code.")

    user.last_login_at = datetime.now(UTC)
    access_token, refresh_token = await _issue_token_pair(db, user, request, payload.device_name)
    await send_new_login_alert(user.email, payload.device_name, get_request_ip(request))
    await write_audit_log(db, request, "auth.mfa_success", actor=user, resource_type="user", resource_id=user.id)
    await db.commit()
    _set_refresh_cookie(response, refresh_token)
    return LoginResponse(status="ok", access_token=access_token, refresh_token=refresh_token, user=_user_payload(user))


@router.post("/refresh", response_model=TokenPair)
async def refresh_token(payload: RefreshRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> TokenPair:
    try:
        decoded = decode_token(payload.refresh_token, "refresh")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_token(payload.refresh_token), RefreshToken.revoked_at.is_(None))
        .order_by(desc(RefreshToken.created_at))
    )
    stored = result.scalar_one_or_none()
    if stored is None or _is_expired(stored.expires_at):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is invalid or expired.")

    user_result = await db.execute(
        select(User).options(selectinload(User.role), selectinload(User.mfa_setting)).where(User.id == int(decoded["sub"]))
    )
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive or missing user.")

    stored.revoked_at = datetime.now(UTC)
    access_token, new_refresh_token = await _issue_token_pair(db, user, request, stored.device_name)
    await write_audit_log(db, request, "auth.token_refreshed", actor=user, resource_type="user", resource_id=user.id)
    await db.commit()
    _set_refresh_cookie(response, new_refresh_token)
    return TokenPair(access_token=access_token, refresh_token=new_refresh_token)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    payload: LogoutRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if payload.refresh_token:
        result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(payload.refresh_token)))
        stored = result.scalar_one_or_none()
        if stored and stored.user_id == current_user.id:
            stored.revoked_at = datetime.now(UTC)
    response.delete_cookie("agriscan_refresh")
    await db.commit()
    return MessageResponse(message="Logged out.")


@router.get("/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(payload: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    result = await db.execute(select(User).options(selectinload(User.role)).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()
    if user:
        otp = generate_otp()
        db.add(
            PasswordResetOTP(
                user_id=user.id,
                otp_hash=get_password_hash(otp),
                expires_at=datetime.now(UTC) + timedelta(minutes=10),
            )
        )
        await send_password_reset_otp(user.email, otp)
        await write_audit_log(db, request, "auth.password_reset_requested", actor=user, resource_type="user", resource_id=user.id)
        await db.commit()
    return MessageResponse(message="If the account exists, a password reset code has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: PasswordResetRequest, request: Request, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    result = await db.execute(select(User).options(selectinload(User.role)).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP.")

    otp_result = await db.execute(
        select(PasswordResetOTP)
        .where(
            PasswordResetOTP.user_id == user.id,
            PasswordResetOTP.used_at.is_(None),
            PasswordResetOTP.expires_at >= datetime.now(UTC),
        )
        .order_by(desc(PasswordResetOTP.created_at))
    )
    otp = otp_result.scalar_one_or_none()
    if otp is None or otp.attempts >= 5 or not verify_password(payload.otp, otp.otp_hash):
        if otp:
            otp.attempts += 1
            await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP.")

    otp.used_at = datetime.now(UTC)
    user.hashed_password = get_password_hash(payload.new_password)
    token_result = await db.execute(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)))
    for token in token_result.scalars().all():
        token.revoked_at = datetime.now(UTC)
    await write_audit_log(db, request, "auth.password_reset_completed", actor=user, resource_type="user", resource_id=user.id)
    await db.commit()
    return MessageResponse(message="Password has been reset. Please log in again.")


@router.post("/mfa/setup", response_model=MFASetupResponse)
async def start_mfa_setup(
    payload: MFASetupStartRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> MFASetupResponse:
    user = await _resolve_setup_user(payload.setup_token, credentials, db)
    secret = create_totp_secret()
    await upsert_mfa_secret(db, user, secret)
    await db.commit()
    otpauth_url = build_otpauth_url(user, secret)
    return MFASetupResponse(secret=secret, otpauth_url=otpauth_url, qr_code_data_url=qr_code_data_url(otpauth_url))


@router.post("/mfa/verify-setup", response_model=MFASetupVerifyResponse)
async def verify_mfa_setup(
    payload: MFASetupVerifyRequest,
    request: Request,
    response: Response,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> MFASetupVerifyResponse:
    user = await _resolve_setup_user(payload.setup_token, credentials, db)
    secret = get_user_mfa_secret(user)
    if not secret or not verify_totp(secret, payload.code):
        await write_audit_log(db, request, "auth.mfa_setup_failed", actor=user, resource_type="user", resource_id=user.id)
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authenticator code.")

    recovery_codes = await enable_mfa_and_issue_recovery_codes(db, user)
    access_token = refresh_token = None
    if payload.setup_token:
        access_token, refresh_token = await _issue_token_pair(db, user, request)
        _set_refresh_cookie(response, refresh_token)
    await write_audit_log(db, request, "auth.mfa_enabled", actor=user, resource_type="user", resource_id=user.id)
    await db.commit()
    return MFASetupVerifyResponse(
        message="MFA enabled. Save recovery codes in a secure place.",
        recovery_codes=recovery_codes,
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/mfa/disable", response_model=MessageResponse)
async def disable_mfa(
    payload: MFADisableRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if current_user.role.requires_mfa:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your role requires MFA.")
    secret = get_user_mfa_secret(current_user)
    code_ok = bool(secret and verify_totp(secret, payload.code))
    if not code_ok:
        code_ok = await verify_recovery_code(db, current_user, payload.code)
    if not code_ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA or recovery code.")
    if current_user.mfa_setting:
        current_user.mfa_setting.enabled = False
    await write_audit_log(db, request, "auth.mfa_disabled", actor=current_user, resource_type="user", resource_id=current_user.id)
    await db.commit()
    return MessageResponse(message="MFA disabled.")
