from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.core.database import get_db
from app.models import MarketplaceItem, User
from app.schemas.domain import MarketplaceCreate, MarketplaceRead
from app.services.audit import write_audit_log

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


@router.get("", response_model=list[MarketplaceRead])
async def list_marketplace(db: AsyncSession = Depends(get_db)) -> list[MarketplaceItem]:
    result = await db.execute(
        select(MarketplaceItem).where(MarketplaceItem.status == "available").order_by(MarketplaceItem.created_at.desc()).limit(200)
    )
    return list(result.scalars().all())


@router.post("", response_model=MarketplaceRead, status_code=status.HTTP_201_CREATED)
async def create_marketplace_item(
    payload: MarketplaceCreate,
    request: Request,
    current_user: User = Depends(require_roles("farmer", "admin")),
    db: AsyncSession = Depends(get_db),
) -> MarketplaceItem:
    item = MarketplaceItem(user_id=current_user.id, **payload.model_dump())
    db.add(item)
    await db.flush()
    await write_audit_log(db, request, "marketplace.created", actor=current_user, resource_type="marketplace", resource_id=item.id)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=MarketplaceRead)
async def update_marketplace_status(
    item_id: int,
    status_value: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MarketplaceItem:
    if status_value not in {"draft", "available", "reserved", "sold"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid marketplace status.")
    result = await db.execute(select(MarketplaceItem).where(MarketplaceItem.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Marketplace item not found.")
    if current_user.role.name != "admin" and item.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot update this item.")
    item.status = status_value
    await write_audit_log(db, request, "marketplace.status_updated", actor=current_user, resource_type="marketplace", resource_id=item.id)
    await db.commit()
    await db.refresh(item)
    return item
