from __future__ import annotations

import asyncio
import logging
import uuid

import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, verify_token_hash
from app.core.config import get_settings
from app.core.deps import get_client_pool, get_current_user, get_db
from app.db.models.refresh_token import RefreshToken
from app.db.models.user import User
from app.schemas.auth import (
    OTPSubmitIn,
    PhoneLoginIn,
    RefreshIn,
    TelegramAccountOut,
    TokenOut,
    UserOut,
)
from app.services.auth import (
    admin_auto_set,
    create_refresh_token,
    revoke_refresh_token,
    store_telegram_account,
    upsert_user,
)
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession

from app.telegram.client_pool import ClientPool, PendingPhoneLogin, PendingQRLogin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_CODE_TYPE_MAP = {
    "SentCodeTypeApp": "APP",
    "SentCodeTypeSms": "SMS",
    "SentCodeTypeCall": "CALL",
    "SentCodeTypeFlashCall": "FLASH_CALL",
    "SentCodeTypeMissedCall": "MISSED_CALL",
}


def _make_token_out(access: str, refresh: str, vault_hash: str) -> TokenOut:
    return TokenOut(
        access_token=access,
        refresh_token=refresh,
        vault_hash=vault_hash,
    )


# ---------- Phone + OTP login ----------


@router.post("/phone")
async def phone_login(
    body: PhoneLoginIn,
    pool: ClientPool = Depends(get_client_pool),
):
    settings = get_settings()

    client = TelegramClient(
        StringSession(),
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )
    try:
        await client.connect()
        sent_code = await client.send_code_request(body.phone)
    except Exception as exc:
        try:
            await client.disconnect()
        except Exception:
            pass
        raise HTTPException(
            status_code=400,
            detail={"error": "TELEGRAM_ERROR", "message": str(exc), "detail": None},
        ) from exc

    pool._pending_phone[body.phone] = PendingPhoneLogin(
        phone=body.phone,
        phone_code_hash=sent_code.phone_code_hash,
        client=client,
    )

    code_type = _CODE_TYPE_MAP.get(type(sent_code.type).__name__, "UNKNOWN")
    logger.info("OTP sent to %s via %s", body.phone, code_type)
    return {"message": "OTP sent", "code_type": code_type}


@router.post("/otp", response_model=TokenOut)
async def otp_submit(
    body: OTPSubmitIn,
    pool: ClientPool = Depends(get_client_pool),
    session: AsyncSession = Depends(get_db),
):
    pending = pool._pending_phone.pop(body.phone, None)
    if pending is None:
        raise HTTPException(
            status_code=400,
            detail={"error": "NO_PENDING_LOGIN", "message": "No pending phone login for this number.", "detail": None},
        )

    client = pending.client
    try:
        try:
            signed_in = await client.sign_in(
                body.phone, body.code, phone_code_hash=pending.phone_code_hash
            )
        except SessionPasswordNeededError:
            if body.password is None:
                pool._pending_phone[body.phone] = pending
                raise HTTPException(
                    status_code=400,
                    detail={"error": "PASSWORD_REQUIRED", "message": "Two-factor authentication password required.", "detail": None},
                )
            signed_in = await client.sign_in(password=body.password)

        me = signed_in if hasattr(signed_in, "id") else await client.get_me()
        settings = get_settings()

        user = await upsert_user(session, me)
        await admin_auto_set(session, settings, user.telegram_id)
        await store_telegram_account(session, pool, user.telegram_id, client)
        raw_refresh = await create_refresh_token(session, user.telegram_id)
        access = create_access_token(user.telegram_id, user.role)

        return _make_token_out(access, raw_refresh, user.vault_hash)

    except HTTPException:
        raise
    except Exception as exc:
        try:
            await client.disconnect()
        except Exception:
            pass
        raise HTTPException(
            status_code=400,
            detail={"error": "TELEGRAM_ERROR", "message": str(exc), "detail": None},
        ) from exc


# ---------- QR login ----------


@router.post("/qr/init")
async def qr_init(
    pool: ClientPool = Depends(get_client_pool),
):
    settings = get_settings()
    poll_token = uuid.uuid4().hex

    client = TelegramClient(
        StringSession(),
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )
    try:
        await client.connect()
        qr_login = await client.qr_login()
    except Exception as exc:
        try:
            await client.disconnect()
        except Exception:
            pass
        raise HTTPException(
            status_code=400,
            detail={"error": "TELEGRAM_ERROR", "message": str(exc), "detail": None},
        ) from exc

    async def _wait_qr():
        try:
            return await qr_login.wait(timeout=120)
        except asyncio.TimeoutError:
            pool._pending_qr.pop(poll_token, None)
            try:
                await client.disconnect()
            except Exception:
                pass
            return None

    task = asyncio.create_task(_wait_qr())
    pool._pending_qr[poll_token] = PendingQRLogin(
        client=client,
        qr_login=qr_login,
        task=task,
    )
    return {"qr_url": qr_login.url, "poll_token": poll_token}


@router.get("/qr/poll")
async def qr_poll(
    poll_token: str,
    pool: ClientPool = Depends(get_client_pool),
    session: AsyncSession = Depends(get_db),
):
    pending = pool._pending_qr.get(poll_token)
    if pending is None:
        raise HTTPException(
            status_code=400,
            detail={"error": "INVALID_POLL_TOKEN", "message": "No pending QR login for this token.", "detail": None},
        )

    task = pending.task
    if not task.done():
        from starlette.responses import JSONResponse
        return JSONResponse(
            status_code=202,
            content={"message": "QR login pending"},
        )

    pool._pending_qr.pop(poll_token, None)

    if task.cancelled():
        raise HTTPException(
            status_code=400,
            detail={"error": "QR_CANCELLED", "message": "QR login was cancelled.", "detail": None},
        )

    exc = task.exception()
    if exc is not None:
        raise HTTPException(
            status_code=400,
            detail={"error": "QR_ERROR", "message": str(exc), "detail": None},
        )

    client = pending.client
    me = await client.get_me()
    settings = get_settings()

    user = await upsert_user(session, me)
    await admin_auto_set(session, settings, user.telegram_id)
    await store_telegram_account(session, pool, user.telegram_id, client)
    raw_refresh = await create_refresh_token(session, user.telegram_id)
    access = create_access_token(user.telegram_id, user.role)

    return _make_token_out(access, raw_refresh, user.vault_hash)


# ---------- Token refresh ----------


@router.post("/refresh", response_model=TokenOut)
async def refresh(
    body: RefreshIn,
    session: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select

    from app.core.auth import hash_token

    hashed = hash_token(body.refresh_token)
    stmt = select(RefreshToken).where(
        RefreshToken.token_hash == hashed,
    )
    result = await session.execute(stmt)
    token = result.scalar_one_or_none()
    
    # Check if token exists and is valid (not revoked or within grace period)
    if token is None:
        raise HTTPException(
            status_code=401,
            detail={"error": "INVALID_REFRESH_TOKEN", "message": "Refresh token is invalid.", "detail": None},
        )
        
    if token.revoked:
        from datetime import datetime, timedelta, timezone
        grace_period = timedelta(seconds=60)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if token.revoked_at is None or (now - token.revoked_at > grace_period):
            raise HTTPException(
                status_code=401,
                detail={"error": "TOKEN_REVOKED", "message": "Refresh token has been revoked.", "detail": None},
            )

    from datetime import datetime, timezone

    if token.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=401,
            detail={"error": "REFRESH_TOKEN_EXPIRED", "message": "Refresh token has expired.", "detail": None},
        )

    user = await session.get(User, token.user_telegram_id)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail={"error": "USER_NOT_FOUND", "message": "User not found.", "detail": None},
        )

    # Revoke old token, issue new pair
    token.revoked = True
    from datetime import datetime
    token.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    raw_refresh = await create_refresh_token(session, user.telegram_id)
    access = create_access_token(user.telegram_id, user.role)

    return _make_token_out(access, raw_refresh, user.vault_hash)


# ---------- Logout ----------


@router.post("/logout", status_code=204)
async def logout(
    body: RefreshIn,
    session: AsyncSession = Depends(get_db),
):
    await revoke_refresh_token(session, body.refresh_token)
    return None


# ---------- Current user ----------


@router.get("/me", response_model=UserOut)
async def me(
    current_user: User = Depends(get_current_user),
):
    return UserOut(
        telegram_id=current_user.telegram_id,
        telegram_username=current_user.telegram_username,
        telegram_first_name=current_user.telegram_first_name,
        role=current_user.role,
        vault_hash=current_user.vault_hash,
    )


@router.get("/accounts", response_model=list[TelegramAccountOut])
async def list_accounts(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import select
    from app.db.models.telegram_account import TelegramAccount
    result = await session.scalars(
        select(TelegramAccount).where(
            TelegramAccount.owner_telegram_id == current_user.telegram_id
        )
    )
    return list(result.all())


@router.get("/me/photo")
async def me_photo(
    current_user: User = Depends(get_current_user),
    pool: ClientPool = Depends(get_client_pool),
) -> Response:
    try:
        client = pool.get_client_for_user(current_user.telegram_id)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="No active Telegram session")

    try:
        photo_bytes: bytes | None = await client.download_profile_photo(current_user.telegram_id, file=bytes)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if photo_bytes is None:
        return Response(status_code=204)
    media_type = "image/webp" if photo_bytes[:4] == b"RIFF" and photo_bytes[8:12] == b"WEBP" else "image/jpeg"
    return StreamingResponse(io.BytesIO(photo_bytes), media_type=media_type)
