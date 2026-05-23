from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_token
from app.models import Farm, User, UserAccountStatus
from app.services.account_security import account_status_message, effective_account_status

bearer_scheme = HTTPBearer(auto_error=False)
ACCOUNT_RESTRICTION_ALLOWED_SUFFIXES = (
    "/auth/me",
    "/account/status",
    "/account/appeals",
)


def _restriction_allowed_for_path(request: Request) -> bool:
    clean_path = request.url.path.rstrip("/")
    return any(clean_path.endswith(suffix) for suffix in ACCOUNT_RESTRICTION_ALLOWED_SUFFIXES)


def _account_restriction_detail(user: User) -> dict:
    status_value = effective_account_status(user)
    return {
        "code": "ACCOUNT_RESTRICTED",
        "account_status": status_value,
        "message": account_status_message(user),
    }


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token.")
    try:
        payload = decode_token(credentials.credentials, "access")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    if not payload.get("mfa", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="MFA verification required.")

    result = await db.execute(
        select(User).options(selectinload(User.role), selectinload(User.mfa_setting)).where(User.id == int(payload["sub"]))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive or missing user.")
    status_value = effective_account_status(user)
    if status_value == UserAccountStatus.disabled.value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive or missing user.")
    if status_value != UserAccountStatus.active.value and not _restriction_allowed_for_path(request):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_account_restriction_detail(user))
    return user


async def get_user_from_mfa_token(
    token: str,
    db: AsyncSession,
    expected_purpose: str | None = None,
) -> User:
    try:
        payload = decode_token(token, "mfa")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    if expected_purpose and payload.get("purpose") != expected_purpose:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA token purpose.")
    result = await db.execute(
        select(User).options(selectinload(User.role), selectinload(User.mfa_setting)).where(User.id == int(payload["sub"]))
    )
    user = result.scalar_one_or_none()
    if user is None or effective_account_status(user) == UserAccountStatus.disabled.value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive or missing user.")
    return user


def require_roles(*roles: str) -> Callable:
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        role_name = current_user.role.name
        if role_name not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions. Your current role is not allowed to perform this action.",
            )
        return current_user

    return checker


async def require_registered_farm_for_farmer(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    if current_user.role.name != "farmer":
        return current_user

    result = await db.execute(select(Farm.id).where(Farm.user_id == current_user.id).limit(1))
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "No farm record was found for this farmer account. "
                "Register your first farm before using Manual Scan or Disease Detector."
            ),
        )

    return current_user


def get_request_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
