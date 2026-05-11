from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.firebase_storage import (
    backup_sqlite_database,
    backup_uploads,
    firebase_storage_enabled,
    restore_sqlite_database,
    restore_uploads,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Back up or restore AgriScan SQLite/uploads with Firebase Storage.")
    parser.add_argument(
        "command",
        choices=("backup-db", "restore-db", "backup-uploads", "restore-uploads", "backup-all", "restore-all"),
    )
    parser.add_argument(
        "--db-object",
        help="Firebase Storage object to restore for restore-db. Defaults to the latest SQLite backup.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if not firebase_storage_enabled():
        print("Firebase Storage is not configured. Check FIREBASE_STORAGE_BUCKET and service account settings.", file=sys.stderr)
        return 2

    if args.command in {"backup-db", "backup-all"}:
        uploaded = backup_sqlite_database()
        print("SQLite backup uploaded:")
        for object_name in uploaded:
            print(f"  - {object_name}")

    if args.command in {"backup-uploads", "backup-all"}:
        uploaded = backup_uploads()
        print(f"Uploaded {len(uploaded)} upload file(s) to Firebase Storage.")

    if args.command in {"restore-db", "restore-all"}:
        restored_path = restore_sqlite_database(object_name=args.db_object)
        print(f"SQLite database restored to {restored_path}")

    if args.command in {"restore-uploads", "restore-all"}:
        restored = restore_uploads()
        print(f"Restored {len(restored)} upload file(s) from Firebase Storage.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
