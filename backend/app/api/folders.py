from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.deps import get_client_pool, get_current_user, get_db
from app.db.models.user import User
from app.core.config import Settings, get_settings
from app.schemas.files import BulkItemFailure
from app.schemas.folders import (
    BulkCopyFolderBody,
    BulkDeleteFolderBody,
    BulkDeleteFolderResult,
    BulkFolderResult,
    BulkMoveFolderBody,
    FolderFetchBody,
    FolderIn,
    FolderOut,
    FolderUpdate,
)
from app.schemas.pagination import Paginated
from app.services import folders as svc
from app.telegram.client_pool import ClientPool

router = APIRouter(prefix="/api/v1/folders", tags=["folders"])


# ── Fixed-path routes MUST be registered before /{slug:path} ────────────────

@router.get("/", response_model=Paginated[FolderOut])
async def list_root_folders(
    page: int = 1,
    page_size: int = 50,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folders, total = await svc.list_root_folders(
        session, current_user.telegram_id, page=page, page_size=page_size
    )
    return Paginated(items=folders, total=total, page=page, page_size=page_size)


@router.post("/", response_model=FolderOut, status_code=201)
async def create_folder(
    data: FolderIn,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await svc.create_folder(session, current_user.telegram_id, data, settings)


@router.post("/fetch", response_model=list[FolderOut])
async def fetch_folders(
    body: FolderFetchBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await svc.bulk_fetch_folders(session, current_user.telegram_id, body.slugs)


@router.delete("/", response_model=BulkDeleteFolderResult, status_code=200)
async def delete_folders(
    body: BulkDeleteFolderBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    pool: ClientPool = Depends(get_client_pool),
):
    succeeded_slugs, failed_pairs = await svc.bulk_delete_folders(
        session, pool, current_user.telegram_id, body.slugs
    )
    return BulkDeleteFolderResult(
        succeeded=succeeded_slugs,
        failed=[BulkItemFailure(id=slug, error=err) for slug, err in failed_pairs],
    )


@router.post("/move", response_model=BulkFolderResult)
async def move_folders(
    body: BulkMoveFolderBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    succeeded, failed_pairs = await svc.bulk_move_folders(
        session, current_user.telegram_id, body.slugs, body.target_parent_slug, settings
    )
    return BulkFolderResult(
        succeeded=succeeded,
        failed=[BulkItemFailure(id=slug, error=err) for slug, err in failed_pairs],
    )


@router.post("/copy", response_model=BulkFolderResult)
async def copy_folders(
    body: BulkCopyFolderBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    succeeded, failed_pairs = await svc.bulk_copy_folders(
        session, current_user.telegram_id, body.slugs, body.target_parent_slug, settings
    )
    return BulkFolderResult(
        succeeded=succeeded,
        failed=[BulkItemFailure(id=slug, error=err) for slug, err in failed_pairs],
    )


@router.get("/children", response_model=Paginated[FolderOut])
async def list_root_children(
    page: int = 1,
    page_size: int = 50,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folders, total = await svc.list_root_folders(
        session, current_user.telegram_id, page=page, page_size=page_size
    )
    return Paginated(items=folders, total=total, page=page, page_size=page_size)


# ── Dynamic /{slug:path} routes AFTER all fixed-path routes ─────────────────

@router.patch("/{slug:path}", response_model=FolderOut)
async def update_folder(
    slug: str,
    data: FolderUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await svc.update_folder(session, current_user.telegram_id, slug, data)


@router.get("/{slug:path}/children", response_model=Paginated[FolderOut])
async def list_children(
    slug: str,
    page: int = 1,
    page_size: int = 50,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folders, total = await svc.list_children(
        session, current_user.telegram_id, slug, page=page, page_size=page_size
    )
    return Paginated(items=folders, total=total, page=page, page_size=page_size)
