from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Crop, Farm, Prediction, User
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
    ph_level: float | None = Field(default=None, ge=0, le=14)
    moisture_percent: float | None = Field(default=None, ge=0, le=100)
    soil_temperature_c: float | None = Field(default=None, ge=-10, le=80)
    nitrogen_level: str | None = Field(default="medium", pattern="^(low|medium|high)$")
    phosphorus_level: str | None = Field(default="medium", pattern="^(low|medium|high)$")
    potassium_level: str | None = Field(default="medium", pattern="^(low|medium|high)$")
    drainage: str | None = Field(default="moderate", max_length=80)
    sunlight: str | None = Field(default="full sun", max_length=80)
    season: str | None = Field(default="regular season", max_length=80)
    province: str | None = Field(default=None, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    location_label: str | None = Field(default=None, max_length=160)


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

    if latitude is None or longitude is None:
        farm_result = await db.execute(select(Farm).where(Farm.user_id == current_user.id).order_by(Farm.created_at.desc()).limit(1))
        latest_farm = farm_result.scalar_one_or_none()
        if latest_farm and latest_farm.latitude is not None and latest_farm.longitude is not None:
            latitude = latest_farm.latitude
            longitude = latest_farm.longitude
            location_label = location_label or _build_farm_location_label(latest_farm)

    weather = await get_weather(latitude, longitude)
    result = build_soil_crop_recommendation(
        soil_type=payload.soil_type,
        ph_level=payload.ph_level,
        moisture_percent=payload.moisture_percent,
        soil_temperature_c=payload.soil_temperature_c,
        nitrogen_level=payload.nitrogen_level,
        phosphorus_level=payload.phosphorus_level,
        potassium_level=payload.potassium_level,
        drainage=payload.drainage,
        sunlight=payload.sunlight,
        season=payload.season,
        province=payload.province,
        latitude=latitude,
        longitude=longitude,
        location_label=location_label,
        weather=weather,
    )
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


@router.get("", response_model=list[PredictionRead])
async def list_predictions(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[Prediction]:
    query = select(Prediction).order_by(Prediction.created_at.desc())
    if current_user.role.name == "farmer":
        query = query.join(Farm, Farm.id == Prediction.farm_id).where(Farm.user_id == current_user.id)
    result = await db.execute(query.limit(100))
    return list(result.scalars().all())
