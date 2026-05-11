import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models import Crop, Farm, FarmStatus, Role, User
from app.schemas.common import MessageResponse
from app.schemas.domain import CropCreate, CropRead, FarmCreate, FarmRead
from app.services.audit import write_audit_log
from app.services.push_notifications import create_notification, dispatch_push_to_user

router = APIRouter(prefix="/farms", tags=["farms"])
TEXT_FIELDS = ("name", "barangay", "municipality", "province")
logger = logging.getLogger(__name__)


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.strip().split())
    return cleaned or None


def _normalise_number(value: float | None, precision: int) -> float | None:
    if value is None:
        return None
    return round(float(value), precision)


def _normalise_boundary(value: dict[str, Any] | None) -> str | None:
    if not value:
        return None
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _farm_data(payload: FarmCreate) -> dict[str, Any]:
    data = payload.model_dump()
    for field in TEXT_FIELDS:
        data[field] = _clean_text(data.get(field))
    data["name"] = data["name"] or ""
    return data


def _farm_signature(values: dict[str, Any] | Farm) -> tuple[Any, ...]:
    def read(field: str) -> Any:
        return values[field] if isinstance(values, dict) else getattr(values, field)

    return (
        (_clean_text(read("name")) or "").casefold(),
        (_clean_text(read("barangay")) or "").casefold(),
        (_clean_text(read("municipality")) or "").casefold(),
        (_clean_text(read("province")) or "").casefold(),
        _normalise_number(read("latitude"), 6),
        _normalise_number(read("longitude"), 6),
        _normalise_number(read("area_hectares"), 4),
        _normalise_boundary(read("boundary_geojson")),
    )


async def _find_duplicate_farm(db: AsyncSession, user_id: int, farm_data: dict[str, Any]) -> Farm | None:
    expected_signature = _farm_signature(farm_data)
    result = await db.execute(select(Farm).where(Farm.user_id == user_id))
    for farm in result.scalars().all():
        if _farm_signature(farm) == expected_signature:
            return farm
    return None


def _attach_owner_details(farm: Farm, owner: User | None) -> Farm:
    setattr(farm, "owner_name", owner.full_name if owner else None)
    setattr(farm, "owner_email", owner.email if owner else None)
    return farm


def _farm_location_summary(farm: Farm) -> str:
    return ", ".join(part for part in [farm.barangay, farm.municipality, farm.province] if part)


async def _create_admin_farm_registration_notifications(
    db: AsyncSession,
    *,
    farm: Farm,
    farmer: User,
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(User)
        .join(Role, Role.id == User.role_id)
        .where(Role.name == "admin", User.is_active.is_(True))
    )
    admins = list(result.scalars().all())
    if not admins:
        return []

    farm_name = farm.name or "a new farm"
    location = _farm_location_summary(farm)
    title = "New farm registration"
    body = f"{farmer.full_name} registered {farm_name} for approval."
    if location:
        body = f"{farmer.full_name} registered {farm_name} in {location}. Review it for approval."

    pushes: list[dict[str, Any]] = []
    notification_payload = {
        "farm_id": farm.id,
        "farmer_user_id": farmer.id,
        "farmer_name": farmer.full_name,
        "farm_status": FarmStatus.pending.value,
        "url": "/admin/users",
    }
    for admin in admins:
        notification = await create_notification(
            db,
            user_id=admin.id,
            title=title,
            body=body,
            notification_type="farm_pending",
            payload=notification_payload,
        )
        pushes.append(
            {
                "user_id": admin.id,
                "title": title,
                "body": body,
                "url": "/admin/users",
                "payload": {
                    **notification_payload,
                    "notification_id": notification.id,
                    "type": "farm_pending",
                    "tag": f"farm-pending-{farm.id}",
                },
            }
        )
    return pushes


async def _dispatch_farm_notification_safely(db: AsyncSession, **push: Any) -> None:
    try:
        await dispatch_push_to_user(db, **push)
    except Exception as exc:
        logger.exception("Farm notification dispatch failed after the farm action was saved.", exc_info=exc)


@router.get("", response_model=list[FarmRead])
async def list_farms(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[Farm]:
    if current_user.role.name == "admin":
        result = await db.execute(
            select(Farm, User)
            .join(User, User.id == Farm.user_id)
            .order_by(Farm.created_at.desc())
            .limit(200)
        )
        return [_attach_owner_details(farm, owner) for farm, owner in result.all()]

    result = await db.execute(
        select(Farm)
        .where(Farm.user_id == current_user.id)
        .order_by(Farm.created_at.desc())
        .limit(200)
    )
    return list(result.scalars().all())


@router.post("", response_model=FarmRead, status_code=status.HTTP_201_CREATED)
async def create_farm(
    payload: FarmCreate,
    request: Request,
    current_user: User = Depends(require_roles("farmer", "admin")),
    db: AsyncSession = Depends(get_db),
) -> Farm:
    farm_data = _farm_data(payload)
    duplicate = await _find_duplicate_farm(db, current_user.id, farm_data)
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A farm with the same details already exists.",
        )

    farm = Farm(user_id=current_user.id, **farm_data)
    db.add(farm)
    await db.flush()
    admin_registration_pushes: list[dict[str, Any]] = []
    if current_user.role.name == "farmer":
        admin_registration_pushes = await _create_admin_farm_registration_notifications(
            db,
            farm=farm,
            farmer=current_user,
        )
    await write_audit_log(db, request, "farm.created", actor=current_user, resource_type="farm", resource_id=farm.id)
    await db.commit()
    await db.refresh(farm)
    for push in admin_registration_pushes:
        await _dispatch_farm_notification_safely(db, **push)
    return farm


@router.patch("/{farm_id}/approve", response_model=FarmRead)
async def approve_farm(
    farm_id: int,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> Farm:
    result = await db.execute(select(Farm).where(Farm.id == farm_id))
    farm = result.scalar_one_or_none()
    if farm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found.")
    previous_status = farm.status
    farm.status = FarmStatus.approved.value
    approval_notification = None
    if previous_status != FarmStatus.approved.value:
        title = "Farm approved"
        body = f"Your farm {farm.name} has been approved. You can now use AgriScan farm features."
        approval_notification = await create_notification(
            db,
            user_id=farm.user_id,
            title=title,
            body=body,
            notification_type="farm_approved",
            payload={"farm_id": farm.id, "url": "/farms", "approved_by_user_id": current_user.id},
        )
    await write_audit_log(db, request, "farm.approved", actor=current_user, resource_type="farm", resource_id=farm.id)
    await db.commit()
    await db.refresh(farm)
    if approval_notification is not None:
        await _dispatch_farm_notification_safely(
            db,
            user_id=farm.user_id,
            title=approval_notification.title,
            body=approval_notification.body,
            url="/farms",
            payload={
                "farm_id": farm.id,
                "notification_id": approval_notification.id,
                "type": "farm_approved",
                "tag": f"farm-approved-{farm.id}",
            },
        )
    return farm


@router.patch("/{farm_id}/reject", response_model=FarmRead)
async def reject_farm(
    farm_id: int,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
) -> Farm:
    result = await db.execute(select(Farm).where(Farm.id == farm_id))
    farm = result.scalar_one_or_none()
    if farm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found.")
    previous_status = farm.status
    farm.status = FarmStatus.rejected.value
    rejection_notification = None
    if previous_status != FarmStatus.rejected.value:
        title = "Farm registration rejected"
        body = f"Your farm {farm.name} was rejected. Please review the details or contact the agriculture office."
        rejection_notification = await create_notification(
            db,
            user_id=farm.user_id,
            title=title,
            body=body,
            notification_type="farm_rejected",
            payload={"farm_id": farm.id, "url": "/farms", "rejected_by_user_id": current_user.id},
        )
    await write_audit_log(
        db,
        request,
        "farm.rejected",
        actor=current_user,
        resource_type="farm",
        resource_id=farm.id,
        metadata={"previous_status": previous_status},
    )
    await db.commit()
    await db.refresh(farm)
    if rejection_notification is not None:
        await _dispatch_farm_notification_safely(
            db,
            user_id=farm.user_id,
            title=rejection_notification.title,
            body=rejection_notification.body,
            url="/farms",
            payload={
                "farm_id": farm.id,
                "notification_id": rejection_notification.id,
                "type": "farm_rejected",
                "tag": f"farm-rejected-{farm.id}",
            },
        )
    return farm


@router.post("/{farm_id}/crops", response_model=CropRead, status_code=status.HTTP_201_CREATED)
async def create_crop(
    farm_id: int,
    payload: CropCreate,
    request: Request,
    current_user: User = Depends(require_roles("farmer", "admin")),
    db: AsyncSession = Depends(get_db),
) -> Crop:
    if payload.farm_id != farm_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="farm_id mismatch.")
    farm_result = await db.execute(select(Farm).where(Farm.id == farm_id))
    farm = farm_result.scalar_one_or_none()
    if farm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found.")
    if current_user.role.name == "farmer" and farm.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only add crops to your own farms.")
    crop = Crop(**payload.model_dump())
    db.add(crop)
    await db.flush()
    await write_audit_log(db, request, "crop.created", actor=current_user, resource_type="crop", resource_id=crop.id)
    await db.commit()
    await db.refresh(crop)
    return crop


@router.get("/{farm_id}/crops", response_model=list[CropRead])
async def list_crops(
    farm_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Crop]:
    farm_result = await db.execute(select(Farm).where(Farm.id == farm_id))
    farm = farm_result.scalar_one_or_none()
    if farm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found.")
    if current_user.role.name == "farmer" and farm.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your own farm crops.")
    result = await db.execute(select(Crop).where(Crop.farm_id == farm_id).order_by(Crop.created_at.desc()))
    return list(result.scalars().all())


@router.delete("/{farm_id}", response_model=MessageResponse)
async def delete_farm(
    farm_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    result = await db.execute(select(Farm).where(Farm.id == farm_id))
    farm = result.scalar_one_or_none()
    if farm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found.")
    if current_user.role.name != "admin" and farm.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot delete this farm.")
    await db.delete(farm)
    await write_audit_log(db, request, "farm.deleted", actor=current_user, resource_type="farm", resource_id=farm_id)
    await db.commit()
    return MessageResponse(message="Farm deleted.")
