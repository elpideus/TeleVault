import asyncio
from dataclasses import dataclass
from typing import AsyncGenerator
from uuid import uuid4


@dataclass
class ProgressEvent:
    operation_id: str
    pct: float
    bytes_done: int
    bytes_total: int
    status: str  # "progress" | "done" | "error"
    message: str | None = None
    error: str | None = None


class OperationRegistry:
    def __init__(self) -> None:
        self._queues: dict[str, asyncio.Queue[ProgressEvent]] = {}

    def create_operation(self) -> str:
        operation_id = str(uuid4())
        self._queues[operation_id] = asyncio.Queue(maxsize=100)
        return operation_id

    async def emit_progress(
        self, operation_id: str, bytes_done: int, bytes_total: int, message: str | None = None
    ) -> None:
        queue = self._queues.get(operation_id)
        if queue is None:
            return
        pct = (bytes_done / bytes_total * 100) if bytes_total > 0 else 0.0
        event = ProgressEvent(
            operation_id=operation_id,
            pct=pct,
            bytes_done=bytes_done,
            bytes_total=bytes_total,
            status="progress",
            message=message,
        )
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass

    async def emit_done(self, operation_id: str, message: str | None = None) -> None:
        queue = self._queues.get(operation_id)
        if queue is None:
            return
        event = ProgressEvent(
            operation_id=operation_id,
            pct=100.0,
            bytes_done=0,
            bytes_total=0,
            status="done",
            message=message,
        )
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass
        asyncio.get_event_loop().call_later(
            30, lambda: self._queues.pop(operation_id, None)
        )

    async def emit_error(self, operation_id: str, error: str, message: str | None = None) -> None:
        queue = self._queues.get(operation_id)
        if queue is None:
            return
        event = ProgressEvent(
            operation_id=operation_id,
            pct=0.0,
            bytes_done=0,
            bytes_total=0,
            status="error",
            message=message,
            error=error,
        )
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass
        asyncio.get_event_loop().call_later(
            30, lambda: self._queues.pop(operation_id, None)
        )

    async def stream(
        self, operation_id: str
    ) -> AsyncGenerator[ProgressEvent, None]:
        queue = self._queues.get(operation_id)
        if queue is None:
            return
        while True:
            event = await queue.get()
            yield event
            if event.status in ("done", "error"):
                break
