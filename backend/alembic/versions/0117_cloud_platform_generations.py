"""Update platform generations for ZX Spectrum and Cloud Gaming platforms

Revision ID: 0117_cloud_platform_generations
Revises: 0116_sigil_title_ids
Create Date: 2026-08-02 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0117_cloud_platform_generations"
down_revision = "0116_sigil_title_ids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ZX Spectrum -> Generation 3
    op.execute(
        "UPDATE platforms SET generation = 3 WHERE id = 50 OR slug = 'zxs' OR fs_slug = 'zxs'"
    )
    # Steam & Xbox Cloud -> Generation 99 (Cloud)
    op.execute(
        "UPDATE platforms SET generation = 99 WHERE id IN (27, 30) OR slug IN ('steam', 'xbox-cloud') OR fs_slug IN ('steam', 'xbox-cloud')"
    )


def downgrade() -> None:
    pass
