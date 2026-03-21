from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TelegramAltAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telegram_id: int
    label: str | None
    is_active: bool
    last_checked_at: datetime | None
    session_error: str | None


class AddAccountPhoneIn(BaseModel):
    phone: str


class AddAccountOTPIn(BaseModel):
    phone: str
    code: str
    password: str | None = None


class AddAccountResponse(BaseModel):
    account: TelegramAltAccountOut
    enrollment_failures: list[dict]  # [{channel_id: str, error: str}]


class QRPollResponse(BaseModel):
    status: str  # "pending" | "complete" | "error"
    message: str | None = None
    account: TelegramAltAccountOut | None = None
    enrollment_failures: list[dict] | None = None
