import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import func, insert, select
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.database import Base, create_app_engine
from app.models import (
    AuditLog,
    Crop,
    DeviceLoginHistory,
    Farm,
    LoginAttempt,
    MFASetting,
    MarketplaceItem,
    Notification,
    PasswordResetOTP,
    Prediction,
    PushSubscription,
    RecoveryCode,
    RefreshToken,
    Role,
    Scan,
    User,
)


TABLES_IN_COPY_ORDER = [
    Role.__table__,
    User.__table__,
    Farm.__table__,
    Crop.__table__,
    Scan.__table__,
    Prediction.__table__,
    MarketplaceItem.__table__,
    Notification.__table__,
    AuditLog.__table__,
    MFASetting.__table__,
    RecoveryCode.__table__,
    PasswordResetOTP.__table__,
    RefreshToken.__table__,
    DeviceLoginHistory.__table__,
    LoginAttempt.__table__,
    PushSubscription.__table__,
]


def _redact_url(database_url: str) -> str:
    url = make_url(database_url)
    if url.password is None:
        return str(url)
    return str(url.set(password="***"))


async def _existing_table_count(connection) -> tuple[str, int] | None:
    for table in TABLES_IN_COPY_ORDER:
        count = await connection.scalar(select(func.count()).select_from(table))
        if count:
            return table.name, int(count)
    return None


async def migrate(source_url: str, destination_url: str, replace: bool) -> None:
    source_backend = make_url(source_url).get_backend_name()
    destination_backend = make_url(destination_url).get_backend_name()
    if source_backend == "sqlite":
        raise SystemExit("Source database must be MySQL. Use --source-url or MYSQL_DATABASE_URL for the old MySQL database.")
    if destination_backend != "sqlite":
        raise SystemExit("Destination database must be SQLite. Use --destination-url for the new SQLite database file.")
    if source_url == destination_url:
        raise SystemExit("Source and destination database URLs must be different.")

    source_engine = create_app_engine(source_url)
    destination_engine = create_app_engine(destination_url)
    copied_counts: dict[str, int] = {}

    try:
        async with source_engine.connect() as source:
            await source.scalar(select(func.count()).select_from(Role.__table__))
            async with destination_engine.begin() as destination:
                if replace:
                    await destination.run_sync(Base.metadata.drop_all)
                await destination.run_sync(Base.metadata.create_all)
                if not replace:
                    existing = await _existing_table_count(destination)
                    if existing is not None:
                        table_name, count = existing
                        raise SystemExit(
                            f"SQLite destination already has {count} row(s) in {table_name}. "
                            "Run again with --replace to rebuild it from MySQL."
                        )

                for table in TABLES_IN_COPY_ORDER:
                    result = await source.execute(select(table))
                    rows = [dict(row._mapping) for row in result]
                    if rows:
                        await destination.execute(insert(table), rows)
                    copied_counts[table.name] = len(rows)
    except OperationalError as exc:
        raise SystemExit(
            "Could not connect to the MySQL source database. Start MySQL or pass the correct --source-url, then run the migration again."
        ) from exc
    finally:
        await source_engine.dispose()
        await destination_engine.dispose()

    print("Migrated MySQL data to SQLite successfully.")
    print("Source:", _redact_url(source_url))
    print("Destination:", destination_url)
    for table_name, count in copied_counts.items():
        print(f"  - {table_name}: {count}")


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Copy all AgriScan rows from MySQL into the local SQLite database.")
    parser.add_argument(
        "--source-url",
        default=settings.mysql_database_url,
        help="Old MySQL SQLAlchemy URL. Defaults to MYSQL_DATABASE_URL from backend/.env.",
    )
    parser.add_argument(
        "--destination-url",
        default=settings.database_url,
        help="New SQLite SQLAlchemy URL. Defaults to DATABASE_URL from backend/.env.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Drop and recreate the SQLite tables before copying data.",
    )
    args = parser.parse_args()

    if not args.source_url:
        raise SystemExit(
            "Missing MySQL source URL. Add MYSQL_DATABASE_URL to backend/.env or pass --source-url."
        )

    asyncio.run(migrate(args.source_url, args.destination_url, args.replace))


if __name__ == "__main__":
    main()
