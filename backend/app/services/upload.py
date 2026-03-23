from __future__ import annotations

import asyncio
import io
import logging
import math
import os
import uuid
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.channel import Channel
from app.db.models.file import FILE_STATUS_COMPLETE, FILE_STATUS_FAILED, FILE_STATUS_PENDING, File
from app.db.models.folder import Folder
from app.db.models.split import Split
from app.db.session import AsyncSessionLocal
from app.services.events import log_event
from app.services.progress import OperationRegistry
from app.telegram.client_pool import ClientPool
from app.telegram.operations import UploadedSplit, delete_message, upload_document

logger = logging.getLogger(__name__)

_SPLIT_SIZE = 2_097_152_000


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

    def close(self) -> None:
        self._f.close()
        super().close()


async def check_duplicate(
    session: AsyncSession, owner_id: int, file_hash: str
) -> File | None:
    return await session.scalar(
        select(File).where(
            File.file_hash == file_hash,
            File.uploaded_by == owner_id,
            File.status == FILE_STATUS_COMPLETE,
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
    for _, c in client_snapshot:
        if not c.is_connected():
            logger.info("Telegram client disconnected — reconnecting before upload %s", operation_id)
            await c.connect()

    # Track bytes sent per split independently so the aggregated progress
    # is always the sum across all splits, not the last split to report.
    _split_bytes_sent: list[int] = [0] * num_splits

    async def _upload_split(split_index: int) -> UploadedSplitResult:
        account_id, client = client_snapshot[(account_offset + split_index) % len(client_snapshot)]
        offset = split_index * _SPLIT_SIZE
        split_size = min(_SPLIT_SIZE, total_size - offset)
        split_name = f"{filename}.part{split_index}" if multi else filename

        async def _on_progress(sent: int, _total: int) -> None:
            _split_bytes_sent[split_index] = sent
            total_sent = sum(_split_bytes_sent)
            await registry.emit_progress(
                operation_id,
                total_sent,
                total_size,
                message=f"Uploading to Telegram… part {split_index + 1} of {num_splits}",
            )
            # Forcefully yield control to the event loop. Telethon's upload/encryption
            # tight loop can starve the event loop, causing Uvicorn to hang on other requests.
            await asyncio.sleep(0.01)

        # Allow at least 30 min or 50 KB/s, whichever is longer.
        # Prevents indefinite hangs when a Telegram session silently expires.
        upload_timeout = max(1800, split_size // 51200)

        reader = _SplitReader(tmp_path, offset, split_size, split_name)
        try:
            result = await asyncio.wait_for(
                upload_document(
                    client,
                    telegram_channel_id,
                    reader,
                    filename=split_name,
                    size=split_size,
                    progress_callback=_on_progress,
                ),
                timeout=upload_timeout,
            )
        except asyncio.TimeoutError:
            raise RuntimeError(
                f"Telegram upload timed out after {upload_timeout}s "
                f"(split {split_index}, {split_size} bytes)"
            )
        finally:
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
            # ── 3b. Failure: rollback Telegram messages, mark file failed ─────
            rollback_list = [
                (r.client, r.channel_telegram_id, r.uploaded.message_id)
                for r in successes
            ]
            await rollback_splits(rollback_list)
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
