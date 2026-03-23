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
    status: str  # "progress" | "done" | "error" | "cancelled" | "ping"
    message: str | None = None
    error: str | None = None


class OperationRegistry:
    """Tracks active upload operations and fans out progress events to all SSE
    consumers watching a given operation.

    A single upload can have multiple SSE listeners (e.g. the upload queue
    and the visible transfers tray), so each emit goes to every listener
    queue rather than just one.
    """

    def __init__(self) -> None:
        # operation_id → set of per-consumer listener queues (fan-out)
        self._listeners: dict[str, set[asyncio.Queue[ProgressEvent]]] = {}
        # owner_id → set of per-consumer listener queues
        self._user_listeners: dict[int, set[asyncio.Queue[ProgressEvent]]] = {}
        self._op_to_owner: dict[str, int] = {}
        # operation_ids that have been requested to cancel (checked by workers)
        self._cancelled_ops: set[str] = set()

    def create_operation(self, owner_id: int) -> str:
        operation_id = str(uuid4())
        self._listeners[operation_id] = set()
        self._op_to_owner[operation_id] = owner_id
        return operation_id

    def _broadcast(self, operation_id: str, event: ProgressEvent) -> None:
        queues = list(self._listeners.get(operation_id, set()))
        owner_id = self._op_to_owner.get(operation_id)
        if owner_id is not None:
            queues.extend(self._user_listeners.get(owner_id, set()))

        for q in queues:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass  # slow consumer — drop rather than block

    async def emit_progress(
        self, operation_id: str, bytes_done: int, bytes_total: int, message: str | None = None
    ) -> None:
        pct = (bytes_done / bytes_total * 100) if bytes_total > 0 else 0.0
        self._broadcast(operation_id, ProgressEvent(
            operation_id=operation_id,
            pct=pct,
            bytes_done=bytes_done,
            bytes_total=bytes_total,
            status="progress",
            message=message,
        ))

    async def emit_done(self, operation_id: str, message: str | None = None) -> None:
        self._broadcast(operation_id, ProgressEvent(
            operation_id=operation_id,
            pct=100.0,
            bytes_done=0,
            bytes_total=0,
            status="done",
            message=message,
        ))

        def _cleanup():
            self._listeners.pop(operation_id, None)
            self._op_to_owner.pop(operation_id, None)

        asyncio.get_event_loop().call_later(30, _cleanup)

    async def emit_error(self, operation_id: str, error: str, message: str | None = None) -> None:
        self._broadcast(operation_id, ProgressEvent(
            operation_id=operation_id,
            pct=0.0,
            bytes_done=0,
            bytes_total=0,
            status="error",
            message=message,
            error=error,
        ))

        def _cleanup():
            self._listeners.pop(operation_id, None)
            self._op_to_owner.pop(operation_id, None)

        asyncio.get_event_loop().call_later(30, _cleanup)

    def has_operation(self, operation_id: str) -> bool:
        return operation_id in self._listeners

    def is_cancelled(self, operation_id: str) -> bool:
        """Return True if cancel has been requested for this operation."""
        return operation_id in self._cancelled_ops

    async def emit_cancelled(self, operation_id: str, message: str | None = None) -> None:
        """Broadcast a cancelled event and schedule cleanup."""
        self._cancelled_ops.add(operation_id)
        self._broadcast(operation_id, ProgressEvent(
            operation_id=operation_id,
            pct=0.0,
            bytes_done=0,
            bytes_total=0,
            status="cancelled",
            message=message,
        ))

        def _cleanup() -> None:
            self._listeners.pop(operation_id, None)
            self._op_to_owner.pop(operation_id, None)
            self._cancelled_ops.discard(operation_id)

        asyncio.get_event_loop().call_later(30, _cleanup)

    def cancel_operation(self, operation_id: str) -> None:
        """Mark an operation as cancelled synchronously (for workers to poll).

        Callers should also call emit_cancelled() to notify SSE consumers.
        This is the fast path used by the cancel endpoint before awaiting
        emit_cancelled.
        """
        self._cancelled_ops.add(operation_id)

    async def stream(
        self, operation_id: str
    ) -> AsyncGenerator[ProgressEvent, None]:
        """Subscribe to progress events for an operation.

        Each call creates a dedicated listener queue so multiple concurrent
        SSE consumers all receive every event (fan-out).  A 20-second
        heartbeat ping keeps QUIC/proxy connections alive when no real
        progress events are emitted.
        """
        listeners = self._listeners.get(operation_id)
        if listeners is None:
            return
        q: asyncio.Queue[ProgressEvent] = asyncio.Queue(maxsize=100)
        listeners.add(q)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield event
                    if event.status in ("done", "error", "cancelled"):
                        break
                except asyncio.TimeoutError:
                    # Synthetic ping — the HTTP handler converts this to an
                    # SSE comment (": ping") to keep QUIC/proxy alive.
                    yield ProgressEvent(
                        operation_id=operation_id,
                        pct=0,
                        bytes_done=0,
                        bytes_total=0,
                        status="ping",
                    )
        finally:
            listeners.discard(q)

    async def stream_all(
        self, owner_id: int
    ) -> AsyncGenerator[ProgressEvent, None]:
        """Subscribe to ALL progress events for a user."""
        if owner_id not in self._user_listeners:
            self._user_listeners[owner_id] = set()
        
        listeners = self._user_listeners[owner_id]
        q: asyncio.Queue[ProgressEvent] = asyncio.Queue(maxsize=500)
        listeners.add(q)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield event
                except asyncio.TimeoutError:
                    yield ProgressEvent(
                        operation_id="",
                        pct=0,
                        bytes_done=0,
                        bytes_total=0,
                        status="ping",
                    )
        finally:
            listeners.discard(q)
            if not self._user_listeners[owner_id]:
                self._user_listeners.pop(owner_id, None)
