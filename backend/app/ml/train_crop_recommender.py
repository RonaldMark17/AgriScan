from __future__ import annotations

import argparse
import json
import pickle
import random
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.feature_extraction import DictVectorizer
from sklearn.metrics import accuracy_score, top_k_accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

ML_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ML_DIR.parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.crop_recommender_model import (  # noqa: E402
    CATEGORICAL_DEFAULTS,
    CATEGORICAL_FEATURES,
    NUMERIC_DEFAULTS,
    NUMERIC_FEATURES,
    normalize_manual_scan_features,
)


@dataclass(frozen=True)
class CropProfile:
    crop: str
    soil_types: tuple[str, ...]
    ph_range: tuple[float, float]
    moisture_range: tuple[float, float]
    soil_temperature_range: tuple[float, float]
    nitrogen_levels: tuple[str, ...]
    phosphorus_levels: tuple[str, ...]
    potassium_levels: tuple[str, ...]
    drainage: tuple[str, ...]
    sunlight: tuple[str, ...]
    seasons: tuple[str, ...]


SOIL_TYPES = ("loam", "sandy loam", "clay loam", "clay", "sandy", "alluvial")
NUTRIENT_LEVELS = ("low", "medium", "high")
DRAINAGE_VALUES = ("good", "moderate", "poor", "waterlogged")
SUNLIGHT_VALUES = ("full sun", "partial shade")
SEASON_VALUES = ("regular season", "wet season", "dry season")

PH_RANGE = (4.7, 8.1)
MOISTURE_RANGE = (20.0, 95.0)
SOIL_TEMPERATURE_RANGE = (18.0, 36.0)

CROP_PROFILES = (
    CropProfile(
        crop="Rice",
        soil_types=("clay", "clay loam", "alluvial"),
        ph_range=(5.2, 7.0),
        moisture_range=(65.0, 95.0),
        soil_temperature_range=(22.0, 32.0),
        nitrogen_levels=("medium", "high"),
        phosphorus_levels=("medium",),
        potassium_levels=("medium", "high"),
        drainage=("poor", "waterlogged", "moderate"),
        sunlight=("full sun",),
        seasons=("wet season", "regular season"),
    ),
    CropProfile(
        crop="Corn",
        soil_types=("loam", "sandy loam", "alluvial"),
        ph_range=(5.8, 7.2),
        moisture_range=(40.0, 65.0),
        soil_temperature_range=(24.0, 34.0),
        nitrogen_levels=("medium", "high"),
        phosphorus_levels=("medium", "high"),
        potassium_levels=("medium", "high"),
        drainage=("good", "moderate"),
        sunlight=("full sun",),
        seasons=("regular season", "dry season"),
    ),
    CropProfile(
        crop="Tomato",
        soil_types=("loam", "sandy loam"),
        ph_range=(6.0, 7.2),
        moisture_range=(45.0, 65.0),
        soil_temperature_range=(20.0, 29.0),
        nitrogen_levels=("medium",),
        phosphorus_levels=("medium", "high"),
        potassium_levels=("medium", "high"),
        drainage=("good",),
        sunlight=("full sun",),
        seasons=("dry season", "regular season"),
    ),
    CropProfile(
        crop="Eggplant",
        soil_types=("loam", "clay loam", "sandy loam"),
        ph_range=(5.5, 7.0),
        moisture_range=(45.0, 70.0),
        soil_temperature_range=(24.0, 34.0),
        nitrogen_levels=("medium", "high"),
        phosphorus_levels=("medium",),
        potassium_levels=("medium", "high"),
        drainage=("good", "moderate"),
        sunlight=("full sun",),
        seasons=("regular season", "dry season"),
    ),
    CropProfile(
        crop="Pechay",
        soil_types=("loam", "clay loam"),
        ph_range=(6.0, 7.0),
        moisture_range=(45.0, 75.0),
        soil_temperature_range=(18.0, 28.0),
        nitrogen_levels=("medium", "high"),
        phosphorus_levels=("medium",),
        potassium_levels=("medium",),
        drainage=("good", "moderate"),
        sunlight=("full sun", "partial shade"),
        seasons=("regular season", "wet season"),
    ),
    CropProfile(
        crop="Cassava",
        soil_types=("sandy", "sandy loam", "loam"),
        ph_range=(5.0, 7.0),
        moisture_range=(25.0, 55.0),
        soil_temperature_range=(25.0, 35.0),
        nitrogen_levels=("low", "medium"),
        phosphorus_levels=("low", "medium"),
        potassium_levels=("medium", "high"),
        drainage=("good", "moderate"),
        sunlight=("full sun",),
        seasons=("dry season", "regular season"),
    ),
    CropProfile(
        crop="Mung Bean",
        soil_types=("sandy loam", "loam"),
        ph_range=(6.0, 7.5),
        moisture_range=(25.0, 50.0),
        soil_temperature_range=(25.0, 35.0),
        nitrogen_levels=("low",),
        phosphorus_levels=("medium",),
        potassium_levels=("medium",),
        drainage=("good",),
        sunlight=("full sun",),
        seasons=("dry season", "regular season"),
    ),
    CropProfile(
        crop="Sweet Potato",
        soil_types=("sandy", "sandy loam", "loam"),
        ph_range=(5.5, 6.8),
        moisture_range=(30.0, 60.0),
        soil_temperature_range=(23.0, 33.0),
        nitrogen_levels=("low", "medium"),
        phosphorus_levels=("medium",),
        potassium_levels=("high",),
        drainage=("good", "moderate"),
        sunlight=("full sun",),
        seasons=("regular season", "wet season", "dry season"),
    ),
    CropProfile(
        crop="Gabi / Taro",
        soil_types=("clay", "clay loam", "alluvial"),
        ph_range=(5.5, 7.0),
        moisture_range=(70.0, 95.0),
        soil_temperature_range=(22.0, 32.0),
        nitrogen_levels=("medium",),
        phosphorus_levels=("medium",),
        potassium_levels=("medium", "high"),
        drainage=("poor", "waterlogged", "moderate"),
        sunlight=("partial shade", "full sun"),
        seasons=("wet season", "regular season"),
    ),
)


def resolve_project_path(path_str: str) -> Path:
    path = Path(path_str)
    if path.is_absolute():
        return path
    if path.parts and path.parts[0] in {"app", "uploads"}:
        return (BACKEND_DIR / path).resolve()
    cwd_path = (Path.cwd() / path).resolve()
    if cwd_path.exists() or str(path).startswith("."):
        return cwd_path
    return (BACKEND_DIR / path).resolve()


def _weighted_choice(rng: random.Random, preferred: tuple[str, ...], all_values: tuple[str, ...], noise: float) -> str:
    if rng.random() < noise:
        return rng.choice(all_values)
    return rng.choice(preferred)


def _sample_number(
    rng: random.Random,
    preferred_range: tuple[float, float],
    full_range: tuple[float, float],
    noise: float,
    precision: int = 1,
) -> float:
    if rng.random() < noise:
        value = rng.uniform(*full_range)
    else:
        value = rng.uniform(*preferred_range)
    return round(value, precision)


def _profile_match_score(record: dict[str, Any], profile: CropProfile) -> float:
    score = 0.0
    score += 12 if record["soil_type"] in profile.soil_types else -4
    score += 8 if record["nitrogen_level"] in profile.nitrogen_levels else -2
    score += 6 if record["phosphorus_level"] in profile.phosphorus_levels else -1
    score += 7 if record["potassium_level"] in profile.potassium_levels else -2
    score += 11 if record["drainage"] in profile.drainage else -5
    score += 6 if record["sunlight"] in profile.sunlight else -3
    score += 8 if record["season"] in profile.seasons else -2

    numeric_ranges = (
        ("ph_level", profile.ph_range, 7),
        ("moisture_percent", profile.moisture_range, 10),
        ("soil_temperature_c", profile.soil_temperature_range, 8),
    )
    for key, value_range, weight in numeric_ranges:
        value = float(record[key])
        low, high = value_range
        if low <= value <= high:
            score += weight
        else:
            distance = min(abs(value - low), abs(value - high))
            score -= min(weight, distance)
    return score


def _label_random_record(record: dict[str, Any]) -> str:
    return max(CROP_PROFILES, key=lambda profile: _profile_match_score(record, profile)).crop


def _sample_profile_record(rng: random.Random, profile: CropProfile, noise: float) -> dict[str, Any]:
    return normalize_manual_scan_features(
        soil_type=_weighted_choice(rng, profile.soil_types, SOIL_TYPES, noise),
        ph_level=_sample_number(rng, profile.ph_range, PH_RANGE, noise),
        moisture_percent=_sample_number(rng, profile.moisture_range, MOISTURE_RANGE, noise),
        soil_temperature_c=_sample_number(rng, profile.soil_temperature_range, SOIL_TEMPERATURE_RANGE, noise),
        nitrogen_level=_weighted_choice(rng, profile.nitrogen_levels, NUTRIENT_LEVELS, noise),
        phosphorus_level=_weighted_choice(rng, profile.phosphorus_levels, NUTRIENT_LEVELS, noise),
        potassium_level=_weighted_choice(rng, profile.potassium_levels, NUTRIENT_LEVELS, noise),
        drainage=_weighted_choice(rng, profile.drainage, DRAINAGE_VALUES, noise),
        sunlight=_weighted_choice(rng, profile.sunlight, SUNLIGHT_VALUES, noise),
        season=_weighted_choice(rng, profile.seasons, SEASON_VALUES, noise),
    )


def _sample_random_record(rng: random.Random) -> dict[str, Any]:
    return normalize_manual_scan_features(
        soil_type=rng.choice(SOIL_TYPES),
        ph_level=_sample_number(rng, PH_RANGE, PH_RANGE, noise=1.0),
        moisture_percent=_sample_number(rng, MOISTURE_RANGE, MOISTURE_RANGE, noise=1.0),
        soil_temperature_c=_sample_number(rng, SOIL_TEMPERATURE_RANGE, SOIL_TEMPERATURE_RANGE, noise=1.0),
        nitrogen_level=rng.choice(NUTRIENT_LEVELS),
        phosphorus_level=rng.choice(NUTRIENT_LEVELS),
        potassium_level=rng.choice(NUTRIENT_LEVELS),
        drainage=rng.choice(DRAINAGE_VALUES),
        sunlight=rng.choice(SUNLIGHT_VALUES),
        season=rng.choice(SEASON_VALUES),
    )


def build_training_data(samples_per_crop: int, random_samples: int, seed: int) -> tuple[list[dict[str, Any]], list[str]]:
    rng = random.Random(seed)
    records: list[dict[str, Any]] = []
    labels: list[str] = []

    for profile in CROP_PROFILES:
        for _ in range(samples_per_crop):
            record = _sample_profile_record(rng, profile, noise=0.18)
            records.append(record)
            labels.append(_label_random_record(record))

    for _ in range(random_samples):
        record = _sample_random_record(rng)
        records.append(record)
        labels.append(_label_random_record(record))

    combined = list(zip(records, labels, strict=False))
    rng.shuffle(combined)
    shuffled_records, shuffled_labels = zip(*combined, strict=False)
    return list(shuffled_records), list(shuffled_labels)


def train_model(records: list[dict[str, Any]], labels: list[str], seed: int) -> tuple[Pipeline, dict[str, Any]]:
    train_records, test_records, train_labels, test_labels = train_test_split(
        records,
        labels,
        test_size=0.2,
        random_state=seed,
        stratify=labels,
    )
    model = Pipeline(
        steps=[
            ("vectorizer", DictVectorizer(sparse=False)),
            (
                "classifier",
                HistGradientBoostingClassifier(
                    max_iter=220,
                    learning_rate=0.08,
                    max_leaf_nodes=31,
                    l2_regularization=0.02,
                    random_state=seed,
                ),
            ),
        ]
    )
    model.fit(train_records, train_labels)

    predictions = model.predict(test_records)
    probabilities = model.predict_proba(test_records)
    classes = list(model.classes_)
    metrics = {
        "accuracy": round(float(accuracy_score(test_labels, predictions)), 4),
        "top_3_accuracy": round(float(top_k_accuracy_score(test_labels, probabilities, k=3, labels=classes)), 4),
        "train_samples": len(train_records),
        "test_samples": len(test_records),
        "classes": classes,
    }
    return model, metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the AgriScan Manual Scan crop recommendation model.")
    parser.add_argument("--samples-per-crop", type=int, default=1400)
    parser.add_argument("--random-samples", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", default="app/ml/artifacts/manual_crop_recommender.pkl")
    parser.add_argument("--metadata-output", default="app/ml/artifacts/manual_crop_recommender_metadata.json")
    args = parser.parse_args()

    records, labels = build_training_data(args.samples_per_crop, args.random_samples, args.seed)
    model, metrics = train_model(records, labels, args.seed)

    output_path = resolve_project_path(args.output)
    metadata_path = resolve_project_path(args.metadata_output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("wb") as model_file:
        pickle.dump(model, model_file)

    metadata = {
        "model_version": "manual-scan-hgb-v1",
        "model_type": "sklearn.pipeline.DictVectorizer+HistGradientBoostingClassifier",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_source": "generated_philippine_manual_scan_profiles",
        "training_note": (
            "No public dataset was found with all AgriScan Manual Scan fields, so this model is trained "
            "from generated agronomic crop suitability profiles and random boundary cases."
        ),
        "feature_schema": {
            "numeric": list(NUMERIC_FEATURES),
            "categorical": list(CATEGORICAL_FEATURES),
            "numeric_defaults": NUMERIC_DEFAULTS,
            "categorical_defaults": CATEGORICAL_DEFAULTS,
        },
        "categorical_values": {
            "soil_type": list(SOIL_TYPES),
            "nutrient_levels": list(NUTRIENT_LEVELS),
            "drainage": list(DRAINAGE_VALUES),
            "sunlight": list(SUNLIGHT_VALUES),
            "season": list(SEASON_VALUES),
        },
        "numeric_ranges": {
            "ph_level": list(PH_RANGE),
            "moisture_percent": list(MOISTURE_RANGE),
            "soil_temperature_c": list(SOIL_TEMPERATURE_RANGE),
        },
        **metrics,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"Saved Manual Scan crop model: {output_path}")
    print(f"Saved metadata: {metadata_path}")
    print(f"Accuracy: {metrics['accuracy']:.4f}")
    print(f"Top-3 accuracy: {metrics['top_3_accuracy']:.4f}")
    print(f"Classes: {', '.join(metrics['classes'])}")


if __name__ == "__main__":
    main()
