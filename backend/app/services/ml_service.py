import logging
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class DiseaseDetection:
    disease_name: str
    confidence: float
    cause: str
    treatment: str
    crop_label: str | None = None


CLASS_METADATA: dict[str, dict[str, str]] = {
    "pest_leaf_damage": {
        "name": "Pest-related leaf damage",
        "cause": "Chewing or sucking insects are causing visible lesions, holes, or discoloration on the leaf surface.",
        "treatment": "Inspect leaf undersides, remove heavily affected leaves, and follow integrated pest management before using any DA-approved pesticide.",
    },
    "healthy": {
        "name": "Healthy crop",
        "cause": "No major disease pattern was detected by the model.",
        "treatment": "Continue regular monitoring, balanced watering, sanitation, and nutrient management.",
    },
}

DEFAULT_LABELS = [
    "rice_healthy",
    "rice_bacterial_leaf_blight",
    "rice_blast",
    "rice_brown_spot",
    "rice_tungro_virus",
    "rice_hispa",
    "rice_leaf_folder",
    "rice_brown_plant_hopper",
    "corn_healthy",
    "corn_gray_leaf_spot",
    "corn_common_rust",
    "corn_northern_leaf_blight",
    "tomato_healthy",
    "tomato_bacterial_spot",
    "tomato_early_blight",
    "tomato_late_blight",
    "pepper_healthy",
    "pepper_bacterial_spot",
    "potato_healthy",
    "potato_early_blight",
    "potato_late_blight",
    "banana_healthy",
    "banana_black_sigatoka",
    "banana_bract_mosaic_virus",
    "banana_insect_pest",
    "banana_moko_disease",
    "banana_panama_disease",
    "banana_yellow_sigatoka",
    "mango_healthy",
    "mango_anthracnose",
    "mango_bacterial_canker",
    "mango_cutting_weevil",
    "mango_die_back",
    "mango_gall_midge",
    "mango_powdery_mildew",
    "mango_sooty_mould",
    "guava_healthy",
    "guava_phytophthora",
    "guava_red_rust",
    "guava_scab",
    "guava_styler_and_root",
]

CROP_DISPLAY_NAMES = {
    "rice": "Rice",
    "corn": "Corn",
    "tomato": "Tomato",
    "pepper": "Pepper",
    "potato": "Potato",
    "banana": "Banana",
    "mango": "Mango",
    "guava": "Guava",
}

LEGACY_CLASS_TO_CROP = {
    "rice_bacterial_leaf_blight": "rice",
    "corn_leaf_blight": "corn",
    "tomato_late_blight": "tomato",
    "pest_leaf_damage": None,
    "healthy": None,
}

CLASS_ALIASES = {
    "bacterial_leaf_blight": "rice_bacterial_leaf_blight",
    "bacterialblight": "rice_bacterial_leaf_blight",
    "bacterial_blight": "rice_bacterial_leaf_blight",
    "rice_brownspot": "rice_brown_spot",
    "brownspot": "rice_brown_spot",
    "tungro_virus": "rice_tungro_virus",
    "brown_plant_hopper": "rice_brown_plant_hopper",
    "corn_leaf_blight": "corn_northern_leaf_blight",
    "corn_(maize)___cercospora_leaf_spot_gray_leaf_spot": "corn_gray_leaf_spot",
    "corn_gray_leaf_spot": "corn_gray_leaf_spot",
    "corn_(maize)___common_rust_": "corn_common_rust",
    "corn_rust_leaf": "corn_common_rust",
    "corn_(maize)___northern_leaf_blight": "corn_northern_leaf_blight",
    "corn___northern_leaf_blight": "corn_northern_leaf_blight",
    "northern_leaf_blight": "corn_northern_leaf_blight",
    "tomato___bacterial_spot": "tomato_bacterial_spot",
    "tomato___early_blight": "tomato_early_blight",
    "tomato___late_blight": "tomato_late_blight",
    "late_blight": "tomato_late_blight",
    "tomato___leaf_mold": "tomato_leaf_mold",
    "tomato___septoria_leaf_spot": "tomato_septoria_leaf_spot",
    "tomato___spider_mites_two_spotted_spider_mite": "tomato_spider_mites",
    "spider_mites": "tomato_spider_mites",
    "tomato___target_spot": "tomato_target_spot",
    "tomato___tomato_yellow_leaf_curl_virus": "tomato_yellow_leaf_curl_virus",
    "tomato___tomato_mosaic_virus": "tomato_mosaic_virus",
    "tomato_tomato_mosaic_virus": "tomato_mosaic_virus",
    "pepper,_bell___bacterial_spot": "pepper_bacterial_spot",
    "pepper,_bell___healthy": "pepper_healthy",
    "potato___early_blight": "potato_early_blight",
    "potato___late_blight": "potato_late_blight",
    "potato___healthy": "potato_healthy",
    "banana_healthy_leaf": "banana_healthy",
    "black_sigatoka": "banana_black_sigatoka",
    "bract_mosaic_virus": "banana_bract_mosaic_virus",
    "insect_pest": "banana_insect_pest",
    "moko_disease": "banana_moko_disease",
    "panama_disease": "banana_panama_disease",
    "yellow_sigatoka": "banana_yellow_sigatoka",
    "anthracnose": "mango_anthracnose",
    "bacterial_canker": "mango_bacterial_canker",
    "cutting_weevil": "mango_cutting_weevil",
    "die_back": "mango_die_back",
    "gall_midge": "mango_gall_midge",
    "powdery_mildew": "mango_powdery_mildew",
    "sooty_mould": "mango_sooty_mould",
    "phytopthora": "guava_phytophthora",
    "red_rust": "guava_red_rust",
    "styler_and_root": "guava_styler_and_root",
    "healthy": "healthy",
}

CROP_ALIASES = {
    "palay": "rice",
    "rice": "rice",
    "mais": "corn",
    "maize": "corn",
    "corn": "corn",
    "kamatis": "tomato",
    "tomato": "tomato",
    "tomatoes": "tomato",
    "sili": "pepper",
    "chili": "pepper",
    "chilli": "pepper",
    "bell pepper": "pepper",
    "pepper": "pepper",
    "patatas": "potato",
    "potato": "potato",
    "saging": "banana",
    "banana": "banana",
    "mangga": "mango",
    "mango": "mango",
    "bayabas": "guava",
    "guava": "guava",
}

DISEASE_PROFILES = {
    "healthy": {
        "name": "Healthy crop",
        "cause": "No major disease pattern was detected by the model.",
        "treatment": "Continue regular monitoring, good field sanitation, balanced watering, and proper nutrition.",
    },
    "bacterial_leaf_blight": {
        "name": "Bacterial leaf blight",
        "cause": "A bacterial infection is spreading through splashing water, wind-driven rain, or infected planting material.",
        "treatment": "Use clean seed or seedlings, improve drainage, reduce excess nitrogen, and ask the local agriculture office about approved bactericide guidance.",
    },
    "blast": {
        "name": "Blast",
        "cause": "A fungal disease is attacking the leaves and can spread faster in humid, crowded field conditions.",
        "treatment": "Improve spacing and airflow, avoid heavy late nitrogen, remove badly infected material, and use resistant varieties or approved fungicide when advised.",
    },
    "brown_spot": {
        "name": "Brown spot",
        "cause": "Fungal spotting is developing on stressed leaves, often made worse by poor nutrition or prolonged moisture.",
        "treatment": "Correct nutrient imbalance, keep the field clean, avoid prolonged leaf wetness, and use approved fungicide only if field pressure is high.",
    },
    "tungro_virus": {
        "name": "Tungro virus",
        "cause": "A virus is being spread by insect vectors, leading to yellowing, stunting, and reduced vigor.",
        "treatment": "Rogue severely affected plants, control insect vectors early, synchronize planting where possible, and use tolerant varieties.",
    },
    "hispa": {
        "name": "Hispa damage",
        "cause": "Leaf-feeding hispa insects are scraping or boring leaf tissue and reducing photosynthetic area.",
        "treatment": "Scout the field closely, remove heavily affected leaves when practical, and follow integrated pest management for hispa control.",
    },
    "leaf_folder": {
        "name": "Leaf folder damage",
        "cause": "Leaf-folder larvae are folding and feeding inside the leaves, causing visible drying and reduced leaf area.",
        "treatment": "Monitor larval activity, preserve natural enemies, and use threshold-based pest control if infestations increase.",
    },
    "brown_plant_hopper": {
        "name": "Brown plant hopper damage",
        "cause": "Sap-sucking hoppers are stressing the crop and can trigger yellowing, wilting, and hopper-burn patches.",
        "treatment": "Avoid unnecessary insecticide sprays that kill beneficial insects, manage water carefully, and follow local hopper IPM thresholds.",
    },
    "gray_leaf_spot": {
        "name": "Gray leaf spot",
        "cause": "A fungal leaf-spot disease is favored by humid weather and infected crop residue.",
        "treatment": "Rotate crops, bury or remove infected residue, improve airflow, and use resistant varieties or approved fungicide if needed.",
    },
    "common_rust": {
        "name": "Common rust",
        "cause": "Rust spores are infecting leaf tissue, especially under cool to mild humid conditions.",
        "treatment": "Scout early, plant resistant varieties where possible, maintain good field hygiene, and apply approved fungicide if pressure becomes severe.",
    },
    "northern_leaf_blight": {
        "name": "Northern leaf blight",
        "cause": "A fungal infection is causing elongated lesions and can spread in humid fields with infected residue.",
        "treatment": "Rotate crops, remove residue, plant tolerant varieties, and follow local fungicide advice when disease pressure is high.",
    },
    "late_blight": {
        "name": "Late blight",
        "cause": "A fast-moving water mold infection is favored by cool, wet, and cloudy conditions.",
        "treatment": "Remove affected leaves, keep foliage dry, improve airflow, and apply protective fungicide early when disease risk is confirmed.",
    },
    "early_blight": {
        "name": "Early blight",
        "cause": "A fungal disease is creating dark concentric lesions, often when plants are stressed or older leaves stay wet.",
        "treatment": "Remove older infected leaves, mulch or stake plants to limit splash, and use approved fungicide if symptoms spread quickly.",
    },
    "bacterial_spot": {
        "name": "Bacterial spot",
        "cause": "A bacterial pathogen is causing spotting and tissue breakdown that spreads through water splash and handling.",
        "treatment": "Avoid working in wet plants, prune infected leaves, improve airflow, and follow copper-based or approved bactericide guidance locally.",
    },
    "leaf_mold": {
        "name": "Leaf mold",
        "cause": "Fungal growth is developing where humidity remains high and airflow is poor.",
        "treatment": "Lower humidity around the crop, prune crowded growth, avoid overhead watering, and use approved fungicide if spread continues.",
    },
    "septoria_leaf_spot": {
        "name": "Septoria leaf spot",
        "cause": "A fungal leaf-spot disease is spreading upward from lower foliage through splashing water.",
        "treatment": "Remove lower infected leaves, keep irrigation off the foliage, mulch the soil surface, and rotate away from susceptible crops.",
    },
    "target_spot": {
        "name": "Target spot",
        "cause": "A fungal disease is producing circular target-like lesions under warm, humid conditions.",
        "treatment": "Improve airflow, remove infected leaves, avoid excess nitrogen, and use approved fungicide if the outbreak expands.",
    },
    "yellow_leaf_curl_virus": {
        "name": "Yellow leaf curl virus",
        "cause": "A viral infection is being spread by insect vectors and is causing curling, yellowing, and stunting.",
        "treatment": "Remove severely infected plants, manage whiteflies early, use reflective mulch or netting when practical, and plant tolerant varieties.",
    },
    "mosaic_virus": {
        "name": "Mosaic virus",
        "cause": "A virus is causing mottling and distortion, often spread by sap contact, tools, or insect vectors.",
        "treatment": "Disinfect tools, remove severely affected plants, control insect vectors, and avoid handling plants when they are wet.",
    },
    "spider_mites": {
        "name": "Spider mite damage",
        "cause": "Spider mites are feeding on the leaf tissue and causing stippling, bronzing, and webbing under dry conditions.",
        "treatment": "Inspect the underside of leaves, raise humidity when appropriate, wash off light infestations, and use mite-targeted controls if needed.",
    },
    "black_sigatoka": {
        "name": "Black Sigatoka",
        "cause": "A fungal banana leaf disease is reducing healthy leaf area and can weaken fruit filling if unmanaged.",
        "treatment": "Remove heavily infected leaves, improve air movement, avoid overcrowding, and follow recommended fungicide rotation if confirmed locally.",
    },
    "yellow_sigatoka": {
        "name": "Yellow Sigatoka",
        "cause": "A fungal banana leaf disease is causing streaking and spots that reduce photosynthesis over time.",
        "treatment": "Prune infected leaves, keep plantations well ventilated, and follow local disease-management advice for Sigatoka control.",
    },
    "panama_disease": {
        "name": "Panama disease",
        "cause": "A soil-borne wilt pathogen is affecting the banana plant through the roots and vascular tissue.",
        "treatment": "Isolate affected mats, improve sanitation, avoid moving contaminated soil, and coordinate with agriculture officers on resistant varieties and containment.",
    },
    "moko_disease": {
        "name": "Moko disease",
        "cause": "A bacterial wilt disease is spreading through infected tools, insects, and planting material.",
        "treatment": "Disinfect tools strictly, rogue infected plants and mats, control insect movement where relevant, and avoid replanting susceptible material in the same spot.",
    },
    "bract_mosaic_virus": {
        "name": "Bract mosaic virus",
        "cause": "A viral banana disease is causing mottling and distortion in infected plant tissues.",
        "treatment": "Remove infected plants, use clean planting material, control aphids or other vectors, and maintain strict field sanitation.",
    },
    "insect_pest": {
        "name": "Insect pest damage",
        "cause": "Visible feeding, chewing, or sap-sucking damage indicates an active pest pressure on the crop.",
        "treatment": "Confirm the pest species in the field, preserve beneficial insects, and use threshold-based pest management before spraying.",
    },
    "anthracnose": {
        "name": "Anthracnose",
        "cause": "A fungal disease is creating dark, sunken, or spreading lesions on leaves or fruit tissues.",
        "treatment": "Prune infected tissues, avoid prolonged wetness, improve airflow, and use approved fungicide or protective spray when recommended.",
    },
    "bacterial_canker": {
        "name": "Bacterial canker",
        "cause": "A bacterial infection is entering through wounds or natural openings and damaging plant tissue.",
        "treatment": "Prune and destroy infected parts, disinfect tools, avoid overhead irrigation, and ask local crop specialists about approved bactericide options.",
    },
    "cutting_weevil": {
        "name": "Cutting weevil damage",
        "cause": "Weevil feeding is damaging plant tissues and reducing healthy leaf area or vigor.",
        "treatment": "Inspect regularly for adult insects and fresh feeding marks, remove heavily damaged tissue, and apply IPM controls suited to weevils.",
    },
    "die_back": {
        "name": "Die-back",
        "cause": "Progressive tissue death is moving back from the tips, often linked to fungal infection, stress, or secondary infections.",
        "treatment": "Prune back to healthy tissue, improve sanitation, reduce stress, and protect wounds using locally recommended management practices.",
    },
    "gall_midge": {
        "name": "Gall midge damage",
        "cause": "Gall midge infestation is distorting tender tissues and reducing normal growth.",
        "treatment": "Scout tender flushes, prune infested material if practical, and follow integrated pest management steps for gall midge.",
    },
    "powdery_mildew": {
        "name": "Powdery mildew",
        "cause": "A fungal disease is producing white powdery growth on leaf surfaces in humid or poorly ventilated conditions.",
        "treatment": "Improve airflow, prune crowded growth, avoid excessive nitrogen, and apply approved sulfur or fungicide products when needed.",
    },
    "sooty_mould": {
        "name": "Sooty mould",
        "cause": "Sooty fungal growth is developing on honeydew left by sap-sucking insects such as aphids, mealybugs, or scales.",
        "treatment": "Control the insect source first, wash off light mould where practical, and improve monitoring for recurring sap-sucking pests.",
    },
    "phytophthora": {
        "name": "Phytophthora disease",
        "cause": "A water mold infection is favored by wet soil, splash, and prolonged humidity.",
        "treatment": "Improve drainage, reduce standing water, remove infected tissues, and follow crop-specific oomycete management guidance locally.",
    },
    "red_rust": {
        "name": "Red rust",
        "cause": "A rust-type disease is infecting the leaf surface and reducing healthy photosynthetic area.",
        "treatment": "Prune infected foliage, improve canopy ventilation, and use approved fungicide guidance if symptoms continue to spread.",
    },
    "scab": {
        "name": "Scab",
        "cause": "Scab lesions are forming because of a pathogen favored by moisture and young susceptible tissues.",
        "treatment": "Remove infected tissues, protect new flushes, improve airflow, and use crop-specific fungicide guidance when needed.",
    },
    "styler_and_root": {
        "name": "Styler and root disorder",
        "cause": "The model detected symptoms matching a guava styler-and-root problem pattern in the dataset labels.",
        "treatment": "Inspect the roots and lower plant parts closely, improve drainage and sanitation, and confirm the diagnosis with a local agriculture specialist.",
    },
}

NON_CROP_IMAGE_KEYWORDS = (
    "dog",
    "cat",
    "pug",
    "terrier",
    "spaniel",
    "retriever",
    "shepherd",
    "hound",
    "husky",
    "wolf",
    "fox",
    "bear",
    "lion",
    "tiger",
    "leopard",
    "jaguar",
    "monkey",
    "ape",
    "gorilla",
    "orangutan",
    "baboon",
    "lemur",
    "horse",
    "zebra",
    "cow",
    "ox",
    "buffalo",
    "goat",
    "sheep",
    "ram",
    "deer",
    "gazelle",
    "pig",
    "boar",
    "rabbit",
    "hare",
    "hamster",
    "guinea_pig",
    "bird",
    "eagle",
    "owl",
    "hen",
    "cock",
    "duck",
    "goose",
    "parrot",
    "penguin",
    "fish",
    "shark",
    "ray",
    "whale",
    "dolphin",
    "seal",
    "otter",
    "snake",
    "lizard",
    "turtle",
    "frog",
    "toad",
    "spider",
    "butterfly",
    "beetle",
    "bee",
    "human",
    "person",
    "face",
    "baby",
    "keyboard",
    "laptop",
    "computer",
    "screen",
    "monitor",
    "phone",
    "chair",
    "table",
    "mug",
    "bottle",
    "car",
    "truck",
    "bus",
    "bicycle",
    "motorcycle",
)


class CropDiseaseDetector:
    def __init__(self) -> None:
        self._model = None
        self._model_type = "tensorflow"
        self._labels = list(DEFAULT_LABELS)
        self._general_validator_model = None
        self._general_validator_loaded = False
        self._loaded_model_path: Path | None = None
        self._loaded_model_mtime: float | None = None

    def _load_model(self) -> None:
        model_path = self._resolve_model_path(Path(settings.model_path))
        current_mtime = model_path.stat().st_mtime if model_path.exists() else None
        if self._model is not None and self._loaded_model_path is not None:
            same_path = self._loaded_model_path.resolve() == model_path.resolve()
            same_mtime = self._loaded_model_mtime == current_mtime
            if same_path and same_mtime:
                return
            logger.info("Reloading disease model from %s", model_path)
            self._model = None
            self._model_type = "tensorflow"
            self._labels = list(DEFAULT_LABELS)

        if not model_path.exists():
            logger.warning("ML model not found at %s. Using deterministic image heuristic fallback.", model_path)
            self._loaded_model_path = None
            self._loaded_model_mtime = None
            return

        self._loaded_model_path = model_path
        self._loaded_model_mtime = current_mtime
        self._labels = self._load_labels(model_path)
        if model_path.suffix == ".pt":
            self._load_ultralytics_model(model_path)
            return
        try:
            import tensorflow as tf

            self._model_type = "tensorflow"
            self._model = tf.keras.models.load_model(model_path)
        except Exception:
            logger.exception("Could not load TensorFlow model. Using fallback detector.")
            self._model = None
            self._loaded_model_path = None
            self._loaded_model_mtime = None

    def _resolve_model_path(self, configured_path: Path) -> Path:
        latest_trained = self._find_latest_trained_model()
        if configured_path.exists():
            if latest_trained is not None and latest_trained.resolve() != configured_path.resolve():
                try:
                    if latest_trained.stat().st_mtime > configured_path.stat().st_mtime:
                        logger.info(
                            "Using newer trained disease model at %s instead of configured model %s",
                            latest_trained,
                            configured_path,
                        )
                        return latest_trained
                except OSError:
                    logger.exception("Could not compare configured model and latest trained model timestamps.")
            return configured_path
        if not configured_path.suffix:
            keras_path = configured_path.with_suffix(".keras")
            if keras_path.exists():
                return keras_path
            pt_path = configured_path.with_suffix(".pt")
            if pt_path.exists():
                return pt_path
        if latest_trained is not None:
            logger.info("Using latest trained disease model at %s", latest_trained)
            return latest_trained
        return configured_path

    def _find_latest_trained_model(self) -> Path | None:
        candidates: list[Path] = []
        search_roots = [
            Path("app/ml/artifacts"),
            Path("app/ml/runs"),
            Path("app/ml"),
        ]

        for root in search_roots:
            if not root.exists():
                continue
            candidates.extend(root.rglob("best.pt"))
            candidates.extend(root.rglob("*.keras"))

        if not candidates:
            return None

        return max(candidates, key=lambda path: path.stat().st_mtime)

    def _load_labels(self, model_path: Path) -> list[str]:
        labels_path = Path(settings.model_labels_path)
        if not labels_path.exists():
            labels_path = model_path.with_name("labels.json")
        if not labels_path.exists():
            return list(DEFAULT_LABELS)
        try:
            labels = json.loads(labels_path.read_text(encoding="utf-8"))
            if isinstance(labels, list) and all(isinstance(item, str) for item in labels):
                return labels
        except Exception:
            logger.exception("Could not read model labels from %s.", labels_path)
        return list(DEFAULT_LABELS)

    def _load_ultralytics_model(self, model_path: Path) -> None:
        try:
            from ultralytics import YOLO

            self._model_type = "ultralytics"
            self._model = YOLO(str(model_path))
        except Exception:
            logger.exception("Could not load Ultralytics YOLO model. Using fallback detector.")
            self._model = None
            self._loaded_model_path = None
            self._loaded_model_mtime = None

    def _preprocess(self, image_path: str) -> np.ndarray:
        image = Image.open(image_path).convert("RGB").resize((224, 224))
        array = np.asarray(image, dtype=np.float32) / 255.0
        return np.expand_dims(array, axis=0)

    def _load_general_validator(self) -> None:
        if self._general_validator_loaded:
            return

        self._general_validator_loaded = True
        try:
            import tensorflow as tf

            self._general_validator_model = tf.keras.applications.MobileNetV2(weights="imagenet")
        except Exception:
            logger.exception("Could not load general image validator. Falling back to crop-image heuristics only.")
            self._general_validator_model = None

    def _is_obvious_non_crop_image(self, image_path: str) -> bool:
        self._load_general_validator()
        if self._general_validator_model is None:
            return self._fails_basic_crop_signal(image_path)

        try:
            import tensorflow as tf

            image = Image.open(image_path).convert("RGB").resize((224, 224))
            array = np.asarray(image, dtype=np.float32)
            batch = np.expand_dims(array, axis=0)
            preprocessed = tf.keras.applications.mobilenet_v2.preprocess_input(batch.copy())
            predictions = self._general_validator_model.predict(preprocessed, verbose=0)
            decoded = tf.keras.applications.mobilenet_v2.decode_predictions(predictions, top=3)[0]

            top_label = str(decoded[0][1]).lower()
            top_score = float(decoded[0][2])
            if top_score >= 0.55 and any(keyword in top_label for keyword in NON_CROP_IMAGE_KEYWORDS):
                logger.info("Rejected obvious non-crop image: %s (%.2f)", top_label, top_score)
                return True
        except Exception:
            logger.exception("General image validator failed; using basic crop-signal heuristic.")

        return self._fails_basic_crop_signal(image_path)

    def _fails_basic_crop_signal(self, image_path: str) -> bool:
        image = Image.open(image_path).convert("RGB").resize((160, 160))
        array = np.asarray(image, dtype=np.float32) / 255.0
        red = array[:, :, 0]
        green = array[:, :, 1]
        blue = array[:, :, 2]
        max_channel = np.max(array, axis=2)
        min_channel = np.min(array, axis=2)
        saturation = max_channel - min_channel

        green_dominant_ratio = float(np.mean((green > red * 1.05) & (green > blue * 1.05) & (saturation > 0.08)))
        warm_plant_ratio = float(np.mean((red > 0.28) & (green > 0.18) & (blue < red * 0.95) & (saturation > 0.08)))
        overall_signal = max(green_dominant_ratio, warm_plant_ratio)
        nonwhite_mask = (red < 0.95) | (green < 0.95) | (blue < 0.95)
        nonwhite_ratio = float(np.mean(nonwhite_mask))
        plant_pixels = ((green > red * 1.02) & (green > blue * 1.02) & (green > 0.15)) | (
            (red > 0.25) & (green > 0.18) & (blue < red * 0.98)
        )
        plant_within_nonwhite = float(np.mean(plant_pixels[nonwhite_mask])) if np.any(nonwhite_mask) else 0.0

        return overall_signal < 0.08 and not (nonwhite_ratio >= 0.05 and plant_within_nonwhite >= 0.45)

    def _fallback_detect(self, image_path: str, crop_type: str | None = None) -> DiseaseDetection:
        image = Image.open(image_path).convert("RGB").resize((96, 96))
        array = np.asarray(image, dtype=np.float32)
        green = array[:, :, 1].mean()
        red = array[:, :, 0].mean()
        blue = array[:, :, 2].mean()
        contrast = array.std()
        normalized_crop = self._normalize_crop_type(crop_type)

        if green > red * 1.18 and green > blue * 1.18 and contrast < 55:
            key = "healthy"
            confidence = 0.72
        elif contrast > 75:
            key = "pest_leaf_damage"
            confidence = 0.64
        elif normalized_crop == "rice":
            key = "rice_bacterial_leaf_blight"
            confidence = 0.67
        elif normalized_crop == "corn":
            key = "corn_leaf_blight"
            confidence = 0.66
        elif normalized_crop == "tomato":
            key = "tomato_late_blight"
            confidence = 0.68
        elif red > green * 1.08:
            key = "tomato_late_blight"
            confidence = 0.68
        elif blue > red:
            key = "rice_bacterial_leaf_blight"
            confidence = 0.61
        else:
            key = "corn_leaf_blight"
            confidence = 0.63

        meta = self._metadata_for_key(key)
        crop_label = self._crop_label_from_key(key, crop_type=crop_type)
        return DiseaseDetection(meta["name"], confidence, meta["cause"], meta["treatment"], crop_label=crop_label)

    def detect(self, image_path: str, crop_type: str | None = None) -> DiseaseDetection:
        if crop_type is None and self._is_obvious_non_crop_image(image_path):
            return DiseaseDetection(
                disease_name="Invalid crop or leaf image",
                confidence=0.0,
                cause="The uploaded photo does not appear to be a crop or leaf image that AgriScan can diagnose.",
                treatment="Upload a clear close-up photo of one crop leaf or plant part. Avoid pets, people, tools, and indoor objects.",
                crop_label=None,
            )

        self._load_model()
        if self._model is None:
            return self._fallback_detect(image_path, crop_type)
        if self._model_type == "ultralytics":
            detection = self._detect_with_ultralytics(image_path, crop_type)
        else:
            predictions = self._model.predict(self._preprocess(image_path), verbose=0)[0]
            index = self._select_index_for_crop(predictions, crop_type)
            key = self._labels[index] if index < len(self._labels) else "healthy"
            meta = self._metadata_for_key(key)
            detection = DiseaseDetection(
                disease_name=meta["name"],
                confidence=float(predictions[index]),
                cause=meta["cause"],
                treatment=meta["treatment"],
                crop_label=self._infer_crop_label_from_scores(predictions, self._labels, predicted_key=key, crop_type=crop_type),
            )

        if crop_type is None and detection.confidence < 0.58:
            return DiseaseDetection(
                disease_name="Low-confidence crop image",
                confidence=detection.confidence,
                cause="AgriScan could not confidently verify the crop or disease from this image alone.",
                treatment="Retake a closer photo of one leaf under natural light and keep the crop leaf centered in the frame.",
                crop_label=detection.crop_label,
            )

        return detection

    def _detect_with_ultralytics(self, image_path: str, crop_type: str | None = None) -> DiseaseDetection:
        result = self._model(image_path, verbose=False)[0]
        key = "healthy"
        confidence = 0.0
        crop_label = self._crop_label_from_key(key, crop_type=crop_type)

        if getattr(result, "probs", None) is not None:
            scores = result.probs.data.cpu().numpy()
            index = self._select_index_for_crop(scores, crop_type)
            confidence = float(scores[index])
            names = getattr(result, "names", {}) or {}
            key = str(names.get(index, self._labels[index] if index < len(self._labels) else "healthy"))
            crop_label = self._infer_crop_label_from_scores(scores, self._labels, predicted_key=key, crop_type=crop_type)
        elif getattr(result, "boxes", None) is not None and len(result.boxes) > 0:
            boxes = result.boxes
            top_index = self._select_box_index_for_crop(boxes.cls.cpu().numpy(), boxes.conf.cpu().numpy(), result.names, crop_type)
            class_id = int(boxes.cls[top_index].item())
            confidence = float(boxes.conf[top_index].item())
            key = str(result.names.get(class_id, "healthy"))
            crop_label = self._infer_crop_label_from_boxes(
                boxes.cls.cpu().numpy(),
                boxes.conf.cpu().numpy(),
                result.names,
                predicted_key=key,
                crop_type=crop_type,
            )

        meta = self._metadata_for_key(key)
        return DiseaseDetection(meta["name"], confidence, meta["cause"], meta["treatment"], crop_label=crop_label)

    def _select_index_for_crop(self, scores: np.ndarray, crop_type: str | None) -> int:
        normalized_crop = self._normalize_crop_type(crop_type)
        if normalized_crop:
            compatible_indices = [
                index
                for index, label in enumerate(self._labels)
                if self._is_class_compatible_with_crop(self._canonical_key_for_label(label), normalized_crop)
            ]
            if compatible_indices:
                best_index = max(compatible_indices, key=lambda index: float(scores[index]))
                return int(best_index)
        return int(np.argmax(scores))

    def _select_box_index_for_crop(self, class_ids: np.ndarray, scores: np.ndarray, names: dict, crop_type: str | None) -> int:
        normalized_crop = self._normalize_crop_type(crop_type)
        if normalized_crop:
            compatible_indices = []
            for index, class_id in enumerate(class_ids):
                label = str(names.get(int(class_id), "healthy"))
                if self._is_class_compatible_with_crop(self._canonical_key_for_label(label), normalized_crop):
                    compatible_indices.append(index)
            if compatible_indices:
                best_index = max(compatible_indices, key=lambda index: float(scores[index]))
                return int(best_index)
        return int(np.argmax(scores))

    def _normalize_crop_type(self, crop_type: str | None) -> str | None:
        if not crop_type:
            return None
        normalized = crop_type.strip().lower().replace("_", " ").replace("-", " ")
        if not normalized:
            return None
        if normalized in CROP_ALIASES:
            return CROP_ALIASES[normalized]
        for alias, canonical in CROP_ALIASES.items():
            if alias in normalized:
                return canonical
        return None

    def _display_crop_label(self, crop_key: str | None) -> str | None:
        if not crop_key:
            return None
        return CROP_DISPLAY_NAMES.get(crop_key, crop_key.replace("_", " ").title())

    def _crop_key_from_class_key(self, class_key: str | None) -> str | None:
        if not class_key:
            return None
        if class_key in LEGACY_CLASS_TO_CROP:
            return LEGACY_CLASS_TO_CROP[class_key]
        for crop_key in CROP_DISPLAY_NAMES:
            if class_key == crop_key or class_key.startswith(f"{crop_key}_"):
                return crop_key
        return None

    def _crop_label_from_key(self, key: str, crop_type: str | None = None) -> str | None:
        normalized_crop = self._normalize_crop_type(crop_type)
        if normalized_crop:
            return self._display_crop_label(normalized_crop)

        class_key = self._canonical_key_for_label(key)
        crop_key = self._crop_key_from_class_key(class_key)
        return self._display_crop_label(crop_key)

    def _infer_crop_label_from_scores(
        self,
        scores: np.ndarray,
        labels: list[str],
        *,
        predicted_key: str,
        crop_type: str | None = None,
    ) -> str | None:
        direct_label = self._crop_label_from_key(predicted_key, crop_type=crop_type)
        if direct_label:
            return direct_label

        crop_scores: dict[str, float] = {}
        for index, label in enumerate(labels):
            class_key = self._canonical_key_for_label(label)
            crop_key = self._crop_key_from_class_key(class_key)
            if crop_key is None:
                continue
            crop_scores[crop_key] = max(crop_scores.get(crop_key, 0.0), float(scores[index]))

        if not crop_scores:
            return None

        best_crop = max(crop_scores, key=crop_scores.get)
        return self._display_crop_label(best_crop)

    def _infer_crop_label_from_boxes(
        self,
        class_ids: np.ndarray,
        scores: np.ndarray,
        names: dict,
        *,
        predicted_key: str,
        crop_type: str | None = None,
    ) -> str | None:
        direct_label = self._crop_label_from_key(predicted_key, crop_type=crop_type)
        if direct_label:
            return direct_label

        crop_scores: dict[str, float] = {}
        for index, class_id in enumerate(class_ids):
            label = str(names.get(int(class_id), "healthy"))
            class_key = self._canonical_key_for_label(label)
            crop_key = self._crop_key_from_class_key(class_key)
            if crop_key is None:
                continue
            crop_scores[crop_key] = max(crop_scores.get(crop_key, 0.0), float(scores[index]))

        if not crop_scores:
            return None

        best_crop = max(crop_scores, key=crop_scores.get)
        return self._display_crop_label(best_crop)

    def _canonical_key_for_label(self, key: str) -> str:
        normalized = key.lower().replace(" ", "_").replace("-", "_")
        return CLASS_ALIASES.get(normalized, normalized)

    def _is_class_compatible_with_crop(self, class_key: str, crop_key: str) -> bool:
        detected_crop = self._crop_key_from_class_key(class_key)
        return detected_crop == crop_key or class_key in {"healthy", "pest_leaf_damage"}

    def _title_case_tokens(self, value: str) -> str:
        return " ".join(token.upper() if token in {"ipm"} else token.capitalize() for token in value.split("_"))

    def _metadata_for_key(self, key: str) -> dict[str, str]:
        class_key = self._canonical_key_for_label(key)
        if class_key in CLASS_METADATA:
            return CLASS_METADATA[class_key]

        crop_key = self._crop_key_from_class_key(class_key)
        if class_key == "healthy" or class_key.endswith("_healthy"):
            return DISEASE_PROFILES["healthy"]

        condition_key = class_key
        if crop_key and class_key.startswith(f"{crop_key}_"):
            condition_key = class_key[len(crop_key) + 1 :]
        elif class_key in LEGACY_CLASS_TO_CROP and LEGACY_CLASS_TO_CROP[class_key]:
            condition_key = class_key[len(LEGACY_CLASS_TO_CROP[class_key]) + 1 :]

        if condition_key in DISEASE_PROFILES:
            profile = DISEASE_PROFILES[condition_key]
            display_crop = self._display_crop_label(crop_key)
            if display_crop and profile["name"] != "Healthy crop":
                return {
                    "name": f"{display_crop} {profile['name'].lower()}",
                    "cause": profile["cause"],
                    "treatment": profile["treatment"],
                }
            return profile

        return {
            "name": self._title_case_tokens(class_key),
            "cause": "The trained model detected this crop condition from visual leaf patterns.",
            "treatment": "Confirm with an agriculture officer and follow local integrated pest and disease management guidance.",
        }


detector = CropDiseaseDetector()


def manual_entry_diagnosis(
    crop_type: str | None,
    affected_part: str | None,
    symptoms: str | None,
    severity: str | None,
    field_notes: str | None,
) -> DiseaseDetection:
    crop = (crop_type or "").lower()
    observed_text = " ".join(
        value.lower()
        for value in [crop_type, affected_part, symptoms, severity, field_notes]
        if value
    )

    if any(term in observed_text for term in ["hole", "chew", "insect", "worm", "larvae", "mites", "thrips", "hopper", "pest"]):
        key = "pest_leaf_damage"
        confidence = 0.68
    elif "rice" in crop and any(term in observed_text for term in ["water-soaked", "water soaked", "yellow", "wilt", "blight", "lesion"]):
        key = "rice_bacterial_leaf_blight"
        confidence = 0.66
    elif "corn" in crop and any(term in observed_text for term in ["long", "tan", "gray", "grey", "streak", "blight", "spot"]):
        key = "corn_northern_leaf_blight"
        confidence = 0.64
    elif "tomato" in crop and any(term in observed_text for term in ["late blight", "dark", "brown", "wet", "mold", "rot"]):
        key = "tomato_late_blight"
        confidence = 0.65
    elif any(term in observed_text for term in ["healthy", "normal", "green", "no symptom", "no issue"]):
        key = "healthy"
        confidence = 0.62
    else:
        return DiseaseDetection(
            disease_name="Manual field review needed",
            confidence=0.52,
            cause="The typed observations do not strongly match one known disease pattern.",
            treatment="Add a clear leaf photo or ask an agriculture officer to confirm the symptoms before applying treatment.",
            crop_label=None,
        )

    if severity in {"high", "severe"}:
        confidence += 0.04
    elif severity in {"low", "mild"}:
        confidence -= 0.03

    meta = detector._metadata_for_key(key)
    normalized_crop = detector._normalize_crop_type(crop)
    crop_label = detector._crop_label_from_key(key, crop_type=normalized_crop)
    return DiseaseDetection(meta["name"], min(max(confidence, 0.45), 0.78), meta["cause"], meta["treatment"], crop_label=crop_label)
