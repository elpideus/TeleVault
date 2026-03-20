import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class FileUploadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    operation_id: str
    file_id: uuid.UUID
    original_name: str
    total_size: int
    split_count: int
    folder_id: Optional[uuid.UUID]


class FileUpdate(BaseModel):
    name: Optional[str] = None


class FileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    uploaded_by: int
    folder_id: Optional[uuid.UUID]
    original_name: str
    name: Optional[str]
    mime_type: str | None
    total_size: int
    file_hash: str
    split_count: int
    status: str
    created_at: datetime


class FileFetchBody(BaseModel):
    ids: list[uuid.UUID]


class BulkDeleteFileBody(BaseModel):
    ids: list[uuid.UUID]


class BulkMoveFileBody(BaseModel):
    ids: list[uuid.UUID]
    target_folder_slug: Optional[str] = None

    @field_validator("target_folder_slug", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        return None if v == "" or v is None else v


class BulkCopyFileBody(BaseModel):
    ids: list[uuid.UUID]
    target_folder_slug: Optional[str] = None

    @field_validator("target_folder_slug", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        return None if v == "" or v is None else v


class BulkItemFailure(BaseModel):
    id: str  # UUID string for files, slug string for folders
    error: str


class BulkFileResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    succeeded: list[FileOut]
    failed: list[BulkItemFailure]


class BulkDeleteFileResult(BaseModel):
    succeeded: list[str]  # UUID strings
    failed: list[BulkItemFailure]


class FileStatsOut(BaseModel):
    total_size: int
    file_count: int
