"""Add saved and app_settings

Revision ID: 5a1b2c3d4e5f
Revises: 32e312a97eed
Create Date: 2026-10-04 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '5a1b2c3d4e5f'
down_revision: Union[str, Sequence[str], None] = '32e312a97eed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('saved', sa.Boolean(), server_default='false', nullable=True))
    op.create_index(op.f('ix_tasks_saved'), 'tasks', ['saved'], unique=False)
    op.add_column('tasks', sa.Column('saved_at', sa.DateTime(timezone=True), nullable=True))
    
    op.create_table('app_settings',
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('value', sa.Text(), server_default='', nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('key')
    )


def downgrade() -> None:
    op.drop_table('app_settings')
    op.drop_column('tasks', 'saved_at')
    op.drop_index(op.f('ix_tasks_saved'), table_name='tasks')
    op.drop_column('tasks', 'saved')
