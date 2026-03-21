from __future__ import annotations

import logging

import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token
from app.core.config import get_settings
from app.core.deps import get_client_pool, get_current_user, get_db
from app.db.models.refresh_token import RefreshToken
from app.db.models.user import User
from app.schemas.auth import (
    OTPSubmitIn,
    PhoneLoginIn,
    RefreshIn,
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
from app.services.telegram_login import (
    start_phone_login as _start_phone_login,
    finish_phone_login as _finish_phone_login,
    start_qr_login as _start_qr_login,
    poll_qr_login as _poll_qr_login,
)

from app.telegram.client_pool import ClientPool

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
    result = await _start_phone_login(pool, body.phone, namespace="primary")
    return result


@router.post("/otp", response_model=TokenOut)
async def otp_submit(
    body: OTPSubmitIn,
    pool: ClientPool = Depends(get_client_pool),
    session: AsyncSession = Depends(get_db),
):
    client = await _finish_phone_login(pool, body.phone, body.code, body.password, namespace="primary")
    me = await client.get_me()
    settings = get_settings()
    user = await upsert_user(session, me)
    await admin_auto_set(session, settings, user.telegram_id)
    ta, _ = await store_telegram_account(session, pool, user.telegram_id, client, is_primary=True)
    raw_refresh = await create_refresh_token(session, user.telegram_id)
    access = create_access_token(user.telegram_id, user.role)
    return _make_token_out(access, raw_refresh, user.vault_hash)


# ---------- QR login ----------


@router.post("/qr/init")
async def qr_init(
    pool: ClientPool = Depends(get_client_pool),
):
    return await _start_qr_login(pool, namespace="primary")


@router.get("/qr/poll")
async def qr_poll(
    poll_token: str,
    pool: ClientPool = Depends(get_client_pool),
    session: AsyncSession = Depends(get_db),
):
    from starlette.responses import JSONResponse

    status, message, client = await _poll_qr_login(pool, poll_token, namespace="primary")

    if status == "pending":
        return JSONResponse(status_code=202, content={"message": "QR login pending"})
    if status == "error":
        raise HTTPException(status_code=400, detail={"error": "QR_ERROR", "message": message, "detail": None})

    me = await client.get_me()
    settings = get_settings()
    user = await upsert_user(session, me)
    await admin_auto_set(session, settings, user.telegram_id)
    ta, _ = await store_telegram_account(session, pool, user.telegram_id, client, is_primary=True)
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
