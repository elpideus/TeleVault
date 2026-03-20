import uuid

from sqlalchemy import BigInteger, Boolean, ForeignKey, String, UniqueConstraint, text
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
