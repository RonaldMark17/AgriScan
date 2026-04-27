from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AgriScan API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    frontend_origin: str = "http://localhost:5173"
    allowed_hosts: str = "localhost,127.0.0.1"

    database_url: str = "mysql+aiomysql://agriscan:@localhost:3306/agriscanproject"
    auto_create_tables: bool = False

    secret_key: str = Field(default="change-this-access-secret")
    refresh_secret_key: str = Field(default="change-this-refresh-secret")
    fernet_key: str | None = None
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 14
    session_timeout_minutes: int = 30
    use_secure_cookies: bool = False

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "noreply@agriscanproject.com"

    weather_api_key: str | None = None
    weather_api_base_url: str = "https://api.openweathermap.org/data/2.5"
    google_maps_api_key: str | None = None
    sms_api_key: str | None = None
    ocr_api_key: str | None = None
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None

    upload_dir: str = "uploads"
    model_path: str = "app/ml/artifacts/crop_disease_model"
    require_admin_mfa: bool = True

    @property
    def cors_origins(self) -> List[str]:
        origins = {self.frontend_origin, "http://localhost:5173", "http://127.0.0.1:5173"}
        return [origin.strip() for origin in origins if origin.strip()]

    @property
    def allowed_host_list(self) -> List[str]:
        hosts = [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]
        if self.environment != "production":
            hosts.extend(["localhost", "127.0.0.1", "*.localhost"])
        return sorted(set(hosts))


@lru_cache
def get_settings() -> Settings:
    return Settings()
