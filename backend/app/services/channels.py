import uuid

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.db.models.channel import Channel
from app.db.models.folder import Folder
from app.db.models.telegram_account import TelegramAccount
from app.schemas.channels import ChannelIn, ChannelUpdate
from app.services.events import log_event


async def create_channel(
    session: AsyncSession, owner_id: int, data: ChannelIn
) -> Channel:
    account = await session.scalar(
        select(TelegramAccount).where(
            TelegramAccount.id == data.telegram_account_id,
            TelegramAccount.owner_telegram_id == owner_id,
        )
    )
    if account is None:
        raise HTTPException(status_code=400, detail="Telegram account not found")

    channel = Channel(
        added_by=owner_id,
        telegram_account_id=data.telegram_account_id,
        channel_id=data.channel_id,
        channel_username=data.channel_username,
        label=data.label,
    )
    session.add(channel)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Channel already exists")
    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="channel.create",
        target_type="channel",
        target_id=str(channel.id),
    )
    await session.commit()
    await session.refresh(channel)
    return channel


async def list_channels(
    session: AsyncSession, owner_id: int, page: int = 1, page_size: int = 50
) -> tuple[list[Channel], int]:
    base_query = select(Channel).where(Channel.added_by == owner_id)

    # Count total
    from sqlalchemy import func

    total = await session.scalar(select(func.count()).select_from(base_query.subquery())) or 0

    # Paginate and fetch
    result = await session.scalars(
        base_query.order_by(Channel.label.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(result.all()), total


async def get_channel(
    session: AsyncSession, owner_id: int, channel_id: uuid.UUID
) -> Channel:
    channel = await session.scalar(
        select(Channel).where(
            Channel.id == channel_id,
            Channel.added_by == owner_id,
        )
    )
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


async def update_channel(
    session: AsyncSession, owner_id: int, channel_id: uuid.UUID, data: ChannelUpdate
) -> Channel:
    channel = await get_channel(session, owner_id, channel_id)
    if data.channel_username is not None:
        channel.channel_username = data.channel_username
    if data.label is not None:
        channel.label = data.label
    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="channel.update",
        target_type="channel",
        target_id=str(channel.id),
    )
    await session.commit()
    await session.refresh(channel)
    return channel


async def delete_channel(
    session: AsyncSession, owner_id: int, channel_id: uuid.UUID
) -> None:
    channel = await get_channel(session, owner_id, channel_id)

    affected = list(
        (
            await session.scalars(
                select(Folder).where(Folder.default_channel_id == channel_id)
            )
        ).all()
    )
    if affected:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Channel is set as default for one or more folders",
                "folder_ids": [str(f.id) for f in affected],
            },
        )

    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="channel.delete",
        target_type="channel",
        target_id=str(channel.id),
    )
    await session.delete(channel)
    await session.commit()


async def set_global_default(
    session: AsyncSession, owner_id: int, channel_id: uuid.UUID
) -> Channel:
    channel = await get_channel(session, owner_id, channel_id)

    await session.execute(
        update(Channel)
        .where(Channel.added_by == owner_id)
        .values(is_global_default=False)
    )
    await session.execute(
        update(Channel)
        .where(Channel.id == channel_id, Channel.added_by == owner_id)
        .values(is_global_default=True)
    )
    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="channel.set_global_default",
        target_type="channel",
        target_id=str(channel.id),
    )
    await session.commit()
    await session.refresh(channel)
    return channel

async def unset_global_default(
    session: AsyncSession, owner_id: int, channel_id: uuid.UUID
) -> Channel:
    channel = await get_channel(session, owner_id, channel_id)

    await session.execute(
        update(Channel)
        .where(Channel.id == channel_id, Channel.added_by == owner_id)
        .values(is_global_default=False)
    )
    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="channel.unset_global_default",
        target_type="channel",
        target_id=str(channel.id),
    )
    await session.commit()
    await session.refresh(channel)
    return channel
