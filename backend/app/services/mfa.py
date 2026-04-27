import base64
import io
from datetime import UTC, datetime

import pyotp
import qrcode
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import decrypt_secret, encrypt_secret, generate_recovery_code, get_password_hash, verify_password
from app.models import MFASetting, RecoveryCode, User

settings = get_settings()


def create_totp_secret() -> str:
    return pyotp.random_base32()


def build_otpauth_url(user: User, secret: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="AgriScan")


def qr_code_data_url(otpauth_url: str) -> str:
    image = qrcode.make(otpauth_url)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code, valid_window=1)


async def upsert_mfa_secret(db: AsyncSession, user: User, secret: str) -> MFASetting:
    setting = user.mfa_setting
    if setting is None:
        setting = MFASetting(user_id=user.id)
        db.add(setting)
    setting.secret_encrypted = encrypt_secret(secret)
    setting.enabled = False
    setting.verified_at = None
    await db.flush()
    return setting


async def enable_mfa_and_issue_recovery_codes(db: AsyncSession, user: User, code_count: int = 8) -> list[str]:
    if user.mfa_setting is None:
        raise ValueError("MFA setup has not been started.")
    user.mfa_setting.enabled = True
    user.mfa_setting.verified_at = datetime.now(UTC)

    existing = await db.execute(select(RecoveryCode).where(RecoveryCode.user_id == user.id, RecoveryCode.used_at.is_(None)))
    for recovery_code in existing.scalars().all():
        recovery_code.used_at = datetime.now(UTC)

    codes = [generate_recovery_code() for _ in range(code_count)]
    for code in codes:
        db.add(RecoveryCode(user_id=user.id, code_hash=get_password_hash(code)))
    await db.flush()
    return codes


def get_user_mfa_secret(user: User) -> str | None:
    if not user.mfa_setting or not user.mfa_setting.secret_encrypted:
        return None
    return decrypt_secret(user.mfa_setting.secret_encrypted)


async def verify_recovery_code(db: AsyncSession, user: User, code: str) -> bool:
    result = await db.execute(select(RecoveryCode).where(RecoveryCode.user_id == user.id, RecoveryCode.used_at.is_(None)))
    for recovery_code in result.scalars().all():
        if verify_password(code, recovery_code.code_hash):
            recovery_code.used_at = datetime.now(UTC)
            await db.flush()
            return True
    return False
