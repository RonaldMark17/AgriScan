import logging

import aiosmtplib
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def send_email(to_email: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        logger.info("Email delivery skipped. To=%s Subject=%s Body=%s", to_email, subject, body)
        return

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username,
        password=settings.smtp_password,
        start_tls=True,
    )


async def send_password_reset_otp(to_email: str, otp: str) -> None:
    await send_email(
        to_email,
        "AgriScan password reset code",
        f"Your AgriScan password reset code is {otp}. It expires in 10 minutes.",
    )


async def send_new_login_alert(to_email: str, device_name: str | None, ip_address: str | None) -> None:
    device = device_name or "Unknown device"
    ip_text = ip_address or "unknown IP"
    await send_email(
        to_email,
        "New AgriScan login",
        f"We detected a new AgriScan login from {device} at {ip_text}. If this was not you, reset your password.",
    )
