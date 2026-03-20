"""initial_schema

Revision ID: dc8d933566f4
Revises:
Create Date: 2026-03-20 10:50:44.482704

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'dc8d933566f4'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('telegram_id', sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column('telegram_username', sa.String(), nullable=True),
        sa.Column('telegram_first_name', sa.String(), nullable=True),
        sa.Column('telegram_last_name', sa.String(), nullable=True),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('vault_hash', sa.String(32), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('telegram_id'),
        sa.UniqueConstraint('vault_hash'),
    )
    op.create_index('ix_users_vault_hash', 'users', ['vault_hash'], unique=True)

    op.create_table(
        'telegram_accounts',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('owner_telegram_id', sa.BigInteger(), nullable=False),
        sa.Column('telegram_id', sa.BigInteger(), nullable=False),
        sa.Column('session_string', sa.String(), nullable=False),
        sa.Column('label', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['owner_telegram_id'], ['users.telegram_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('owner_telegram_id', 'telegram_id'),
    )

    op.create_table(
        'channels',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('added_by', sa.BigInteger(), nullable=False),
        sa.Column('telegram_account_id', sa.UUID(), nullable=False),
        sa.Column('channel_id', sa.BigInteger(), nullable=False),
        sa.Column('channel_username', sa.String(), nullable=True),
        sa.Column('label', sa.String(), nullable=True),
        sa.Column('is_global_default', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['added_by'], ['users.telegram_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['telegram_account_id'], ['telegram_accounts.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('added_by', 'channel_id'),
    )

    op.create_table(
        'folders',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_by', sa.BigInteger(), nullable=False),
        sa.Column('parent_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('depth', sa.Integer(), nullable=False),
        sa.Column('icon_image', sa.String(), nullable=True),
        sa.Column('icon_color', sa.String(), nullable=True),
        sa.Column('default_channel_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.telegram_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['folders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['default_channel_id'], ['channels.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug', 'created_by'),
        sa.UniqueConstraint('parent_id', 'name', 'created_by'),
    )

    op.create_table(
        'files',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('uploaded_by', sa.BigInteger(), nullable=False),
        sa.Column('folder_id', sa.UUID(), nullable=True),
        sa.Column('original_name', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('mime_type', sa.String(), nullable=True),
        sa.Column('total_size', sa.BigInteger(), nullable=False),
        sa.Column('file_hash', sa.String(), nullable=False),
        sa.Column('file_unique_id', sa.String(), nullable=True),
        sa.Column('split_count', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.telegram_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['folder_id'], ['folders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_files_uploaded_by_file_hash', 'files', ['uploaded_by', 'file_hash'])

    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_telegram_id', sa.BigInteger(), nullable=False),
        sa.Column('token_hash', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked', sa.Boolean(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_telegram_id'], ['users.telegram_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )

    op.create_table(
        'splits',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('file_id', sa.UUID(), nullable=False),
        sa.Column('channel_id', sa.UUID(), nullable=False),
        sa.Column('telegram_account_id', sa.UUID(), nullable=False),
        sa.Column('message_id', sa.Integer(), nullable=False),
        sa.Column('file_id_tg', sa.String(), nullable=False),
        sa.Column('file_unique_id_tg', sa.String(), nullable=False),
        sa.Column('index', sa.Integer(), nullable=False),
        sa.Column('size', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['file_id'], ['files.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['channel_id'], ['channels.id']),
        sa.ForeignKeyConstraint(['telegram_account_id'], ['telegram_accounts.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('file_id', 'index'),
    )

    op.create_table(
        'events',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('actor_telegram_id', sa.BigInteger(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('target_type', sa.String(), nullable=True),
        sa.Column('target_id', sa.String(), nullable=True),
        sa.Column('metadata', JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['actor_telegram_id'], ['users.telegram_id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('events')
    op.drop_table('splits')
    op.drop_table('refresh_tokens')
    op.drop_index('ix_files_uploaded_by_file_hash', table_name='files')
    op.drop_table('files')
    op.drop_table('folders')
    op.drop_table('channels')
    op.drop_table('telegram_accounts')
    op.drop_index('ix_users_vault_hash', table_name='users')
    op.drop_table('users')
