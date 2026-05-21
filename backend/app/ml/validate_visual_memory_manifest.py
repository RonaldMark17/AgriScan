import argparse
import json
import sys
from pathlib import Path
from typing import Any

from register_visual_memory_examples import BACKEND_DIR, load_manifest, resolve_project_path


def derive_expected_output(item: dict[str, Any], detector) -> dict[str, Any]:
    class_key = detector._canonical_key_for_label(str(item.get("class_key") or "").strip())
    crop_label = item.get("expected_crop_label", item.get("crop_label"))
    expected_valid = bool(item.get("expected_valid", class_key != "invalid_crop_image"))

    if class_key == "invalid_crop_image":
        metadata = detector._metadata_for_key(class_key)
        return {
            "disease_name": metadata["name"],
            "crop_label": None,
            "is_valid_crop_image": False,
        }

    if crop_label is None:
        crop_label = detector._crop_label_from_key(class_key, crop_type=item.get("crop_type"))

    unsupported_crop = (
        isinstance(crop_label, str)
        and (
            crop_label.startswith("Possible ")
            or (
                detector._normalize_crop_type(crop_label) is None
                and class_key in {"healthy", "review_needed"}
            )
        )
    )

    if unsupported_crop and class_key in {"healthy", "review_needed"}:
        disease_name = "Possible healthy crop" if class_key == "healthy" else "Crop scan needs review"
    else:
        disease_name = str(item.get("expected_disease_name") or detector._metadata_for_key(class_key)["name"])

    return {
        "disease_name": disease_name,
        "crop_label": crop_label,
        "is_valid_crop_image": expected_valid,
    }


def validate_manifest_item(item: dict[str, Any], *, manifest_dir: Path, detector) -> dict[str, Any]:
    source_value = item.get("source_path") or item.get("path") or item.get("source_file")
    if not source_value:
        raise ValueError("Each manifest item must include 'source_path', 'path', or 'source_file'.")

    source_path = resolve_project_path(str(source_value), base_dir=manifest_dir)
    if not source_path.exists():
        raise FileNotFoundError(f"Source image not found: {source_path}")

    expected = derive_expected_output(item, detector)
    detection = detector.detect(
        str(source_path),
        crop_type=item.get("crop_type"),
        original_filename=source_path.name,
        allow_online_lookup=False,
    )

    actual = {
        "disease_name": detection.disease_name,
        "crop_label": detection.crop_label,
        "is_valid_crop_image": detection.disease_name != "Invalid crop or leaf image",
        "confidence": round(float(detection.confidence), 6),
        "analysis_mode": detection.analysis_mode,
    }

    checks = {
        "disease_name": actual["disease_name"] == expected["disease_name"],
        "crop_label": actual["crop_label"] == expected["crop_label"],
        "is_valid_crop_image": actual["is_valid_crop_image"] == expected["is_valid_crop_image"],
    }

    return {
        "id": str(item.get("id") or source_path.stem),
        "source_file": source_path.name,
        "source_path": str(source_path),
        "class_key": item.get("class_key"),
        "expected": expected,
        "actual": actual,
        "checks": checks,
        "passed": all(checks.values()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate AgriScan visual-memory examples and invalid-image examples from a JSON manifest."
    )
    parser.add_argument("--manifest", required=True, help="JSON file containing training and validation examples.")
    parser.add_argument("--report", help="Optional JSON file to write the validation report to.")
    args = parser.parse_args()

    backend_root = BACKEND_DIR.resolve()
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

    from app.services.ml_service import detector

    manifest_path = resolve_project_path(args.manifest)
    manifest_items = load_manifest(manifest_path)
    results = [
        validate_manifest_item(item, manifest_dir=manifest_path.parent, detector=detector)
        for item in manifest_items
    ]

    passed = sum(1 for item in results if item["passed"])
    failed = len(results) - passed
    report = {
        "manifest_path": str(manifest_path),
        "summary": {
            "total": len(results),
            "passed": passed,
            "failed": failed,
        },
        "results": results,
    }

    if args.report:
        report_path = resolve_project_path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report, indent=2))
    raise SystemExit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
