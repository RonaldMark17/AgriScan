import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal, engine
from app.core.security import get_password_hash, validate_strong_password
from app.models import Role, User


async def create_admin(full_name: str, email: str, password: str, phone: str | None) -> None:
    try:
        normalized_email = str(TypeAdapter(EmailStr).validate_python(email)).lower()
    except ValidationError as exc:
        raise SystemExit(f"Invalid admin email: {exc.errors()[0]['msg']}") from exc

    errors = validate_strong_password(password)
    if errors:
        raise SystemExit(" ".join(errors))

    async with AsyncSessionLocal() as db:
        role_result = await db.execute(select(Role).where(Role.name == "admin"))
        admin_role = role_result.scalar_one_or_none()
        if admin_role is None:
            admin_role = Role(name="admin", description="System administrator", requires_mfa=True)
            db.add(admin_role)
            await db.flush()

        existing_result = await db.execute(select(User).options(selectinload(User.role)).where(User.email == normalized_email))
        existing = existing_result.scalar_one_or_none()
        if existing:
            existing.full_name = full_name
            existing.phone = phone
            existing.hashed_password = get_password_hash(password)
            existing.role_id = admin_role.id
            existing.is_active = True
            existing.is_verified = True
            action = "Updated"
        else:
            db.add(
                User(
                    full_name=full_name,
                    email=normalized_email,
                    phone=phone,
                    hashed_password=get_password_hash(password),
                    role_id=admin_role.id,
                    is_active=True,
                    is_verified=True,
                )
            )
            action = "Created"
        await db.commit()
    print(f"{action} admin account for {normalized_email}. MFA setup will be required at first login.")
    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or update the first AgriScan admin account.")
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--phone")
    args = parser.parse_args()
    asyncio.run(create_admin(args.name, args.email, args.password, args.phone))


if __name__ == "__main__":
    main()
