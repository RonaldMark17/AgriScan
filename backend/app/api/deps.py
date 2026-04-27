from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_token
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
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
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive or missing user.")
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
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive or missing user.")
    return user


def require_roles(*roles: str) -> Callable:
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        role_name = current_user.role.name
        if role_name not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")
        return current_user

    return checker


def get_request_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
