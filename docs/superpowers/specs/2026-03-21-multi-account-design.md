# Multi-Account Parallel Uploads — Design Spec

**Date:** 2026-03-21
**Status:** Approved
**Branch:** `feature/multi-account`

---

## Overview

Allow users to connect additional Telegram accounts ("alt accounts") to TeleVault. These accounts are used to upload file splits in parallel, increasing aggregate throughput. All connected accounts are co-admins of all TeleVault-registered channels, so any account can manage messages in any channel.

The primary account cannot be removed and is not shown in the Accounts settings panel. The Accounts panel manages alt accounts only.

---

## Goals

- Connect N alt Telegram accounts via the existing phone/OTP or QR login flow
- Distribute file splits across all available accounts in round-robin order during upload
- Upload splits in parallel using `asyncio.gather()`
- Automatically enroll alt accounts as admins in all TeleVault-registered channels on add
- Automatically remove alt accounts from all TeleVault-registered channels on remove
- Keep alt accounts connected indefinitely without user intervention
- Detect revoked sessions via 30-minute health checks and surface them in the UI

---

## Out of Scope

- Power-user session string import
- Multi-worker Uvicorn deployments (this feature is scoped to single-process deployments; round-robin correctness depends on a single shared ClientPool)

---

## Architecture: Approach B

Dedicated `/api/v1/accounts/` endpoints. Existing `api/auth.py` modified minimally. Shared login helper extracted to `services/telegram_login.py`.

---

## Key Access Model

All alt accounts are enrolled as channel co-admins with **explicit permissions: `change_info=False`, `post_messages=True`, `edit_messages=True`, `delete_messages=True`, `invite_users=True`** (passed to Telethon's `editAdmin` / `ChatAdminRights`). This ensures the `delete_messages` right is explicitly granted, so any co-admin can delete any message in the channel regardless of who posted it.

Because of this:

- **Downloads:** `download_stream()` uses `get_client_for_user()` — the existing method that returns the **first active client** for a user (unchanged). Correct because co-admin membership lets any account fetch messages by `message_id`. Telethon's `download_media` fetches the message to get a session-valid reference — it does not use the stored `file_id_tg` directly.
- **Deletes:** `delete_file()` and `bulk_delete_files()` use `get_client_for_user()` (same first-active-client logic). Correct because `delete_messages=True` is explicitly granted during enrollment so any co-admin can delete any message.
- `get_client_for_user()` is **not changed** — it remains "return first active client". It is not an alias for round-robin. Round-robin is only used in the upload path via the explicit snapshot.

**No changes to download or delete code paths.**

---

## Backend

### Database Changes

**Model:** `backend/app/db/models/telegram_account.py`

**Migration:** new Alembic revision. The `UniqueConstraint("owner_telegram_id", "telegram_id")` already exists in the current schema — no dedup step needed.

Three new columns on `telegram_accounts`:

| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| `is_primary` | Boolean | No | False | Marks the primary login account. DELETE endpoint rejects `is_primary=True`. |
| `last_checked_at` | DateTime | Yes | null | Last successful health check timestamp |
| `session_error` | String | Yes | null | Error message if session revoked; null if healthy |

**Backfill:** `UPDATE telegram_accounts SET is_primary = (telegram_id = owner_telegram_id)`. This is correct and safe: the `UniqueConstraint` already exists, and in the current system the primary account always has `telegram_id == owner_telegram_id` (set via `me.id` in `store_telegram_account`).

**`store_telegram_account()` gains an `is_primary: bool` parameter** (default `False`). The primary auth path passes `is_primary=True`; the new alt-account add path passes `is_primary=False`. This prevents alt accounts from accidentally getting `is_primary=True`.

### Endpoint Changes

`GET /api/v1/auth/accounts` **removed**, replaced by `GET /api/v1/accounts/`. Remove `listAccounts()` and `authKeys.accounts` from `frontend/src/api/auth.ts`. Update all callers. Frontend and backend deployed atomically.

### New Files

#### `backend/app/services/telegram_login.py`

Shared login helper. `namespace` parameter prefixes all pending dict keys to prevent collision:

- Phone key: `f"{namespace}:{phone}"` (e.g. `"primary:+1234"`, `"add_account:+1234"`)
- QR poll-token key: `f"{namespace}:{poll_token}"`

Functions: `start_phone_login(pool, phone, namespace)`, `finish_phone_login(pool, phone, code, password, namespace)`, `start_qr_login(pool, namespace)`, `poll_qr_login(pool, poll_token, namespace)`.

Primary auth refactored to call these with `namespace="primary"`. Alt-account add uses `namespace="add_account"`.

**QR + 2FA edge case:** If an alt account has 2FA enabled, Telegram's QR login raises `SessionPasswordNeededError` after scanning. This case is **not supported** — the poll endpoint returns `status="error"` with message `"2FA is enabled on this account. Please use phone login instead."` The frontend displays this message in the modal, allowing the user to switch to the phone flow. No partial auth state is retained.

#### `backend/app/services/channel_membership.py`

`enrollment_failures` is a **transient in-memory list** of `{"channel_id": str, "error": str}` dicts, returned in API response bodies. Nothing is persisted to DB.

Enrollment uses the **channel's owning client** (`channel.telegram_account_id` → `ClientPool`). Fallback: any other active client for the user. If none available, append to `enrollment_failures` and continue.

Admin permissions granted via `editAdmin` / `ChatAdminRights`: `post_messages=True`, `edit_messages=True`, `delete_messages=True`, `invite_users=True`, `change_info=False`.

Functions:

- `enroll_account_in_all_channels(pool, alt_telegram_id, db_session, owner_telegram_id) -> list[dict]`
- `enroll_all_accounts_in_channel(pool, channel, db_session, owner_telegram_id) -> list[dict]`
- `remove_account_from_all_channels(pool, alt_telegram_id, db_session, owner_telegram_id) -> list[dict]`

#### `backend/app/api/accounts.py`

Router at `/api/v1/accounts`. All endpoints require JWT.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List `is_primary=False` accounts for current user |
| `POST` | `/add/phone` | Start phone login — body: `{phone: str}` — response: `204 No Content` (phone stored as pending via `namespace:phone` key) |
| `POST` | `/add/otp` | Submit OTP — body: `{phone: str, code: str, password?: str}` — response: `AddAccountResponse` on success |
| `POST` | `/add/qr/init` | Start QR login — response: `{poll_token: str, qr_url: str}` (same shape as existing `/auth/qr/init`) |
| `GET` | `/add/qr/poll` | Poll QR — query `?poll_token=str` — response: `{status: "pending"\|"complete"\|"error", message?: str}`. On `status="complete"`, also returns `account: TelegramAltAccountOut` and `enrollment_failures: list[dict]` (i.e. same shape as `AddAccountResponse` plus `status`) |
| `DELETE` | `/{account_id}` | Remove alt account — 403 if `is_primary=True` |

**`GET /` response:** list of `TelegramAltAccountOut`:

```python
class TelegramAltAccountOut(BaseModel):
    id: UUID
    telegram_id: int
    label: str | None
    is_active: bool
    last_checked_at: datetime | None
    session_error: str | None
```

**`POST /add/otp` and `GET /add/qr/poll` success response** (`AddAccountResponse`):

```python
class AddAccountResponse(BaseModel):
    account: TelegramAltAccountOut
    enrollment_failures: list[dict]  # [{channel_id: str, error: str}]
```

**On successful add:**

1. `store_telegram_account(is_primary=False)` — **commits** to DB
2. `pool.add_client()` called only after commit succeeds
3. `enroll_account_in_all_channels()` called
4. Returns `AddAccountResponse`

**On remove:**

1. Validate account belongs to current user and `is_primary=False` (403 otherwise)
2. `remove_account_from_all_channels()` called — failures are **logged but do not block the operation**. The account is removed from TeleVault regardless of whether channel unenrollment succeeds on every channel. No `enrollment_failures` is returned to the caller on delete (the account is gone either way).
3. Client disconnected from pool — **note:** any in-flight upload using this client raises a Telethon disconnect exception, causing that upload to fail and the file to be marked `status="failed"`. This is documented acceptable behavior.
4. `TelegramAccount.is_active = False` committed (soft delete)

### Changes to Existing Files

#### `backend/app/telegram/client_pool.py`

New additions (existing `get_client_for_user()` untouched):

- `get_all_clients_for_user(owner_telegram_id) -> list[tuple[UUID, TelegramClient]]` — all active `(account_id, client)` pairs

- `_rr_index: dict[int, int]` — per-user counter. Increment is a **single synchronous expression with no `await` between read and write**: `self._rr_index[uid] = self._rr_index.get(uid, 0) + 1`. Safe in asyncio's cooperative multitasking (single process). Not safe across multiple Uvicorn workers — this feature is single-process only (see Out of Scope).

- `get_next_client_round_robin(owner_telegram_id) -> tuple[UUID, TelegramClient]` — for non-upload callers

- **Health check loop** (`start_health_check_loop(db_session_factory)`): background task, every 30 minutes:
  1. `client.is_connected()` → if False, reconnect via decrypted session string
  2. `client.get_me()` → update `last_checked_at` on success
  3. Only `AuthKeyUnregisteredError`, `AuthKeyDuplicatedError`, `UserDeactivatedError`, `UserDeactivatedBanError` trigger `is_active=False` + `session_error` + pool removal. All other exceptions → log, skip, retry next cycle.

#### `backend/app/services/upload.py`

Changes to `execute_upload()`:

1. **Snapshot:** `client_snapshot: list[tuple[UUID, TelegramClient]] = pool.get_all_clients_for_user(owner_id)`. The `channel_telegram_id` (Telegram integer channel ID) is also captured once at snapshot time from the `channel` parameter — it is shared across all splits.

2. **Assign per split:** `(account_id, client) = client_snapshot[split_index % len(client_snapshot)]`

3. **Each split: own `_SplitReader` instance** (not shared between coroutines)

4. **Each coroutine captures `(account_id, client, channel_telegram_id)`** and returns `UploadedSplitResult(split_index, split_size, uploaded, account_id, client, channel_telegram_id)` on success.

5. **`Split.telegram_account_id`** = uploading `account_id` (not channel owner's account)

6. **Execute:** `results = await asyncio.gather(*coroutines, return_exceptions=True)`

7. **Rollback assembly:** Iterate `results`; for entries that are `UploadedSplitResult` (succeeded before the failure), build `rollback_list = [(r.client, r.channel_telegram_id, r.uploaded.message_id) for r in results if isinstance(r, UploadedSplitResult)]`. Entries that are exceptions are skipped (nothing was uploaded for those splits).

8. **`rollback_splits` updated** to accept `list[tuple[TelegramClient, int, int]]` = `[(client, channel_telegram_id, message_id)]`. Each split deleted by its uploading client.

9. Progress events from all splits merge into the SSE stream via existing `OperationRegistry`.

**Single-account:** one coroutine in `gather` — identical to today.

#### `backend/app/api/channels.py` (minor)

When a new channel is created, call `enroll_all_accounts_in_channel()`.

#### `backend/app/api/auth.py` (minor)

- Remove `GET /api/v1/auth/accounts`
- Refactor phone/OTP/QR to call `services/telegram_login.py` with `namespace="primary"`
- Pass `is_primary=True` to `store_telegram_account()`

---

## Frontend

### New File: `frontend/src/api/accounts.ts`

```typescript
interface AltAccountOut {
  id: string;
  telegram_id: number;
  label: string | null;
  is_active: boolean;
  last_checked_at: string | null;
  session_error: string | null;
}

interface AddAccountResponse {
  account: AltAccountOut;
  enrollment_failures: { channel_id: string; error: string }[];
}
```

Functions: `listAccounts()`, `startPhoneLogin(phone)`, `submitOtp(phone, code, password?)`, `initQrLogin()`, `pollQrLogin(poll_token)`, `removeAccount(account_id)`.

### Changes: `frontend/src/api/auth.ts`

Remove `listAccounts()` and `authKeys.accounts`. Update all callers to use `api/accounts.ts`.

### Changes: `frontend/src/themes/default/components/SettingsPanels.tsx`

Replace `AccountsPanel` placeholder:

- **Account list:** Cards with label, `telegram_id`, status dot (green = connected, yellow = `last_checked_at` null/stale, red = `session_error` non-null with tooltip), Remove button with confirmation
- **"Add Account" button:** Modal reusing existing phone/OTP and QR login components, wired to `/api/v1/accounts/add/*`. QR 2FA error shown inline with hint to use phone login. On success, `enrollment_failures` shown as dismissible warning.
- **Empty state:** Helpful message + prominent Add Account button
- **Data fetching:** TanStack Query `useQuery` + `useMutation`, cache invalidated on success

---

## Files Touched (Gemini must avoid)

| File | Type |
|------|------|
| `backend/app/api/accounts.py` | new |
| `backend/app/services/telegram_login.py` | new |
| `backend/app/services/channel_membership.py` | new |
| `backend/alembic/versions/xxx_multi_account_fields.py` | new |
| `backend/app/telegram/client_pool.py` | modified |
| `backend/app/services/upload.py` | modified |
| `backend/app/services/auth.py` | modified (`store_telegram_account` gains `is_primary` param) |
| `backend/app/db/models/telegram_account.py` | modified |
| `backend/app/api/channels.py` | modified (minor) |
| `backend/app/api/auth.py` | modified (remove old endpoint, refactor to shared helper) |
| `frontend/src/api/accounts.ts` | new |
| `frontend/src/api/auth.ts` | modified (remove listAccounts) |
| `frontend/src/themes/default/components/SettingsPanels.tsx` | modified (AccountsPanel only) |

---

## Key Invariants

1. `is_primary=True` not deletable (403). Backfill: `is_primary = (telegram_id == owner_telegram_id)`. `UniqueConstraint` already exists — no dedup needed.
2. Co-admin grant explicitly includes `delete_messages=True` so any account can delete any channel message.
3. Download and delete code paths unchanged — co-admin access covers all operations.
4. Upload snapshot is `list[tuple[UUID, TelegramClient]]`, taken once at upload start.
5. `rollback_splits` accepts `list[tuple[TelegramClient, int, int]]`. Rollback list assembled from successful `UploadedSplitResult` entries in gather output. `channel_telegram_id` is captured at snapshot time (shared across all splits).
6. `Split.telegram_account_id` = uploading account's ID.
7. Commit-before-pool on alt-account add only. Primary login path commit ordering unchanged.
8. Namespace key format: `f"{namespace}:{key}"` in all pending dicts.
9. `enrollment_failures` = transient in-memory list; not persisted to DB.
10. QR 2FA for alt accounts returns `status="error"` with message directing user to phone login.
11. Account removal mid-upload causes upload failure (file marked `failed`). Documented, acceptable behavior.
12. Health check: only Telethon auth errors trigger deactivation.
13. Soft delete on remove.
14. Atomic deployment (frontend + backend together).
15. Round-robin increment is synchronous/await-free. Single-process only.
16. `store_telegram_account` gains `is_primary: bool` parameter; primary auth passes `True`, alt-account add passes `False`.
