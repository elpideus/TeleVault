import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ChannelIn(BaseModel):
    telegram_account_id: uuid.UUID
    channel_id: int
    channel_username: str | None = None
    label: str | None = None


class ChannelCreateIn(BaseModel):
    telegram_account_id: uuid.UUID
    title: str
    about: str | None = ""


class ChannelUpdate(BaseModel):
    channel_username: str | None = None
    label: str | None = None


class ChannelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    added_by: int
    telegram_account_id: uuid.UUID
    channel_id: int
    channel_username: str | None
    label: str | None
    is_global_default: bool
    created_at: datetime
