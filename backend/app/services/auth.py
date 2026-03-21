from __future__ import annotations

import logging
import pathlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

import dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import hash_token
from app.core.config import get_settings
from app.core.encryption import encrypt_string
from app.core.utils import generate_vault_hash
from app.db.models.refresh_token import RefreshToken
from app.db.models.telegram_account import TelegramAccount
from app.db.models.user import User

if TYPE_CHECKING:
    from telethon import TelegramClient
    from app.telegram.client_pool import ClientPool

logger = logging.getLogger(__name__)

_ENV_PATH = pathlib.Path(__file__).parent.parent.parent / ".env"


async def _unique_vault_hash(session: AsyncSession) -> str:
    """Generate a vault_hash that does not already exist in the DB."""
    from sqlalchemy import select as sa_select
    for _ in range(10):
        candidate = generate_vault_hash()
        existing = await session.execute(
            sa_select(User.vault_hash).where(User.vault_hash == candidate)
        )
        if existing.scalar_one_or_none() is None:
            return candidate
    raise RuntimeError("Failed to generate a unique vault_hash after 10 attempts")


async def upsert_user(session: AsyncSession, me: "TelegramClient") -> User:
    user = await session.get(User, me.id)
    if user is None:
        user = User(
            telegram_id=me.id,
            telegram_username=me.username,
            telegram_first_name=me.first_name,
            telegram_last_name=getattr(me, "last_name", None),
            role="user",
            vault_hash=await _unique_vault_hash(session),
        )
        session.add(user)
    else:
        user.telegram_username = me.username
        user.telegram_first_name = me.first_name
        user.telegram_last_name = getattr(me, "last_name", None)
        # Backfill vault_hash for existing users that pre-date this column
        if user.vault_hash is None:
            user.vault_hash = await _unique_vault_hash(session)
    await session.flush()
    return user


async def store_telegram_account(
    session: AsyncSession,
    pool: "ClientPool",
    owner_telegram_id: int,
    account: "TelegramClient",
    is_primary: bool = False,
    add_to_pool: bool = True,
) -> tuple["TelegramAccount", str]:
    settings = get_settings()
    session_string = account.session.save()
    encrypted = encrypt_string(session_string, settings.encryption_key)

    me = await account.get_me()

    stmt = select(TelegramAccount).where(
        TelegramAccount.owner_telegram_id == owner_telegram_id,
        TelegramAccount.telegram_id == me.id,
    )
    result = await session.execute(stmt)
    ta = result.scalar_one_or_none()

    if ta is None:
        ta = TelegramAccount(
            owner_telegram_id=owner_telegram_id,
            telegram_id=me.id,
            session_string=encrypted,
            label=me.first_name,
            is_active=True,
            is_primary=is_primary,
        )
        session.add(ta)
    else:
        ta.session_string = encrypted
        ta.is_active = True
        # Do NOT overwrite is_primary — set once at creation
    await session.flush()

    if add_to_pool:
        await pool.add_client(ta.id, session_string, owner_telegram_id)
    return ta, session_string


async def create_refresh_token(
    session: AsyncSession, user_telegram_id: int, ttl_days: int | None = None
) -> str:
    settings = get_settings()
    ttl = ttl_days or settings.refresh_token_ttl_days
    raw = secrets.token_urlsafe(48)
    hashed = hash_token(raw)
    rt = RefreshToken(
        user_telegram_id=user_telegram_id,
        token_hash=hashed,
        expires_at=(datetime.now(timezone.utc) + timedelta(days=ttl)).replace(tzinfo=None),
    )
    session.add(rt)
    await session.flush()
    return raw


async def revoke_refresh_token(session: AsyncSession, raw_token: str) -> None:
    hashed = hash_token(raw_token)
    stmt = select(RefreshToken).where(RefreshToken.token_hash == hashed)
    result = await session.execute(stmt)
    token = result.scalar_one_or_none()
    if token is not None:
        token.revoked = True
        token.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
        await session.flush()


async def admin_auto_set(
    session: AsyncSession, settings, telegram_id: int
) -> None:
    if settings.admin_telegram_id is not None:
        return

    user = await session.get(User, telegram_id)
    if user is None:
        return

    user.role = "admin"
    await session.flush()

    dotenv.set_key(str(_ENV_PATH), "ADMIN_TELEGRAM_ID", str(telegram_id))
    get_settings.cache_clear()
    logger.info("Auto-set admin to telegram_id=%d", telegram_id)
