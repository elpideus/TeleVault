"""add_multi_account_fields

Revision ID: ef22ebcb59b6
Revises: dc8d933566f4
Create Date: 2026-03-21 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'ef22ebcb59b6'
down_revision: Union[str, None] = 'dc8d933566f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("telegram_accounts", sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("telegram_accounts", sa.Column("last_checked_at", sa.DateTime(), nullable=True))
    op.add_column("telegram_accounts", sa.Column("session_error", sa.String(), nullable=True))

    # Backfill: primary accounts are those where the account IS the owner
    op.execute(
        "UPDATE telegram_accounts SET is_primary = TRUE "
        "WHERE telegram_id = owner_telegram_id"
    )


def downgrade() -> None:
    op.drop_column("telegram_accounts", "session_error")
    op.drop_column("telegram_accounts", "last_checked_at")
    op.drop_column("telegram_accounts", "is_primary")
