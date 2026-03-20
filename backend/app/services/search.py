import uuid

from sqlalchemy import BigInteger, String, func, literal, null, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.file import File
from app.db.models.folder import Folder
from app.db.models.split import Split
from app.schemas.search import SearchOut, SearchResultItem


async def search(
    session: AsyncSession,
    owner_id: int,
    query: str,
    type: str | None,
    folder_slug: str | None,
    channel_id: uuid.UUID | None,
    sort: str,
    order: str,
    page: int,
    page_size: int,
) -> SearchOut:
    # Resolve folder_slug to folder_id if provided
    folder_id: uuid.UUID | None = None
    if folder_slug is not None:
        result = await session.execute(
            select(Folder.id).where(
                Folder.slug == folder_slug,
                Folder.created_by == owner_id,
            )
        )
        row = result.scalar_one_or_none()
        if row is not None:
            folder_id = row

    # File subquery
    file_q = (
        select(
            literal("file").cast(String).label("type"),
            File.id.label("id"),
            func.coalesce(File.name, File.original_name).label("name"),
            null().cast(String).label("slug"),
            File.folder_id.label("folder_id"),
            File.total_size.cast(BigInteger).label("size"),
            File.created_at.label("created_at"),
        )
        .where(
            File.uploaded_by == owner_id,
            or_(
                File.original_name.ilike(f"%{query}%"),
                File.name.ilike(f"%{query}%"),
            ),
        )
    )

    if folder_id is not None:
        file_q = file_q.where(File.folder_id == folder_id)

    if channel_id is not None:
        file_q = file_q.where(
            File.id.in_(
                select(Split.file_id).where(Split.channel_id == channel_id).distinct()
            )
        )

    # Folder subquery
    folder_q = (
        select(
            literal("folder").cast(String).label("type"),
            Folder.id.label("id"),
            Folder.name.label("name"),
            Folder.slug.cast(String).label("slug"),
            Folder.parent_id.label("folder_id"),
            null().cast(BigInteger).label("size"),
            Folder.created_at.label("created_at"),
        )
        .where(
            Folder.created_by == owner_id,
            Folder.name.ilike(f"%{query}%"),
        )
    )

    if folder_id is not None:
        folder_q = folder_q.where(Folder.parent_id == folder_id)

    # Apply type filter before union
    if type == "file":
        combined = file_q.subquery()
    elif type == "folder":
        combined = folder_q.subquery()
    else:
        combined = union_all(file_q, folder_q).subquery()

    # Count total
    count_result = await session.execute(
        select(func.count()).select_from(combined)
    )
    total = count_result.scalar_one()

    # Sort column
    if sort == "name":
        sort_col = combined.c.name
    elif sort == "size":
        sort_col = combined.c.size
    else:  # created_at default
        sort_col = combined.c.created_at

    if order == "asc":
        sort_expr = sort_col.asc().nulls_last()
    else:
        sort_expr = sort_col.desc().nulls_last()

    rows_result = await session.execute(
        select(combined)
        .order_by(sort_expr)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = rows_result.fetchall()

    # Resolve folder slugs for results
    folder_ids = {row.folder_id for row in rows if row.folder_id is not None}
    folder_slug_map: dict[uuid.UUID, str | None] = {}
    if folder_ids:
        slug_result = await session.execute(
            select(Folder.id, Folder.slug).where(Folder.id.in_(list(folder_ids)))
        )
        for fid, fslug in slug_result:
            folder_slug_map[fid] = fslug

    items = []
    for row in rows:
        extra: dict = {}
        if row.type == "file":
            extra["size"] = row.size
        items.append(
            SearchResultItem(
                type=row.type,
                id=row.id,
                name=row.name,
                slug=row.slug,
                folder_id=row.folder_id,
                folder_slug=folder_slug_map.get(row.folder_id) if row.folder_id else None,
                created_at=row.created_at,
                extra=extra,
            )
        )

    return SearchOut(
        items=items,
        total=total,
        query=query,
        page=page,
        page_size=page_size,
    )
