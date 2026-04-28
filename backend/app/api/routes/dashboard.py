from datetime import UTC, datetime, timedelta
from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Farm, MarketplaceItem, Notification, Scan, User
from app.services.weather import get_weather

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _format_coordinates(latitude: float, longitude: float) -> str:
    return f"{latitude:.5f}, {longitude:.5f}"


def _build_farm_label(farm: Farm) -> str:
    parts = [farm.barangay, farm.municipality, farm.province]
    location_bits = [part for part in parts if part]
    if farm.name and location_bits:
        return f"{farm.name} - {', '.join(location_bits)}"
    if location_bits:
        return ", ".join(location_bits)
    return farm.name


def _build_location_payload(
    *,
    source: str,
    latitude: float | None,
    longitude: float | None,
    label: str,
    accuracy_m: float | None = None,
) -> dict:
    return {
        "source": source,
        "label": label,
        "latitude": latitude,
        "longitude": longitude,
        "accuracy_m": round(accuracy_m, 1) if accuracy_m is not None else None,
    }


def _haversine_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    earth_radius_km = 6371.0
    latitude_delta = radians(latitude_b - latitude_a)
    longitude_delta = radians(longitude_b - longitude_a)
    origin_latitude = radians(latitude_a)
    target_latitude = radians(latitude_b)

    haversine = (
        sin(latitude_delta / 2) ** 2
        + cos(origin_latitude) * cos(target_latitude) * sin(longitude_delta / 2) ** 2
    )
    return 2 * earth_radius_km * asin(sqrt(haversine))


def _is_healthy_scan(scan: Scan) -> bool:
    return scan.disease_name.strip().lower() in {"healthy", "healthy crop"}


def _is_pest_related_scan(scan: Scan) -> bool:
    text = f"{scan.disease_name or ''} {scan.cause or ''}".lower()
    return any(term in text for term in ["pest", "armyworm", "thrips", "hopper", "mites", "insect", "worm", "larvae"])


def _build_alert_payload(
    *,
    title: str,
    body: str,
    tone: str,
    action_to: str,
    action_label: str,
    source: str,
    created_at: datetime | None = None,
    distance_km: float | None = None,
) -> dict:
    return {
        "title": title,
        "body": body,
        "tone": tone,
        "action_to": action_to,
        "action_label": action_label,
        "source": source,
        "created_at": created_at,
        "distance_km": round(distance_km, 1) if distance_km is not None else None,
    }


def _build_notification_alert(notification: Notification) -> dict:
    tone_by_type = {
        "weather": "amber",
        "inspection": "sky",
        "marketplace": "green",
        "recommendation": "green",
        "disease_scan": "red",
        "farm_approved": "green",
    }
    action_by_type = {
        "weather": ("/farms", "View Map"),
        "inspection": ("/farms", "View Map"),
        "marketplace": ("/scan", "Open Manual Scan"),
        "recommendation": ("/scan", "Open Manual Scan"),
        "disease_scan": ("/disease-detector", "Open Disease Detector"),
        "farm_approved": ("/farms", "View Farms"),
    }
    action_to, action_label = action_by_type.get(notification.type, ("/scan", "Open Manual Scan"))
    return _build_alert_payload(
        title=notification.title,
        body=notification.body,
        tone=tone_by_type.get(notification.type, "red"),
        action_to=action_to,
        action_label=action_label,
        source="notification",
        created_at=notification.created_at,
    )


def _build_scan_alert(scan: Scan, *, distance_km: float | None = None, nearby_label: str | None = None) -> dict:
    confidence_percent = round((scan.confidence or 0) * 100)
    disease_name = scan.disease_name or "Crop issue detected"

    if distance_km is not None:
        title = f"Nearby field alert: {disease_name}"
        if _is_pest_related_scan(scan):
            title = f"Nearby pest alert: {disease_name}"
        body = (
            f"A recent scan about {distance_km:.1f} km from {nearby_label or 'your current area'} "
            f"flagged {disease_name.lower()}. Check nearby crops for similar symptoms and review treatment guidance."
        )
        return _build_alert_payload(
            title=title,
            body=body,
            tone="red",
            action_to="/farms",
            action_label="View Map",
            source="nearby_scan",
            created_at=scan.created_at,
            distance_km=distance_km,
        )

    body = (
        f"Your latest disease scan flagged {disease_name.lower()} with {confidence_percent}% confidence. "
        "Review the treatment guidance and inspect affected plants."
    )
    return _build_alert_payload(
        title=f"Latest crop scan: {disease_name}",
        body=body,
        tone="red",
        action_to="/scan",
        action_label="Open Manual Scan",
        source="recent_scan",
        created_at=scan.created_at,
    )


@router.get("/summary")
async def dashboard_summary(
    latitude: float | None = Query(default=None),
    longitude: float | None = Query(default=None),
    location_label: str | None = Query(default=None, max_length=160),
    accuracy_m: float | None = Query(default=None, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    farm_query = select(func.count(Farm.id))
    scan_query = select(func.count(Scan.id))
    marketplace_query = select(func.count(MarketplaceItem.id)).where(MarketplaceItem.status == "available")
    alert_query = select(func.count(Notification.id)).where(Notification.user_id == current_user.id, Notification.is_read.is_(False))

    if current_user.role.name == "farmer":
        farm_query = farm_query.where(Farm.user_id == current_user.id)
        scan_query = scan_query.where(Scan.user_id == current_user.id)

    farm_count = (await db.execute(farm_query)).scalar_one()
    scan_count = (await db.execute(scan_query)).scalar_one()
    marketplace_count = (await db.execute(marketplace_query)).scalar_one()
    unread_alerts = (await db.execute(alert_query)).scalar_one()

    farm_result = await db.execute(select(Farm).where(Farm.user_id == current_user.id).order_by(Farm.created_at.desc()).limit(1))
    farm = farm_result.scalar_one_or_none()

    has_device_coordinates = latitude is not None and longitude is not None
    selected_latitude = latitude if has_device_coordinates else (farm.latitude if farm else None)
    selected_longitude = longitude if has_device_coordinates else (farm.longitude if farm else None)

    if has_device_coordinates:
        resolved_label = location_label.strip() if location_label else "Current device location"
        location = _build_location_payload(
            source="device",
            latitude=latitude,
            longitude=longitude,
            label=resolved_label,
            accuracy_m=accuracy_m,
        )
    elif farm:
        location = _build_location_payload(
            source="farm",
            latitude=farm.latitude,
            longitude=farm.longitude,
            label=_build_farm_label(farm),
        )
    else:
        location = _build_location_payload(
            source="unavailable",
            latitude=None,
            longitude=None,
            label="No current location available",
        )

    weather = await get_weather(selected_latitude, selected_longitude)

    recent_scans_result = await db.execute(
        select(Scan).where(Scan.user_id == current_user.id).order_by(Scan.created_at.desc()).limit(5)
    )
    recent_scans = list(recent_scans_result.scalars().all())

    latest_notification_result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .order_by(Notification.created_at.desc())
        .limit(1)
    )
    latest_notification = latest_notification_result.scalar_one_or_none()

    featured_alert = None
    if selected_latitude is not None and selected_longitude is not None:
        nearby_since = datetime.now(UTC) - timedelta(days=14)
        nearby_scan_rows = await db.execute(
            select(Scan, Farm)
            .join(Farm, Scan.farm_id == Farm.id)
            .where(
                Scan.user_id != current_user.id,
                Scan.created_at >= nearby_since,
                Scan.farm_id.is_not(None),
                Farm.latitude.is_not(None),
                Farm.longitude.is_not(None),
            )
            .order_by(Scan.created_at.desc())
            .limit(80)
        )

        nearest_alert_candidate: tuple[Scan, float] | None = None
        for scan, scan_farm in nearby_scan_rows.all():
            if _is_healthy_scan(scan):
                continue
            distance_km = _haversine_km(selected_latitude, selected_longitude, float(scan_farm.latitude), float(scan_farm.longitude))
            if distance_km <= 5 and (
                nearest_alert_candidate is None or distance_km < nearest_alert_candidate[1]
            ):
                nearest_alert_candidate = (scan, distance_km)

        if nearest_alert_candidate is not None:
            nearby_scan, nearby_distance = nearest_alert_candidate
            featured_alert = _build_scan_alert(
                nearby_scan,
                distance_km=nearby_distance,
                nearby_label=location["label"],
            )

    if featured_alert is None and latest_notification is not None:
        featured_alert = _build_notification_alert(latest_notification)

    if featured_alert is None:
        latest_nonhealthy_scan = next((scan for scan in recent_scans if not _is_healthy_scan(scan)), None)
        if latest_nonhealthy_scan is not None:
            featured_alert = _build_scan_alert(latest_nonhealthy_scan)

    return {
        "stats": {
            "farms": farm_count,
            "scans": scan_count,
            "available_harvests": marketplace_count,
            "unread_alerts": unread_alerts,
        },
        "weather": weather,
        "location": location,
        "featured_alert": featured_alert,
        "recent_scans": [
            {
                "id": scan.id,
                "disease_name": scan.disease_name,
                "confidence": scan.confidence,
                "created_at": scan.created_at,
            }
            for scan in recent_scans
        ],
    }
