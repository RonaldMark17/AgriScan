import argparse
import asyncio
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import OperationalError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import AsyncSessionLocal, Base, engine
from app.core.security import get_password_hash, validate_strong_password
from app.models import (
    AuditLog,
    Crop,
    DeviceLoginHistory,
    Farm,
    LoginAttempt,
    MarketplaceItem,
    Notification,
    Prediction,
    Role,
    Scan,
    User,
)


ROLE_SEED = {
    "admin": ("System administrator", True),
    "farmer": ("Farm owner or operator", False),
    "inspector": ("Agriculture office staff or inspector", True),
    "buyer": ("Harvest buyer or cooperative purchaser", False),
}


@dataclass(frozen=True)
class UserSeed:
    full_name: str
    email: str
    role: str
    phone: str
    device_name: str
    location_hint: str
    last_login_days_ago: int


def now_utc() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def polygon_around(latitude: float, longitude: float, span: float = 0.002) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [longitude - span, latitude - span],
                [longitude + span, latitude - span],
                [longitude + span, latitude + span],
                [longitude - span, latitude + span],
                [longitude - span, latitude - span],
            ]
        ],
    }


async def ensure_schema_and_roles() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        for name, (description, requires_mfa) in ROLE_SEED.items():
            result = await db.execute(select(Role).where(Role.name == name))
            role = result.scalar_one_or_none()
            if role is None:
                db.add(Role(name=name, description=description, requires_mfa=requires_mfa))
            else:
                role.description = description
                role.requires_mfa = requires_mfa
        await db.commit()


async def get_role_map(db) -> dict[str, Role]:
    result = await db.execute(select(Role))
    return {role.name: role for role in result.scalars().all()}


async def upsert_user(db, role_map: dict[str, Role], seed: UserSeed, password_hash: str) -> User:
    result = await db.execute(select(User).where(User.email == seed.email.lower()))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(email=seed.email.lower(), full_name=seed.full_name, phone=seed.phone, role_id=role_map[seed.role].id)
        db.add(user)

    user.full_name = seed.full_name
    user.phone = seed.phone
    user.role_id = role_map[seed.role].id
    user.hashed_password = password_hash
    user.is_active = True
    user.is_verified = True
    user.last_login_at = now_utc() - timedelta(days=seed.last_login_days_ago)
    await db.flush()
    return user


async def upsert_farm(
    db,
    owner: User,
    *,
    name: str,
    barangay: str,
    municipality: str,
    province: str,
    latitude: float,
    longitude: float,
    area_hectares: float,
    status: str,
) -> Farm:
    result = await db.execute(select(Farm).where(Farm.user_id == owner.id, Farm.name == name))
    farm = result.scalars().first()
    if farm is None:
        farm = Farm(user_id=owner.id, name=name)
        db.add(farm)

    farm.barangay = barangay
    farm.municipality = municipality
    farm.province = province
    farm.latitude = latitude
    farm.longitude = longitude
    farm.area_hectares = area_hectares
    farm.status = status
    farm.boundary_geojson = polygon_around(latitude, longitude)
    await db.flush()
    return farm


async def upsert_crop(
    db,
    farm: Farm,
    *,
    crop_type: str,
    variety: str,
    soil_type: str,
    planting_date: date,
    expected_harvest_date: date,
) -> Crop:
    result = await db.execute(
        select(Crop).where(Crop.farm_id == farm.id, Crop.crop_type == crop_type, Crop.variety == variety)
    )
    crop = result.scalars().first()
    if crop is None:
        crop = Crop(farm_id=farm.id, crop_type=crop_type, variety=variety)
        db.add(crop)

    crop.soil_type = soil_type
    crop.planting_date = planting_date
    crop.expected_harvest_date = expected_harvest_date
    await db.flush()
    return crop


async def upsert_scan(
    db,
    *,
    user: User,
    farm: Farm | None,
    crop: Crop | None,
    image_path: str,
    disease_name: str,
    confidence: float,
    cause: str,
    treatment: str,
    status: str = "detected",
) -> Scan:
    result = await db.execute(select(Scan).where(Scan.image_path == image_path))
    scan = result.scalars().first()
    if scan is None:
        scan = Scan(image_path=image_path, user_id=user.id, farm_id=farm.id if farm else None, crop_id=crop.id if crop else None)
        db.add(scan)

    scan.user_id = user.id
    scan.farm_id = farm.id if farm else None
    scan.crop_id = crop.id if crop else None
    scan.disease_name = disease_name
    scan.confidence = confidence
    scan.cause = cause
    scan.treatment = treatment
    scan.status = status
    await db.flush()
    return scan


async def upsert_prediction(
    db,
    *,
    farm: Farm,
    crop: Crop | None,
    prediction_type: str,
    result_payload: dict,
    confidence: float,
) -> Prediction:
    result = await db.execute(
        select(Prediction).where(
            Prediction.farm_id == farm.id,
            Prediction.crop_id == (crop.id if crop else None),
            Prediction.prediction_type == prediction_type,
        )
    )
    prediction = result.scalars().first()
    if prediction is None:
        prediction = Prediction(farm_id=farm.id, crop_id=crop.id if crop else None, prediction_type=prediction_type, result=result_payload)
        db.add(prediction)

    prediction.result = result_payload
    prediction.confidence = confidence
    await db.flush()
    return prediction


async def upsert_marketplace_item(
    db,
    *,
    user: User,
    farm: Farm | None,
    crop_name: str,
    quantity_kg: float,
    price_per_kg: float,
    harvest_date: date,
    description: str,
    contact_phone: str,
    status: str,
) -> MarketplaceItem:
    result = await db.execute(
        select(MarketplaceItem).where(
            MarketplaceItem.user_id == user.id,
            MarketplaceItem.crop_name == crop_name,
            MarketplaceItem.description == description,
        )
    )
    item = result.scalars().first()
    if item is None:
        item = MarketplaceItem(user_id=user.id, farm_id=farm.id if farm else None, crop_name=crop_name, description=description)
        db.add(item)

    item.farm_id = farm.id if farm else None
    item.quantity_kg = quantity_kg
    item.price_per_kg = price_per_kg
    item.harvest_date = harvest_date
    item.contact_phone = contact_phone
    item.status = status
    await db.flush()
    return item


async def upsert_notification(
    db,
    *,
    user: User,
    title: str,
    body: str,
    type_: str,
    is_read: bool,
    payload: dict | None,
) -> Notification:
    result = await db.execute(select(Notification).where(Notification.user_id == user.id, Notification.title == title))
    notification = result.scalars().first()
    if notification is None:
        notification = Notification(user_id=user.id, title=title, body=body)
        db.add(notification)

    notification.body = body
    notification.type = type_
    notification.is_read = is_read
    notification.payload = payload
    await db.flush()
    return notification


async def upsert_audit_log(
    db,
    *,
    actor: User | None,
    action: str,
    resource_type: str,
    resource_id: str,
    ip_address: str,
    user_agent: str,
    metadata_json: dict | None,
) -> AuditLog:
    result = await db.execute(
        select(AuditLog).where(
            AuditLog.action == action,
            AuditLog.resource_type == resource_type,
            AuditLog.resource_id == resource_id,
        )
    )
    audit = result.scalars().first()
    if audit is None:
        audit = AuditLog(action=action, resource_type=resource_type, resource_id=resource_id)
        db.add(audit)

    audit.actor_user_id = actor.id if actor else None
    audit.ip_address = ip_address
    audit.user_agent = user_agent
    audit.metadata_json = metadata_json
    await db.flush()
    return audit


async def upsert_device_login_history(
    db,
    *,
    user: User,
    ip_address: str,
    user_agent: str,
    device_name: str,
    location_hint: str,
    success: bool,
) -> DeviceLoginHistory:
    result = await db.execute(
        select(DeviceLoginHistory).where(
            DeviceLoginHistory.user_id == user.id,
            DeviceLoginHistory.device_name == device_name,
            DeviceLoginHistory.location_hint == location_hint,
            DeviceLoginHistory.success == success,
        )
    )
    history = result.scalars().first()
    if history is None:
        history = DeviceLoginHistory(user_id=user.id, device_name=device_name, location_hint=location_hint, success=success)
        db.add(history)

    history.ip_address = ip_address
    history.user_agent = user_agent
    await db.flush()
    return history


async def upsert_login_attempt(db, *, email: str, ip_address: str, success: bool) -> LoginAttempt:
    result = await db.execute(
        select(LoginAttempt).where(
            LoginAttempt.email == email.lower(),
            LoginAttempt.ip_address == ip_address,
            LoginAttempt.success == success,
        )
    )
    attempt = result.scalars().first()
    if attempt is None:
        attempt = LoginAttempt(email=email.lower(), ip_address=ip_address, success=success)
        db.add(attempt)
    await db.flush()
    return attempt


async def seed_demo_data(shared_password: str) -> None:
    password_errors = validate_strong_password(shared_password)
    if password_errors:
        raise SystemExit(" ".join(password_errors))

    await ensure_schema_and_roles()
    password_hash = get_password_hash(shared_password)

    users_to_seed = [
        UserSeed(
            full_name="AgriScan Admin",
            email="admin@agriscanproject.com",
            role="admin",
            phone="+639171000001",
            device_name="AgriScan Control Desk",
            location_hint="Quezon City, Metro Manila",
            last_login_days_ago=0,
        ),
        UserSeed(
            full_name="Juan Dela Cruz",
            email="farmer@agriscanproject.com",
            role="farmer",
            phone="+639171000101",
            device_name="Juan's Field Tablet",
            location_hint="Cabanatuan City, Nueva Ecija",
            last_login_days_ago=0,
        ),
        UserSeed(
            full_name="Maria Santos",
            email="maria.santos@agriscanproject.com",
            role="farmer",
            phone="+639171000102",
            device_name="Maria's Mobile Phone",
            location_hint="Solano, Nueva Vizcaya",
            last_login_days_ago=1,
        ),
        UserSeed(
            full_name="Engr. Teresa Ramos",
            email="inspector@agriscanproject.com",
            role="inspector",
            phone="+639171000201",
            device_name="Inspection Laptop",
            location_hint="Muñoz, Nueva Ecija",
            last_login_days_ago=0,
        ),
        UserSeed(
            full_name="GreenFields Cooperative",
            email="buyer@agriscanproject.com",
            role="buyer",
            phone="+639171000301",
            device_name="Buyer Operations PC",
            location_hint="San Jose City, Nueva Ecija",
            last_login_days_ago=2,
        ),
    ]

    async with AsyncSessionLocal() as db:
        role_map = await get_role_map(db)

        seeded_users: dict[str, User] = {}
        for seed in users_to_seed:
            seeded_users[seed.email] = await upsert_user(db, role_map, seed, password_hash)

        farmer_juan = seeded_users["farmer@agriscanproject.com"]
        farmer_maria = seeded_users["maria.santos@agriscanproject.com"]
        inspector = seeded_users["inspector@agriscanproject.com"]
        buyer = seeded_users["buyer@agriscanproject.com"]
        admin = seeded_users["admin@agriscanproject.com"]

        san_isidro = await upsert_farm(
            db,
            farmer_juan,
            name="San Isidro Demo Farm",
            barangay="Bagong Sikat",
            municipality="Cabanatuan City",
            province="Nueva Ecija",
            latitude=15.4867,
            longitude=120.9667,
            area_hectares=4.2,
            status="approved",
        )
        villa_verde = await upsert_farm(
            db,
            farmer_maria,
            name="Villa Verde Upland Farm",
            barangay="Rang-ayan",
            municipality="Solano",
            province="Nueva Vizcaya",
            latitude=16.5206,
            longitude=121.1810,
            area_hectares=2.8,
            status="approved",
        )

        rice_crop = await upsert_crop(
            db,
            san_isidro,
            crop_type="Rice",
            variety="NSIC Rc222",
            soil_type="Clay loam",
            planting_date=date.today() - timedelta(days=58),
            expected_harvest_date=date.today() + timedelta(days=47),
        )
        corn_crop = await upsert_crop(
            db,
            san_isidro,
            crop_type="Corn",
            variety="Hybrid 915",
            soil_type="Loam",
            planting_date=date.today() - timedelta(days=34),
            expected_harvest_date=date.today() + timedelta(days=61),
        )
        tomato_crop = await upsert_crop(
            db,
            villa_verde,
            crop_type="Tomato",
            variety="Diamante Max",
            soil_type="Sandy loam",
            planting_date=date.today() - timedelta(days=21),
            expected_harvest_date=date.today() + timedelta(days=36),
        )

        await upsert_scan(
            db,
            user=farmer_juan,
            farm=san_isidro,
            crop=rice_crop,
            image_path="seed://scan/rice-bacterial-leaf-blight",
            disease_name="Rice bacterial leaf blight",
            confidence=0.94,
            cause="Bacteria spread through rain splash and infected seedlings after recent wet field conditions.",
            treatment="Use clean irrigation flow, remove heavily affected leaves, and coordinate with the local agriculture office before applying bactericide.",
        )
        await upsert_scan(
            db,
            user=farmer_juan,
            farm=san_isidro,
            crop=corn_crop,
            image_path="seed://scan/corn-leaf-blight",
            disease_name="Corn leaf blight",
            confidence=0.91,
            cause="Leaf lesions are consistent with humid-weather fungal pressure and retained crop residue.",
            treatment="Improve airflow, manage field residue, and follow the approved fungicide schedule if symptoms continue spreading.",
        )
        await upsert_scan(
            db,
            user=farmer_maria,
            farm=villa_verde,
            crop=tomato_crop,
            image_path="seed://scan/tomato-healthy",
            disease_name="Healthy crop",
            confidence=0.97,
            cause="No dominant disease signature was detected from the latest crop check.",
            treatment="Maintain balanced watering, scouting, and staking to keep the crop vigorous through fruiting stage.",
        )
        await upsert_scan(
            db,
            user=farmer_maria,
            farm=villa_verde,
            crop=tomato_crop,
            image_path="seed://scan/pest-leaf-damage",
            disease_name="Pest-related leaf damage",
            confidence=0.83,
            cause="Chewing marks and irregular leaf-edge loss suggest early insect pressure on the field border.",
            treatment="Inspect the underside of leaves, deploy sticky traps, and use integrated pest management before chemical control.",
        )

        await upsert_prediction(
            db,
            farm=san_isidro,
            crop=rice_crop,
            prediction_type="soil_crop_recommendation",
            result_payload={
                "best_crop": "Rice",
                "suitability": 98,
                "alternatives": ["Corn", "Mung bean"],
                "province": "Nueva Ecija",
                "notes": ["Clay loam holds water well for paddy fields.", "Current moisture supports transplanting preparation."],
            },
            confidence=0.98,
        )
        await upsert_prediction(
            db,
            farm=san_isidro,
            crop=corn_crop,
            prediction_type="yield_prediction",
            result_payload={
                "expected_yield_tons": 18.4,
                "unit": "tons",
                "harvest_window": "6 to 8 weeks",
                "risk_level": "moderate",
            },
            confidence=0.88,
        )
        await upsert_prediction(
            db,
            farm=villa_verde,
            crop=tomato_crop,
            prediction_type="watering_recommendation",
            result_payload={
                "schedule": "Every 2 days in the morning",
                "amount_liters_per_plant": 1.3,
                "weather_note": "Reduce watering if afternoon rain continues.",
            },
            confidence=0.86,
        )
        await upsert_prediction(
            db,
            farm=villa_verde,
            crop=tomato_crop,
            prediction_type="fertilizer_recommendation",
            result_payload={
                "blend": "14-14-14 plus calcium nitrate",
                "timing": "Topdress after flowering",
                "notes": ["Support fruit set with balanced potassium.", "Avoid heavy nitrogen during wet spells."],
            },
            confidence=0.84,
        )

        await upsert_marketplace_item(
            db,
            user=farmer_juan,
            farm=san_isidro,
            crop_name="Yellow Corn",
            quantity_kg=1250,
            price_per_kg=24.5,
            harvest_date=date.today() + timedelta(days=24),
            description="[seed:yellow-corn] Drying in crib storage and ready for cooperative buyers this month.",
            contact_phone=farmer_juan.phone or "",
            status="available",
        )
        await upsert_marketplace_item(
            db,
            user=farmer_maria,
            farm=villa_verde,
            crop_name="Tomato",
            quantity_kg=320,
            price_per_kg=48.0,
            harvest_date=date.today() + timedelta(days=10),
            description="[seed:tomato] Fresh harvest for local buyers and restaurants in Nueva Vizcaya.",
            contact_phone=farmer_maria.phone or "",
            status="available",
        )
        await upsert_marketplace_item(
            db,
            user=farmer_juan,
            farm=san_isidro,
            crop_name="Rice",
            quantity_kg=2200,
            price_per_kg=29.0,
            harvest_date=date.today() + timedelta(days=45),
            description="[seed:rice] Palay contract volume reserved for millers and cooperatives.",
            contact_phone=farmer_juan.phone or "",
            status="reserved",
        )

        await upsert_notification(
            db,
            user=farmer_juan,
            title="Weather advisory for Nueva Ecija",
            body="Rain probability is elevated this afternoon. Clear drainage canals and protect newly transplanted plots.",
            type_="weather",
            is_read=False,
            payload={"province": "Nueva Ecija", "severity": "medium", "seeded": True},
        )
        await upsert_notification(
            db,
            user=farmer_maria,
            title="Crop recommendation updated",
            body="Tomato remains the strongest match for your latest soil reading, with eggplant as a backup option.",
            type_="recommendation",
            is_read=False,
            payload={"best_crop": "Tomato", "seeded": True},
        )
        await upsert_notification(
            db,
            user=inspector,
            title="Inspection visit scheduled",
            body="Field validation for San Isidro Demo Farm is scheduled tomorrow at 9:00 AM.",
            type_="inspection",
            is_read=True,
            payload={"farm": "San Isidro Demo Farm", "seeded": True},
        )
        await upsert_notification(
            db,
            user=buyer,
            title="New harvests available",
            body="Two marketplace listings now match your buyer profile: Yellow Corn and Tomato.",
            type_="marketplace",
            is_read=False,
            payload={"matches": 2, "seeded": True},
        )

        await upsert_audit_log(
            db,
            actor=admin,
            action="seed.database",
            resource_type="system",
            resource_id="demo-dataset",
            ip_address="127.0.0.1",
            user_agent="AgriScan Seeder",
            metadata_json={"seeded": True, "module": "bootstrap"},
        )
        await upsert_audit_log(
            db,
            actor=farmer_juan,
            action="farm.created",
            resource_type="farm",
            resource_id="san-isidro-demo-farm",
            ip_address="192.168.1.24",
            user_agent="AgriScan PWA",
            metadata_json={"seeded": True, "province": "Nueva Ecija"},
        )
        await upsert_audit_log(
            db,
            actor=farmer_maria,
            action="scan.created",
            resource_type="scan",
            resource_id="seed-pest-leaf-damage",
            ip_address="192.168.1.36",
            user_agent="AgriScan PWA",
            metadata_json={"seeded": True, "disease": "Pest-related leaf damage"},
        )
        await upsert_audit_log(
            db,
            actor=buyer,
            action="marketplace.created",
            resource_type="marketplace",
            resource_id="seed-yellow-corn",
            ip_address="192.168.1.55",
            user_agent="AgriScan Buyer Portal",
            metadata_json={"seeded": True, "crop_name": "Yellow Corn"},
        )

        for seed in users_to_seed:
            user = seeded_users[seed.email]
            await upsert_device_login_history(
                db,
                user=user,
                ip_address="127.0.0.1" if seed.role == "admin" else "192.168.1.10",
                user_agent="AgriScan PWA",
                device_name=seed.device_name,
                location_hint=seed.location_hint,
                success=True,
            )
            await upsert_login_attempt(
                db,
                email=seed.email,
                ip_address="127.0.0.1" if seed.role == "admin" else "192.168.1.10",
                success=True,
            )

        await upsert_login_attempt(db, email="farmer@agriscanproject.com", ip_address="192.168.1.10", success=False)
        await db.commit()

    print("Seeded AgriScan demo data successfully.")
    print("Shared password for demo accounts:", shared_password)
    print("Demo accounts:")
    for seed in users_to_seed:
        print(f"  - {seed.role:<9} {seed.email}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed AgriScan with demo users, farms, scans, predictions, and marketplace data.")
    parser.add_argument("--password", default="ChangeMe!2026Secure", help="Shared password for all seeded demo accounts.")
    args = parser.parse_args()

    async def runner() -> None:
        try:
            await seed_demo_data(args.password)
        finally:
            await engine.dispose()

    try:
        asyncio.run(runner())
    except OperationalError as exc:
        raise SystemExit(
            "Could not connect to MySQL using the current backend .env DATABASE_URL. "
            "Make sure MySQL is running, the agriscanproject database exists, and the configured user has access."
        ) from exc


if __name__ == "__main__":
    main()
