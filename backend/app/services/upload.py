from __future__ import annotations

import asyncio
import io
import logging
import math
import os
import time
import uuid
import random
from dataclasses import dataclass

from fastapi import HTTPException
from datetime import datetime, timedelta

from sqlalchemy import or_, and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.errors import (
    AuthKeyDuplicatedError,
    ChatAdminRequiredError,
    ChatWriteForbiddenError,
    ChannelPrivateError,
    FloodWaitError,
    UserBannedInChannelError,
)

from app.db.models.channel import Channel
from app.db.models.file import FILE_STATUS_COMPLETE, FILE_STATUS_FAILED, FILE_STATUS_PENDING, File
from app.db.models.folder import Folder
from app.db.models.split import Split
from app.db.session import AsyncSessionLocal
from app.services.events import log_event
from app.services.progress import OperationRegistry
from app.telegram.client_pool import ClientPool
from app.core.config import get_settings
from app.telegram.fast_upload import fast_upload_document
from app.telegram.operations import UploadedSplit, delete_message

logger = logging.getLogger(__name__)

_SPLIT_SIZE = 2_097_152_000
# Seconds with no upload progress before the current attempt is considered stalled.
_STALL_TIMEOUT = 120


@dataclass
class UploadedSplitResult:
    """Returned by each split coroutine on success. Carries client reference for rollback."""

    split_index: int
    split_size: int
    uploaded: object  # UploadedSplit or whatever upload_document returns
    account_id: object  # uuid.UUID
    client: object  # TelegramClient
    channel_telegram_id: int


class _SplitReader(io.RawIOBase):
    """A file-like view over a specific byte range of an on-disk file.

    Passed directly to Telethon's send_file so the split is never
    buffered in RAM — Telethon reads it in its own internal chunks.
    """

    def __init__(self, path: str, offset: int, size: int, name: str = "") -> None:
        super().__init__()
        self._f = open(path, "rb")  # noqa: WPS515
        self._base = offset
        self._size = size
        self.name = name
        self._pos = 0
        self._f.seek(offset)

    def read(self, n: int = -1) -> bytes:
        remaining = self._size - self._pos
        if remaining <= 0:
            return b""
        if n < 0 or n > remaining:
            n = remaining
        data = self._f.read(n)
        self._pos += len(data)
        return data

    def seek(self, pos: int, whence: int = 0) -> int:
        if whence == 0:
            new_pos = pos
        elif whence == 1:
            new_pos = self._pos + pos
        else:  # whence == 2
            new_pos = self._size + pos
        self._pos = max(0, min(new_pos, self._size))
        self._f.seek(self._base + self._pos)
        return self._pos

    def tell(self) -> int:
        return self._pos

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def close(self) -> None:
        self._f.close()
        super().close()


async def check_duplicate(
    session: AsyncSession, owner_id: int, file_hash: str
) -> File | None:
    """Return an existing file with the same hash, if any.

    Checks both COMPLETE files (true duplicates) and recent PENDING files
    (currently being uploaded).  Without the PENDING check, two concurrent
    uploads of the same file both pass the duplicate gate and create two
    separate Telegram messages — the root cause of "uploaded twice" reports.

    PENDING files older than 6 hours are ignored so that stale records from
    server crashes don't permanently block re-uploads.
    """
    return await session.scalar(
        select(File).where(
            File.file_hash == file_hash,
            File.uploaded_by == owner_id,
            or_(
                File.status == FILE_STATUS_COMPLETE,
                and_(
                    File.status == FILE_STATUS_PENDING,
                    File.created_at >= datetime.utcnow() - timedelta(hours=6),
                ),
            ),
        )
    )




async def rollback_splits(
    splits: list[tuple[object, int, int]],  # [(client, channel_telegram_id, message_id)]
) -> None:
    """Delete uploaded Telegram messages using the correct client per split."""
    for client, channel_id, msg_id in splits:
        try:
            await delete_message(client, channel_id, msg_id)
        except Exception:
            logger.warning(
                "Failed to delete message %d from channel %d during rollback",
                msg_id,
                channel_id,
            )


async def resolve_channel(
    session: AsyncSession,
    owner_id: int,
    channel_id_param: uuid.UUID | None,
    folder: Folder | None,
) -> Channel:
    target_id = channel_id_param or (folder.default_channel_id if folder else None)

    if target_id is not None:
        channel = await session.scalar(
            select(Channel).where(
                Channel.id == target_id,
                Channel.added_by == owner_id,
            )
        )
        if channel is not None:
            return channel

    # Fall back to user's global default channel
    channel = await session.scalar(
        select(Channel).where(
            Channel.added_by == owner_id,
            Channel.is_global_default.is_(True),
        )
    )
    if channel is not None:
        return channel

    raise HTTPException(
        status_code=422,
        detail={
            "error": "NO_CHANNEL_CONFIGURED",
            "message": "No channel configured for upload.",
            "detail": None,
        },
    )


async def prepare_upload(
    session: AsyncSession,
    registry: OperationRegistry,
    owner_id: int,
    folder_id: uuid.UUID | None,
    channel_id: uuid.UUID,
    filename: str,
    mime_type: str | None,
    total_size: int,
    file_hash: str,
) -> tuple[str, uuid.UUID, int, Channel]:
    """Validate the upload request and create an operation.

    Returns (operation_id, pre-generated file_id, split_count, channel).
    Raises HTTPException on duplicate or missing channel.
    Does NOT start the Telegram upload — call execute_upload as a background task.
    """
    existing = await check_duplicate(session, owner_id, file_hash)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "DUPLICATE_FILE",
                "message": "File already exists.",
                "detail": {"file_id": str(existing.id)},
            },
        )

    channel = await session.get(Channel, channel_id)
    if channel is None:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "NO_CHANNEL_CONFIGURED",
                "message": "No channel configured for upload.",
                "detail": None,
            },
        )
    operation_id = registry.create_operation(owner_id)
    file_id = uuid.uuid4()
    num_splits = max(1, math.ceil(total_size / _SPLIT_SIZE))
    return operation_id, file_id, num_splits, channel


async def execute_upload(
    registry: OperationRegistry,
    pool: ClientPool,
    operation_id: str,
    file_id: uuid.UUID,
    owner_id: int,
    folder_id: uuid.UUID | None,
    channel: Channel,
    filename: str,
    mime_type: str | None,
    total_size: int,
    file_hash: str,
    tmp_path: str,
    account_offset: int = 0,   # which account handles split 0
) -> None:
    """Upload splits to Telegram, write DB records, clean up temp file.

    Runs as an asyncio background task so the HTTP response (with operation_id)
    is returned to the client before any upload progress events are emitted.

    Lifecycle:
      1. Write File(status=pending) immediately — crash-visible anchor in DB.
      2. Upload all splits to Telegram in parallel using asyncio.gather().
      3a. Success → update status=complete, write Split records atomically.
      3b. Failure → rollback Telegram messages, update status=failed.
    """
    # Yield control back to the event loop so the HTTP response can be sent first.
    # Without this, Telethon's heavy encryption + disk IO might starve the loop,
    # causing Cloudflare to timeout the original HTTP request with a 524.
    await asyncio.sleep(1.0)

    if channel is None:
        await registry.emit_error(operation_id, "Channel not found", message="No channel configured for upload")
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        return

    telegram_channel_id = channel.channel_id
    channel_id = channel.id
    num_splits = max(1, math.ceil(total_size / _SPLIT_SIZE))
    multi = num_splits > 1

    # ── 1. Write pending record so a server crash leaves a visible trace ──────
    async with AsyncSessionLocal() as session:
        file_record = File(
            id=file_id,
            uploaded_by=owner_id,
            folder_id=folder_id,
            original_name=filename,
            mime_type=mime_type,
            total_size=total_size,
            file_hash=file_hash,
            split_count=num_splits,
            status=FILE_STATUS_PENDING,
        )
        session.add(file_record)
        await session.commit()

    # ── 2. Upload splits to Telegram in parallel ──────────────────────────────
    client_snapshot = pool.get_all_clients_for_user(owner_id)
    if not client_snapshot:
        raise RuntimeError("No active Telegram client for user")

    # Ensure all clients are connected before launching parallel uploads
    for account_id, c in client_snapshot:
        if not c.is_connected():
            logger.info("Telegram client %s disconnected — reconnecting before upload %s", account_id, operation_id)
            lock = pool.get_lock(account_id)
            async with lock:
                if not c.is_connected():
                    await c.connect()

    # Track bytes sent per split independently so the aggregated progress
    # is always the sum across all splits, not the last split to report.
    _split_bytes_sent: list[int] = [0] * num_splits

    # ── Cancelled before we even start? ──────────────────────────────────────
    if registry.is_cancelled(operation_id):
        async with AsyncSessionLocal() as session:
            record = await session.get(File, file_id)
            if record is not None:
                await session.delete(record)
                await session.commit()
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        return

    async def _upload_split(split_index: int) -> UploadedSplitResult:
        account_id, client = client_snapshot[(account_offset + split_index) % len(client_snapshot)]
        offset = split_index * _SPLIT_SIZE
        split_size = min(_SPLIT_SIZE, total_size - offset)
        split_name = f"{filename}.part{split_index}" if multi else filename

        # Throttle SSE emissions to once per second; track last progress time for stall detection.
        _last_emit_at: list[float] = [0.0]
        _last_progress_at: list[float] = [time.monotonic()]
        # Set to True once all bytes are sent so the stall watchdog doesn't
        # fire during Telegram's server-side confirmation window (which can
        # exceed _STALL_TIMEOUT for large files, causing spurious retries and
        # potential duplicate Telegram messages).
        _fully_sent: list[bool] = [False]

        async def _on_progress(sent: int, _total: int) -> None:
            now = time.monotonic()
            # High-water mark: Telethon may internally restart the upload on
            # reconnect, sending `sent` back to 0.  We keep the peak value so
            # the user-visible progress bar never jumps backwards within one
            # attempt.  Our explicit retry loop resets the counter to 0 before
            # creating a new upload task, so cross-attempt resets still work.
            if sent >= _split_bytes_sent[split_index]:
                _split_bytes_sent[split_index] = sent
            _last_progress_at[0] = now
            if sent >= split_size:
                _fully_sent[0] = True
            if now - _last_emit_at[0] >= 1.0:
                _last_emit_at[0] = now
                total_sent = sum(_split_bytes_sent)
                await registry.emit_progress(
                    operation_id,
                    total_sent,
                    total_size,
                    message=f"Uploading to Telegram… part {split_index + 1} of {num_splits}",
                )
            # Yield to the event loop so Uvicorn can serve other requests.
            await asyncio.sleep(0)

        async def _stall_watchdog() -> None:
            """Raise TimeoutError if no upload progress for _STALL_TIMEOUT seconds.

            Stall detection is skipped once all bytes have been sent: at that
            point Telegram is doing server-side processing/confirmation which
            can take several minutes for large files.  Cancelling during that
            window would cause a spurious retry that re-uploads all bytes and
            may create a duplicate message in the channel.
            """
            while True:
                await asyncio.sleep(30)
                if _fully_sent[0]:
                    # All bytes sent — Telegram is processing; don't stall-cancel.
                    continue
                if time.monotonic() - _last_progress_at[0] >= _STALL_TIMEOUT:
                    raise asyncio.TimeoutError(
                        f"Upload stalled: no progress for {_STALL_TIMEOUT}s on split {split_index}"
                    )

        max_retries = 3
        for attempt in range(max_retries):
            reader = _SplitReader(tmp_path, offset, split_size, split_name)
            _last_progress_at[0] = time.monotonic()  # reset stall timer each attempt
            _fully_sent[0] = False                    # reset per-attempt sent flag
            _split_bytes_sent[split_index] = 0        # reset so progress doesn't linger at old value
            upload_task: asyncio.Task | None = None
            watchdog_task: asyncio.Task | None = None
            try:
                # Cancelled while waiting to start this split?
                if registry.is_cancelled(operation_id):
                    raise asyncio.CancelledError

                # Ensure connected (atomic check-and-connect)
                if not client.is_connected():
                    async with pool.get_lock(account_id):
                        if not client.is_connected():
                            await client.connect()

                upload_task = asyncio.create_task(
                    fast_upload_document(
                        client,
                        telegram_channel_id,
                        reader,
                        filename=split_name,
                        size=split_size,
                        connections=get_settings().parallel_upload_connections,
                        progress_callback=_on_progress,
                    )
                )
                watchdog_task = asyncio.create_task(_stall_watchdog())

                done, _ = await asyncio.wait(
                    {upload_task, watchdog_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )

                watchdog_task.cancel()
                if upload_task not in done:
                    # Stall watchdog fired first — cancel the upload and retry.
                    upload_task.cancel()
                    raise asyncio.TimeoutError(
                        f"Upload stalled: no progress for {_STALL_TIMEOUT}s on split {split_index}"
                    )

                result = upload_task.result()  # re-raises any upload exception
                break  # Success!

            except AuthKeyDuplicatedError:
                logger.warning(
                    "Session conflict (AuthKeyDuplicatedError) for account %s on attempt %d. "
                    "Disconnecting and retrying in 5s...",
                    account_id, attempt + 1
                )
                await client.disconnect()
                await asyncio.sleep(5)
                if attempt == max_retries - 1:
                    raise

            except (ChatAdminRequiredError, ChatWriteForbiddenError,
                    ChannelPrivateError, UserBannedInChannelError) as exc:
                # Permanent permission error — retrying will never succeed.
                # Raise immediately with a clear, actionable message.
                logger.error(
                    "Permanent Telegram permission error for account %s on channel %d: %s. "
                    "Ensure the account has 'Post Messages' admin rights in the channel.",
                    account_id, telegram_channel_id, type(exc).__name__,
                )
                raise RuntimeError(
                    f"Telegram account lacks permission to post in this channel "
                    f"({type(exc).__name__}). Check that the account has "
                    f"'Post Messages' admin rights."
                ) from exc

            except FloodWaitError as exc:
                wait_time = exc.seconds + 1
                logger.warning("FloodWait for account %s: waiting %ds", account_id, wait_time)
                await asyncio.sleep(wait_time)
                if attempt == max_retries - 1:
                    raise

            except asyncio.TimeoutError:
                logger.warning("Upload stalled (split %d, attempt %d)", split_index, attempt + 1)
                if attempt == max_retries - 1:
                    raise RuntimeError(
                        f"Upload stalled after {_STALL_TIMEOUT}s "
                        f"(split {split_index}, {split_size} bytes)"
                    )
                await asyncio.sleep(2 ** attempt + random.random())

            except Exception:
                logger.exception("Unexpected error during Telegram upload (split %d, attempt %d)", split_index, attempt + 1)
                if attempt == max_retries - 1:
                    raise
                await asyncio.sleep(2 ** attempt + random.random())

            finally:
                for t in [upload_task, watchdog_task]:
                    if t is not None and not t.done():
                        t.cancel()
                reader.close()

        return UploadedSplitResult(
            split_index=split_index,
            split_size=split_size,
            uploaded=result,
            account_id=account_id,
            client=client,
            channel_telegram_id=telegram_channel_id,
        )

    coroutines = [_upload_split(i) for i in range(num_splits)]
    try:
        results = await asyncio.gather(*coroutines, return_exceptions=True)
        # Separate successes from failures
        successes: list[UploadedSplitResult] = [r for r in results if isinstance(r, UploadedSplitResult)]
        errors = [r for r in results if isinstance(r, BaseException)]

        if errors:
            # ── 3b. Failure: rollback Telegram messages ──────────────────
            rollback_list = [
                (r.client, r.channel_telegram_id, r.uploaded.message_id)
                for r in successes
            ]
            await rollback_splits(rollback_list)

            # If this was a user cancellation, clean up the pending DB record
            # and return silently — the cancel endpoint already emitted the
            # cancelled SSE event.
            if registry.is_cancelled(operation_id):
                async with AsyncSessionLocal() as session:
                    record = await session.get(File, file_id)
                    if record is not None:
                        await session.delete(record)
                        await session.commit()
                return

            await registry.emit_error(operation_id, "Upload failed", message="Upload to Telegram failed")
            logger.error("execute_upload failed for operation %s: %s", operation_id, errors[0])
            async with AsyncSessionLocal() as session:
                record = await session.get(File, file_id)
                if record is not None:
                    record.status = FILE_STATUS_FAILED
                    await session.commit()
            return

        # ── 3a. Success: write splits + mark complete atomically ──────────────
        split_count = len(successes)
        async with AsyncSessionLocal() as session:
            try:
                record = await session.get(File, file_id)
                if record is None:
                    # Extremely unlikely (record deleted externally), nothing to do
                    await registry.emit_error(operation_id, "File record missing after upload", message="Internal error: file record not found")
                    return
                record.status = FILE_STATUS_COMPLETE
                record.file_unique_id = successes[0].uploaded.file_unique_id if successes else None
                record.split_count = split_count

                for r in successes:
                    session.add(Split(
                        file_id=file_id,
                        channel_id=channel_id,
                        telegram_account_id=r.account_id,   # uploading account (not channel owner)
                        message_id=r.uploaded.message_id,
                        file_id_tg=r.uploaded.file_id,
                        file_unique_id_tg=r.uploaded.file_unique_id,
                        index=r.split_index,
                        size=r.split_size,
                    ))

                await log_event(
                    session,
                    actor_telegram_id=owner_id,
                    action="file.upload",
                    target_type="file",
                    target_id=str(file_id),
                    metadata={"filename": filename, "name": filename, "split_count": split_count},
                )
                await session.commit()
            except Exception:
                await session.rollback()
                await registry.emit_error(operation_id, "Database write failed", message="Failed to save file record")
                logger.exception("execute_upload DB commit failed for operation %s", operation_id)
                return

    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    await registry.emit_done(operation_id, message="Upload complete")
