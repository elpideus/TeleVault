# Multi-Account Parallel Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to connect N additional Telegram accounts that upload file splits in parallel via round-robin distribution, with automatic channel co-admin enrollment and 30-minute session health checks.

**Architecture:** Approach B — new `/api/v1/accounts/` router with a shared `services/telegram_login.py` helper. Existing auth endpoints untouched except minimal refactoring. ClientPool gains round-robin and health-check capabilities. Upload execution parallelised with `asyncio.gather()`.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, Telethon, React/TypeScript, TanStack Query

**Spec:** `docs/superpowers/specs/2026-03-21-multi-account-design.md`

**Branch:** `feature/multi-account`

**Note on tests:** No `backend/tests/` directory exists in this codebase. Each task includes a manual verification step instead of automated tests. Add `pytest` / `pytest-asyncio` test infrastructure as a follow-up if desired.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/app/db/models/telegram_account.py` | Modify | Add `is_primary`, `last_checked_at`, `session_error` columns |
| `backend/alembic/versions/YYYYMMDD_multi_account_fields.py` | Create | DB migration + backfill |
| `backend/app/services/telegram_login.py` | Create | Shared phone/OTP/QR login logic with namespace isolation |
| `backend/app/services/auth.py` | Modify | `store_telegram_account` gains `is_primary` param |
| `backend/app/api/auth.py` | Modify | Remove `GET /accounts`, delegate to shared login helper |
| `backend/app/telegram/client_pool.py` | Modify | Add `get_all_clients_for_user`, round-robin, health check |
| `backend/app/services/channel_membership.py` | Create | Channel co-admin enrollment/unenrollment |
| `backend/app/services/upload.py` | Modify | Parallel split upload via `asyncio.gather()`, updated `rollback_splits` |
| `backend/app/api/accounts.py` | Create | `/api/v1/accounts/` router |
| `backend/app/schemas/accounts.py` | Create | Pydantic schemas for accounts API |
| `backend/app/api/channels.py` | Modify | Enroll all alt accounts when new channel created |
| `backend/app/main.py` | Modify | Register accounts router, start health check loop |
| `frontend/src/api/accounts.ts` | Create | API client for accounts endpoints |
| `frontend/src/api/auth.ts` | Modify | Remove `listAccounts` and `authKeys.accounts` |
| `frontend/src/themes/default/components/SettingsPanels.tsx` | Modify | Replace `AccountsPanel` placeholder |

---

## Task 1: Database Model + Migration

**Files:**
- Modify: `backend/app/db/models/telegram_account.py`
- Create: `backend/alembic/versions/` (new revision file — generate name via alembic)

### Steps

- [ ] **Step 1.1: Add three columns to TelegramAccount model**

Open `backend/app/db/models/telegram_account.py`. Current content (lines 1–23):

```python
class TelegramAccount(Base, TimestampMixin):
    __tablename__ = "telegram_accounts"
    __table_args__ = (UniqueConstraint("owner_telegram_id", "telegram_id"),)

    id: Mapped[uuid.UUID] = ...
    owner_telegram_id: Mapped[int] = ...
    telegram_id: Mapped[int] = ...
    session_string: Mapped[str] = ...
    label: Mapped[str | None] = ...
    is_active: Mapped[bool] = ...
```

Add after `is_active`:

```python
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    session_error: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
```

Add `from datetime import datetime` to imports if not present. Add `DateTime` to sqlalchemy imports.

- [ ] **Step 1.2: Generate the Alembic migration**

```bash
cd backend
alembic revision --autogenerate -m "add_multi_account_fields"
```

This creates a file like `backend/alembic/versions/XXXXXXXX_add_multi_account_fields.py`.

- [ ] **Step 1.3: Edit the migration to add backfill**

Open the generated migration file. The `upgrade()` function will have `op.add_column(...)` calls. After those, add the backfill:

```python
def upgrade() -> None:
    op.add_column("telegram_accounts", sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("telegram_accounts", sa.Column("last_checked_at", sa.DateTime(), nullable=True))
    op.add_column("telegram_accounts", sa.Column("session_error", sa.String(), nullable=True))

    # Backfill: primary accounts are those where the account IS the owner
    op.execute(
        "UPDATE telegram_accounts SET is_primary = TRUE "
        "WHERE telegram_id = owner_telegram_id"
    )


def downgrade() -> None:
    op.drop_column("telegram_accounts", "session_error")
    op.drop_column("telegram_accounts", "last_checked_at")
    op.drop_column("telegram_accounts", "is_primary")
```

- [ ] **Step 1.4: Run migration**

```bash
cd backend
alembic upgrade head
```

Expected: `Running upgrade ... -> XXXXXXXX, add_multi_account_fields`

- [ ] **Step 1.5: Verify**

```bash
cd backend
python -c "
import asyncio
from app.db.session import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as s:
        r = await s.execute(text('SELECT is_primary, last_checked_at, session_error FROM telegram_accounts LIMIT 3'))
        print(r.fetchall())

asyncio.run(check())
"
```

Expected: rows with `is_primary=True` (for existing primary accounts), `last_checked_at=None`, `session_error=None`.

- [ ] **Step 1.6: Commit**

```bash
git add backend/app/db/models/telegram_account.py backend/alembic/versions/
git commit -m "feat: add is_primary, last_checked_at, session_error to telegram_accounts"
```

---

## Task 2: Shared Login Service (`services/telegram_login.py`)

**Files:**
- Create: `backend/app/services/telegram_login.py`

This extracts the Telethon login logic from `api/auth.py` into a reusable helper. The key difference is a `namespace` parameter that prefixes pending dict keys to prevent collision between primary login and alt-account add flows.

### Steps

- [ ] **Step 2.1: Create `backend/app/services/telegram_login.py`**

```python
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
```

- [ ] **Step 2.2: Verify it imports cleanly**

```bash
cd backend
python -c "from app.services.telegram_login import start_phone_login, finish_phone_login, start_qr_login, poll_qr_login; print('OK')"
```

Expected: `OK`

- [ ] **Step 2.3: Commit**

```bash
git add backend/app/services/telegram_login.py
git commit -m "feat: add shared telegram_login service with namespace isolation"
```

---

## Task 3: Update `store_telegram_account` + Refactor `auth.py`

**Files:**
- Modify: `backend/app/services/auth.py` (lines 66–100)
- Modify: `backend/app/api/auth.py`

### Steps

- [ ] **Step 3.1: Add `is_primary` param to `store_telegram_account` and split pool logic**

**Critical design note:** `store_telegram_account` must NOT call `pool.add_client()` internally for the alt-account path because the spec requires DB commit to happen before the client enters the pool. The primary auth path, however, calls `pool.add_client()` inside the function (existing behavior). To handle both cleanly, add an `add_to_pool: bool = True` parameter. Alt-account endpoints pass `add_to_pool=False` and call `pool.add_client()` themselves after committing.

In `backend/app/services/auth.py`, update `store_telegram_account`:

```python
async def store_telegram_account(
    session: AsyncSession,
    pool: ClientPool,
    owner_telegram_id: int,
    account: "TelegramClient",
    is_primary: bool = False,          # ← NEW
    add_to_pool: bool = True,          # ← NEW: False for alt-account add path
) -> tuple["TelegramAccount", str]:   # ← now returns (ta, session_string) so caller can add to pool
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
            is_primary=is_primary,     # ← NEW field
        )
        session.add(ta)
    else:
        ta.session_string = encrypted
        ta.is_active = True
        # Do NOT update is_primary on upsert — set once at creation
    await session.flush()

    if add_to_pool:
        await pool.add_client(ta.id, session_string, owner_telegram_id)

    return ta, session_string  # ← caller uses session_string for pool.add_client if add_to_pool=False
```

**Update all existing call sites in `auth.py`** to unpack the tuple: `ta, _ = await store_telegram_account(...)`. The primary path passes `is_primary=True, add_to_pool=True` (default).

- [ ] **Step 3.2: Update `auth.py` to pass `is_primary=True` and use shared login helper**

In `backend/app/api/auth.py`:

1. Add imports at the top:

```python
from app.services.telegram_login import (
    start_phone_login as _start_phone_login,
    finish_phone_login as _finish_phone_login,
    start_qr_login as _start_qr_login,
    poll_qr_login as _poll_qr_login,
)
```

2. Replace the `phone_login` endpoint body. The endpoint signature stays the same; just delegate:

```python
@router.post("/phone")
async def phone_login(body: PhoneLoginIn, pool: ClientPool = Depends(get_client_pool)):
    result = await _start_phone_login(pool, body.phone, namespace="primary")
    return result
```

3. Replace the `otp_submit` endpoint body (keep the same signature and response_model):

**Important:** Do NOT add an explicit `session.commit()` here. The existing code uses `flush()` throughout and lets the SQLAlchemy session dependency commit the transaction when the response is returned. Inserting a mid-function `commit()` would split the transaction and leave the account record committed if `create_refresh_token` subsequently fails. Match the existing transaction pattern exactly.

```python
@router.post("/otp", response_model=TokenOut)
async def otp_submit(
    body: OTPSubmitIn,
    pool: ClientPool = Depends(get_client_pool),
    session: AsyncSession = Depends(get_db),
):
    client = await _finish_phone_login(pool, body.phone, body.code, body.password, namespace="primary")
    me = await client.get_me()

    user = await upsert_user(session, me)
    await admin_auto_set(session, settings, user.telegram_id)
    # add_to_pool=True (default): primary path keeps existing commit ordering
    ta, _ = await store_telegram_account(session, pool, user.telegram_id, client, is_primary=True)
    raw_refresh = await create_refresh_token(session, user.telegram_id)
    access = create_access_token(user.telegram_id, user.role)
    # NO explicit session.commit() here — session dependency handles it at response time

    return _make_token_out(access, raw_refresh, user.vault_hash)
```

4. Replace the `qr_init` endpoint body:

```python
@router.post("/qr/init")
async def qr_init(pool: ClientPool = Depends(get_client_pool)):
    return await _start_qr_login(pool, namespace="primary")
```

5. Replace the `qr_poll` endpoint body (keep signature + response):

```python
@router.get("/qr/poll")
async def qr_poll(
    poll_token: str,
    pool: ClientPool = Depends(get_client_pool),
    session: AsyncSession = Depends(get_db),
):
    status, message, client = await _poll_qr_login(pool, poll_token, namespace="primary")

    if status == "pending":
        return JSONResponse(status_code=202, content={"message": "QR login pending"})
    if status == "error":
        raise HTTPException(status_code=400, detail={"error": "QR_ERROR", "message": message, "detail": None})

    me = await client.get_me()
    user = await upsert_user(session, me)
    await admin_auto_set(session, settings, user.telegram_id)
    # add_to_pool=True (default): primary path, no mid-function commit
    ta, _ = await store_telegram_account(session, pool, user.telegram_id, client, is_primary=True)
    raw_refresh = await create_refresh_token(session, user.telegram_id)
    access = create_access_token(user.telegram_id, user.role)
    # NO explicit session.commit() — session dependency handles it

    return _make_token_out(access, raw_refresh, user.vault_hash)
```

6. **Remove the `GET /accounts` endpoint** (lines 337–349). Delete it entirely.

- [ ] **Step 3.3: Start the backend and verify primary login still works**

```bash
cd backend
uvicorn app.main:app --reload
```

Test via the frontend: log out and log back in via phone/OTP or QR. Confirm it works identically to before.

- [ ] **Step 3.4: Commit**

```bash
git add backend/app/services/auth.py backend/app/api/auth.py
git commit -m "refactor: delegate auth login to shared telegram_login service, add is_primary param"
```

---

## Task 4: ClientPool Additions

**Files:**
- Modify: `backend/app/telegram/client_pool.py`

Add three things: `get_all_clients_for_user`, round-robin state + getter, and the health check background task.

### Steps

- [ ] **Step 4.1: Add `get_all_clients_for_user` and round-robin to `ClientPool`**

In `backend/app/telegram/client_pool.py`, add to `__init__`:

```python
self._rr_index: dict[int, int] = {}  # owner_telegram_id → next index
```

Add these methods to the class:

```python
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
```

- [ ] **Step 4.2: Add health check loop**

Add this method to `ClientPool`:

```python
async def start_health_check_loop(self, session_factory) -> None:
    """Run every 30 minutes. Re-connects dropped clients, marks revoked sessions inactive."""
    import asyncio
    from telethon.errors import (
        AuthKeyUnregisteredError,
        AuthKeyDuplicatedError,
        UserDeactivatedError,
        UserDeactivatedBanError,
    )
    from app.core.encryption import decrypt_string
    from app.core.config import get_settings
    from app.db.models.telegram_account import TelegramAccount
    from sqlalchemy import select

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
                    async with session_factory() as db:
                        ta = await db.get(TelegramAccount, account_id)
                        if ta is None:
                            continue
                        session_string = decrypt_string(ta.session_string, settings.encryption_key)
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
```

- [ ] **Step 4.3: Verify imports compile**

```bash
cd backend
python -c "from app.telegram.client_pool import ClientPool; print('OK')"
```

Expected: `OK`

- [ ] **Step 4.4: Commit**

```bash
git add backend/app/telegram/client_pool.py
git commit -m "feat: add get_all_clients_for_user, round-robin, and health check loop to ClientPool"
```

---

## Task 5: Start Health Check in `main.py`

**Files:**
- Modify: `backend/app/main.py`

### Steps

- [ ] **Step 5.1: Start health check loop in lifespan**

In `backend/app/main.py`, inside the `lifespan` async context manager, after `await client_pool.initialize(session)`, add:

```python
from app.db.session import AsyncSessionLocal as _SessionLocal

# Start health check as a background task (non-blocking)
asyncio.create_task(client_pool.start_health_check_loop(_SessionLocal))
```

Ensure `import asyncio` is at the top of `main.py`.

- [ ] **Step 5.2: Verify server starts cleanly**

```bash
cd backend
uvicorn app.main:app --reload
```

Expected: server starts, logs show `ClientPool initialized`. No errors.

- [ ] **Step 5.3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: start account health check loop on startup"
```

---

## Task 6: Channel Membership Service

**Files:**
- Create: `backend/app/services/channel_membership.py`

### Steps

- [ ] **Step 6.1: Create `backend/app/services/channel_membership.py`**

```python
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
    import uuid
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
```

- [ ] **Step 6.2: Verify imports**

```bash
cd backend
python -c "from app.services.channel_membership import enroll_account_in_all_channels; print('OK')"
```

Expected: `OK`

- [ ] **Step 6.3: Commit**

```bash
git add backend/app/services/channel_membership.py
git commit -m "feat: add channel_membership service for alt account co-admin enrollment"
```

---

## Task 7: Update Channel Creation to Enroll Alt Accounts

**Files:**
- Modify: `backend/app/api/channels.py`

### Steps

- [ ] **Step 7.1: Call `enroll_all_accounts_in_channel` after channel creation**

In `backend/app/api/channels.py`, both `create_channel` and `create_telegram_channel` create a channel. Find the `svc.create_channel(...)` call in each endpoint and add enrollment after it.

For the `create_channel` endpoint (line ~22):

```python
@router.post("/", response_model=ChannelOut, status_code=201)
async def create_channel(
    data: ChannelIn,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    pool: ClientPool = Depends(get_client_pool),          # ← ADD
):
    from app.services.channel_membership import enroll_all_accounts_in_channel
    channel = await svc.create_channel(session, current_user.telegram_id, data)
    await enroll_all_accounts_in_channel(pool, channel, session, current_user.telegram_id)
    return channel
```

For the `create_telegram_channel` endpoint, do the same: after `return await svc.create_channel(...)`, add the enrollment call before returning.

- [ ] **Step 7.2: Verify server still starts**

```bash
cd backend
uvicorn app.main:app --reload
```

No errors expected.

- [ ] **Step 7.3: Commit**

```bash
git add backend/app/api/channels.py
git commit -m "feat: enroll all alt accounts as co-admins when new channel created"
```

---

## Task 8: Parallel Uploads in `execute_upload`

**Files:**
- Modify: `backend/app/services/upload.py`

### Steps

- [ ] **Step 8.1: Add `UploadedSplitResult` dataclass near top of file**

After the imports in `backend/app/services/upload.py`, add:

```python
from dataclasses import dataclass

@dataclass
class UploadedSplitResult:
    """Returned by each split coroutine on success. Carries client reference for rollback."""
    split_index: int
    split_size: int
    uploaded: "UploadedSplit"
    account_id: "uuid.UUID"
    client: object  # TelegramClient
    channel_telegram_id: int
```

- [ ] **Step 8.2: Update `rollback_splits` signature**

Replace the existing `rollback_splits` function:

```python
async def rollback_splits(
    splits: list[tuple[object, int, int]],  # [(client, channel_telegram_id, message_id)]
) -> None:
    """Delete uploaded Telegram messages using the correct client per split."""
    for client, channel_id, msg_id in splits:
        try:
            await delete_message(client, channel_id, msg_id)
        except Exception:
            logger.warning(
                "Failed to delete message %d from channel %d during rollback",
                msg_id,
                channel_id,
            )
```

- [ ] **Step 8.3: Rewrite the upload phase of `execute_upload`**

In `execute_upload`, replace Phase 2 (the `client = pool.get_client_for_user(...)` block and the sequential `for split_index in range(num_splits)` loop) with:

```python
    # Phase 2: Upload all splits in parallel, one coroutine per split
    client_snapshot = pool.get_all_clients_for_user(owner_id)
    if not client_snapshot:
        raise RuntimeError("No active Telegram client for user")

    telegram_channel_id = channel.channel_id
    channel_id = channel.id

    # Reconnect any disconnected clients in the snapshot
    for _, c in client_snapshot:
        if not c.is_connected():
            await c.connect()

    async def _upload_split(split_index: int) -> UploadedSplitResult:
        account_id, client = client_snapshot[split_index % len(client_snapshot)]
        offset = split_index * _SPLIT_SIZE
        split_size = min(_SPLIT_SIZE, total_size - offset)
        multi = num_splits > 1
        split_name = f"{filename}.part{split_index}" if multi else filename

        async def _on_progress(sent: int, _total: int) -> None:
            await registry.emit_progress(
                operation_id,
                offset + sent,
                total_size,
                message=f"Uploading to Telegram… part {split_index + 1} of {num_splits}",
            )
            await asyncio.sleep(0.01)

        reader = _SplitReader(tmp_path, offset, split_size, split_name)
        try:
            result = await upload_document(
                client,
                telegram_channel_id,
                reader,
                filename=split_name,
                size=split_size,
                progress_callback=_on_progress,
            )
        finally:
            reader.close()

        return UploadedSplitResult(
            split_index=split_index,
            split_size=split_size,
            uploaded=result,
            account_id=account_id,
            client=client,
            channel_telegram_id=telegram_channel_id,
        )

    coroutines = [_upload_split(i) for i in range(num_splits)]
    results = await asyncio.gather(*coroutines, return_exceptions=True)

    # Separate successes from failures
    successes: list[UploadedSplitResult] = [r for r in results if isinstance(r, UploadedSplitResult)]
    errors = [r for r in results if isinstance(r, BaseException)]
```

- [ ] **Step 8.4: Preserve `finally: os.unlink(tmp_path)` cleanup**

The existing `execute_upload` wraps the upload phase in a `try/finally` that deletes the temp file. **Do not drop this.** In the rewritten function, wrap the entire `results = await asyncio.gather(...)` call (plus the success/failure handling below) in:

```python
    try:
        results = await asyncio.gather(*coroutines, return_exceptions=True)
        # ... success/failure handling ...
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
```

This guarantees the temp file is always cleaned up whether the upload succeeds, partially fails, or raises an unexpected exception.

- [ ] **Step 8.5: Update the rollback call and success path**

In the `except` / failure block, replace:

```python
    if errors:
        rollback_list = [
            (r.client, r.channel_telegram_id, r.uploaded.message_id)
            for r in successes
        ]
        await rollback_splits(rollback_list)
        await registry.emit_error(operation_id, "Upload failed", message="Upload to Telegram failed")
        logger.error("execute_upload failed for operation %s: %s", operation_id, errors[0])
        async with AsyncSessionLocal() as session:
            record = await session.get(File, file_id)
            if record is not None:
                record.status = FILE_STATUS_FAILED
                await session.commit()
        return
```

In the success path, update the `Split` creation to use the per-split `account_id`:

```python
        for r in successes:
            session.add(Split(
                file_id=file_id,
                channel_id=channel_id,
                telegram_account_id=r.account_id,          # ← uploading account
                message_id=r.uploaded.message_id,
                file_id_tg=r.uploaded.file_id,
                file_unique_id_tg=r.uploaded.file_unique_id,
                index=r.split_index,
                size=r.split_size,
            ))
```

- [ ] **Step 8.6: Verify backend starts and a small upload works**

Start the server and upload a small file via the frontend. Confirm the upload completes and the file appears in the file list.

```bash
cd backend
uvicorn app.main:app --reload
```

- [ ] **Step 8.7: Commit**

```bash
git add backend/app/services/upload.py
git commit -m "feat: parallel split uploads with per-split client assignment and updated rollback"
```

---

## Task 9: Schemas for Accounts API

**Files:**
- Create: `backend/app/schemas/accounts.py`

### Steps

- [ ] **Step 9.1: Create `backend/app/schemas/accounts.py`**

```python
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TelegramAltAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telegram_id: int
    label: str | None
    is_active: bool
    last_checked_at: datetime | None
    session_error: str | None


class AddAccountPhoneIn(BaseModel):
    phone: str


class AddAccountOTPIn(BaseModel):
    phone: str
    code: str
    password: str | None = None


class AddAccountResponse(BaseModel):
    account: TelegramAltAccountOut
    enrollment_failures: list[dict]  # [{channel_id: str, error: str}]


class QRPollResponse(BaseModel):
    status: str  # "pending" | "complete" | "error"
    message: str | None = None
    account: TelegramAltAccountOut | None = None
    enrollment_failures: list[dict] | None = None
```

- [ ] **Step 9.2: Verify**

```bash
cd backend
python -c "from app.schemas.accounts import TelegramAltAccountOut, AddAccountResponse; print('OK')"
```

- [ ] **Step 9.3: Commit**

```bash
git add backend/app/schemas/accounts.py
git commit -m "feat: add Pydantic schemas for accounts API"
```

---

## Task 10: Accounts API Router

**Files:**
- Create: `backend/app/api/accounts.py`

### Steps

- [ ] **Step 10.1: Create `backend/app/api/accounts.py`**

```python
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

from app.core.auth import get_current_user
from app.db.models.telegram_account import TelegramAccount
from app.db.models.user import User
from app.db.session import get_db
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
from app.telegram import client_pool as _pool_module

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/accounts", tags=["accounts"])


def get_client_pool() -> ClientPool:
    return _pool_module.client_pool


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
        is_primary=False, add_to_pool=False,  # ← do NOT add to pool yet
    )
    await session.commit()  # ← commit before pool
    await pool.add_client(ta.id, session_string, current_user.telegram_id)  # ← pool after commit

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
```

- [ ] **Step 10.2: Register the router in `main.py`**

In `backend/app/main.py`, add:

```python
from app.api.accounts import router as accounts_router
```

And in `create_app()`:

```python
application.include_router(accounts_router)
```

- [ ] **Step 10.3: Verify the router registers and endpoints appear**

```bash
cd backend
uvicorn app.main:app --reload
```

Open `http://localhost:8000/docs` and confirm `/api/v1/accounts/` endpoints appear.

- [ ] **Step 10.4: Commit**

```bash
git add backend/app/api/accounts.py backend/app/main.py
git commit -m "feat: add accounts API router for alt-account management"
```

---

## Task 11: Frontend API Client

**Files:**
- Create: `frontend/src/api/accounts.ts`
- Modify: `frontend/src/api/auth.ts`

### Steps

- [ ] **Step 11.1: Create `frontend/src/api/accounts.ts`**

Look at `frontend/src/api/auth.ts` for the `apiClient` import pattern and replicate it:

```typescript
import { apiClient } from "./client";

export interface AltAccountOut {
  id: string;
  telegram_id: number;
  label: string | null;
  is_active: boolean;
  last_checked_at: string | null;
  session_error: string | null;
}

export interface AddAccountResponse {
  account: AltAccountOut;
  enrollment_failures: { channel_id: string; error: string }[];
}

export interface QRPollResponse {
  status: "pending" | "complete" | "error";
  message?: string | null;
  account?: AltAccountOut | null;
  enrollment_failures?: { channel_id: string; error: string }[] | null;
}

export const accountsKeys = {
  list: ["accounts", "list"] as const,
};

// ── List alt accounts ─────────────────────────────────────────────────────────

export async function listAltAccounts(): Promise<AltAccountOut[]> {
  const res = await fetch("/api/v1/accounts/", {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// ── Phone / OTP flow ──────────────────────────────────────────────────────────

export async function startPhoneLogin(phone: string): Promise<void> {
  const res = await fetch("/api/v1/accounts/add/phone", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw await res.json();
}

export async function submitOtp(
  phone: string,
  code: string,
  password?: string
): Promise<AddAccountResponse> {
  const res = await fetch("/api/v1/accounts/add/otp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify({ phone, code, password: password ?? null }),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// ── QR flow ───────────────────────────────────────────────────────────────────

export async function initQrLogin(): Promise<{ poll_token: string; qr_url: string }> {
  const res = await fetch("/api/v1/accounts/add/qr/init", {
    method: "POST",
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function pollQrLogin(poll_token: string): Promise<QRPollResponse> {
  const res = await fetch(
    `/api/v1/accounts/add/qr/poll?poll_token=${encodeURIComponent(poll_token)}`,
    { headers: { Authorization: `Bearer ${getAccessToken()}` } }
  );
  if (!res.ok) throw await res.json();
  return res.json();
}

// ── Remove ────────────────────────────────────────────────────────────────────

export async function removeAltAccount(account_id: string): Promise<void> {
  const res = await fetch(`/api/v1/accounts/${account_id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) throw await res.json();
}

// ── Helper ────────────────────────────────────────────────────────────────────

function getAccessToken(): string {
  // Import from your auth store — adjust import path to match your project
  const { useAuthStore } = require("../store/authStore");
  return useAuthStore.getState().accessToken ?? "";
}
```

**Note:** The `getAccessToken` helper at the bottom — check how other API files access the token (e.g. `auth.ts` or `files.ts`) and use the same pattern. Adjust the import path accordingly.

- [ ] **Step 11.2: Remove `listAccounts` and `authKeys.accounts` from `auth.ts`**

In `frontend/src/api/auth.ts`:

1. Remove the `listAccounts` function entirely.
2. Remove `accounts: ["auth", "accounts"] as const` from `authKeys`.

Search for any component that calls `listAccounts()` or uses `authKeys.accounts` and update it to use `listAltAccounts()` from `api/accounts.ts` instead. (Currently this is likely only the old `AccountsPanel` placeholder, which you'll replace in Task 12.)

- [ ] **Step 11.3: Commit**

```bash
git add frontend/src/api/accounts.ts frontend/src/api/auth.ts
git commit -m "feat: add accounts API client, remove old listAccounts from auth.ts"
```

---

## Task 12: AccountsPanel UI

**Files:**
- Modify: `frontend/src/themes/default/components/SettingsPanels.tsx`

This is the largest frontend task. The current `AccountsPanel` is a placeholder (lines 423–464). Replace it entirely.

### Steps

- [ ] **Step 12.1: Study existing panel components for patterns**

Before writing, read the `ChannelsPanel` (lines ~279–419 in `SettingsPanels.tsx`) to understand:
- How `useQuery` and `useMutation` are used
- What components are available (Button, Badge, ConfirmModal, etc.)
- The CSS variable naming convention (`--tv-*`)
- The icon import pattern (Fluent UI icons)

- [ ] **Step 12.2: Replace `AccountsPanel`**

Replace the entire `AccountsPanel` function (lines 423–464) with the following. Adjust icon imports and component names to match what's already imported in the file:

```typescript
export function AccountsPanel() {
  const queryClient = useQueryClient();
  const { accessToken } = useAuthStore();

  // ── Data fetching ────────────────────────────────────────────────────────
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: accountsKeys.list,
    queryFn: listAltAccounts,
    enabled: !!accessToken,
  });

  const removeMutation = useMutation({
    mutationFn: removeAltAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountsKeys.list }),
  });

  // ── Add account modal state ──────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <PanelSection title="Accounts">
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
            Additional Telegram accounts for parallel uploads
          </span>
          <Button size="small" onClick={() => setShowAddModal(true)}>
            Add Account
          </Button>
        </div>

        {/* Account list */}
        {isLoading ? (
          <div style={{ color: "var(--tv-text-disabled)", font: "var(--tv-type-body-sm)" }}>Loading…</div>
        ) : accounts.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "40px 16px", gap: 12,
          }}>
            <PersonAccounts20Regular style={{ width: 48, height: 48, color: "var(--tv-text-disabled)" }} />
            <h4 style={{ font: "var(--tv-type-headline)", color: "var(--tv-text-primary)", margin: 0 }}>
              No additional accounts
            </h4>
            <p style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)", margin: 0, textAlign: "center", maxWidth: 340 }}>
              Connect additional Telegram accounts to upload files in parallel.
            </p>
            <Button onClick={() => setShowAddModal(true)}>Add Account</Button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {accounts.map((account) => (
              <AltAccountCard
                key={account.id}
                account={account}
                onRemove={() => removeMutation.mutate(account.id)}
                isRemoving={removeMutation.isPending && removeMutation.variables === account.id}
              />
            ))}
          </div>
        )}
      </PanelSection>

      {/* Add account modal */}
      {showAddModal && (
        <AddAccountModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            queryClient.invalidateQueries({ queryKey: accountsKeys.list });
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 12.3: Add `AltAccountCard` component (same file, before `AccountsPanel`)**

```typescript
function StatusDot({ account }: { account: AltAccountOut }) {
  if (account.session_error) {
    return (
      <Tooltip content={account.session_error}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--tv-color-error, #e53935)", display: "inline-block" }} />
      </Tooltip>
    );
  }
  if (!account.last_checked_at) {
    return <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--tv-color-warning, #fb8c00)", display: "inline-block" }} />;
  }
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--tv-color-success, #43a047)", display: "inline-block" }} />;
}

function AltAccountCard({
  account,
  onRemove,
  isRemoving,
}: {
  account: AltAccountOut;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: 8,
      background: "var(--tv-surface-secondary)",
    }}>
      <StatusDot account={account} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "var(--tv-type-body)", color: "var(--tv-text-primary)", fontWeight: 500 }}>
          {account.label ?? "Unnamed account"}
        </div>
        <div style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)" }}>
          ID: {account.telegram_id}
        </div>
      </div>
      <Button
        size="small"
        variant="ghost"
        onClick={() => setConfirmOpen(true)}
        disabled={isRemoving}
      >
        Remove
      </Button>
      {confirmOpen && (
        <ConfirmModal
          title="Remove account?"
          message={`Remove "${account.label ?? account.telegram_id}" from TeleVault? This will revoke its channel admin rights.`}
          confirmLabel="Remove"
          onConfirm={() => { setConfirmOpen(false); onRemove(); }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 12.4: Add `AddAccountModal` component (same file)**

Study the existing login UI in `frontend/src/features/auth/LoginPage.tsx` (or wherever phone/OTP/QR login is rendered) to understand the exact component names and props. Then replicate the flow here, wired to the alt-account endpoints.

The modal should:
1. Show two tabs: "Phone / OTP" and "QR Code"
2. Phone tab: phone input → send OTP button → OTP input field → submit. On `PASSWORD_REQUIRED` error, show password field.
3. QR tab: call `initQrLogin()`, display the `qr_url` (as a `<img>` or QR renderer), poll every 2 seconds via `pollQrLogin()`. On `status="error"` with 2FA message, show the message and suggest switching to phone tab.
4. On success from either flow, call `onSuccess()` and show any `enrollment_failures` as a dismissible warning before closing.

```typescript
function AddAccountModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState<"phone" | "qr">("phone");
  const [phone, setPhone] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enrollWarnings, setEnrollWarnings] = useState<{ channel_id: string; error: string }[]>([]);

  // QR state
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pollToken, setPollToken] = useState<string | null>(null);

  // Poll QR every 2s
  useEffect(() => {
    if (tab !== "qr" || !pollToken) return;
    const interval = setInterval(async () => {
      try {
        const res = await pollQrLogin(pollToken);
        if (res.status === "complete" && res.account) {
          clearInterval(interval);
          if (res.enrollment_failures?.length) setEnrollWarnings(res.enrollment_failures);
          else onSuccess();
        } else if (res.status === "error") {
          clearInterval(interval);
          setError(res.message ?? "QR login failed");
        }
      } catch (e: any) {
        clearInterval(interval);
        setError(e?.message ?? "QR polling failed");
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [pollToken, tab]);

  async function handleInitQr() {
    setLoading(true);
    setError(null);
    try {
      const { poll_token, qr_url } = await initQrLogin();
      setPollToken(poll_token);
      setQrUrl(qr_url);
    } catch (e: any) {
      setError(e?.message ?? "Failed to start QR login");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    setLoading(true);
    setError(null);
    try {
      await startPhoneLogin(phone);
      setCodeSent(true);
    } catch (e: any) {
      setError(e?.detail?.message ?? e?.message ?? "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitOtp() {
    setLoading(true);
    setError(null);
    try {
      const res = await submitOtp(phone, code, needsPassword ? password : undefined);
      if (res.enrollment_failures?.length) {
        setEnrollWarnings(res.enrollment_failures);
      } else {
        onSuccess();
      }
    } catch (e: any) {
      const errCode = e?.detail?.error ?? e?.error;
      if (errCode === "PASSWORD_REQUIRED") {
        setNeedsPassword(true);
        setError("This account has 2FA enabled. Please enter your password.");
      } else {
        setError(e?.detail?.message ?? e?.message ?? "Login failed");
      }
    } finally {
      setLoading(false);
    }
  }

  if (enrollWarnings.length > 0) {
    return (
      <Modal onClose={onSuccess}>
        <div style={{ padding: 24 }}>
          <h3>Account added</h3>
          <p style={{ color: "var(--tv-color-warning)" }}>
            Some channels could not be updated automatically:
          </p>
          <ul>
            {enrollWarnings.map((f) => (
              <li key={f.channel_id}>{f.channel_id}: {f.error}</li>
            ))}
          </ul>
          <Button onClick={onSuccess}>Close</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Add Telegram Account">
      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Button variant={tab === "phone" ? "primary" : "ghost"} size="small" onClick={() => setTab("phone")}>Phone / OTP</Button>
        <Button variant={tab === "qr" ? "primary" : "ghost"} size="small" onClick={() => { setTab("qr"); handleInitQr(); }}>QR Code</Button>
      </div>

      {error && <div style={{ color: "var(--tv-color-error)", marginBottom: 12 }}>{error}</div>}

      {tab === "phone" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!codeSent ? (
            <>
              <input placeholder="Phone number (e.g. +1234567890)" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid var(--tv-border)" }} />
              <Button onClick={handleSendOtp} disabled={loading || !phone}>Send OTP</Button>
            </>
          ) : (
            <>
              <input placeholder="OTP code" value={code} onChange={(e) => setCode(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid var(--tv-border)" }} />
              {needsPassword && (
                <input type="password" placeholder="2FA password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid var(--tv-border)" }} />
              )}
              <Button onClick={handleSubmitOtp} disabled={loading || !code}>Confirm</Button>
            </>
          )}
        </div>
      )}

      {tab === "qr" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          {qrUrl ? (
            <>
              <img src={qrUrl} alt="Telegram QR login" style={{ width: 200, height: 200 }} />
              <p style={{ font: "var(--tv-type-body-sm)", color: "var(--tv-text-secondary)", textAlign: "center" }}>
                Scan with your Telegram app → Settings → Devices → Link desktop device
              </p>
            </>
          ) : (
            <div>Loading QR code…</div>
          )}
        </div>
      )}
    </Modal>
  );
}
```

Add the necessary imports at the top of the file: `useState`, `useEffect`, `useMutation`, `useQuery`, `useQueryClient` from React/TanStack Query, plus the functions from `api/accounts.ts` and types.

**Note:** Replace `Modal`, `Button`, `ConfirmModal`, `Tooltip` with the actual component names used in this file. Check existing imports.

- [ ] **Step 12.5: Verify in the browser**

1. Open the app, go to Settings → Accounts.
2. Confirm the empty state shows with "Add Account" button.
3. Click "Add Account" — confirm the modal opens with phone and QR tabs.
4. (Manual test with a real alt account if available.)

- [ ] **Step 12.6: Commit**

```bash
git add frontend/src/themes/default/components/SettingsPanels.tsx
git commit -m "feat: implement AccountsPanel with add/remove alt account UI"
```

---

## Task 13: Final Integration Check & PR

### Steps

- [ ] **Step 13.1: Restart backend from scratch and verify all routes**

```bash
cd backend
uvicorn app.main:app --reload
```

Visit `http://localhost:8000/docs`. Confirm:
- `/api/v1/accounts/` GET, POST /add/phone, POST /add/otp, POST /add/qr/init, GET /add/qr/poll, DELETE /{account_id} all appear
- `/api/v1/auth/accounts` does NOT appear (was removed)

- [ ] **Step 13.2: Run the frontend and verify the Accounts panel**

```bash
cd frontend
npm run dev
```

1. Log in normally — confirm login still works.
2. Go to Settings → Accounts — confirm the panel renders.
3. Check that no console errors appear.

- [ ] **Step 13.3: Upload a file and confirm it still works with a single account**

Upload any file via the UI. Confirm it completes successfully. Check the DB to confirm `Split.telegram_account_id` is set correctly.

```bash
cd backend
python -c "
import asyncio
from app.db.session import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as s:
        r = await s.execute(text('SELECT id, telegram_account_id FROM splits ORDER BY created_at DESC LIMIT 5'))
        for row in r.fetchall():
            print(row)

asyncio.run(check())
"
```

- [ ] **Step 13.4: Final commit and push**

```bash
git add -A
git status  # confirm nothing unexpected
git commit -m "chore: final integration check for feature/multi-account"
git push -u origin feature/multi-account
```

- [ ] **Step 13.5: Open PR**

```bash
gh pr create \
  --title "feat: multi-account parallel uploads" \
  --body "$(cat <<'EOF'
## Summary

- Alt Telegram accounts can be connected via phone/OTP or QR login
- File splits distributed across accounts in round-robin order and uploaded in parallel via `asyncio.gather()`
- All alt accounts automatically enrolled as channel co-admins (explicit `delete_messages=True`)
- 30-minute health checks detect and flag revoked sessions
- AccountsPanel UI in Settings replaces "Coming soon" placeholder

## Test plan

- [ ] Primary login (phone/OTP and QR) still works
- [ ] Add alt account via phone/OTP flow
- [ ] Add alt account via QR flow
- [ ] Alt account appears in Accounts panel with green status dot
- [ ] Upload a file with 2+ accounts connected — confirm parallel splits in logs
- [ ] Remove alt account — confirm it disappears from panel
- [ ] Revoke an alt account's session from Telegram — confirm red status dot appears within 30 min
EOF
)"
```

---

## Notes for Implementer

- **No existing test suite.** All verification steps are manual. If adding tests, use `pytest` + `pytest-asyncio` + `httpx.AsyncClient` for backend endpoint tests.
- **`Modal` and `ConfirmModal` components:** Check `SettingsPanels.tsx` existing imports to find the exact component names and props used in the project.
- **`getAccessToken` in `accounts.ts`:** Match exactly how other frontend API files retrieve the bearer token (inspect `files.ts` or `auth.ts` for the pattern).
- **Telethon `EditAdminRequest`:** Requires the channel's integer ID and the user's integer Telegram ID — both are stored in the DB. The `rank=""` argument is required to avoid Telethon raising a type error.
- **Gemini is working in parallel** on a separate branch. The files in the "Files Touched" table in the spec are exclusively owned by this feature branch. Do not touch files outside that list without confirming with the project owner.
