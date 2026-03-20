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

    async def remove_client(self, account_id: uuid.UUID) -> None:
        client = self._clients.pop(account_id, None)
        self._owners.pop(account_id, None)
        if client is not None:
            await client.disconnect()
            logger.info("Removed Telegram account %s from pool", account_id)
