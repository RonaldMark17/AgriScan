"""
ML Service Integration for Crop Detection & Classification

Integrates crop detection, classification, and quality assessment modules
with the existing AgriScan ML service.
"""

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Lazy imports to avoid circular dependencies
_crop_detector = None
_crop_classifier = None


def _resolve_backend_path(settings: Any, configured_path: str | Path) -> Path:
    path = Path(configured_path)
    if path.is_absolute():
        return path
    return (settings.backend_path / path).resolve()


def _first_existing_path(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists():
            return path
    return None


def _crop_detection_model_path(settings: Any) -> Path | None:
    configured = _resolve_backend_path(settings, settings.model_path)
    if configured.suffix == ".pt" and configured.exists():
        return configured
    return _first_existing_path(
        [
            settings.backend_path / "app/ml/artifacts/crop_detection.pt",
            settings.backend_path / "app/ml/runs/agriscan-detect/weights/best.pt",
        ]
    )


def _crop_classifier_model_path(settings: Any) -> Path | None:
    configured = _resolve_backend_path(settings, settings.model_path)
    if configured.exists() and configured.stem.startswith("crop_classifier"):
        return configured
    return _first_existing_path(
        [
            settings.backend_path / "app/ml/artifacts/crop_classifier.keras",
            settings.backend_path / "app/ml/artifacts/crop_classifier.pt",
        ]
    )


def get_crop_detector():
    """Get or create crop detector instance."""
    global _crop_detector
    if _crop_detector is None:
        try:
            from app.ml.crop_detection import create_crop_detector
            from app.core.config import get_settings
            
            settings = get_settings()
            model_path = _crop_detection_model_path(settings)
            _crop_detector = create_crop_detector(model_path=model_path)
            logger.info("Crop detector initialized")
        except Exception as e:
            logger.error(f"Failed to initialize crop detector: {e}")
            _crop_detector = None
    return _crop_detector


def get_crop_classifier():
    """Get or create crop classifier instance."""
    global _crop_classifier
    if _crop_classifier is None:
        try:
            from app.ml.crop_classifier import create_crop_classifier
            from app.core.config import get_settings
            
            settings = get_settings()
            model_path = _crop_classifier_model_path(settings)
            _crop_classifier = create_crop_classifier(model_path=model_path, use_ensemble=True)
            logger.info("Crop classifier initialized")
        except Exception as e:
            logger.error(f"Failed to initialize crop classifier: {e}")
            _crop_classifier = None
    return _crop_classifier


class CropDetectionService:
    """Service wrapper for crop detection operations."""
    
    @staticmethod
    def detect_crops(
        image_path: str,
        confidence_threshold: float = 0.5,
        apply_preprocessing: bool = True,
    ) -> dict[str, Any]:
        """
        Detect crops in image.
        
        Returns:
            {
                "status": "success" | "error",
                "total_crops_detected": int,
                "crops": [
                    {
                        "crop_type": str,
                        "confidence": float,
                        "quality_score": float,
                        "growth_stage": str,
                        ...
                    },
                    ...
                ],
                "image_quality_score": float,
                "estimated_total_yield": float,
                "error": str (if error)
            }
        """
        try:
            detector = get_crop_detector()
            if not detector:
                return {
                    "status": "error",
                    "error": "Crop detector not available"
                }
            
            result = detector.detect_crops_in_image(
                image_path,
                confidence_threshold=confidence_threshold,
                apply_preprocessing=apply_preprocessing
            )
            
            return {
                "status": "success",
                "total_crops_detected": result.total_crops_detected,
                "crops": [
                    {
                        "crop_type": crop.crop_type,
                        "confidence": crop.confidence,
                        "bounding_box": crop.bounding_box,
                        "quality_score": crop.quality_score,
                        "growth_stage": crop.growth_stage,
                        "detected_issues": crop.detected_issues,
                        "is_occluded": crop.is_occluded,
                        "occlusion_percentage": crop.occlusion_percentage,
                        "environment_context": crop.environment_context,
                        "visual_features": crop.visual_features,
                    }
                    for crop in result.crops
                ],
                "image_quality_score": result.image_quality_score,
                "lighting_conditions": result.lighting_conditions,
                "weather_conditions": result.weather_conditions,
                "estimated_total_yield": result.estimated_total_yield,
                "preprocessing_applied": result.preprocessing_applied,
            }
        except Exception as e:
            logger.error(f"Error detecting crops: {e}")
            return {
                "status": "error",
                "error": str(e)
            }


class CropClassificationService:
    """Service wrapper for crop classification operations."""
    
    @staticmethod
    def classify_crop(
        image_path: str,
        crop_type_hint: str | None = None,
        top_k: int = 5,
    ) -> dict[str, Any]:
        """
        Classify crop in image.
        
        Returns:
            {
                "status": "success" | "error",
                "predicted_class": str,
                "confidence": float,
                "health_status": str,
                "quality_grade": str,
                "top_predictions": [(label, confidence), ...],
                "defects": [str, ...],
                "recommendations": [str, ...],
                "error": str (if error)
            }
        """
        try:
            classifier = get_crop_classifier()
            if not classifier:
                return {
                    "status": "error",
                    "error": "Crop classifier not available"
                }
            
            result = classifier.classify_crop(
                image_path,
                top_k=top_k,
                crop_type_hint=crop_type_hint
            )
            
            return {
                "status": "success",
                "predicted_class": result.predicted_class,
                "confidence": result.confidence,
                "health_status": result.health_status,
                "variety": result.variety,
                "quality_grade": result.quality_grade,
                "top_predictions": result.top_predictions,
                "defects": result.defects,
                "recommendations": result.recommendations,
                "model_used": result.model_used,
                "processing_time_ms": result.processing_time_ms,
            }
        except Exception as e:
            logger.error(f"Error classifying crop: {e}")
            return {
                "status": "error",
                "error": str(e)
            }


class CropQualityService:
    """Service wrapper for crop quality assessment."""
    
    @staticmethod
    def assess_quality(image_path: str) -> dict[str, Any]:
        """
        Assess crop quality from image.
        
        Returns:
            {
                "status": "success" | "error",
                "quality_grade": str,
                "quality_score": float,
                "defects": [str, ...],
                "error": str (if error)
            }
        """
        try:
            from app.ml.crop_classifier import CropQualityAssessor
            from PIL import Image
            import numpy as np
            
            # Load image
            image = Image.open(image_path).convert("RGB")
            image_array = np.array(image)
            
            # Assess quality
            grade, score, defects = CropQualityAssessor.assess_quality(image_array)
            
            return {
                "status": "success",
                "quality_grade": grade,
                "quality_score": score,
                "defects": defects,
            }
        except Exception as e:
            logger.error(f"Error assessing crop quality: {e}")
            return {
                "status": "error",
                "error": str(e)
            }


# API endpoints to be integrated with existing FastAPI routes
def register_crop_detection_routes(app) -> None:
    """Register crop detection routes with FastAPI app."""
    from fastapi import File, UploadFile, Query
    from fastapi.responses import JSONResponse
    import tempfile
    
    @app.post("/ml/detect-crops")
    async def detect_crops_endpoint(
        file: UploadFile = File(...),
        confidence_threshold: float = Query(0.5),
        apply_preprocessing: bool = Query(True),
    ):
        """Detect crops in uploaded image."""
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
                contents = await file.read()
                tmp.write(contents)
                tmp.flush()
                
                result = CropDetectionService.detect_crops(
                    tmp.name,
                    confidence_threshold=confidence_threshold,
                    apply_preprocessing=apply_preprocessing
                )
                
                return JSONResponse(result)
        except Exception as e:
            logger.error(f"Error in detect_crops endpoint: {e}")
            return JSONResponse({"status": "error", "error": str(e)}, status_code=400)


def register_crop_classification_routes(app) -> None:
    """Register crop classification routes with FastAPI app."""
    from fastapi import File, UploadFile, Query
    from fastapi.responses import JSONResponse
    import tempfile
    
    @app.post("/ml/classify-crop")
    async def classify_crop_endpoint(
        file: UploadFile = File(...),
        crop_type: str | None = Query(None),
        top_k: int = Query(5),
    ):
        """Classify crop in uploaded image."""
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
                contents = await file.read()
                tmp.write(contents)
                tmp.flush()
                
                result = CropClassificationService.classify_crop(
                    tmp.name,
                    crop_type_hint=crop_type,
                    top_k=top_k
                )
                
                return JSONResponse(result)
        except Exception as e:
            logger.error(f"Error in classify_crop endpoint: {e}")
            return JSONResponse({"status": "error", "error": str(e)}, status_code=400)


def register_crop_quality_routes(app) -> None:
    """Register crop quality assessment routes with FastAPI app."""
    from fastapi import File, UploadFile
    from fastapi.responses import JSONResponse
    import tempfile
    
    @app.post("/ml/assess-quality")
    async def assess_quality_endpoint(file: UploadFile = File(...)):
        """Assess crop quality from uploaded image."""
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
                contents = await file.read()
                tmp.write(contents)
                tmp.flush()
                
                result = CropQualityService.assess_quality(tmp.name)
                
                return JSONResponse(result)
        except Exception as e:
            logger.error(f"Error in assess_quality endpoint: {e}")
            return JSONResponse({"status": "error", "error": str(e)}, status_code=400)


def register_all_routes(app) -> None:
    """Register all crop detection and classification routes."""
    try:
        register_crop_detection_routes(app)
        logger.info("Crop detection routes registered")
    except Exception as e:
        logger.warning(f"Could not register crop detection routes: {e}")
    
    try:
        register_crop_classification_routes(app)
        logger.info("Crop classification routes registered")
    except Exception as e:
        logger.warning(f"Could not register crop classification routes: {e}")
    
    try:
        register_crop_quality_routes(app)
        logger.info("Crop quality assessment routes registered")
    except Exception as e:
        logger.warning(f"Could not register crop quality routes: {e}")
