from pathlib import Path
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Scan, ScanFeedback, User
from app.schemas.domain import ScanFeedbackCreate
from app.services.firebase_storage import restore_upload_from_firebase
from app.services.ml_service import CLASS_METADATA, DEFAULT_LABELS, DISEASE_PROFILES, DiseaseDetection, detector


FEATURE_SIGNATURE_KEYS = (
    "green_leaf_ratio",
    "lesion_ratio",
    "lesion_within_plant",
    "yellow_ratio",
    "rust_ratio",
    "dark_lesion_ratio",
    "edge_lesion_ratio",
    "component_count",
    "max_component_area_ratio",
    "max_component_aspect",
    "green_component_count",
    "max_green_area_ratio",
    "max_green_aspect",
    "green_edge_ratio",
    "adjacent_nonleaf_ratio",
    "banana_fruit_ratio",
    "fruit_component_count",
    "max_fruit_area_ratio",
    "max_fruit_aspect",
    "contrast",
    "center_green_ratio",
    "center_lesion_ratio",
    "center_fruit_ratio",
    "center_neutral_ratio",
    "center_tan_ratio",
)
settings = get_settings()


def _resolve_feedback_image_path(image_path: str) -> Path:
    path = Path(image_path)
    candidates = [path]
    if not path.is_absolute():
        candidates.append(settings.backend_path / path)
        candidates.append(settings.upload_path / path.name)

    for candidate in candidates:
        if candidate.exists():
            return candidate

    restored = restore_upload_from_firebase(path.name)
    return restored or settings.upload_path / path.name

FEATURE_DISTANCE_SCALES = {
    "contrast": 80.0,
    "component_count": 35.0,
    "green_component_count": 25.0,
    "fruit_component_count": 25.0,
    "max_component_aspect": 8.0,
    "max_green_aspect": 8.0,
    "max_fruit_aspect": 8.0,
}

LEARNED_MATCH_DISTANCE = 0.09
LEARNED_CORRECTION_LIMIT = 400
ADMIN_ACCEPTED_REASON = "Accepted by admin review."
LEARNED_FEATURE_DELTA_LIMITS = {
    "green_leaf_ratio": 0.18,
    "lesion_ratio": 0.22,
    "lesion_within_plant": 0.26,
    "yellow_ratio": 0.18,
    "rust_ratio": 0.12,
    "dark_lesion_ratio": 0.16,
    "center_green_ratio": 0.18,
    "center_lesion_ratio": 0.22,
    "center_fruit_ratio": 0.24,
    "center_tan_ratio": 0.24,
    "banana_fruit_ratio": 0.24,
    "max_green_area_ratio": 0.18,
    "max_fruit_area_ratio": 0.24,
}
INVALID_FEEDBACK_TERMS = {
    "invalid crop image",
    "invalid crop or leaf image",
    "not a crop",
    "not a crop image",
    "not crop image",
    "not a plant",
    "not a plant image",
    "animal",
    "non crop",
    "non crop image",
    "dog",
    "cat",
    "person",
}


def _feature_signature(features: dict[str, float]) -> dict[str, float]:
    return {key: round(float(features.get(key, 0.0)), 5) for key in FEATURE_SIGNATURE_KEYS}


def _signature_distance(first: dict[str, Any], second: dict[str, Any]) -> float:
    distances = []
    for key in FEATURE_SIGNATURE_KEYS:
        try:
            left = float(first.get(key, 0.0))
            right = float(second.get(key, 0.0))
        except (TypeError, ValueError):
            continue
        scale = FEATURE_DISTANCE_SCALES.get(key, 1.0)
        distances.append(min(abs(left - right) / scale, 1.0))
    if not distances:
        return 1.0
    return sum(distances) / len(distances)


def _signatures_are_compatible(first: dict[str, Any], second: dict[str, Any]) -> bool:
    for key, limit in LEARNED_FEATURE_DELTA_LIMITS.items():
        try:
            left = float(first.get(key, 0.0))
            right = float(second.get(key, 0.0))
        except (TypeError, ValueError):
            return False
        if abs(left - right) > limit:
            return False
    return True


def _normalize_condition_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.strip().lower()).strip()


def _mentions_invalid_crop_image(value: str | None) -> bool:
    normalized = _normalize_condition_text(value or "")
    if not normalized:
        return False
    if normalized in INVALID_FEEDBACK_TERMS:
        return True
    tokens = normalized.split()
    for marker in ("animal", "dog", "cat", "person"):
        if marker in tokens:
            return True
    for index, token in enumerate(tokens):
        if token != "not":
            continue
        window = tokens[index + 1 : index + 4]
        if any(candidate in {"crop", "plant", "leaf"} for candidate in window):
            return True
    return "non crop" in normalized or "not crop" in normalized


def _class_key_from_feedback(crop_label: str, condition: str, user_note: str | None = None) -> tuple[str, str]:
    crop_key = detector._normalize_crop_type(crop_label)
    normalized_condition = _normalize_condition_text(condition)
    if _mentions_invalid_crop_image(condition) or _mentions_invalid_crop_image(user_note):
        return "invalid_crop_image", "Invalid crop or leaf image"
    if not normalized_condition:
        return "review_needed", "Crop scan needs review"

    healthy_terms = {"healthy", "normal", "no disease", "no major disease", "healthy crop"}
    if normalized_condition in healthy_terms or normalized_condition.startswith("healthy "):
        healthy_key = detector._healthy_key_for_crop(crop_key)
        return healthy_key, "Healthy crop"

    candidate_keys = list(dict.fromkeys([*DEFAULT_LABELS, *CLASS_METADATA.keys()]))
    for crop_candidate in [crop_key, None]:
        for profile_key in DISEASE_PROFILES:
            if profile_key == "healthy":
                continue
            candidate_keys.append(f"{crop_candidate}_{profile_key}" if crop_candidate else profile_key)

    for key in candidate_keys:
        class_key = detector._canonical_key_for_label(key)
        metadata = detector._metadata_for_key(class_key)
        names = {
            _normalize_condition_text(metadata["name"]),
            _normalize_condition_text(class_key.replace("_", " ")),
        }
        if crop_key:
            crop_name = detector._display_crop_label(crop_key) or crop_label
            names.add(_normalize_condition_text(f"{crop_name} {metadata['name']}"))
        if normalized_condition in names:
            return class_key, metadata["name"]

    slug = re.sub(r"[^a-z0-9]+", "_", normalized_condition).strip("_") or "review_needed"
    if crop_key and not slug.startswith(f"{crop_key}_"):
        slug = f"{crop_key}_{slug}"
    return slug, condition.strip()


def _verified_detection(
    *,
    corrected_crop_label: str,
    corrected_disease_name: str,
    corrected_class_key: str,
    confidence: float = 0.93,
    matched_distance: float | None = None,
) -> DiseaseDetection:
    metadata = detector._metadata_for_key(corrected_class_key)
    disease_name = corrected_disease_name or metadata["name"]
    cause = metadata["cause"]
    if corrected_class_key == "invalid_crop_image":
        return DiseaseDetection(
            disease_name=disease_name,
            confidence=0.0,
            cause=cause,
            treatment=metadata["treatment"],
            crop_label=None,
            analysis_mode="verified non-crop feedback",
        )
    if disease_name != "Healthy crop":
        cause = f"{cause} This result also matched a verified user correction from a similar scan."
    confidence_from_match = 0.94
    if matched_distance is not None:
        confidence_from_match = max(0.86, min(0.96, 0.96 - matched_distance))
    return DiseaseDetection(
        disease_name=disease_name,
        confidence=max(min(confidence, 0.96), confidence_from_match),
        cause=cause,
        treatment=metadata["treatment"],
        crop_label=corrected_crop_label,
        analysis_mode="verified feedback learning",
    )


def _apply_verified_feedback_to_scan(scan: Scan, feedback: ScanFeedback) -> DiseaseDetection:
    detection = _verified_detection(
        corrected_crop_label=feedback.corrected_crop_label,
        corrected_disease_name=feedback.corrected_disease_name,
        corrected_class_key=feedback.corrected_class_key,
    )
    scan.disease_name = detection.disease_name
    scan.confidence = detection.confidence
    scan.cause = detection.cause
    scan.treatment = detection.treatment
    scan.crop_label = detection.crop_label
    scan.analysis_mode = detection.analysis_mode
    scan.status = "rejected" if feedback.corrected_class_key == "invalid_crop_image" else "corrected"
    setattr(feedback, "applied_disease_name", detection.disease_name)
    setattr(feedback, "applied_confidence", detection.confidence)
    setattr(feedback, "applied_cause", detection.cause)
    setattr(feedback, "applied_treatment", detection.treatment)
    setattr(feedback, "applied_analysis_mode", detection.analysis_mode)
    return detection


def _restore_scan_from_feedback(scan: Scan, feedback: ScanFeedback) -> None:
    fallback_metadata = detector._metadata_for_key(feedback.original_disease_name)
    scan.disease_name = feedback.original_disease_name
    scan.crop_label = feedback.original_crop_label
    scan.status = feedback.original_status or "detected"
    if feedback.original_confidence is not None:
        scan.confidence = feedback.original_confidence
    else:
        scan.confidence = min(scan.confidence, 0.86)
    scan.cause = feedback.original_cause if feedback.original_cause is not None else fallback_metadata["cause"]
    scan.treatment = feedback.original_treatment if feedback.original_treatment is not None else fallback_metadata["treatment"]
    scan.analysis_mode = feedback.original_analysis_mode or "admin undo restore"


def _verify_feedback(
    features: dict[str, float],
    *,
    original_disease_name: str,
    original_crop_label: str | None,
    corrected_crop_label: str,
    corrected_disease_name: str,
    corrected_class_key: str,
) -> tuple[str, str]:
    original_condition = _normalize_condition_text(original_disease_name)
    original_crop_key = detector._normalize_crop_type(original_crop_label)
    corrected_crop_key = detector._normalize_crop_type(corrected_crop_label)
    corrected_condition = _normalize_condition_text(corrected_disease_name)
    class_crop_key = detector._crop_key_from_class_key(detector._canonical_key_for_label(corrected_class_key))

    if original_condition == corrected_condition and original_crop_key == corrected_crop_key:
        return "rejected", "The correction matches the existing scan result, so there is nothing new to learn."

    if class_crop_key and corrected_crop_key and class_crop_key != corrected_crop_key:
        return "pending", "The corrected disease label does not match the corrected crop, so an admin should review it before learning."

    if corrected_class_key == "invalid_crop_image":
        if detector._looks_like_non_crop_foreground(features, None):
            return "verified", "The image matches a non-crop foreground pattern, so it will be rejected in future scans."
        return "pending", "AgriScan could not prove this is a non-crop image automatically, so an admin should review it before learning."

    if original_crop_key != corrected_crop_key:
        return "pending", "Crop-changing corrections need admin review before they teach the detector."

    is_healthy_correction = corrected_disease_name == "Healthy crop" or corrected_class_key.endswith("_healthy")
    if is_healthy_correction:
        if corrected_crop_key == "rice" and detector._looks_like_healthy_rice_panicle(features):
            return "verified", "The image has the grain and leaf structure of a healthy rice panicle."
        if corrected_crop_key == "banana" and detector._looks_like_healthy_banana_bunch(features):
            return "verified", "The image has the clustered green fruit structure of a healthy banana bunch."
        if not detector._has_strong_visual_disease_signal(features, corrected_crop_key):
            return "verified", "The image does not show strong disease markers, so the healthy correction is accepted."
        return "pending", "The image still shows strong disease-like markers, so an admin should review this correction before it teaches the detector."

    if detector._has_strong_visual_disease_signal(features, corrected_crop_key):
        return "verified", "The image contains visible disease-like damage, so the corrected disease label is accepted for learning."

    return "pending", "The detector could not verify enough disease evidence for this correction, so it was saved for review but not learned yet."


async def apply_verified_feedback(
    db: AsyncSession,
    image_path: str,
    detection: DiseaseDetection,
    crop_type: str | None = None,
) -> DiseaseDetection:
    path = Path(image_path)
    if not path.exists():
        return detection

    features = detector._extract_leaf_features(str(path))
    current_signature = _feature_signature(features)
    explicit_crop_key = detector._normalize_crop_type(crop_type)
    detected_crop_key = detector._normalize_crop_type(detection.crop_label)
    detected_condition = _normalize_condition_text(detection.disease_name)

    result = await db.execute(
        select(ScanFeedback)
        .where(ScanFeedback.verification_status == "verified")
        .order_by(ScanFeedback.id.desc())
        .limit(LEARNED_CORRECTION_LIMIT)
    )
    best_feedback: ScanFeedback | None = None
    best_distance = 1.0
    for feedback in result.scalars().all():
        if not isinstance(feedback.feature_signature, dict):
            continue
        if feedback.verification_reason != ADMIN_ACCEPTED_REASON:
            continue
        corrected_crop_key = detector._normalize_crop_type(feedback.corrected_crop_label)
        corrected_class_key = detector._canonical_key_for_label(feedback.corrected_class_key)
        class_crop_key = detector._crop_key_from_class_key(corrected_class_key)
        if not corrected_crop_key:
            continue
        if explicit_crop_key and corrected_crop_key != explicit_crop_key:
            continue
        if class_crop_key and class_crop_key != corrected_crop_key:
            continue
        if (
            corrected_crop_key == detected_crop_key
            and _normalize_condition_text(feedback.corrected_disease_name)
            == detected_condition
        ):
            continue
        if not _signatures_are_compatible(current_signature, feedback.feature_signature):
            continue
        distance = _signature_distance(current_signature, feedback.feature_signature)
        if distance < best_distance:
            best_feedback = feedback
            best_distance = distance

    if best_feedback is None or best_distance > LEARNED_MATCH_DISTANCE:
        return detection

    return _verified_detection(
        corrected_crop_label=best_feedback.corrected_crop_label,
        corrected_disease_name=best_feedback.corrected_disease_name,
        corrected_class_key=best_feedback.corrected_class_key,
        confidence=max(detection.confidence, 0.90),
        matched_distance=best_distance,
    )


async def create_scan_feedback(
    db: AsyncSession,
    scan: Scan,
    current_user: User,
    payload: ScanFeedbackCreate,
) -> ScanFeedback:
    image_path = _resolve_feedback_image_path(scan.image_path)
    if not image_path.exists():
        raise ValueError("The original scan image is no longer available for verification.")

    features = detector._extract_leaf_features(str(image_path))
    signature = _feature_signature(features)
    original_crop_label = scan.crop_label or detector._crop_label_from_key(scan.disease_name)
    corrected_class_key, corrected_disease_name = _class_key_from_feedback(
        payload.corrected_crop_label,
        payload.corrected_condition,
        payload.user_note,
    )
    corrected_crop_key = detector._normalize_crop_type(payload.corrected_crop_label)
    corrected_crop_label = detector._display_crop_label(corrected_crop_key) or payload.corrected_crop_label.strip()
    verification_status, verification_reason = _verify_feedback(
        features,
        original_disease_name=scan.disease_name,
        original_crop_label=original_crop_label,
        corrected_crop_label=corrected_crop_label,
        corrected_disease_name=corrected_disease_name,
        corrected_class_key=corrected_class_key,
    )
    existing_result = await db.execute(
        select(ScanFeedback)
        .where(
            ScanFeedback.scan_id == scan.id,
            ScanFeedback.user_id == current_user.id,
            ScanFeedback.corrected_crop_label == corrected_crop_label,
            ScanFeedback.corrected_disease_name == corrected_disease_name,
            ScanFeedback.corrected_class_key == corrected_class_key,
        )
        .order_by(ScanFeedback.created_at.desc())
        .limit(1)
    )
    existing_feedback = existing_result.scalar_one_or_none()
    if existing_feedback is not None:
        if existing_feedback.verification_status == "verified":
            applied_detection = _apply_verified_feedback_to_scan(scan, existing_feedback)
            setattr(existing_feedback, "applied_disease_name", applied_detection.disease_name)
            setattr(existing_feedback, "applied_confidence", applied_detection.confidence)
            setattr(existing_feedback, "applied_cause", applied_detection.cause)
            setattr(existing_feedback, "applied_treatment", applied_detection.treatment)
            setattr(existing_feedback, "applied_analysis_mode", applied_detection.analysis_mode)
        else:
            setattr(existing_feedback, "applied_disease_name", None)
            setattr(existing_feedback, "applied_confidence", None)
            setattr(existing_feedback, "applied_cause", None)
            setattr(existing_feedback, "applied_treatment", None)
            setattr(existing_feedback, "applied_analysis_mode", None)
        return existing_feedback

    feedback = ScanFeedback(
        scan_id=scan.id,
        user_id=current_user.id,
        original_disease_name=scan.disease_name,
        original_crop_label=original_crop_label,
        original_confidence=scan.confidence,
        original_cause=scan.cause,
        original_treatment=scan.treatment,
        original_analysis_mode=scan.analysis_mode,
        original_status=scan.status,
        corrected_crop_label=corrected_crop_label,
        corrected_disease_name=corrected_disease_name,
        corrected_class_key=corrected_class_key,
        user_note=payload.user_note.strip() if payload.user_note else None,
        verification_status=verification_status,
        verification_reason=verification_reason,
        feature_signature=signature,
    )
    db.add(feedback)

    applied_detection: DiseaseDetection | None = None
    if verification_status == "verified":
        applied_detection = _apply_verified_feedback_to_scan(scan, feedback)

    await db.flush()
    setattr(feedback, "applied_disease_name", applied_detection.disease_name if applied_detection else None)
    setattr(feedback, "applied_confidence", applied_detection.confidence if applied_detection else None)
    setattr(feedback, "applied_cause", applied_detection.cause if applied_detection else None)
    setattr(feedback, "applied_treatment", applied_detection.treatment if applied_detection else None)
    setattr(feedback, "applied_analysis_mode", applied_detection.analysis_mode if applied_detection else None)
    return feedback


async def accept_scan_feedback(
    db: AsyncSession,
    feedback: ScanFeedback,
    scan: Scan,
    reason: str = "Accepted by admin review.",
) -> ScanFeedback:
    if feedback.verification_status == "rejected":
        raise ValueError("This correction was already rejected.")

    feedback.verification_status = "verified"
    feedback.verification_reason = reason
    _apply_verified_feedback_to_scan(scan, feedback)
    await db.flush()
    return feedback


async def reject_scan_feedback(
    db: AsyncSession,
    feedback: ScanFeedback,
    reason: str = "Rejected by admin review.",
) -> ScanFeedback:
    if feedback.verification_status == "verified":
        raise ValueError("This correction was already accepted and applied.")

    feedback.verification_status = "rejected"
    feedback.verification_reason = reason
    setattr(feedback, "applied_disease_name", None)
    setattr(feedback, "applied_confidence", None)
    setattr(feedback, "applied_cause", None)
    setattr(feedback, "applied_treatment", None)
    setattr(feedback, "applied_analysis_mode", None)
    await db.flush()
    return feedback


async def undo_scan_feedback_decision(
    db: AsyncSession,
    feedback: ScanFeedback,
    scan: Scan,
    reason: str = "Decision undone by admin review.",
) -> ScanFeedback:
    if feedback.verification_status == "pending":
        raise ValueError("This correction is already pending review.")

    if feedback.verification_status == "verified":
        _restore_scan_from_feedback(scan, feedback)

    feedback.verification_status = "pending"
    feedback.verification_reason = reason
    setattr(feedback, "applied_disease_name", None)
    setattr(feedback, "applied_confidence", None)
    setattr(feedback, "applied_cause", None)
    setattr(feedback, "applied_treatment", None)
    setattr(feedback, "applied_analysis_mode", None)
    await db.flush()
    return feedback
