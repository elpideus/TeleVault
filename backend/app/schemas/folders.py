import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.files import BulkItemFailure


class FolderIn(BaseModel):
    parent_slug: str | None = None
    name: str
    icon_color: str | None = None
    default_channel_id: uuid.UUID | None = None


class FolderUpdate(BaseModel):
    name: str | None = None
    icon_color: str | None = None
    icon_image: str | None = None
    default_channel_id: uuid.UUID | None = None


class FolderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_by: int
    parent_id: uuid.UUID | None
    name: str
    slug: str
    depth: int
    icon_image: str | None
    icon_color: str | None
    default_channel_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    file_count: int = 0
    subfolder_count: int = 0
    total_size: int = 0


class FolderFetchBody(BaseModel):
    slugs: list[str]


class BulkDeleteFolderBody(BaseModel):
    slugs: list[str]


class BulkMoveFolderBody(BaseModel):
    slugs: list[str]
    target_parent_slug: Optional[str] = None


class BulkCopyFolderBody(BaseModel):
    slugs: list[str]
    target_parent_slug: Optional[str] = None


class BulkFolderResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    succeeded: list[FolderOut]
    failed: list[BulkItemFailure]


class BulkDeleteFolderResult(BaseModel):
    succeeded: list[str]  # slugs
    failed: list[BulkItemFailure]
