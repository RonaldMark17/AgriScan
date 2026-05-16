"""
Advanced Crop Classification Module

Implements CNN-based and ensemble classification techniques for:
- Crop species identification
- Health assessment
- Variety classification
- Quality grading
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import json

import numpy as np
from PIL import Image
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC

try:
    import tensorflow as tf
except ModuleNotFoundError:
    tf = None

logger = logging.getLogger(__name__)


@dataclass
class ClassificationResult:
    """Result of crop classification."""
    crop_id: str
    top_predictions: list[tuple[str, float]]  # [(label, confidence), ...]
    predicted_class: str
    confidence: float
    health_status: str  # healthy, diseased, stressed, unknown
    variety: str | None = None
    quality_grade: str = "standard"  # premium, standard, below_standard
    defects: list[str] = None
    recommendations: list[str] = None
    model_used: str = "ensemble"
    processing_time_ms: float = 0.0
    
    def __post_init__(self):
        if self.defects is None:
            self.defects = []
        if self.recommendations is None:
            self.recommendations = []


class CropClassifier:
    """CNN-based crop classifier with ensemble capabilities."""
    
    # Common crop types and their characteristics
    CROP_METADATA = {
        "rice": {
            "varieties": ["IR64", "Basmati", "Jasmine", "Arborio"],
            "growth_stages": ["seedling", "tillering", "panicle", "flowering", "ripening"],
            "typical_colors": ["green", "golden"],
            "diseases": ["blast", "brown_spot", "leaf_scald", "tungro", "hispa"],
        },
        "corn": {
            "varieties": ["Dent", "Flint", "Sweet", "Popcorn"],
            "growth_stages": ["seedling", "V4", "V8", "VT", "R1", "R3", "R6"],
            "typical_colors": ["green", "yellow"],
            "diseases": ["leaf_blight", "rust", "ear_rot", "stalk_rot"],
        },
        "tomato": {
            "varieties": ["Cherry", "Beefsteak", "Roma", "Heirloom"],
            "growth_stages": ["seedling", "flowering", "green_fruit", "breaker", "ripe"],
            "typical_colors": ["green", "red", "orange"],
            "diseases": ["early_blight", "late_blight", "bacterial_spot", "septoria_leaf_spot"],
        },
        "potato": {
            "varieties": ["Russet", "Yukon", "Red", "Fingerling"],
            "growth_stages": ["sprout", "emergence", "vegetative", "flowering", "maturity"],
            "typical_colors": ["green", "brown"],
            "diseases": ["late_blight", "early_blight", "scab", "wilt"],
        },
        "wheat": {
            "varieties": ["Hard Red Winter", "Soft Red Winter", "Durum"],
            "growth_stages": ["seedling", "tillering", "stem_elongation", "heading", "grain_filling"],
            "typical_colors": ["green", "gold"],
            "diseases": ["stripe_rust", "leaf_rust", "powdery_mildew", "tan_spot"],
        },
        "banana": {
            "varieties": ["Lakatan", "Latundan", "Saba", "Cavendish"],
            "growth_stages": ["seedling", "vegetative", "flowering", "bunch_development", "mature"],
            "typical_colors": ["green", "yellow", "brown"],
            "diseases": ["black_sigatoka", "yellow_sigatoka", "panama_disease", "fruit_rot"],
        },
        "mango": {
            "varieties": ["Carabao", "Pico", "Katchamita"],
            "growth_stages": ["flush", "flowering", "fruiting", "mature"],
            "typical_colors": ["green", "yellow", "brown"],
            "diseases": ["anthracnose", "bacterial_canker", "powdery_mildew"],
        },
        "onion": {
            "varieties": ["Red Creole", "Yellow Granex", "White Onion"],
            "growth_stages": ["seedling", "vegetative", "bulbing", "mature"],
            "typical_colors": ["green", "purple", "brown"],
            "diseases": ["purple_blotch", "downy_mildew", "basal_rot"],
        },
        "eggplant": {
            "varieties": ["Long Purple", "Round", "Native"],
            "growth_stages": ["seedling", "flowering", "fruiting", "mature"],
            "typical_colors": ["green", "purple"],
            "diseases": ["fruit_and_shoot_borer_damage", "mite_damage", "wilt"],
        },
        "cabbage": {
            "varieties": ["Green", "Red", "Savoy"],
            "growth_stages": ["seedling", "leaf_growth", "head_formation", "mature"],
            "typical_colors": ["green", "purple"],
            "diseases": ["black_rot", "clubroot", "diamondback_moth_damage"],
        },
    }
    
    def __init__(
        self,
        model_path: str | Path | None = None,
        use_ensemble: bool = True,
    ):
        """Initialize classifier with optional pre-trained model."""
        self.model_path = model_path
        self.cnn_model = None
        self.rf_classifier = None
        self.svm_classifier = None
        self.use_ensemble = use_ensemble
        self.feature_scaler = None
        
        if model_path:
            self._load_model(model_path)
    
    def _load_model(self, model_path: str | Path) -> None:
        """Load pre-trained CNN model."""
        if tf is None:
            logger.warning("TensorFlow is not installed. Crop classifier will use visual heuristics only.")
            return
        try:
            self.cnn_model = tf.keras.models.load_model(str(model_path))
            logger.info(f"CNN model loaded from {model_path}")
        except Exception as e:
            logger.warning(f"Could not load CNN model: {e}")
    
    def classify_crop(
        self,
        image: np.ndarray | str,
        top_k: int = 5,
        crop_type_hint: str | None = None,
    ) -> ClassificationResult:
        """Classify crop from image."""
        
        if isinstance(image, str):
            image = Image.open(image)
            image = np.array(image)
        
        # Prepare image
        processed_image = self._preprocess_image(image)
        
        predictions = []
        
        # CNN prediction
        if self.cnn_model:
            cnn_pred = self._predict_with_cnn(processed_image, top_k)
            predictions.append(("cnn", cnn_pred))
        
        # Fallback heuristic-based prediction
        if not predictions:
            heuristic_pred = self._predict_heuristic(image, top_k, crop_type_hint=crop_type_hint)
            predictions.append(("heuristic", heuristic_pred))
        
        # Combine predictions
        combined_pred = self._ensemble_predictions(predictions, top_k)
        
        # Assess health status
        health_status = self._assess_health_status(
            combined_pred[0][0] if combined_pred else "unknown",
            image
        )
        
        # Generate recommendations
        recommendations = self._generate_recommendations(
            combined_pred[0][0] if combined_pred else "unknown",
            health_status
        )
        
        result = ClassificationResult(
            crop_id=str(hash(image.tobytes()) % 1000000),
            top_predictions=combined_pred,
            predicted_class=combined_pred[0][0] if combined_pred else "unknown",
            confidence=combined_pred[0][1] if combined_pred else 0.0,
            health_status=health_status,
            recommendations=recommendations,
            model_used="ensemble" if self.use_ensemble else "cnn",
        )
        
        return result
    
    def _preprocess_image(self, image: np.ndarray, target_size: tuple[int, int] = (224, 224)) -> np.ndarray:
        """Preprocess image for CNN input."""
        # Ensure RGB
        if len(image.shape) == 2:
            image = np.stack([image] * 3, axis=-1)
        elif image.shape[2] == 4:
            image = image[:, :, :3]
        
        # Resize
        image_pil = Image.fromarray(np.uint8(image))
        image_pil = image_pil.resize(target_size, Image.LANCZOS)
        image = np.array(image_pil)
        
        # Normalize
        image = image.astype(np.float32) / 255.0
        
        return image
    
    def _predict_with_cnn(
        self,
        image: np.ndarray,
        top_k: int = 5
    ) -> list[tuple[str, float]]:
        """Predict using CNN model."""
        if not self.cnn_model:
            return []
        
        try:
            # Add batch dimension
            batch = np.expand_dims(image, axis=0)
            
            # Get predictions
            predictions = self.cnn_model.predict(batch, verbose=0)[0]
            
            # Get top-k
            top_indices = np.argsort(predictions)[-top_k:][::-1]
            top_predictions = []
            
            # Map to class names (would need actual class mapping)
            class_names = list(self.CROP_METADATA.keys())
            for idx in top_indices:
                if idx < len(class_names):
                    top_predictions.append((class_names[idx], float(predictions[idx])))
            
            return top_predictions
        except Exception as e:
            logger.error(f"CNN prediction error: {e}")
            return []
    
    def _predict_heuristic(
        self,
        image: np.ndarray,
        top_k: int = 5,
        crop_type_hint: str | None = None,
    ) -> list[tuple[str, float]]:
        """Heuristic-based prediction using visual features."""
        import cv2
        
        # Extract color statistics
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        h, s, v = cv2.split(hsv)
        
        # Analyze hue distribution
        hue_mean = float(np.mean(h))
        hue_std = float(np.std(h))
        saturation_mean = float(np.mean(s))
        value_mean = float(np.mean(v))
        color_ratios = {
            "green": self._hsv_ratio(hsv, [25, 45, 45], [95, 255, 255]),
            "yellow": self._hsv_ratio(hsv, [12, 70, 60], [40, 255, 255]),
            "red": self._hsv_ratio(hsv, [0, 70, 55], [12, 255, 255])
            + self._hsv_ratio(hsv, [165, 70, 55], [180, 255, 255]),
            "brown": self._hsv_ratio(hsv, [6, 45, 35], [28, 225, 205]),
            "purple": self._hsv_ratio(hsv, [125, 45, 45], [165, 255, 255]),
            "gold": self._hsv_ratio(hsv, [16, 55, 70], [34, 255, 255]),
        }
        normalized_hint = self._normalize_crop_hint(crop_type_hint)
        
        # Score each crop type based on characteristics
        scores = {}
        
        for crop_type in self.CROP_METADATA.keys():
            metadata = self.CROP_METADATA[crop_type]
            score = 0.08
            for color in metadata.get("typical_colors", []):
                score += min(color_ratios.get(color, 0.0) * 0.55, 0.22)
            if normalized_hint == crop_type:
                score += 0.35
            
            # Hue-based scoring
            if crop_type == "rice":
                # Rice is typically green/golden
                score += 0.3 if 30 < hue_mean < 90 else 0.1
                score += 0.2 if hue_std < 20 else 0.1
            elif crop_type == "corn":
                # Corn is green or yellow
                score += 0.3 if 15 < hue_mean < 90 else 0.1
                score += 0.2 if saturation_mean > 50 else 0.1
            elif crop_type == "tomato":
                # Tomato is red/orange
                score += 0.4 if hue_mean < 15 or hue_mean > 150 else 0.1
                score += 0.2 if saturation_mean > 100 else 0.1
            elif crop_type == "potato":
                # Potato plants are green
                score += 0.3 if 30 < hue_mean < 90 else 0.1
                score += 0.2 if value_mean < 180 else 0.1
            elif crop_type == "wheat":
                # Wheat is golden/green
                score += 0.3 if 15 < hue_mean < 60 else 0.1
                score += 0.2 if hue_std > 10 else 0.1
            elif crop_type == "banana":
                score += 0.25 if color_ratios["green"] > 0.35 or color_ratios["yellow"] > 0.20 else 0.08
                score += 0.15 if color_ratios["brown"] < 0.20 else 0.05
            elif crop_type == "mango":
                score += 0.20 if color_ratios["green"] > 0.25 or color_ratios["yellow"] > 0.18 else 0.08
                score += 0.10 if saturation_mean > 45 else 0.04
            elif crop_type == "onion":
                score += 0.30 if color_ratios["purple"] > 0.08 or color_ratios["brown"] > 0.16 else 0.08
            elif crop_type == "eggplant":
                score += 0.30 if color_ratios["purple"] > 0.10 or color_ratios["green"] > 0.25 else 0.08
            elif crop_type == "cabbage":
                score += 0.28 if color_ratios["green"] > 0.45 and hue_std < 35 else 0.08
            
            # Brightness-based scoring
            if value_mean > 150:
                score += 0.1
            elif 100 < value_mean < 150:
                score += 0.2
            
            scores[crop_type] = score
        
        # Return top-k sorted by score
        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return [(name, min(float(score), 0.95)) for name, score in sorted_scores[:top_k]]

    def _normalize_crop_hint(self, crop_type_hint: str | None) -> str | None:
        if not crop_type_hint:
            return None
        normalized = crop_type_hint.strip().lower().replace("-", "_").replace(" ", "_")
        aliases = {
            "maize": "corn",
            "mais": "corn",
            "palay": "rice",
            "kamatis": "tomato",
            "patatas": "potato",
            "saging": "banana",
            "mangga": "mango",
            "sibuyas": "onion",
            "talong": "eggplant",
            "repolyo": "cabbage",
        }
        return aliases.get(normalized, normalized)

    def _hsv_ratio(self, hsv: np.ndarray, lower: list[int], upper: list[int]) -> float:
        import cv2

        mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
        return float(np.count_nonzero(mask) / mask.size)
    
    def _ensemble_predictions(
        self,
        predictions: list[tuple[str, list[tuple[str, float]]]],
        top_k: int
    ) -> list[tuple[str, float]]:
        """Combine predictions from multiple models."""
        if not predictions:
            return []
        
        # If only one model, return its predictions
        if len(predictions) == 1:
            return predictions[0][1][:top_k]
        
        # Average scores across models
        score_map = {}
        for model_name, preds in predictions:
            for label, score in preds:
                if label not in score_map:
                    score_map[label] = []
                score_map[label].append(score)
        
        # Compute average and variance
        averaged = {}
        for label, scores in score_map.items():
            avg_score = np.mean(scores)
            # Boost confidence if all models agree
            variance = np.var(scores)
            confidence_boost = 1.0 - (variance * 0.1)
            averaged[label] = avg_score * confidence_boost
        
        # Return top-k
        sorted_preds = sorted(averaged.items(), key=lambda x: x[1], reverse=True)
        return sorted_preds[:top_k]
    
    def _assess_health_status(self, crop_type: str, image: np.ndarray) -> str:
        """Assess crop health status."""
        import cv2
        
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        h, s, v = cv2.split(hsv)
        
        # Count green pixels
        green_lower = np.array([35, 50, 50])
        green_upper = np.array([90, 255, 255])
        green_mask = cv2.inRange(hsv, green_lower, green_upper)
        green_ratio = np.count_nonzero(green_mask) / green_mask.size
        
        # Count yellow/brown pixels (signs of disease/stress)
        yellow_lower = np.array([15, 50, 50])
        yellow_upper = np.array([35, 255, 255])
        yellow_mask = cv2.inRange(hsv, yellow_lower, yellow_upper)
        yellow_ratio = np.count_nonzero(yellow_mask) / yellow_mask.size
        
        brown_lower = np.array([10, 50, 50])
        brown_upper = np.array([20, 200, 150])
        brown_mask = cv2.inRange(hsv, brown_lower, brown_upper)
        brown_ratio = np.count_nonzero(brown_mask) / brown_mask.size
        
        # Determine health
        disease_stress_ratio = yellow_ratio + brown_ratio
        
        if green_ratio > 0.7 and disease_stress_ratio < 0.1:
            return "healthy"
        elif disease_stress_ratio > 0.3:
            return "diseased"
        elif disease_stress_ratio > 0.15:
            return "stressed"
        else:
            return "unknown"
    
    def _generate_recommendations(
        self,
        crop_type: str,
        health_status: str
    ) -> list[str]:
        """Generate actionable recommendations."""
        recommendations = []
        
        if health_status == "healthy":
            recommendations.append("Continue current crop management practices")
            recommendations.append("Maintain regular monitoring schedule")
            recommendations.append("Ensure proper irrigation and nutrient supply")
        elif health_status == "stressed":
            recommendations.append("Increase irrigation frequency")
            recommendations.append("Check for nutrient deficiencies")
            recommendations.append("Monitor for pest activity")
            recommendations.append("Consider foliar spray with micronutrients")
        elif health_status == "diseased":
            recommendations.append("Consult with local agriculture extension officer")
            recommendations.append("Consider fungicide or pesticide treatment")
            recommendations.append("Remove affected plant parts")
            recommendations.append("Improve air circulation around plants")
        
        return recommendations


class CropQualityAssessor:
    """Assess crop quality based on multiple criteria."""
    
    QUALITY_CRITERIA = {
        "size": {"weight": 0.2, "optimal": (5, 10)},  # cm
        "color": {"weight": 0.25, "optimal": "vibrant"},
        "texture": {"weight": 0.2, "optimal": "smooth"},
        "defects": {"weight": 0.25, "optimal": 0},  # count
        "ripeness": {"weight": 0.1, "optimal": "mature"},
    }
    
    @staticmethod
    def assess_quality(crop_image: np.ndarray) -> tuple[str, float, list[str]]:
        """
        Assess crop quality.
        Returns: (grade, score, defects)
        """
        score = 0.0
        defects = []
        
        # Color vibrancy
        import cv2
        hsv = cv2.cvtColor(crop_image, cv2.COLOR_RGB2HSV)
        h, s, v = cv2.split(hsv)
        vibrance = float(np.mean(s)) / 255.0
        
        if vibrance > 0.7:
            score += 25
        elif vibrance > 0.5:
            score += 15
            defects.append("Low color vibrancy")
        else:
            defects.append("Very low color vibrancy")
        
        # Texture smoothness (low edge count = smooth)
        edges = cv2.Canny(cv2.cvtColor(crop_image, cv2.COLOR_RGB2GRAY), 50, 150)
        edge_density = np.count_nonzero(edges) / edges.size
        
        if edge_density < 0.1:
            score += 20
        elif edge_density < 0.2:
            score += 12
            defects.append("Rough texture")
        else:
            defects.append("Very rough texture")
        
        # Shape uniformity
        h_crop, w_crop = crop_image.shape[:2]
        aspect_ratio = w_crop / h_crop if h_crop > 0 else 1
        
        if 0.8 < aspect_ratio < 1.2:
            score += 20
        elif 0.6 < aspect_ratio < 1.4:
            score += 12
            defects.append("Irregular shape")
        else:
            defects.append("Highly irregular shape")
        
        # Brightness (freshness indicator)
        brightness = np.mean(cv2.cvtColor(crop_image, cv2.COLOR_RGB2GRAY)) / 255.0
        if 0.3 < brightness < 0.8:
            score += 20
        elif 0.2 < brightness < 0.9:
            score += 12
            defects.append("Unusual brightness")
        
        # Damage detection (dark spots)
        gray = cv2.cvtColor(crop_image, cv2.COLOR_RGB2GRAY)
        _, dark_spots = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY_INV)
        spot_count = len(cv2.findContours(dark_spots, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0])
        
        if spot_count == 0:
            score += 15
        elif spot_count < 5:
            score += 8
            defects.append(f"Minor damage ({spot_count} spots)")
        else:
            defects.append(f"Significant damage ({spot_count} spots)")
        
        # Determine grade
        if score > 85:
            grade = "premium"
        elif score > 70:
            grade = "standard"
        else:
            grade = "below_standard"
        
        return grade, score / 100.0, defects


def create_crop_classifier(
    model_path: str | Path | None = None,
    use_ensemble: bool = True,
) -> CropClassifier:
    """Factory function to create a crop classifier."""
    return CropClassifier(model_path=model_path, use_ensemble=use_ensemble)
