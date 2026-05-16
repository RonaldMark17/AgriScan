# Crop Detection & Classification Module

Comprehensive computer vision system for detecting and classifying agricultural crops with machine learning and domain-specific knowledge.

## Overview

This module implements multiple computer vision techniques for robust crop detection:

### Core Components

1. **Crop Detection** (`crop_detection.py`)
   - Object detection using YOLO
   - Visual feature extraction (color, shape, texture)
   - Image preprocessing and normalization
   - Growth stage estimation
   - Yield estimation

2. **Crop Classification** (`crop_classifier.py`)
   - CNN-based crop classification
   - Health status assessment
   - Quality grading (premium, standard, below_standard)
   - Ensemble prediction combining multiple models
   - Heuristic fallback classification

3. **Model Training** (`crop_training.py`)
   - YOLO detection model training
   - Transfer learning for classification
   - Fine-tuning capabilities
   - Dataset preparation utilities

## Features

### Visual Features Extraction

#### Color Analysis
- Green ratio (vegetative health indicator)
- Yellow ratio (stress/ripeness indicator)
- Red ratio (fruit/disease indicator)
- Brown ratio (disease/damage indicator)
- Dominant color identification

#### Shape Analysis
- Contour detection and counting
- Aspect ratio calculation
- Circularity measurement
- Solidity (filled area percentage)
- Bounding box analysis

#### Texture Analysis
- Edge density detection
- Laplacian variance (sharpness/blur detection)
- Texture gradient
- Surface pattern analysis

### Image Preprocessing

- **Lighting Normalization**: CLAHE (Contrast Limited Adaptive Histogram Equalization)
- **Noise Reduction**: Bilateral filtering, Non-local means denoising
- **Color Correction**: White balance normalization
- **Foreground Segmentation**: Green vegetation isolation
- **Data Augmentation**: Rotation, zoom, brightness adjustment

### Crop Detection Methods

1. **YOLO-based Detection** (if model available)
   - Real-time object detection
   - Bounding box extraction
   - Multi-crop detection in single image

2. **Component-based Detection** (fallback)
   - Connected component analysis
   - Contour-based segmentation
   - Region of interest extraction

### Health & Quality Assessment

- **Health Status**: healthy, stressed, diseased, unknown
- **Growth Stages**: seedling, vegetative, flowering, fruiting, mature
- **Quality Grades**: premium, standard, below_standard
- **Defect Detection**: spots, discoloration, damage
- **Occlusion Detection**: Partial visibility assessment

## Usage

### Basic Crop Detection

```python
from app.ml.crop_detection import CropDetector

# Create detector
detector = CropDetector(model_path="app/ml/artifacts/crop_detection.pt")

# Detect crops in image
result = detector.detect_crops_in_image("path/to/image.jpg")

print(f"Crops detected: {result.total_crops_detected}")
print(f"Image quality: {result.image_quality_score:.2f}")

for crop in result.crops:
    print(f"- {crop.crop_type}: {crop.confidence:.2f} confidence")
    print(f"  Growth stage: {crop.growth_stage}")
    print(f"  Quality: {crop.quality_score:.2f}")
```

### Crop Classification

```python
from app.ml.crop_classifier import CropClassifier

# Create classifier
classifier = CropClassifier(
    model_path="app/ml/artifacts/crop_disease_model.keras",
    use_ensemble=True
)

# Classify crop
from PIL import Image
image = Image.open("crop_image.jpg")
result = classifier.classify_crop(image)

print(f"Predicted: {result.predicted_class}")
print(f"Confidence: {result.confidence:.2f}")
print(f"Health: {result.health_status}")
print(f"Top predictions:")
for label, conf in result.top_predictions[:3]:
    print(f"  - {label}: {conf:.2f}")
```

### Quality Assessment

```python
from app.ml.crop_classifier import CropQualityAssessor
import cv2

image = cv2.imread("crop.jpg")
grade, score, defects = CropQualityAssessor.assess_quality(image)

print(f"Quality grade: {grade}")
print(f"Quality score: {score:.2f}")
if defects:
    print(f"Defects: {', '.join(defects)}")
```

### Training Models

#### Prepare Detection Dataset

```python
from app.ml.crop_training import create_detection_trainer

trainer = create_detection_trainer()

# Prepare dataset in YOLO format
dataset_path = trainer.prepare_detection_dataset(
    images_dir="path/to/images",
    labels_dir="path/to/labels",
    train_ratio=0.8
)
```

#### Train Detection Model

```python
from app.ml.crop_training import create_detection_trainer

trainer = create_detection_trainer()
result = trainer.train_yolo_model(
    data_yaml_path=dataset_path / "data.yaml",
    model_name="yolov8n",
    epochs=50,
    batch_size=16,
)

print(result)
```

#### Train Classification Model

```python
from app.ml.crop_training import create_classification_trainer

trainer = create_classification_trainer()

# Prepare dataset
train_ds, val_ds, class_names = trainer.prepare_classification_dataset(
    "app/ml/datasets/crops"
)

# Build model
model = trainer.build_transfer_learning_model(
    num_classes=len(class_names),
    base_model_name="MobileNetV2"
)

# Train
result = trainer.train_classification_model(
    train_dataset=train_ds,
    val_dataset=val_ds,
    model=model,
    epochs=20,
)

# Fine-tune
result = trainer.fine_tune_model(
    train_dataset=train_ds,
    val_dataset=val_ds,
    num_fine_tune_epochs=10,
)

# Save
trainer.save_model(
    "app/ml/artifacts/crop_classifier.keras",
    "app/ml/artifacts/crop_labels.json"
)
```

## Dataset Format

### For Detection (YOLO)

```
dataset/
├── images/
│   ├── train/
│   │   ├── img1.jpg
│   │   ├── img2.jpg
│   │   └── ...
│   └── val/
│       ├── img3.jpg
│       └── ...
├── labels/
│   ├── train/
│   │   ├── img1.txt
│   │   ├── img2.txt
│   │   └── ...
│   └── val/
│       ├── img3.txt
│       └── ...
└── data.yaml
```

Label format (YOLO):
```
<class_id> <x_center> <y_center> <width> <height>
0 0.5 0.5 0.8 0.6
```

### For Classification

```
dataset/
├── crop_type_1/
│   ├── image1.jpg
│   ├── image2.jpg
│   └── ...
├── crop_type_2/
│   ├── image1.jpg
│   └── ...
└── ...
```

## API Integration

### ML Service Integration

```python
from app.services.ml_service import MLService

ml_service = MLService()

# Detect crops
detection_result = ml_service.detect_crops("path/to/image.jpg")

# Classify crop
classification_result = ml_service.classify_crop("path/to/image.jpg")
```

## Performance Considerations

- **Image Size**: Larger images provide better detail but slower processing
- **YOLO vs Component-based**: YOLO is faster, component-based is more flexible
- **Preprocessing**: Enables better accuracy but adds processing time
- **Batch Processing**: Process multiple images for efficiency

## Requirements

```
tensorflow>=2.12.0,<3.0
ultralytics>=8.0.0  # For YOLO
opencv-python-headless>=4.8.0
scikit-learn>=1.3.0
numpy>=1.24.0
Pillow>=9.0.0
```

## Environment Variables

```
AGRISCAN_ML_MODEL_DIR=app/ml/artifacts
AGRISCAN_YOLO_MODEL=yolov8n.pt
AGRISCAN_DETECTION_CONFIDENCE=0.5
AGRISCAN_ENABLE_PREPROCESSING=True
```

## Supported Crops

- Rice (multiple varieties and diseases)
- Corn (maize)
- Tomato
- Potato
- Wheat
- Expandable to other crops

## Disease & Issue Detection

Integrated disease metadata for:
- Rice: blast, brown_spot, leaf_scald, tungro, hispa
- Corn: leaf_blight, rust, ear_rot, stalk_rot
- Tomato: early_blight, late_blight, bacterial_spot
- Potato: late_blight, early_blight, scab, wilt
- Wheat: stripe_rust, leaf_rust, powdery_mildew, tan_spot

## Troubleshooting

### Low Detection Accuracy
1. Ensure preprocessing is enabled
2. Verify image quality (min 224x224)
3. Check lighting conditions
4. Retrain model with more data

### Slow Performance
1. Reduce image size
2. Use component-based detection instead of YOLO
3. Disable preprocessing if not needed
4. Use GPU for model inference

### Memory Issues
1. Process images in batches
2. Reduce image resolution
3. Use smaller YOLO model (yolov8n instead of yolov8l)

## References

- YOLO: https://github.com/ultralytics/ultralytics
- Transfer Learning: https://www.tensorflow.org/guide/transfer_learning
- OpenCV: https://opencv.org/
- scikit-learn: https://scikit-learn.org/
