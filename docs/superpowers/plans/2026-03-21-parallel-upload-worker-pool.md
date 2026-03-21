# Parallel Upload Worker Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frontend serial upload queue with a backend worker pool that runs one asyncio worker per connected Telegram account, enabling truly parallel file uploads.

**Architecture:** A new `UploadWorkerPool` singleton (in `app/telegram/__init__.py`) holds per-user asyncio queues and N worker tasks (N = active accounts). Workers are fungible; account assignment is determined per-job via a round-robin slot counter. The frontend replaces its global serial promise chain with an N-concurrent semaphore for the XHR upload phase, then fires a detached SSE watcher per file so Telegram processing never blocks the next upload.

**Tech Stack:** Python 3.12, asyncio, FastAPI, pytest-asyncio (backend); TypeScript, React, Zustand (frontend)

**Spec:** `docs/superpowers/specs/2026-03-21-parallel-upload-worker-pool-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/tests/__init__.py` | **Create** | Makes `tests/` a package |
| `backend/tests/test_upload_queue.py` | **Create** | Unit tests for UploadWorkerPool |
| `backend/tests/test_upload_offset.py` | **Create** | Unit tests for account_offset split assignment |
| `backend/app/services/upload_queue.py` | **Create** | `UploadJob` dataclass + `UploadWorkerPool` class |
| `backend/app/services/upload.py` | **Modify** | Add `account_offset` param; update split assignment |
| `backend/app/telegram/client_pool.py` | **Modify** | Add `get_active_count`; add callback system |
| `backend/app/telegram/__init__.py` | **Modify** | Instantiate `upload_worker_pool` singleton |
| `backend/app/core/deps.py` | **Modify** | Add `get_upload_worker_pool` dependency |
| `backend/app/main.py` | **Modify** | Seed workers on startup; register callback; drain on shutdown |
| `backend/app/api/files.py` | **Modify** | `submit()` to pool instead of `create_task`; remove `_background_tasks` |
| `backend/app/api/accounts.py` | **Modify** | Call `set_worker_count` after add/remove; add `GET /concurrency` |
| `frontend/src/lib/semaphore.ts` | **Create** | Correct N-slot semaphore |
| `frontend/src/api/accounts.ts` | **Modify** | Add `getConcurrency()` |
| `frontend/src/features/explorer/FileExplorer.tsx` | **Modify** | Replace serial queue with semaphore + `watchCompletion` |

---

## Task 1: Set up test infrastructure

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`

The project has no pytest tests yet. Set up the `tests/` package with the asyncio mode configured.

- [ ] **Step 1: Create `backend/tests/__init__.py`** (empty file)

```bash
touch s:/Development/TeleVault/backend/tests/__init__.py
```

- [ ] **Step 2: Create `backend/tests/conftest.py`**

```python
import pytest

# Tell pytest-asyncio to treat all async tests in this package as asyncio tests
# without requiring the @pytest.mark.asyncio decorator on each one.
```

- [ ] **Step 3: Verify pytest is available**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -m pytest --version
```

Expected: `pytest 8.x.x` (or similar). If not found, install:

```bash
.venv/Scripts/pip install pytest pytest-asyncio
```

- [ ] **Step 4: Commit**

```bash
cd s:/Development/TeleVault
git add backend/tests/
git commit -m "test: set up pytest test infrastructure"
```

---

## Task 2: Implement `UploadJob` and `UploadWorkerPool` (TDD)

**Files:**
- Create: `backend/tests/test_upload_queue.py`
- Create: `backend/app/services/upload_queue.py`

**What this does:** The core worker pool. Key behaviors to verify: round-robin slot assignment, correct worker count management, sentinel-based graceful shutdown, shield-based cancellation safety.

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_upload_queue.py`:

```python
from __future__ import annotations

import asyncio
import dataclasses
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.upload_queue import UploadJob, UploadWorkerPool


def _make_job(**kwargs) -> UploadJob:
    defaults = dict(
        operation_id=str(uuid.uuid4()),
        file_id=uuid.uuid4(),
        owner_id=12345,
        folder_id=None,
        channel=MagicMock(),
        filename="test.txt",
        mime_type="text/plain",
        total_size=100,
        file_hash="abc",
        tmp_path="/tmp/x",
        account_offset=0,
    )
    defaults.update(kwargs)
    return UploadJob(**defaults)


# ── submit: round-robin slot assignment ───────────────────────────────────────

@pytest.mark.asyncio
async def test_submit_assigns_offset_sequentially():
    pool = UploadWorkerPool(registry=MagicMock(), pool=MagicMock())

    job1 = _make_job(owner_id=1)
    job2 = _make_job(owner_id=1)
    job3 = _make_job(owner_id=1)

    pool.submit(1, job1)
    pool.submit(1, job2)
    pool.submit(1, job3)

    assert job1.account_offset == 0
    assert job2.account_offset == 1
    assert job3.account_offset == 2


@pytest.mark.asyncio
async def test_submit_counters_are_per_user():
    pool = UploadWorkerPool(registry=MagicMock(), pool=MagicMock())

    job_a = _make_job(owner_id=1)
    job_b = _make_job(owner_id=2)

    pool.submit(1, job_a)
    pool.submit(2, job_b)

    # Each user starts at offset 0 independently.
    assert job_a.account_offset == 0
    assert job_b.account_offset == 0


# ── set_worker_count ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_set_worker_count_spawns_workers():
    pool = UploadWorkerPool(registry=MagicMock(), pool=MagicMock())
    pool.set_worker_count(1, 3)
    await asyncio.sleep(0)  # let tasks start
    assert pool.get_worker_count(1) == 3
    await pool.shutdown()


@pytest.mark.asyncio
async def test_set_worker_count_clamps_to_minimum_one():
    pool = UploadWorkerPool(registry=MagicMock(), pool=MagicMock())
    pool.set_worker_count(1, 0)
    await asyncio.sleep(0)
    assert pool.get_worker_count(1) == 1
    await pool.shutdown()


@pytest.mark.asyncio
async def test_set_worker_count_reduces_workers():
    pool = UploadWorkerPool(registry=MagicMock(), pool=MagicMock())
    pool.set_worker_count(1, 3)
    await asyncio.sleep(0)
    pool.set_worker_count(1, 1)
    # Give cancelled tasks time to exit via CancelledError on queue.get()
    await asyncio.sleep(0.05)
    assert pool.get_worker_count(1) == 1
    await pool.shutdown()


# ── worker processes jobs ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_worker_calls_execute_upload():
    executed = []

    async def fake_execute(**kwargs):
        executed.append(kwargs["operation_id"])

    pool = UploadWorkerPool(registry=MagicMock(), pool=MagicMock())

    with patch("app.services.upload_queue.execute_upload", fake_execute):
        pool.set_worker_count(42, 1)
        job = _make_job(owner_id=42, operation_id="op-1")
        pool.submit(42, job)
        await asyncio.sleep(0.1)  # let the worker pick up the job

    assert "op-1" in executed
    await pool.shutdown()


# ── shutdown drains gracefully ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_shutdown_processes_pending_jobs():
    executed = []
    barrier = asyncio.Event()

    async def slow_execute(**kwargs):
        executed.append(kwargs["operation_id"])
        barrier.set()

    pool = UploadWorkerPool(registry=MagicMock(), pool=MagicMock())

    with patch("app.services.upload_queue.execute_upload", slow_execute):
        pool.set_worker_count(99, 1)
        job = _make_job(owner_id=99, operation_id="drain-op")
        pool.submit(99, job)
        # Start shutdown immediately — worker should finish job first.
        await pool.shutdown()

    assert "drain-op" in executed
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -m pytest tests/test_upload_queue.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'app.services.upload_queue'`

- [ ] **Step 3: Create `backend/app/services/upload_queue.py`**

```python
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING
import uuid

if TYPE_CHECKING:
    from app.db.models.channel import Channel
    from app.services.progress import OperationRegistry
    from app.telegram.client_pool import ClientPool

logger = logging.getLogger(__name__)


@dataclass
class UploadJob:
    """Per-file upload job submitted to UploadWorkerPool.

    Does NOT hold registry or pool — those are UploadWorkerPool instance state.
    account_offset is assigned by submit(), callers should pass 0 as a placeholder.
    """

    operation_id: str
    file_id: uuid.UUID
    owner_id: int
    folder_id: uuid.UUID | None
    channel: object  # Channel — typed loosely to avoid circular import
    filename: str
    mime_type: str | None
    total_size: int
    file_hash: str
    tmp_path: str
    account_offset: int = field(default=0)


class UploadWorkerPool:
    """Manages per-user asyncio queues and N worker tasks (N = connected accounts).

    Workers are fungible — any worker can process any job. Account assignment
    is determined per-job via a round-robin slot counter: submit() increments
    the counter and writes account_offset into the job before enqueueing.

    set_worker_count() must only be called from within a running asyncio event
    loop (lifespan, route handlers, async callbacks) because it calls
    asyncio.create_task().
    """

    def __init__(self, registry: "OperationRegistry", pool: "ClientPool") -> None:
        self._registry = registry
        self._pool = pool
        # asyncio.Queue[UploadJob | None] — None is the shutdown sentinel
        self._queues: dict[int, asyncio.Queue] = {}
        self._workers: dict[int, list[asyncio.Task]] = {}
        self._slot_counter: dict[int, int] = {}

    # ── Public API ──────────────────────────────────────────────────────────

    def submit(self, owner_id: int, job: UploadJob) -> None:
        """Assign account_offset via round-robin and enqueue the job.

        Synchronous. No await between the counter read and write — asyncio-safe.
        Uses put_nowait (queue is unbounded, never blocks).
        """
        slot = self._slot_counter.get(owner_id, 0)
        self._slot_counter[owner_id] = slot + 1
        job.account_offset = slot
        self._queues.setdefault(owner_id, asyncio.Queue()).put_nowait(job)

    def set_worker_count(self, owner_id: int, count: int) -> None:
        """Spawn or cancel workers to reach the target count (minimum 1).

        Requires a running event loop. Safe to call from async contexts only.
        """
        count = max(1, count)
        self._queues.setdefault(owner_id, asyncio.Queue())
        current = self._workers.setdefault(owner_id, [])

        # Spawn additional workers
        while len(current) < count:
            task = asyncio.create_task(self._worker(owner_id))
            current.append(task)

        # Cancel excess workers cooperatively.
        # CancelledError arrives at await queue.get(), never mid-upload (shielded).
        while len(current) > count:
            task = current.pop()
            task.cancel()

    def get_worker_count(self, owner_id: int) -> int:
        return len(self._workers.get(owner_id, []))

    async def shutdown(self) -> None:
        """Drain all queues and wait for all workers to exit cleanly.

        Uses a None sentinel per worker so in-flight uploads (protected by
        asyncio.shield) complete before the worker sees the sentinel and exits.
        No task.cancel() is used here — workers drain naturally.
        """
        for owner_id, tasks in self._workers.items():
            q = self._queues.get(owner_id)
            if q:
                for _ in tasks:
                    q.put_nowait(None)  # one sentinel per worker

        all_tasks = [t for tasks in self._workers.values() for t in tasks]
        await asyncio.gather(*all_tasks, return_exceptions=True)
        self._workers.clear()

    # ── Internal ────────────────────────────────────────────────────────────

    async def _worker(self, owner_id: int) -> None:
        from app.services.upload import execute_upload  # avoid circular import at module level

        queue = self._queues[owner_id]
        while True:
            try:
                job = await queue.get()  # CancelledError from set_worker_count arrives here
            except asyncio.CancelledError:
                break  # Clean exit — no job was dequeued

            if job is None:  # shutdown sentinel
                queue.task_done()
                break

            try:
                # asyncio.shield prevents external task cancellation from
                # interrupting execute_upload mid-upload. If the task IS
                # cancelled while shielded, the shield absorbs it and lets
                # execute_upload finish (or roll back) before re-raising here.
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
                # Shield absorbed external cancel; execute_upload has finished.
                break
            except Exception:
                logger.exception(
                    "Worker caught unhandled exception for operation %s",
                    job.operation_id,
                )
            finally:
                queue.task_done()
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -m pytest tests/test_upload_queue.py -v
```

Expected: All tests PASS. If `test_shutdown_processes_pending_jobs` is flaky, increase the sleep in the test body slightly.

- [ ] **Step 5: Commit**

```bash
cd s:/Development/TeleVault
git add backend/tests/test_upload_queue.py backend/app/services/upload_queue.py
git commit -m "feat: implement UploadJob and UploadWorkerPool with TDD"
```

---

## Task 3: Add `account_offset` to `execute_upload` (TDD)

**Files:**
- Create: `backend/tests/test_upload_offset.py`
- Modify: `backend/app/services/upload.py` — lines 251–252 (split assignment in `_upload_split`)

**What this does:** Ensures that when two files upload concurrently with different `account_offset` values, they use different primary accounts. The test mocks the Telegram upload so it runs without real credentials.

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_upload_offset.py`:

```python
"""Tests that execute_upload distributes splits across accounts using account_offset."""
from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from app.services.upload import _SPLIT_SIZE


def _make_mock_pool(n_accounts: int):
    """Return a ClientPool mock with n_accounts fake clients."""
    mock_pool = MagicMock()
    clients = [(uuid.uuid4(), MagicMock()) for _ in range(n_accounts)]
    mock_pool.get_all_clients_for_user.return_value = clients
    for _, client in clients:
        client.is_connected.return_value = True
    return mock_pool, clients


@pytest.mark.asyncio
async def test_single_account_offset_zero_uses_account_zero():
    """Single-account: account 0 handles the sole split regardless of offset."""
    mock_pool, clients = _make_mock_pool(1)
    used_clients = []

    async def fake_upload_document(client, channel_id, reader, **kwargs):
        used_clients.append(client)
        result = MagicMock()
        result.message_id = 1
        result.file_id = b"x"
        result.file_unique_id = "u1"
        return result

    with (
        patch("app.services.upload.upload_document", fake_upload_document),
        patch("app.services.upload.AsyncSessionLocal") as mock_session,
        patch("app.services.upload.log_event", AsyncMock()),
    ):
        mock_session.return_value.__aenter__ = AsyncMock(return_value=MagicMock(
            get=AsyncMock(return_value=MagicMock(status=None, file_unique_id=None, split_count=None)),
            add=MagicMock(),
            commit=AsyncMock(),
        ))
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        from app.services.upload import execute_upload
        channel = MagicMock()
        channel.channel_id = 123
        channel.id = uuid.uuid4()

        await execute_upload(
            registry=MagicMock(
                emit_progress=AsyncMock(),
                emit_done=AsyncMock(),
                emit_error=AsyncMock(),
            ),
            pool=mock_pool,
            operation_id="op1",
            file_id=uuid.uuid4(),
            owner_id=1,
            folder_id=None,
            channel=channel,
            filename="a.txt",
            mime_type=None,
            total_size=100,
            file_hash="h1",
            tmp_path=__file__,  # any readable file
            account_offset=0,
        )

    assert used_clients == [clients[0][1]]


@pytest.mark.asyncio
async def test_two_accounts_offset_selects_different_primary():
    """Two accounts: offset=0 starts on account[0], offset=1 starts on account[1]."""
    mock_pool, clients = _make_mock_pool(2)
    used_clients_by_op: dict[str, list] = {"op0": [], "op1": []}
    current_op = {"id": "op0"}

    async def fake_upload_document(client, channel_id, reader, **kwargs):
        used_clients_by_op[current_op["id"]].append(client)
        result = MagicMock()
        result.message_id = 99
        result.file_id = b"y"
        result.file_unique_id = "u2"
        return result

    base_session_mock = MagicMock(
        get=AsyncMock(return_value=MagicMock(status=None, file_unique_id=None, split_count=None)),
        add=MagicMock(),
        commit=AsyncMock(),
    )

    with (
        patch("app.services.upload.upload_document", fake_upload_document),
        patch("app.services.upload.AsyncSessionLocal") as mock_session,
        patch("app.services.upload.log_event", AsyncMock()),
    ):
        mock_session.return_value.__aenter__ = AsyncMock(return_value=base_session_mock)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=False)

        from app.services.upload import execute_upload
        channel = MagicMock()
        channel.channel_id = 123
        channel.id = uuid.uuid4()
        registry = MagicMock(emit_progress=AsyncMock(), emit_done=AsyncMock(), emit_error=AsyncMock())

        current_op["id"] = "op0"
        await execute_upload(
            registry=registry, pool=mock_pool, operation_id="op0",
            file_id=uuid.uuid4(), owner_id=1, folder_id=None, channel=channel,
            filename="a.txt", mime_type=None, total_size=100, file_hash="h1",
            tmp_path=__file__, account_offset=0,
        )

        current_op["id"] = "op1"
        await execute_upload(
            registry=registry, pool=mock_pool, operation_id="op1",
            file_id=uuid.uuid4(), owner_id=1, folder_id=None, channel=channel,
            filename="b.txt", mime_type=None, total_size=100, file_hash="h2",
            tmp_path=__file__, account_offset=1,
        )

    # op0 (offset=0): split 0 → (0+0)%2=0 → clients[0]
    assert used_clients_by_op["op0"] == [clients[0][1]]
    # op1 (offset=1): split 0 → (1+0)%2=1 → clients[1]
    assert used_clients_by_op["op1"] == [clients[1][1]]
```

- [ ] **Step 2: Run — expect failure**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -m pytest tests/test_upload_offset.py -v 2>&1 | head -20
```

Expected: Test fails because `execute_upload` doesn't accept `account_offset` yet.

- [ ] **Step 3: Modify `backend/app/services/upload.py`**

Add `account_offset: int = 0` to the `execute_upload` signature (after `tmp_path`):

```python
# Before (line ~189):
async def execute_upload(
    registry: OperationRegistry,
    pool: ClientPool,
    operation_id: str,
    file_id: uuid.UUID,
    owner_id: int,
    folder_id: uuid.UUID | None,
    channel: Channel,
    filename: str,
    mime_type: str | None,
    total_size: int,
    file_hash: str,
    tmp_path: str,
) -> None:

# After:
async def execute_upload(
    registry: OperationRegistry,
    pool: ClientPool,
    operation_id: str,
    file_id: uuid.UUID,
    owner_id: int,
    folder_id: uuid.UUID | None,
    channel: Channel,
    filename: str,
    mime_type: str | None,
    total_size: int,
    file_hash: str,
    tmp_path: str,
    account_offset: int = 0,   # NEW — which account handles split 0
) -> None:
```

Change the one line inside `_upload_split` (currently line ~252):

```python
# Before:
account_id, client = client_snapshot[split_index % len(client_snapshot)]

# After:
account_id, client = client_snapshot[(account_offset + split_index) % len(client_snapshot)]
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -m pytest tests/test_upload_offset.py tests/test_upload_queue.py -v
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
cd s:/Development/TeleVault
git add backend/tests/test_upload_offset.py backend/app/services/upload.py
git commit -m "feat: add account_offset to execute_upload for file-level account distribution"
```

---

## Task 4: Add `get_active_count` and callback system to `ClientPool`

**Files:**
- Modify: `backend/app/telegram/client_pool.py`

Two small additions: a `get_active_count` helper and a callback list that the health-check loop fires after removing a revoked account.

- [ ] **Step 1: Add `get_active_count` method**

In `backend/app/telegram/client_pool.py`, add after `get_all_clients_for_user` (around line 126):

```python
def get_active_count(self, owner_telegram_id: int) -> int:
    """Return the number of active connected clients for a user."""
    return len(self.get_all_clients_for_user(owner_telegram_id))
```

- [ ] **Step 2: Add callback state and registration method**

In `__init__`, add after the existing instance variables:

```python
self._on_account_change_callbacks: list = []  # list[Callable[[int, int], None]]
```

Add a registration method after `get_active_count`:

```python
def register_account_change_callback(self, cb) -> None:
    """Register a callback invoked with (owner_telegram_id, new_count) when
    an account is added or its session is revoked by the health check."""
    self._on_account_change_callbacks.append(cb)
```

- [ ] **Step 3: Fire callbacks in the health-check loop after revoking a session**

In `start_health_check_loop`, in the `except _AUTH_ERRORS` block, after the two `.pop()` calls (around line 201–202), add:

```python
# Notify listeners (e.g. UploadWorkerPool) about the reduced account count
_new_count = self.get_active_count(owner_id)
for cb in self._on_account_change_callbacks:
    cb(owner_id, _new_count)
```

Note: `owner_id` is available via `self._owners.get(account_id)` — capture it **before** the pop. Check the existing code: `owner_id = self._owners.get(account_id)`. If that variable isn't already in scope at that point in the health check, add `owner_id = self._owners.get(account_id)` immediately before `self._clients.pop(account_id, None)`.

- [ ] **Step 4: Verify the server still starts cleanly**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -c "from app.telegram.client_pool import ClientPool; p = ClientPool(); print(p.get_active_count(0)); print('OK')"
```

Expected: `0\nOK`

- [ ] **Step 5: Run existing tests**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -m pytest tests/ -v
```

Expected: All PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
cd s:/Development/TeleVault
git add backend/app/telegram/client_pool.py
git commit -m "feat: add get_active_count and account-change callback system to ClientPool"
```

---

## Task 5: Wire `upload_worker_pool` singleton into the app

**Files:**
- Modify: `backend/app/telegram/__init__.py` — instantiate singleton
- Modify: `backend/app/core/deps.py` — add `get_upload_worker_pool`
- Modify: `backend/app/main.py` — seed workers, register callback, shutdown

The project's pattern for singletons: they live in `app/telegram/__init__.py` alongside `client_pool` and `operation_registry`. Add `upload_worker_pool` there.

- [ ] **Step 1: Add `upload_worker_pool` to `backend/app/telegram/__init__.py`**

The current file looks like:
```python
from app.telegram.client_pool import ClientPool
from app.services.progress import OperationRegistry
from app.services.event_broadcaster import EventBroadcaster

client_pool = ClientPool()
operation_registry = OperationRegistry()
event_broadcaster = EventBroadcaster()
```

Add at the bottom:
```python
from app.services.upload_queue import UploadWorkerPool

upload_worker_pool = UploadWorkerPool(registry=operation_registry, pool=client_pool)
```

- [ ] **Step 2: Add `get_upload_worker_pool` to `backend/app/core/deps.py`**

Add after `get_client_pool`:

```python
from app.telegram import upload_worker_pool as _upload_worker_pool_instance
from app.services.upload_queue import UploadWorkerPool


def get_upload_worker_pool() -> UploadWorkerPool:
    return _upload_worker_pool_instance
```

- [ ] **Step 3: Modify `backend/app/main.py` lifespan**

Import `upload_worker_pool` alongside the existing imports:

```python
from app.telegram import client_pool, upload_worker_pool
```

In the `lifespan` function, after `await client_pool.initialize(session)`, add the worker seeding block and callback registration:

```python
# Seed workers for users whose accounts are already connected.
# Skip users with zero active accounts (all sessions failed).
_seen_owners: set[int] = set()
for _owner_id in client_pool._owners.values():
    if _owner_id not in _seen_owners:
        _seen_owners.add(_owner_id)
        _active = client_pool.get_active_count(_owner_id)
        if _active > 0:
            upload_worker_pool.set_worker_count(_owner_id, _active)

# When the health check revokes a session, update the worker count automatically.
client_pool.register_account_change_callback(upload_worker_pool.set_worker_count)
```

In the `yield` section (shutdown), add before `await client_pool.shutdown()`:

```python
await upload_worker_pool.shutdown()
```

Full lifespan after changes:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    async with AsyncSessionLocal() as session:
        await client_pool.initialize(session)
    asyncio.create_task(client_pool.start_health_check_loop(AsyncSessionLocal))

    # Seed upload workers for already-connected accounts.
    _seen_owners: set[int] = set()
    for _owner_id in client_pool._owners.values():
        if _owner_id not in _seen_owners:
            _seen_owners.add(_owner_id)
            _active = client_pool.get_active_count(_owner_id)
            if _active > 0:
                upload_worker_pool.set_worker_count(_owner_id, _active)
    client_pool.register_account_change_callback(upload_worker_pool.set_worker_count)

    await _cleanup_stale_uploads()
    logger.info("TeleVault API is ready")
    yield
    await upload_worker_pool.shutdown()
    await client_pool.shutdown()
    logger.info("TeleVault API shutting down")
```

- [ ] **Step 4: Verify imports resolve**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -c "from app.telegram import upload_worker_pool; print(type(upload_worker_pool)); print('OK')"
```

Expected: `<class 'app.services.upload_queue.UploadWorkerPool'>\nOK`

- [ ] **Step 5: Run all tests**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -m pytest tests/ -v
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
cd s:/Development/TeleVault
git add backend/app/telegram/__init__.py backend/app/core/deps.py backend/app/main.py
git commit -m "feat: wire upload_worker_pool singleton into app lifecycle"
```

---

## Task 6: Update `files.py` to submit jobs to the worker pool

**Files:**
- Modify: `backend/app/api/files.py`

Replace `asyncio.create_task(execute_upload(...))` with `upload_worker_pool.submit(...)` in **both** the `/upload` and `/upload/finalize` endpoints. Also remove the now-unused `_background_tasks` set.

- [ ] **Step 1: Add imports to `backend/app/api/files.py`**

Add to the imports section:

```python
from app.core.deps import get_upload_worker_pool
from app.services.upload_queue import UploadJob
from app.services.upload_queue import UploadWorkerPool
```

- [ ] **Step 2: Update the `/upload` endpoint**

Find the `POST /upload` route handler. Remove the `_background_tasks` set and related code:

```python
# REMOVE these lines (near top of file):
_background_tasks: set[asyncio.Task] = set()
```

Replace the `asyncio.create_task(execute_upload(...))` block in `upload_file`:

```python
# BEFORE:
task = asyncio.create_task(upload_svc.execute_upload(
    registry=operation_registry,
    pool=pool,
    operation_id=operation_id,
    ...
))
_background_tasks.add(task)
task.add_done_callback(_background_tasks.discard)

# AFTER:
upload_worker_pool.submit(owner_id, UploadJob(
    operation_id=operation_id,
    file_id=file_id,
    owner_id=owner_id,
    folder_id=folder.id if folder else None,
    channel=channel_record,
    filename=filename,
    mime_type=mime_type,
    total_size=total_size,
    file_hash=file_hash,
    tmp_path=tmp_path,
    account_offset=0,  # overwritten by submit()
))
```

Add `upload_worker_pool: UploadWorkerPool = Depends(get_upload_worker_pool)` to the `upload_file` function signature.

- [ ] **Step 3: Update the `/upload/finalize` endpoint**

Same pattern: replace `asyncio.create_task(execute_upload(...))` with `upload_worker_pool.submit(...)`. Add the dependency to the function signature.

- [ ] **Step 4: Remove unused `asyncio` import if it's no longer needed**

Check if `asyncio` is used elsewhere in `files.py` (it is — for `asyncio.to_thread` in chunk endpoints). Keep the import.

- [ ] **Step 5: Verify the app imports cleanly**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -c "from app.api.files import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 6: Run all tests**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -m pytest tests/ -v
```

Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
cd s:/Development/TeleVault
git add backend/app/api/files.py
git commit -m "feat: submit uploads to worker pool instead of bare asyncio.create_task"
```

---

## Task 7: Update `accounts.py` — worker count sync and `/concurrency` endpoint

**Files:**
- Modify: `backend/app/api/accounts.py`

After adding/removing an account, update the worker pool count. Add a new `GET /concurrency` endpoint.

- [ ] **Step 1: Add imports to `backend/app/api/accounts.py`**

```python
from app.core.deps import get_upload_worker_pool
from app.services.upload_queue import UploadWorkerPool
```

- [ ] **Step 2: Add `upload_worker_pool` dependency to add-account endpoints**

In `add_otp` and the QR poll completion branch (`add_qr_poll`), add `upload_worker_pool: UploadWorkerPool = Depends(get_upload_worker_pool)` to the function signature.

After `await pool.add_client(ta.id, session_string, current_user.telegram_id)`, add:

```python
upload_worker_pool.set_worker_count(
    current_user.telegram_id,
    pool.get_active_count(current_user.telegram_id),
)
```

- [ ] **Step 3: Add `upload_worker_pool` dependency to the remove endpoint**

In `remove_alt_account`, add `upload_worker_pool: UploadWorkerPool = Depends(get_upload_worker_pool)` to the signature.

After `await pool.remove_client(account_id)`, add:

```python
upload_worker_pool.set_worker_count(
    current_user.telegram_id,
    pool.get_active_count(current_user.telegram_id),
)
```

- [ ] **Step 4: Add the `GET /concurrency` endpoint**

Add after the `/primary` endpoint:

```python
@router.get("/concurrency")
async def get_upload_concurrency(
    current_user: User = Depends(get_current_user),
    upload_worker_pool: UploadWorkerPool = Depends(get_upload_worker_pool),
):
    """Return the current number of upload workers for the authenticated user.

    Always >= 1. Used by the frontend to determine how many files to upload
    in parallel.
    """
    return {"concurrency": upload_worker_pool.get_worker_count(current_user.telegram_id)}
```

- [ ] **Step 5: Verify imports and endpoint registration**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -c "from app.api.accounts import router; routes = [r.path for r in router.routes]; print([r for r in routes if 'concurrency' in r])"
```

Expected: `['/api/v1/accounts/concurrency']`

- [ ] **Step 6: Run all tests**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -m pytest tests/ -v
```

Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
cd s:/Development/TeleVault
git add backend/app/api/accounts.py
git commit -m "feat: sync worker count on account add/remove; add GET /accounts/concurrency"
```

---

## Task 8: Create the frontend semaphore utility

**Files:**
- Create: `frontend/src/lib/semaphore.ts`

A correct N-slot semaphore. The key invariant: `release()` does not decrement `running` when it hands the slot directly to a waiter — count stays stable (one out, one in from the microtask queue's perspective).

- [ ] **Step 1: Create `frontend/src/lib/semaphore.ts`**

```typescript
/**
 * Creates an N-slot semaphore for limiting concurrent async operations.
 *
 * Correct handoff invariant: when release() finds a waiting acquirer, it does
 * NOT decrement `running` — it hands the slot directly. `running` stays the
 * same: one consumer finishes, one starts. This prevents over-subscription
 * between the microtask that resolves the waiter and the waiter resuming.
 */
export function createSemaphore(n: number) {
  let running = 0;
  const waiters: Array<() => void> = [];

  return {
    async acquire(): Promise<void> {
      if (running < n) {
        running++;
        return;
      }
      // running is NOT incremented here — release() keeps the count stable
      // by not decrementing when it hands off to this waiter.
      await new Promise<void>((resolve) => waiters.push(resolve));
    },

    release(): void {
      const next = waiters.shift();
      if (next) {
        // Hand slot directly to the next waiter; running stays the same.
        next();
      } else {
        running--;
      }
    },
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd s:/Development/TeleVault/frontend
npx tsc --noEmit 2>&1 | grep semaphore
```

Expected: No output (no errors).

- [ ] **Step 3: Commit**

```bash
cd s:/Development/TeleVault
git add frontend/src/lib/semaphore.ts
git commit -m "feat: add correct N-slot semaphore utility"
```

---

## Task 9: Add `getConcurrency` to the accounts API client

**Files:**
- Modify: `frontend/src/api/accounts.ts`

One new exported function that calls the backend endpoint created in Task 7.

- [ ] **Step 1: Add `getConcurrency` to `frontend/src/api/accounts.ts`**

Add at the bottom of the file:

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

- [ ] **Step 2: Verify it compiles**

```bash
cd s:/Development/TeleVault/frontend
npx tsc --noEmit 2>&1 | grep accounts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd s:/Development/TeleVault
git add frontend/src/api/accounts.ts
git commit -m "feat: add getConcurrency() to accounts API client"
```

---

## Task 10: Replace serial upload queue in `FileExplorer` with parallel semaphore

**Files:**
- Modify: `frontend/src/features/explorer/FileExplorer.tsx`

This is the largest frontend change. Replace the module-level `_uploadQueue` serial chain with an N-concurrent semaphore. Extract SSE-watching into a standalone `watchCompletion` function that runs fire-and-forget.

Read the existing `handleDrop` implementation carefully before editing — it's around lines 240–394.

- [ ] **Step 1: Remove the module-level serial queue**

Delete this line near the top of `FileExplorer.tsx` (currently line 5):

```typescript
// DELETE:
let _uploadQueue: Promise<void> = Promise.resolve();
```

- [ ] **Step 2: Add imports**

At the top of the file, add:

```typescript
import { createSemaphore } from "../../lib/semaphore";
import { getConcurrency } from "../../api/accounts";
```

- [ ] **Step 3: Extract `watchCompletion` as a module-level function**

Add this function **outside** the `FileExplorer` component (e.g., just before the `export function FileExplorer()` line). It needs `queryClient` as a parameter since it's not inside the component:

```typescript
/**
 * Fire-and-forget SSE watcher for a single upload operation.
 * Handles status updates, query invalidation, and toast notifications
 * independently of the upload semaphore — Telegram processing runs in
 * parallel with subsequent XHR uploads.
 */
function watchCompletion(
  opId: string,
  fileName: string,
  token: string,
  queryClient: ReturnType<typeof import("@tanstack/react-query").useQueryClient>,
): void {
  const { updateProgress, setStatus } = useUploadStore.getState();
  let done = false;
  let retries = 0;
  const MAX_RETRIES = 8;
  let retryDelay = 1000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let source: EventSource | null = null;

  const cleanup = (unsub?: () => void) => {
    done = true;
    if (retryTimer !== null) clearTimeout(retryTimer);
    source?.close();
    source = null;
    unsub?.();
  };

  // Also watch Zustand store — useUploadSSE in TransferItem may resolve first.
  const unsub = useUploadStore.subscribe((state) => {
    if (done) return;
    const u = state.uploads.get(opId);
    if (!u || u.status === "complete") {
      cleanup(unsub);
      void queryClient.invalidateQueries({ queryKey: fileKeys.all });
    } else if (u.status === "error" || u.status === "cancelled") {
      cleanup(unsub);
    }
  });

  const connect = () => {
    if (done) return;
    source = createProgressSource(opId, token);

    const onMsg = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as {
          pct?: number;
          status?: string;
          message?: string;
        };
        if (typeof data.pct === "number") {
          updateProgress(opId, Math.min(100, Math.max(0, data.pct)));
        }
        if (data.status === "done" || data.status === "complete") {
          setStatus(opId, "complete");
          cleanup(unsub);
          void queryClient.invalidateQueries({ queryKey: fileKeys.all });
          toast.success(`Uploaded ${fileName}`);
        } else if (data.status === "error") {
          const msg = data.message ?? "Upload failed";
          setStatus(opId, "error", msg);
          cleanup(unsub);
          toast.error(`Failed to upload ${fileName}: ${msg}`);
        }
      } catch {
        // Malformed SSE data — ignore
      }
    };

    source.addEventListener("progress", onMsg);
    source.onmessage = onMsg;
    source.onerror = () => {
      source?.close();
      source = null;
      if (done) return;
      retries++;
      if (retries > MAX_RETRIES) {
        setStatus(opId, "error", "Connection lost");
        cleanup(unsub);
        toast.error(`Failed to upload ${fileName}: Connection lost`);
        return;
      }
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, 16_000);
        connect();
      }, retryDelay);
    };
  };

  connect();
}
```

Note: `watchCompletion` uses `useUploadStore.getState()` (the static accessor, not the hook), which is valid outside React components.

- [ ] **Step 4: Rewrite `handleDrop` inside `FileExplorer`**

Replace the entire `handleDrop` callback body. The key changes:
1. Fetch `N` from `getConcurrency()` at the start (fallback 1)
2. Create a semaphore with `N` slots
3. Launch all file tasks with `Promise.allSettled` (not a serial `for` loop)
4. Each task: acquire → hash → XHR upload → promote/setStatus → **release** → watchCompletion (fire-and-forget)

```typescript
const handleDrop = useCallback(
  (files: File[]) => {
    if (!user) return;

    const { addUpload, updateProgress, setStatus, promoteUpload } =
      useUploadStore.getState();

    // Add ALL files to the store immediately as "queued"
    const fileEntries = files.map((file) => ({
      file,
      tempId: `upload-${generateUUID()}`,
      stableId: generateUUID(),
    }));

    for (const { file, tempId, stableId } of fileEntries) {
      addUpload({
        id: stableId,
        operationId: tempId,
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
        status: "queued",
        folderId: slug || undefined,
      });
    }

    // Kick off concurrent uploads — N slots, one per connected account.
    void (async () => {
      let n = 1;
      try {
        const result = await getConcurrency();
        n = Math.max(1, result.concurrency);
      } catch {
        // Network error — fall back to serial (1 slot)
      }

      const sem = createSemaphore(n);
      const token = useAuthStore.getState().accessToken ?? "";

      await Promise.allSettled(
        fileEntries.map(async ({ file, tempId }) => {
          await sem.acquire();

          setStatus(tempId, "hashing");
          let realOperationId: string | null = null;

          try {
            await uploadFile(
              file,
              isRoot ? null : slug,
              (operationId, fileId) => {
                realOperationId = operationId;
                if (operationId) {
                  promoteUpload(tempId, operationId, fileId);
                  setStatus(operationId, "processing");
                } else {
                  // Duplicate — already exists on server
                  updateProgress(tempId, 100);
                  setStatus(tempId, "complete", undefined, true);
                }
              },
              (progress) => updateProgress(tempId, progress),
              (progress) => {
                setStatus(tempId, "uploading");
                updateProgress(tempId, progress);
              },
            );
          } catch (err) {
            sem.release();
            if ((err as Error).message !== "Upload cancelled") {
              const opId = realOperationId ?? tempId;
              setStatus(opId, "error", (err as Error).message);
              toast.error(`Failed to upload ${file.name}: ${(err as Error).message}`);
            }
            return;
          }

          // XHR bytes are on the server — release the slot so the next file
          // can start uploading while Telegram processing runs in the background.
          sem.release();

          // Watch Telegram processing independently (fire-and-forget).
          if (realOperationId) {
            // Check if already complete (SSE may have arrived during XHR).
            const immediateState = useUploadStore
              .getState()
              .uploads.get(realOperationId);
            if (immediateState?.status === "complete") {
              void queryClient.invalidateQueries({ queryKey: fileKeys.all });
              toast.success(`Uploaded ${file.name}`);
            } else if (immediateState?.status !== "error") {
              watchCompletion(realOperationId, file.name, token, queryClient);
            }
          }
        }),
      );
    })();
  },
  [slug, isRoot, user, queryClient],
);
```

- [ ] **Step 5: Check TypeScript compilation**

```bash
cd s:/Development/TeleVault/frontend
npx tsc --noEmit 2>&1
```

Fix any type errors before continuing. Common issues:
- `watchCompletion` receives `queryClient` — its return type comes from `useQueryClient()`. If TypeScript complains, import the type: `import type { QueryClient } from "@tanstack/react-query"` and annotate the parameter.
- `useAuthStore` inside `watchCompletion` needs to be imported at the module level (it likely already is).

- [ ] **Step 6: Build the frontend**

```bash
cd s:/Development/TeleVault/frontend
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
cd s:/Development/TeleVault
git add frontend/src/features/explorer/FileExplorer.tsx
git commit -m "feat: replace serial upload queue with N-concurrent semaphore and watchCompletion"
```

---

## Task 11: End-to-end smoke test and final verification

**What to verify manually:**

1. **Single account (no regression):** Upload 3 small files → they upload sequentially (1 worker), each completes before the next Telegram message is sent. UI shows queued → hashing → uploading → processing → complete as before.

2. **Two accounts, small files:** Add a second account in Settings. Upload 3 small files → the first two start immediately (2 workers), the third starts as soon as one of the first two completes XHR upload (slot freed). Transfers tray shows 2 active uploads simultaneously.

3. **Account added mid-batch:** Queue 5 files with 1 account (serial). Add a second account mid-batch. Remaining queued files do not automatically gain parallelism for the current batch (N was fetched once at drop time), but the next drop event uses N=2.

4. **Concurrency endpoint:** Call `GET /api/v1/accounts/concurrency` with a valid token. Returns `{"concurrency": 1}` with 1 account, `{"concurrency": 2}` with 2 accounts.

5. **No regressions:** Large files (if available) still upload and split correctly. Duplicate detection still works. Downloads still work.

- [ ] **Step 1: Run all backend tests one final time**

```bash
cd s:/Development/TeleVault/backend
.venv/Scripts/python.exe -m pytest tests/ -v
```

Expected: All PASS.

- [ ] **Step 2: Build frontend**

```bash
cd s:/Development/TeleVault/frontend
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Final commit**

```bash
cd s:/Development/TeleVault
git add -A
git commit -m "feat: parallel upload worker pool — N concurrent uploads per account count"
```

---

## Quick Reference: Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `submit()` is synchronous | No `await` between counter read/write — preserves asyncio-safe atomicity of `account_offset` assignment |
| `put_nowait` not `await put` | Queue is unbounded; using `await` would introduce a spurious `await` after the counter write |
| `asyncio.shield` in worker | Prevents external `task.cancel()` from aborting in-progress Telegram uploads |
| Sentinel `None` for shutdown | Lets in-flight uploads complete before the worker exits; no `task.cancel()` in `shutdown()` |
| Semaphore released after XHR, not after SSE | Slots measure bandwidth to backend, not Telegram processing time; Telegram is backend-bound |
| `Promise.allSettled` not `Promise.all` | One upload failure does not abort sibling uploads |
| `getConcurrency()` called once per drop | Simple; frontend adapts on next drop after account changes |
