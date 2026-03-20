"""Debug-only endpoints. Only mounted when settings.debug_ui is True."""
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import APIRouter, Depends

from app.db.models.channel import Channel
from app.db.models.event import Event
from app.db.models.file import File
from app.db.models.folder import Folder
from app.db.models.refresh_token import RefreshToken
from app.db.models.split import Split
from app.db.models.user import User
from app.db.session import get_db

router = APIRouter(prefix="/api/v1/debug", tags=["debug"])


@router.delete("/reset/files", summary="Delete all files and splits")
async def reset_files(session: AsyncSession = Depends(get_db)):
    await session.execute(delete(Split))
    await session.execute(delete(File))
    await session.commit()
    return {"deleted": "files"}


@router.delete("/reset/folders", summary="Delete all folders")
async def reset_folders(session: AsyncSession = Depends(get_db)):
    await session.execute(delete(Folder))
    await session.commit()
    return {"deleted": "folders"}


@router.delete("/reset/channels", summary="Delete all channels")
async def reset_channels(session: AsyncSession = Depends(get_db)):
    await session.execute(delete(Channel))
    await session.commit()
    return {"deleted": "channels"}


@router.delete("/reset/events", summary="Delete all events")
async def reset_events(session: AsyncSession = Depends(get_db)):
    await session.execute(delete(Event))
    await session.commit()
    return {"deleted": "events"}


@router.delete("/reset/users", summary="Delete all users and their tokens")
async def reset_users(session: AsyncSession = Depends(get_db)):
    await session.execute(delete(RefreshToken))
    await session.execute(delete(User))
    await session.commit()
    return {"deleted": "users"}


@router.delete("/reset/all", summary="Wipe all data (splits, files, folders, channels, events, users)")
async def reset_all(session: AsyncSession = Depends(get_db)):
    await session.execute(delete(Split))
    await session.execute(delete(File))
    await session.execute(delete(Folder))
    await session.execute(delete(Channel))
    await session.execute(delete(Event))
    await session.execute(delete(RefreshToken))
    await session.execute(delete(User))
    await session.commit()
    return {"deleted": "all"}
