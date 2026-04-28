# AgriScan ML Training

This folder contains the training workflow for crop disease image recognition. It follows the same classroom pattern as the YOLO activity: prepare an image dataset, train/fine-tune a model, save the trained artifact, and use it in the web upload pipeline.

## 1. Install ML Dependencies

```powershell
cd backend
python -m pip install -r requirements-ml.txt
```

Use Python 3.12 for TensorFlow on Windows. `requirements-ml.txt` contains the TensorFlow classifier stack only; install `requirements-yolo.txt` only when you want to run the optional YOLO workflow.

You can also run the scripts from `backend/app/ml`, but the dataset is still written under `backend/app/ml/datasets/...` and the training artifacts stay under `backend/app/ml/artifacts/...`.

## 2. Download Internet Datasets

The default dataset preparation script now focuses on crops that are more relevant to Philippine farming. It downloads public datasets from Hugging Face for:

- rice: `minhhungg/rice-disease-dataset`
- corn, tomato, pepper, and potato: `avinashhm/plant-disease-classification`
- banana: `as-cle-bert/banana-disease-classification`
- mango: `AfiqN/mango-leaf-disease-test`
- guava: `YaswanthReddy23/Guava_leaf`

```powershell
python app/ml/prepare_training_dataset.py --clean --sources philippines --max-per-class 50
```

If you are already inside `backend/app/ml`, use:

```powershell
python prepare_training_dataset.py --clean --sources philippines --max-per-class 50
```

Output:

```text
app/ml/datasets/agriscan_leaf/
  train/
    banana_black_sigatoka/
    banana_healthy/
    corn_common_rust/
    corn_gray_leaf_spot/
    corn_northern_leaf_blight/
    corn_healthy/
    guava_red_rust/
    guava_scab/
    mango_anthracnose/
    mango_powdery_mildew/
    pepper_bacterial_spot/
    pepper_healthy/
    potato_early_blight/
    potato_late_blight/
    rice_bacterial_leaf_blight/
    rice_blast/
    rice_brown_spot/
    rice_tungro_virus/
    tomato_bacterial_spot/
    tomato_early_blight/
    tomato_late_blight/
    tomato_yellow_leaf_curl_virus/
  val/
    ...
```

This expanded crop set is aimed at common Philippine crops such as rice, corn, banana, mango, tomato, pepper, potato, and guava.

## 3A. Train TensorFlow Classifier

```powershell
python app/ml/train_classifier.py --epochs 6 --fine-tune-epochs 1 --batch-size 16
```

This saves:

```text
app/ml/artifacts/crop_disease_model.keras
app/ml/artifacts/labels.json
app/ml/artifacts/training_metrics.json
```

The FastAPI scan route loads this model automatically through `MODEL_PATH` and `MODEL_LABELS_PATH`.

## 3B. Train YOLOv8-Style Classifier

For a workflow closer to the YOLO presentation:

```powershell
python -m pip install -r requirements-yolo.txt
python app/ml/train_yolo.py --task classify --model yolov8n-cls.pt --epochs 20 --imgsz 224
```

Copy the resulting `best.pt` path into `.env`:

```text
MODEL_PATH=app/ml/runs/agriscan-yolo/weights/best.pt
```

For true object detection with bounding boxes, use an annotated YOLO dataset and run:

```powershell
python app/ml/train_yolo.py --task detect --model yolov8n.pt --data path/to/data.yaml --epochs 50 --imgsz 640
```

Classification datasets only contain image-level labels. Detection requires bounding box annotations.
