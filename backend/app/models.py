from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, LargeBinary, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class FarmStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class MarketplaceStatus(str, Enum):
    draft = "draft"
    available = "available"
    reserved = "reserved"
    sold = "sold"


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    requires_mfa: Mapped[bool] = mapped_column(Boolean, default=False)

    users: Mapped[list["User"]] = relationship(back_populates="role")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    role: Mapped[Role] = relationship(back_populates="users")
    mfa_setting: Mapped["MFASetting | None"] = relationship(back_populates="user", uselist=False)
    farms: Mapped[list["Farm"]] = relationship(back_populates="owner")


class Farm(Base):
    __tablename__ = "farms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    barangay: Mapped[str | None] = mapped_column(String(120))
    municipality: Mapped[str | None] = mapped_column(String(120))
    province: Mapped[str | None] = mapped_column(String(120))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    area_hectares: Mapped[float | None] = mapped_column(Float)
    boundary_geojson: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(24), default=FarmStatus.pending.value, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner: Mapped[User] = relationship(back_populates="farms")
    crops: Mapped[list["Crop"]] = relationship(back_populates="farm")


class Crop(Base):
    __tablename__ = "crops"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    crop_type: Mapped[str] = mapped_column(String(80), index=True)
    variety: Mapped[str | None] = mapped_column(String(120))
    soil_type: Mapped[str | None] = mapped_column(String(80))
    planting_date: Mapped[datetime | None] = mapped_column(Date)
    expected_harvest_date: Mapped[datetime | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    farm: Mapped[Farm] = relationship(back_populates="crops")


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    farm_id: Mapped[int | None] = mapped_column(ForeignKey("farms.id"), index=True)
    crop_id: Mapped[int | None] = mapped_column(ForeignKey("crops.id"), index=True)
    image_path: Mapped[str] = mapped_column(String(500))
    disease_name: Mapped[str] = mapped_column(String(160))
    confidence: Mapped[float] = mapped_column(Float)
    cause: Mapped[str | None] = mapped_column(Text)
    treatment: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(40), default="detected")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id"), index=True)
    crop_id: Mapped[int | None] = mapped_column(ForeignKey("crops.id"), index=True)
    prediction_type: Mapped[str] = mapped_column(String(80), index=True)
    result: Mapped[dict] = mapped_column(JSON)
    confidence: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MarketplaceItem(Base):
    __tablename__ = "marketplace"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    farm_id: Mapped[int | None] = mapped_column(ForeignKey("farms.id"), index=True)
    crop_name: Mapped[str] = mapped_column(String(120), index=True)
    quantity_kg: Mapped[float] = mapped_column(Float)
    price_per_kg: Mapped[float] = mapped_column(Float)
    harvest_date: Mapped[datetime | None] = mapped_column(Date)
    description: Mapped[str | None] = mapped_column(Text)
    contact_phone: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(24), default=MarketplaceStatus.available.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(60), default="system")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    payload: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    resource_type: Mapped[str | None] = mapped_column(String(80))
    resource_id: Mapped[str | None] = mapped_column(String(80))
    ip_address: Mapped[str | None] = mapped_column(String(80))
    user_agent: Mapped[str | None] = mapped_column(String(500))
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MFASetting(Base):
    __tablename__ = "mfa_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    secret_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="mfa_setting")


class RecoveryCode(Base):
    __tablename__ = "recovery_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    code_hash: Mapped[str] = mapped_column(String(255), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PasswordResetOTP(Base):
    __tablename__ = "password_reset_otps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    otp_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    device_name: Mapped[str | None] = mapped_column(String(160))
    ip_address: Mapped[str | None] = mapped_column(String(80))
    user_agent: Mapped[str | None] = mapped_column(String(500))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DeviceLoginHistory(Base):
    __tablename__ = "device_login_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    ip_address: Mapped[str | None] = mapped_column(String(80))
    user_agent: Mapped[str | None] = mapped_column(String(500))
    device_name: Mapped[str | None] = mapped_column(String(160))
    location_hint: Mapped[str | None] = mapped_column(String(160))
    success: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    ip_address: Mapped[str | None] = mapped_column(String(80), index=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    endpoint: Mapped[str] = mapped_column(String(700), unique=True)
    keys_json: Mapped[dict] = mapped_column("subscription_keys", JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
