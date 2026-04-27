import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from cryptography.fernet import Fernet
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def validate_strong_password(password: str) -> list[str]:
    errors: list[str] = []
    if len(password) < 12:
        errors.append("Password must be at least 12 characters.")
    if not any(char.islower() for char in password):
        errors.append("Password must include a lowercase letter.")
    if not any(char.isupper() for char in password):
        errors.append("Password must include an uppercase letter.")
    if not any(char.isdigit() for char in password):
        errors.append("Password must include a number.")
    if not any(not char.isalnum() for char in password):
        errors.append("Password must include a symbol.")
    return errors


def _secret_for_token(token_type: str) -> str:
    return settings.refresh_secret_key if token_type == "refresh" else settings.secret_key


def create_token(
    subject: str,
    token_type: str,
    expires_delta: timedelta,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": now + expires_delta,
        "jti": secrets.token_urlsafe(16),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, _secret_for_token(token_type), algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, _secret_for_token(expected_type), algorithms=[ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid or expired token.") from exc
    if payload.get("type") != expected_type:
        raise ValueError("Invalid token type.")
    return payload


def create_access_token(user_id: int, role: str, mfa_verified: bool = True) -> str:
    return create_token(
        subject=str(user_id),
        token_type="access",
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        extra_claims={"role": role, "mfa": mfa_verified},
    )


def create_mfa_token(user_id: int, purpose: str = "challenge") -> str:
    return create_token(
        subject=str(user_id),
        token_type="mfa",
        expires_delta=timedelta(minutes=5),
        extra_claims={"purpose": purpose},
    )


def create_refresh_token(user_id: int, role: str) -> str:
    return create_token(
        subject=str(user_id),
        token_type="refresh",
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
        extra_claims={"role": role},
    )


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_otp(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


def _fernet() -> Fernet:
    if settings.fernet_key:
        key = settings.fernet_key.encode("utf-8")
    else:
        digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
        key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(secret: str) -> bytes:
    return _fernet().encrypt(secret.encode("utf-8"))


def decrypt_secret(secret_encrypted: bytes) -> str:
    return _fernet().decrypt(secret_encrypted).decode("utf-8")


def generate_recovery_code() -> str:
    return f"AGR-{secrets.token_hex(3).upper()}-{secrets.token_hex(3).upper()}"
