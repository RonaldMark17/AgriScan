from __future__ import annotations

import argparse
import csv
import json
import pickle
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlretrieve

from sklearn.feature_extraction import DictVectorizer
from sklearn.metrics import accuracy_score, f1_score, top_k_accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.tree import DecisionTreeClassifier

ML_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ML_DIR.parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.crop_recommender_model import (  # noqa: E402
    CATEGORICAL_DEFAULTS,
    CATEGORICAL_FEATURES,
    NUMERIC_DEFAULTS,
    NUMERIC_FEATURES,
)


KAGGLE_DATASET_URL = "https://www.kaggle.com/datasets/atharvaingle/crop-recommendation-dataset"
DOWNLOAD_URL = "https://huggingface.co/datasets/liaad/agricultural-data/resolve/main/Crop_recommendation.csv"
FEATURE_COLUMNS = ("N", "P", "K", "temperature", "humidity", "ph", "rainfall")
TARGET_COLUMN = "label"
REQUIRED_COLUMNS = (*FEATURE_COLUMNS, TARGET_COLUMN)

CROP_DISPLAY_NAMES = {
    "apple": "Apple",
    "banana": "Banana",
    "blackgram": "Black Gram",
    "chickpea": "Chickpea",
    "coconut": "Coconut",
    "coffee": "Coffee",
    "cotton": "Cotton",
    "grapes": "Grapes",
    "jute": "Jute",
    "kidneybeans": "Kidney Beans",
    "lentil": "Lentil",
    "maize": "Corn",
    "mango": "Mango",
    "mothbeans": "Moth Beans",
    "mungbean": "Mung Bean",
    "muskmelon": "Muskmelon",
    "orange": "Orange",
    "papaya": "Papaya",
    "pigeonpeas": "Pigeon Peas",
    "pomegranate": "Pomegranate",
    "rice": "Rice",
    "watermelon": "Watermelon",
}


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


def display_crop_name(label: str) -> str:
    key = label.strip().lower().replace(" ", "")
    return CROP_DISPLAY_NAMES.get(key, label.replace("_", " ").title())


def download_dataset(dataset_path: Path, *, force: bool = False) -> None:
    if dataset_path.exists() and not force:
        return

    dataset_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        print(f"Downloading crop recommendation dataset from {DOWNLOAD_URL}")
        urlretrieve(DOWNLOAD_URL, dataset_path)
    except (OSError, URLError) as exc:
        if dataset_path.exists():
            return
        raise SystemExit(
            "Could not download the crop recommendation CSV. "
            f"Download it from {KAGGLE_DATASET_URL} and save it as {dataset_path}."
        ) from exc


def _clean_label(value: str | None) -> str:
    return (value or "").strip().lower().replace(" ", "")


def _clean_float(value: str | None) -> float | None:
    try:
        return float((value or "").strip())
    except ValueError:
        return None


def _is_valid_record(record: dict[str, float]) -> bool:
    return (
        record["N"] >= 0
        and record["P"] >= 0
        and record["K"] >= 0
        and -10 <= record["temperature"] <= 60
        and 0 <= record["humidity"] <= 100
        and 0 <= record["ph"] <= 14
        and record["rainfall"] >= 0
    )


def load_clean_dataset(dataset_path: Path) -> tuple[list[dict[str, float]], list[str], dict[str, int]]:
    if not dataset_path.exists():
        raise SystemExit(f"Dataset CSV was not found at {dataset_path}")

    records: list[dict[str, float]] = []
    labels: list[str] = []
    seen: set[tuple] = set()
    raw_rows = 0
    dropped_rows = 0

    with dataset_path.open(newline="", encoding="utf-8-sig") as csv_file:
        reader = csv.DictReader(csv_file)
        columns = set(reader.fieldnames or [])
        missing_columns = [column for column in REQUIRED_COLUMNS if column not in columns]
        if missing_columns:
            raise SystemExit(f"Dataset is missing required columns: {', '.join(missing_columns)}")

        for row in reader:
            raw_rows += 1
            label = _clean_label(row.get(TARGET_COLUMN))
            numeric = {column: _clean_float(row.get(column)) for column in FEATURE_COLUMNS}
            if not label or any(value is None for value in numeric.values()):
                dropped_rows += 1
                continue

            record = {column: float(numeric[column]) for column in FEATURE_COLUMNS}
            if not _is_valid_record(record):
                dropped_rows += 1
                continue

            key = (*[round(record[column], 5) for column in FEATURE_COLUMNS], label)
            if key in seen:
                continue
            seen.add(key)
            records.append(record)
            labels.append(label)

    if not records:
        raise SystemExit("No usable crop recommendation rows remained after cleaning.")

    return records, labels, {
        "raw_rows": raw_rows,
        "clean_rows": len(records),
        "dropped_rows": dropped_rows,
        "duplicate_rows_removed": raw_rows - dropped_rows - len(records),
    }


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    position = (len(sorted_values) - 1) * fraction
    lower_index = int(position)
    upper_index = min(lower_index + 1, len(sorted_values) - 1)
    weight = position - lower_index
    return sorted_values[lower_index] * (1 - weight) + sorted_values[upper_index] * weight


def build_feature_metadata(records: list[dict[str, float]]) -> dict:
    feature_ranges = {
        column: {
            "min": round(min(record[column] for record in records), 3),
            "max": round(max(record[column] for record in records), 3),
            "mean": round(sum(record[column] for record in records) / len(records), 3),
        }
        for column in FEATURE_COLUMNS
    }
    nutrient_level_values = {}
    for column in ("N", "P", "K"):
        values = [record[column] for record in records]
        nutrient_level_values[column] = {
            "low": round(percentile(values, 0.25), 2),
            "medium": round(percentile(values, 0.50), 2),
            "high": round(percentile(values, 0.75), 2),
        }
    return {
        "feature_ranges": feature_ranges,
        "nutrient_level_values": nutrient_level_values,
    }


def train_model(
    records: list[dict[str, float]],
    labels: list[str],
    *,
    seed: int,
    test_size: float,
    max_depth: int | None,
    min_samples_leaf: int,
) -> tuple[Pipeline, dict]:
    train_records, test_records, train_labels, test_labels = train_test_split(
        records,
        labels,
        test_size=test_size,
        random_state=seed,
        stratify=labels,
    )

    model = Pipeline(
        steps=[
            ("vectorizer", DictVectorizer(sparse=False)),
            (
                "classifier",
                DecisionTreeClassifier(
                    criterion="gini",
                    max_depth=max_depth,
                    min_samples_leaf=min_samples_leaf,
                    random_state=seed,
                ),
            ),
        ]
    )
    model.fit(train_records, train_labels)

    predictions = model.predict(test_records)
    probabilities = model.predict_proba(test_records)
    raw_classes = [str(item) for item in model.classes_]
    top_k = min(3, len(raw_classes))
    metrics = {
        "accuracy": round(float(accuracy_score(test_labels, predictions)), 4),
        "f1_score": round(float(f1_score(test_labels, predictions, average="macro")), 4),
        "top_3_accuracy": round(float(top_k_accuracy_score(test_labels, probabilities, k=top_k, labels=raw_classes)), 4),
        "train_samples": len(train_records),
        "test_samples": len(test_records),
        "raw_classes": raw_classes,
        "classes": [display_crop_name(label) for label in raw_classes],
    }
    return model, metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the AgriScan crop recommender on a public crop dataset.")
    parser.add_argument("--data", default="app/ml/datasets/crop_recommendation/Crop_recommendation.csv")
    parser.add_argument("--no-download", action="store_true", help="Use only the local CSV and do not download a copy.")
    parser.add_argument("--force-download", action="store_true", help="Refresh the local CSV before training.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--test-size", type=float, default=0.2)
    parser.add_argument("--max-depth", type=int, default=14)
    parser.add_argument("--min-samples-leaf", type=int, default=2)
    parser.add_argument("--output", default="app/ml/artifacts/manual_crop_recommender.pkl")
    parser.add_argument("--metadata-output", default="app/ml/artifacts/manual_crop_recommender_metadata.json")
    args = parser.parse_args()

    dataset_path = resolve_project_path(args.data)
    if not args.no_download:
        download_dataset(dataset_path, force=args.force_download)

    records, labels, dataset_stats = load_clean_dataset(dataset_path)
    model, metrics = train_model(
        records,
        labels,
        seed=args.seed,
        test_size=args.test_size,
        max_depth=args.max_depth,
        min_samples_leaf=args.min_samples_leaf,
    )

    output_path = resolve_project_path(args.output)
    metadata_path = resolve_project_path(args.metadata_output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("wb") as model_file:
        pickle.dump(model, model_file)

    feature_metadata = build_feature_metadata(records)
    class_display_names = {label: display_crop_name(label) for label in metrics["raw_classes"]}
    metadata = {
        "model_version": "kaggle-crop-decision-tree-v1",
        "model_type": "sklearn.pipeline.DictVectorizer+DecisionTreeClassifier",
        "algorithm": "DecisionTreeClassifier",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "training_source": "Kaggle Crop Recommendation Dataset",
        "dataset_source_url": KAGGLE_DATASET_URL,
        "dataset_download_url": DOWNLOAD_URL,
        "dataset_local_path": str(dataset_path),
        "dataset_note": (
            "Public crop recommendation CSV with soil nutrient and climate features. "
            "Columns are N, P, K, temperature, humidity, ph, rainfall, and label."
        ),
        "preprocessing": [
            "Validated required columns.",
            "Converted numeric feature columns to float.",
            "Dropped rows with missing labels, invalid numbers, impossible pH, humidity, temperature, or rainfall values.",
            "Removed exact duplicate feature-target rows.",
            "Split data with stratified train/test sampling.",
        ],
        "input_features": list(FEATURE_COLUMNS),
        "target_variable": TARGET_COLUMN,
        "feature_schema": {
            "dataset_numeric": list(FEATURE_COLUMNS),
            "manual_numeric": list(NUMERIC_FEATURES),
            "manual_categorical": list(CATEGORICAL_FEATURES),
            "numeric_defaults": NUMERIC_DEFAULTS,
            "categorical_defaults": CATEGORICAL_DEFAULTS,
        },
        "manual_input_mapping": {
            "nitrogen_level": "N",
            "phosphorus_level": "P",
            "potassium_level": "K",
            "soil_temperature_c": "temperature",
            "moisture_percent": "humidity when live weather humidity is unavailable",
            "ph_level": "ph",
            "season/drainage/moisture/weather": "rainfall",
        },
        "class_display_names": class_display_names,
        **feature_metadata,
        **dataset_stats,
        **metrics,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"Saved Manual Scan crop model: {output_path}")
    print(f"Saved metadata: {metadata_path}")
    print(f"Dataset rows: {dataset_stats['clean_rows']} clean / {dataset_stats['raw_rows']} raw")
    print(f"Accuracy: {metrics['accuracy']:.4f}")
    print(f"Macro F1: {metrics['f1_score']:.4f}")
    print(f"Top-3 accuracy: {metrics['top_3_accuracy']:.4f}")
    print(f"Classes: {', '.join(metrics['classes'])}")


if __name__ == "__main__":
    main()
