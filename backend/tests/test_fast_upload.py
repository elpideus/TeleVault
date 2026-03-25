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
