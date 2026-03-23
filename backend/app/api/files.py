import asyncio
import base64
import os
import re
import tempfile
import uuid
from dataclasses import dataclass
from typing import Optional
from urllib.parse import quote


from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from streaming_form_data import StreamingFormDataParser
from streaming_form_data.targets import FileTarget, ValueTarget

from app.core.deps import get_client_pool, get_current_user, get_db, get_upload_worker_pool
from app.services.upload_queue import UploadJob, UploadWorkerPool
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
    upload_worker_pool: UploadWorkerPool = Depends(get_upload_worker_pool),
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
        raw_filename = filename_target.value.decode() if filename_target.value else ""
        filename = _sanitize_filename(raw_filename)
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

    # Submit to the upload worker pool so uploads are processed by a dedicated
    # worker instead of a bare asyncio task that can be GC'd.
    upload_worker_pool.submit(owner_id, UploadJob(
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
        account_offset=0,  # overwritten by submit()
    ))

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


@dataclass
class _TusUpload:
    tmp_path: str
    total_size: int
    offset: int
    owner_id: int
    filename: str
    file_hash: str
    mime_type: Optional[str]
    folder_slug: Optional[str]
    channel_id: Optional[uuid.UUID]


# upload_id -> TUS state
_tus_uploads: dict[str, _TusUpload] = {}


def _preallocate_file(path: str, size: int) -> None:
    with open(path, "wb") as f:
        f.seek(size - 1)
        f.write(b"\x00")


def _write_chunk_at_offset(path: str, offset: int, data: bytes) -> None:
    with open(path, "r+b") as f:
        f.seek(offset)
        f.write(data)


def _sanitize_filename(raw_filename: str) -> str:
    def _sanitize(s: str) -> str:
        s = re.sub(r"[^A-Za-z0-9_\-]", "_", s)
        s = re.sub(r"[_\-]{2,}", "_", s)
        return s.strip("_-")

    if raw_filename:
        _stem, _dot, _ext = raw_filename.rpartition(".")
        if _dot:
            _stem_clean = _sanitize(_stem) or "upload"
            _ext_clean = _sanitize(_ext)
            return f"{_stem_clean}.{_ext_clean}" if _ext_clean else _stem_clean
        else:
            return _sanitize(raw_filename) or "upload"
    return "upload"


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
    upload_worker_pool: UploadWorkerPool = Depends(get_upload_worker_pool),
):
    """Finalize the chunked upload and start Telegram processing."""
    entry = _chunked_uploads.pop(upload_id, None)
    if not entry:
        raise HTTPException(status_code=404, detail="Upload session not found.")
    tmp_path, _ = entry

    if not os.path.exists(tmp_path):
        raise HTTPException(status_code=404, detail="Temporary file missing.")

    filename = _sanitize_filename(body.filename)

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

    # Submit to the upload worker pool so uploads are processed by a dedicated worker.
    upload_worker_pool.submit(current_user.telegram_id, UploadJob(
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
        account_offset=0,  # overwritten by submit()
    ))

    return FileUploadOut(
        operation_id=operation_id,
        file_id=file_id,
        original_name=filename,
        total_size=body.total_size,
        split_count=split_count,
        folder_id=folder.id if folder else None,
    )


# --- TUS Resumable Upload Endpoints ---

@router.post("/upload/tus", status_code=201)
async def tus_create_upload(
    request: Request,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """TUS: Create a new resumable upload session."""
    upload_length = request.headers.get("Upload-Length")
    if not upload_length:
        raise HTTPException(status_code=400, detail="Upload-Length header required")

    total_size = int(upload_length)

    # Parse TUS Upload-Metadata (comma-separated "key base64value" pairs)
    metadata: dict[str, str] = {}
    for pair in request.headers.get("Upload-Metadata", "").split(","):
        pair = pair.strip()
        if " " in pair:
            k, v = pair.split(" ", 1)
            try:
                metadata[k] = base64.b64decode(v).decode()
            except Exception:
                metadata[k] = ""
        elif pair:
            metadata[pair] = ""

    upload_id = str(uuid.uuid4())
    fd, tmp_path = tempfile.mkstemp()
    os.close(fd)
    await asyncio.to_thread(_preallocate_file, tmp_path, total_size)

    raw_channel_id = metadata.get("channelid") or metadata.get("channel_id")
    _tus_uploads[upload_id] = _TusUpload(
        tmp_path=tmp_path,
        total_size=total_size,
        offset=0,
        owner_id=current_user.telegram_id,
        filename=metadata.get("filename", "upload"),
        file_hash=metadata.get("filehash", metadata.get("file_hash", "")),
        mime_type=metadata.get("mimetype") or metadata.get("mime_type") or None,
        folder_slug=metadata.get("folderslug") or metadata.get("folder_slug") or None,
        channel_id=uuid.UUID(raw_channel_id) if raw_channel_id else None,
    )

    from fastapi.responses import Response
    return Response(
        status_code=201,
        headers={
            "Location": f"/api/v1/files/upload/tus/{upload_id}",
            "Tus-Resumable": "1.0.0",
        },
    )


@router.head("/upload/tus/{upload_id}", status_code=200)
async def tus_head(
    upload_id: str,
    current_user: User = Depends(get_current_user),
):
    """TUS: Return current upload offset so client can resume."""
    entry = _tus_uploads.get(upload_id)
    if not entry:
        raise HTTPException(status_code=404, detail="TUS upload not found")
    if entry.owner_id != current_user.telegram_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    from fastapi.responses import Response
    return Response(
        status_code=200,
        headers={
            "Upload-Offset": str(entry.offset),
            "Upload-Length": str(entry.total_size),
            "Tus-Resumable": "1.0.0",
            "Cache-Control": "no-store",
        },
    )


@router.patch("/upload/tus/{upload_id}", status_code=204)
async def tus_patch(
    upload_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """TUS: Append data at the current offset."""
    entry = _tus_uploads.get(upload_id)
    if not entry:
        raise HTTPException(status_code=404, detail="TUS upload not found")
    if entry.owner_id != current_user.telegram_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    upload_offset_hdr = request.headers.get("Upload-Offset")
    if upload_offset_hdr is None:
        raise HTTPException(status_code=400, detail="Upload-Offset header required")

    client_offset = int(upload_offset_hdr)
    if client_offset != entry.offset:
        raise HTTPException(
            status_code=409,
            detail=f"Offset conflict: server has {entry.offset}, client sent {client_offset}",
        )

    # Stream directly to disk at the correct offset — avoids buffering the entire
    # chunk in RAM, which allows arbitrarily large TUS chunk sizes.
    bytes_written = 0
    with open(entry.tmp_path, "r+b") as f:
        f.seek(entry.offset)
        async for chunk in request.stream():
            f.write(chunk)
            bytes_written += len(chunk)
    entry.offset += bytes_written

    from fastapi.responses import Response
    return Response(
        status_code=204,
        headers={
            "Upload-Offset": str(entry.offset),
            "Tus-Resumable": "1.0.0",
        },
    )


@router.post("/upload/tus/{upload_id}/finalize", status_code=202, response_model=FileUploadOut)
async def tus_finalize(
    upload_id: str,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    upload_worker_pool: UploadWorkerPool = Depends(get_upload_worker_pool),
):
    """TUS: Finalize the completed upload and start Telegram processing."""
    entry = _tus_uploads.pop(upload_id, None)
    if not entry:
        raise HTTPException(status_code=404, detail="TUS upload not found")
    if entry.owner_id != current_user.telegram_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if entry.offset != entry.total_size:
        raise HTTPException(
            status_code=400,
            detail=f"Upload incomplete: {entry.offset}/{entry.total_size} bytes received",
        )
    if not os.path.exists(entry.tmp_path):
        raise HTTPException(status_code=404, detail="Temporary file missing")

    filename = _sanitize_filename(entry.filename)

    folder = None
    if entry.folder_slug:
        folder = await folders_svc.get_folder_by_slug(
            session, current_user.telegram_id, entry.folder_slug
        )

    channel = await upload_svc.resolve_channel(
        session, current_user.telegram_id, entry.channel_id, folder
    )

    operation_id, file_id, split_count, channel_record = await upload_svc.prepare_upload(
        session=session,
        registry=operation_registry,
        owner_id=current_user.telegram_id,
        folder_id=folder.id if folder else None,
        channel_id=channel.id,
        filename=filename,
        mime_type=entry.mime_type,
        total_size=entry.total_size,
        file_hash=entry.file_hash,
    )

    upload_worker_pool.submit(current_user.telegram_id, UploadJob(
        operation_id=operation_id,
        file_id=file_id,
        owner_id=current_user.telegram_id,
        folder_id=folder.id if folder else None,
        channel=channel_record,
        filename=filename,
        mime_type=entry.mime_type,
        total_size=entry.total_size,
        file_hash=entry.file_hash,
        tmp_path=entry.tmp_path,
        account_offset=0,
    ))

    return FileUploadOut(
        operation_id=operation_id,
        file_id=file_id,
        original_name=filename,
        total_size=entry.total_size,
        split_count=split_count,
        folder_id=folder.id if folder else None,
    )



# ── Upload cancellation endpoints ────────────────────────────────────────────

@router.delete("/upload/{operation_id}", status_code=204)
async def cancel_upload(
    operation_id: str,
    current_user: User = Depends(get_current_user),
    upload_worker_pool: UploadWorkerPool = Depends(get_upload_worker_pool),
):
    """Cancel a single upload (queued, hashing, or uploading to Telegram).

    The cancel flag is set immediately so the Telegram worker can spot it
    between splits. Any partial Telegram messages are rolled back and the
    pending File record is deleted by the worker (or by this handler if
    the job was still queued and never started).
    """
    # Verify the operation exists and belongs to this user
    owner_id = operation_registry._op_to_owner.get(operation_id)
    if owner_id is None:
        # Already finished or never existed — treat as a no-op success
        return
    if owner_id != current_user.telegram_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Set the cancel flag immediately so the worker sees it on the next check
    operation_registry.cancel_operation(operation_id)

    # Try to pull the job out of the queue before a worker picks it up
    upload_worker_pool.cancel_job(current_user.telegram_id, operation_id)

    # Cancel any pending TUS session too
    for upload_id, entry in list(_tus_uploads.items()):
        if entry.owner_id == current_user.telegram_id:
            # We cannot know the operation_id before finalization, so we skip TUS
            pass

    # Broadcast the cancelled SSE event to all listeners for this operation
    await operation_registry.emit_cancelled(operation_id, message="Cancelled by user")


@router.delete("/upload", status_code=204)
async def cancel_all_uploads(
    current_user: User = Depends(get_current_user),
    upload_worker_pool: UploadWorkerPool = Depends(get_upload_worker_pool),
):
    """Cancel ALL active, queued, and in-progress uploads for the current user."""
    owner_id = current_user.telegram_id

    # Collect all operation_ids owned by this user from the registry
    owned_ops = [
        op_id
        for op_id, uid in list(operation_registry._op_to_owner.items())
        if uid == owner_id
    ]

    # Mark all as cancelled immediately
    for op_id in owned_ops:
        operation_registry.cancel_operation(op_id)

    # Drain the queue of any jobs not yet picked up by a worker
    upload_worker_pool.cancel_all_jobs(owner_id)

    # Broadcast cancelled SSE to all
    for op_id in owned_ops:
        await operation_registry.emit_cancelled(op_id, message="Cancelled by user")


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
