from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from telethon import TelegramClient
from telethon.sessions import StringSession

from app.core.config import get_settings
from app.core.encryption import decrypt_string
from app.db.models.telegram_account import TelegramAccount

logger = logging.getLogger(__name__)


@dataclass
class PendingPhoneLogin:
    phone: str
    phone_code_hash: str
    client: Any  # TelegramClient


@dataclass
class PendingQRLogin:
    client: Any  # TelegramClient
    qr_login: object
    task: asyncio.Task


class ClientPool:
    def __init__(self) -> None:
        self._clients: dict[uuid.UUID, TelegramClient] = {}
        self._owners: dict[uuid.UUID, int] = {}  # account_id -> owner_telegram_id
        self._pending_phone: dict[str, PendingPhoneLogin] = {}
        self._pending_qr: dict[str, PendingQRLogin] = {}
        self._rr_index: dict[int, int] = {}  # owner_telegram_id → next index

    async def initialize(self, session: AsyncSession) -> None:
        settings = get_settings()
        stmt = select(TelegramAccount).where(TelegramAccount.is_active.is_(True))
        result = await session.execute(stmt)
        accounts = result.scalars().all()

        for account in accounts:
            try:
                session_string = decrypt_string(
                    account.session_string, settings.encryption_key
                )
                client = TelegramClient(
                    StringSession(session_string),
                    settings.telegram_api_id,
                    settings.telegram_api_hash,
                    flood_sleep_threshold=60,
                )
                await client.connect()
                self._clients[account.id] = client
                self._owners[account.id] = account.owner_telegram_id
                logger.info("Connected Telegram account %s", account.id)
            except Exception:
                logger.exception(
                    "Failed to connect Telegram account %s", account.id
                )

        logger.info(
            "ClientPool initialized: %d/%d accounts connected",
            len(self._clients),
            len(accounts),
        )

    async def shutdown(self) -> None:
        for account_id, client in self._clients.items():
            try:
                await client.disconnect()
                logger.info("Disconnected Telegram account %s", account_id)
            except Exception:
                logger.exception(
                    "Error disconnecting Telegram account %s", account_id
                )
        self._clients.clear()
        self._owners.clear()
        self._pending_phone.clear()
        self._pending_qr.clear()
        logger.info("ClientPool shut down")

    def get_client(self, account_id: uuid.UUID) -> TelegramClient | None:
        return self._clients.get(account_id)

    def get_client_for_user(self, owner_telegram_id: int) -> TelegramClient:
        for account_id, owner_id in self._owners.items():
            if owner_id == owner_telegram_id and account_id in self._clients:
                return self._clients[account_id]
        raise RuntimeError("No active Telegram client for user")

    async def add_client(
        self, account_id: uuid.UUID, session_string: str, owner_telegram_id: int = 0
    ) -> TelegramClient:
        settings = get_settings()
        client = TelegramClient(
            StringSession(session_string),
            settings.telegram_api_id,
            settings.telegram_api_hash,
        )
        await client.connect()
        self._clients[account_id] = client
        if owner_telegram_id:
            self._owners[account_id] = owner_telegram_id
        logger.info("Added Telegram account %s to pool", account_id)
        return client

    def get_all_clients_for_user(
        self, owner_telegram_id: int
    ) -> list[tuple[uuid.UUID, "TelegramClient"]]:
        """Return all active (account_id, client) pairs for a user.

        Used by execute_upload to build a snapshot at upload start.
        """
        return [
            (account_id, self._clients[account_id])
            for account_id, owner_id in self._owners.items()
            if owner_id == owner_telegram_id and account_id in self._clients
        ]

    def get_next_client_round_robin(
        self, owner_telegram_id: int
    ) -> tuple[uuid.UUID, "TelegramClient"]:
        """Return the next client in round-robin order for non-upload callers.

        Safe in single-process asyncio: the increment is one synchronous statement
        with no await between read and write.
        """
        clients = self.get_all_clients_for_user(owner_telegram_id)
        if not clients:
            raise RuntimeError("No active Telegram client for user")
        idx = self._rr_index.get(owner_telegram_id, 0)
        self._rr_index[owner_telegram_id] = idx + 1  # ever-increasing; modulo applied at read
        return clients[idx % len(clients)]

    async def start_health_check_loop(self, session_factory) -> None:
        """Run every 30 minutes. Re-connects dropped clients, marks revoked sessions inactive."""
        from telethon.errors import (
            AuthKeyUnregisteredError,
            AuthKeyDuplicatedError,
            UserDeactivatedError,
            UserDeactivatedBanError,
        )

        _AUTH_ERRORS = (
            AuthKeyUnregisteredError,
            AuthKeyDuplicatedError,
            UserDeactivatedError,
            UserDeactivatedBanError,
        )

        while True:
            await asyncio.sleep(30 * 60)  # 30 minutes
            logger.info("Running Telegram account health check (%d clients)", len(self._clients))

            settings = get_settings()
            # Snapshot to avoid mutation during iteration
            account_ids = list(self._clients.keys())

            for account_id in account_ids:
                client = self._clients.get(account_id)
                if client is None:
                    continue

                # 1. Reconnect if TCP connection dropped
                if not client.is_connected():
                    logger.info("Account %s disconnected — reconnecting", account_id)
                    try:
                        await client.connect()
                    except Exception:
                        logger.exception("Reconnect failed for account %s", account_id)
                        continue

                # 2. Verify session is still valid
                try:
                    await client.get_me()

                    async with session_factory() as db:
                        ta = await db.get(TelegramAccount, account_id)
                        if ta is not None:
                            from datetime import datetime
                            ta.last_checked_at = datetime.utcnow()
                            ta.session_error = None
                            await db.commit()

                except _AUTH_ERRORS as exc:
                    logger.warning("Account %s session revoked: %s", account_id, exc)
                    async with session_factory() as db:
                        ta = await db.get(TelegramAccount, account_id)
                        if ta is not None:
                            ta.is_active = False
                            ta.session_error = str(exc)
                            await db.commit()
                    self._clients.pop(account_id, None)
                    self._owners.pop(account_id, None)
                    try:
                        await client.disconnect()
                    except Exception:
                        pass

                except Exception:
                    # Network error, flood wait, etc. — skip, retry next cycle
                    logger.warning("Health check ping failed for account %s (will retry)", account_id, exc_info=True)

    async def remove_client(self, account_id: uuid.UUID) -> None:
        client = self._clients.pop(account_id, None)
        self._owners.pop(account_id, None)
        if client is not None:
            await client.disconnect()
            logger.info("Removed Telegram account %s from pool", account_id)
