"""Accounts API — manage alt Telegram accounts for parallel uploads.

All endpoints require a valid JWT (authenticated user).
Primary accounts (is_primary=True) cannot be removed via this API.
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_client_pool, get_current_user, get_db
from app.db.models.telegram_account import TelegramAccount
from app.db.models.user import User
from app.schemas.accounts import (
    AddAccountOTPIn,
    AddAccountPhoneIn,
    AddAccountResponse,
    QRPollResponse,
    TelegramAltAccountOut,
)
from app.services.auth import store_telegram_account
from app.services.channel_membership import (
    enroll_account_in_all_channels,
    remove_account_from_all_channels,
)
from app.services.telegram_login import (
    finish_phone_login,
    poll_qr_login,
    start_phone_login,
    start_qr_login,
)
from app.telegram.client_pool import ClientPool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/accounts", tags=["accounts"])


# ─── List alt accounts ────────────────────────────────────────────────────────

@router.get("/", response_model=list[TelegramAltAccountOut])
async def list_alt_accounts(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all alt (non-primary) accounts for the current user."""
    result = await session.execute(
        select(TelegramAccount).where(
            TelegramAccount.owner_telegram_id == current_user.telegram_id,
            TelegramAccount.is_primary.is_(False),
        )
    )
    return list(result.scalars().all())


# ─── Primary account ──────────────────────────────────────────────────────────

@router.get("/primary", response_model=TelegramAltAccountOut)
async def get_primary_account(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the primary Telegram account for the current user."""
    result = await session.execute(
        select(TelegramAccount).where(
            TelegramAccount.owner_telegram_id == current_user.telegram_id,
            TelegramAccount.is_primary.is_(True),
            TelegramAccount.is_active.is_(True),
        )
    )
    ta = result.scalar_one_or_none()
    if ta is None:
        raise HTTPException(status_code=404, detail="Primary account not found")
    return ta


# ─── Add account: phone/OTP flow ─────────────────────────────────────────────

@router.post("/add/phone", status_code=204)
async def add_phone(
    body: AddAccountPhoneIn,
    pool: ClientPool = Depends(get_client_pool),
):
    """Start phone login for an alt account. Sends OTP via Telegram."""
    await start_phone_login(pool, body.phone, namespace="add_account")
    return None


@router.post("/add/otp", response_model=AddAccountResponse)
async def add_otp(
    body: AddAccountOTPIn,
    pool: ClientPool = Depends(get_client_pool),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit OTP (and optional 2FA password) to complete alt account login."""
    client = await finish_phone_login(
        pool, body.phone, body.code, body.password, namespace="add_account"
    )

    # Commit to DB first, then add to pool (invariant: commit-before-pool)
    ta, session_string = await store_telegram_account(
        session, pool, current_user.telegram_id, client,
        is_primary=False, add_to_pool=False,
    )
    await session.commit()
    await pool.add_client(ta.id, session_string, current_user.telegram_id)

    # Enroll in all channels (transient failures returned to caller)
    failures = await enroll_account_in_all_channels(
        pool, ta.telegram_id, session, current_user.telegram_id
    )

    return AddAccountResponse(
        account=TelegramAltAccountOut.model_validate(ta),
        enrollment_failures=failures,
    )


# ─── Add account: QR flow ─────────────────────────────────────────────────────

@router.post("/add/qr/init")
async def add_qr_init(pool: ClientPool = Depends(get_client_pool)):
    """Start QR login for an alt account. Returns {poll_token, qr_url}."""
    return await start_qr_login(pool, namespace="add_account")


@router.get("/add/qr/poll", response_model=QRPollResponse)
async def add_qr_poll(
    poll_token: str,
    pool: ClientPool = Depends(get_client_pool),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll QR login status. On complete, saves the account and returns it."""
    status, message, client = await poll_qr_login(pool, poll_token, namespace="add_account")

    if status == "pending":
        return QRPollResponse(status="pending")

    if status == "error":
        return QRPollResponse(status="error", message=message)

    # status == "complete" — commit before pool
    ta, session_string = await store_telegram_account(
        session, pool, current_user.telegram_id, client,
        is_primary=False, add_to_pool=False,
    )
    await session.commit()
    await pool.add_client(ta.id, session_string, current_user.telegram_id)

    failures = await enroll_account_in_all_channels(
        pool, ta.telegram_id, session, current_user.telegram_id
    )

    return QRPollResponse(
        status="complete",
        account=TelegramAltAccountOut.model_validate(ta),
        enrollment_failures=failures,
    )


# ─── Remove alt account ───────────────────────────────────────────────────────

@router.delete("/{account_id}", status_code=204)
async def remove_alt_account(
    account_id: uuid.UUID,
    pool: ClientPool = Depends(get_client_pool),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove an alt account. Fails with 403 if the account is primary."""
    ta = await session.get(TelegramAccount, account_id)

    if ta is None or ta.owner_telegram_id != current_user.telegram_id:
        raise HTTPException(status_code=404, detail="Account not found")

    if ta.is_primary:
        raise HTTPException(status_code=403, detail="Primary account cannot be removed")

    # Unenroll from channels — failures are logged but don't block removal
    failures = await remove_account_from_all_channels(
        pool, ta.telegram_id, session, current_user.telegram_id
    )
    if failures:
        logger.warning("Channel unenrollment failures during account removal %s: %s", account_id, failures)

    # Disconnect from pool (in-flight uploads will fail cleanly — documented behavior)
    await pool.remove_client(account_id)

    # Soft delete
    ta.is_active = False
    await session.commit()

    return None
