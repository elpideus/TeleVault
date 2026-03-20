import uuid

from sqlalchemy import BigInteger, ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Folder(Base, TimestampMixin):
    __tablename__ = "folders"
    __table_args__ = (
        UniqueConstraint("slug", "created_by"),
        UniqueConstraint("parent_id", "name", "created_by"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    created_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE")
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String)
    slug: Mapped[str] = mapped_column(String)
    depth: Mapped[int] = mapped_column(Integer, default=0)
    icon_image: Mapped[str | None] = mapped_column(String, nullable=True)
    icon_color: Mapped[str | None] = mapped_column(String, nullable=True)
    default_channel_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("channels.id"), nullable=True
    )
