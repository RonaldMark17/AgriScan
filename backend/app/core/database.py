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


async def run_schema_compatibility_migrations(connection) -> None:
    if connection.dialect.name != "sqlite":
        return

    result = await connection.execute(text("PRAGMA table_info(users)"))
    user_columns = {row._mapping["name"] for row in result}
    if "captcha_required" in user_columns:
        await connection.execute(text("ALTER TABLE users DROP COLUMN captcha_required"))


engine = create_app_engine(settings.database_url)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
