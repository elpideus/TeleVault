import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.db.models.user import User
from app.schemas.search import SearchOut
from app.services.search import search as search_service

router = APIRouter(prefix="/api/v1/search", tags=["search"])

_VALID_SORT = {"name", "created_at", "size"}
_VALID_ORDER = {"asc", "desc"}


@router.get("/", response_model=SearchOut)
async def search_endpoint(
    q: str = Query(..., min_length=1),
    type: str | None = Query(None),
    folder_slug: str | None = Query(None),
    channel_id: uuid.UUID | None = Query(None),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SearchOut:
    if sort not in _VALID_SORT:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid sort value '{sort}'. Must be one of: {sorted(_VALID_SORT)}",
        )
    if order not in _VALID_ORDER:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid order value '{order}'. Must be one of: {sorted(_VALID_ORDER)}",
        )
    if type is not None and type not in {"file", "folder"}:
        raise HTTPException(
            status_code=422,
            detail="Invalid type value. Must be 'file' or 'folder'.",
        )

    return await search_service(
        session=session,
        owner_id=current_user.telegram_id,
        query=q,
        type=type,
        folder_slug=folder_slug,
        channel_id=channel_id,
        sort=sort,
        order=order,
        page=page,
        page_size=page_size,
    )
