import asyncio
import uuid as _uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import AuthError, decode_access_token
from app.core.deps import get_current_user, get_db, oauth2_scheme
from app.db.models.event import Event
from app.db.models.folder import Folder
from app.db.models.user import User
from app.db.session import AsyncSessionLocal
from app.schemas.events import EventListOut, EventOut

router = APIRouter(prefix="/api/v1/events", tags=["events"])


async def _get_sse_user(
    header_token: str | None = Depends(oauth2_scheme),
    query_token: str | None = Query(default=None, alias="token"),
) -> User:
    from fastapi import HTTPException
    raw = header_token or query_token
    if raw is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_access_token(raw)
    except AuthError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    telegram_id = int(payload["sub"])
    async with AsyncSessionLocal() as session:
        user = await session.get(User, telegram_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/stream")
async def stream_events(
    current_user: User = Depends(_get_sse_user),
) -> StreamingResponse:
    from app.telegram import event_broadcaster

    async def generator() -> AsyncGenerator[str, None]:
        yield "data: connected\n\n"
        # Subscribe directly so we can use asyncio.wait_for for heartbeats.
        q: asyncio.Queue[None] = asyncio.Queue(maxsize=32)
        event_broadcaster._listeners.setdefault(current_user.telegram_id, set()).add(q)
        try:
            while True:
                try:
                    await asyncio.wait_for(q.get(), timeout=20.0)
                    yield "data: update\n\n"
                except asyncio.TimeoutError:
                    # SSE comment keeps QUIC/proxy alive when no events flow.
                    yield ": ping\n\n"
        finally:
            listeners = event_broadcaster._listeners.get(current_user.telegram_id, set())
            listeners.discard(q)
            if not listeners:
                event_broadcaster._listeners.pop(current_user.telegram_id, None)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/", response_model=EventListOut)
async def list_events(
    page: int = 1,
    page_size: int = 50,
    action: str | None = None,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EventListOut:
    filters = [Event.actor_telegram_id == current_user.telegram_id]
    if action is not None:
        filters.append(Event.action == action)

    count_q = await session.execute(
        select(func.count()).select_from(Event).where(*filters)
    )
    total = count_q.scalar_one()

    rows_q = await session.execute(
        select(Event)
        .where(*filters)
        .order_by(Event.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    events = rows_q.scalars().all()

    # Resolve target_name from metadata; fall back to DB lookup for folder
    # events that predate name being stored in metadata.
    folder_ids_needed: set[_uuid.UUID] = set()
    validated: list[EventOut] = []
    for ev in events:
        out = EventOut.model_validate(ev)
        if out.metadata:
            out.target_name = (
                out.metadata.get("name")
                or out.metadata.get("filename")
                or out.metadata.get("original_name")
            )
        if not out.target_name and ev.target_type == "folder" and ev.target_id:
            try:
                folder_ids_needed.add(_uuid.UUID(ev.target_id))
            except ValueError:
                pass
        validated.append(out)

    # Bulk-fetch missing folder names (old events without name in metadata)
    folder_names: dict[str, str] = {}
    if folder_ids_needed:
        res = await session.execute(
            select(Folder.id, Folder.name).where(Folder.id.in_(folder_ids_needed))
        )
        folder_names = {str(r.id): r.name for r in res.all()}

    for out in validated:
        if not out.target_name and out.target_type == "folder" and out.target_id:
            out.target_name = folder_names.get(out.target_id)

    return EventListOut(items=validated, total=total, page=page, page_size=page_size)
