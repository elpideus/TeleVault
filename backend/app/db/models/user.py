from sqlalchemy import BigInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    telegram_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    telegram_username: Mapped[str | None] = mapped_column(String, nullable=True)
    telegram_first_name: Mapped[str | None] = mapped_column(String, nullable=True)
    telegram_last_name: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, default="user")
    vault_hash: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True, index=True)
