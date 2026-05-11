from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.config import get_settings
from app.core.database import get_db
from app.models import AuditLog, Farm, Role, Scan, ScanFeedback, User
from app.schemas.domain import AdminActivityLogRead, AdminFlaggedReviewRead, AuditLogRead, FarmRead
from app.services.audit import write_audit_log
from app.services.feedback_learning import accept_scan_feedback, reject_scan_feedback, undo_scan_feedback_decision

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()


def _scan_image_url(image_path: str | None) -> str | None:
    if not image_path or image_path in {"manual-entry", "offline-browser-analysis"}:
        return None

    image_name = Path(image_path.replace("\\", "/")).name
    if not image_name:
        return None

    if not (settings.upload_path / image_name).is_file():
        return None

    return f"/uploads/{image_name}"


def _flagged_review_payload(feedback: ScanFeedback, scan: Scan, user: User) -> dict:
    return {
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
        "image_url": _scan_image_url(scan.image_path),
        "duplicate_count": 1,
        "created_at": feedback.created_at,
    }


def _feedback_signature_key(feedback: ScanFeedback) -> tuple | None:
    signature = feedback.feature_signature
    if not isinstance(signature, dict):
        return None
    items = []
    for key, value in sorted(signature.items()):
        if isinstance(value, float):
            items.append((key, round(value, 3)))
        else:
            items.append((key, value))
    return tuple(items)


def _flagged_review_duplicate_key(payload: dict, feedback: ScanFeedback) -> tuple:
    return (
        payload.get("user_id"),
        _feedback_signature_key(feedback) or payload.get("image_url"),
        (payload.get("original_crop_label") or "").strip().lower(),
        (payload.get("original_disease_name") or "").strip().lower(),
        (payload.get("corrected_crop_label") or "").strip().lower(),
        (payload.get("corrected_disease_name") or "").strip().lower(),
        payload.get("verification_status"),
    )


async def _load_flagged_review(db: AsyncSession, feedback_id: int) -> tuple[ScanFeedback, Scan, User]:
    result = await db.execute(
        select(ScanFeedback, Scan, User)
        .join(Scan, Scan.id == ScanFeedback.scan_id)
        .join(User, User.id == ScanFeedback.user_id)
        .where(ScanFeedback.id == feedback_id)
    )
    record = result.one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flagged review not found.")
    feedback, scan, user = record
    return feedback, scan, user


async def _load_duplicate_flagged_reviews(db: AsyncSession, feedback: ScanFeedback, status_value: str) -> list[tuple[ScanFeedback, Scan]]:
    signature_key = _feedback_signature_key(feedback)
    result = await db.execute(
        select(ScanFeedback, Scan)
        .join(Scan, Scan.id == ScanFeedback.scan_id)
        .where(
            ScanFeedback.user_id == feedback.user_id,
            ScanFeedback.original_disease_name == feedback.original_disease_name,
            ScanFeedback.corrected_crop_label == feedback.corrected_crop_label,
            ScanFeedback.corrected_disease_name == feedback.corrected_disease_name,
            ScanFeedback.corrected_class_key == feedback.corrected_class_key,
            ScanFeedback.verification_status == status_value,
        )
        .limit(50)
    )
    duplicates = []
    for candidate, scan in result.all():
        if (candidate.original_crop_label or "") != (feedback.original_crop_label or ""):
            continue
        if signature_key is not None and _feedback_signature_key(candidate) != signature_key:
            continue
        duplicates.append((candidate, scan))
    return duplicates


@router.get("/audit-logs", response_model=list[AuditLogRead])
async def audit_logs(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)) -> list[AuditLog]:
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(300))
    return list(result.scalars().all())


@router.get("/activity-logs", response_model=list[AdminActivityLogRead])
async def activity_logs(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(
        select(AuditLog, User, Role)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .outerjoin(Role, Role.id == User.role_id)
        .order_by(AuditLog.created_at.desc())
        .limit(300)
    )
    return [
        {
            "id": log.id,
            "user_id": log.actor_user_id,
            "user_name": user.full_name if user else None,
            "user_email": user.email if user else None,
            "user_role": role.name if role else None,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "metadata_json": log.metadata_json,
            "created_at": log.created_at,
        }
        for log, user, role in result.all()
    ]


@router.get("/flagged-reviews", response_model=list[AdminFlaggedReviewRead])
async def flagged_reviews(
    _: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(ScanFeedback, Scan, User)
        .join(Scan, Scan.id == ScanFeedback.scan_id)
        .join(User, User.id == ScanFeedback.user_id)
        .order_by(
            case((ScanFeedback.verification_status == "pending", 0), else_=1),
            ScanFeedback.created_at.desc(),
        )
        .limit(200)
    )
    reviews_by_key: dict[tuple, dict] = {}
    for feedback, scan, user in result.all():
        payload = _flagged_review_payload(feedback, scan, user)
        key = _flagged_review_duplicate_key(payload, feedback)
        existing = reviews_by_key.get(key)
        if existing is None:
            reviews_by_key[key] = payload
            continue
        existing["duplicate_count"] += 1
        if payload["created_at"] > existing["created_at"]:
            payload["duplicate_count"] = existing["duplicate_count"]
            reviews_by_key[key] = payload
    return list(reviews_by_key.values())


@router.patch("/flagged-reviews/{feedback_id}/accept", response_model=AdminFlaggedReviewRead)
async def accept_flagged_review(
    feedback_id: int,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    feedback, scan, user = await _load_flagged_review(db, feedback_id)
    original_status = feedback.verification_status
    try:
        duplicate_records = await _load_duplicate_flagged_reviews(db, feedback, original_status)
        for duplicate_feedback, duplicate_scan in duplicate_records:
            await accept_scan_feedback(db, duplicate_feedback, duplicate_scan)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await write_audit_log(
        db,
        request,
        "scan.feedback.accepted",
        actor=current_user,
        resource_type="scan_feedback",
        resource_id=feedback.id,
        metadata={
            "scan_id": scan.id,
            "corrected_crop_label": feedback.corrected_crop_label,
            "corrected_disease_name": feedback.corrected_disease_name,
            "duplicate_count": len(duplicate_records),
        },
    )
    await db.commit()
    await db.refresh(feedback)
    await db.refresh(scan)
    payload = _flagged_review_payload(feedback, scan, user)
    payload["duplicate_count"] = max(1, len(duplicate_records))
    return payload


@router.patch("/flagged-reviews/{feedback_id}/reject", response_model=AdminFlaggedReviewRead)
async def reject_flagged_review(
    feedback_id: int,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    feedback, scan, user = await _load_flagged_review(db, feedback_id)
    original_status = feedback.verification_status
    try:
        duplicate_records = await _load_duplicate_flagged_reviews(db, feedback, original_status)
        for duplicate_feedback, _duplicate_scan in duplicate_records:
            await reject_scan_feedback(db, duplicate_feedback)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await write_audit_log(
        db,
        request,
        "scan.feedback.rejected",
        actor=current_user,
        resource_type="scan_feedback",
        resource_id=feedback.id,
        metadata={
            "scan_id": scan.id,
            "corrected_crop_label": feedback.corrected_crop_label,
            "corrected_disease_name": feedback.corrected_disease_name,
            "duplicate_count": len(duplicate_records),
        },
    )
    await db.commit()
    await db.refresh(feedback)
    await db.refresh(scan)
    payload = _flagged_review_payload(feedback, scan, user)
    payload["duplicate_count"] = max(1, len(duplicate_records))
    return payload


@router.patch("/flagged-reviews/{feedback_id}/undo", response_model=AdminFlaggedReviewRead)
async def undo_flagged_review_decision(
    feedback_id: int,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    feedback, scan, user = await _load_flagged_review(db, feedback_id)
    original_status = feedback.verification_status
    try:
        duplicate_records = await _load_duplicate_flagged_reviews(db, feedback, original_status)
        for duplicate_feedback, duplicate_scan in duplicate_records:
            await undo_scan_feedback_decision(db, duplicate_feedback, duplicate_scan)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await write_audit_log(
        db,
        request,
        "scan.feedback.undone",
        actor=current_user,
        resource_type="scan_feedback",
        resource_id=feedback.id,
        metadata={
            "scan_id": scan.id,
            "corrected_crop_label": feedback.corrected_crop_label,
            "corrected_disease_name": feedback.corrected_disease_name,
            "duplicate_count": len(duplicate_records),
        },
    )
    await db.commit()
    await db.refresh(feedback)
    await db.refresh(scan)
    payload = _flagged_review_payload(feedback, scan, user)
    payload["duplicate_count"] = max(1, len(duplicate_records))
    return payload


@router.get("/pending-farms", response_model=list[FarmRead])
async def pending_farms(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)) -> list[Farm]:
    result = await db.execute(
        select(Farm, User)
        .join(User, User.id == Farm.user_id)
        .where(Farm.status == "pending")
        .order_by(Farm.created_at.desc())
        .limit(200)
    )
    farms = []
    for farm, owner in result.all():
        setattr(farm, "owner_name", owner.full_name)
        setattr(farm, "owner_email", owner.email)
        farms.append(farm)
    return farms


@router.get("/mfa-policy")
async def mfa_policy(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(Role).order_by(Role.name))
    return {"roles": [{"name": role.name, "requires_mfa": role.requires_mfa} for role in result.scalars().all()]}
