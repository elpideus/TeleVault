"""Tests that execute_upload distributes splits across accounts using account_offset."""
from __future__ import annotations

import os
import sys
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Stub app.db.session before any app imports so create_async_engine is never
# called (it requires a real DB driver at import time).
# ---------------------------------------------------------------------------
_mock_session_module = MagicMock()
sys.modules.setdefault("app.db.session", _mock_session_module)

# Provide minimum required env-vars so Settings() validates without a .env file.
os.environ.setdefault("TELEGRAM_API_ID", "12345")
os.environ.setdefault("TELEGRAM_API_HASH", "deadbeefdeadbeefdeadbeef00000000")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests")
os.environ.setdefault("ENCRYPTION_KEY", "dGVzdC1lbmNyeXB0aW9uLWtleS0zMmJ5dGVzIS0tLS0=")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://u:p@localhost/db")

from app.services.upload import execute_upload, _SPLIT_SIZE  # noqa: E402


def _make_mock_pool(n_accounts: int):
    """Return a ClientPool mock with n_accounts fake clients."""
    mock_pool = MagicMock()
    clients = [(uuid.uuid4(), MagicMock()) for _ in range(n_accounts)]
    mock_pool.get_all_clients_for_user.return_value = clients
    for _, client in clients:
        client.is_connected.return_value = True
    return mock_pool, clients


@pytest.fixture()
def tmp_readable_file(tmp_path):
    """A small readable file that won't be deleted by execute_upload's cleanup."""
    p = tmp_path / "dummy_upload.bin"
    p.write_bytes(b"x" * 100)
    return str(p)


@pytest.mark.asyncio
async def test_single_account_offset_zero_uses_account_zero(tmp_readable_file):
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
            tmp_path=tmp_readable_file,
            account_offset=0,
        )

    assert used_clients == [clients[0][1]]


@pytest.mark.asyncio
async def test_two_accounts_offset_selects_different_primary(tmp_path):
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

        channel = MagicMock()
        channel.channel_id = 123
        channel.id = uuid.uuid4()
        registry = MagicMock(emit_progress=AsyncMock(), emit_done=AsyncMock(), emit_error=AsyncMock())

        # Create a fresh file for each call since execute_upload deletes tmp_path.
        file0 = tmp_path / "file0.bin"
        file0.write_bytes(b"x" * 100)
        file1 = tmp_path / "file1.bin"
        file1.write_bytes(b"x" * 100)

        current_op["id"] = "op0"
        await execute_upload(
            registry=registry, pool=mock_pool, operation_id="op0",
            file_id=uuid.uuid4(), owner_id=1, folder_id=None, channel=channel,
            filename="a.txt", mime_type=None, total_size=100, file_hash="h1",
            tmp_path=str(file0), account_offset=0,
        )

        current_op["id"] = "op1"
        await execute_upload(
            registry=registry, pool=mock_pool, operation_id="op1",
            file_id=uuid.uuid4(), owner_id=1, folder_id=None, channel=channel,
            filename="b.txt", mime_type=None, total_size=100, file_hash="h2",
            tmp_path=str(file1), account_offset=1,
        )

    # op0 (offset=0): split 0 → (0+0)%2=0 → clients[0]
    assert used_clients_by_op["op0"] == [clients[0][1]]
    # op1 (offset=1): split 0 → (1+0)%2=1 → clients[1]
    assert used_clients_by_op["op1"] == [clients[1][1]]
