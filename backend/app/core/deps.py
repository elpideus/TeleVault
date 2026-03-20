from fastapi import Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import AuthError, decode_access_token
from app.core.config import get_settings  # noqa: F401 — re-exported
from app.db.models.user import User
from app.db.session import get_db  # noqa: F401 — re-exported
from app.telegram import client_pool as _client_pool_instance
from app.telegram.client_pool import ClientPool

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/token", auto_error=False
)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_db),
    query_token: str | None = Query(None, alias="token"),
) -> User:
    # Fallback to query param if header is missing (useful for direct downloads)
    auth_token = token or query_token
    
    if auth_token is None:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(auth_token)
    except AuthError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    telegram_id = int(payload["sub"])
    user = await session.get(User, telegram_id)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_client_pool() -> ClientPool:
    return _client_pool_instance


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
