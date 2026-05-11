from __future__ import annotations

import json
import logging
import mimetypes
import shutil
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.engine import make_url

from app.core.config import get_settings

try:
    import firebase_admin
    from firebase_admin import credentials, storage
except ImportError:  # pragma: no cover - Firebase is optional in local-only installs.
    firebase_admin = None
    credentials = None
    storage = None

logger = logging.getLogger(__name__)
settings = get_settings()


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _service_account_path() -> Path | None:
    configured_path = _clean(settings.firebase_service_account_file)
    if not configured_path:
        return None
    path = Path(configured_path)
    if not path.is_absolute():
        path = settings.backend_path / path
    return path


def _firebase_admin_app():
    if firebase_admin is None or credentials is None:
        return None

    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    try:
        service_account_json = _clean(settings.firebase_service_account_json)
        if service_account_json:
            credential = credentials.Certificate(json.loads(service_account_json))
        else:
            service_account_path = _service_account_path()
            if service_account_path is None or not service_account_path.is_file():
                return None
            credential = credentials.Certificate(str(service_account_path))

        options = {}
        if settings.firebase_project_id:
            options["projectId"] = settings.firebase_project_id
        if settings.firebase_storage_bucket:
            options["storageBucket"] = settings.firebase_storage_bucket
        return firebase_admin.initialize_app(credential, options)
    except Exception as exc:
        logger.exception("Firebase Admin could not initialize for Storage.", exc_info=exc)
        return None


def firebase_storage_bucket():
    bucket_name = _clean(settings.firebase_storage_bucket)
    if storage is None or not bucket_name:
        return None
    app = _firebase_admin_app()
    if app is None:
        return None
    return storage.bucket(bucket_name, app=app)


def firebase_storage_enabled() -> bool:
    return firebase_storage_bucket() is not None


def _storage_prefix() -> str:
    return settings.firebase_storage_prefix.strip("/")


def _object_name(*parts: str) -> str:
    cleaned_parts = [part.strip("/") for part in parts if part and part.strip("/")]
    prefix = _storage_prefix()
    if prefix:
        cleaned_parts.insert(0, prefix)
    return "/".join(cleaned_parts)


def upload_object_name(filename: str) -> str:
    return _object_name("uploads", Path(filename).name)


def sqlite_backup_object_name(filename: str) -> str:
    return _object_name("backups", "sqlite", filename)


def upload_file_to_firebase(local_path: Path, object_name: str, content_type: str | None = None) -> str | None:
    bucket = firebase_storage_bucket()
    if bucket is None:
        return None

    local_path = Path(local_path)
    if not local_path.is_file():
        return None

    guessed_type = content_type or mimetypes.guess_type(local_path.name)[0]
    blob = bucket.blob(object_name)
    blob.upload_from_filename(str(local_path), content_type=guessed_type)
    logger.info("Uploaded %s to Firebase Storage as %s.", local_path, object_name)
    return object_name


def download_file_from_firebase(object_name: str, local_path: Path) -> Path | None:
    bucket = firebase_storage_bucket()
    if bucket is None:
        return None

    blob = bucket.blob(object_name)
    if not blob.exists():
        return None

    local_path = Path(local_path)
    local_path.parent.mkdir(parents=True, exist_ok=True)
    blob.download_to_filename(str(local_path))
    logger.info("Downloaded %s from Firebase Storage to %s.", object_name, local_path)
    return local_path


def firebase_object_exists(object_name: str) -> bool:
    bucket = firebase_storage_bucket()
    return bool(bucket is not None and bucket.blob(object_name).exists())


def mirror_upload_to_firebase(local_path: Path, content_type: str | None = None) -> str | None:
    if not settings.firebase_mirror_uploads:
        return None
    return upload_file_to_firebase(local_path, upload_object_name(local_path.name), content_type=content_type)


def restore_upload_from_firebase(filename: str) -> Path | None:
    image_name = Path(filename.replace("\\", "/")).name
    if not image_name:
        return None
    return download_file_from_firebase(upload_object_name(image_name), settings.upload_path / image_name)


def upload_exists_in_firebase(filename: str) -> bool:
    image_name = Path(filename.replace("\\", "/")).name
    return bool(image_name and firebase_object_exists(upload_object_name(image_name)))


def sqlite_database_path() -> Path:
    url = make_url(settings.database_url)
    if url.get_backend_name() != "sqlite":
        raise RuntimeError("Firebase SQLite backup only supports SQLite DATABASE_URL values.")
    database = url.database
    if not database or database == ":memory:" or database.startswith("file:"):
        raise RuntimeError("Firebase SQLite backup requires a filesystem SQLite database.")

    path = Path(database)
    if not path.is_absolute():
        path = settings.backend_path / path
    return path


def _copy_sqlite_database(source_path: Path, backup_path: Path) -> None:
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    source = sqlite3.connect(str(source_path))
    try:
        destination = sqlite3.connect(str(backup_path))
        try:
            source.backup(destination)
        finally:
            destination.close()
    finally:
        source.close()


def backup_sqlite_database(database_path: Path | None = None) -> list[str]:
    database_path = database_path or sqlite_database_path()
    if not database_path.is_file():
        raise FileNotFoundError(f"SQLite database not found: {database_path}")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    latest_name = sqlite_backup_object_name("agriscan-latest.sqlite3")
    timestamped_name = sqlite_backup_object_name(f"agriscan-{timestamp}.sqlite3")

    with tempfile.TemporaryDirectory(prefix="agriscan-db-backup-") as temp_dir:
        temp_backup = Path(temp_dir) / "agriscan.sqlite3"
        _copy_sqlite_database(database_path, temp_backup)
        uploaded = [
            upload_file_to_firebase(temp_backup, latest_name, content_type="application/x-sqlite3"),
            upload_file_to_firebase(temp_backup, timestamped_name, content_type="application/x-sqlite3"),
        ]

    return [name for name in uploaded if name]


def restore_sqlite_database(database_path: Path | None = None, object_name: str | None = None) -> Path:
    database_path = database_path or sqlite_database_path()
    object_name = object_name or sqlite_backup_object_name("agriscan-latest.sqlite3")

    with tempfile.TemporaryDirectory(prefix="agriscan-db-restore-") as temp_dir:
        temp_restore = Path(temp_dir) / "agriscan.sqlite3"
        restored = download_file_from_firebase(object_name, temp_restore)
        if restored is None:
            raise FileNotFoundError(f"Firebase Storage backup not found: {object_name}")

        database_path.parent.mkdir(parents=True, exist_ok=True)
        if database_path.exists():
            safety_copy = database_path.with_suffix(database_path.suffix + ".pre-firebase-restore")
            shutil.copy2(database_path, safety_copy)
        shutil.copy2(temp_restore, database_path)

    return database_path


def backup_uploads() -> list[str]:
    upload_dir = settings.upload_path
    if not upload_dir.is_dir():
        return []

    uploaded: list[str] = []
    for file_path in upload_dir.rglob("*"):
        if not file_path.is_file():
            continue
        relative_path = file_path.relative_to(upload_dir).as_posix()
        object_name = _object_name("uploads", relative_path)
        uploaded_name = upload_file_to_firebase(file_path, object_name)
        if uploaded_name:
            uploaded.append(uploaded_name)
    return uploaded


def restore_uploads() -> list[Path]:
    bucket = firebase_storage_bucket()
    if bucket is None:
        return []

    upload_prefix = _object_name("uploads") + "/"
    restored: list[Path] = []
    for blob in bucket.list_blobs(prefix=upload_prefix):
        if blob.name.endswith("/"):
            continue
        relative_name = blob.name.removeprefix(upload_prefix)
        if not relative_name:
            continue
        local_path = settings.upload_path / relative_name
        local_path.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(str(local_path))
        restored.append(local_path)
    return restored
