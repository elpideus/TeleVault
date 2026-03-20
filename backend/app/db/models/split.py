import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.db.models.channel import Channel


class Split(Base, TimestampMixin):
    __tablename__ = "splits"
    __table_args__ = (UniqueConstraint("file_id", "index"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("files.id", ondelete="CASCADE")
    )
    channel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("channels.id")
    )
    telegram_account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("telegram_accounts.id")
    )
    message_id: Mapped[int] = mapped_column(Integer)
    file_id_tg: Mapped[str] = mapped_column(String)
    file_unique_id_tg: Mapped[str] = mapped_column(String)
    index: Mapped[int] = mapped_column(Integer)
    size: Mapped[int] = mapped_column(Integer)

    channel: Mapped["Channel"] = relationship("Channel", lazy="raise")
