from __future__ import annotations

import asyncio
import logging
import uuid
from typing import AsyncGenerator

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.file import File
from app.db.models.split import Split
from app.services.progress import OperationRegistry
from app.telegram.client_pool import ClientPool
from app.telegram.operations import download_document, rederive_file_id

logger = logging.getLogger(__name__)


async def get_file_with_splits(
    session: AsyncSession, owner_id: int, file_id: uuid.UUID
) -> tuple[File, list[Split]]:
    file = await session.scalar(
        select(File).where(File.id == file_id, File.uploaded_by == owner_id)
    )
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")

    splits = list(
        await session.scalars(
            select(Split)
            .where(Split.file_id == file_id)
            .options(selectinload(Split.channel))
            .order_by(Split.index.asc())
        )
    )
    return file, splits


async def _maybe_update_file_id(
    client: object,
    split_id: uuid.UUID,
    channel_id: int,
    message_id: int,
    stored_file_id: str,
) -> None:
    try:
        new_file_id, new_unique_id = await rederive_file_id(client, channel_id, message_id)
        if new_file_id != stored_file_id:
            from app.db.session import AsyncSessionLocal

            async with AsyncSessionLocal() as session:
                split = await session.get(Split, split_id)
                if split is not None:
                    split.file_id_tg = new_file_id
                    split.file_unique_id_tg = new_unique_id
                    await session.commit()
    except Exception:
        logger.debug("Background file_id update failed for split %s", split_id)


def download_stream(
    pool: ClientPool,
    registry: OperationRegistry,
    owner_id: int,
    file: File,
    splits: list[Split],
) -> tuple[str, AsyncGenerator[bytes, None]]:
    operation_id = registry.create_operation(owner_id)

    async def _generate() -> AsyncGenerator[bytes, None]:
        client = pool.get_client_for_user(owner_id)
        try:
            for i, split in enumerate(splits):
                tg_channel_id = split.channel.channel_id
                async for chunk in download_document(client, tg_channel_id, split.message_id):
                    yield chunk
                asyncio.create_task(
                    _maybe_update_file_id(
                        client, split.id, tg_channel_id, split.message_id, split.file_id_tg
                    )
                )
                bytes_done = sum(s.size for s in splits[: i + 1])
                await registry.emit_progress(
                    operation_id, bytes_done, file.total_size,
                    message=f"Downloading… part {i + 1} of {len(splits)}",
                )
            await registry.emit_done(operation_id, message="Download complete")
        except Exception as exc:
            await registry.emit_error(operation_id, str(exc), message="Download failed")
            raise

    return operation_id, _generate()
