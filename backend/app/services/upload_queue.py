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

# Populated lazily on first worker call to avoid importing the full app stack
# at module-import time (which requires env vars / DB config).
# Declared here so patch("app.services.upload_queue.execute_upload", …) works.
execute_upload = None  # type: ignore[assignment]


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
        self._queues.clear()
        self._slot_counter.clear()

    # ── Internal ────────────────────────────────────────────────────────────

    async def _worker(self, owner_id: int) -> None:
        global execute_upload
        if execute_upload is None:
            from app.services.upload import execute_upload as _eu  # lazy: avoids env-var requirement at import time
            execute_upload = _eu

        queue = self._queues[owner_id]
        while True:
            try:
                job = await queue.get()  # CancelledError from set_worker_count arrives here
            except asyncio.CancelledError:
                break  # Clean exit — no job was dequeued

            if job is None:  # shutdown sentinel
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
