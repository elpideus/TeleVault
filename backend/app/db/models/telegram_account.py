import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class TelegramAccount(Base, TimestampMixin):
    __tablename__ = "telegram_accounts"
    __table_args__ = (UniqueConstraint("owner_telegram_id", "telegram_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    owner_telegram_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE")
    )
    telegram_id: Mapped[int] = mapped_column(BigInteger)
    session_string: Mapped[str] = mapped_column(String)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    session_error: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
