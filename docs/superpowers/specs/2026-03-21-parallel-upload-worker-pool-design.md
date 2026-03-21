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

Per-job data only — does **not** include `registry` or `pool` (those are held by `UploadWorkerPool` itself as instance state and passed when calling `execute_upload`).

```
UploadJob:
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
  account_offset: int  # assigned by submit(), not by the caller
```

#### `UploadWorkerPool` class

**Constructor:** `UploadWorkerPool(registry: OperationRegistry, pool: ClientPool)`

State:

- `_registry: OperationRegistry` — singleton, used by workers when calling `execute_upload`
- `_pool: ClientPool` — singleton, used by workers when calling `execute_upload`
- `_queues: dict[int, asyncio.Queue[UploadJob]]` — keyed by `owner_telegram_id`
- `_workers: dict[int, list[asyncio.Task]]` — per user, currently live worker tasks
- `_slot_counter: dict[int, int]` — ever-increasing round-robin offset per user

Methods:

---

**`def submit(owner_id: int, job: UploadJob) -> None`** (synchronous, not `async`)

Assigns `job.account_offset`, then enqueues the job. Must be synchronous (no `await`) to preserve atomicity of the counter increment — there must be no `await` between reading and writing `_slot_counter`.

```python
def submit(self, owner_id: int, job: UploadJob) -> None:
    slot = self._slot_counter.get(owner_id, 0)
    self._slot_counter[owner_id] = slot + 1
    job.account_offset = slot
    # put_nowait is always safe here: the queue is unbounded (maxsize=0)
    self._queues.setdefault(owner_id, asyncio.Queue()).put_nowait(job)
```

`put_nowait` is used deliberately (not `await queue.put`): the queue is unbounded (`maxsize=0`), so it never blocks. Using `await put` would introduce an `await` after the counter write but before the job lands in the queue, which is harmless here but would make the method `async` unnecessarily and risk confusion.

---

**`def set_worker_count(owner_id: int, count: int) -> None`** (synchronous)

Must only be called from within a running asyncio event loop (e.g., inside a `lifespan`, route handler, or async callback) because `asyncio.create_task` requires one.

```python
def set_worker_count(self, owner_id: int, count: int) -> None:
    count = max(1, count)
    current = self._workers.setdefault(owner_id, [])
    self._queues.setdefault(owner_id, asyncio.Queue())

    # Spawn additional workers if needed
    while len(current) < count:
        task = asyncio.create_task(self._worker(owner_id))
        current.append(task)

    # Signal excess workers to stop cooperatively (do NOT cancel mid-upload)
    while len(current) > count:
        task = current.pop()
        task.cancel()
        # The worker catches CancelledError only while waiting on queue.get(),
        # never while execute_upload is running (see _worker implementation).
```

Worker reduction is cooperative: `task.cancel()` injects `CancelledError` at the next `await`, which in the worker is always `await queue.get()` (the job-wait point), never inside `execute_upload`. This is guaranteed by the `asyncio.shield` wrapping described below.

---

**`def get_worker_count(owner_id: int) -> int`**

Returns `len(self._workers.get(owner_id, []))`.

---

**`async _worker(owner_id: int) -> None`**

The worker loop uses `asyncio.shield` around `execute_upload` so that task cancellation (from `set_worker_count` reducing the count) cannot interrupt an in-progress upload. Cancellation is only possible while the worker is blocked on `queue.get()`.

```python
async def _worker(self, owner_id: int) -> None:
    queue = self._queues[owner_id]
    while True:
        try:
            job = await queue.get()  # CancelledError may arrive here — that is safe
        except asyncio.CancelledError:
            break  # clean exit; no job was started

        try:
            # Shield protects execute_upload from external cancellation.
            # If the task is cancelled while shielded, the shield absorbs it
            # and execute_upload completes (or rolls back) fully before the
            # CancelledError propagates to this coroutine.
            await asyncio.shield(execute_upload(
                registry=self._registry,
                pool=self._pool,
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
            ))
        except asyncio.CancelledError:
            # The shield absorbed the external cancel; execute_upload finished.
            # Re-raise so the task actually exits.
            break
        except Exception:
            logger.exception(
                "Worker caught unhandled exception for operation %s", job.operation_id
            )
        finally:
            queue.task_done()
```

---

**`async shutdown() -> None`**

Shutdown follows a two-phase drain-then-cancel approach to avoid orphaning in-flight uploads:

1. **Drain phase:** Put a sentinel `None` value into each user's queue for each worker, signalling them to exit cleanly after finishing their current job. Workers detect `None` from `queue.get()` and break their loop without starting a new job.
2. **Wait phase:** `await asyncio.gather(*all_tasks, return_exceptions=True)` waits for all workers to exit. Workers currently inside `asyncio.shield(execute_upload(...))` will finish the upload (or rollback) before seeing the sentinel.
3. **Cleanup:** Clear internal state.

```python
async def shutdown(self) -> None:
    # Signal each worker to exit after its current job by injecting a None sentinel.
    for owner_id, tasks in self._workers.items():
        q = self._queues.get(owner_id)
        if q:
            for _ in tasks:
                q.put_nowait(None)  # one sentinel per worker

    all_tasks = [t for tasks in self._workers.values() for t in tasks]
    # Wait for all workers to drain and exit cleanly (no cancel needed).
    await asyncio.gather(*all_tasks, return_exceptions=True)
    self._workers.clear()
```

`_worker` must handle the `None` sentinel — see the updated `_worker` implementation below.

**Updated `_worker` to handle sentinel:**

```python
async def _worker(self, owner_id: int) -> None:
    queue = self._queues[owner_id]
    while True:
        try:
            job = await queue.get()  # CancelledError may arrive here
        except asyncio.CancelledError:
            break

        if job is None:  # shutdown sentinel
            queue.task_done()
            break

        try:
            await asyncio.shield(execute_upload(
                registry=self._registry,
                pool=self._pool,
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
            ))
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception(
                "Worker caught unhandled exception for operation %s", job.operation_id
            )
        finally:
            queue.task_done()
```

Note: `UploadJob` type annotation for the queue should be `asyncio.Queue[UploadJob | None]` to accommodate the sentinel.

---

### Modified: `app/services/upload.py`

**`execute_upload` signature change:**
```python
async def execute_upload(
    ...,
    account_offset: int = 0,   # NEW — defaults to 0 for backward compat
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
upload_worker_pool.submit(owner_id, UploadJob(
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

`operation_id` is still pre-created by `prepare_upload` before submission and returned in the HTTP 202 response immediately. The SSE stream is available as soon as `prepare_upload` returns, regardless of when a worker picks up the job. The `_background_tasks` set and its associated `asyncio.create_task` boilerplate are removed; worker tasks are owned by `UploadWorkerPool`.

---

### Modified: `app/telegram/client_pool.py`

**New method: `get_active_count(owner_telegram_id: int) -> int`**
```python
def get_active_count(self, owner_telegram_id: int) -> int:
    return len(self.get_all_clients_for_user(owner_telegram_id))
```

**New state:**
```python
self._on_account_change_callbacks: list[Callable[[int, int], None]] = []
```

**New method:**
```python
def register_account_change_callback(self, cb: Callable[[int, int], None]) -> None:
    self._on_account_change_callbacks.append(cb)
```

**Health check loop** — after removing a revoked account:
```python
# Existing lines (already present):
self._clients.pop(account_id, None)
self._owners.pop(account_id, None)

# Add immediately after:
new_count = self.get_active_count(owner_id)
for cb in self._on_account_change_callbacks:
    cb(owner_id, new_count)
```

The callback signature `(owner_telegram_id: int, new_count: int)` matches `UploadWorkerPool.set_worker_count`, so it can be registered directly: `pool.register_account_change_callback(upload_worker_pool.set_worker_count)`.

---

### Modified: `app/api/accounts.py`

**After OTP login success** (after `await pool.add_client(...)`):
```python
upload_worker_pool.set_worker_count(
    current_user.telegram_id,
    pool.get_active_count(current_user.telegram_id),
)
```

**After QR login success:** Same pattern.

**After account removal** (after `await pool.remove_client(account_id)`):
```python
upload_worker_pool.set_worker_count(
    current_user.telegram_id,
    pool.get_active_count(current_user.telegram_id),
)
```

**New endpoint** (added to the existing `accounts` router):
```
GET /api/v1/accounts/concurrency
Auth: Bearer token required
Response 200: {"concurrency": <int>}
```
Returns `upload_worker_pool.get_worker_count(current_user.telegram_id)`. Always >= 1.

---

### Modified: `app/core/deps.py`

Add a `get_upload_worker_pool` dependency, mirroring the existing `get_client_pool`:
```python
def get_upload_worker_pool(request: Request) -> UploadWorkerPool:
    return request.app.state.upload_worker_pool
```

---

### Modified: `app/main.py`

**Instantiation** (alongside existing `pool` and `operation_registry`):
```python
from app.services.upload_queue import UploadWorkerPool
upload_worker_pool = UploadWorkerPool(operation_registry, pool)
```

**Startup** (inside `lifespan`, after `await pool.initialize(session)`):
```python
# Spawn workers only for users with at least one connected account.
# Users whose sessions all failed to reconnect get no workers yet;
# set_worker_count will be called when they successfully add an account.
seen_owners: set[int] = set()
for owner_id in pool._owners.values():
    if owner_id not in seen_owners:
        seen_owners.add(owner_id)
        active = pool.get_active_count(owner_id)
        if active > 0:
            upload_worker_pool.set_worker_count(owner_id, active)

# Wire health-check callback so session revocations reduce workers automatically.
pool.register_account_change_callback(upload_worker_pool.set_worker_count)
```

Note: `set_worker_count` clamps to `max(1, count)`, so if `active` is 0 here we intentionally skip the call. Workers are only created once a valid account exists. If `active` becomes 0 due to a health-check revocation, the callback fires with `count=0`, which clamps to 1 — the lone worker will log an error on the next job (no clients available) but will not crash. This is acceptable; the user should add a new account to resume uploads.

**Shutdown** (inside `lifespan` finally block):
```python
await upload_worker_pool.shutdown()
```

**App state:**
```python
app.state.upload_worker_pool = upload_worker_pool
```

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

### `frontend/src/lib/semaphore.ts` (new file)

A correct N-slot semaphore. The critical invariant is that `release()` does not decrement `running` when it hands the slot directly to a waiter — the count stays the same (one out, one in atomically from the perspective of JS's single-threaded microtask queue).

```typescript
export function createSemaphore(n: number) {
  let running = 0;
  const waiters: Array<() => void> = [];

  return {
    async acquire(): Promise<void> {
      if (running < n) {
        running++;
        return;
      }
      await new Promise<void>((resolve) => waiters.push(resolve));
      // running is NOT incremented here — release() kept it stable
      // by not decrementing when it found a waiter.
    },
    release(): void {
      const next = waiters.shift();
      if (next) {
        // Hand the slot directly to the next waiter.
        // running stays the same: one worker finishes, one starts.
        next();
      } else {
        running--;
      }
    },
  };
}
```

---

### `frontend/src/features/explorer/FileExplorer.tsx`

#### Remove
- Module-level `let _uploadQueue: Promise<void> = Promise.resolve()`
- The `_uploadQueue.then(async () => { for (const { file, tempId } of fileEntries) { ... } })` serial chain

#### New `handleDrop` flow

```
1. Fetch getConcurrency() → N  (fallback: N = 1 on any error)
2. Create sem = createSemaphore(N)
3. Add ALL files to the store as "queued" immediately (unchanged)
4. Launch all file tasks concurrently with Promise.allSettled():
   For each { file, tempId }:
     a. await sem.acquire()
     b. setStatus(tempId, "hashing")
     c. hash file  (existing logic)
     d. await uploadFile(...)  — XHR bytes to backend; receive operationId
     e. promoteUpload(tempId, operationId); setStatus(operationId, "processing")
     f. sem.release()          ← slot freed here; next file's XHR can begin
     g. watchCompletion(operationId, file.name)  ← fire-and-forget, not awaited
```

`Promise.allSettled` (not `Promise.all`) ensures that one file's failure does not abort the others.

The semaphore controls XHR concurrency (steps a–f). Telegram processing (inside `watchCompletion`) is entirely backend-driven and runs in parallel, unblocked by the semaphore.

#### `watchCompletion(opId: string, fileName: string): void`

Extracted standalone function (not a closure inside the loop). Contains the SSE-watching logic currently inside the serial queue — **logic is unchanged**, only extracted and made independent per file.

Specifically, this function replicates the existing pattern from `FileExplorer.tsx`'s current queue SSE block:
- Creates an `EventSource` via `createProgressSource(opId, token)`
- On `done`/`complete`: `setStatus(opId, "complete")`, `queryClient.invalidateQueries({ queryKey: fileKeys.all })`, `toast.success(\`Uploaded ${fileName}\`)`
- On `error`: `setStatus(opId, "error", msg)`, `toast.error(...)`
- Exponential backoff retry on `onerror`: initial 1 s, ×2 per retry, max 16 s, up to 8 retries, then `setStatus(opId, "error", "Connection lost")`
- Zustand store subscription as a secondary resolution path (watches for status `"complete"` or `"error"` set by `useUploadSSE`)
- All cleanup (close `EventSource`, unsubscribe store) on resolution or rejection

The function is fire-and-forget from the caller's perspective (not awaited). It manages its own cleanup internally.

---

## Invariants & Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| User has 1 account | 1 worker — identical to current serial behaviour, no regression |
| Account added mid-session | `set_worker_count` called immediately; backend processes N+1 files concurrently; frontend picks up new N on next drop |
| Account removed mid-session | `set_worker_count` called immediately; excess worker exits cleanly after `queue.get()` yields `CancelledError` — never mid-upload (shielded) |
| Health check revokes session | Callback fires; same as account removal. If count drops to 0, clamped-to-1 lone worker remains. `execute_upload` raises `RuntimeError("No active Telegram client for user")` immediately when the pool is empty (no hang); the worker's `except Exception` catches it and picks up the next job |
| Worker's `execute_upload` raises | Caught by `except Exception` in `_worker`; queue slot is freed; next job proceeds |
| `getConcurrency` fails (network) | Frontend falls back to `N = 1` — serial behaviour, no crash |
| Backend queue fills | `asyncio.Queue` is unbounded — uploads enqueue indefinitely; no data loss |
| Large file (>2 GB, multiple splits) | `account_offset` shifts the starting account; remaining splits distribute across all accounts as before |
| Two large files concurrently | Each has a different `account_offset`; their splits interleave across accounts |
| Duplicate file (409) | Caught by `prepare_upload` before `submit()` — job never enters the queue |
| Startup with all sessions invalid | Workers not spawned (active count = 0, skipped); first successful account add triggers worker creation |
| `set_worker_count` called outside event loop | Must not happen — only call from `lifespan`, route handlers, or async callbacks. Documented constraint. |

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
| `backend/app/services/upload.py` | Add `account_offset` param; update split assignment one-liner |
| `backend/app/api/files.py` | `submit()` instead of `create_task`; inject `upload_worker_pool`; remove `_background_tasks` |
| `backend/app/api/accounts.py` | Call `set_worker_count` on add/remove; add `GET /concurrency` endpoint |
| `backend/app/telegram/client_pool.py` | Add `get_active_count`; add callback registration + firing in health check |
| `backend/app/core/deps.py` | Add `get_upload_worker_pool` dependency |
| `backend/app/main.py` | Instantiate pool; seed workers on startup (skip zero-account users); register callback; shutdown |
| `frontend/src/lib/semaphore.ts` | **New** — correct N-slot semaphore |
| `frontend/src/api/accounts.ts` | Add `getConcurrency()` |
| `frontend/src/features/explorer/FileExplorer.tsx` | Remove serial queue; add semaphore-based concurrent loop; extract `watchCompletion` |
