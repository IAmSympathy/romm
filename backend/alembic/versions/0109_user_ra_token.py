"""user_ra_token

Revision ID: 0109_user_ra_token
Revises: 0108_cloud_platform_generations
Create Date: 2026-08-03 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0109_user_ra_token"
down_revision = "0108_cloud_platform_generations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add ra_token column to users table."""
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("ra_token", sa.String(length=255), nullable=True, server_default="")
        )


def downgrade() -> None:
    """Remove ra_token column from users table."""
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("ra_token", if_exists=True)
