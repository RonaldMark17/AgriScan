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
DATASET_FEATURES = ("N", "P", "K", "temperature", "humidity", "ph", "rainfall")
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

DEFAULT_NUTRIENT_LEVEL_VALUES = {
    "N": {"low": 25.0, "medium": 55.0, "high": 90.0},
    "P": {"low": 30.0, "medium": 55.0, "high": 80.0},
    "K": {"low": 25.0, "medium": 45.0, "high": 80.0},
}

SEASON_RAINFALL_DEFAULTS = {
    "dry season": 65.0,
    "regular season": 130.0,
    "wet season": 215.0,
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


def _metadata_nutrient_value(metadata: dict[str, Any], feature: str, level: str) -> float:
    level_values = metadata.get("nutrient_level_values")
    if isinstance(level_values, dict):
        feature_values = level_values.get(feature)
        if isinstance(feature_values, dict):
            value = feature_values.get(level)
            if isinstance(value, int | float):
                return float(value)
    return DEFAULT_NUTRIENT_LEVEL_VALUES[feature].get(level, DEFAULT_NUTRIENT_LEVEL_VALUES[feature]["medium"])


def _bounded_number(value: float | int | str | None, default: float, low: float, high: float) -> float:
    number = _clean_number(value, default)
    return min(max(number, low), high)


def _estimate_rainfall_mm(
    *,
    season: str,
    drainage: str,
    moisture_percent: float | None,
    rainfall_mm: float | None,
) -> float:
    if rainfall_mm is not None:
        return _bounded_number(rainfall_mm, SEASON_RAINFALL_DEFAULTS["regular season"], 0.0, 400.0)

    rainfall = SEASON_RAINFALL_DEFAULTS.get(season, SEASON_RAINFALL_DEFAULTS["regular season"])
    if "water" in drainage:
        rainfall += 35.0
    elif drainage == "poor":
        rainfall += 20.0
    elif drainage == "good":
        rainfall -= 12.0

    if moisture_percent is not None:
        if moisture_percent >= 70:
            rainfall += 25.0
        elif moisture_percent <= 35:
            rainfall -= 25.0

    return min(max(rainfall, 20.0), 350.0)


def build_dataset_feature_record(
    manual_features: dict[str, float | str],
    metadata: dict[str, Any] | None = None,
    *,
    air_temperature_c: float | None = None,
    humidity_percent: float | None = None,
    rainfall_mm: float | None = None,
) -> dict[str, float]:
    metadata = metadata or {}
    nitrogen_level = str(manual_features["nitrogen_level"])
    phosphorus_level = str(manual_features["phosphorus_level"])
    potassium_level = str(manual_features["potassium_level"])
    moisture_percent = float(manual_features["moisture_percent"])
    soil_temperature_c = float(manual_features["soil_temperature_c"])

    temperature_source = air_temperature_c if air_temperature_c is not None else soil_temperature_c
    temperature = _bounded_number(temperature_source, NUMERIC_DEFAULTS["soil_temperature_c"], -10.0, 60.0)

    humidity_default = moisture_percent if moisture_percent is not None else 75.0
    humidity = _bounded_number(humidity_percent, humidity_default, 0.0, 100.0)
    ph = _bounded_number(manual_features["ph_level"], NUMERIC_DEFAULTS["ph_level"], 0.0, 14.0)

    return {
        "N": _metadata_nutrient_value(metadata, "N", nitrogen_level),
        "P": _metadata_nutrient_value(metadata, "P", phosphorus_level),
        "K": _metadata_nutrient_value(metadata, "K", potassium_level),
        "temperature": temperature,
        "humidity": humidity,
        "ph": ph,
        "rainfall": _estimate_rainfall_mm(
            season=str(manual_features["season"]),
            drainage=str(manual_features["drainage"]),
            moisture_percent=moisture_percent,
            rainfall_mm=rainfall_mm,
        ),
    }


def _display_crop_name(label: str, metadata: dict[str, Any]) -> str:
    display_names = metadata.get("class_display_names")
    if isinstance(display_names, dict):
        value = display_names.get(label)
        if value:
            return str(value)
    return label.replace("_", " ").title()


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
    air_temperature_c: float | None = None,
    humidity_percent: float | None = None,
    rainfall_mm: float | None = None,
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
    metadata = bundle.get("metadata") or {}
    model_features = build_dataset_feature_record(
        features,
        metadata,
        air_temperature_c=air_temperature_c if soil_temperature_c is None else None,
        humidity_percent=humidity_percent,
        rainfall_mm=rainfall_mm,
    )
    model_input = {**features, **model_features}
    try:
        probabilities = model.predict_proba([model_input])[0]
        classes = list(model.classes_)
    except Exception:
        logger.exception("Manual crop recommender prediction failed")
        return None

    ranked = sorted(
        (
            {
                "crop": _display_crop_name(str(crop), metadata),
                "raw_label": str(crop),
                "probability": round(float(probability), 4),
            }
            for crop, probability in zip(classes, probabilities, strict=False)
        ),
        key=lambda item: item["probability"],
        reverse=True,
    )

    return {
        "source": "kaggle_crop_recommendation_decision_tree",
        "model_version": metadata.get("model_version", "kaggle-crop-decision-tree-v1"),
        "model_type": metadata.get("model_type", "DecisionTreeClassifier"),
        "accuracy": metadata.get("accuracy"),
        "f1_score": metadata.get("f1_score"),
        "top_3_accuracy": metadata.get("top_3_accuracy"),
        "features": features,
        "model_features": model_features,
        "predictions": ranked,
    }
