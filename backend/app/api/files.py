import asyncio
import os
import re
import tempfile
import uuid
from typing import Optional
from urllib.parse import quote

# Keep strong references to background upload tasks so the GC cannot cancel them.
_background_tasks: set[asyncio.Task] = set()

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from streaming_form_data import StreamingFormDataParser
from streaming_form_data.targets import FileTarget, ValueTarget

from app.core.deps import get_client_pool, get_current_user, get_db
from app.db.models.user import User
from app.schemas.files import (
    BulkCopyFileBody,
    BulkDeleteFileBody,
    BulkDeleteFileResult,
    BulkFileResult,
    BulkItemFailure,
    BulkMoveFileBody,
    FileFetchBody,
    FileOut,
    FileStatsOut,
    FileUpdate,
    FileUploadOut,
)
from app.schemas.pagination import Paginated
from app.services import download as download_svc
from app.services import files as files_svc
from app.services import folders as folders_svc
from app.services import upload as upload_svc
from app.telegram import operation_registry
from app.telegram.client_pool import ClientPool

router = APIRouter(prefix="/api/v1/files", tags=["files"])


class HashCheckBody(BaseModel):
    file_hash: str


class ChunkInitializeBody(BaseModel):
    filename: str
    file_hash: str
    total_size: int
    mime_type: Optional[str] = None
    folder_slug: Optional[str] = None
    channel_id: Optional[uuid.UUID] = None


class ChunkFinalizeBody(BaseModel):
    file_hash: str


# ── Fixed-path routes MUST be registered before /{file_id} ──────────────────

@router.get("/", response_model=Paginated[FileOut])
async def list_files(
    folder_slug: str | None = None,
    page: int = 1,
    page_size: int = 50,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if folder_slug:
        folder = await folders_svc.get_folder_by_slug(session, current_user.telegram_id, folder_slug)
        folder_id = folder.id
    else:
        folder_id = None

    files, total = await files_svc.list_files(
        session, current_user.telegram_id, folder_id, page=page, page_size=page_size
    )
    return Paginated(items=files, total=total, page=page, page_size=page_size)


@router.get("/stats", response_model=FileStatsOut)
async def get_file_stats(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_size, file_count = await files_svc.get_user_stats(session, current_user.telegram_id)
    return FileStatsOut(total_size=total_size, file_count=file_count)


@router.post("/fetch", response_model=list[FileOut])
async def fetch_files(
    body: FileFetchBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await files_svc.bulk_fetch_files(session, current_user.telegram_id, body.ids)


@router.delete("/", response_model=BulkDeleteFileResult, status_code=200)
async def delete_files(
    body: BulkDeleteFileBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    pool: ClientPool = Depends(get_client_pool),
):
    succeeded_ids, failed_pairs = await files_svc.bulk_delete_files(
        session, pool, current_user.telegram_id, body.ids
    )
    return BulkDeleteFileResult(
        succeeded=[str(fid) for fid in succeeded_ids],
        failed=[BulkItemFailure(id=str(fid), error=err) for fid, err in failed_pairs],
    )


@router.post("/move", response_model=BulkFileResult)
async def move_files(
    body: BulkMoveFileBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    succeeded, failed_pairs = await files_svc.bulk_move_files(
        session, current_user.telegram_id, body.ids, body.target_folder_slug
    )
    return BulkFileResult(
        succeeded=succeeded,
        failed=[BulkItemFailure(id=str(fid), error=err) for fid, err in failed_pairs],
    )


@router.post("/copy", response_model=BulkFileResult)
async def copy_files(
    body: BulkCopyFileBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    succeeded, failed_pairs = await files_svc.bulk_copy_files(
        session, current_user.telegram_id, body.ids, body.target_folder_slug
    )
    return BulkFileResult(
        succeeded=succeeded,
        failed=[BulkItemFailure(id=str(fid), error=err) for fid, err in failed_pairs],
    )


@router.post("/check-hash", status_code=200)
async def check_hash(
    body: HashCheckBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check whether a file with this hash already exists — call this before
    uploading to avoid sending gigabytes only to receive a 409."""
    existing = await upload_svc.check_duplicate(session, current_user.telegram_id, body.file_hash)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "DUPLICATE_FILE",
                "message": "File already exists.",
                "detail": {"file_id": str(existing.id)},
            },
        )
    return {"exists": False}


@router.post("/upload", status_code=202, response_model=FileUploadOut)
async def upload_file(
    request: Request,
    pool: ClientPool = Depends(get_client_pool),
):
    from app.core.auth import decode_access_token, AuthError
    from app.db.session import AsyncSessionLocal
    import urllib.parse
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.split(" ")[1]
    
    try:
        payload = decode_access_token(token)
        owner_id = int(payload["sub"])
    except AuthError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Stream the multipart body straight to a temp file — never holds the
    # entire file in RAM regardless of size.
    # NOTE: tmp_path cleanup is delegated to execute_upload (background task).
    fd, tmp_path = tempfile.mkstemp()
    os.close(fd)

    try:
        parser = StreamingFormDataParser(headers=request.headers)

        file_hash_target = ValueTarget()
        folder_slug_target = ValueTarget()
        channel_id_target = ValueTarget()
        filename_target = ValueTarget()
        mime_type_target = ValueTarget()
        total_size_target = ValueTarget()
        file_target = FileTarget(tmp_path)

        parser.register("file_hash", file_hash_target)
        parser.register("folder_slug", folder_slug_target)
        parser.register("channel_id", channel_id_target)
        parser.register("filename", filename_target)
        parser.register("mime_type", mime_type_target)
        parser.register("total_size", total_size_target)
        parser.register("file", file_target)

        async for chunk in request.stream():
            parser.data_received(chunk)

        # Extract form field values
        file_hash = file_hash_target.value.decode()
        folder_slug = folder_slug_target.value.decode()
        channel_id_raw = channel_id_target.value.decode() if channel_id_target.value else None
        channel_id = uuid.UUID(channel_id_raw) if channel_id_raw else None
        def _sanitize(s: str) -> str:
            s = re.sub(r"[^A-Za-z0-9_\-]", "_", s)
            s = re.sub(r"[_\-]{2,}", "_", s)
            return s.strip("_-")

        raw_filename = filename_target.value.decode() if filename_target.value else ""
        # Preserve the stem and extension separately, then sanitize each
        if raw_filename:
            _stem, _dot, _ext = raw_filename.rpartition(".")
            if _dot:
                _stem_clean = _sanitize(_stem) or "upload"
                _ext_clean = _sanitize(_ext)
                filename = f"{_stem_clean}.{_ext_clean}" if _ext_clean else _stem_clean
            else:
                filename = _sanitize(raw_filename) or "upload"
        else:
            filename = "upload"
        mime_type = mime_type_target.value.decode() if mime_type_target.value else None
        total_size_raw = total_size_target.value.decode() if total_size_target.value else None
        total_size = int(total_size_raw) if total_size_raw else os.path.getsize(tmp_path)

        # Open a short-lived DB session AFTER streaming is completely finished.
        async with AsyncSessionLocal() as session:
            # Verify user exists
            user = await session.get(User, owner_id)
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
                
            # Resolve folder from slug (optional — None means root)
            if folder_slug:
                folder = await folders_svc.get_folder_by_slug(
                    session, owner_id, folder_slug
                )
            else:
                folder = None

            # Resolve channel
            channel = await upload_svc.resolve_channel(
                session, owner_id, channel_id, folder
            )

            # Validate + create operation — fast, no Telegram I/O yet.
            operation_id, file_id, split_count, channel_record = await upload_svc.prepare_upload(
                session=session,
                registry=operation_registry,
                owner_id=owner_id,
                folder_id=folder.id if folder else None,
                channel_id=channel.id,
                filename=filename,
                mime_type=mime_type,
                total_size=total_size,
                file_hash=file_hash,
            )

    except Exception:
        # Only clean up here on validation error — on success the background
        # task owns the file and will unlink it.
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise

    # Kick off Telegram upload as a background task so this response is
    # delivered to the client before any progress events are emitted.
    # Store a strong reference in _background_tasks so the GC cannot cancel
    # the task mid-upload (critical for multi-GB files that run for minutes).
    task = asyncio.create_task(upload_svc.execute_upload(
        registry=operation_registry,
        pool=pool,
        operation_id=operation_id,
        file_id=file_id,
        owner_id=owner_id,
        folder_id=folder.id if folder else None,
        channel=channel_record,
        filename=filename,
        mime_type=mime_type,
        total_size=total_size,
        file_hash=file_hash,
        tmp_path=tmp_path,
    ))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return FileUploadOut(
        operation_id=operation_id,
        file_id=file_id,
        original_name=filename,
        total_size=total_size,
        split_count=split_count,
        folder_id=folder.id if folder else None,
    )


# --- Chunked Upload Endpoints ---

# upload_id -> (tmp_path, chunk_size)
_chunked_uploads: dict[str, tuple[str, int]] = {}


def _preallocate_file(path: str, size: int) -> None:
    with open(path, "wb") as f:
        f.seek(size - 1)
        f.write(b"\x00")


def _write_chunk_at_offset(path: str, offset: int, data: bytes) -> None:
    with open(path, "r+b") as f:
        f.seek(offset)
        f.write(data)


@router.post("/upload/initialize", status_code=200)
async def initialize_chunked_upload(
    body: ChunkInitializeBody,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Start a chunked upload for a large file."""
    from app.core.config import get_settings
    chunk_size = get_settings().upload_chunk_size
    upload_id = str(uuid.uuid4())
    fd, tmp_path = tempfile.mkstemp()
    os.close(fd)
    # Pre-allocate the full file so parallel chunk writes land at correct offsets.
    await asyncio.to_thread(_preallocate_file, tmp_path, body.total_size)
    _chunked_uploads[upload_id] = (tmp_path, chunk_size)
    return {
        "upload_id": upload_id,
        "chunk_size": chunk_size,
        "max_parallel_chunks": get_settings().upload_max_parallel_chunks,
    }


@router.post("/upload/chunk/{upload_id}/{chunk_index}", status_code=204)
async def upload_chunk(
    upload_id: str,
    chunk_index: int,
    request: Request,
):
    """Write a chunk at its correct byte offset, enabling parallel uploads."""
    entry = _chunked_uploads.get(upload_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Upload session not found or expired.")
    tmp_path, chunk_size = entry
    offset = chunk_index * chunk_size

    data = b"".join([chunk async for chunk in request.stream()])
    await asyncio.to_thread(_write_chunk_at_offset, tmp_path, offset, data)


@router.post("/upload/finalize/{upload_id}", status_code=202, response_model=FileUploadOut)
async def finalize_chunked_upload(
    upload_id: str,
    body: ChunkInitializeBody,  # Re-sending metadata for finalization
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    pool: ClientPool = Depends(get_client_pool),
):
    """Finalize the chunked upload and start Telegram processing."""
    entry = _chunked_uploads.pop(upload_id, None)
    if not entry:
        raise HTTPException(status_code=404, detail="Upload session not found.")
    tmp_path, _ = entry

    if not os.path.exists(tmp_path):
        raise HTTPException(status_code=404, detail="Temporary file missing.")

    # Sanitize and resolve as in upload_file...
    def _sanitize(s: str) -> str:
        s = re.sub(r"[^A-Za-z0-9_\-]", "_", s)
        s = re.sub(r"[_\-]{2,}", "_", s)
        return s.strip("_-")

    raw_filename = body.filename
    if raw_filename:
        _stem, _dot, _ext = raw_filename.rpartition(".")
        if _dot:
            _stem_clean = _sanitize(_stem) or "upload"
            _ext_clean = _sanitize(_ext)
            filename = f"{_stem_clean}.{_ext_clean}" if _ext_clean else _stem_clean
        else:
            filename = _sanitize(raw_filename) or "upload"
    else:
        filename = "upload"

    # Resolve folder
    if body.folder_slug:
        folder = await folders_svc.get_folder_by_slug(
            session, current_user.telegram_id, body.folder_slug
        )
    else:
        folder = None

    # Resolve channel
    channel = await upload_svc.resolve_channel(
        session, current_user.telegram_id, body.channel_id, folder
    )

    # Validate + create operation
    operation_id, file_id, split_count, channel_record = await upload_svc.prepare_upload(
        session=session,
        registry=operation_registry,
        owner_id=current_user.telegram_id,
        folder_id=folder.id if folder else None,
        channel_id=channel.id,
        filename=filename,
        mime_type=body.mime_type,
        total_size=body.total_size,
        file_hash=body.file_hash,
    )

    # Start background task
    task = asyncio.create_task(upload_svc.execute_upload(
        registry=operation_registry,
        pool=pool,
        operation_id=operation_id,
        file_id=file_id,
        owner_id=current_user.telegram_id,
        folder_id=folder.id if folder else None,
        channel=channel_record,
        filename=filename,
        mime_type=body.mime_type,
        total_size=body.total_size,
        file_hash=body.file_hash,
        tmp_path=tmp_path,
    ))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return FileUploadOut(
        operation_id=operation_id,
        file_id=file_id,
        original_name=filename,
        total_size=body.total_size,
        split_count=split_count,
        folder_id=folder.id if folder else None,
    )


# ── Dynamic /{file_id} routes AFTER all fixed-path routes ───────────────────

@router.patch("/{file_id}", response_model=FileOut)
async def update_file(
    file_id: uuid.UUID,
    data: FileUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await files_svc.update_file(session, current_user.telegram_id, file_id, data)


@router.get("/{file_id}/download")
async def download_file(
    file_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    pool: ClientPool = Depends(get_client_pool),
):
    file, splits = await download_svc.get_file_with_splits(
        session, current_user.telegram_id, file_id
    )
    operation_id, byte_stream = download_svc.download_stream(
        pool, operation_registry, current_user.telegram_id, file, splits
    )

    # Use the renamed 'name' if set, fallback to 'original_name'.
    # If the current name lacks an extension but the original name had one, append it.
    source_name = file.name or file.original_name
    _, original_ext = os.path.splitext(file.original_name)
    _, current_ext = os.path.splitext(source_name)

    if not current_ext and original_ext:
        download_name = f"{source_name}{original_ext}"
    else:
        download_name = source_name

    # Ensure a safe ASCII-only filename for the basic 'filename' parameter
    # and use 'filename*' for the full UTF-8 name.
    try:
        safe_name = download_name.encode("ascii", "ignore").decode("ascii").strip()
        if not safe_name or safe_name.startswith("."):
            safe_name = f"file{safe_name}"
    except Exception:
        safe_name = "file"

    return StreamingResponse(
        content=byte_stream,
        media_type=file.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"; filename*=UTF-8\'\'{quote(download_name)}',
            "Content-Length": str(file.total_size),
            "X-Operation-Id": operation_id,
        },
    )
