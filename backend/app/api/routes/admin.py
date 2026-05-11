from pathlib import Path

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.database import get_db
from app.models import AuditLog, Farm, Role, Scan, ScanFeedback, User
from app.schemas.domain import AdminFlaggedReviewRead, AuditLogRead, FarmRead

router = APIRouter(prefix="/admin", tags=["admin"])


def _scan_image_url(request: Request, image_path: str | None) -> str | None:
    if not image_path or image_path in {"manual-entry", "offline-browser-analysis"}:
        return None

    image_name = Path(image_path.replace("\\", "/")).name
    if not image_name:
        return None

    base_url = str(request.base_url).rstrip("/")
    return f"{base_url}/uploads/{image_name}"


@router.get("/audit-logs", response_model=list[AuditLogRead])
async def audit_logs(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)) -> list[AuditLog]:
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(300))
    return list(result.scalars().all())


@router.get("/flagged-reviews", response_model=list[AdminFlaggedReviewRead])
async def flagged_reviews(
    request: Request,
    _: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(ScanFeedback, Scan, User)
        .join(Scan, Scan.id == ScanFeedback.scan_id)
        .join(User, User.id == ScanFeedback.user_id)
        .order_by(ScanFeedback.created_at.desc())
        .limit(200)
    )
    reviews = []
    for feedback, scan, user in result.all():
        reviews.append(
            {
                "id": feedback.id,
                "scan_id": feedback.scan_id,
                "user_id": feedback.user_id,
                "user_name": user.full_name,
                "user_email": user.email,
                "original_disease_name": feedback.original_disease_name,
                "original_crop_label": feedback.original_crop_label,
                "corrected_crop_label": feedback.corrected_crop_label,
                "corrected_disease_name": feedback.corrected_disease_name,
                "corrected_class_key": feedback.corrected_class_key,
                "user_note": feedback.user_note,
                "verification_status": feedback.verification_status,
                "verification_reason": feedback.verification_reason,
                "scan_disease_name": scan.disease_name,
                "scan_status": scan.status,
                "scan_confidence": scan.confidence,
                "scan_crop_label": scan.crop_label,
                "image_url": _scan_image_url(request, scan.image_path),
                "created_at": feedback.created_at,
            }
        )
    return reviews


@router.get("/pending-farms", response_model=list[FarmRead])
async def pending_farms(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)) -> list[Farm]:
    result = await db.execute(select(Farm).where(Farm.status == "pending").order_by(Farm.created_at.desc()).limit(200))
    return list(result.scalars().all())


@router.get("/mfa-policy")
async def mfa_policy(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Role).order_by(Role.name))
    return {"roles": [{"name": role.name, "requires_mfa": role.requires_mfa} for role in result.scalars().all()]}
