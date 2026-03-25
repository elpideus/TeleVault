"""Parallel chunk uploader for Telethon — FastTelethon-style implementation.

Uses multiple concurrent MTProto sender connections to upload different 512 KB
chunks of the same file part in parallel, achieving 3–5× throughput vs.
Telethon's built-in sequential uploader.

Import path for callers: from app.telegram.fast_upload import fast_upload_document
Do NOT re-export from operations.py — circular import risk.
"""
from __future__ import annotations

import asyncio
import hashlib  # noqa: F401  (used by fast_upload_file)
import io  # noqa: F401
import logging
import math  # noqa: F401
import random  # noqa: F401
from typing import TYPE_CHECKING, Awaitable, Callable

# These symbols are used by fast_upload_file and fast_upload_document (added in later tasks).  # noqa: F401
from telethon.errors import FloodWaitError
from telethon.tl.functions.upload import SaveBigFilePartRequest, SaveFilePartRequest  # noqa: F401
from telethon.tl.types import DocumentAttributeFilename, InputFile, InputFileBig  # noqa: F401

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
