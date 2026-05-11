from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Crop, CropRecommendationFeedback, Farm, Prediction, Scan, User
from app.schemas.domain import PredictionRead
from app.services.audit import write_audit_log
from app.services.predictions import build_smart_recommendation, build_soil_crop_recommendation
from app.services.weather import get_weather

router = APIRouter(prefix="/predictions", tags=["predictions"])


def _build_farm_location_label(farm: Farm) -> str:
    parts = [farm.barangay, farm.municipality, farm.province]
    location_bits = [part for part in parts if part]
    if farm.name and location_bits:
        return f"{farm.name} - {', '.join(location_bits)}"
    if location_bits:
        return ", ".join(location_bits)
    return farm.name


class PredictionRequest(BaseModel):
    farm_id: int
    crop_id: int | None = None
    prediction_type: str = "smart_recommendation"


class SoilScanRequest(BaseModel):
    soil_type: str = Field(min_length=2, max_length=80)
    ph_level: float | None = Field(default=None, ge=3.5, le=9.5)
    moisture_percent: float | None = Field(default=None, ge=5, le=100)
    soil_temperature_c: float | None = Field(default=None, ge=10, le=45)
    nitrogen_level: str | None = Field(default="medium", pattern="^(low|medium|high)$")
    phosphorus_level: str | None = Field(default="medium", pattern="^(low|medium|high)$")
    potassium_level: str | None = Field(default="medium", pattern="^(low|medium|high)$")
    nitrogen_ppm: float | None = Field(default=None, ge=0, le=300)
    phosphorus_ppm: float | None = Field(default=None, ge=0, le=300)
    potassium_ppm: float | None = Field(default=None, ge=0, le=500)
    drainage: str | None = Field(default="moderate", max_length=80)
    sunlight: str | None = Field(default="full sun", max_length=80)
    season: str | None = Field(default="regular season", max_length=80)
    province: str | None = Field(default=None, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    location_label: str | None = Field(default=None, max_length=160)


class CropRecommendationFeedbackRequest(BaseModel):
    crop_name: str = Field(min_length=2, max_length=120)
    rating: int | None = Field(default=None, ge=1, le=5)
    planted: bool = False
    outcome: str | None = Field(default=None, pattern="^(good|poor|neutral|planted|not_planted)$")
    notes: str | None = Field(default=None, max_length=500)


async def _latest_user_farm(db: AsyncSession, user_id: int) -> Farm | None:
    result = await db.execute(select(Farm).where(Farm.user_id == user_id).order_by(Farm.created_at.desc()).limit(1))
    return result.scalar_one_or_none()


async def _recent_disease_history(db: AsyncSession, user_id: int) -> list[dict]:
    result = await db.execute(
        select(Scan.crop_label, Scan.disease_name, Scan.confidence, Scan.created_at)
        .where(Scan.user_id == user_id)
        .order_by(Scan.created_at.desc())
        .limit(40)
    )
    return [
        {
            "crop_label": row.crop_label,
            "disease_name": row.disease_name,
            "confidence": row.confidence,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in result.all()
    ]


async def _recommendation_feedback_stats(db: AsyncSession, user_id: int) -> dict:
    result = await db.execute(select(CropRecommendationFeedback).where(CropRecommendationFeedback.user_id == user_id))
    stats: dict[str, dict] = {}
    for feedback in result.scalars().all():
        key = feedback.crop_name.strip().lower()
        if not key:
            continue
        item = stats.setdefault(key, {"ratings": [], "good_outcomes": 0, "poor_outcomes": 0})
        if feedback.rating is not None:
            item["ratings"].append(feedback.rating)
        if feedback.outcome == "good":
            item["good_outcomes"] += 1
        elif feedback.outcome == "poor":
            item["poor_outcomes"] += 1

    for item in stats.values():
        ratings = item.pop("ratings")
        item["average_rating"] = round(sum(ratings) / len(ratings), 2) if ratings else None
    return stats


@router.post("/soil-scan")
async def create_soil_scan_prediction(
    payload: SoilScanRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    latitude = payload.latitude
    longitude = payload.longitude
    location_label = payload.location_label.strip() if payload.location_label else None
    latest_farm = await _latest_user_farm(db, current_user.id)

    if latitude is None or longitude is None:
        if latest_farm and latest_farm.latitude is not None and latest_farm.longitude is not None:
            latitude = latest_farm.latitude
            longitude = latest_farm.longitude
            location_label = location_label or _build_farm_location_label(latest_farm)

    weather = await get_weather(latitude, longitude)
    disease_history = await _recent_disease_history(db, current_user.id)
    feedback_stats = await _recommendation_feedback_stats(db, current_user.id)
    result = build_soil_crop_recommendation(
        soil_type=payload.soil_type,
        ph_level=payload.ph_level,
        moisture_percent=payload.moisture_percent,
        soil_temperature_c=payload.soil_temperature_c,
        nitrogen_level=payload.nitrogen_level,
        phosphorus_level=payload.phosphorus_level,
        potassium_level=payload.potassium_level,
        nitrogen_ppm=payload.nitrogen_ppm,
        phosphorus_ppm=payload.phosphorus_ppm,
        potassium_ppm=payload.potassium_ppm,
        drainage=payload.drainage,
        sunlight=payload.sunlight,
        season=payload.season,
        province=payload.province,
        latitude=latitude,
        longitude=longitude,
        location_label=location_label,
        weather=weather,
        disease_history=disease_history,
        feedback_stats=feedback_stats,
    )
    result["prediction_id"] = None
    if latest_farm is not None:
        prediction = Prediction(
            user_id=current_user.id,
            farm_id=latest_farm.id,
            crop_id=None,
            prediction_type="soil_scan_recommendation",
            result=result,
            confidence=result["confidence"],
        )
        db.add(prediction)
        await db.flush()
        result["prediction_id"] = prediction.id
        prediction.result = result

    await write_audit_log(
        db,
        request,
        "prediction.soil_scan",
        actor=current_user,
        resource_type="prediction",
        metadata={
            "soil_type": payload.soil_type,
            "best_crop": result["best_crop"],
            "confidence": result["confidence"],
            "location_label": result.get("location", {}).get("label"),
            "weather_source": weather.get("source"),
            "prediction_id": result["prediction_id"],
        },
    )
    await db.commit()
    return result


@router.post("", response_model=PredictionRead, status_code=status.HTTP_201_CREATED)
async def create_prediction(
    payload: PredictionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Prediction:
    farm_result = await db.execute(select(Farm).where(Farm.id == payload.farm_id))
    farm = farm_result.scalar_one_or_none()
    if farm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found.")
    if current_user.role.name == "farmer" and farm.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only create predictions for your farms.")

    crop = None
    if payload.crop_id:
        crop_result = await db.execute(select(Crop).where(Crop.id == payload.crop_id, Crop.farm_id == farm.id))
        crop = crop_result.scalar_one_or_none()
        if crop is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crop not found.")

    weather = await get_weather(farm.latitude, farm.longitude)
    result = build_smart_recommendation(crop.crop_type if crop else "mixed vegetables", crop.soil_type if crop else None, weather)
    prediction = Prediction(
        user_id=current_user.id,
        farm_id=farm.id,
        crop_id=crop.id if crop else None,
        prediction_type=payload.prediction_type,
        result={**result, "weather": weather},
        confidence=0.74,
    )
    db.add(prediction)
    await db.flush()
    await write_audit_log(db, request, "prediction.created", actor=current_user, resource_type="prediction", resource_id=prediction.id)
    await db.commit()
    await db.refresh(prediction)
    return prediction


@router.post("/{prediction_id}/feedback", status_code=status.HTTP_201_CREATED)
async def create_recommendation_feedback(
    prediction_id: int,
    payload: CropRecommendationFeedbackRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    prediction_result = await db.execute(select(Prediction).where(Prediction.id == prediction_id))
    prediction = prediction_result.scalar_one_or_none()
    if prediction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prediction not found.")

    if current_user.role.name == "farmer":
        owns_prediction = prediction.user_id == current_user.id
        owns_farm = False
        if prediction.farm_id is not None:
            farm_result = await db.execute(select(Farm).where(Farm.id == prediction.farm_id, Farm.user_id == current_user.id))
            owns_farm = farm_result.scalar_one_or_none() is not None
        if not owns_prediction and not owns_farm:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only review your recommendations.")

    feedback = CropRecommendationFeedback(
        prediction_id=prediction.id,
        user_id=current_user.id,
        crop_name=payload.crop_name.strip(),
        rating=payload.rating,
        planted=payload.planted,
        outcome=payload.outcome,
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(feedback)
    await db.flush()
    await write_audit_log(
        db,
        request,
        "prediction.feedback_created",
        actor=current_user,
        resource_type="prediction",
        resource_id=prediction.id,
        metadata={
            "crop_name": feedback.crop_name,
            "rating": feedback.rating,
            "outcome": feedback.outcome,
            "planted": feedback.planted,
        },
    )
    await db.commit()
    return {"message": "Feedback saved.", "feedback_id": feedback.id}


@router.get("", response_model=list[PredictionRead])
async def list_predictions(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[Prediction]:
    query = select(Prediction).order_by(Prediction.created_at.desc())
    if current_user.role.name == "farmer":
        query = query.outerjoin(Farm, Farm.id == Prediction.farm_id).where(
            or_(Prediction.user_id == current_user.id, Farm.user_id == current_user.id)
        )
    result = await db.execute(query.limit(100))
    return list(result.scalars().all())
