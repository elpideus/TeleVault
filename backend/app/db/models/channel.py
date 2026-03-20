import uuid

from sqlalchemy import BigInteger, Boolean, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Channel(Base, TimestampMixin):
    __tablename__ = "channels"
    __table_args__ = (UniqueConstraint("added_by", "channel_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    added_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE")
    )
    telegram_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("telegram_accounts.id")
    )
    channel_id: Mapped[int] = mapped_column(BigInteger)
    channel_username: Mapped[str | None] = mapped_column(String, nullable=True)
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    is_global_default: Mapped[bool] = mapped_column(Boolean, default=False)
