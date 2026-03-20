from __future__ import annotations

import io
import logging
import os
import uuid

from fastapi import HTTPException
from PIL import Image
from sqlalchemy import select, text, func, or_, tuple_
from sqlalchemy.orm import aliased, selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import Settings
from app.db.models.channel import Channel
from app.db.models.file import File
from app.db.models.folder import Folder
from app.db.models.split import Split
from app.schemas.folders import FolderIn, FolderUpdate
from app.services.events import log_event
from app.telegram.client_pool import ClientPool
from app.telegram.operations import delete_message, bulk_delete_messages

logger = logging.getLogger(__name__)

import re


def _validate_name(name: str) -> None:
    if not name or not name.strip():
        raise HTTPException(status_code=422, detail="Folder name must not be empty")
    for char in ("/", "\\"):
        if char in name:
            raise HTTPException(status_code=422, detail=f"Folder name must not contain '{char}'")
    if name.strip() == "..":
        raise HTTPException(status_code=422, detail="Folder name must not be '..'")


def _slugify(name: str) -> str:
    """Convert a display name to a URL-safe slug segment."""
    slug = name.strip().lower()
    slug = re.sub(r"[^\w\s-]", "", slug)   # remove chars that aren't word chars, spaces, or hyphens
    slug = re.sub(r"[\s_]+", "-", slug)     # spaces/underscores → hyphens
    slug = re.sub(r"-+", "-", slug)         # collapse multiple hyphens
    slug = slug.strip("-")                  # strip edge hyphens
    if not slug:
        raise HTTPException(status_code=422, detail="Folder name produces an empty slug")
    return slug


async def get_folder_by_slug(session: AsyncSession, owner_id: int, slug: str) -> Folder:
    FolderAlias = aliased(Folder)
    file_count_sub = (
        select(func.count(File.id))
        .where(File.folder_id == Folder.id)
        .scalar_subquery()
    )
    subfolder_count_sub = (
        select(func.count(FolderAlias.id))
        .where(FolderAlias.parent_id == Folder.id)
        .scalar_subquery()
    )
    total_size_sub = (
        select(func.coalesce(func.sum(File.total_size), 0))
        .select_from(File)
        .join(FolderAlias, File.folder_id == FolderAlias.id)
        .where(
            or_(
                FolderAlias.id == Folder.id,
                FolderAlias.slug.like(Folder.slug + "/%")
            ),
            FolderAlias.created_by == Folder.created_by
        )
        .scalar_subquery()
    )

    result = await session.execute(
        select(Folder, file_count_sub, subfolder_count_sub, total_size_sub)
        .where(Folder.slug == slug, Folder.created_by == owner_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    folder, file_count, sub_count, total_size = row
    folder.file_count = file_count
    folder.subfolder_count = sub_count
    folder.total_size = total_size
    return folder


async def list_root_folders(
    session: AsyncSession, owner_id: int, page: int = 1, page_size: int = 50
) -> tuple[list[Folder], int]:
    base_query = select(Folder).where(Folder.parent_id.is_(None), Folder.created_by == owner_id)

    # Subqueries for counts
    FolderAlias = aliased(Folder)
    file_count_sub = (
        select(func.count(File.id))
        .where(File.folder_id == Folder.id)
        .scalar_subquery()
    )
    subfolder_count_sub = (
        select(func.count(FolderAlias.id))
        .where(FolderAlias.parent_id == Folder.id)
        .scalar_subquery()
    )
    total_size_sub = (
        select(func.coalesce(func.sum(File.total_size), 0))
        .select_from(File)
        .join(FolderAlias, File.folder_id == FolderAlias.id)
        .where(
            or_(
                FolderAlias.id == Folder.id,
                FolderAlias.slug.like(Folder.slug + "/%")
            ),
            FolderAlias.created_by == Folder.created_by
        )
        .scalar_subquery()
    )

    # Count total
    total = await session.scalar(select(func.count()).select_from(base_query.subquery())) or 0

    # Paginate and fetch
    result = await session.execute(
        select(Folder, file_count_sub, subfolder_count_sub, total_size_sub)
        .where(Folder.parent_id.is_(None), Folder.created_by == owner_id)
        .order_by(Folder.name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    
    folders_with_counts = []
    for row in result.all():
        folder, file_count, sub_count, total_size = row
        folder.file_count = file_count
        folder.subfolder_count = sub_count
        folder.total_size = total_size
        folders_with_counts.append(folder)
        
    return folders_with_counts, total


async def list_children(
    session: AsyncSession, owner_id: int, parent_slug: str, page: int = 1, page_size: int = 50
) -> tuple[list[Folder], int]:
    parent = await get_folder_by_slug(session, owner_id, parent_slug)
    base_query = select(Folder).where(Folder.parent_id == parent.id, Folder.created_by == owner_id)

    # Subqueries for counts
    FolderAlias = aliased(Folder)
    file_count_sub = (
        select(func.count(File.id))
        .where(File.folder_id == Folder.id)
        .scalar_subquery()
    )
    subfolder_count_sub = (
        select(func.count(FolderAlias.id))
        .where(FolderAlias.parent_id == Folder.id)
        .scalar_subquery()
    )
    total_size_sub = (
        select(func.coalesce(func.sum(File.total_size), 0))
        .select_from(File)
        .join(FolderAlias, File.folder_id == FolderAlias.id)
        .where(
            or_(
                FolderAlias.id == Folder.id,
                FolderAlias.slug.like(Folder.slug + "/%")
            ),
            FolderAlias.created_by == Folder.created_by
        )
        .scalar_subquery()
    )

    # Count total
    total = await session.scalar(select(func.count()).select_from(base_query.subquery())) or 0

    # Paginate and fetch
    result = await session.execute(
        select(Folder, file_count_sub, subfolder_count_sub, total_size_sub)
        .where(Folder.parent_id == parent.id, Folder.created_by == owner_id)
        .order_by(Folder.name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    
    folders_with_counts = []
    for row in result.all():
        folder, file_count, sub_count, total_size = row
        folder.file_count = file_count
        folder.subfolder_count = sub_count
        folder.total_size = total_size
        folders_with_counts.append(folder)
        
    return folders_with_counts, total


async def create_folder(
    session: AsyncSession, owner_id: int, data: FolderIn, settings: Settings
) -> Folder:
    _validate_name(data.name)

    parent_id: uuid.UUID | None = None
    depth = 0
    name_slug = _slugify(data.name)
    slug = name_slug

    if data.parent_slug:
        parent = await get_folder_by_slug(session, owner_id, data.parent_slug)
        depth = parent.depth + 1
        if depth >= settings.max_folder_depth:
            raise HTTPException(status_code=400, detail="FOLDER_DEPTH_EXCEEDED")
        parent_id = parent.id
        slug = parent.slug + "/" + name_slug

    folder = Folder(
        created_by=owner_id,
        parent_id=parent_id,
        name=data.name,
        slug=slug,
        depth=depth,
        icon_color=data.icon_color,
        default_channel_id=data.default_channel_id,
    )
    session.add(folder)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="A folder with this name already exists here")
    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="folder.create",
        target_type="folder",
        target_id=str(folder.id),
        metadata={"slug": slug, "name": folder.name},
    )
    await session.commit()
    await session.refresh(folder)
    return folder


async def update_folder(
    session: AsyncSession, owner_id: int, slug: str, data: FolderUpdate
) -> Folder:
    folder = await get_folder_by_slug(session, owner_id, slug)

    if data.name is not None:
        _validate_name(data.name)
        name_slug = _slugify(data.name)
        # Recompute slug: keep parent prefix, replace last segment
        if "/" in folder.slug:
            parent_prefix = folder.slug.rsplit("/", 1)[0]
            folder.slug = parent_prefix + "/" + name_slug
        else:
            folder.slug = name_slug
        folder.name = data.name
        if folder.icon_image:
            folder.icon_image = f"/api/v1/icons/{folder.slug}"

    if data.icon_color is not None:
        folder.icon_color = data.icon_color

    if data.icon_image is not None or "icon_image" in data.model_fields_set:
        # If it's explicitly set to None (or empty), remove the icon
        if not data.icon_image:
            if folder.icon_image:
                # Delete icon from disk
                settings = Settings() # Or pass settings to update_folder if needed, but it's not in signature
                # Wait, update_folder doesn't take settings. I should check if I can get them or if I should pass them.
                # Actually, I'll use a better way to get settings if possible, or just skip disk cleanup for now if it's risky.
                # But icons_dir is needed.
                from app.core.config import get_settings
                settings = get_settings()
                icon_path = os.path.join(settings.icons_dir, f"{folder.id}.webp")
                if os.path.isfile(icon_path):
                    try:
                        os.remove(icon_path)
                    except Exception as e:
                        logger.warning(f"Failed to remove icon file {icon_path}: {e}")
            folder.icon_image = None
        else:
            # If it's a string (URL), we just update it
            folder.icon_image = data.icon_image

    if data.default_channel_id is not None:
        folder.default_channel_id = data.default_channel_id

    await session.commit()
    await session.refresh(folder)
    return folder


async def upload_folder_icon(
    session: AsyncSession,
    owner_id: int,
    slug: str,
    image_bytes: bytes,
    content_type: str,
    settings: Settings,
) -> Folder:
    allowed = {"image/png", "image/jpeg", "image/webp"}
    if content_type not in allowed:
        raise HTTPException(status_code=422, detail="Unsupported image type")

    folder = await get_folder_by_slug(session, owner_id, slug)

    image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")

    quality = 85
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=quality)

    while buffer.tell() > settings.max_icon_size_bytes and quality > 10:
        quality -= 10
        buffer = io.BytesIO()
        image.save(buffer, format="WEBP", quality=quality)

    os.makedirs(settings.icons_dir, exist_ok=True)
    icon_path = os.path.join(settings.icons_dir, f"{folder.id}.webp")
    with open(icon_path, "wb") as f:
        f.write(buffer.getvalue())

    folder.icon_image = f"/api/v1/icons/{folder.slug}"
    await session.commit()
    await session.refresh(folder)

    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="folder.icon_upload",
        target_type="folder",
        target_id=str(folder.id),
        metadata={"icon_image": folder.icon_image, "name": folder.name},
    )
    await session.commit()
    return folder


async def _get_subtree_ids(
    session: AsyncSession, root_id: uuid.UUID
) -> list[uuid.UUID]:
    """Return all folder IDs in the subtree rooted at *root_id* (inclusive)."""
    result = await session.execute(
        text(
            "WITH RECURSIVE subtree AS ("
            "  SELECT id FROM folders WHERE id = :root_id"
            "  UNION ALL"
            "  SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id"
            ") SELECT id FROM subtree"
        ),
        {"root_id": root_id},
    )
    return [row[0] for row in result.fetchall()]


async def move_folder(
    session: AsyncSession,
    owner_id: int,
    slug: str,
    target_parent_slug: str | None,
    settings: Settings,
) -> Folder:
    folder = await get_folder_by_slug(session, owner_id, slug)
    old_slug = folder.slug

    # Collect subtree IDs before move (to detect cycles)
    subtree_ids = await _get_subtree_ids(session, folder.id)

    # Determine target parent
    if target_parent_slug:
        target_parent = await get_folder_by_slug(session, owner_id, target_parent_slug)
        # Reject moving a folder into one of its own descendants
        if target_parent.id in subtree_ids:
            raise HTTPException(
                status_code=400,
                detail="Cannot move a folder into one of its own descendants",
            )
        new_depth = target_parent.depth + 1
        slug_segment = folder.slug.rsplit("/", 1)[-1]
        new_slug = target_parent.slug + "/" + slug_segment
        new_parent_id = target_parent.id
    else:
        new_depth = 0
        new_slug = folder.slug.rsplit("/", 1)[-1]
        new_parent_id = None

    # Check depth limit (max depth of any descendant after move)
    max_descendant_depth_delta = new_depth - folder.depth
    # The deepest descendant will be at current_max_depth + delta
    deepest_result = await session.execute(
        text(
            "WITH RECURSIVE subtree AS ("
            "  SELECT id, depth FROM folders WHERE id = :root_id"
            "  UNION ALL"
            "  SELECT f.id, f.depth FROM folders f JOIN subtree s ON f.parent_id = s.id"
            ") SELECT MAX(depth) FROM subtree"
        ),
        {"root_id": folder.id},
    )
    max_current_depth = deepest_result.scalar() or folder.depth
    if max_current_depth + max_descendant_depth_delta >= settings.max_folder_depth:
        raise HTTPException(status_code=400, detail="FOLDER_DEPTH_EXCEEDED")

    depth_delta = max_descendant_depth_delta

    # Bulk-update all descendant slugs and depths (excluding the moved folder itself)
    try:
        await session.execute(
            text(
                "WITH RECURSIVE subtree AS ("
                "  SELECT id, slug FROM folders WHERE id = :root_id"
                "  UNION ALL"
                "  SELECT f.id, f.slug FROM folders f JOIN subtree s ON f.parent_id = s.id"
                ") UPDATE folders SET"
                "  slug = :new_prefix || substring(folders.slug, length(:old_prefix) + 1),"
                "  depth = folders.depth + :depth_delta"
                " FROM subtree WHERE folders.id = subtree.id"
            ),
            {
                "root_id": folder.id,
                "old_prefix": old_slug,
                "new_prefix": new_slug,
                "depth_delta": depth_delta,
            },
        )
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="A folder with this name already exists at the destination")

    # Update the moved folder's parent
    folder.parent_id = new_parent_id
    # Refresh to pick up CTE-updated slug/depth
    await session.flush()
    await session.refresh(folder)

    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="folder.move",
        target_type="folder",
        target_id=str(folder.id),
        metadata={"old_slug": old_slug, "new_slug": new_slug, "name": folder.name},
    )
    await session.commit()
    await session.refresh(folder)
    return folder


async def copy_folder(
    session: AsyncSession,
    owner_id: int,
    slug: str,
    target_parent_slug: str | None,
    settings: Settings,
) -> Folder:
    from app.services.files import copy_file

    source = await get_folder_by_slug(session, owner_id, slug)

    # Determine target parent info
    if target_parent_slug:
        target_parent = await get_folder_by_slug(session, owner_id, target_parent_slug)
        base_depth = target_parent.depth + 1
        base_slug = target_parent.slug + "/" + source.name
        parent_id = target_parent.id
    else:
        base_depth = 0
        base_slug = source.name
        parent_id = None

    if base_depth >= settings.max_folder_depth:
        raise HTTPException(status_code=400, detail="FOLDER_DEPTH_EXCEEDED")

    # Collect full subtree via CTE (BFS order by depth)
    result = await session.execute(
        text(
            "WITH RECURSIVE subtree AS ("
            "  SELECT id, parent_id, name, slug, depth FROM folders"
            "    WHERE id = :root_id"
            "  UNION ALL"
            "  SELECT f.id, f.parent_id, f.name, f.slug, f.depth FROM folders f"
            "    JOIN subtree s ON f.parent_id = s.id"
            ") SELECT id, parent_id, name, slug, depth FROM subtree ORDER BY depth"
        ),
        {"root_id": source.id},
    )
    subtree_rows = result.fetchall()

    # Build mapping old_id -> new Folder
    id_mapping: dict[uuid.UUID, uuid.UUID] = {}

    for row in subtree_rows:
        old_id, old_parent_id, name, old_slug, old_depth = row

        if old_id == source.id:
            new_parent_id = parent_id
            new_slug = base_slug
            new_depth = base_depth
        else:
            new_parent_id = id_mapping[old_parent_id]
            # Replace old source slug prefix with new base slug
            new_slug = base_slug + old_slug[len(source.slug):]
            new_depth = old_depth - source.depth + base_depth

        if new_depth >= settings.max_folder_depth:
            raise HTTPException(status_code=400, detail="FOLDER_DEPTH_EXCEEDED")

        new_folder = Folder(
            created_by=owner_id,
            parent_id=new_parent_id,
            name=name,
            slug=new_slug,
            depth=new_depth,
        )
        session.add(new_folder)
        await session.flush()
        id_mapping[old_id] = new_folder.id

    # Copy files for each folder in the subtree
    for row in subtree_rows:
        old_folder_id = row[0]
        new_folder_id = id_mapping[old_folder_id]

        # Get new folder's slug for copy_file
        new_folder = await session.get(Folder, new_folder_id)
        assert new_folder is not None

        files_result = await session.scalars(
            select(File).where(
                File.folder_id == old_folder_id,
                File.uploaded_by == owner_id,
            )
        )
        for file in files_result.all():
            # copy_file takes target_folder_slug — use the new folder's slug
            await copy_file(session, owner_id, file.id, new_folder.slug)

    # Get the root copied folder
    root_new_folder = await session.get(Folder, id_mapping[source.id])
    assert root_new_folder is not None

    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="folder.copy",
        target_type="folder",
        target_id=str(root_new_folder.id),
        metadata={"source_slug": slug, "name": root_new_folder.name},
    )
    await session.commit()
    await session.refresh(root_new_folder)
    return root_new_folder


async def delete_folder(
    session: AsyncSession,
    pool: ClientPool,
    owner_id: int,
    slug: str,
) -> None:
    folder = await get_folder_by_slug(session, owner_id, slug)

    # Collect all descendant folder IDs
    subtree_ids = await _get_subtree_ids(session, folder.id)

    # Collect all (channel_id, message_id) pairs for Telegram cleanup
    splits_result = await session.execute(
        select(Channel.channel_id, Split.message_id)
        .join(Split, Split.channel_id == Channel.id)
        .join(File, File.id == Split.file_id)
        .where(File.folder_id.in_(subtree_ids), File.uploaded_by == owner_id)
    )
    tg_messages = splits_result.fetchall()

    # Delete the top-level folder — CASCADE handles descendants, files, splits
    await session.delete(folder)

    await log_event(
        session,
        actor_telegram_id=owner_id,
        action="folder.delete",
        target_type="folder",
        target_id=str(folder.id),
        metadata={"slug": slug, "name": folder.name},
    )
    await session.commit()

    # Best-effort Telegram cleanup after commit
    messages_by_channel: dict[int, list[int]] = {}
    for channel_id, message_id in tg_messages:
        messages_by_channel.setdefault(channel_id, []).append(message_id)
    if messages_by_channel:
        client = pool.get_client_for_user(owner_id)
        try:
            await bulk_delete_messages(client, messages_by_channel)
        except Exception as exc:
            logger.warning("Telegram bulk cleanup failed for folder %s: %s", slug, exc)


async def bulk_fetch_folders(
    session: AsyncSession,
    owner_id: int,
    slugs: list[str],
) -> list[Folder]:
    result = []
    for slug in slugs:
        try:
            folder = await get_folder_by_slug(session, owner_id, slug)
            result.append(folder)
        except HTTPException:
            pass
    return result


async def bulk_delete_folders(
    session: AsyncSession,
    pool: ClientPool,
    owner_id: int,
    slugs: list[str],
) -> tuple[list[str], list[tuple[str, str]]]:
    """Returns (succeeded_slugs, [(failed_slug, error)])."""
    if not slugs:
        return [], []

    succeeded_slugs: list[str] = []
    failed: list[tuple[str, str]] = []

    # Resolve all slugs to folder objects, collect valid ones
    folders: list[Folder] = []
    for slug in slugs:
        try:
            folder = await get_folder_by_slug(session, owner_id, slug)
            folders.append(folder)
        except HTTPException:
            failed.append((slug, "Not found"))

    if not folders:
        return succeeded_slugs, failed

    # Collect all subtree IDs across all folders
    all_subtree_ids: list[uuid.UUID] = []
    for folder in folders:
        all_subtree_ids.extend(await _get_subtree_ids(session, folder.id))
    all_subtree_ids_set = list(set(all_subtree_ids))

    # Collect file IDs from all subtrees (needed for _collect_safe_tg_deletes)
    file_ids_result = await session.scalars(
        select(File.id).where(
            File.folder_id.in_(all_subtree_ids_set),
            File.uploaded_by == owner_id,
        )
    )
    file_ids = list(file_ids_result.all())

    # Collect safe TG deletes before DB deletion
    from app.services.files import _collect_safe_tg_deletes
    tg_deletes = await _collect_safe_tg_deletes(session, file_ids, owner_id)

    # Delete top-level folders — CASCADE handles subtrees
    for folder in folders:
        await log_event(
            session,
            actor_telegram_id=owner_id,
            action="folder.delete",
            target_type="folder",
            target_id=str(folder.id),
            metadata={"slug": folder.slug, "name": folder.name},
        )
        await session.delete(folder)
        succeeded_slugs.append(folder.slug)

    await session.commit()

    # Best-effort Telegram cleanup
    if tg_deletes:
        client = pool.get_client_for_user(owner_id)
        try:
            await bulk_delete_messages(client, tg_deletes)
        except Exception as exc:
            logger.warning("Telegram bulk cleanup failed for bulk folder delete: %s", exc)

    return succeeded_slugs, failed


async def bulk_move_folders(
    session: AsyncSession,
    owner_id: int,
    slugs: list[str],
    target_parent_slug: str | None,
    settings: Settings,
) -> tuple[list[Folder], list[tuple[str, str]]]:
    """Returns (succeeded_folders, [(failed_slug, error)])."""
    if not slugs:
        return [], []

    succeeded: list[Folder] = []
    failed: list[tuple[str, str]] = []

    # Resolve target parent
    target_parent: Folder | None = None
    if target_parent_slug:
        try:
            target_parent = await get_folder_by_slug(session, owner_id, target_parent_slug)
        except HTTPException:
            # All fail if target doesn't exist
            return [], [(s, "Target folder not found") for s in slugs]

    for slug in slugs:
        try:
            folder = await get_folder_by_slug(session, owner_id, slug)
        except HTTPException:
            failed.append((slug, "Not found"))
            continue

        old_slug = folder.slug

        # Cycle detection: target must not be inside this folder's subtree
        if target_parent is not None and target_parent.slug.startswith(old_slug + "/"):
            failed.append((slug, "Cannot move a folder into one of its own descendants"))
            continue

        # Compute new slug and depth
        slug_segment = old_slug.rsplit("/", 1)[-1]
        if target_parent is not None:
            new_slug = target_parent.slug + "/" + slug_segment
            new_depth = target_parent.depth + 1
            new_parent_id = target_parent.id
        else:
            new_slug = slug_segment
            new_depth = 0
            new_parent_id = None

        # Check depth limit
        deepest_result = await session.execute(
            text(
                "WITH RECURSIVE subtree AS ("
                "  SELECT id, depth FROM folders WHERE id = :root_id"
                "  UNION ALL"
                "  SELECT f.id, f.depth FROM folders f JOIN subtree s ON f.parent_id = s.id"
                ") SELECT MAX(depth) FROM subtree"
            ),
            {"root_id": folder.id},
        )
        max_current_depth = deepest_result.scalar() or folder.depth
        depth_delta = new_depth - folder.depth
        if max_current_depth + depth_delta >= settings.max_folder_depth:
            failed.append((slug, "FOLDER_DEPTH_EXCEEDED"))
            continue

        # Bulk-update all slugs and depths in this subtree
        try:
            await session.execute(
                text(
                    "WITH RECURSIVE subtree AS ("
                    "  SELECT id, slug FROM folders WHERE id = :root_id"
                    "  UNION ALL"
                    "  SELECT f.id, f.slug FROM folders f JOIN subtree s ON f.parent_id = s.id"
                    ") UPDATE folders SET"
                    "  slug = :new_prefix || substring(folders.slug, length(:old_prefix) + 1),"
                    "  depth = folders.depth + :depth_delta"
                    " FROM subtree WHERE folders.id = subtree.id"
                ),
                {
                    "root_id": folder.id,
                    "old_prefix": old_slug,
                    "new_prefix": new_slug,
                    "depth_delta": depth_delta,
                },
            )
        except IntegrityError:
            await session.rollback()
            failed.append((slug, "A folder with this name already exists at the destination"))
            continue

        folder.parent_id = new_parent_id
        await session.flush()
        await session.refresh(folder)
        succeeded.append(folder)

    await session.commit()
    for f in succeeded:
        await session.refresh(f)

    return succeeded, failed


async def bulk_copy_folders(
    session: AsyncSession,
    owner_id: int,
    slugs: list[str],
    target_parent_slug: str | None,
    settings: Settings,
) -> tuple[list[Folder], list[tuple[str, str]]]:
    """Returns (succeeded_root_folders, [(failed_slug, error)])."""
    if not slugs:
        return [], []

    from app.services.files import _collect_safe_tg_deletes

    succeeded: list[Folder] = []
    failed: list[tuple[str, str]] = []

    target_parent: Folder | None = None
    if target_parent_slug:
        try:
            target_parent = await get_folder_by_slug(session, owner_id, target_parent_slug)
        except HTTPException:
            return [], [(s, "Target folder not found") for s in slugs]

    for slug in slugs:
        try:
            root = await _copy_single_folder_tree(
                session, owner_id, slug, target_parent, settings
            )
            succeeded.append(root)
        except HTTPException as exc:
            failed.append((slug, exc.detail))
        except IntegrityError:
            await session.rollback()
            failed.append((slug, "A folder with this name already exists at the destination"))

    await session.commit()
    for f in succeeded:
        await session.refresh(f)
    return succeeded, failed


async def _copy_single_folder_tree(
    session: AsyncSession,
    owner_id: int,
    slug: str,
    target_parent: Folder | None,
    settings: Settings,
) -> Folder:
    """Copy a single folder tree to target_parent. Returns the new root folder."""
    from app.services.files import bulk_copy_files

    source = await get_folder_by_slug(session, owner_id, slug)

    # Use slugified name for the new slug segment
    slug_segment = source.slug.rsplit("/", 1)[-1]

    if target_parent is not None:
        base_depth = target_parent.depth + 1
        base_slug = target_parent.slug + "/" + slug_segment
        parent_id: uuid.UUID | None = target_parent.id
    else:
        base_depth = 0
        base_slug = slug_segment
        parent_id = None

    if base_depth >= settings.max_folder_depth:
        raise HTTPException(status_code=400, detail="FOLDER_DEPTH_EXCEEDED")

    # Collect full subtree
    result = await session.execute(
        text(
            "WITH RECURSIVE subtree AS ("
            "  SELECT id, parent_id, name, slug, depth FROM folders"
            "    WHERE id = :root_id"
            "  UNION ALL"
            "  SELECT f.id, f.parent_id, f.name, f.slug, f.depth FROM folders f"
            "    JOIN subtree s ON f.parent_id = s.id"
            ") SELECT id, parent_id, name, slug, depth FROM subtree ORDER BY depth"
        ),
        {"root_id": source.id},
    )
    subtree_rows = result.fetchall()

    id_mapping: dict[uuid.UUID, uuid.UUID] = {}

    for row in subtree_rows:
        old_id, old_parent_id, name, old_slug, old_depth = row

        if old_id == source.id:
            new_parent_id_inner = parent_id
            new_slug = base_slug
            new_depth = base_depth
        else:
            new_parent_id_inner = id_mapping[old_parent_id]
            new_slug = base_slug + old_slug[len(source.slug):]
            new_depth = old_depth - source.depth + base_depth

        if new_depth >= settings.max_folder_depth:
            raise HTTPException(status_code=400, detail="FOLDER_DEPTH_EXCEEDED")

        new_folder = Folder(
            created_by=owner_id,
            parent_id=new_parent_id_inner,
            name=name,
            slug=new_slug,
            depth=new_depth,
        )
        session.add(new_folder)
        try:
            async with session.begin_nested():
                await session.flush()
        except IntegrityError:
            raise HTTPException(status_code=409, detail="A folder with this name already exists at the destination")
        id_mapping[old_id] = new_folder.id

    # Copy files for each folder in the subtree using bulk_copy_files
    for row in subtree_rows:
        old_folder_id = row[0]
        new_folder_id = id_mapping[old_folder_id]

        files_result = await session.scalars(
            select(File.id).where(
                File.folder_id == old_folder_id,
                File.uploaded_by == owner_id,
            )
        )
        file_ids = list(files_result.all())
        if file_ids:
            new_folder_obj = await session.get(Folder, new_folder_id)
            assert new_folder_obj is not None
            await bulk_copy_files(session, owner_id, file_ids, new_folder_obj.slug)

    root_new_folder = await session.get(Folder, id_mapping[source.id])
    assert root_new_folder is not None
    return root_new_folder
