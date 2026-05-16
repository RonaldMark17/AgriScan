"""
Comprehensive Crop Detection Module

Implements multiple computer vision techniques for detecting agricultural produce:
- Object detection (YOLO-based)
- Visual feature extraction
- Image preprocessing and normalization
- Crop classification with confidence scoring
- Disease and quality assessment
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class CropDetection:
    """Represents a single detected crop in an image."""
    crop_type: str
    confidence: float
    bounding_box: tuple[int, int, int, int]  # (x_min, y_min, x_max, y_max)
    visual_features: dict[str, float] = field(default_factory=dict)
    quality_score: float = 0.85
    growth_stage: str = "unknown"  # seedling, vegetative, flowering, fruiting, mature
    detected_issues: list[str] = field(default_factory=list)
    is_occluded: bool = False
    occlusion_percentage: float = 0.0
    environment_context: str = "field"  # field, greenhouse, orchard, indoor
    

@dataclass
class CropDetectionResult:
    """Complete crop detection result for an image."""
    image_path: str
    image_size: tuple[int, int]
    total_crops_detected: int
    crops: list[CropDetection] = field(default_factory=list)
    image_quality_score: float = 0.0
    lighting_conditions: str = "normal"  # bright, normal, dim, backlit
    weather_conditions: str = "clear"  # clear, overcast, rainy, foggy
    estimated_total_yield: float = 0.0
    preprocessing_applied: list[str] = field(default_factory=list)
    analysis_mode: str = "production"  # production, training, quality_check
    timestamp: str = ""
    region: str = "unknown"
    

class ImagePreprocessor:
    """Handles image preprocessing for crop detection."""
    
    @staticmethod
    def load_image(image_path: str | Path) -> np.ndarray:
        """Load image from file path."""
        try:
            img = cv2.imread(str(image_path))
            if img is None:
                raise ValueError(f"Failed to load image from {image_path}")
            return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        except Exception as e:
            logger.error(f"Error loading image {image_path}: {e}")
            raise
    
    @staticmethod
    def resize_image(image: np.ndarray, target_size: tuple[int, int] = (640, 640)) -> np.ndarray:
        """Resize image to target size while maintaining aspect ratio."""
        h, w = image.shape[:2]
        scale = min(target_size[0] / w, target_size[1] / h)
        new_w, new_h = int(w * scale), int(h * scale)
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        
        # Pad to target size
        padded = np.full((target_size[1], target_size[0], 3), 127, dtype=np.uint8)
        y_offset = (target_size[1] - new_h) // 2
        x_offset = (target_size[0] - new_w) // 2
        padded[y_offset:y_offset+new_h, x_offset:x_offset+new_w] = resized
        
        return padded
    
    @staticmethod
    def normalize_lighting(image: np.ndarray) -> np.ndarray:
        """Normalize lighting variations using CLAHE (Contrast Limited Adaptive Histogram Equalization)."""
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)
        
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        l_clahe = clahe.apply(l)
        
        lab_clahe = cv2.merge([l_clahe, a, b])
        return cv2.cvtColor(lab_clahe, cv2.COLOR_LAB2RGB)
    
    @staticmethod
    def reduce_noise(image: np.ndarray, method: str = "bilateral") -> np.ndarray:
        """Reduce noise from image."""
        if method == "bilateral":
            return cv2.bilateralFilter(image, 9, 75, 75)
        elif method == "nlm":
            # Non-local means denoising
            return cv2.fastNlMeansDenoisingColored(image, None, h=10, hForColorComponents=10, templateWindowSize=7, searchWindowSize=21)
        elif method == "morphological":
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            opening = cv2.morphologyEx(image, cv2.MORPH_OPEN, kernel)
            return cv2.morphologyEx(opening, cv2.MORPH_CLOSE, kernel)
        return image
    
    @staticmethod
    def color_correction(image: np.ndarray) -> np.ndarray:
        """Apply color correction using LAB white-balance normalization."""
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB).astype(np.int16)
        l, a, b = cv2.split(lab)

        a_shift = int(round(128 - float(np.mean(a))))
        b_shift = int(round(128 - float(np.mean(b))))
        a_normalized = np.clip(a + a_shift, 0, 255).astype(np.uint8)
        b_normalized = np.clip(b + b_shift, 0, 255).astype(np.uint8)

        lab_corrected = cv2.merge([l.astype(np.uint8), a_normalized, b_normalized])
        return cv2.cvtColor(lab_corrected, cv2.COLOR_LAB2RGB)
    
    @staticmethod
    def segment_foreground(image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Segment likely crop leaves, stems, roots, and produce from background."""
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)

        color_ranges = (
            # Leaf canopy and fresh stems.
            ([25, 35, 35], [95, 255, 255]),
            # Yellow crops and ripening tissue: corn, rice panicles, banana, stressed leaves.
            ([12, 45, 45], [40, 255, 255]),
            # Red/orange fruit and lesions, split around the HSV hue boundary.
            ([0, 50, 45], [12, 255, 255]),
            ([165, 50, 45], [180, 255, 255]),
            # Brown/tan roots, stems, husks, and necrotic tissue.
            ([6, 35, 35], [28, 220, 210]),
            # Purple/red bulbs and eggplant-like produce.
            ([125, 35, 35], [165, 255, 255]),
        )
        mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
        for lower, upper in color_ranges:
            mask = cv2.bitwise_or(mask, cv2.inRange(hsv, np.array(lower), np.array(upper)))

        # Morphological operations to clean up mask
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.dilate(mask, kernel, iterations=1)

        foreground = cv2.bitwise_and(image, image, mask=mask)
        return foreground, mask
    
    @staticmethod
    def augment_image(image: np.ndarray, augmentation_params: dict[str, float] | None = None) -> np.ndarray:
        """Apply data augmentation for training robustness."""
        if augmentation_params is None:
            augmentation_params = {}
        
        augmented = image.copy()
        
        # Random rotation
        if "rotation" in augmentation_params:
            angle = augmentation_params["rotation"]
            h, w = augmented.shape[:2]
            center = (w // 2, h // 2)
            matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
            augmented = cv2.warpAffine(augmented, matrix, (w, h))
        
        # Random zoom
        if "zoom" in augmentation_params:
            zoom = augmentation_params["zoom"]
            h, w = augmented.shape[:2]
            new_h, new_w = int(h / zoom), int(w / zoom)
            x, y = (w - new_w) // 2, (h - new_h) // 2
            cropped = augmented[y:y+new_h, x:x+new_w]
            augmented = cv2.resize(cropped, (w, h))
        
        # Random brightness
        if "brightness" in augmentation_params:
            brightness = augmentation_params["brightness"]
            augmented = cv2.convertScaleAbs(augmented, alpha=brightness, beta=0)
        
        # Random horizontal flip
        if "flip_horizontal" in augmentation_params and augmentation_params["flip_horizontal"]:
            augmented = cv2.flip(augmented, 1)
        
        return augmented


class VisualFeatureExtractor:
    """Extracts visual features from crop images for classification."""
    
    COLOR_RANGES = {
        "green": [([25, 50, 45], [95, 255, 255])],
        "yellow": [([12, 70, 60], [40, 255, 255])],
        "red": [([0, 70, 55], [12, 255, 255]), ([165, 70, 55], [180, 255, 255])],
        "brown": [([6, 45, 35], [28, 225, 205])],
        "purple": [([125, 45, 45], [165, 255, 255])],
    }
    
    @staticmethod
    def extract_color_features(image: np.ndarray) -> dict[str, float]:
        """Extract color-based features from image."""
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        total_pixels = image.shape[0] * image.shape[1]
        features = {}
        
        for color_name, ranges in VisualFeatureExtractor.COLOR_RANGES.items():
            mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
            for lower, upper in ranges:
                mask = cv2.bitwise_or(mask, cv2.inRange(hsv, np.array(lower), np.array(upper)))
            ratio = np.count_nonzero(mask) / total_pixels
            features[f"{color_name}_ratio"] = float(ratio)
        
        # Compute dominant color
        pixels = image.reshape((-1, 3))
        if pixels.shape[0] > 12000:
            step = max(pixels.shape[0] // 12000, 1)
            pixels = pixels[::step][:12000]
        pixels = np.float32(pixels)
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
        _, labels, centers = cv2.kmeans(pixels, 3, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)

        label_counts = np.bincount(labels.flatten(), minlength=len(centers))
        dominant_color = np.uint8(centers[int(np.argmax(label_counts))])
        features["dominant_color_h"] = float(cv2.cvtColor(np.uint8([[dominant_color]]), cv2.COLOR_RGB2HSV)[0][0][0])
        
        return features
    
    @staticmethod
    def extract_shape_features(image: np.ndarray) -> dict[str, float]:
        """Extract shape-based features from image."""
        # Convert to grayscale and binary
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
        
        # Find contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return {
                "contour_count": 0.0,
                "avg_aspect_ratio": 0.0,
                "avg_circularity": 0.0,
                "avg_solidity": 0.0,
            }
        
        aspect_ratios = []
        circularities = []
        solidities = []
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 100:  # Skip small contours
                continue
            
            # Aspect ratio
            x, y, w, h = cv2.boundingRect(contour)
            aspect_ratio = float(w) / float(h) if h > 0 else 0
            aspect_ratios.append(aspect_ratio)
            
            # Circularity
            perimeter = cv2.arcLength(contour, True)
            if perimeter > 0:
                circularity = 4 * np.pi * area / (perimeter ** 2)
            else:
                circularity = 0
            circularities.append(circularity)
            
            # Solidity
            hull = cv2.convexHull(contour)
            hull_area = cv2.contourArea(hull)
            if hull_area > 0:
                solidity = area / hull_area
            else:
                solidity = 0
            solidities.append(solidity)
        
        return {
            "contour_count": float(len(contours)),
            "avg_aspect_ratio": float(np.mean(aspect_ratios)) if aspect_ratios else 0.0,
            "avg_circularity": float(np.mean(circularities)) if circularities else 0.0,
            "avg_solidity": float(np.mean(solidities)) if solidities else 0.0,
        }
    
    @staticmethod
    def extract_texture_features(image: np.ndarray) -> dict[str, float]:
        """Extract texture features using edge detection and LAP variance."""
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        
        # Laplacian of Gaussian for blur detection
        lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        
        # Edge density
        edges = cv2.Canny(gray, 50, 150)
        edge_density = np.count_nonzero(edges) / (gray.shape[0] * gray.shape[1])
        
        # Texture gradient
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=5)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=5)
        texture_gradient = np.sqrt(sobelx**2 + sobely**2).mean()
        
        return {
            "laplacian_variance": float(lap_var),
            "edge_density": float(edge_density),
            "texture_gradient": float(texture_gradient),
        }
    
    @staticmethod
    def extract_all_features(image: np.ndarray) -> dict[str, float]:
        """Extract all visual features from image."""
        features = {}
        features.update(VisualFeatureExtractor.extract_color_features(image))
        features.update(VisualFeatureExtractor.extract_shape_features(image))
        features.update(VisualFeatureExtractor.extract_texture_features(image))
        return features


class CropDetector:
    """Main crop detection engine combining multiple techniques."""
    
    def __init__(self, model_path: str | Path | None = None):
        """Initialize crop detector with optional YOLO model."""
        self.preprocessor = ImagePreprocessor()
        self.feature_extractor = VisualFeatureExtractor()
        self.model_path = model_path
        self.yolo_model = None
        
        if model_path:
            try:
                from ultralytics import YOLO
                self.yolo_model = YOLO(str(model_path))
                logger.info(f"YOLO model loaded from {model_path}")
            except Exception as e:
                logger.warning(f"Could not load YOLO model: {e}")
    
    def detect_crops_in_image(
        self,
        image_path: str | Path,
        confidence_threshold: float = 0.5,
        apply_preprocessing: bool = True
    ) -> CropDetectionResult:
        """Detect crops in an image using multiple techniques."""
        
        # Load image
        image = self.preprocessor.load_image(image_path)
        raw_image = image.copy()
        original_size = image.shape[:2]
        
        result = CropDetectionResult(
            image_path=str(image_path),
            image_size=original_size,
            total_crops_detected=0,
        )
        
        preprocessing_applied = []
        
        # Image preprocessing
        if apply_preprocessing:
            # Assess image quality
            result.image_quality_score = self._assess_image_quality(image)
            result.lighting_conditions = self._classify_lighting_conditions(image)
            
            # Normalize lighting
            image = self.preprocessor.normalize_lighting(image)
            preprocessing_applied.append("lighting_normalization")
            
            # Reduce noise
            image = self.preprocessor.reduce_noise(image, method="bilateral")
            preprocessing_applied.append("noise_reduction")
            
            # Color correction
            image = self.preprocessor.color_correction(image)
            preprocessing_applied.append("color_correction")
        
        result.preprocessing_applied = preprocessing_applied
        
        # Segment foreground
        foreground, mask = self.preprocessor.segment_foreground(image)
        
        # Extract features for all crops in image
        features = self.feature_extractor.extract_all_features(foreground)
        
        # Use YOLO if available
        if self.yolo_model:
            try:
                detections = self._detect_with_yolo(image, confidence_threshold)
                for det in detections:
                    result.crops.append(det)
            except Exception as e:
                logger.warning(f"YOLO detection failed: {e}")
        
        # Fallback: component-based detection
        if not result.crops:
            detections = self._detect_by_components(foreground, mask, features, confidence_threshold)
            for det in detections:
                result.crops.append(det)

        if not apply_preprocessing:
            result.image_quality_score = self._assess_image_quality(raw_image)
            result.lighting_conditions = self._classify_lighting_conditions(raw_image)
        
        result.total_crops_detected = len(result.crops)
        
        # Aggregate results
        if result.crops:
            result.estimated_total_yield = self._estimate_yield(result.crops)
        
        return result
    
    def _detect_with_yolo(self, image: np.ndarray, confidence_threshold: float) -> list[CropDetection]:
        """Detect crops using YOLO model."""
        if not self.yolo_model:
            return []
        
        results = self.yolo_model(image, conf=confidence_threshold)
        detections = []
        
        for result in results:
            names = getattr(result, "names", {}) or {}
            class_ids = getattr(result.boxes, "cls", [])
            for index, (box, conf) in enumerate(zip(result.boxes.xyxy, result.boxes.conf)):
                x_min, y_min, x_max, y_max = box.tolist()
                crop_roi = image[int(y_min):int(y_max), int(x_min):int(x_max)]
                
                features = self.feature_extractor.extract_all_features(crop_roi)
                class_id = int(class_ids[index].item()) if len(class_ids) > index else None
                raw_label = str(names.get(class_id, "crop")) if class_id is not None else "crop"
                quality_score = self._assess_crop_quality(features)
                occlusion_percentage = self._estimate_occlusion_percentage(crop_roi)
                
                detection = CropDetection(
                    crop_type=self._normalize_model_label(raw_label),
                    confidence=float(conf),
                    bounding_box=(int(x_min), int(y_min), int(x_max), int(y_max)),
                    visual_features=features,
                    quality_score=quality_score,
                    growth_stage=self._estimate_growth_stage(features),
                    detected_issues=self._detect_quality_issues(features),
                    is_occluded=occlusion_percentage > 0.30,
                    occlusion_percentage=occlusion_percentage,
                )
                detections.append(detection)
        
        return detections
    
    def _detect_by_components(
        self,
        foreground: np.ndarray,
        mask: np.ndarray,
        image_features: dict[str, float],
        confidence_threshold: float,
    ) -> list[CropDetection]:
        """Detect crops using connected component analysis."""
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        detections = []
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 500:  # Minimum crop area
                continue
            
            x, y, w, h = cv2.boundingRect(contour)
            
            # Extract crop region
            crop_roi = foreground[y:y+h, x:x+w]
            if crop_roi.size == 0:
                continue
            
            # Extract features for this crop
            crop_features = self.feature_extractor.extract_all_features(crop_roi)
            
            # Determine quality and growth stage
            quality_score = self._assess_crop_quality(crop_features)
            growth_stage = self._estimate_growth_stage(crop_features)
            crop_type = self._classify_crop_type(crop_features)
            confidence = self._component_confidence(area, mask.size, crop_features, quality_score)
            if confidence < confidence_threshold:
                continue
            occlusion_percentage = self._estimate_occlusion_percentage(crop_roi)
            
            detection = CropDetection(
                crop_type=crop_type,
                confidence=confidence,
                bounding_box=(x, y, x + w, y + h),
                visual_features=crop_features,
                quality_score=quality_score,
                growth_stage=growth_stage,
                detected_issues=self._detect_quality_issues(crop_features),
                is_occluded=occlusion_percentage > 0.30,
                occlusion_percentage=occlusion_percentage,
            )
            detections.append(detection)
        
        return detections
    
    def _classify_crop_type(self, features: dict[str, float]) -> str:
        """Classify crop type based on visual features."""
        green_ratio = features.get("green_ratio", 0)
        yellow_ratio = features.get("yellow_ratio", 0)
        red_ratio = features.get("red_ratio", 0)
        brown_ratio = features.get("brown_ratio", 0)
        purple_ratio = features.get("purple_ratio", 0)
        aspect_ratio = features.get("avg_aspect_ratio", 0)
        circularity = features.get("avg_circularity", 0)

        if red_ratio >= 0.16 and circularity >= 0.25:
            return "tomato_or_red_fruit"
        if purple_ratio >= 0.08:
            return "purple_bulb_or_fruit"
        if yellow_ratio >= 0.22 and aspect_ratio >= 1.35:
            return "corn_or_grain_crop"
        if yellow_ratio >= 0.25 and green_ratio < 0.20:
            return "ripe_fruit_crop"
        if brown_ratio >= 0.24 and green_ratio < 0.22 and yellow_ratio < 0.18:
            return "root_or_stem_crop"
        if green_ratio >= 0.42 and aspect_ratio >= 1.45:
            return "leafy_or_grain_crop"
        if green_ratio >= 0.35:
            return "leafy_vegetable"
        if red_ratio + yellow_ratio + brown_ratio + purple_ratio >= 0.22:
            return "agricultural_produce"
        return "unknown_crop"

    def _normalize_model_label(self, label: str) -> str:
        """Normalize model class labels into stable crop type strings."""
        normalized = label.strip().lower().replace(" ", "_").replace("-", "_")
        if not normalized:
            return "crop"
        if normalized.endswith("_healthy"):
            normalized = normalized[: -len("_healthy")]
        return normalized
    
    def _assess_crop_quality(self, features: dict[str, float]) -> float:
        """Assess crop quality based on visual features."""
        color_signal = min(
            1.0,
            features.get("green_ratio", 0.0)
            + features.get("yellow_ratio", 0.0)
            + features.get("red_ratio", 0.0)
            + features.get("brown_ratio", 0.0)
            + features.get("purple_ratio", 0.0),
        )
        sharpness_score = min(features.get("laplacian_variance", 0.0) / 180.0, 1.0)
        edge_density = features.get("edge_density", 0.0)
        edge_score = 1.0 - min(abs(edge_density - 0.08) / 0.18, 1.0)
        solidity_score = min(features.get("avg_solidity", 0.0), 1.0)
        circularity_score = min(features.get("avg_circularity", 0.0), 1.0)
        shape_score = max(solidity_score, circularity_score * 0.8)

        quality = (
            color_signal * 0.30
            + sharpness_score * 0.25
            + edge_score * 0.20
            + shape_score * 0.25
        )
        return min(1.0, max(0.0, float(quality)))
    
    def _estimate_growth_stage(self, features: dict[str, float]) -> str:
        """Estimate crop growth stage from visual features."""
        green_ratio = features.get("green_ratio", 0)
        yellow_ratio = features.get("yellow_ratio", 0)
        red_ratio = features.get("red_ratio", 0)
        brown_ratio = features.get("brown_ratio", 0)
        contour_count = features.get("contour_count", 0)

        fruit_or_grain_ratio = yellow_ratio + red_ratio
        if fruit_or_grain_ratio >= 0.28 and green_ratio >= 0.12:
            return "fruiting"
        if fruit_or_grain_ratio >= 0.32 or brown_ratio >= 0.28:
            return "mature"
        if green_ratio < 0.12:
            return "seedling"
        elif green_ratio < 0.32:
            return "vegetative"
        elif contour_count > 10 or green_ratio < 0.65:
            return "flowering"
        else:
            return "mature"

    def _component_confidence(
        self,
        area: float,
        total_area: int,
        features: dict[str, float],
        quality_score: float,
    ) -> float:
        """Score connected-component crop likelihood from size, color, and shape."""
        area_ratio = min(float(area) / max(float(total_area), 1.0), 1.0)
        color_signal = min(
            1.0,
            features.get("green_ratio", 0.0)
            + features.get("yellow_ratio", 0.0)
            + features.get("red_ratio", 0.0)
            + features.get("brown_ratio", 0.0)
            + features.get("purple_ratio", 0.0),
        )
        shape_signal = min(
            1.0,
            max(features.get("avg_solidity", 0.0), features.get("avg_circularity", 0.0)),
        )
        size_signal = min(area_ratio / 0.12, 1.0)
        confidence = 0.20 + color_signal * 0.30 + quality_score * 0.25 + shape_signal * 0.15 + size_signal * 0.10
        return round(min(0.95, max(0.0, float(confidence))), 4)

    def _detect_quality_issues(self, features: dict[str, float]) -> list[str]:
        """Report visual quality issues that can affect crop detection."""
        issues: list[str] = []
        if features.get("laplacian_variance", 0.0) < 45:
            issues.append("blurry_or_low_detail")
        if features.get("edge_density", 0.0) > 0.22:
            issues.append("busy_background_or_surface_damage")
        if features.get("brown_ratio", 0.0) >= 0.30 and features.get("green_ratio", 0.0) >= 0.12:
            issues.append("possible_necrosis_or_dry_tissue")
        if features.get("yellow_ratio", 0.0) >= 0.30 and features.get("green_ratio", 0.0) >= 0.10:
            issues.append("possible_yellowing_or_ripening")
        return issues

    def _detect_occlusion(self, crop_roi: np.ndarray) -> bool:
        """Detect if crop is occluded or partially visible."""
        return self._estimate_occlusion_percentage(crop_roi) > 0.30

    def _estimate_occlusion_percentage(self, crop_roi: np.ndarray) -> float:
        """Estimate border-edge ratio as a proxy for partial visibility."""
        h, w = crop_roi.shape[:2]
        if h == 0 or w == 0:
            return 0.0
        edges = cv2.Canny(crop_roi, 50, 150)
        edge_count = np.count_nonzero(edges)

        # High edge count near borders suggests occlusion
        border_width = max(4, min(h, w) // 12)
        border_edges = (
            np.count_nonzero(edges[:border_width, :]) +
            np.count_nonzero(edges[-border_width:, :]) +
            np.count_nonzero(edges[:, :border_width]) +
            np.count_nonzero(edges[:, -border_width:])
        )

        return float(border_edges / edge_count) if edge_count > 0 else 0.0
    
    def _estimate_yield(self, crops: list[CropDetection]) -> float:
        """Estimate total yield based on detected crops."""
        if not crops:
            return 0.0
        
        total_yield = 0.0
        for crop in crops:
            # Estimate based on bounding box area and quality
            x_min, y_min, x_max, y_max = crop.bounding_box
            area = (x_max - x_min) * (y_max - y_min)
            yield_contribution = (area / 10000) * crop.quality_score * crop.confidence
            total_yield += yield_contribution
        
        return total_yield
    
    def _assess_image_quality(self, image: np.ndarray) -> float:
        """Assess overall image quality for analysis."""
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        
        # Sharpness via Laplacian
        sharpness = cv2.Laplacian(gray, cv2.CV_64F).var()
        sharpness_score = min(1.0, sharpness / 100)
        
        # Brightness
        brightness = np.mean(gray) / 255
        brightness_score = 1.0 if 0.3 < brightness < 0.9 else 0.6
        
        # Contrast
        contrast = np.std(gray) / 255
        contrast_score = min(1.0, contrast * 2)
        
        # Combined score
        quality = (sharpness_score + brightness_score + contrast_score) / 3
        return min(1.0, max(0.0, quality))

    def _classify_lighting_conditions(self, image: np.ndarray) -> str:
        """Classify lighting so callers can decide when to retake a photo."""
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        brightness = float(np.mean(gray)) / 255.0
        contrast = float(np.std(gray)) / 255.0

        if brightness < 0.25:
            return "dim"
        if brightness > 0.88:
            return "bright"
        if contrast < 0.10:
            return "flat"
        if contrast > 0.32 and brightness < 0.45:
            return "backlit"
        return "normal"


def create_crop_detector(model_path: str | Path | None = None) -> CropDetector:
    """Factory function to create a crop detector."""
    return CropDetector(model_path=model_path)
