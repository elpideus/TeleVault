from __future__ import annotations

import logging
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select, text, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.file import FILE_STATUS_COMPLETE, File
from app.db.models.split import Split
from app.schemas.files import FileUpdate
from app.services.events import log_event
from app.services.folders import get_folder_by_slug
from app.telegram.client_pool import ClientPool
from app.telegram.operations import bulk_delete_messages

logger = logging.getLogger(__name__)


async def list_files(
    session: AsyncSession,
    owner_id: int,
    folder_id: uuid.UUID | None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[File], int]:
    if folder_id is None:
        condition = File.folder_id.is_(None)
    else:
        condition = File.folder_id == folder_id

    # Base query
    base_query = select(File).where(
        File.uploaded_by == owner_id, condition, File.status == FILE_STATUS_COMPLETE
    )

    # Count total
    total = await session.scalar(select(func.count()).select_from(base_query.subquery())) or 0

    # Paginate and fetch
    result = await session.scalars(
        base_query.order_by(File.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(result.all()), total


async def get_file(
    session: AsyncSession, owner_id: int, file_id: uuid.UUID
) -> File:
    file = await session.scalar(
        select(File).where(
            File.id == file_id,
            File.uploaded_by == owner_id,
            File.status == FILE_STATUS_COMPLETE,
        )
    )
    if file is None:
        raise HTTPException(status_code=404, detail="File not found")
    return file


async def _load_splits(session: AsyncSession, file_id: uuid.UUID) -> list[Split]:
    return list(
        await session.scalars(
            select(Split)
            .where(Split.file_id == file_id)
            .options(selectinload(Split.channel))
            .order_by(Split.index.asc())
        )
    )


async def delete_file(
    session: AsyncSession, pool: ClientPool, owner_id: int, file_id: uuid.UUID
) -> None:
    file = await get_file(session, owner_id, file_id)
    splits = await _load_splits(session, file_id)

    await session.delete(file)
    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="file.delete",
        target_type="file",
        target_id=str(file_id),
        metadata={"name": file.name or file.original_name, "original_name": file.original_name},
    )
    await session.commit()

    # Best-effort Telegram cleanup after commit
    messages_by_channel: dict[int, list[int]] = {}
    for split in splits:
        ch = split.channel.channel_id
        messages_by_channel.setdefault(ch, []).append(split.message_id)
    client = pool.get_client_for_user(owner_id)
    try:
        await bulk_delete_messages(client, messages_by_channel)
    except Exception as exc:
        logger.warning("Telegram cleanup failed for file %s: %s", file_id, exc)


async def move_file(
    session: AsyncSession,
    owner_id: int,
    file_id: uuid.UUID,
    target_folder_slug: str | None,
) -> File:
    file = await get_file(session, owner_id, file_id)
    if target_folder_slug is not None:
        target_folder = await get_folder_by_slug(session, owner_id, target_folder_slug)
        target_folder_id = target_folder.id
        file.folder_id = target_folder_id
    else:
        target_folder_id = None
        file.folder_id = None
    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="file.move",
        target_type="file",
        target_id=str(file_id),
        metadata={"target_folder_id": str(target_folder_id), "target_folder_slug": target_folder_slug, "name": file.name or file.original_name},
    )
    await session.commit()
    await session.refresh(file)
    return file


async def copy_file(
    session: AsyncSession,
    owner_id: int,
    file_id: uuid.UUID,
    target_folder_slug: str | None,
) -> File:
    source = await get_file(session, owner_id, file_id)
    if target_folder_slug is not None:
        target_folder = await get_folder_by_slug(session, owner_id, target_folder_slug)
        target_folder_id = target_folder.id
    else:
        target_folder_id = None
    splits = await _load_splits(session, file_id)

    new_file = File(
        uploaded_by=owner_id,
        folder_id=target_folder_id,
        original_name=source.original_name,
        name=source.name,
        mime_type=source.mime_type,
        total_size=source.total_size,
        file_hash=source.file_hash,
        file_unique_id=source.file_unique_id,
        split_count=source.split_count,
        status=FILE_STATUS_COMPLETE,
    )
    session.add(new_file)
    await session.flush()

    for split in splits:
        new_split = Split(
            file_id=new_file.id,
            channel_id=split.channel_id,
            telegram_account_id=split.telegram_account_id,
            message_id=split.message_id,
            file_id_tg=split.file_id_tg,
            file_unique_id_tg=split.file_unique_id_tg,
            index=split.index,
            size=split.size,
        )
        session.add(new_split)

    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="file.copy",
        target_type="file",
        target_id=str(new_file.id),
        metadata={"source_file_id": str(file_id), "target_folder_id": str(target_folder_id), "name": new_file.name or new_file.original_name},
    )
    await session.commit()
    await session.refresh(new_file)
    return new_file


async def update_file(
    session: AsyncSession,
    owner_id: int,
    file_id: uuid.UUID,
    data: FileUpdate,
) -> File:
    file = await get_file(session, owner_id, file_id)

    if data.name is not None:
        stripped = data.name.strip()
        file.name = stripped if stripped else None

    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="file.rename",
        target_type="file",
        target_id=str(file_id),
        metadata={"name": file.name},
    )
    await session.commit()
    await session.refresh(file)
    return file


async def _collect_safe_tg_deletes(
    session: AsyncSession,
    file_ids: list[uuid.UUID],
    owner_id: int,
) -> dict[int, list[int]]:
    """
    Return a dict of {channel_id: [message_ids]} for splits that are safe to delete from Telegram.
    A split is safe to delete only if no other file (outside the batch) references the same
    (channel_id, message_id) pair — this prevents orphaning messages shared by copied files.
    """
    if not file_ids:
        return {}

    # Load splits for all files in the batch
    batch_splits = list(
        await session.scalars(
            select(Split)
            .where(Split.file_id.in_(file_ids))
            .options(selectinload(Split.channel))
        )
    )

    if not batch_splits:
        return {}

    # Collect (channel_id, message_id) pairs from batch
    batch_pairs = [(s.channel_id, s.message_id) for s in batch_splits]

    # Find any splits outside the batch that share these (channel_id, message_id) pairs
    shared = await session.scalars(
        select(Split).where(
            tuple_(Split.channel_id, Split.message_id).in_(batch_pairs),
            Split.file_id.notin_(file_ids),
        )
    )
    shared_pairs = {(s.channel_id, s.message_id) for s in shared}

    # Build the safe-to-delete dict, excluding shared pairs
    result: dict[int, list[int]] = {}
    for split in batch_splits:
        if (split.channel_id, split.message_id) not in shared_pairs:
            ch = split.channel.channel_id
            result.setdefault(ch, []).append(split.message_id)
    return result


async def bulk_fetch_files(
    session: AsyncSession,
    owner_id: int,
    file_ids: list[uuid.UUID],
) -> list[File]:
    if not file_ids:
        return []
    result = await session.scalars(
        select(File).where(
            File.id.in_(file_ids),
            File.uploaded_by == owner_id,
            File.status == FILE_STATUS_COMPLETE,
        )
    )
    return list(result.all())


async def bulk_delete_files(
    session: AsyncSession,
    pool: ClientPool,
    owner_id: int,
    file_ids: list[uuid.UUID],
) -> tuple[list[uuid.UUID], list[tuple[uuid.UUID, str]]]:
    """
    Returns (succeeded_ids, [(failed_id, error_message)]).
    Best-effort: deletes as many as possible from DB, then cleans up Telegram.
    """
    if not file_ids:
        return [], []

    # Collect safe Telegram deletes before DB deletion (splits gone after)
    tg_deletes = await _collect_safe_tg_deletes(session, file_ids, owner_id)

    # Verify ownership — only delete files owned by this user
    owned = list(
        await session.scalars(
            select(File).where(
                File.id.in_(file_ids),
                File.uploaded_by == owner_id,
                File.status == FILE_STATUS_COMPLETE,
            )
        )
    )
    owned_ids = {f.id for f in owned}
    not_found = [fid for fid in file_ids if fid not in owned_ids]

    # Log and delete all owned files
    for f in owned:
        await log_event(
            session,
            actor_telegram_id=owner_id,
            action="file.delete",
            target_type="file",
            target_id=str(f.id),
            metadata={"name": f.name or f.original_name, "original_name": f.original_name},
        )
        await session.delete(f)

    await session.commit()

    # Best-effort Telegram cleanup
    if tg_deletes:
        client = pool.get_client_for_user(owner_id)
        try:
            await bulk_delete_messages(client, tg_deletes)
        except Exception as exc:
            logger.warning("Telegram bulk cleanup failed: %s", exc)

    succeeded = list(owned_ids)
    failed = [(fid, "Not found") for fid in not_found]
    return succeeded, failed


async def bulk_move_files(
    session: AsyncSession,
    owner_id: int,
    file_ids: list[uuid.UUID],
    target_folder_slug: str | None,
) -> tuple[list[File], list[tuple[uuid.UUID, str]]]:
    """Returns (succeeded_files, [(failed_id, error)])."""
    if not file_ids:
        return [], []

    target_folder_id: uuid.UUID | None = None
    if target_folder_slug is not None:
        target_folder = await get_folder_by_slug(session, owner_id, target_folder_slug)
        target_folder_id = target_folder.id

    owned = list(
        await session.scalars(
            select(File).where(
                File.id.in_(file_ids),
                File.uploaded_by == owner_id,
                File.status == FILE_STATUS_COMPLETE,
            )
        )
    )
    owned_ids = {f.id for f in owned}
    not_found = [fid for fid in file_ids if fid not in owned_ids]

    for f in owned:
        f.folder_id = target_folder_id

    await session.commit()
    for f in owned:
        await session.refresh(f)

    failed = [(fid, "Not found") for fid in not_found]
    return owned, failed


async def bulk_copy_files(
    session: AsyncSession,
    owner_id: int,
    file_ids: list[uuid.UUID],
    target_folder_slug: str | None,
) -> tuple[list[File], list[tuple[uuid.UUID, str]]]:
    """Returns (succeeded_new_files, [(failed_id, error)])."""
    if not file_ids:
        return [], []

    target_folder_id: uuid.UUID | None = None
    if target_folder_slug is not None:
        target_folder = await get_folder_by_slug(session, owner_id, target_folder_slug)
        target_folder_id = target_folder.id

    sources = list(
        await session.scalars(
            select(File).where(
                File.id.in_(file_ids),
                File.uploaded_by == owner_id,
                File.status == FILE_STATUS_COMPLETE,
            )
        )
    )
    source_ids = {f.id for f in sources}
    not_found = [fid for fid in file_ids if fid not in source_ids]

    # Load all splits at once
    all_splits = list(
        await session.scalars(
            select(Split)
            .where(Split.file_id.in_(source_ids))
            .order_by(Split.index.asc())
        )
    )
    splits_by_file: dict[uuid.UUID, list[Split]] = {}
    for s in all_splits:
        splits_by_file.setdefault(s.file_id, []).append(s)

    new_files: list[File] = []
    for source in sources:
        new_file = File(
            uploaded_by=owner_id,
            folder_id=target_folder_id,
            original_name=source.original_name,
            name=source.name,
            mime_type=source.mime_type,
            total_size=source.total_size,
            file_hash=source.file_hash,
            file_unique_id=source.file_unique_id,
            split_count=source.split_count,
            status=FILE_STATUS_COMPLETE,
        )
        session.add(new_file)
        await session.flush()

        for split in splits_by_file.get(source.id, []):
            session.add(Split(
                file_id=new_file.id,
                channel_id=split.channel_id,
                telegram_account_id=split.telegram_account_id,
                message_id=split.message_id,
                file_id_tg=split.file_id_tg,
                file_unique_id_tg=split.file_unique_id_tg,
                index=split.index,
                size=split.size,
            ))
        new_files.append(new_file)

    await session.commit()
    for f in new_files:
        await session.refresh(f)

    failed = [(fid, "Not found") for fid in not_found]
    return new_files, failed


async def get_user_stats(session: AsyncSession, owner_id: int) -> tuple[int, int]:
    """Returns (total_size, file_count) for all completed files of a user."""
    # Use coalesce to ensure 0 is returned instead of None
    stmt = select(
        func.coalesce(func.sum(File.total_size), 0).label("total_size"),
        func.count(File.id).label("file_count"),
    ).where(
        File.uploaded_by == owner_id,
        File.status == FILE_STATUS_COMPLETE,
    )
    result = await session.execute(stmt)
    row = result.fetchone()
    total_size = row[0] if row else 0
    file_count = row[1] if row else 0
    return total_size, file_count
