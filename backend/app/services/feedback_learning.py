from pathlib import Path
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Scan, ScanFeedback, User
from app.schemas.domain import ScanFeedbackCreate
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

FEATURE_DISTANCE_SCALES = {
    "contrast": 80.0,
    "component_count": 35.0,
    "green_component_count": 25.0,
    "fruit_component_count": 25.0,
    "max_component_aspect": 8.0,
    "max_green_aspect": 8.0,
    "max_fruit_aspect": 8.0,
}

LEARNED_MATCH_DISTANCE = 0.18
LEARNED_CORRECTION_LIMIT = 400


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


def _normalize_condition_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.strip().lower()).strip()


def _class_key_from_feedback(crop_label: str, condition: str) -> tuple[str, str]:
    crop_key = detector._normalize_crop_type(crop_label)
    normalized_condition = _normalize_condition_text(condition)
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

    if original_condition == corrected_condition and original_crop_key == corrected_crop_key:
        return "rejected", "The correction matches the existing scan result, so there is nothing new to learn."

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
    if not path.exists() or detection.disease_name == "Invalid crop or leaf image":
        return detection

    features = detector._extract_leaf_features(str(path))
    current_signature = _feature_signature(features)
    explicit_crop_key = detector._normalize_crop_type(crop_type)

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
        corrected_crop_key = detector._normalize_crop_type(feedback.corrected_crop_label)
        if explicit_crop_key and corrected_crop_key and explicit_crop_key != corrected_crop_key:
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
    image_path = Path(scan.image_path)
    if not image_path.exists():
        raise ValueError("The original scan image is no longer available for verification.")

    features = detector._extract_leaf_features(str(image_path))
    signature = _feature_signature(features)
    original_crop_label = detector._crop_label_from_key(scan.disease_name)
    corrected_class_key, corrected_disease_name = _class_key_from_feedback(
        payload.corrected_crop_label,
        payload.corrected_condition,
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

    feedback = ScanFeedback(
        scan_id=scan.id,
        user_id=current_user.id,
        original_disease_name=scan.disease_name,
        original_crop_label=original_crop_label,
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
        applied_detection = _verified_detection(
            corrected_crop_label=corrected_crop_label,
            corrected_disease_name=corrected_disease_name,
            corrected_class_key=corrected_class_key,
        )
        scan.disease_name = applied_detection.disease_name
        scan.confidence = applied_detection.confidence
        scan.cause = applied_detection.cause
        scan.treatment = applied_detection.treatment
        scan.status = "corrected"

    await db.flush()
    setattr(feedback, "applied_disease_name", applied_detection.disease_name if applied_detection else None)
    setattr(feedback, "applied_confidence", applied_detection.confidence if applied_detection else None)
    setattr(feedback, "applied_cause", applied_detection.cause if applied_detection else None)
    setattr(feedback, "applied_treatment", applied_detection.treatment if applied_detection else None)
    setattr(feedback, "applied_analysis_mode", applied_detection.analysis_mode if applied_detection else None)
    return feedback
