# Parallel Upload Worker Pool — Design Spec

**Date:** 2026-03-21
**Status:** Approved
**Topic:** File-level parallel uploads using a backend worker pool scaled to connected Telegram account count

---

## Problem

TeleVault supports multiple Telegram accounts for parallel uploads, but the current implementation only parallelises at the **split level** (parts of a single file >2 GB). Small files (<2 GB) always produce one split, which always uses account 0. Concurrently, the frontend serialises all uploads one-at-a-time via a global promise chain. The result: extra accounts provide zero benefit for the common case of many small files.

---

## Goal

When a user has N connected Telegram accounts, up to N files should upload to Telegram concurrently. Splits within a large file continue to be distributed across all accounts. Adding or removing an account adjusts parallelism immediately on the backend; the frontend adapts at the next drop event.

---

## Architecture Overview

Three layers of change:

1. **Backend worker pool** — a new `UploadWorkerPool` singleton manages per-user asyncio queues and N worker tasks. Workers are fungible; account assignment is determined per-job via a round-robin slot counter.
2. **Backend account-offset split assignment** — `execute_upload` receives an `account_offset` so concurrent files start on different accounts.
3. **Frontend N-concurrent semaphore** — `handleDrop` reads `GET /api/v1/accounts/concurrency`, then runs up to N XHR uploads in parallel. SSE tracking detaches from the upload slot so Telegram processing never blocks the next file's bytes from uploading.

---

## Backend Changes

### New: `app/services/upload_queue.py`

#### `UploadJob` dataclass
All parameters required by `execute_upload`, plus `account_offset: int` (assigned by `UploadWorkerPool.submit`).

```
UploadJob:
  registry: OperationRegistry
  pool: ClientPool
  operation_id: str
  file_id: UUID
  owner_id: int
  folder_id: UUID | None
  channel: Channel
  filename: str
  mime_type: str | None
  total_size: int
  file_hash: str
  tmp_path: str
  account_offset: int  # assigned at submit time
```

#### `UploadWorkerPool` class

State:
- `_queues: dict[int, asyncio.Queue[UploadJob]]` — keyed by `owner_telegram_id`
- `_workers: dict[int, list[asyncio.Task]]` — per user, currently live worker tasks
- `_slot_counter: dict[int, int]` — ever-increasing; no `await` between read and write (asyncio-safe)
- `_registry: OperationRegistry`
- `_pool: ClientPool`

Methods:

**`async submit(owner_id: int, job: UploadJob) -> None`**
Assigns `job.account_offset = self._slot_counter.get(owner_id, 0)`, increments counter, puts job on user's queue. Ensures a queue exists for that user.

**`def set_worker_count(owner_id: int, count: int) -> None`**
- `count` is clamped to `max(1, count)`.
- If current worker count < target: spawn additional `_worker` tasks.
- If current worker count > target: cancel excess tasks from the tail of the list (tasks handle `asyncio.CancelledError` gracefully — any in-progress `execute_upload` runs to completion or rollback first).
- New workers are appended to `_workers[owner_id]`.

**`def get_worker_count(owner_id: int) -> int`**
Returns `len(self._workers.get(owner_id, []))`.

**`async _worker(owner_id: int) -> None`**
```python
queue = self._queues[owner_id]
while True:
    job = await queue.get()
    try:
        await execute_upload(
            registry=job.registry,
            pool=job.pool,
            operation_id=job.operation_id,
            file_id=job.file_id,
            owner_id=job.owner_id,
            folder_id=job.folder_id,
            channel=job.channel,
            filename=job.filename,
            mime_type=job.mime_type,
            total_size=job.total_size,
            file_hash=job.file_hash,
            tmp_path=job.tmp_path,
            account_offset=job.account_offset,
        )
    except Exception:
        logger.exception("Worker caught unhandled exception for operation %s", job.operation_id)
    finally:
        queue.task_done()
```

**`async shutdown() -> None`**
Cancels all worker tasks across all users; awaits their completion with `asyncio.gather(..., return_exceptions=True)`.

---

### Modified: `app/services/upload.py`

**`execute_upload` signature change:**
```python
async def execute_upload(
    ...,
    account_offset: int = 0,   # NEW
) -> None:
```

**Split account assignment change** (in `_upload_split`):
```python
# Before:
account_id, client = client_snapshot[split_index % len(client_snapshot)]

# After:
account_id, client = client_snapshot[(account_offset + split_index) % len(client_snapshot)]
```

No other changes to `execute_upload`. The `asyncio.gather` parallelism over splits is unchanged.

---

### Modified: `app/api/files.py`

Both `POST /api/v1/files/upload` and `POST /api/v1/files/upload/finalize`:

**Before:**
```python
task = asyncio.create_task(execute_upload(...))
_background_tasks.add(task)
task.add_done_callback(_background_tasks.discard)
```

**After:**
```python
await upload_worker_pool.submit(owner_id, UploadJob(
    registry=operation_registry,
    pool=pool,
    operation_id=operation_id,
    file_id=file_id,
    owner_id=owner_id,
    folder_id=folder_id,
    channel=channel_record,
    filename=filename,
    mime_type=mime_type,
    total_size=total_size,
    file_hash=file_hash,
    tmp_path=tmp_path,
    account_offset=0,  # overwritten by submit()
))
```

`operation_id` is still pre-created by `prepare_upload` before submission and returned in the HTTP 202 response. The SSE progress stream starts immediately on `operation_id` creation regardless of when the worker picks up the job. The `_background_tasks` set is removed (workers own task lifetimes).

---

### Modified: `app/telegram/client_pool.py`

**New method: `get_active_count(owner_telegram_id: int) -> int`**
```python
def get_active_count(self, owner_telegram_id: int) -> int:
    return len(self.get_all_clients_for_user(owner_telegram_id))
```

**Health check loop:** After removing a revoked account from `_clients` and `_owners`, call the registered worker-count callback:
```python
# After: self._clients.pop(account_id, None); self._owners.pop(account_id, None)
for cb in self._on_account_change_callbacks:
    cb(owner_id, self.get_active_count(owner_id))
```

**New state and method:**
```python
self._on_account_change_callbacks: list[Callable[[int, int], None]] = []

def register_account_change_callback(self, cb: Callable[[int, int], None]) -> None:
    self._on_account_change_callbacks.append(cb)
```

---

### Modified: `app/api/accounts.py`

**After OTP login success:**
```python
await pool.add_client(ta.id, session_string, current_user.telegram_id)
upload_worker_pool.set_worker_count(
    current_user.telegram_id,
    pool.get_active_count(current_user.telegram_id),
)
```

**After QR login success:** Same.

**After account removal:**
```python
await pool.remove_client(account_id)
upload_worker_pool.set_worker_count(
    current_user.telegram_id,
    pool.get_active_count(current_user.telegram_id),
)
```

**New endpoint:**
```
GET /api/v1/accounts/concurrency
Response: {"concurrency": <int, always >= 1>}
```
Returns `upload_worker_pool.get_worker_count(current_user.telegram_id)`. Requires auth. Added to the existing `accounts` router.

---

### Modified: `app/main.py`

**Instantiation:**
```python
from app.services.upload_queue import UploadWorkerPool

upload_worker_pool = UploadWorkerPool(operation_registry, pool)
```

**Startup (after `pool.initialize()`):**
```python
# Spawn workers for all users already in the pool
seen_owners: set[int] = set()
for account_id, owner_id in pool._owners.items():
    if owner_id not in seen_owners:
        seen_owners.add(owner_id)
        upload_worker_pool.set_worker_count(
            owner_id, pool.get_active_count(owner_id)
        )

# Register health-check callback
pool.register_account_change_callback(upload_worker_pool.set_worker_count)
```

**Shutdown:**
```python
await upload_worker_pool.shutdown()
```

**Dependency injection:** Expose `upload_worker_pool` via `app.state` and a `get_upload_worker_pool` dep in `app/core/deps.py`, mirroring how `ClientPool` is injected.

---

## Frontend Changes

### `frontend/src/api/accounts.ts`

Add:
```typescript
export async function getConcurrency(): Promise<{ concurrency: number }> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/accounts/concurrency`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`getConcurrency failed: ${res.status}`);
  return res.json();
}
```

---

### `frontend/src/features/explorer/FileExplorer.tsx`

#### Remove
- Module-level `let _uploadQueue: Promise<void> = Promise.resolve()`
- The `_uploadQueue.then(async () => { for ... })` serial chain

#### Add: `createSemaphore(n: number)`
A simple semaphore factory (defined in the module or extracted to `src/lib/semaphore.ts`):
```typescript
function createSemaphore(n: number) {
  let running = 0;
  const queue: Array<() => void> = [];
  return {
    async acquire() {
      if (running < n) { running++; return; }
      await new Promise<void>((resolve) => queue.push(resolve));
      running++;
    },
    release() {
      running--;
      queue.shift()?.();
    },
  };
}
```

#### New `handleDrop` flow

```
1. Fetch getConcurrency() → N (fallback to 1 on error)
2. Create semaphore(N)
3. Add all files to store as "queued" (unchanged)
4. For each file: launch an independent async task (not awaited in sequence):
   a. semaphore.acquire()
   b. setStatus(tempId, "hashing")
   c. hash file
   d. uploadFile() — XHR bytes to backend, get back operationId
   e. promoteUpload(tempId, operationId); setStatus(operationId, "processing")
   f. semaphore.release()   ← slot freed; next file's bytes can start
   g. watchCompletion(operationId, file.name)  ← detached, does not block
```

All file tasks are launched with `Promise.all` (or equivalent), so hashing and XHR uploads for up to N files run concurrently. `semaphore.acquire/release` limits how many are in the XHR upload phase simultaneously.

#### `watchCompletion(opId, fileName)`

Extracted function (not inline in the loop). Contains the SSE-watching logic currently inside the serial queue:
- Creates an `EventSource` on `opId`
- On `done`: `setStatus(opId, "complete")`, `queryClient.invalidateQueries({ queryKey: fileKeys.all })`, `toast.success(...)`
- On `error`: `setStatus(opId, "error", msg)`, `toast.error(...)`
- Same exponential backoff retry logic (up to 8 retries, max 16 s delay)
- Also subscribes to the Zustand store as a second resolution path (unchanged from current queue logic)

The store subscription (`useUploadStore.subscribe`) for each file runs in `watchCompletion` — unchanged logic, just moved out of the serial loop.

---

## Invariants & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| User has 1 account | 1 worker — identical to current behaviour, no regression |
| Account added mid-session | `set_worker_count` called immediately; backend starts processing N+1 files in parallel; frontend picks up new N on next drop |
| Account removed mid-session | `set_worker_count` called immediately; excess worker task is cancelled after its current job completes |
| Health check revokes a session | Same as removal via callback |
| Worker task cancelled mid-upload | `execute_upload` catches `CancelledError` only after `asyncio.gather` returns; in-flight Telegram uploads complete or roll back before the task exits |
| `getConcurrency` fails (network) | Frontend falls back to `concurrency = 1` — serial behaviour, no crash |
| Backend queue fills up | `asyncio.Queue` is unbounded — uploads enqueue and wait; no data loss |
| Large file (>2 GB, multiple splits) | `account_offset` shifts which account handles split 0; remaining splits distribute across all accounts as before |
| Two large files uploading concurrently | Each uses a different `account_offset`; their splits interleave across accounts |
| Duplicate file (409) | Handled in `prepare_upload` before job is submitted to the queue — unchanged |

---

## What Does Not Change

- `OperationRegistry`, all SSE infrastructure, `progress.py` — unchanged
- `_SplitReader`, `rollback_splits`, `prepare_upload`, `check_duplicate` — unchanged
- `useUploadSSE` hook — unchanged (still used by `TransferItem` for UI progress display)
- All download endpoints — unchanged
- `TransfersTray` and all other UI components — unchanged
- Database models and migrations — unchanged
- Auth, channel, folder APIs — unchanged

---

## File Change Summary

| File | Change |
|------|--------|
| `backend/app/services/upload_queue.py` | **New** — `UploadJob`, `UploadWorkerPool` |
| `backend/app/services/upload.py` | Add `account_offset` param; update split assignment |
| `backend/app/api/files.py` | Submit to worker pool instead of `create_task`; inject `upload_worker_pool` |
| `backend/app/api/accounts.py` | Call `set_worker_count` on add/remove; add `/concurrency` endpoint |
| `backend/app/telegram/client_pool.py` | Add `get_active_count`; add callback system |
| `backend/app/core/deps.py` | Add `get_upload_worker_pool` dependency |
| `backend/app/main.py` | Instantiate pool; spawn workers on startup; register callback; shutdown |
| `frontend/src/api/accounts.ts` | Add `getConcurrency()` |
| `frontend/src/features/explorer/FileExplorer.tsx` | Replace serial queue with semaphore; extract `watchCompletion` |
