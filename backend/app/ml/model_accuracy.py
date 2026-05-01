from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ML_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = ML_DIR / "artifacts"

DISEASE_METRICS_PATH = ARTIFACTS_DIR / "training_metrics.json"
DISEASE_MODEL_PATH = ARTIFACTS_DIR / "crop_disease_model.keras"
DISEASE_LABELS_PATH = ARTIFACTS_DIR / "labels.json"

CROP_RECOMMENDER_METADATA_PATH = ARTIFACTS_DIR / "manual_crop_recommender_metadata.json"
CROP_RECOMMENDER_MODEL_PATH = ARTIFACTS_DIR / "manual_crop_recommender.pkl"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def percent(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "not available"
    return f"{number * 100:.2f}%"


def compact_classes(classes: Any, limit: int = 8) -> str:
    if not isinstance(classes, list) or not classes:
        return "not available"
    names = [str(item) for item in classes]
    preview = ", ".join(names[:limit])
    if len(names) > limit:
        preview += f", +{len(names) - limit} more"
    return preview


def file_status(path: Path) -> str:
    return "found" if path.exists() else "missing"


def build_report() -> dict[str, Any]:
    disease_metrics = read_json(DISEASE_METRICS_PATH)
    crop_metadata = read_json(CROP_RECOMMENDER_METADATA_PATH)

    disease_classes = disease_metrics.get("classes", [])
    crop_classes = crop_metadata.get("classes", [])

    return {
        "plant_disease_detector": {
            "model_file": str(DISEASE_MODEL_PATH),
            "model_status": file_status(DISEASE_MODEL_PATH),
            "metrics_file": str(DISEASE_METRICS_PATH),
            "metrics_status": file_status(DISEASE_METRICS_PATH),
            "labels_status": file_status(DISEASE_LABELS_PATH),
            "training_accuracy": disease_metrics.get("last_train_accuracy"),
            "validation_accuracy": disease_metrics.get("last_val_accuracy"),
            "class_count": len(disease_classes) if isinstance(disease_classes, list) else 0,
            "classes": disease_classes if isinstance(disease_classes, list) else [],
        },
        "manual_scan_crop_recommender": {
            "model_file": str(CROP_RECOMMENDER_MODEL_PATH),
            "model_status": file_status(CROP_RECOMMENDER_MODEL_PATH),
            "metrics_file": str(CROP_RECOMMENDER_METADATA_PATH),
            "metrics_status": file_status(CROP_RECOMMENDER_METADATA_PATH),
            "accuracy": crop_metadata.get("accuracy"),
            "top_3_accuracy": crop_metadata.get("top_3_accuracy"),
            "train_samples": crop_metadata.get("train_samples"),
            "test_samples": crop_metadata.get("test_samples"),
            "class_count": len(crop_classes) if isinstance(crop_classes, list) else 0,
            "classes": crop_classes if isinstance(crop_classes, list) else [],
            "training_source": crop_metadata.get("training_source"),
            "training_note": crop_metadata.get("training_note"),
        },
    }


def print_report(report: dict[str, Any]) -> None:
    disease = report["plant_disease_detector"]
    crop = report["manual_scan_crop_recommender"]

    print("AgriScan Model Accuracy")
    print("======================")
    print()

    print("Plant Disease Detector")
    print("----------------------")
    print(f"Model file: {disease['model_status']} ({disease['model_file']})")
    print(f"Metrics file: {disease['metrics_status']} ({disease['metrics_file']})")
    print(f"Labels file: {disease['labels_status']}")
    print(f"Training accuracy: {percent(disease['training_accuracy'])}")
    print(f"Validation accuracy: {percent(disease['validation_accuracy'])}")
    print(f"Classes: {disease['class_count']} ({compact_classes(disease['classes'])})")
    print()

    print("Manual Scan Crop Recommender")
    print("----------------------------")
    print(f"Model file: {crop['model_status']} ({crop['model_file']})")
    print(f"Metrics file: {crop['metrics_status']} ({crop['metrics_file']})")
    print(f"Accuracy: {percent(crop['accuracy'])}")
    print(f"Top-3 accuracy: {percent(crop['top_3_accuracy'])}")
    print(f"Samples: {crop['train_samples'] or 'not available'} train, {crop['test_samples'] or 'not available'} test")
    print(f"Classes: {crop['class_count']} ({compact_classes(crop['classes'])})")
    if crop.get("training_source"):
        print(f"Training source: {crop['training_source']}")
    if crop.get("training_note"):
        print(f"Note: {crop['training_note']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Show saved AgriScan ML model accuracy metrics.")
    parser.add_argument("--json", action="store_true", help="Print the full report as JSON.")
    args = parser.parse_args()

    report = build_report()
    if args.json:
        print(json.dumps(report, indent=2))
        return
    print_report(report)


if __name__ == "__main__":
    main()
