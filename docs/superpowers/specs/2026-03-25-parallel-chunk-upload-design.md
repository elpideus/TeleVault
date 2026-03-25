# Parallel Chunk Upload — Design Spec

**Date:** 2026-03-25
**Status:** Approved

---

## Problem

Telethon's `send_file` uploads 512 KB chunks **sequentially** over a single MTProto connection. For single-account users (the majority), this is the primary throughput bottleneck — there is no inter-split parallelism to compensate. The goal is to upload different 512 KB chunks of the same split concurrently across multiple MTProto sender connections, targeting a 3–5× speed increase.

---

## Scope

- Affects all uploads: files < 2 GB (no split) and each 2 GB part of multi-split files.
- Number of parallel connections is configurable via `PARALLEL_UPLOAD_CONNECTIONS` (default: 8, min: 1).
- Concurrency auto-reduces when Telegram signals overload (FloodWait, connection errors).

---

## Why multiple connections, not just concurrent requests on one sender

A single MTProtoSender runs over a single TCP connection, bounded by that connection's congestion window. Multiple independent connections open independent congestion windows, achieving higher aggregate throughput. This is the rationale behind every production FastTelethon implementation.

`client._borrow_exported_sender(dc_id)` is the correct Telethon 1.36 API to obtain additional authenticated MTProto senders to a given DC, including the client's own DC. Cleanup must use `client._return_exported_sender(sender)` to maintain borrow-count tracking.

---

## New File: `backend/app/telegram/fast_upload.py`

### Constants

```python
CHUNK_SIZE = 512 * 1024                  # 512 KB — matches Telethon's internal default
SMALL_FILE_THRESHOLD = 10 * 1024 * 1024  # 10 MB — Telegram's small-file boundary
```

### TL Types Used

- Big files (> 10 MB): `telethon.tl.types.InputFileBig`, `telethon.tl.functions.upload.SaveBigFilePartRequest`
- Small files (≤ 10 MB): `telethon.tl.types.InputFile(id, parts, name, md5_checksum)`, `telethon.tl.functions.upload.SaveFilePartRequest`

Note: `md5_checksum` in `InputFile` is a hex string (`hashlib.md5(content).hexdigest()`).

### Component 1 — `_ConcurrencyController`

An adaptive concurrency gate using a manual counter and `asyncio.Condition` (not `asyncio.Semaphore`, which cannot be resized after construction).

**Fields:**

- `_limit: int` — current concurrency ceiling (floor at 1)
- `_active: int = 0` — currently held permits
- `_cond: asyncio.Condition`

**Methods:**

```python
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
    logger.warning("Flood wait: parallel upload concurrency reduced to %d", self._limit)

async def on_connection_error(self) -> None:
    async with self._cond:
        self._limit = max(1, self._limit - 1)
        self._cond.notify_all()
    logger.warning("Connection error: parallel upload concurrency reduced to %d", self._limit)
```

Reductions take effect naturally: `release()` calls `notify_all()`, so waiting acquirers re-evaluate the condition and those that would exceed the new limit sleep again. `_active` can never exceed `_limit` at the time of acquisition.

### Component 2 — `fast_upload_file`

```python
async def fast_upload_file(
    client: TelegramClient,
    reader: io.RawIOBase,
    size: int,
    name: str,
    connections: int,
    progress_callback: Callable[[int, int], Awaitable[None]] | None = None,
) -> InputFile | InputFileBig
```

#### Pre-flight

1. Guard: `size == 0` raises `ValueError("Cannot upload zero-byte file")`.
2. `big = size > SMALL_FILE_THRESHOLD`
3. `file_id = random.randint(-(2**63), 2**63 - 1)` (signed int64)
4. `file_parts = math.ceil(size / CHUNK_SIZE)`
5. `dc_id = client.session.dc_id`

#### Small files (≤ 10 MB) — read fully upfront

For small files only, read the entire content into memory (max ~10 MB) before borrowing senders. Compute MD5 at this point:

```python
raw = reader.read(size)
md5_hex = hashlib.md5(raw).hexdigest()
file_parts = math.ceil(len(raw) / CHUNK_SIZE)
chunks_list = [raw[i * CHUNK_SIZE:(i + 1) * CHUNK_SIZE] for i in range(file_parts)]
```

#### Big files (> 10 MB) — producer/consumer streaming

Do **not** read the entire split into memory (up to 2 GB). Instead, use a bounded `asyncio.Queue` as a producer/consumer channel:

```python
# maxsize bounds peak memory to: connections * 2 * 512 KB ≈ 8 MB at default settings
queue: asyncio.Queue[tuple[int, bytes] | None] = asyncio.Queue(maxsize=connections * 2)
```

The producer coroutine reads chunks sequentially and pushes `(part_index, data)` tuples. Consumers pop and upload. This is detailed in the upload loop section below.

#### Borrow senders

```python
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
```

`_ConcurrencyController` is initialized **after** borrowing: `controller = _ConcurrencyController(len(senders))`. This ensures the initial concurrency limit matches the actual number of senders, not the requested count.

#### Upload loop — big files (producer/consumer)

```python
bytes_uploaded: list[int] = [0] * file_parts  # per-part high-water mark

actual_parts_produced = 0  # tracked by producer; validated after gather

async def _producer() -> None:
    nonlocal actual_parts_produced
    for part_index in range(file_parts):
        data = reader.read(CHUNK_SIZE)
        if not data:
            break
        actual_parts_produced += 1
        await queue.put((part_index, data))
    for _ in senders:
        await queue.put(None)  # sentinel per consumer

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
                # Only count bytes once per chunk (high-water mark prevents retry double-count)
                if bytes_uploaded[part_index] == 0:
                    bytes_uploaded[part_index] = len(data)
                if progress_callback:
                    await progress_callback(sum(bytes_uploaded), size)
                break  # success
            except FloodWaitError as e:
                await controller.on_flood_wait(e.seconds)
                # retry
            except (ConnectionError, OSError):
                await controller.on_connection_error()
                # retry
            except Exception:
                if attempt == max_retries - 1:
                    raise
                await asyncio.sleep(2 ** attempt)
            finally:
                if acquired:
                    await controller.release()

producers = [asyncio.create_task(_producer())]
consumers = [asyncio.create_task(_consumer(i)) for i in range(len(senders))]
try:
    await asyncio.gather(*producers, *consumers)
    # Guard: if the file was shorter than expected, all_parts were not uploaded.
    # Telegram would silently produce a corrupt file; raise explicitly instead.
    if actual_parts_produced != file_parts:
        raise RuntimeError(
            f"File read produced {actual_parts_produced} parts, expected {file_parts}. "
            "File may have been truncated."
        )
finally:
    for t in producers + consumers:
        if not t.done():
            t.cancel()
    for sender in senders:
        try:
            await client._return_exported_sender(sender)
        except Exception:
            pass
```

#### Upload loop — small files

Use the same acquire/release pattern but iterate over `chunks_list` directly (no queue needed since all data is already in memory):

```python
bytes_uploaded: list[int] = [0] * file_parts

async def _upload_chunk_small(part_index: int, data: bytes) -> None:
    max_retries = 5
    for attempt in range(max_retries):
        acquired = False
        try:
            await controller.acquire()
            acquired = True
            sender = senders[part_index % len(senders)]
            await sender.send(
                SaveFilePartRequest(file_id, part_index, data)
            )
            if bytes_uploaded[part_index] == 0:
                bytes_uploaded[part_index] = len(data)
            if progress_callback:
                await progress_callback(sum(bytes_uploaded), size)
            return  # success
        except FloodWaitError as e:
            await controller.on_flood_wait(e.seconds)
            # retry
        except (ConnectionError, OSError):
            await controller.on_connection_error()
            # retry
        except Exception:
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(2 ** attempt)
        finally:
            if acquired:
                await controller.release()

try:
    await asyncio.gather(*[_upload_chunk_small(i, c) for i, c in enumerate(chunks_list)])
finally:
    for sender in senders:
        try:
            await client._return_exported_sender(sender)
        except Exception:
            pass
```

#### Return value

```python
if big:
    return InputFileBig(id=file_id, parts=file_parts, name=name)
else:
    return InputFile(id=file_id, parts=file_parts, name=name, md5_checksum=md5_hex)
```

### Component 3 — `fast_upload_document`

```python
async def fast_upload_document(
    client: TelegramClient,
    channel_id: int,
    document: io.RawIOBase,
    filename: str,
    size: int,
    connections: int,
    progress_callback=None,
) -> UploadedSplit
```

1. Calls `fast_upload_file(client, document, size, filename, connections, progress_callback)` → `input_file`
2. Calls `client.send_file(channel_id, input_file, attributes=[DocumentAttributeFilename(filename)], force_document=True, file_size=size)` on the **same `client` instance** that performed chunk uploads. Pre-uploaded file references are tied to the uploading session — using a different client causes `FILE_REFERENCE_EXPIRED`.
3. Returns `UploadedSplit(message_id, file_id, file_unique_id)` — identical shape to current.

---

## Modified: `backend/app/telegram/operations.py`

- Import `fast_upload_document` from `.fast_upload`
- Keep existing `upload_document` (no removal)

---

## Modified: `backend/app/services/upload.py`

- Replace `upload_document` call in `_upload_split` with `fast_upload_document`
- Pass `connections=get_settings().parallel_upload_connections`

---

## Modified: `backend/app/core/config.py`

```python
parallel_upload_connections: int = Field(default=8, ge=1)
# Controls concurrent MTProto sender connections per split when uploading to Telegram.
# Distinct from any HTTP-layer upload concurrency settings.
# Reads from PARALLEL_UPLOAD_CONNECTIONS env var.
```

---

## Memory Profile

| File size | Peak RAM for chunk buffer |
| --- | --- |
| ≤ 10 MB (small path) | ~10 MB (full file read once) |
| > 10 MB (big path) | `connections * 2 * 512 KB` ≈ 8 MB at default settings |
| 2 GB split (worst case) | ~8 MB (producer/consumer queue) |

---

## Error Handling Summary

| Signal | Action |
| --- | --- |
| `FloodWaitError(seconds)` on chunk upload | Sleep `seconds`, reduce concurrency by 1, retry chunk |
| `FloodWaitError` on sender borrow | Sleep, retry once; proceed with fewer senders |
| `ConnectionError` / `OSError` on chunk | Reduce concurrency by 1, retry chunk |
| Concurrency reduced to 1 | Continue as single-connection upload (graceful degradation) |
| Chunk fails after 5 retries | Propagate — existing `_upload_split` retry loop in `upload.py` handles it |
| `size == 0` | `ValueError` raised before any senders are borrowed |
| `asyncio.CancelledError` | `gather` cancelled, `finally` returns all borrowed senders |

---

## Non-Goals

- Parallel downloads
- Per-user dynamic connection limits persisted in DB
- Dead sender eviction and pool rebuilding mid-upload
- Telethon version upgrade (stays on `>=1.36,<2.0`)
