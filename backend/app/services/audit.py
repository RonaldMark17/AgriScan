from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, User


def get_request_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def write_audit_log(
    db: AsyncSession,
    request: Request | None,
    action: str,
    actor: User | None = None,
    resource_type: str | None = None,
    resource_id: str | int | None = None,
    metadata: dict | None = None,
) -> None:
    audit = AuditLog(
        actor_user_id=actor.id if actor else None,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        ip_address=get_request_ip(request) if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        metadata_json=metadata,
    )
    db.add(audit)
    await db.flush()
