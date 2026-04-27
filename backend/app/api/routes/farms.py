from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models import Crop, Farm, User
from app.schemas.common import MessageResponse
from app.schemas.domain import CropCreate, CropRead, FarmCreate, FarmRead
from app.services.audit import write_audit_log

router = APIRouter(prefix="/farms", tags=["farms"])


@router.get("", response_model=list[FarmRead])
async def list_farms(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[Farm]:
    query = select(Farm).order_by(Farm.created_at.desc())
    if current_user.role.name == "farmer":
        query = query.where(Farm.user_id == current_user.id)
    elif current_user.role.name == "buyer":
        query = query.where(Farm.status == "approved")
    result = await db.execute(query.limit(200))
    return list(result.scalars().all())


@router.post("", response_model=FarmRead, status_code=status.HTTP_201_CREATED)
async def create_farm(
    payload: FarmCreate,
    request: Request,
    current_user: User = Depends(require_roles("farmer", "admin")),
    db: AsyncSession = Depends(get_db),
) -> Farm:
    farm = Farm(user_id=current_user.id, **payload.model_dump())
    db.add(farm)
    await db.flush()
    await write_audit_log(db, request, "farm.created", actor=current_user, resource_type="farm", resource_id=farm.id)
    await db.commit()
    await db.refresh(farm)
    return farm


@router.patch("/{farm_id}/approve", response_model=FarmRead)
async def approve_farm(
    farm_id: int,
    request: Request,
    current_user: User = Depends(require_roles("admin", "inspector")),
    db: AsyncSession = Depends(get_db),
) -> Farm:
    result = await db.execute(select(Farm).where(Farm.id == farm_id))
    farm = result.scalar_one_or_none()
    if farm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farm not found.")
    farm.status = "approved"
    await write_audit_log(db, request, "farm.approved", actor=current_user, resource_type="farm", resource_id=farm.id)
    await db.commit()
    await db.refresh(farm)
    return farm


@router.post("/{farm_id}/crops", response_model=CropRead, status_code=status.HTTP_201_CREATED)
async def create_crop(
    farm_id: int,
    payload: CropCreate,
    request: Request,
    current_user: User = Depends(require_roles("farmer", "admin", "inspector")),
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
    if current_user.role.name not in {"admin", "inspector"} and farm.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot delete this farm.")
    await db.delete(farm)
    await write_audit_log(db, request, "farm.deleted", actor=current_user, resource_type="farm", resource_id=farm_id)
    await db.commit()
    return MessageResponse(message="Farm deleted.")
