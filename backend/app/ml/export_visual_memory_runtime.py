from __future__ import annotations

import ast
import json
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
SERVICE_PATH = BACKEND_DIR / "app" / "services" / "ml_service.py"
VISUAL_MEMORY_ARTIFACT = BACKEND_DIR / "app" / "ml" / "artifacts" / "visual_memory_examples.json"
VISUAL_MEMORY_RUNTIME = BACKEND_DIR / "app" / "ml" / "artifacts" / "visual_memory_runtime.json"

TARGET_ASSIGNMENTS = {
    "VISUAL_MEMORY_FEATURE_KEYS",
    "VISUAL_MEMORY_DISTANCE_SCALES",
    "VISUAL_MEMORY_STRICT_DISTANCE",
    "VISUAL_MEMORY_HINTED_DISTANCE",
    "CLASS_METADATA",
    "CLASS_ALIASES",
    "CROP_DISPLAY_NAMES",
    "DISEASE_PROFILES",
}


def load_service_constants() -> dict[str, object]:
    tree = ast.parse(SERVICE_PATH.read_text(encoding="utf-8"), filename=str(SERVICE_PATH))
    constants: dict[str, object] = {}
    for node in tree.body:
        name = None
        value = None
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            value = node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            name = node.target.id
            value = node.value
        if name is None or value is None:
            continue
        if name not in TARGET_ASSIGNMENTS:
            continue
        constants[name] = ast.literal_eval(value)
    missing = TARGET_ASSIGNMENTS.difference(constants)
    if missing:
        missing_list = ", ".join(sorted(missing))
        raise RuntimeError(f"Could not extract required assignments from {SERVICE_PATH}: {missing_list}")
    return constants


def canonical_key(key: str, class_aliases: dict[str, str]) -> str:
    normalized = key.lower().replace(" ", "_").replace("-", "_")
    return class_aliases.get(normalized, normalized)


def title_case_tokens(value: str) -> str:
    return " ".join(token.upper() if token == "ipm" else token.capitalize() for token in value.split("_"))


def crop_key_from_class_key(class_key: str, crop_display_names: dict[str, str]) -> str | None:
    for crop_key in crop_display_names:
        if class_key.startswith(f"{crop_key}_"):
            return crop_key
    return None


def metadata_for_key(
    key: str,
    *,
    class_aliases: dict[str, str],
    class_metadata: dict[str, dict[str, str]],
    crop_display_names: dict[str, str],
    disease_profiles: dict[str, dict[str, str]],
) -> dict[str, str]:
    class_key = canonical_key(key, class_aliases)
    if class_key in class_metadata:
        return class_metadata[class_key]

    crop_key = crop_key_from_class_key(class_key, crop_display_names)
    if class_key == "healthy" or class_key.endswith("_healthy"):
        return disease_profiles["healthy"]

    condition_key = class_key
    if crop_key and class_key.startswith(f"{crop_key}_"):
        condition_key = class_key[len(crop_key) + 1 :]

    if condition_key in disease_profiles:
        profile = disease_profiles[condition_key]
        display_crop = crop_display_names.get(crop_key)
        if display_crop and profile["name"] != "Healthy crop":
            return {
                "name": f"{display_crop} {profile['name'].lower()}",
                "cause": profile["cause"],
                "treatment": profile["treatment"],
            }
        return profile

    return {
        "name": title_case_tokens(class_key),
        "cause": "The trained model detected this crop condition from visual leaf patterns.",
        "treatment": "Confirm with an agriculture officer and follow local integrated pest and disease management guidance.",
    }


def build_runtime_payload() -> dict:
    constants = load_service_constants()
    raw_payload = json.loads(VISUAL_MEMORY_ARTIFACT.read_text(encoding="utf-8"))
    examples = raw_payload.get("examples") if isinstance(raw_payload, dict) else []
    examples = examples if isinstance(examples, list) else []

    class_aliases = constants["CLASS_ALIASES"]
    class_metadata = constants["CLASS_METADATA"]
    crop_display_names = constants["CROP_DISPLAY_NAMES"]
    disease_profiles = constants["DISEASE_PROFILES"]
    class_keys = sorted(
        {
            canonical_key(str(example.get("class_key") or ""), class_aliases)
            for example in examples
            if isinstance(example, dict) and example.get("class_key")
        }
    )
    runtime_metadata = {
        class_key: metadata_for_key(
            class_key,
            class_aliases=class_aliases,
            class_metadata=class_metadata,
            crop_display_names=crop_display_names,
            disease_profiles=disease_profiles,
        )
        for class_key in class_keys
    }

    return {
        "created_at": raw_payload.get("created_at"),
        "description": "Frontend-safe visual-memory runtime exported from the backend detector.",
        "feature_keys": list(constants["VISUAL_MEMORY_FEATURE_KEYS"]),
        "distance_scales": constants["VISUAL_MEMORY_DISTANCE_SCALES"],
        "strict_distance": constants["VISUAL_MEMORY_STRICT_DISTANCE"],
        "hinted_distance": constants["VISUAL_MEMORY_HINTED_DISTANCE"],
        "class_metadata": runtime_metadata,
        "examples": examples,
    }


def main() -> int:
    payload = build_runtime_payload()
    VISUAL_MEMORY_RUNTIME.parent.mkdir(parents=True, exist_ok=True)
    VISUAL_MEMORY_RUNTIME.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Exported visual memory runtime to {VISUAL_MEMORY_RUNTIME}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
