import asyncio
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from app.api.deps import get_current_user
from app.models import User
from app.ml.ml_service_integration import CropClassificationService, CropDetectionService, CropQualityService

router = APIRouter(prefix="/ml", tags=["ml"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_ML_IMAGE_UPLOAD_MB = 10
MAX_ML_IMAGE_UPLOAD_BYTES = MAX_ML_IMAGE_UPLOAD_MB * 1024 * 1024


async def _save_temp_image(upload: UploadFile) -> Path:
    if upload.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPG, PNG, and WebP images are supported.",
        )

    content = await upload.read()
    if len(content) > MAX_ML_IMAGE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image exceeds {MAX_ML_IMAGE_UPLOAD_MB} MB limit.",
        )

    suffix = Path(upload.filename or "crop.jpg").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        suffix = ".jpg"

    temp_path = Path(tempfile.gettempdir()) / f"agriscan-ml-{uuid4().hex}{suffix}"
    temp_path.write_bytes(content)
    return temp_path


def _delete_temp_file(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


@router.post("/detect-crops")
async def detect_crops(
    image: UploadFile = File(...),
    confidence_threshold: float = Query(0.5, ge=0.05, le=0.95),
    apply_preprocessing: bool = Query(True),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ = current_user
    image_path = await _save_temp_image(image)
    try:
        result = await asyncio.to_thread(
            CropDetectionService.detect_crops,
            str(image_path),
            confidence_threshold,
            apply_preprocessing,
        )
    finally:
        _delete_temp_file(image_path)

    if result.get("status") == "error":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=result.get("error"))
    return result


@router.post("/classify-crop")
async def classify_crop(
    image: UploadFile = File(...),
    crop_type: str | None = Query(None, max_length=80),
    top_k: int = Query(5, ge=1, le=10),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ = current_user
    image_path = await _save_temp_image(image)
    try:
        result = await asyncio.to_thread(
            CropClassificationService.classify_crop,
            str(image_path),
            crop_type,
            top_k,
        )
    finally:
        _delete_temp_file(image_path)

    if result.get("status") == "error":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=result.get("error"))
    return result


@router.post("/assess-quality")
async def assess_quality(
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ = current_user
    image_path = await _save_temp_image(image)
    try:
        result = await asyncio.to_thread(CropQualityService.assess_quality, str(image_path))
    finally:
        _delete_temp_file(image_path)

    if result.get("status") == "error":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=result.get("error"))
    return result
