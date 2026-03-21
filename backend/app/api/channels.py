import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, get_client_pool
from app.db.models.user import User
from app.schemas.channels import ChannelIn, ChannelOut, ChannelUpdate, ChannelCreateIn
from app.schemas.pagination import Paginated
from app.services import channels as svc
from app.services.channel_membership import enroll_all_accounts_in_channel
from app.telegram.client_pool import ClientPool

router = APIRouter(prefix="/api/v1/channels", tags=["channels"])


@router.post("/", response_model=ChannelOut, status_code=201)
async def create_channel(
    data: ChannelIn,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    pool: ClientPool = Depends(get_client_pool),
):
    channel = await svc.create_channel(session, current_user.telegram_id, data)
    await enroll_all_accounts_in_channel(pool, channel, session, current_user.telegram_id)
    return channel


@router.post("/telegram", response_model=ChannelOut, status_code=201)
async def create_telegram_channel(
    data: ChannelCreateIn,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    pool: ClientPool = Depends(get_client_pool),
):
    from fastapi import HTTPException
    from telethon.tl.functions.channels import CreateChannelRequest

    client = pool.get_client(data.telegram_account_id)
    if client is None:
        raise HTTPException(status_code=503, detail="Telegram account not connected")

    try:
        result = await client(CreateChannelRequest(
            title=data.title,
            about=data.about or "",
            megagroup=False,
        ))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "TELEGRAM_ERROR", "message": str(exc), "detail": None},
        ) from exc

    channel_id = None
    if getattr(result, "chats", None):
        for chat in result.chats:
            if getattr(chat, "title", None) == data.title:
                channel_id = -(1_000_000_000_000 + chat.id)
                break
        if not channel_id:
            channel_id = -(1_000_000_000_000 + result.chats[0].id)

    if not channel_id:
        raise HTTPException(status_code=500, detail="Failed to parse created channel from Telegram")

    db_data = ChannelIn(
        telegram_account_id=data.telegram_account_id,
        channel_id=channel_id,
        label=data.title,
    )
    channel = await svc.create_channel(session, current_user.telegram_id, db_data)
    await enroll_all_accounts_in_channel(pool, channel, session, current_user.telegram_id)
    return channel



@router.get("/", response_model=Paginated[ChannelOut])
async def list_channels(
    page: int = 1,
    page_size: int = 50,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    channels, total = await svc.list_channels(
        session, current_user.telegram_id, page=page, page_size=page_size
    )
    return Paginated(items=channels, total=total, page=page, page_size=page_size)


@router.get("/{channel_id}", response_model=ChannelOut)
async def get_channel(
    channel_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await svc.get_channel(session, current_user.telegram_id, channel_id)


@router.patch("/{channel_id}", response_model=ChannelOut)
async def update_channel(
    channel_id: uuid.UUID,
    data: ChannelUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await svc.update_channel(session, current_user.telegram_id, channel_id, data)


@router.delete("/{channel_id}", status_code=204)
async def delete_channel(
    channel_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await svc.delete_channel(session, current_user.telegram_id, channel_id)
    return Response(status_code=204)


@router.post("/{channel_id}/default", response_model=ChannelOut)
async def set_global_default(
    channel_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await svc.set_global_default(session, current_user.telegram_id, channel_id)


@router.delete("/{channel_id}/default", response_model=ChannelOut)
async def unset_global_default(
    channel_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await svc.unset_global_default(session, current_user.telegram_id, channel_id)
