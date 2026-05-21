import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path


ML_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ML_DIR.parents[1]


def resolve_project_path(path_str: str, *, base_dir: Path | None = None) -> Path:
    path = Path(path_str)
    if path.is_absolute():
        return path.resolve()
    if base_dir is not None:
        candidate = (base_dir / path).resolve()
        if candidate.exists():
            return candidate
    if path.parts and path.parts[0] == "backend":
        return (BACKEND_DIR.parent / path).resolve()
    if path.parts and path.parts[0] in {"app", "uploads", "data"}:
        return (BACKEND_DIR / path).resolve()
    cwd_path = (Path.cwd() / path).resolve()
    if cwd_path.exists() or str(path).startswith("."):
        return cwd_path
    return (BACKEND_DIR / path).resolve()


def load_manifest(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("examples"), list):
        return payload["examples"]
    raise SystemExit("Manifest must be a JSON list or an object with an 'examples' list.")


def build_example(
    item: dict,
    *,
    detector,
    manifest_dir: Path,
) -> dict:
    source_value = item.get("source_path") or item.get("path") or item.get("source_file")
    if not source_value:
        raise ValueError("Each manifest item must include 'source_path', 'path', or 'source_file'.")

    source_path = resolve_project_path(str(source_value), base_dir=manifest_dir)
    if not source_path.exists():
        raise FileNotFoundError(f"Source image not found: {source_path}")

    class_key = str(item.get("class_key") or "").strip()
    if not class_key:
        raise ValueError(f"Missing class_key for {source_path.name}")

    features = detector._extract_leaf_features(str(source_path))
    signature = detector._visual_memory_signature(features)

    example = {
        "id": str(item.get("id") or source_path.stem),
        "class_key": class_key,
        "crop_label": item.get("crop_label"),
        "confidence": float(item.get("confidence", 0.9)),
        "match_threshold": float(item.get("match_threshold", 0.085)),
        "source_file": source_path.name,
        "feature_signature": signature,
    }

    if item.get("crop_scope"):
        example["crop_scope"] = str(item["crop_scope"])

    return example


def upsert_examples(existing_examples: list[dict], new_examples: list[dict]) -> tuple[list[dict], int, int]:
    updated = list(existing_examples)
    added_count = 0
    updated_count = 0

    def match_index(candidate: dict) -> int | None:
        candidate_id = str(candidate.get("id") or "").strip().lower()
        candidate_source = str(candidate.get("source_file") or "").strip().lower()
        candidate_class = str(candidate.get("class_key") or "").strip().lower()
        for index, current in enumerate(updated):
            current_id = str(current.get("id") or "").strip().lower()
            current_source = str(current.get("source_file") or "").strip().lower()
            current_class = str(current.get("class_key") or "").strip().lower()
            if candidate_id and current_id == candidate_id:
                return index
            if candidate_source and candidate_class and current_source == candidate_source and current_class == candidate_class:
                return index
        return None

    for example in new_examples:
        index = match_index(example)
        if index is None:
            updated.append(example)
            added_count += 1
        else:
            updated[index] = example
            updated_count += 1

    return updated, added_count, updated_count


def backup_memory_file(path: Path) -> Path | None:
    if not path.exists():
        return None
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_path = path.with_name(f"{path.stem}.backup_{timestamp}{path.suffix}")
    shutil.copy2(path, backup_path)
    return backup_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Append or update verified AgriScan visual-memory examples from a local JSON manifest.")
    parser.add_argument("--manifest", required=True, help="JSON file containing the examples to register.")
    parser.add_argument("--memory", default="app/ml/artifacts/visual_memory_examples.json", help="Target visual-memory JSON file.")
    parser.add_argument("--backup", action="store_true", help="Create a timestamped backup before writing changes.")
    args = parser.parse_args()

    backend_root = BACKEND_DIR.resolve()
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

    from app.services.ml_service import VISUAL_MEMORY_FEATURE_KEYS, detector

    manifest_path = resolve_project_path(args.manifest)
    memory_path = resolve_project_path(args.memory)
    manifest_items = load_manifest(manifest_path)

    new_examples = [
        build_example(item, detector=detector, manifest_dir=manifest_path.parent)
        for item in manifest_items
    ]

    existing_payload: dict[str, object] = {}
    existing_examples: list[dict] = []
    if memory_path.exists():
        existing_payload = json.loads(memory_path.read_text(encoding="utf-8"))
        existing_examples = list(existing_payload.get("examples") or [])

    backup_path = backup_memory_file(memory_path) if args.backup else None
    merged_examples, added_count, updated_count = upsert_examples(existing_examples, new_examples)

    payload = {
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "description": existing_payload.get(
            "description",
            "Numeric feature signatures from verified crop and crop-condition examples. Training images are not stored here, and runtime crop analysis does not use upload filenames for classification.",
        ),
        "examples": merged_examples,
        "feature_keys": list(VISUAL_MEMORY_FEATURE_KEYS),
        "version": existing_payload.get("version", "agriscan-verified-visual-memory-v2"),
    }

    memory_path.parent.mkdir(parents=True, exist_ok=True)
    memory_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {
                "memory_path": str(memory_path),
                "manifest_path": str(manifest_path),
                "backup_path": str(backup_path) if backup_path else None,
                "added": added_count,
                "updated": updated_count,
                "total_examples": len(merged_examples),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
