from functools import lru_cache
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
try:
    from pydantic_settings.env_settings import EnvSettingsSource
except ImportError:
    from pydantic_settings.sources import EnvSettingsSource


class _LenientEnvSource(EnvSettingsSource):
    """Env source that falls back to raw string on JSON decode failure.

    pydantic_settings auto-JSON-decodes list-typed fields, which breaks
    when CORS_ORIGINS is supplied as a comma-separated string or a single
    origin.  Returning the raw string here lets the field_validator handle
    all accepted formats.
    """

    def prepare_field_value(self, field_name: str, field: Any, value: Any, value_is_complex: bool) -> Any:
        try:
            return super().prepare_field_value(field_name, field, value, value_is_complex)
        except Exception:
            return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[".env", "../.env"],
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @classmethod
    def settings_customise_sources(cls, settings_cls, **kwargs):  # type: ignore[override]
        sources = super().settings_customise_sources(settings_cls, **kwargs)
        # Replace the default EnvSettingsSource with our lenient subclass.
        return tuple(
            _LenientEnvSource(settings_cls) if isinstance(s, EnvSettingsSource) else s
            for s in sources
        )

    admin_telegram_id: int | None = None
    max_folder_depth: int = 10
    database_url: str = ""
    postgres_user: str = ""
    postgres_password: str = ""
    postgres_db: str = ""
    telegram_api_id: int
    telegram_api_hash: str
    jwt_secret: str
    refresh_token_ttl_days: int = 90
    max_icon_size_bytes: int = 512000
    icons_dir: str = "./static/icons"
    encryption_key: str
    cors_origins: list[str]
    debug_ui: bool = False
    api_port: int = 8000
    upload_chunk_size: int = 2 * 1024 * 1024  # 2 MB — at 20 KB/s this still completes in ~100s, well within Cloudflare's timeout
    upload_max_parallel_chunks: int = 2  # keep server pressure low; more parallelism caused 524s under load
    parallel_upload_connections: int = Field(default=8, ge=1)
    # Controls concurrent MTProto sender connections per split when uploading to Telegram.
    # Reads from PARALLEL_UPLOAD_CONNECTIONS env var.

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> Any:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                import json
                try:
                    return json.loads(v)
                except json.JSONDecodeError:
                    v = v[1:-1] if v.endswith("]") else v[1:]
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("icons_dir", mode="after")
    @classmethod
    def resolve_icons_dir(cls, v: str) -> str:
        p = Path(v)
        if not p.is_absolute():
            p = Path.cwd() / p
        return str(p)

    @model_validator(mode="after")
    def build_database_url(self) -> "Settings":
        if not self.database_url:
            if not (self.postgres_user and self.postgres_password and self.postgres_db):
                raise ValueError(
                    "Either DATABASE_URL or all three of POSTGRES_USER, "
                    "POSTGRES_PASSWORD, and POSTGRES_DB must be set."
                )
            self.database_url = (
                f"postgresql+asyncpg://{self.postgres_user}:"
                f"{self.postgres_password}@127.0.0.1:5432/{self.postgres_db}"
            )
        return self

    @model_validator(mode="after")
    def validate_encryption_key(self) -> "Settings":
        try:
            Fernet(self.encryption_key.encode())
        except Exception as exc:
            raise ValueError(
                f"encryption_key is not a valid Fernet key: {exc}"
            ) from exc
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
