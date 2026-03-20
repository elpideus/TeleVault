import uuid
from datetime import datetime

from pydantic import BaseModel


class SearchResultItem(BaseModel):
    type: str
    id: uuid.UUID
    name: str
    slug: str | None
    folder_id: uuid.UUID | None
    folder_slug: str | None
    created_at: datetime
    extra: dict


class SearchOut(BaseModel):
    items: list[SearchResultItem]
    total: int
    query: str
    page: int
    page_size: int
