"""
Crop Detection & Classification Training Module

Handles dataset preparation, model training, and evaluation for:
- Crop detection models (YOLO)
- Crop classification models (TensorFlow, scikit-learn)
- Transfer learning from pre-trained models
"""

import logging
from pathlib import Path
from typing import Callable
import json
from dataclasses import dataclass, asdict

import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier

logger = logging.getLogger(__name__)

ML_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ML_DIR.parents[1]


@dataclass
class TrainingMetrics:
    """Training performance metrics."""
    epoch: int
    loss: float
    accuracy: float
    val_loss: float
    val_accuracy: float
    precision: float | None = None
    recall: float | None = None
    f1_score: float | None = None
    training_time_seconds: float = 0.0


def resolve_project_path(path_str: str) -> Path:
    """Resolve project-relative paths."""
    path = Path(path_str)
    if path.is_absolute():
        return path
    if path.parts and path.parts[0] in {"app", "uploads", "data"}:
        return (BACKEND_DIR / path).resolve()
    cwd_path = (Path.cwd() / path).resolve()
    if cwd_path.exists() or str(path).startswith("."):
        return cwd_path
    return (BACKEND_DIR / path).resolve()


class CropDetectionModelTrainer:
    """Train YOLO-based crop detection models."""
    
    def __init__(self, output_dir: str | Path = "app/ml/runs"):
        self.output_dir = resolve_project_path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.yolo_model = None
        self.training_history = []
    
    def prepare_detection_dataset(
        self,
        images_dir: str | Path,
        labels_dir: str | Path,
        output_dir: str | Path = "app/ml/datasets/detection",
        train_ratio: float = 0.8,
    ) -> Path:
        """
        Prepare dataset in YOLO format.
        Expected structure:
            images/: *.jpg, *.png
            labels/: *.txt (YOLO format: class x_center y_center width height)
        """
        import shutil
        
        images_path = resolve_project_path(images_dir)
        labels_path = resolve_project_path(labels_dir)
        output_path = resolve_project_path(output_dir)
        
        # Create dataset structure
        dataset_path = output_path / "detection_dataset"
        (dataset_path / "images" / "train").mkdir(parents=True, exist_ok=True)
        (dataset_path / "images" / "val").mkdir(parents=True, exist_ok=True)
        (dataset_path / "labels" / "train").mkdir(parents=True, exist_ok=True)
        (dataset_path / "labels" / "val").mkdir(parents=True, exist_ok=True)
        
        # Get all image files
        image_files = list(images_path.glob("*.jpg")) + list(images_path.glob("*.png"))
        np.random.shuffle(image_files)
        
        split_idx = int(len(image_files) * train_ratio)
        train_files = image_files[:split_idx]
        val_files = image_files[split_idx:]
        
        # Copy files
        for img_file in train_files:
            shutil.copy2(img_file, dataset_path / "images" / "train" / img_file.name)
            label_file = labels_path / img_file.stem.replace(img_file.suffix, ".txt")
            if label_file.exists():
                shutil.copy2(label_file, dataset_path / "labels" / "train" / label_file.name)
        
        for img_file in val_files:
            shutil.copy2(img_file, dataset_path / "images" / "val" / img_file.name)
            label_file = labels_path / img_file.stem.replace(img_file.suffix, ".txt")
            if label_file.exists():
                shutil.copy2(label_file, dataset_path / "labels" / "val" / label_file.name)
        
        # Create data.yaml for YOLO
        data_yaml = {
            "path": str(dataset_path),
            "train": str(dataset_path / "images" / "train"),
            "val": str(dataset_path / "images" / "val"),
            "nc": 1,  # Number of classes
            "names": ["crop"],
        }
        
        yaml_path = dataset_path / "data.yaml"
        with open(yaml_path, "w") as f:
            for key, value in data_yaml.items():
                f.write(f"{key}: {value}\n")
        
        logger.info(f"Dataset prepared at {dataset_path}")
        return dataset_path
    
    def train_yolo_model(
        self,
        data_yaml_path: str | Path,
        model_name: str = "yolov8n",
        epochs: int = 10,
        batch_size: int = 16,
        img_size: int = 640,
        patience: int = 5,
        device: int | str = 0,
    ) -> dict[str, any]:
        """Train YOLO detection model."""
        try:
            from ultralytics import YOLO
        except ImportError:
            logger.error("Ultralytics not installed. Install with: pip install ultralytics")
            return {"status": "failed", "error": "ultralytics not installed"}
        
        try:
            # Load model
            if model_name.endswith(".pt"):
                self.yolo_model = YOLO(model_name)
            else:
                self.yolo_model = YOLO(f"{model_name}.pt")
            
            # Train
            results = self.yolo_model.train(
                data=str(data_yaml_path),
                epochs=epochs,
                imgsz=img_size,
                batch=batch_size,
                patience=patience,
                device=device,
                project=str(self.output_dir),
                name="crop_detection",
                exist_ok=True,
            )
            
            logger.info(f"YOLO training completed: {results}")
            return {
                "status": "success",
                "model_path": str(self.output_dir / "crop_detection" / "weights" / "best.pt"),
                "results": str(results),
            }
        except Exception as e:
            logger.error(f"YOLO training failed: {e}")
            return {"status": "failed", "error": str(e)}
    
    def evaluate_detection_model(
        self,
        model_path: str | Path,
        test_data_path: str | Path,
    ) -> dict[str, float]:
        """Evaluate detection model performance."""
        try:
            from ultralytics import YOLO
            
            model = YOLO(str(model_path))
            metrics = model.val(data=str(test_data_path))
            
            return {
                "box_loss": float(metrics.box.loss) if hasattr(metrics, "box") else 0.0,
                "cls_loss": float(metrics.cls.loss) if hasattr(metrics, "cls") else 0.0,
                "dfl_loss": float(metrics.dfl.loss) if hasattr(metrics, "dfl") else 0.0,
                "precision": float(metrics.box.mp) if hasattr(metrics, "box") else 0.0,
                "recall": float(metrics.box.mr) if hasattr(metrics, "box") else 0.0,
                "mAP50": float(metrics.box.map50) if hasattr(metrics, "box") else 0.0,
                "mAP50_95": float(metrics.box.map) if hasattr(metrics, "box") else 0.0,
            }
        except Exception as e:
            logger.error(f"Evaluation failed: {e}")
            return {}


class CropClassificationModelTrainer:
    """Train TensorFlow-based crop classification models."""
    
    def __init__(self, output_dir: str | Path = "app/ml/artifacts"):
        self.output_dir = resolve_project_path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.model = None
        self.class_names = []
        self.metrics_history = []
    
    def prepare_classification_dataset(
        self,
        data_dir: str | Path,
        test_ratio: float = 0.2,
        img_size: tuple[int, int] = (224, 224),
    ) -> tuple[tf.data.Dataset, tf.data.Dataset, list[str]]:
        """
        Load classification dataset.
        Expected structure:
            data_dir/
                crop_type_1/
                    image1.jpg
                    image2.jpg
                crop_type_2/
                    ...
        """
        data_path = resolve_project_path(data_dir)
        
        # Load dataset
        dataset = tf.keras.utils.image_dataset_from_directory(
            data_path,
            image_size=img_size,
            batch_size=32,
            label_mode="categorical",
            validation_split=test_ratio,
            subset="training",
            seed=42,
        )
        
        val_dataset = tf.keras.utils.image_dataset_from_directory(
            data_path,
            image_size=img_size,
            batch_size=32,
            label_mode="categorical",
            validation_split=test_ratio,
            subset="validation",
            seed=42,
        )
        
        self.class_names = dataset.class_names
        
        # Normalize
        normalization_layer = tf.keras.layers.Rescaling(1./255)
        dataset = dataset.map(lambda x, y: (normalization_layer(x), y))
        val_dataset = val_dataset.map(lambda x, y: (normalization_layer(x), y))
        
        return dataset, val_dataset, self.class_names
    
    def build_transfer_learning_model(
        self,
        num_classes: int,
        img_size: tuple[int, int] = (224, 224),
        base_model_name: str = "MobileNetV2",
    ) -> tf.keras.Model:
        """Build transfer learning model for crop classification."""
        
        # Load pre-trained base model
        if base_model_name == "MobileNetV2":
            base_model = tf.keras.applications.MobileNetV2(
                input_shape=(img_size[0], img_size[1], 3),
                include_top=False,
                weights="imagenet",
            )
        elif base_model_name == "EfficientNetB0":
            base_model = tf.keras.applications.EfficientNetB0(
                input_shape=(img_size[0], img_size[1], 3),
                include_top=False,
                weights="imagenet",
            )
        elif base_model_name == "ResNet50":
            base_model = tf.keras.applications.ResNet50(
                input_shape=(img_size[0], img_size[1], 3),
                include_top=False,
                weights="imagenet",
            )
        else:
            base_model = tf.keras.applications.MobileNetV2(
                input_shape=(img_size[0], img_size[1], 3),
                include_top=False,
                weights="imagenet",
            )
        
        # Freeze base model
        base_model.trainable = False
        
        # Add custom layers
        model = tf.keras.Sequential([
            base_model,
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(256, activation="relu"),
            tf.keras.layers.BatchNormalization(),
            tf.keras.layers.Dropout(0.3),
            tf.keras.layers.Dense(128, activation="relu"),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(num_classes, activation="softmax"),
        ])
        
        self.model = model
        return model
    
    def train_classification_model(
        self,
        train_dataset: tf.data.Dataset,
        val_dataset: tf.data.Dataset,
        model: tf.keras.Model,
        epochs: int = 20,
        learning_rate: float = 0.001,
    ) -> dict[str, any]:
        """Train classification model."""
        try:
            # Compile
            optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)
            model.compile(
                optimizer=optimizer,
                loss="categorical_crossentropy",
                metrics=["accuracy", tf.keras.metrics.Precision(), tf.keras.metrics.Recall()],
            )
            
            # Callbacks
            early_stopping = tf.keras.callbacks.EarlyStopping(
                monitor="val_loss",
                patience=5,
                restore_best_weights=True,
            )
            
            reduce_lr = tf.keras.callbacks.ReduceLROnPlateau(
                monitor="val_loss",
                factor=0.5,
                patience=3,
                min_lr=1e-7,
            )
            
            # Train
            history = model.fit(
                train_dataset,
                validation_data=val_dataset,
                epochs=epochs,
                callbacks=[early_stopping, reduce_lr],
                verbose=1,
            )
            
            self.metrics_history = history.history
            
            return {
                "status": "success",
                "final_accuracy": float(history.history["accuracy"][-1]),
                "final_val_accuracy": float(history.history["val_accuracy"][-1]),
                "final_loss": float(history.history["loss"][-1]),
                "final_val_loss": float(history.history["val_loss"][-1]),
            }
        except Exception as e:
            logger.error(f"Training failed: {e}")
            return {"status": "failed", "error": str(e)}
    
    def fine_tune_model(
        self,
        train_dataset: tf.data.Dataset,
        val_dataset: tf.data.Dataset,
        num_fine_tune_epochs: int = 10,
        learning_rate: float = 0.0001,
    ) -> dict[str, any]:
        """Fine-tune the model by unfreezing some layers."""
        try:
            if not self.model:
                return {"status": "failed", "error": "No model loaded"}
            
            # Unfreeze last layers of base model
            base_model = self.model.layers[0]
            base_model.trainable = True
            for layer in base_model.layers[:-30]:
                layer.trainable = False
            
            # Recompile with lower learning rate
            optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)
            self.model.compile(
                optimizer=optimizer,
                loss="categorical_crossentropy",
                metrics=["accuracy"],
            )
            
            # Train
            history = self.model.fit(
                train_dataset,
                validation_data=val_dataset,
                epochs=num_fine_tune_epochs,
                verbose=1,
            )
            
            return {
                "status": "success",
                "final_accuracy": float(history.history["accuracy"][-1]),
                "final_val_accuracy": float(history.history["val_accuracy"][-1]),
            }
        except Exception as e:
            logger.error(f"Fine-tuning failed: {e}")
            return {"status": "failed", "error": str(e)}
    
    def evaluate_classification_model(
        self,
        test_dataset: tf.data.Dataset,
    ) -> dict[str, float]:
        """Evaluate classification model."""
        try:
            if not self.model:
                return {"status": "failed", "error": "No model loaded"}
            
            results = self.model.evaluate(test_dataset, verbose=0)
            
            return {
                "loss": float(results[0]),
                "accuracy": float(results[1]),
                "precision": float(results[2]) if len(results) > 2 else 0.0,
                "recall": float(results[3]) if len(results) > 3 else 0.0,
            }
        except Exception as e:
            logger.error(f"Evaluation failed: {e}")
            return {"status": "failed", "error": str(e)}
    
    def save_model(
        self,
        model_path: str | Path,
        labels_path: str | Path | None = None,
    ) -> bool:
        """Save trained model and labels."""
        try:
            if not self.model:
                return False
            
            model_path = resolve_project_path(model_path)
            model_path.parent.mkdir(parents=True, exist_ok=True)
            
            self.model.save(str(model_path))
            logger.info(f"Model saved to {model_path}")
            
            # Save labels
            if labels_path:
                labels_path = resolve_project_path(labels_path)
                labels_path.parent.mkdir(parents=True, exist_ok=True)
                with open(labels_path, "w") as f:
                    json.dump(self.class_names, f, indent=2)
                logger.info(f"Labels saved to {labels_path}")
            
            return True
        except Exception as e:
            logger.error(f"Failed to save model: {e}")
            return False


def create_detection_trainer(output_dir: str | Path = "app/ml/runs") -> CropDetectionModelTrainer:
    """Factory function for detection trainer."""
    return CropDetectionModelTrainer(output_dir=output_dir)


def create_classification_trainer(output_dir: str | Path = "app/ml/artifacts") -> CropClassificationModelTrainer:
    """Factory function for classification trainer."""
    return CropClassificationModelTrainer(output_dir=output_dir)
