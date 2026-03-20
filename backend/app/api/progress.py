import json
from dataclasses import asdict
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import AuthError, decode_access_token
from app.core.deps import get_db, oauth2_scheme
from app.db.models.user import User
from app.telegram import operation_registry

router = APIRouter(prefix="/api/v1/progress")


async def _get_sse_user(
    header_token: str | None = Depends(oauth2_scheme),
    query_token: str | None = Query(default=None, alias="token"),
    session: AsyncSession = Depends(get_db),
) -> User:
    """Authenticate via Authorization header or ?token= query param (needed for EventSource)."""
    raw = header_token or query_token
    if raw is None:
        raise HTTPException(status_code=401, detail="Not authenticated",
                            headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_access_token(raw)
    except AuthError:
        raise HTTPException(status_code=401, detail="Invalid or expired token",
                            headers={"WWW-Authenticate": "Bearer"})
    telegram_id = int(payload["sub"])
    user = await session.get(User, telegram_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found",
                            headers={"WWW-Authenticate": "Bearer"})
    return user


@router.get("/{operation_id}")
async def stream_progress(
    operation_id: str,
    current_user: User = Depends(_get_sse_user),
) -> StreamingResponse:
    if not operation_registry.has_operation(operation_id):
        raise HTTPException(status_code=404, detail="Operation not found")

    async def event_generator() -> AsyncGenerator[str, None]:
        async for event in operation_registry.stream(operation_id):
            if event.status == "ping":
                # SSE comment — keeps QUIC/proxy connections alive without
                # triggering onmessage in the browser.
                yield ": ping\n\n"
            else:
                yield f"data: {json.dumps(asdict(event))}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
