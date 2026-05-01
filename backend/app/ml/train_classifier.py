import argparse
import json
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
    parser = argparse.ArgumentParser(description="Train AgriScan crop disease classifier with TensorFlow transfer learning.")
    parser.add_argument("--data", default="app/ml/datasets/agriscan_leaf", help="Dataset folder containing train/ and val/ subfolders.")
    parser.add_argument("--output", default="app/ml/artifacts/crop_disease_model.keras")
    parser.add_argument("--labels-output", default="app/ml/artifacts/labels.json")
    parser.add_argument("--metrics-output", default=None, help="Optional JSON metrics output path. Defaults to training_metrics.json beside the model.")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--fine-tune-epochs", type=int, default=0)
    args = parser.parse_args()

    import tensorflow as tf

    data_dir = resolve_project_path(args.data)
    data_dir = find_prepared_dataset(data_dir)
    train_dir = data_dir / "train"
    val_dir = data_dir / "val"
    if not is_prepared_classification_dataset(data_dir):
        raise SystemExit(
            "Dataset must contain train/ and val/ folders with class subfolders. Run prepare_training_dataset.py first.\n"
            f"Resolved path: {data_dir}\n"
            "Suggested command from backend/app/ml:\n"
            "  python prepare_training_dataset.py --clean --sources philippines --max-per-class 250"
        )

    train_ds = tf.keras.utils.image_dataset_from_directory(
        train_dir,
        image_size=(args.img_size, args.img_size),
        batch_size=args.batch_size,
        label_mode="categorical",
        shuffle=True,
    )
    val_ds = tf.keras.utils.image_dataset_from_directory(
        val_dir,
        image_size=(args.img_size, args.img_size),
        batch_size=args.batch_size,
        label_mode="categorical",
        shuffle=False,
    )

    class_names = train_ds.class_names
    labels_path = resolve_project_path(args.labels_output)
    labels_path.parent.mkdir(parents=True, exist_ok=True)
    labels_path.write_text(json.dumps(class_names, indent=2), encoding="utf-8")

    autotune = tf.data.AUTOTUNE
    train_ds = train_ds.prefetch(autotune)
    val_ds = val_ds.prefetch(autotune)

    data_augmentation = tf.keras.Sequential(
        [
            tf.keras.layers.RandomFlip("horizontal"),
            tf.keras.layers.RandomRotation(0.08),
            tf.keras.layers.RandomZoom(0.12),
            tf.keras.layers.RandomContrast(0.12),
        ],
        name="augmentation",
    )

    base_model = tf.keras.applications.MobileNetV2(
        input_shape=(args.img_size, args.img_size, 3),
        include_top=False,
        weights="imagenet",
    )
    base_model.trainable = False

    inputs = tf.keras.Input(shape=(args.img_size, args.img_size, 3))
    x = data_augmentation(inputs)
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
    x = base_model(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.25)(x)
    outputs = tf.keras.layers.Dense(len(class_names), activation="softmax")(x)
    model = tf.keras.Model(inputs, outputs)

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.0008),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    callbacks = [
        tf.keras.callbacks.EarlyStopping(patience=3, restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(patience=2, factor=0.3),
    ]
    history = model.fit(train_ds, validation_data=val_ds, epochs=args.epochs, callbacks=callbacks)
    final_history = history

    if args.fine_tune_epochs > 0:
        base_model.trainable = True
        for layer in base_model.layers[:-30]:
            layer.trainable = False
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=0.00005),
            loss="categorical_crossentropy",
            metrics=["accuracy"],
        )
        final_history = model.fit(train_ds, validation_data=val_ds, epochs=args.fine_tune_epochs, callbacks=callbacks)

    output_path = resolve_project_path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    model.save(output_path)

    metrics = {
        "classes": class_names,
        "last_train_accuracy": float(final_history.history["accuracy"][-1]),
        "last_val_accuracy": float(final_history.history["val_accuracy"][-1]),
        "model_path": str(output_path),
        "labels_path": str(labels_path),
    }
    metrics_path = resolve_project_path(args.metrics_output) if args.metrics_output else output_path.parent / "training_metrics.json"
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
