"""create repo_explanations table

Revision ID: 001
Revises:
Create Date: 2025-01-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "repo_explanations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner", sa.String(length=255), nullable=False),
        sa.Column("repo_name", sa.String(length=255), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("directory_hash", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_repo_explanations_id"), "repo_explanations", ["id"], unique=False)
    op.create_index(op.f("ix_repo_explanations_owner"), "repo_explanations", ["owner"], unique=False)
    op.create_index(op.f("ix_repo_explanations_repo_name"), "repo_explanations", ["repo_name"], unique=False)
    op.create_index(op.f("ix_repo_explanations_expires_at"), "repo_explanations", ["expires_at"], unique=False)
    op.create_index("idx_owner_repo", "repo_explanations", ["owner", "repo_name"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("idx_owner_repo", table_name="repo_explanations")
    op.drop_index(op.f("ix_repo_explanations_expires_at"), table_name="repo_explanations")
    op.drop_index(op.f("ix_repo_explanations_repo_name"), table_name="repo_explanations")
    op.drop_index(op.f("ix_repo_explanations_owner"), table_name="repo_explanations")
    op.drop_index(op.f("ix_repo_explanations_id"), table_name="repo_explanations")
    op.drop_table("repo_explanations")
