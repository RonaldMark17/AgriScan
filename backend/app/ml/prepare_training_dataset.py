import argparse
import io
import os
import random
import shutil
import stat
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

ML_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ML_DIR.parents[1]
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


PLANTVILLAGE_HF_CLASS_MAP = {
    "corn_gray_leaf_spot": {
        "corn gray leaf spot",
        "corn_(maize)___cercospora_leaf_spot gray_leaf_spot",
    },
    "corn_common_rust": {
        "corn rust leaf",
        "corn_(maize)___common_rust_",
    },
    "corn_northern_leaf_blight": {
        "corn leaf blight",
        "corn_(maize)___northern_leaf_blight",
    },
    "corn_healthy": {"corn_(maize)___healthy"},
    "pepper_bacterial_spot": {
        "bell_pepper leaf spot",
        "pepper,_bell___bacterial_spot",
    },
    "pepper_healthy": {
        "bell_pepper leaf",
        "pepper,_bell___healthy",
    },
    "potato_early_blight": {
        "potato leaf early blight",
        "potato___early_blight",
    },
    "potato_late_blight": {
        "potato leaf late blight",
        "potato___late_blight",
    },
    "potato_healthy": {"potato___healthy"},
    "tomato_bacterial_spot": {
        "tomato leaf bacterial spot",
        "tomato___bacterial_spot",
    },
    "tomato_early_blight": {
        "tomato early blight leaf",
        "tomato___early_blight",
    },
    "tomato_late_blight": {
        "tomato leaf late blight",
        "tomato___late_blight",
    },
    "tomato_leaf_mold": {
        "tomato mold leaf",
        "tomato___leaf_mold",
    },
    "tomato_septoria_leaf_spot": {
        "tomato septoria leaf spot",
        "tomato___septoria_leaf_spot",
    },
    "tomato_spider_mites": {
        "tomato two spotted spider mites leaf",
        "tomato___spider_mites two-spotted_spider_mite",
    },
    "tomato_target_spot": {"tomato___target_spot"},
    "tomato_mosaic_virus": {
        "tomato leaf mosaic virus",
        "tomato___tomato_mosaic_virus",
    },
    "tomato_yellow_leaf_curl_virus": {
        "tomato leaf yellow virus",
        "tomato___tomato_yellow_leaf_curl_virus",
    },
    "tomato_healthy": {
        "tomato leaf",
        "tomato___healthy",
    },
}

RICE_LABEL_KEYWORDS = {
    "rice_healthy": {"healthy"},
    "rice_bacterial_leaf_blight": {"bacterial leaf blight"},
    "rice_blast": {"blast"},
    "rice_brown_spot": {"brown spot"},
    "rice_tungro_virus": {"tungro virus"},
    "rice_hispa": {"hispa"},
    "rice_leaf_folder": {"rice leaf folder"},
    "rice_brown_plant_hopper": {"brown plant hopper"},
}

BANANA_CLASS_MAP = {
    "banana_healthy": {"banana_healthy_leaf"},
    "banana_black_sigatoka": {"black_sigatoka"},
    "banana_bract_mosaic_virus": {"bract_mosaic_virus"},
    "banana_insect_pest": {"insect_pest"},
    "banana_moko_disease": {"moko_disease"},
    "banana_panama_disease": {"panama_disease"},
    "banana_yellow_sigatoka": {"yellow_sigatoka"},
}

MANGO_CLASS_MAP = {
    "mango_anthracnose": {"anthracnose"},
    "mango_bacterial_canker": {"bacterial canker"},
    "mango_cutting_weevil": {"cutting weevil"},
    "mango_die_back": {"die back"},
    "mango_gall_midge": {"gall midge"},
    "mango_healthy": {"healthy"},
    "mango_powdery_mildew": {"powdery mildew"},
    "mango_sooty_mould": {"sooty mould"},
}

GUAVA_CLASS_MAP = {
    "guava_healthy": {"healthy"},
    "guava_phytophthora": {"phytopthora"},
    "guava_red_rust": {"red_rust"},
    "guava_scab": {"scab"},
    "guava_styler_and_root": {"styler and root"},
}

CASSAVA_CLASS_MAP = {
    "cassava_brown_streak_disease": {"cbsd"},
    "cassava_mosaic_disease": {"cmd"},
    "cassava_healthy": {"healthy"},
}

SUGARCANE_CLASS_MAP = {
    "sugarcane_healthy": {"healthy"},
    "sugarcane_mosaic_disease": {"mosaic"},
    "sugarcane_red_rot": {"redrot"},
    "sugarcane_rust": {"rust"},
    "sugarcane_yellow_leaf": {"yellow"},
}

ONION_CLASS_MAP = {
    "onion_leaf_rot": {"busuk daun"},
    "onion_moler_disease": {"moler"},
    "onion_healthy": {"sehat"},
    "onion_purple_blotch": {"trotol"},
}

COFFEE_CLASS_MAP = {
    "coffee_healthy": {"healthy"},
    "coffee_leaf_miner_damage": {"miner"},
    "coffee_phoma_blight": {"phoma"},
    "coffee_spider_mites": {"red spider mite"},
    "coffee_leaf_rust": {"rust"},
}

CACAO_CLASS_MAP = {
    "cacao_frosty_pod_rot": {"moniliophthora"},
    "cacao_phytophthora": {"phytophthora"},
    "cacao_healthy": {"sana"},
}

COCONUT_CLASS_MAP = {
    "coconut_healthy": {"healthy"},
    "coconut_leaf_spot_or_blight": {"leaf_spot"},
    "coconut_insect_pest": {"pest_damage"},
    "coconut_yellowing": {"yellowing"},
}

CALAMANSI_CITRUS_CLASS_MAP = {
    "calamansi_black_spot": {"black spot"},
    "calamansi_citrus_canker": {"canker"},
    "calamansi_citrus_greening": {"greening"},
    "calamansi_healthy": {"healthy"},
    "calamansi_melanose": {"melanose"},
}


@dataclass
class CopyStats:
    class_name: str
    train: int = 0
    val: int = 0


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


def safe_clear_directory(path: Path) -> None:
    resolved = path.resolve()
    protected_paths = {Path.cwd().resolve(), Path.home().resolve(), Path(resolved.anchor).resolve()}
    if resolved in protected_paths:
        raise ValueError(f"Refusing to clear unsafe dataset path: {resolved}")
    if path.exists():
        def retry_with_write_permission(function, target_path, excinfo):
            try:
                os.chmod(target_path, stat.S_IWRITE | stat.S_IREAD)
                function(target_path)
            except Exception as retry_error:
                raise retry_error from excinfo[1]

        shutil.rmtree(path, onexc=retry_with_write_permission)
    path.mkdir(parents=True, exist_ok=True)


def split_name(index: int, val_ratio: float) -> str:
    return "val" if random.random() < val_ratio and index > 0 else "train"


def split_name_with_minimum_val(index: int, total_count: int, val_ratio: float) -> str:
    if total_count <= 1:
        return "train"
    val_count = max(1, int(round(total_count * val_ratio)))
    return "val" if index >= total_count - val_count else "train"


def streaming_split_name(index: int, val_ratio: float) -> str:
    if index == 0 or val_ratio <= 0:
        return "train"
    interval = max(2, int(round(1 / val_ratio)))
    return "val" if index % interval == interval - 1 else "train"


def normalize_label(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_only.lower().strip()


def copy_image_bytes(image_bytes: bytes, dest: Path) -> bool:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            image.convert("RGB").save(dest.with_suffix(".jpg"), quality=92)
        return True
    except Exception:
        return False


def copy_local_image(image_path: Path, dest: Path) -> bool:
    try:
        with Image.open(image_path) as image:
            image.convert("RGB").save(dest.with_suffix(".jpg"), quality=92)
        return True
    except Exception:
        return False


def copy_image_from_url(image_url: str, dest: Path) -> bool:
    import requests

    try:
        response = requests.get(
            image_url,
            headers={"User-Agent": "AgriScan dataset preparation"},
            timeout=25,
        )
        response.raise_for_status()
    except Exception:
        return False
    return copy_image_bytes(response.content, dest)


def save_hf_image(image, dest: Path) -> bool:
    try:
        image.convert("RGB").save(dest.with_suffix(".jpg"), quality=92)
        return True
    except Exception:
        return False


def ensure_saved_class_has_validation(
    *,
    output_dir: Path,
    target_class: str,
    stat: CopyStats,
    saved_files: list[tuple[str, Path]],
) -> None:
    if stat.val > 0 or stat.train <= 1:
        return
    for index in range(len(saved_files) - 1, -1, -1):
        split, source_path = saved_files[index]
        if split != "train" or not source_path.exists():
            continue
        val_dir = output_dir / "val" / target_class
        val_dir.mkdir(parents=True, exist_ok=True)
        dest_path = val_dir / source_path.name
        shutil.move(str(source_path), str(dest_path))
        saved_files[index] = ("val", dest_path)
        stat.train -= 1
        stat.val += 1
        return


def build_exact_lookup(class_map: dict[str, set[str]]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for target_class, source_labels in class_map.items():
        for label in source_labels:
            lookup[normalize_label(label)] = target_class
    return lookup


def prepare_from_hf_dataset(
    *,
    repo_id: str,
    output_dir: Path,
    max_per_class: int,
    val_ratio: float,
    class_map: dict[str, set[str]],
    split_names: tuple[str, ...],
    filename_prefix: str,
    streaming: bool = True,
) -> list[CopyStats]:
    from datasets import load_dataset

    lookup = build_exact_lookup(class_map)
    counts: dict[str, int] = {class_name: 0 for class_name in class_map}
    stats: dict[str, CopyStats] = {class_name: CopyStats(class_name) for class_name in class_map}
    saved_files: dict[str, list[tuple[str, Path]]] = {class_name: [] for class_name in class_map}

    for split_name_value in split_names:
        dataset = load_dataset(repo_id, split=split_name_value, streaming=streaming)
        label_feature = dataset.features.get("label") if dataset.features else None
        label_names = getattr(label_feature, "names", None)

        for row in dataset:
            raw_label = row["label"]
            if isinstance(raw_label, int) and label_names and raw_label < len(label_names):
                label = label_names[raw_label]
            else:
                label = str(raw_label)

            target_class = lookup.get(normalize_label(label))
            if target_class is None or counts[target_class] >= max_per_class:
                continue

            index = counts[target_class]
            split = streaming_split_name(index, val_ratio)
            dest_dir = output_dir / split / target_class
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"{filename_prefix}_{target_class}_{index:05d}.jpg"
            if not save_hf_image(row["image"], dest):
                continue

            saved_path = dest.with_suffix(".jpg")
            saved_files[target_class].append((split, saved_path))
            counts[target_class] += 1
            if split == "val":
                stats[target_class].val += 1
            else:
                stats[target_class].train += 1

            if all(count >= max_per_class for count in counts.values()):
                break

        if all(count >= max_per_class for count in counts.values()):
            break

    for target_class, stat in stats.items():
        ensure_saved_class_has_validation(
            output_dir=output_dir,
            target_class=target_class,
            stat=stat,
            saved_files=saved_files[target_class],
        )
    return list(stats.values())


def prepare_from_image_directory(
    *,
    source_dir: Path,
    output_dir: Path,
    max_per_class: int,
    val_ratio: float,
    class_map: dict[str, set[str]],
    filename_prefix: str,
) -> list[CopyStats]:
    lookup = build_exact_lookup(class_map)
    grouped: dict[str, list[Path]] = {class_name: [] for class_name in class_map}

    for image_path in source_dir.rglob("*"):
        if not image_path.is_file() or image_path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        target_class = lookup.get(normalize_label(image_path.parent.name))
        if target_class is None or len(grouped[target_class]) >= max_per_class:
            continue
        grouped[target_class].append(image_path)
        if all(len(rows) >= max_per_class for rows in grouped.values()):
            break

    stats: list[CopyStats] = []
    for target_class, image_paths in grouped.items():
        random.shuffle(image_paths)
        selected = image_paths[:max_per_class]
        stat = CopyStats(target_class)
        for index, image_path in enumerate(selected):
            split = split_name_with_minimum_val(index, len(selected), val_ratio)
            dest_dir = output_dir / split / target_class
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"{filename_prefix}_{target_class}_{index:05d}.jpg"
            if not copy_local_image(image_path, dest):
                continue
            if split == "val":
                stat.val += 1
            else:
                stat.train += 1
        stats.append(stat)
    return stats


def prepare_from_kaggle_image_dataset(
    *,
    dataset_handle: str,
    source_subdir: str,
    output_dir: Path,
    max_per_class: int,
    val_ratio: float,
    class_map: dict[str, set[str]],
    filename_prefix: str,
) -> list[CopyStats]:
    try:
        import kagglehub
    except ImportError as error:
        raise SystemExit(
            "The selected source needs kagglehub. Install ML dependencies with:\n"
            "  python -m pip install -r requirements-ml.txt"
        ) from error

    dataset_dir = Path(kagglehub.dataset_download(dataset_handle))
    source_dir = dataset_dir / source_subdir
    if not source_dir.exists():
        raise FileNotFoundError(f"Expected Kaggle dataset subdirectory not found: {source_dir}")
    return prepare_from_image_directory(
        source_dir=source_dir,
        output_dir=output_dir,
        max_per_class=max_per_class,
        val_ratio=val_ratio,
        class_map=class_map,
        filename_prefix=filename_prefix,
    )


def digigreen_target_class(crop_value: str, diagnosis_value: str) -> str | None:
    crop = normalize_label(crop_value)
    diagnosis = normalize_label(diagnosis_value)
    if crop == "brinjal":
        crop = "eggplant"
    elif crop == "bitter gourd":
        crop = "bitter_gourd"
    elif crop == "green gram":
        crop = "mung_bean"

    if crop not in {"eggplant", "bitter_gourd", "cabbage", "onion", "mung_bean"}:
        return None
    if "healthy" in diagnosis:
        return f"{crop}_healthy"

    if crop == "eggplant":
        if "shoot and fruit borer" in diagnosis:
            return "eggplant_fruit_and_shoot_borer_damage"
        if "mites" in diagnosis:
            return "eggplant_mite_damage"
        if "wilt" in diagnosis:
            return "eggplant_wilt"
        if "phomopsis" in diagnosis:
            return "eggplant_phomopsis_blight"
        return None

    if crop == "bitter_gourd":
        if "powdery mildew" in diagnosis:
            return "bitter_gourd_powdery_mildew"
        if any(term in diagnosis for term in ("whitefl", "aphid", "beetle")):
            return "bitter_gourd_insect_pest"
        if "downy mildew" in diagnosis:
            return "bitter_gourd_downy_mildew"
        if "mosaic" in diagnosis:
            return "bitter_gourd_mosaic_virus"
        return None

    if crop == "cabbage":
        if any(term in diagnosis for term in ("diamondback", "looper")):
            return "cabbage_diamondback_moth_damage"
        if "alternaria" in diagnosis:
            return "cabbage_alternaria_leaf_spot"
        if "downy mildew" in diagnosis:
            return "cabbage_downy_mildew"
        if "nitrogen deficiency" in diagnosis:
            return "cabbage_nutrient_deficiency"
        return None

    if crop == "onion":
        if "thrips" in diagnosis:
            return "onion_thrips_damage"
        if "downy mildew" in diagnosis:
            return "onion_downy_mildew"
        if any(term in diagnosis for term in ("purple blotch", "stemphylium", "maggot")):
            return "onion_purple_blotch"
        return None

    if crop == "mung_bean":
        if "healthy" in diagnosis:
            return "mung_bean_healthy"
        return None

    return None


def prepare_from_digigreen(
    output_dir: Path,
    max_per_class: int,
    val_ratio: float,
    minimum_per_class: int = 2,
) -> list[CopyStats]:
    from datasets import load_dataset

    grouped: dict[str, list[dict[str, str]]] = {}
    dataset = load_dataset("DigiGreen/Crop_Disease_Images", split="train", streaming=True)
    for row in dataset:
        target_class = digigreen_target_class(str(row["crop"]), str(row["diagnosis"]))
        if target_class is None:
            continue
        rows = grouped.setdefault(target_class, [])
        if len(rows) < max_per_class:
            rows.append(row)

    stats: list[CopyStats] = []
    for target_class, rows in sorted(grouped.items()):
        if len(rows) < minimum_per_class:
            continue
        random.shuffle(rows)
        selected = rows[:max_per_class]
        stat = CopyStats(target_class)
        for index, row in enumerate(selected):
            split = split_name_with_minimum_val(index, len(selected), val_ratio)
            dest_dir = output_dir / split / target_class
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"digigreen_{target_class}_{index:05d}.jpg"
            if not copy_image_from_url(str(row["image_url"]), dest):
                continue
            if split == "val":
                stat.val += 1
            else:
                stat.train += 1
        stats.append(stat)
    return stats


def prepare_from_rice_huggingface(output_dir: Path, max_per_class: int, val_ratio: float) -> list[CopyStats]:
    from datasets import load_dataset

    grouped: dict[str, list] = {class_name: [] for class_name in RICE_LABEL_KEYWORDS}
    for split_name_value in ("train", "validation", "test"):
        dataset = load_dataset("minhhungg/rice-disease-dataset", split=split_name_value, streaming=True)
        for row in dataset:
            label = normalize_label(str(row["label"]))
            for target_class, accepted_keywords in RICE_LABEL_KEYWORDS.items():
                if any(keyword in label for keyword in accepted_keywords) and len(grouped[target_class]) < max_per_class:
                    grouped[target_class].append(row)
                    break
            if all(len(rows) >= max_per_class for rows in grouped.values()):
                break
        if all(len(rows) >= max_per_class for rows in grouped.values()):
            break

    stats: list[CopyStats] = []
    for target_class, rows in grouped.items():
        random.shuffle(rows)
        stat = CopyStats(target_class)
        for index, row in enumerate(rows[:max_per_class]):
            split = split_name(index, val_ratio)
            dest_dir = output_dir / split / target_class
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"rice_{target_class}_{index:05d}.jpg"
            if not save_hf_image(row["image"], dest):
                continue
            if split == "val":
                stat.val += 1
            else:
                stat.train += 1
        stats.append(stat)
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare AgriScan disease datasets for crops commonly grown in the Philippines."
    )
    parser.add_argument("--output", default="app/ml/datasets/agriscan_leaf", help="Output dataset directory with train/val class folders.")
    parser.add_argument("--max-per-class", type=int, default=250, help="Maximum images per target class per source.")
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--sources",
        choices=[
            "plantvillage",
            "rice",
            "banana",
            "mango",
            "guava",
            "cassava",
            "sugarcane",
            "onion",
            "coffee",
            "cacao",
            "coconut",
            "calamansi",
            "digigreen",
            "recommender",
            "philippines",
            "all",
        ],
        default="philippines",
        help="Dataset sources to include. 'philippines' and 'recommender' use the expanded crop set for Philippine-relevant crops.",
    )
    parser.add_argument("--clean", action="store_true", help="Delete the output directory before preparing data.")
    args = parser.parse_args()

    random.seed(args.seed)
    output_dir = resolve_project_path(args.output)
    if args.clean:
        safe_clear_directory(output_dir)
    else:
        output_dir.mkdir(parents=True, exist_ok=True)

    use_all = args.sources in {"philippines", "recommender", "all"}
    all_stats: list[CopyStats] = []

    if args.sources == "plantvillage" or use_all:
        all_stats.extend(
            prepare_from_hf_dataset(
                repo_id="avinashhm/plant-disease-classification",
                output_dir=output_dir,
                max_per_class=args.max_per_class,
                val_ratio=args.val_ratio,
                class_map=PLANTVILLAGE_HF_CLASS_MAP,
                split_names=("train", "validation", "test"),
                filename_prefix="plantvillage",
            )
        )

    if args.sources == "rice" or use_all:
        all_stats.extend(prepare_from_rice_huggingface(output_dir, args.max_per_class, args.val_ratio))

    if args.sources == "banana" or use_all:
        all_stats.extend(
            prepare_from_hf_dataset(
                repo_id="as-cle-bert/banana-disease-classification",
                output_dir=output_dir,
                max_per_class=args.max_per_class,
                val_ratio=args.val_ratio,
                class_map=BANANA_CLASS_MAP,
                split_names=("train", "test"),
                filename_prefix="banana",
            )
        )

    if args.sources == "mango" or use_all:
        all_stats.extend(
            prepare_from_hf_dataset(
                repo_id="AfiqN/mango-leaf-disease-test",
                output_dir=output_dir,
                max_per_class=args.max_per_class,
                val_ratio=args.val_ratio,
                class_map=MANGO_CLASS_MAP,
                split_names=("train",),
                filename_prefix="mango",
            )
        )

    if args.sources == "guava" or use_all:
        all_stats.extend(
            prepare_from_hf_dataset(
                repo_id="YaswanthReddy23/Guava_leaf",
                output_dir=output_dir,
                max_per_class=args.max_per_class,
                val_ratio=args.val_ratio,
                class_map=GUAVA_CLASS_MAP,
                split_names=("train", "validation", "test"),
                filename_prefix="guava",
            )
        )

    if args.sources == "cassava" or use_all:
        all_stats.extend(
            prepare_from_hf_dataset(
                repo_id="andrewkatumba/cassava_leaf_diseases_dsa_2023",
                output_dir=output_dir,
                max_per_class=args.max_per_class,
                val_ratio=args.val_ratio,
                class_map=CASSAVA_CLASS_MAP,
                split_names=("train", "test"),
                filename_prefix="cassava",
            )
        )

    if args.sources == "sugarcane" or use_all:
        all_stats.extend(
            prepare_from_hf_dataset(
                repo_id="YaswanthReddy23/Sugarcane_leaf",
                output_dir=output_dir,
                max_per_class=args.max_per_class,
                val_ratio=args.val_ratio,
                class_map=SUGARCANE_CLASS_MAP,
                split_names=("train", "validation", "test"),
                filename_prefix="sugarcane",
            )
        )

    if args.sources == "onion" or use_all:
        all_stats.extend(
            prepare_from_hf_dataset(
                repo_id="appdevop666/onion-leaf-disease",
                output_dir=output_dir,
                max_per_class=args.max_per_class,
                val_ratio=args.val_ratio,
                class_map=ONION_CLASS_MAP,
                split_names=("validation", "test"),
                filename_prefix="onion",
            )
        )

    if args.sources == "coffee" or use_all:
        all_stats.extend(
            prepare_from_hf_dataset(
                repo_id="brainer-fp66/coffee-leaf-diseases",
                output_dir=output_dir,
                max_per_class=args.max_per_class,
                val_ratio=args.val_ratio,
                class_map=COFFEE_CLASS_MAP,
                split_names=("validation", "test"),
                filename_prefix="coffee",
            )
        )

    if args.sources == "cacao" or use_all:
        all_stats.extend(
            prepare_from_hf_dataset(
                repo_id="Raliuga/cacao_diseases",
                output_dir=output_dir,
                max_per_class=args.max_per_class,
                val_ratio=args.val_ratio,
                class_map=CACAO_CLASS_MAP,
                split_names=("train", "validation", "test"),
                filename_prefix="cacao",
                streaming=False,
            )
        )

    if args.sources == "coconut" or use_all:
        all_stats.extend(
            prepare_from_kaggle_image_dataset(
                dataset_handle="jigarbaraiya/coconut-leaf-disease-dataset",
                source_subdir="coconut_dicease_dataset",
                output_dir=output_dir,
                max_per_class=args.max_per_class,
                val_ratio=args.val_ratio,
                class_map=COCONUT_CLASS_MAP,
                filename_prefix="coconut",
            )
        )

    if args.sources == "calamansi" or use_all:
        all_stats.extend(
            prepare_from_kaggle_image_dataset(
                dataset_handle="myprojectdictionary/citrus-leaf-disease-image",
                source_subdir="Citrus Leaf Disease Image",
                output_dir=output_dir,
                max_per_class=args.max_per_class,
                val_ratio=args.val_ratio,
                class_map=CALAMANSI_CITRUS_CLASS_MAP,
                filename_prefix="calamansi_citrus",
            )
        )

    if args.sources == "digigreen" or use_all:
        all_stats.extend(prepare_from_digigreen(output_dir, args.max_per_class, args.val_ratio))

    print(f"Prepared dataset at {output_dir.resolve()}")
    for stat in all_stats:
        print(f"{stat.class_name}: train={stat.train} val={stat.val}")


if __name__ == "__main__":
    main()
