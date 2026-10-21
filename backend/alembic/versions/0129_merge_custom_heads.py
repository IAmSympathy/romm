"""merge custom cloud platform generations with upstream

Revision ID: 0129_merge_custom_heads
Revises: 0129_rom_files_mtime_double, 0118_rom_category_cheat_pg
"""

revision = "0129_merge_custom_heads"
down_revision = (
    "0129_rom_files_mtime_double",
    "0118_rom_category_cheat_pg",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
