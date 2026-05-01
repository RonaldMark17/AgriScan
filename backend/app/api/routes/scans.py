from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models import Farm, Scan, User
from app.schemas.domain import ScanRead
from app.services.audit import write_audit_log
from app.services.ml_service import detector, manual_entry_diagnosis
from app.services.push_notifications import create_notification, dispatch_push_to_user

router = APIRouter(prefix="/scans", tags=["scans"])
settings = get_settings()
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024
NON_ALERT_SCAN_NAMES = {"healthy", "healthy crop", "invalid crop or leaf image", "low-confidence crop image"}


def _scan_alert_details(scan: Scan, crop_label: str | None, crop_type: str | None) -> tuple[str, str, dict] | None:
    disease_name = (scan.disease_name or "").strip()
    if disease_name.lower() in NON_ALERT_SCAN_NAMES or (scan.confidence or 0) < 0.55:
        return None

    crop_name = (crop_label or crop_type or "Crop").strip()
    confidence_percent = round((scan.confidence or 0) * 100)
    title = "Crop disease alert"
    if "pest" in disease_name.lower():
        title = "Crop pest alert"
    elif "review" in disease_name.lower():
        title = "Crop scan needs review"

    body = f"{crop_name}: {disease_name} detected with {confidence_percent}% confidence. Open AgriScan for guidance."
    payload = {
        "scan_id": scan.id,
        "crop_label": crop_name,
        "disease_name": disease_name,
        "confidence": scan.confidence,
        "url": "/disease-detector",
    }
    return title, body, payload


@router.get("", response_model=list[ScanRead])
async def list_scans(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[Scan]:
    query = select(Scan).order_by(Scan.created_at.desc())
    if current_user.role.name == "farmer":
        query = query.where(Scan.user_id == current_user.id)
    result = await db.execute(query.limit(200))
    scans = list(result.scalars().all())
    for scan in scans:
        setattr(scan, "crop_label", detector._crop_label_from_key(scan.disease_name))
    return scans


@router.post("", response_model=ScanRead, status_code=status.HTTP_201_CREATED)
async def create_scan(
    request: Request,
    image: UploadFile | None = File(default=None),
    farm_id: int | None = Form(default=None),
    crop_id: int | None = Form(default=None),
    crop_type: str | None = Form(default=None, max_length=80),
    affected_part: str | None = Form(default=None, max_length=80),
    symptoms: str | None = Form(default=None, max_length=1000),
    severity: str | None = Form(default=None, pattern="^(low|medium|high|mild|severe)$"),
    field_notes: str | None = Form(default=None, max_length=1500),
    offline_mode: bool = Form(default=False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Scan:
    typed_observation = any(value and value.strip() for value in [crop_type, affected_part, symptoms, field_notes])
    if image is None and not typed_observation:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Add typed observations or upload a crop image.")

    if farm_id is not None:
        farm_result = await db.execute(select(Farm).where(Farm.id == farm_id))
        farm = farm_result.scalar_one_or_none()
        if farm is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found.")
        if current_user.role.name == "farmer" and farm.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only scan your own farms.")

    file_path: Path | None = None
    if image is not None:
        if image.content_type not in ALLOWED_CONTENT_TYPES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only JPG, PNG, and WebP images are supported.")

        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(image.filename or "scan.jpg").suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            suffix = ".jpg"
        file_path = upload_dir / f"{uuid4().hex}{suffix}"

        content = await image.read()
        if len(content) > MAX_IMAGE_UPLOAD_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image exceeds 10 MB limit.")
        file_path.write_bytes(content)

    detection = (
        detector.detect(
            str(file_path),
            crop_type=crop_type,
            original_filename=image.filename if image is not None else None,
            allow_online_lookup=not offline_mode,
        )
        if file_path is not None
        else manual_entry_diagnosis(crop_type, affected_part, symptoms, severity, field_notes)
    )
    if file_path is not None and detection.disease_name == "Invalid crop or leaf image":
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detection.cause or "Upload a clear crop or leaf photo for disease analysis.",
        )

    scan = Scan(
        user_id=current_user.id,
        farm_id=farm_id,
        crop_id=crop_id,
        image_path=str(file_path) if file_path is not None else "manual-entry",
        disease_name=detection.disease_name,
        confidence=detection.confidence,
        cause=detection.cause,
        treatment=detection.treatment,
    )
    db.add(scan)
    await db.flush()
    scan_alert = _scan_alert_details(scan, detection.crop_label, crop_type)
    scan_notification = None
    if scan_alert is not None:
        title, body, payload = scan_alert
        scan_notification = await create_notification(
            db,
            user_id=current_user.id,
            title=title,
            body=body,
            notification_type="disease_scan",
            payload=payload,
        )
    await write_audit_log(
        db,
        request,
        "scan.created",
        actor=current_user,
        resource_type="scan",
        resource_id=scan.id,
        metadata={
            "disease": scan.disease_name,
            "confidence": scan.confidence,
            "crop_hint": crop_type,
            "entry_mode": "image" if file_path is not None else "manual",
        },
    )
    await db.commit()
    await db.refresh(scan)
    if scan_alert is not None and scan_notification is not None:
        title, body, payload = scan_alert
        await dispatch_push_to_user(
            db,
            user_id=current_user.id,
            title=title,
            body=body,
            url="/disease-detector",
            payload={**payload, "notification_id": scan_notification.id, "type": "disease_scan"},
        )
    setattr(scan, "crop_label", detection.crop_label)
    setattr(scan, "analysis_mode", detection.analysis_mode)
    setattr(scan, "reference_url", detection.reference_url)
    setattr(scan, "reference_title", detection.reference_title)
    return scan
