from __future__ import annotations

import json
import logging
import pickle
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)

NUMERIC_FEATURES = ("ph_level", "moisture_percent", "soil_temperature_c")
CATEGORICAL_FEATURES = (
    "soil_type",
    "nitrogen_level",
    "phosphorus_level",
    "potassium_level",
    "drainage",
    "sunlight",
    "season",
)

NUMERIC_DEFAULTS = {
    "ph_level": 6.5,
    "moisture_percent": 50.0,
    "soil_temperature_c": 28.0,
}

CATEGORICAL_DEFAULTS = {
    "soil_type": "loam",
    "nitrogen_level": "medium",
    "phosphorus_level": "medium",
    "potassium_level": "medium",
    "drainage": "moderate",
    "sunlight": "full sun",
    "season": "regular season",
}


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_backend_path(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return _backend_root() / path


def _clean_category(value: str | None, default: str) -> str:
    cleaned = (value or default).strip().lower().replace("_", " ")
    return " ".join(cleaned.split()) or default


def _clean_number(value: float | int | str | None, default: float) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_manual_scan_features(
    *,
    soil_type: str,
    ph_level: float | None = None,
    moisture_percent: float | None = None,
    soil_temperature_c: float | None = None,
    nitrogen_level: str | None = None,
    phosphorus_level: str | None = None,
    potassium_level: str | None = None,
    drainage: str | None = None,
    sunlight: str | None = None,
    season: str | None = None,
) -> dict[str, float | str]:
    return {
        "soil_type": _clean_category(soil_type, CATEGORICAL_DEFAULTS["soil_type"]),
        "ph_level": _clean_number(ph_level, NUMERIC_DEFAULTS["ph_level"]),
        "moisture_percent": _clean_number(moisture_percent, NUMERIC_DEFAULTS["moisture_percent"]),
        "soil_temperature_c": _clean_number(soil_temperature_c, NUMERIC_DEFAULTS["soil_temperature_c"]),
        "nitrogen_level": _clean_category(nitrogen_level, CATEGORICAL_DEFAULTS["nitrogen_level"]),
        "phosphorus_level": _clean_category(phosphorus_level, CATEGORICAL_DEFAULTS["phosphorus_level"]),
        "potassium_level": _clean_category(potassium_level, CATEGORICAL_DEFAULTS["potassium_level"]),
        "drainage": _clean_category(drainage, CATEGORICAL_DEFAULTS["drainage"]),
        "sunlight": _clean_category(sunlight, CATEGORICAL_DEFAULTS["sunlight"]),
        "season": _clean_category(season, CATEGORICAL_DEFAULTS["season"]),
    }


@lru_cache(maxsize=1)
def load_manual_crop_recommender() -> dict[str, Any] | None:
    settings = get_settings()
    model_path = _resolve_backend_path(settings.crop_recommender_model_path)
    metadata_path = _resolve_backend_path(settings.crop_recommender_metadata_path)

    if not model_path.exists():
        logger.info("Manual crop recommender model artifact not found at %s", model_path)
        return None

    try:
        with model_path.open("rb") as model_file:
            model = pickle.load(model_file)
    except Exception:
        logger.exception("Failed to load manual crop recommender model from %s", model_path)
        return None

    metadata: dict[str, Any] = {}
    if metadata_path.exists():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except Exception:
            logger.warning("Failed to read manual crop recommender metadata from %s", metadata_path, exc_info=True)

    return {"model": model, "metadata": metadata, "model_path": str(model_path)}


def predict_manual_crop_recommendations(
    *,
    soil_type: str,
    ph_level: float | None = None,
    moisture_percent: float | None = None,
    soil_temperature_c: float | None = None,
    nitrogen_level: str | None = None,
    phosphorus_level: str | None = None,
    potassium_level: str | None = None,
    drainage: str | None = None,
    sunlight: str | None = None,
    season: str | None = None,
) -> dict[str, Any] | None:
    bundle = load_manual_crop_recommender()
    if bundle is None:
        return None

    features = normalize_manual_scan_features(
        soil_type=soil_type,
        ph_level=ph_level,
        moisture_percent=moisture_percent,
        soil_temperature_c=soil_temperature_c,
        nitrogen_level=nitrogen_level,
        phosphorus_level=phosphorus_level,
        potassium_level=potassium_level,
        drainage=drainage,
        sunlight=sunlight,
        season=season,
    )

    model = bundle["model"]
    try:
        probabilities = model.predict_proba([features])[0]
        classes = list(model.classes_)
    except Exception:
        logger.exception("Manual crop recommender prediction failed")
        return None

    ranked = sorted(
        (
            {"crop": str(crop), "probability": round(float(probability), 4)}
            for crop, probability in zip(classes, probabilities, strict=False)
        ),
        key=lambda item: item["probability"],
        reverse=True,
    )

    metadata = bundle.get("metadata") or {}
    return {
        "source": "trained_manual_scan_model",
        "model_version": metadata.get("model_version", "manual-scan-hgb"),
        "accuracy": metadata.get("accuracy"),
        "top_3_accuracy": metadata.get("top_3_accuracy"),
        "features": features,
        "predictions": ranked,
    }
