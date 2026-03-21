"""Channel membership management for alt accounts.

When an alt account is added, it is enrolled as co-admin in all the user's
TeleVault-registered channels. When removed, it is unenrolled.

All operations use the channel's owning client (the account that created the
channel) because that account is guaranteed to be an admin. Fallback: any
other active client for the user.

`enrollment_failures` is a transient in-memory list returned in API responses.
Nothing is persisted to the database for failures.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.functions.channels import EditAdminRequest
from telethon.tl.types import ChatAdminRights

from app.db.models.channel import Channel

if TYPE_CHECKING:
    from app.telegram.client_pool import ClientPool

logger = logging.getLogger(__name__)

# Permissions granted to alt accounts as co-admins
_ALT_ADMIN_RIGHTS = ChatAdminRights(
    post_messages=True,
    edit_messages=True,
    delete_messages=True,
    invite_users=True,
    change_info=False,
)

# No permissions (used to remove admin)
_NO_ADMIN_RIGHTS = ChatAdminRights(
    post_messages=False,
    edit_messages=False,
    delete_messages=False,
    invite_users=False,
    change_info=False,
)


def _get_client_for_channel(pool: "ClientPool", channel: Channel, owner_telegram_id: int):
    """Return the best client to perform admin ops on this channel.

    Preference order:
    1. The channel's owning account (guaranteed admin).
    2. Any other active account for the user (fallback).
    Returns None if no active client is available.
    """
    client = pool.get_client(channel.telegram_account_id)
    if client is not None and client.is_connected():
        return client
    # Fallback: any active client for this user
    clients = pool.get_all_clients_for_user(owner_telegram_id)
    if clients:
        return clients[0][1]
    return None


async def enroll_account_in_all_channels(
    pool: "ClientPool",
    alt_telegram_id: int,
    db_session: AsyncSession,
    owner_telegram_id: int,
) -> list[dict]:
    """Add alt_telegram_id as co-admin to all TeleVault channels owned by owner_telegram_id.

    Returns a list of {channel_id, error} for any channels where enrollment failed.
    """
    result = await db_session.execute(
        select(Channel).where(Channel.added_by == owner_telegram_id)
    )
    channels: list[Channel] = list(result.scalars().all())
    failures: list[dict] = []

    for channel in channels:
        client = _get_client_for_channel(pool, channel, owner_telegram_id)
        if client is None:
            failures.append({"channel_id": str(channel.id), "error": "No active Telegram client available"})
            continue
        try:
            await client(EditAdminRequest(
                channel=channel.channel_id,
                user_id=alt_telegram_id,
                admin_rights=_ALT_ADMIN_RIGHTS,
                rank="",
            ))
            logger.info("Enrolled account %d as admin in channel %d", alt_telegram_id, channel.channel_id)
        except Exception as exc:
            logger.warning("Failed to enroll account %d in channel %d: %s", alt_telegram_id, channel.channel_id, exc)
            failures.append({"channel_id": str(channel.id), "error": str(exc)})

    return failures


async def enroll_all_accounts_in_channel(
    pool: "ClientPool",
    channel: Channel,
    db_session: AsyncSession,
    owner_telegram_id: int,
) -> list[dict]:
    """Add all existing active alt accounts as co-admins in a newly created channel.

    Called from the channel creation endpoint.
    Returns enrollment_failures.
    """
    from app.db.models.telegram_account import TelegramAccount

    result = await db_session.execute(
        select(TelegramAccount).where(
            TelegramAccount.owner_telegram_id == owner_telegram_id,
            TelegramAccount.is_active.is_(True),
            TelegramAccount.is_primary.is_(False),
        )
    )
    alt_accounts = list(result.scalars().all())
    failures: list[dict] = []

    client = _get_client_for_channel(pool, channel, owner_telegram_id)
    if client is None:
        return [{"channel_id": str(channel.id), "error": "No active Telegram client available for owner"}]

    for ta in alt_accounts:
        try:
            await client(EditAdminRequest(
                channel=channel.channel_id,
                user_id=ta.telegram_id,
                admin_rights=_ALT_ADMIN_RIGHTS,
                rank="",
            ))
            logger.info("Enrolled alt account %d in new channel %d", ta.telegram_id, channel.channel_id)
        except Exception as exc:
            logger.warning("Failed to enroll alt account %d in channel %d: %s", ta.telegram_id, channel.channel_id, exc)
            failures.append({"channel_id": str(channel.id), "error": str(exc)})

    return failures


async def remove_account_from_all_channels(
    pool: "ClientPool",
    alt_telegram_id: int,
    db_session: AsyncSession,
    owner_telegram_id: int,
) -> list[dict]:
    """Remove alt_telegram_id's admin rights from all TeleVault channels.

    Failures are logged but do NOT block the account removal operation.
    Returns failure list for logging purposes (not returned to caller on DELETE).
    """
    result = await db_session.execute(
        select(Channel).where(Channel.added_by == owner_telegram_id)
    )
    channels: list[Channel] = list(result.scalars().all())
    failures: list[dict] = []

    for channel in channels:
        client = _get_client_for_channel(pool, channel, owner_telegram_id)
        if client is None:
            failures.append({"channel_id": str(channel.id), "error": "No active client"})
            continue
        try:
            await client(EditAdminRequest(
                channel=channel.channel_id,
                user_id=alt_telegram_id,
                admin_rights=_NO_ADMIN_RIGHTS,
                rank="",
            ))
            logger.info("Unenrolled account %d from channel %d", alt_telegram_id, channel.channel_id)
        except Exception as exc:
            logger.warning("Failed to unenroll account %d from channel %d: %s", alt_telegram_id, channel.channel_id, exc)
            failures.append({"channel_id": str(channel.id), "error": str(exc)})

    return failures
