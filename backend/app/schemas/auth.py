import uuid

from pydantic import BaseModel, ConfigDict


class PhoneLoginIn(BaseModel):
    phone: str


class OTPSubmitIn(BaseModel):
    phone: str
    code: str
    password: str | None = None


class QRPollIn(BaseModel):
    poll_token: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    vault_hash: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    telegram_id: int
    telegram_username: str | None
    telegram_first_name: str | None
    role: str
    vault_hash: str


class TelegramAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    telegram_id: int
    label: str | None
    is_active: bool
