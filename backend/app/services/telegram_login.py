"""Shared Telegram login helpers used by both primary auth and alt-account add flows.

The `namespace` parameter prefixes all ClientPool pending-dict keys so that
a primary login and an alt-account login can run concurrently for the same
phone number without colliding.

  namespace="primary"     → keys: "primary:+1234"
  namespace="add_account" → keys: "add_account:+1234"
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import TYPE_CHECKING

from telethon import TelegramClient
from telethon.sessions import StringSession

from app.core.config import get_settings

if TYPE_CHECKING:
    from app.telegram.client_pool import ClientPool

logger = logging.getLogger(__name__)

_CODE_TYPE_MAP = {
    "SentCodeTypeApp": "APP",
    "SentCodeTypeSms": "SMS",
    "SentCodeTypeCall": "CALL",
    "SentCodeTypeFlashCall": "FLASH_CALL",
    "SentCodeTypeMissedCall": "MISSED_CALL",
}


def _phone_key(namespace: str, phone: str) -> str:
    return f"{namespace}:{phone}"


def _qr_key(namespace: str, poll_token: str) -> str:
    return f"{namespace}:{poll_token}"


async def start_phone_login(pool: "ClientPool", phone: str, namespace: str) -> dict:
    """Send OTP to phone. Stores pending state in pool under namespace:phone key.

    Returns dict with code_type for the client.
    """
    settings = get_settings()
    client = TelegramClient(
        StringSession(), settings.telegram_api_id, settings.telegram_api_hash
    )
    await client.connect()
    sent_code = await client.send_code_request(phone)

    from app.telegram.client_pool import PendingPhoneLogin

    pool._pending_phone[_phone_key(namespace, phone)] = PendingPhoneLogin(
        phone=phone,
        phone_code_hash=sent_code.phone_code_hash,
        client=client,
    )
    code_type = _CODE_TYPE_MAP.get(type(sent_code.type).__name__, "UNKNOWN")
    return {"message": "OTP sent", "code_type": code_type}


async def finish_phone_login(
    pool: "ClientPool",
    phone: str,
    code: str,
    password: str | None,
    namespace: str,
) -> TelegramClient:
    """Verify OTP (and optional 2FA password). Returns connected TelegramClient on success.

    Raises HTTPException-compatible errors on failure.
    Pops the pending entry — caller must re-insert on partial failure (e.g. PASSWORD_REQUIRED).
    """
    from fastapi import HTTPException
    from telethon.errors import SessionPasswordNeededError

    key = _phone_key(namespace, phone)
    pending = pool._pending_phone.pop(key, None)
    if pending is None:
        raise HTTPException(
            status_code=400,
            detail={"error": "NO_PENDING_LOGIN", "message": "No pending login for this phone number", "detail": None},
        )

    client = pending.client
    try:
        signed_in = await client.sign_in(phone, code, phone_code_hash=pending.phone_code_hash)
    except SessionPasswordNeededError:
        if password is None:
            # Re-insert so the caller can retry with a password
            pool._pending_phone[key] = pending
            raise HTTPException(
                status_code=400,
                detail={"error": "PASSWORD_REQUIRED", "message": "2FA password required", "detail": None},
            )
        signed_in = await client.sign_in(password=password)

    # Ensure we have the full user object
    if not hasattr(signed_in, "id"):
        signed_in = await client.get_me()

    return client


async def start_qr_login(pool: "ClientPool", namespace: str) -> dict:
    """Create a QR login session. Returns {poll_token, qr_url}."""
    settings = get_settings()
    poll_token = uuid.uuid4().hex

    client = TelegramClient(
        StringSession(), settings.telegram_api_id, settings.telegram_api_hash
    )
    await client.connect()
    qr_login = await client.qr_login()

    async def _wait_qr() -> object:
        try:
            return await qr_login.wait(timeout=120)
        except asyncio.TimeoutError:
            pool._pending_qr.pop(_qr_key(namespace, poll_token), None)
            await client.disconnect()
            return None

    task = asyncio.create_task(_wait_qr())

    from app.telegram.client_pool import PendingQRLogin

    pool._pending_qr[_qr_key(namespace, poll_token)] = PendingQRLogin(
        client=client, qr_login=qr_login, task=task
    )

    return {"qr_url": qr_login.url, "poll_token": poll_token}


async def poll_qr_login(
    pool: "ClientPool", poll_token: str, namespace: str
) -> tuple[str, str | None, TelegramClient | None]:
    """Poll QR login status.

    Returns (status, message, client):
      - ("pending", None, None)       — still waiting for scan
      - ("complete", None, client)    — authenticated, caller should save account
      - ("error", reason, None)       — failed (timeout, 2FA, exception)
    """
    from telethon.errors import SessionPasswordNeededError

    key = _qr_key(namespace, poll_token)
    pending = pool._pending_qr.get(key)
    if pending is None:
        return ("error", "Invalid or expired poll token", None)

    task = pending.task
    if not task.done():
        return ("pending", None, None)

    pool._pending_qr.pop(key, None)

    if task.cancelled():
        return ("error", "QR login was cancelled", None)

    exc = task.exception()
    if exc is not None:
        if isinstance(exc, SessionPasswordNeededError):
            return ("error", "2FA is enabled on this account. Please use phone login instead.", None)
        logger.exception("QR login task raised unexpected exception", exc_info=exc)
        return ("error", "QR login failed", None)

    client = pending.client
    return ("complete", None, client)
