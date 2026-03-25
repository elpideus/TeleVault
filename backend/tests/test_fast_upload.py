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
from telethon.tl.types import InputFile, InputFileBig


# ── Shared helpers ────────────────────────────────────────────────────────────

def _make_client(dc_id: int = 2):
    """Return a (client, sender) pair with all Telethon internals mocked.

    client._sender is the primary sender used by fast_upload_file.
    _borrow_exported_sender / _return_exported_sender are kept as AsyncMocks
    so tests can assert they are NOT called.
    """
    client = MagicMock()
    client.session.dc_id = dc_id
    sender = MagicMock()
    sender.send = AsyncMock(return_value=True)
    client._sender = sender
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


async def test_small_file_uses_primary_sender():
    content = b"r" * 100
    reader = io.BytesIO(content)
    client, _ = _make_client()
    await fast_upload_file(client, reader, len(content), "f.bin", connections=2)
    assert not client._borrow_exported_sender.called
    assert not client._return_exported_sender.called


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


async def test_big_file_uses_primary_sender():
    client, _ = _make_client()
    await fast_upload_file(client, _FakeReader(BIG), BIG, "big.bin", connections=2)
    assert not client._borrow_exported_sender.called
    assert not client._return_exported_sender.called


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

    declared = BIG
    client, _ = _make_client()

    with pytest.raises(RuntimeError, match="truncated"):
        await fast_upload_file(
            client, _FakeReader(BIG // 2), declared, "t.bin", connections=2
        )


# ── fast_upload_document tests ────────────────────────────────────────────────

from app.telegram.fast_upload import fast_upload_document
from app.telegram.operations import UploadedSplit


async def test_fast_upload_document_calls_send_file():
    """fast_upload_document calls client.send_file with the pre-uploaded InputFile/InputFileBig."""
    import io as _io
    content = b"doc" * 100
    reader = _io.BytesIO(content)
    client, _ = _make_client()

    doc_msg = MagicMock()
    doc_msg.id = 42
    doc_msg.document.id = 99
    doc_msg.document.access_hash = 12345
    client.send_file = AsyncMock(return_value=doc_msg)

    result = await fast_upload_document(client, 123, reader, "doc.bin", len(content), connections=1)

    assert client.send_file.called
    call_kwargs = client.send_file.call_args
    # First positional arg is channel_id=123, second is the InputFile
    assert call_kwargs.args[0] == 123
    from telethon.tl.types import InputFile, InputFileBig
    assert isinstance(call_kwargs.args[1], (InputFile, InputFileBig))


async def test_fast_upload_document_returns_uploaded_split():
    """fast_upload_document returns UploadedSplit with correct message_id, file_id, file_unique_id."""
    import io as _io
    content = b"x" * 50
    reader = _io.BytesIO(content)
    client, _ = _make_client()

    doc_msg = MagicMock()
    doc_msg.id = 7
    doc_msg.document.id = 888
    doc_msg.document.access_hash = 999
    client.send_file = AsyncMock(return_value=doc_msg)

    result = await fast_upload_document(client, 456, reader, "f.txt", len(content), connections=1)

    assert isinstance(result, UploadedSplit)
    assert result.message_id == 7
    assert result.file_id == "888"
    assert result.file_unique_id == "999"
