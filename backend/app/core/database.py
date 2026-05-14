from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy import event, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()

SQLITE_COMPATIBILITY_COLUMNS = {
    "roles": {
        "requires_mfa": "requires_mfa BOOLEAN NOT NULL DEFAULT 0",
    },
    "users": {
        "phone": "phone VARCHAR(32)",
        "is_active": "is_active BOOLEAN NOT NULL DEFAULT 1",
        "is_verified": "is_verified BOOLEAN NOT NULL DEFAULT 0",
        "failed_login_attempts": "failed_login_attempts INTEGER NOT NULL DEFAULT 0",
        "locked_until": "locked_until DATETIME",
        "last_login_at": "last_login_at DATETIME",
        "created_at": "created_at DATETIME",
        "updated_at": "updated_at DATETIME",
    },
    "farms": {
        "barangay": "barangay VARCHAR(120)",
        "municipality": "municipality VARCHAR(120)",
        "province": "province VARCHAR(120)",
        "latitude": "latitude FLOAT",
        "longitude": "longitude FLOAT",
        "area_hectares": "area_hectares FLOAT",
        "boundary_geojson": "boundary_geojson JSON",
        "status": "status VARCHAR(24) NOT NULL DEFAULT 'pending'",
        "created_at": "created_at DATETIME",
    },
    "crops": {
        "variety": "variety VARCHAR(120)",
        "soil_type": "soil_type VARCHAR(80)",
        "planting_date": "planting_date DATE",
        "expected_harvest_date": "expected_harvest_date DATE",
        "created_at": "created_at DATETIME",
    },
    "scans": {
        "farm_id": "farm_id INTEGER",
        "crop_id": "crop_id INTEGER",
        "cause": "cause TEXT",
        "treatment": "treatment TEXT",
        "crop_label": "crop_label VARCHAR(120)",
        "analysis_mode": "analysis_mode VARCHAR(120)",
        "reference_url": "reference_url VARCHAR(700)",
        "reference_title": "reference_title VARCHAR(240)",
        "detections": "detections JSON",
        "status": "status VARCHAR(40) NOT NULL DEFAULT 'detected'",
        "created_at": "created_at DATETIME",
        # Enhanced classification fields
        "severity": "severity VARCHAR(40)",  # mild, moderate, severe, critical
        "confidence_band": "confidence_band VARCHAR(40)",  # high, medium, low
        "visual_symptoms": "visual_symptoms JSON",  # List of detected symptoms
        "affected_area_percentage": "affected_area_percentage FLOAT",  # % of plant affected
        "disease_stage": "disease_stage VARCHAR(40)",  # early, mid, late, advanced
        "immediate_actions": "immediate_actions JSON",  # Quick action items
        "reliability_score": "reliability_score FLOAT NOT NULL DEFAULT 1.0",  # Model reliability
        "image_quality_issues": "image_quality_issues JSON",  # Image quality analysis
    },
    "scan_feedback": {
        "scan_id": "scan_id INTEGER",
        "user_id": "user_id INTEGER",
        "original_disease_name": "original_disease_name VARCHAR(160)",
        "original_crop_label": "original_crop_label VARCHAR(120)",
        "original_confidence": "original_confidence FLOAT",
        "original_cause": "original_cause TEXT",
        "original_treatment": "original_treatment TEXT",
        "original_analysis_mode": "original_analysis_mode VARCHAR(120)",
        "original_status": "original_status VARCHAR(40)",
        "corrected_crop_label": "corrected_crop_label VARCHAR(120)",
        "corrected_disease_name": "corrected_disease_name VARCHAR(160)",
        "corrected_class_key": "corrected_class_key VARCHAR(160)",
        "user_note": "user_note TEXT",
        "verification_status": "verification_status VARCHAR(32) NOT NULL DEFAULT 'pending'",
        "verification_reason": "verification_reason TEXT",
        "feature_signature": "feature_signature JSON",
        "created_at": "created_at DATETIME",
    },
    "predictions": {
        "user_id": "user_id INTEGER",
        "crop_id": "crop_id INTEGER",
        "confidence": "confidence FLOAT",
        "created_at": "created_at DATETIME",
    },
    "crop_recommendation_feedback": {
        "prediction_id": "prediction_id INTEGER",
        "user_id": "user_id INTEGER",
        "crop_name": "crop_name VARCHAR(120)",
        "rating": "rating INTEGER",
        "planted": "planted BOOLEAN NOT NULL DEFAULT 0",
        "outcome": "outcome VARCHAR(40)",
        "notes": "notes TEXT",
        "created_at": "created_at DATETIME",
    },
    "marketplace": {
        "farm_id": "farm_id INTEGER",
        "harvest_date": "harvest_date DATE",
        "description": "description TEXT",
        "contact_phone": "contact_phone VARCHAR(32)",
        "status": "status VARCHAR(24) NOT NULL DEFAULT 'available'",
        "created_at": "created_at DATETIME",
    },
    "notifications": {
        "type": "type VARCHAR(60) NOT NULL DEFAULT 'system'",
        "is_read": "is_read BOOLEAN NOT NULL DEFAULT 0",
        "payload": "payload JSON",
        "created_at": "created_at DATETIME",
    },
    "audit_logs": {
        "actor_user_id": "actor_user_id INTEGER",
        "action": "action VARCHAR(120)",
        "resource_type": "resource_type VARCHAR(80)",
        "resource_id": "resource_id VARCHAR(80)",
        "ip_address": "ip_address VARCHAR(80)",
        "user_agent": "user_agent VARCHAR(500)",
        "metadata": "metadata JSON",
        "created_at": "created_at DATETIME",
    },
    "mfa_settings": {
        "user_id": "user_id INTEGER",
        "secret_encrypted": "secret_encrypted BLOB",
        "enabled": "enabled BOOLEAN NOT NULL DEFAULT 0",
        "verified_at": "verified_at DATETIME",
        "created_at": "created_at DATETIME",
    },
    "recovery_codes": {
        "user_id": "user_id INTEGER",
        "code_hash": "code_hash VARCHAR(255)",
        "used_at": "used_at DATETIME",
        "created_at": "created_at DATETIME",
    },
    "password_reset_otps": {
        "user_id": "user_id INTEGER",
        "otp_hash": "otp_hash VARCHAR(255)",
        "expires_at": "expires_at DATETIME",
        "attempts": "attempts INTEGER NOT NULL DEFAULT 0",
        "used_at": "used_at DATETIME",
        "created_at": "created_at DATETIME",
    },
    "refresh_tokens": {
        "user_id": "user_id INTEGER",
        "token_hash": "token_hash VARCHAR(255)",
        "device_name": "device_name VARCHAR(160)",
        "ip_address": "ip_address VARCHAR(80)",
        "user_agent": "user_agent VARCHAR(500)",
        "expires_at": "expires_at DATETIME",
        "revoked_at": "revoked_at DATETIME",
        "created_at": "created_at DATETIME",
    },
    "device_login_history": {
        "user_id": "user_id INTEGER",
        "ip_address": "ip_address VARCHAR(80)",
        "user_agent": "user_agent VARCHAR(500)",
        "device_name": "device_name VARCHAR(160)",
        "location_hint": "location_hint VARCHAR(160)",
        "success": "success BOOLEAN NOT NULL DEFAULT 0",
        "created_at": "created_at DATETIME",
    },
    "login_attempts": {
        "email": "email VARCHAR(255)",
        "ip_address": "ip_address VARCHAR(80)",
        "success": "success BOOLEAN NOT NULL DEFAULT 0",
        "created_at": "created_at DATETIME",
    },
    "push_subscriptions": {
        "user_id": "user_id INTEGER",
        "endpoint": "endpoint VARCHAR(700)",
        "subscription_keys": "subscription_keys JSON",
        "created_at": "created_at DATETIME",
    },
}


def is_sqlite_url(database_url: str) -> bool:
    return make_url(database_url).get_backend_name() == "sqlite"


def _ensure_sqlite_parent(database_url: str) -> None:
    url = make_url(database_url)
    database = url.database
    if not database or database == ":memory:" or database.startswith("file:"):
        return
    Path(database).expanduser().parent.mkdir(parents=True, exist_ok=True)


def create_app_engine(database_url: str):
    engine_options = {}
    if is_sqlite_url(database_url):
        _ensure_sqlite_parent(database_url)
        engine_options["connect_args"] = {"check_same_thread": False}
    else:
        engine_options.update(pool_pre_ping=True, pool_recycle=280)

    created_engine = create_async_engine(database_url, **engine_options)
    if is_sqlite_url(database_url):
        event.listen(created_engine.sync_engine, "connect", _enable_sqlite_foreign_keys)
    return created_engine


def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def _quote_sqlite_identifier(identifier: str) -> str:
    return f'"{identifier.replace("\"", "\"\"")}"'


async def _get_sqlite_columns(connection, table_name: str) -> set[str]:
    result = await connection.execute(text(f"PRAGMA table_info({_quote_sqlite_identifier(table_name)})"))
    return {row._mapping["name"] for row in result}


async def _add_missing_sqlite_columns(connection) -> None:
    for table_name, columns in SQLITE_COMPATIBILITY_COLUMNS.items():
        existing_columns = await _get_sqlite_columns(connection, table_name)
        if not existing_columns:
            continue

        quoted_table_name = _quote_sqlite_identifier(table_name)
        for column_name, column_definition in columns.items():
            if column_name in existing_columns:
                continue
            await connection.execute(text(f"ALTER TABLE {quoted_table_name} ADD COLUMN {column_definition}"))
            existing_columns.add(column_name)


async def _drop_legacy_sqlite_columns(connection) -> None:
    user_columns = await _get_sqlite_columns(connection, "users")
    if "captcha_required" in user_columns:
        await connection.execute(text("ALTER TABLE users DROP COLUMN captcha_required"))


async def run_schema_compatibility_migrations(connection) -> None:
    if connection.dialect.name != "sqlite":
        return

    await _drop_legacy_sqlite_columns(connection)
    await _add_missing_sqlite_columns(connection)


engine = create_app_engine(settings.database_url)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
