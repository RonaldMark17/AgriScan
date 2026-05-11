import argparse
import json
import shutil
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ML_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ML_DIR.parents[1]
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "agriscan.sqlite3"
DEFAULT_OUTPUT_DIR = ML_DIR / "datasets" / "feedback_verified"


def sanitize_class_name(value: str) -> str:
    safe = "".join(char.lower() if char.isalnum() else "_" for char in value.strip())
    safe = "_".join(part for part in safe.split("_") if part)
    return safe or "review_needed"


def resolve_image_path(value: str | None) -> Path | None:
    if not value or value == "manual-entry":
        return None
    path = Path(value)
    if path.is_absolute():
        return path
    return (BACKEND_DIR / path).resolve()


def split_name(feedback_id: int, validation_ratio: float) -> str:
    if validation_ratio <= 0:
        return "train"
    bucket = feedback_id % 100
    return "val" if bucket < int(validation_ratio * 100) else "train"


def fetch_feedback_rows(database: Path) -> list[sqlite3.Row]:
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    try:
        return list(
            connection.execute(
                """
                SELECT
                    f.id AS feedback_id,
                    f.scan_id,
                    f.user_id,
                    f.corrected_crop_label,
                    f.corrected_disease_name,
                    f.corrected_class_key,
                    f.verification_status,
                    f.verification_reason,
                    f.created_at,
                    s.image_path,
                    s.disease_name AS original_disease_name,
                    s.crop_label AS original_crop_label
                FROM scan_feedback f
                JOIN scans s ON s.id = f.scan_id
                WHERE s.image_path IS NOT NULL
                ORDER BY f.id
                """
            )
        )
    finally:
        connection.close()


def export_dataset(database: Path, output_dir: Path, *, include_rejected: bool, validation_ratio: float, clean: bool) -> dict:
    if clean and output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    rows = fetch_feedback_rows(database)
    verified_count_by_class: Counter[str] = Counter()
    split_counts: Counter[str] = Counter()
    rejected_manifest: list[dict] = []
    missing_images: list[dict] = []

    for row in rows:
        image_path = resolve_image_path(row["image_path"])
        if image_path is None or not image_path.exists():
            missing_images.append(
                {
                    "feedback_id": row["feedback_id"],
                    "scan_id": row["scan_id"],
                    "image_path": row["image_path"],
                    "status": row["verification_status"],
                }
            )
            continue

        class_key = sanitize_class_name(row["corrected_class_key"] or row["corrected_disease_name"])
        manifest_item = {
            "feedback_id": row["feedback_id"],
            "scan_id": row["scan_id"],
            "user_id": row["user_id"],
            "source_image": str(image_path),
            "corrected_class_key": class_key,
            "corrected_crop_label": row["corrected_crop_label"],
            "corrected_disease_name": row["corrected_disease_name"],
            "original_crop_label": row["original_crop_label"],
            "original_disease_name": row["original_disease_name"],
            "verification_status": row["verification_status"],
            "verification_reason": row["verification_reason"],
            "created_at": row["created_at"],
        }

        if row["verification_status"] == "verified":
            split = split_name(int(row["feedback_id"]), validation_ratio)
            destination_dir = output_dir / split / class_key
            destination_dir.mkdir(parents=True, exist_ok=True)
            suffix = image_path.suffix.lower() or ".jpg"
            destination = destination_dir / f"feedback_{row['feedback_id']}_scan_{row['scan_id']}{suffix}"
            shutil.copy2(image_path, destination)
            verified_count_by_class[class_key] += 1
            split_counts[split] += 1
            manifest_item["exported_path"] = str(destination)
        elif include_rejected:
            rejected_manifest.append(manifest_item)

    manifest = {
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "database": str(database),
        "output_dir": str(output_dir),
        "verified_samples": sum(verified_count_by_class.values()),
        "verified_class_counts": dict(sorted(verified_count_by_class.items())),
        "split_counts": dict(sorted(split_counts.items())),
        "rejected_samples": len(rejected_manifest),
        "missing_images": missing_images,
        "note": (
            "Use this exported dataset as verified local training data. "
            "Rejected rows are hard negatives for review and should not be copied into disease classes."
        ),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    if include_rejected:
        hard_negative_path = output_dir / "rejected_hard_negatives.jsonl"
        hard_negative_path.write_text(
            "\n".join(json.dumps(item, ensure_ascii=False) for item in rejected_manifest) + ("\n" if rejected_manifest else ""),
            encoding="utf-8",
        )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Export accepted admin feedback into a retraining dataset.")
    parser.add_argument("--database", default=str(DEFAULT_DB_PATH), help="Path to the AgriScan SQLite database.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_DIR), help="Output dataset folder.")
    parser.add_argument("--include-rejected", action="store_true", help="Write rejected reviews as hard-negative JSONL metadata.")
    parser.add_argument("--validation-ratio", type=float, default=0.2, help="Deterministic validation split ratio from 0 to 0.5.")
    parser.add_argument("--clean", action="store_true", help="Remove the output folder before exporting.")
    args = parser.parse_args()

    database = Path(args.database).resolve()
    output = Path(args.output).resolve()
    if not database.exists():
        raise SystemExit(f"Database not found: {database}")
    validation_ratio = min(max(args.validation_ratio, 0.0), 0.5)
    manifest = export_dataset(
        database,
        output,
        include_rejected=args.include_rejected,
        validation_ratio=validation_ratio,
        clean=args.clean,
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
