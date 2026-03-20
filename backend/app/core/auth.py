import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import get_settings


class AuthError(Exception):
    """Base exception for all auth failures."""


def create_access_token(
    telegram_id: int,
    role: str,
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=30))
    payload = {
        "sub": str(telegram_id),
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Token has expired") from exc
    except jwt.PyJWTError as exc:
        raise AuthError("Invalid token") from exc


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def verify_token_hash(raw: str, hashed: str) -> bool:
    return hmac.compare_digest(hash_token(raw), hashed)
