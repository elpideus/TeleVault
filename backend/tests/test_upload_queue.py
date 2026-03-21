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
    await asyncio.sleep(0)  # let tasks start and reach queue.get()

    # Capture the two tasks that will be cancelled (the ones popped from the list)
    tasks_before = list(pool._workers[1])
    pool.set_worker_count(1, 1)
    cancelled = tasks_before[1:]  # set_worker_count pops from the end

    # Give cancelled tasks time to exit via CancelledError on queue.get()
    await asyncio.sleep(0.1)

    # Verify the live worker list shrank
    assert pool.get_worker_count(1) == 1

    # Verify the cancelled tasks actually exited (not just removed from list)
    for t in cancelled:
        assert t.done(), f"Cancelled task {t} is still running"

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
