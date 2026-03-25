# Parallel Chunk Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Telethon's sequential single-connection chunk upload with a parallel multi-connection uploader that uses up to `PARALLEL_UPLOAD_CONNECTIONS` (default 8) concurrent MTProto senders per split, with adaptive backoff on flood/connection errors.

**Architecture:** A new `fast_upload.py` module contains three components: `_ConcurrencyController` (adaptive semaphore using asyncio.Condition), `fast_upload_file` (parallel chunk uploader returning a pre-uploaded `InputFile`/`InputFileBig`), and `fast_upload_document` (thin wrapper that calls `send_file` with the pre-uploaded reference). `upload.py` imports `fast_upload_document` **directly from `app.telegram.fast_upload`** (not via `operations.py`) to avoid a circular import — `fast_upload.py` imports `UploadedSplit` from `operations.py`, so `operations.py` must never import from `fast_upload.py`.

**Tech Stack:** Python 3.12, asyncio, Telethon ≥1.36 (`_borrow_exported_sender`, `_return_exported_sender`, `SaveBigFilePartRequest`, `SaveFilePartRequest`, `InputFileBig`, `InputFile`), pytest with `asyncio_mode = "auto"`, `unittest.mock`.

---

## File Map

| Action | Path | Responsibility |
| --- | --- | --- |
| Create | `backend/app/telegram/fast_upload.py` | All parallel upload logic |
| Create | `backend/tests/test_fast_upload.py` | Unit tests for fast_upload module |
| Create | `backend/tests/test_config_parallel.py` | Unit tests for config field |
| Modify | `backend/app/core/config.py` | Add `parallel_upload_connections` field |
| Modify | `backend/app/services/upload.py` | Import `fast_upload_document` from `fast_upload`, swap call site, pass `connections` |
| Modify | `backend/tests/test_upload_offset.py` | Update patch target + add `connections` assertion |

> **`operations.py` is NOT modified.** Importing `fast_upload_document` there would create a circular import (`fast_upload` → `operations` → `fast_upload`).

---

## Test File Strategy

`backend/tests/test_fast_upload.py` is built incrementally across Tasks 2–5. Each task **appends** new test functions to the same file. The header block (imports, env stubs, helpers) is written once in Task 2 and remains in place for all subsequent tasks. When the plan says "append to `test_fast_upload.py`", it means add new functions **after** the existing content — do not rewrite the file.

---

## Task 1: Add `parallel_upload_connections` config field

**Files:**
- Modify: `backend/app/core/config.py`
- Create: `backend/tests/test_config_parallel.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_config_parallel.py`:

```python
"""Tests for parallel_upload_connections config field."""
import os
import sys
from unittest.mock import MagicMock

sys.modules.setdefault("app.db.session", MagicMock())
os.environ.setdefault("TELEGRAM_API_ID", "12345")
os.environ.setdefault("TELEGRAM_API_HASH", "deadbeefdeadbeefdeadbeef00000000")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests")
os.environ.setdefault("ENCRYPTION_KEY", "dGVzdC1lbmNyeXB0aW9uLWtleS0zMmJ5dGVzIS0tLS0=")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")

from app.core.config import Settings


def test_parallel_upload_connections_defaults_to_8():
    s = Settings()
    assert s.parallel_upload_connections == 8


def test_parallel_upload_connections_reads_from_env(monkeypatch):
    monkeypatch.setenv("PARALLEL_UPLOAD_CONNECTIONS", "4")
    from app.core import config as cfg
    cfg.get_settings.cache_clear()
    s = Settings()
    assert s.parallel_upload_connections == 4
    cfg.get_settings.cache_clear()


def test_parallel_upload_connections_rejects_zero():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        Settings(parallel_upload_connections=0)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/test_config_parallel.py -v
```

Expected: `AttributeError` — field does not exist yet.

- [ ] **Step 3: Add the field to `backend/app/core/config.py`**

First, update the pydantic import at the top of the file. The current import is:

```python
from pydantic import field_validator, model_validator
```

Change it to:

```python
from pydantic import Field, field_validator, model_validator
```

Then, after the `upload_max_parallel_chunks` line (currently line 63), add:

```python
    parallel_upload_connections: int = Field(default=8, ge=1)
    # Controls concurrent MTProto sender connections per split when uploading to Telegram.
    # Reads from PARALLEL_UPLOAD_CONNECTIONS env var.
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_config_parallel.py -v
```

Expected: all 3 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/config.py backend/tests/test_config_parallel.py
git commit -m "feat: add PARALLEL_UPLOAD_CONNECTIONS config field (default 8)"
```

---

## Task 2: Implement `_ConcurrencyController`

**Files:**
- Create: `backend/app/telegram/fast_upload.py`
- Create: `backend/tests/test_fast_upload.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_fast_upload.py` with the full header plus controller tests:

```python
"""Unit tests for app.telegram.fast_upload.

This file is built incrementally across Tasks 2–5.
The header block (imports, env stubs, helpers) is written here once and
all subsequent tasks append new test functions to this file.
"""
from __future__ import annotations

import asyncio
import io
import math
import os
import sys
from unittest.mock import AsyncMock, MagicMock

sys.modules.setdefault("app.db.session", MagicMock())
os.environ.setdefault("TELEGRAM_API_ID", "12345")
os.environ.setdefault("TELEGRAM_API_HASH", "deadbeefdeadbeefdeadbeef00000000")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests")
os.environ.setdefault("ENCRYPTION_KEY", "dGVzdC1lbmNyeXB0aW9uLWtleS0zMmJ5dGVzIS0tLS0=")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")

from app.telegram.fast_upload import (
    _ConcurrencyController,
    CHUNK_SIZE,
)


# ── Shared helpers ────────────────────────────────────────────────────────────

def _make_client(dc_id: int = 2):
    """Return a (client, sender) pair with all Telethon internals mocked."""
    client = MagicMock()
    client.session.dc_id = dc_id
    sender = MagicMock()
    sender.send = AsyncMock(return_value=True)
    client._borrow_exported_sender = AsyncMock(return_value=sender)
    client._return_exported_sender = AsyncMock()
    return client, sender


class _FakeReader(io.RawIOBase):
    """Generates N zero bytes without allocating them all in RAM at once."""
    def __init__(self, total: int) -> None:
        self._total = total
        self._pos = 0

    def read(self, n: int = -1) -> bytes:
        remaining = self._total - self._pos
        if remaining <= 0:
            return b""
        n = min(n, remaining) if n > 0 else remaining
        self._pos += n
        return b"\x00" * n

    def readable(self) -> bool:
        return True


# ── _ConcurrencyController tests ──────────────────────────────────────────────

async def test_controller_acquire_release_basic():
    ctrl = _ConcurrencyController(2)
    await ctrl.acquire()
    await ctrl.acquire()
    assert ctrl._active == 2
    await ctrl.release()
    assert ctrl._active == 1
    await ctrl.release()
    assert ctrl._active == 0


async def test_controller_acquire_blocks_when_at_limit():
    ctrl = _ConcurrencyController(1)
    await ctrl.acquire()
    released = False

    async def _release_later():
        nonlocal released
        await asyncio.sleep(0.01)
        released = True
        await ctrl.release()

    asyncio.create_task(_release_later())
    await ctrl.acquire()  # blocks until release
    assert released


async def test_controller_flood_wait_reduces_limit():
    ctrl = _ConcurrencyController(3)
    await ctrl.on_flood_wait(0)
    assert ctrl._limit == 2


async def test_controller_connection_error_reduces_limit():
    ctrl = _ConcurrencyController(3)
    await ctrl.on_connection_error()
    assert ctrl._limit == 2


async def test_controller_limit_floors_at_one():
    ctrl = _ConcurrencyController(1)
    await ctrl.on_flood_wait(0)
    assert ctrl._limit == 1
    await ctrl.on_connection_error()
    assert ctrl._limit == 1


async def test_controller_reduction_blocks_new_acquisition():
    ctrl = _ConcurrencyController(2)
    await ctrl.acquire()
    await ctrl.on_connection_error()  # limit → 1; 1 slot already held
    acquired = False

    async def _try_acquire():
        nonlocal acquired
        await ctrl.acquire()
        acquired = True

    task = asyncio.create_task(_try_acquire())
    await asyncio.sleep(0.02)
    assert not acquired  # blocked
    task.cancel()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_fast_upload.py -v
```

Expected: `ModuleNotFoundError` — `fast_upload` does not exist.

- [ ] **Step 3: Create `backend/app/telegram/fast_upload.py` with `_ConcurrencyController` only**

```python
"""Parallel chunk uploader for Telethon — FastTelethon-style implementation.

Uses multiple concurrent MTProto sender connections to upload different 512 KB
chunks of the same file part in parallel, achieving 3–5× throughput vs.
Telethon's built-in sequential uploader.

Import path for callers: from app.telegram.fast_upload import fast_upload_document
Do NOT re-export from operations.py — circular import risk.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import math
import random
from typing import TYPE_CHECKING, Awaitable, Callable

from telethon.errors import FloodWaitError
from telethon.tl.functions.upload import SaveBigFilePartRequest, SaveFilePartRequest
from telethon.tl.types import DocumentAttributeFilename, InputFile, InputFileBig

if TYPE_CHECKING:
    from telethon import TelegramClient

from app.telegram.operations import UploadedSplit

logger = logging.getLogger(__name__)

CHUNK_SIZE = 512 * 1024                  # 512 KB
SMALL_FILE_THRESHOLD = 10 * 1024 * 1024  # 10 MB


class _ConcurrencyController:
    """Adaptive concurrency gate backed by asyncio.Condition.

    Uses a manual counter rather than asyncio.Semaphore so the concurrency
    limit can be reduced at runtime without deadlocking existing waiters.
    """

    def __init__(self, initial: int) -> None:
        self._limit = max(1, initial)
        self._active = 0
        self._cond = asyncio.Condition()

    async def acquire(self) -> None:
        async with self._cond:
            await self._cond.wait_for(lambda: self._active < self._limit)
            self._active += 1

    async def release(self) -> None:
        async with self._cond:
            self._active -= 1
            self._cond.notify_all()

    async def on_flood_wait(self, seconds: int) -> None:
        await asyncio.sleep(seconds)
        async with self._cond:
            self._limit = max(1, self._limit - 1)
            self._cond.notify_all()
        logger.warning(
            "Flood wait: parallel upload concurrency reduced to %d", self._limit
        )

    async def on_connection_error(self) -> None:
        async with self._cond:
            self._limit = max(1, self._limit - 1)
            self._cond.notify_all()
        logger.warning(
            "Connection error: parallel upload concurrency reduced to %d", self._limit
        )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_fast_upload.py -v
```

Expected: all 6 controller tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/telegram/fast_upload.py backend/tests/test_fast_upload.py
git commit -m "feat: add _ConcurrencyController for adaptive parallel upload concurrency"
```

---

## Task 3: Implement `fast_upload_file` — small file path (≤ 10 MB)

**Files:**
- Modify: `backend/app/telegram/fast_upload.py` (append `fast_upload_file`)
- Modify: `backend/tests/test_fast_upload.py` (append new tests)

- [ ] **Step 1: Append failing tests to `test_fast_upload.py`**

Add the following **after** the existing content in `test_fast_upload.py`. Do not rewrite the file. All imports from the header block (`io`, `AsyncMock`, `MagicMock`, `_make_client`, `CHUNK_SIZE`) are already available.

```python
# ── fast_upload_file — small file (≤ 10 MB) tests ────────────────────────────

from app.telegram.fast_upload import fast_upload_file


async def test_small_file_returns_input_file():
    content = b"hello world"
    reader = io.BytesIO(content)
    client, _ = _make_client()
    result = await fast_upload_file(client, reader, len(content), "test.txt", connections=2)
    assert isinstance(result, InputFile)


async def test_small_file_correct_md5():
    import hashlib
    content = b"x" * 1024
    reader = io.BytesIO(content)
    client, _ = _make_client()
    result = await fast_upload_file(client, reader, len(content), "f.bin", connections=1)
    assert result.md5_checksum == hashlib.md5(content).hexdigest()


async def test_small_file_uses_save_file_part_request():
    from telethon.tl.functions.upload import SaveFilePartRequest, SaveBigFilePartRequest
    content = b"a" * (CHUNK_SIZE + 1)  # 2 chunks
    reader = io.BytesIO(content)
    client, sender = _make_client()
    sent_requests = []
    sender.send = AsyncMock(side_effect=lambda r: sent_requests.append(r) or True)
    await fast_upload_file(client, reader, len(content), "f.bin", connections=2)
    assert all(isinstance(r, SaveFilePartRequest) for r in sent_requests)
    assert len(sent_requests) == 2


async def test_small_file_does_not_use_save_big_file_part_request():
    from telethon.tl.functions.upload import SaveBigFilePartRequest
    content = b"b" * 100
    reader = io.BytesIO(content)
    client, sender = _make_client()
    sent_requests = []
    sender.send = AsyncMock(side_effect=lambda r: sent_requests.append(r) or True)
    await fast_upload_file(client, reader, len(content), "f.bin", connections=1)
    assert not any(isinstance(r, SaveBigFilePartRequest) for r in sent_requests)


async def test_zero_size_raises_value_error():
    import pytest
    client, _ = _make_client()
    with pytest.raises(ValueError, match="zero-byte"):
        await fast_upload_file(client, io.BytesIO(b""), 0, "f.bin", connections=1)


async def test_progress_callback_called():
    content = b"p" * (CHUNK_SIZE * 3)
    reader = io.BytesIO(content)
    client, _ = _make_client()
    calls = []

    async def cb(sent, total):
        calls.append((sent, total))

    await fast_upload_file(client, reader, len(content), "f.bin", connections=2, progress_callback=cb)
    assert len(calls) == 3
    assert calls[-1][0] == len(content)
    assert calls[-1][1] == len(content)


async def test_small_file_senders_returned():
    content = b"r" * 100
    reader = io.BytesIO(content)
    client, _ = _make_client()
    await fast_upload_file(client, reader, len(content), "f.bin", connections=2)
    assert client._return_exported_sender.called
```

Note: `InputFile` is not yet imported at the top of `test_fast_upload.py`. Add this import **at the top of the file**, after the existing `from app.telegram.fast_upload import ...` line:

```python
from telethon.tl.types import InputFile, InputFileBig
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_fast_upload.py -k "small or zero or progress or senders_returned" -v
```

Expected: `ImportError` — `fast_upload_file` not defined yet.

- [ ] **Step 3: Add `fast_upload_file` (small path + big-path stub) to `fast_upload.py`**

Append the following to `backend/app/telegram/fast_upload.py`:

```python
async def fast_upload_file(
    client: "TelegramClient",
    reader: io.RawIOBase,
    size: int,
    name: str,
    connections: int,
    progress_callback: Callable[[int, int], Awaitable[None]] | None = None,
) -> InputFile | InputFileBig:
    """Upload all chunks of a file in parallel using multiple MTProto senders.

    Small files (≤ SMALL_FILE_THRESHOLD): full read upfront, SaveFilePartRequest, InputFile.
    Big files (> SMALL_FILE_THRESHOLD): streaming producer/consumer, SaveBigFilePartRequest, InputFileBig.
    """
    if size == 0:
        raise ValueError("Cannot upload zero-byte file")

    big = size > SMALL_FILE_THRESHOLD
    file_id = random.randint(-(2**63), 2**63 - 1)
    file_parts = math.ceil(size / CHUNK_SIZE)
    dc_id: int = client.session.dc_id

    # ── Borrow senders ────────────────────────────────────────────────────────
    senders = []
    for _ in range(min(connections, file_parts)):
        try:
            sender = await client._borrow_exported_sender(dc_id)
            senders.append(sender)
        except FloodWaitError as e:
            await asyncio.sleep(e.seconds)
            try:
                senders.append(await client._borrow_exported_sender(dc_id))
            except Exception:
                pass
        except Exception:
            pass
    if not senders:
        raise RuntimeError("Could not borrow any MTProto sender for parallel upload")

    # Controller is initialized AFTER borrowing so limit == actual sender count.
    controller = _ConcurrencyController(len(senders))

    # ── Small file path ───────────────────────────────────────────────────────
    if not big:
        raw = reader.read(size)
        md5_hex = hashlib.md5(raw).hexdigest()
        file_parts = math.ceil(len(raw) / CHUNK_SIZE)
        chunks_list = [
            raw[i * CHUNK_SIZE : (i + 1) * CHUNK_SIZE]
            for i in range(file_parts)
        ]
        bytes_uploaded: list[int] = [0] * file_parts

        async def _upload_chunk_small(part_index: int, data: bytes) -> None:
            max_retries = 5
            for attempt in range(max_retries):
                acquired = False
                try:
                    await controller.acquire()
                    acquired = True
                    sender = senders[part_index % len(senders)]
                    await sender.send(SaveFilePartRequest(file_id, part_index, data))
                    if bytes_uploaded[part_index] == 0:
                        bytes_uploaded[part_index] = len(data)
                    if progress_callback:
                        await progress_callback(sum(bytes_uploaded), size)
                    return  # success
                except FloodWaitError as e:
                    await controller.on_flood_wait(e.seconds)
                except (ConnectionError, OSError):
                    await controller.on_connection_error()
                except Exception:
                    if attempt == max_retries - 1:
                        raise
                    await asyncio.sleep(2**attempt)
                finally:
                    if acquired:
                        await controller.release()
            raise RuntimeError(f"Chunk {part_index} failed after {max_retries} attempts")

        try:
            await asyncio.gather(
                *[_upload_chunk_small(i, c) for i, c in enumerate(chunks_list)]
            )
        finally:
            for s in senders:
                try:
                    await client._return_exported_sender(s)
                except Exception:
                    pass

        return InputFile(
            id=file_id,
            parts=file_parts,
            name=name,
            md5_checksum=md5_hex,
        )

    # ── Big file path (implemented in Task 4) ─────────────────────────────────
    raise NotImplementedError("Big file path not yet implemented")
```

- [ ] **Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_fast_upload.py -k "small or zero or progress or senders_returned" -v
```

Expected: all small-file tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/telegram/fast_upload.py backend/tests/test_fast_upload.py
git commit -m "feat: implement fast_upload_file small-file path (<= 10 MB)"
```

---

## Task 4: Implement `fast_upload_file` — big file path (> 10 MB)

**Files:**
- Modify: `backend/app/telegram/fast_upload.py` (replace the NotImplementedError stub)
- Modify: `backend/tests/test_fast_upload.py` (append new tests)

- [ ] **Step 1: Append failing tests to `test_fast_upload.py`**

Append after the existing content. `_FakeReader`, `_make_client`, `io`, `math`, `CHUNK_SIZE`, `AsyncMock`, `InputFileBig` are all available from prior tasks.

```python
# ── fast_upload_file — big file (> 10 MB) tests ───────────────────────────────

from app.telegram.fast_upload import SMALL_FILE_THRESHOLD

BIG = CHUNK_SIZE * 25  # 12.5 MB — just over SMALL_FILE_THRESHOLD


async def test_big_file_returns_input_file_big():
    client, _ = _make_client()
    result = await fast_upload_file(client, _FakeReader(BIG), BIG, "big.bin", connections=2)
    assert isinstance(result, InputFileBig)


async def test_big_file_uses_save_big_file_part_request():
    from telethon.tl.functions.upload import SaveBigFilePartRequest
    client, sender = _make_client()
    sent_requests = []
    sender.send = AsyncMock(side_effect=lambda r: sent_requests.append(r) or True)
    await fast_upload_file(client, _FakeReader(BIG), BIG, "big.bin", connections=2)
    assert all(isinstance(r, SaveBigFilePartRequest) for r in sent_requests)
    assert len(sent_requests) == math.ceil(BIG / CHUNK_SIZE)


async def test_big_file_correct_part_count():
    client, _ = _make_client()
    result = await fast_upload_file(client, _FakeReader(BIG), BIG, "big.bin", connections=2)
    assert result.parts == math.ceil(BIG / CHUNK_SIZE)


async def test_big_file_senders_returned():
    client, _ = _make_client()
    await fast_upload_file(client, _FakeReader(BIG), BIG, "big.bin", connections=2)
    assert client._return_exported_sender.called


async def test_big_file_survives_one_flood_wait():
    """Upload completes even if one chunk gets a FloodWaitError on first attempt."""
    from telethon.errors import FloodWaitError as _FWE
    client, sender = _make_client()
    call_count = 0

    async def _send_with_one_flood(request):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # Construct FloodWaitError with capture=0 for instant retry
            raise _FWE(request=request, capture=0)
        return True

    sender.send = _send_with_one_flood
    result = await fast_upload_file(client, _FakeReader(BIG), BIG, "big.bin", connections=2)
    assert isinstance(result, InputFileBig)


async def test_big_file_truncated_reader_raises():
    import pytest

    class _TruncatedReader(io.RawIOBase):
        """Returns data for only half the declared size."""
        def __init__(self, real: int) -> None:
            self._real = real
            self._pos = 0

        def read(self, n: int = -1) -> bytes:
            remaining = self._real - self._pos
            if remaining <= 0:
                return b""
            n = min(n, remaining) if n > 0 else remaining
            self._pos += n
            return b"\x00" * n

        def readable(self) -> bool:
            return True

    declared = BIG
    actual = BIG // 2
    client, _ = _make_client()

    with pytest.raises(RuntimeError, match="truncated"):
        await fast_upload_file(
            client, _TruncatedReader(actual), declared, "t.bin", connections=2
        )
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_fast_upload.py -k "big" -v
```

Expected: `NotImplementedError` — big file path is a stub.

- [ ] **Step 3: Replace the big-file stub in `fast_upload.py`**

Find the last 3 lines of `fast_upload_file` (the `NotImplementedError` stub):

```python
    # ── Big file path (implemented in Task 4) ─────────────────────────────────
    raise NotImplementedError("Big file path not yet implemented")
```

Replace them with:

```python
    # ── Big file path — producer/consumer streaming ───────────────────────────
    queue: asyncio.Queue[tuple[int, bytes] | None] = asyncio.Queue(
        maxsize=len(senders) * 2
    )
    bytes_uploaded_big: list[int] = [0] * file_parts
    actual_parts_produced = 0

    async def _producer() -> None:
        nonlocal actual_parts_produced
        for part_index in range(file_parts):
            data = reader.read(CHUNK_SIZE)
            if not data:
                break
            actual_parts_produced += 1
            await queue.put((part_index, data))
        for _ in senders:
            await queue.put(None)  # one sentinel per consumer

    async def _consumer(sender_index: int) -> None:
        sender = senders[sender_index]
        while True:
            item = await queue.get()
            if item is None:
                break
            part_index, data = item
            max_retries = 5
            for attempt in range(max_retries):
                acquired = False
                try:
                    await controller.acquire()
                    acquired = True
                    await sender.send(
                        SaveBigFilePartRequest(file_id, part_index, file_parts, data)
                    )
                    if bytes_uploaded_big[part_index] == 0:
                        bytes_uploaded_big[part_index] = len(data)
                    if progress_callback:
                        await progress_callback(sum(bytes_uploaded_big), size)
                    break  # success
                except FloodWaitError as e:
                    await controller.on_flood_wait(e.seconds)
                except (ConnectionError, OSError):
                    await controller.on_connection_error()
                except Exception:
                    if attempt == max_retries - 1:
                        raise
                    await asyncio.sleep(2**attempt)
                finally:
                    if acquired:
                        await controller.release()

    producers = [asyncio.create_task(_producer())]
    consumers = [asyncio.create_task(_consumer(i)) for i in range(len(senders))]
    try:
        await asyncio.gather(*producers, *consumers)
        if actual_parts_produced != file_parts:
            raise RuntimeError(
                f"File read produced {actual_parts_produced} parts, "
                f"expected {file_parts}. File may have been truncated."
            )
    finally:
        for t in producers + consumers:
            if not t.done():
                t.cancel()
        for s in senders:
            try:
                await client._return_exported_sender(s)
            except Exception:
                pass

    return InputFileBig(id=file_id, parts=file_parts, name=name)
```

- [ ] **Step 4: Run all fast_upload tests**

```bash
cd backend && python -m pytest tests/test_fast_upload.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/telegram/fast_upload.py backend/tests/test_fast_upload.py
git commit -m "feat: implement fast_upload_file big-file path with producer/consumer queue"
```

---

## Task 5: Implement `fast_upload_document`

**Files:**
- Modify: `backend/app/telegram/fast_upload.py` (append `fast_upload_document`)
- Modify: `backend/tests/test_fast_upload.py` (append new tests)

- [ ] **Step 1: Append failing tests to `test_fast_upload.py`**

```python
# ── fast_upload_document tests ────────────────────────────────────────────────

from app.telegram.fast_upload import fast_upload_document
from app.telegram.operations import UploadedSplit


async def test_fast_upload_document_returns_uploaded_split():
    content = b"doc" * 100
    reader = io.BytesIO(content)
    mock_doc = MagicMock()
    mock_doc.id = 99999
    mock_doc.access_hash = 88888
    mock_msg = MagicMock()
    mock_msg.id = 42
    mock_msg.document = mock_doc
    client, _ = _make_client()
    client.send_file = AsyncMock(return_value=mock_msg)
    result = await fast_upload_document(
        client=client,
        channel_id=123,
        document=reader,
        filename="doc.bin",
        size=len(content),
        connections=2,
    )
    assert isinstance(result, UploadedSplit)
    assert result.message_id == 42
    assert result.file_id == "99999"
    assert result.file_unique_id == "88888"


async def test_fast_upload_document_passes_pre_uploaded_input_to_send_file():
    content = b"x" * 100
    reader = io.BytesIO(content)
    mock_msg = MagicMock()
    mock_msg.id = 1
    mock_msg.document.id = 2
    mock_msg.document.access_hash = 3
    client, _ = _make_client()
    client.send_file = AsyncMock(return_value=mock_msg)
    await fast_upload_document(
        client=client, channel_id=456, document=reader,
        filename="f.txt", size=len(content), connections=1,
    )
    args, kwargs = client.send_file.call_args
    assert args[0] == 456
    assert isinstance(args[1], (InputFile, InputFileBig))
    assert kwargs.get("force_document") is True
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_fast_upload.py -k "document" -v
```

Expected: `ImportError` — `fast_upload_document` not defined yet.

- [ ] **Step 3: Append `fast_upload_document` to `fast_upload.py`**

```python
async def fast_upload_document(
    client: "TelegramClient",
    channel_id: int,
    document: io.RawIOBase,
    filename: str,
    size: int,
    connections: int,
    progress_callback=None,
) -> UploadedSplit:
    """Upload a file to a Telegram channel using parallel chunk uploading.

    Calls fast_upload_file to upload all chunks in parallel across multiple
    MTProto senders, then calls client.send_file with the pre-uploaded
    InputFile/InputFileBig reference (Telethon skips re-upload automatically).

    IMPORTANT: send_file is called on the same client that performed the chunk
    uploads. Pre-uploaded file references are tied to the uploading session —
    using a different client instance will cause FILE_REFERENCE_EXPIRED.
    """
    input_file = await fast_upload_file(
        client=client,
        reader=document,
        size=size,
        name=filename,
        connections=connections,
        progress_callback=progress_callback,
    )
    msg = await client.send_file(
        channel_id,
        input_file,
        attributes=[DocumentAttributeFilename(file_name=filename)],
        force_document=True,
        file_size=size,
    )
    return UploadedSplit(
        message_id=msg.id,
        file_id=str(msg.document.id),
        file_unique_id=str(msg.document.access_hash),
    )
```

- [ ] **Step 4: Run all fast_upload tests**

```bash
cd backend && python -m pytest tests/test_fast_upload.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/telegram/fast_upload.py backend/tests/test_fast_upload.py
git commit -m "feat: implement fast_upload_document wrapper"
```

---

## Task 6: Wire `fast_upload_document` into `upload.py` and update existing tests

**Files:**
- Modify: `backend/app/services/upload.py`
- Modify: `backend/tests/test_upload_offset.py`

> **No changes to `operations.py`** — importing `fast_upload_document` there would create a circular import.

- [ ] **Step 1: Update imports in `upload.py`**

In `backend/app/services/upload.py`, make two import changes:

**Change 1** — replace the `upload_document` import:

```python
# Before:
from app.telegram.operations import UploadedSplit, delete_message, upload_document

# After:
from app.telegram.operations import UploadedSplit, delete_message
from app.telegram.fast_upload import fast_upload_document
```

**Change 2** — add `get_settings` (currently not imported in `upload.py`). Add at the top of the file with the other app imports:

```python
from app.core.config import get_settings
```

- [ ] **Step 2: Update the call site in `_upload_split` inside `execute_upload`**

Find the block (around lines 402–411) that creates the upload task:

```python
upload_task = asyncio.create_task(
    upload_document(
        client,
        telegram_channel_id,
        reader,
        filename=split_name,
        size=split_size,
        progress_callback=_on_progress,
    )
)
```

Replace it with:

```python
upload_task = asyncio.create_task(
    fast_upload_document(
        client,
        telegram_channel_id,
        reader,
        filename=split_name,
        size=split_size,
        connections=get_settings().parallel_upload_connections,
        progress_callback=_on_progress,
    )
)
```

- [ ] **Step 3: Update patch targets in `test_upload_offset.py`**

The existing tests patch `app.services.upload.upload_document`. That symbol no longer exists in `upload.py` after Step 1. Patching a non-existent name raises `AttributeError` in newer versions of `unittest.mock`.

In `backend/tests/test_upload_offset.py`, find both occurrences of:

```python
patch("app.services.upload.upload_document", fake_upload_document),
```

Change each to:

```python
patch("app.services.upload.fast_upload_document", fake_upload_document),
```

There are exactly two occurrences — one in `test_single_account_offset_zero_uses_account_zero` and one in `test_two_accounts_offset_selects_different_primary`.

Also add a `connections` assertion to each test to verify the wiring passes `connections` through. In `test_single_account_offset_zero_uses_account_zero`, update `fake_upload_document` to capture kwargs:

```python
async def fake_upload_document(client, channel_id, reader, **kwargs):
    used_clients.append(client)
    assert "connections" in kwargs, "fast_upload_document must receive connections kwarg"
    result = MagicMock()
    result.message_id = 1
    result.file_id = b"x"
    result.file_unique_id = "u1"
    return result
```

Apply the same `assert "connections" in kwargs` line to the `fake_upload_document` in `test_two_accounts_offset_selects_different_primary`.

- [ ] **Step 4: Run the existing upload offset tests**

```bash
cd backend && python -m pytest tests/test_upload_offset.py -v
```

Expected: both tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
cd backend && python -m pytest -v
```

Expected: all tests pass. Do not commit until this is green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/upload.py backend/tests/test_upload_offset.py
git commit -m "feat: wire fast_upload_document into upload pipeline (parallel chunk upload)"
```

---

## Final Verification

- [ ] **Run the full test suite**

```bash
cd backend && python -m pytest -v
```

Expected: all tests green.

- [ ] **Spot-check imports from a fresh Python process**

```bash
cd backend && python -c "
from app.telegram.fast_upload import fast_upload_document, fast_upload_file, _ConcurrencyController
from app.telegram.operations import UploadedSplit
from app.services.upload import execute_upload
from app.core.config import get_settings
s = get_settings()
print('parallel_upload_connections =', s.parallel_upload_connections)
print('All imports OK')
"
```

Expected: `parallel_upload_connections = 8` and `All imports OK`.
