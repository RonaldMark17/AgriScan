from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class RoleRead(BaseModel):
    id: int
    name: str
    requires_mfa: bool

    model_config = {"from_attributes": True}


class UserRead(BaseModel):
    id: int
    email: EmailStr
    phone: str | None
    full_name: str
    role: RoleRead
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login_at: datetime | None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=32)
    is_active: bool | None = None
    role: str | None = Field(default=None, pattern="^(admin|farmer|buyer|inspector)$")


class FarmCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    barangay: str | None = Field(default=None, max_length=120)
    municipality: str | None = Field(default=None, max_length=120)
    province: str | None = Field(default=None, max_length=120)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    area_hectares: float | None = Field(default=None, ge=0)
    boundary_geojson: dict[str, Any] | None = None


class FarmRead(FarmCreate):
    id: int
    user_id: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CropCreate(BaseModel):
    farm_id: int
    crop_type: str = Field(min_length=2, max_length=80)
    variety: str | None = Field(default=None, max_length=120)
    soil_type: str | None = Field(default=None, max_length=80)
    planting_date: date | None = None
    expected_harvest_date: date | None = None


class CropRead(CropCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ScanRead(BaseModel):
    id: int
    user_id: int
    farm_id: int | None
    crop_id: int | None
    crop_label: str | None = None
    analysis_mode: str | None = None
    reference_url: str | None = None
    reference_title: str | None = None
    image_path: str
    disease_name: str
    confidence: float
    cause: str | None
    treatment: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PredictionRead(BaseModel):
    id: int
    farm_id: int
    crop_id: int | None
    prediction_type: str
    result: dict[str, Any]
    confidence: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MarketplaceCreate(BaseModel):
    farm_id: int | None = None
    crop_name: str = Field(min_length=2, max_length=120)
    quantity_kg: float = Field(gt=0)
    price_per_kg: float = Field(ge=0)
    harvest_date: date | None = None
    description: str | None = Field(default=None, max_length=1500)
    contact_phone: str | None = Field(default=None, max_length=32)
    status: str = Field(default="available", pattern="^(draft|available|reserved|sold)$")


class MarketplaceRead(MarketplaceCreate):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationRead(BaseModel):
    id: int
    title: str
    body: str
    type: str
    is_read: bool
    payload: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogRead(BaseModel):
    id: int
    actor_user_id: int | None
    action: str
    resource_type: str | None
    resource_id: str | None
    ip_address: str | None
    user_agent: str | None
    metadata_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}

