import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from telethon.tl.types import Channel as TLChannel

from app.core.deps import get_client_pool, get_current_user, get_db
from app.db.models.telegram_account import TelegramAccount
from app.db.models.user import User
from app.schemas.dialogs import DialogOut
from app.schemas.pagination import Paginated
from app.telegram.client_pool import ClientPool

router = APIRouter(prefix="/api/v1/dialogs", tags=["dialogs"])


@router.get("/{account_id}", response_model=Paginated[DialogOut])
async def list_dialogs(
    account_id: uuid.UUID,
    admin: bool = Query(False, description="Only return chats where the account is an admin"),
    page: int = 1,
    page_size: int = 50,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    pool: ClientPool = Depends(get_client_pool),
):
    account = await session.scalar(
        select(TelegramAccount).where(
            TelegramAccount.id == account_id,
            TelegramAccount.owner_telegram_id == current_user.telegram_id,
            TelegramAccount.is_active.is_(True),
        )
    )
    if account is None:
        raise HTTPException(status_code=404, detail="Telegram account not found")

    client = pool.get_client(account_id)
    if client is None:
        raise HTTPException(status_code=503, detail="Telegram account not connected")

    # Collect all channel entities first (iter_dialogs is already one batched call)
    channels = []
    async for dialog in client.iter_dialogs():
        entity = dialog.entity
        if not isinstance(entity, TLChannel):
            continue
        is_creator = getattr(entity, "creator", False) or False
        channel_id = -(1_000_000_000_000 + entity.id)
        chat_type = "channel" if entity.broadcast else "supergroup"
        channels.append((entity, channel_id, chat_type, is_creator))

    # Filter and create models
    all_dialogs = [
        DialogOut(
            channel_id=channel_id,
            title=entity.title,
            username=getattr(entity, "username", None),
            type=chat_type,
            is_creator=is_creator,
        )
        for entity, channel_id, chat_type, is_creator in channels
        if not admin or is_creator or entity.admin_rights is not None
    ]

    # Manual pagination
    total = len(all_dialogs)
    start = (page - 1) * page_size
    end = start + page_size
    items = all_dialogs[start:end]

    return Paginated(items=items, total=total, page=page, page_size=page_size)
