import asyncio
from typing import AsyncGenerator


class EventBroadcaster:
    """Notifies per-user SSE streams when a new activity event is logged."""

    def __init__(self) -> None:
        self._listeners: dict[int, set[asyncio.Queue[None]]] = {}

    def notify(self, telegram_id: int) -> None:
        for q in self._listeners.get(telegram_id, set()):
            try:
                q.put_nowait(None)
            except asyncio.QueueFull:
                pass

    async def stream(self, telegram_id: int) -> AsyncGenerator[None, None]:
        q: asyncio.Queue[None] = asyncio.Queue(maxsize=32)
        self._listeners.setdefault(telegram_id, set()).add(q)
        try:
            while True:
                await q.get()
                yield
        finally:
            self._listeners[telegram_id].discard(q)
            if not self._listeners[telegram_id]:
                self._listeners.pop(telegram_id, None)
