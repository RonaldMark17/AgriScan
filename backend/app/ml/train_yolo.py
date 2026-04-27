import argparse
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ML_DIR.parents[1]


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


def is_prepared_classification_dataset(path: Path) -> bool:
    train_dir = path / "train"
    val_dir = path / "val"
    return (
        train_dir.exists()
        and val_dir.exists()
        and any(item.is_dir() for item in train_dir.iterdir())
        and any(item.is_dir() for item in val_dir.iterdir())
    )


def find_prepared_dataset(preferred: Path) -> Path:
    if is_prepared_classification_dataset(preferred):
        return preferred
    datasets_dir = ML_DIR / "datasets"
    if datasets_dir.exists():
        for candidate in sorted(item for item in datasets_dir.iterdir() if item.is_dir()):
            if is_prepared_classification_dataset(candidate):
                return candidate
    return preferred


def main() -> None:
    parser = argparse.ArgumentParser(description="Train AgriScan with Ultralytics YOLO, like the image-recognition activity PDF.")
    parser.add_argument("--task", choices=["classify", "detect"], default="classify")
    parser.add_argument("--data", default="app/ml/datasets/agriscan_leaf", help="Classification folder or detection data.yaml.")
    parser.add_argument("--model", default="yolov8n-cls.pt", help="Use yolov8n-cls.pt for classify or yolov8n.pt for detect.")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--imgsz", type=int, default=224)
    parser.add_argument("--project", default="app/ml/runs")
    parser.add_argument("--name", default="agriscan-yolo")
    args = parser.parse_args()

    from ultralytics import YOLO

    data_path = resolve_project_path(args.data)
    if args.task == "classify":
        data_path = find_prepared_dataset(data_path)
        if not is_prepared_classification_dataset(data_path):
            prepare_hint = (
                "No prepared classification dataset was found.\n"
                "Run this first from backend/app/ml:\n"
                "  python prepare_training_dataset.py --clean --sources philippines --max-per-class 250\n"
                "Or point to another prepared dataset with:\n"
                "  python train_yolo.py --data path/to/dataset\n"
            )
            raise SystemExit(
                "Classification training expects data/train/<class> and data/val/<class> folders.\n"
                f"Resolved path: {data_path}\n"
                f"{prepare_hint}"
            )
    if args.task == "detect" and data_path.suffix.lower() not in {".yaml", ".yml"}:
        raise SystemExit(f"Detection training expects a YOLO data.yaml file with images/labels folders.\nResolved path: {data_path}")

    model = YOLO(args.model)
    results = model.train(
        task=args.task,
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        project=str(resolve_project_path(args.project)),
        name=args.name,
    )
    print(results)
    print("Best model is usually saved under app/ml/runs/<name>/weights/best.pt")


if __name__ == "__main__":
    main()
