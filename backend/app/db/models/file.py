import uuid

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

# Lifecycle values for File.status
FILE_STATUS_PENDING = "pending"
FILE_STATUS_COMPLETE = "complete"
FILE_STATUS_FAILED = "failed"


class File(Base, TimestampMixin):
    __tablename__ = "files"
    __table_args__ = (Index("ix_files_uploaded_by_file_hash", "uploaded_by", "file_hash"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    uploaded_by: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id", ondelete="CASCADE")
    )
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), nullable=True
    )
    original_name: Mapped[str] = mapped_column(String)
    name: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    mime_type: Mapped[str | None] = mapped_column(String, nullable=True)
    total_size: Mapped[int] = mapped_column(BigInteger)
    file_hash: Mapped[str] = mapped_column(String)
    file_unique_id: Mapped[str | None] = mapped_column(String, nullable=True)
    split_count: Mapped[int] = mapped_column(Integer, default=1)
    # "pending" while uploading to Telegram, "complete" on success, "failed" on error
    status: Mapped[str] = mapped_column(String, nullable=False, default=FILE_STATUS_COMPLETE)
