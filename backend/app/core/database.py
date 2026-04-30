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
        "status": "status VARCHAR(40) NOT NULL DEFAULT 'detected'",
        "created_at": "created_at DATETIME",
    },
    "predictions": {
        "crop_id": "crop_id INTEGER",
        "confidence": "confidence FLOAT",
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
        "resource_type": "resource_type VARCHAR(80)",
        "resource_id": "resource_id VARCHAR(80)",
        "ip_address": "ip_address VARCHAR(80)",
        "user_agent": "user_agent VARCHAR(500)",
        "metadata": "metadata JSON",
        "created_at": "created_at DATETIME",
    },
    "mfa_settings": {
        "secret_encrypted": "secret_encrypted BLOB",
        "enabled": "enabled BOOLEAN NOT NULL DEFAULT 0",
        "verified_at": "verified_at DATETIME",
        "created_at": "created_at DATETIME",
    },
    "recovery_codes": {
        "used_at": "used_at DATETIME",
        "created_at": "created_at DATETIME",
    },
    "password_reset_otps": {
        "attempts": "attempts INTEGER NOT NULL DEFAULT 0",
        "used_at": "used_at DATETIME",
        "created_at": "created_at DATETIME",
    },
    "refresh_tokens": {
        "device_name": "device_name VARCHAR(160)",
        "ip_address": "ip_address VARCHAR(80)",
        "user_agent": "user_agent VARCHAR(500)",
        "expires_at": "expires_at DATETIME",
        "revoked_at": "revoked_at DATETIME",
        "created_at": "created_at DATETIME",
    },
    "device_login_history": {
        "ip_address": "ip_address VARCHAR(80)",
        "user_agent": "user_agent VARCHAR(500)",
        "device_name": "device_name VARCHAR(160)",
        "location_hint": "location_hint VARCHAR(160)",
        "success": "success BOOLEAN NOT NULL DEFAULT 0",
        "created_at": "created_at DATETIME",
    },
    "login_attempts": {
        "ip_address": "ip_address VARCHAR(80)",
        "success": "success BOOLEAN NOT NULL DEFAULT 0",
        "created_at": "created_at DATETIME",
    },
    "push_subscriptions": {
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
