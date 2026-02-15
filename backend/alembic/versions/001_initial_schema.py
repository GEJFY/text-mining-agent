"""初回スキーマ作成

Revision ID: 001
Revises:
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # datasets テーブル
    op.create_table(
        "datasets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("total_rows", sa.Integer(), default=0),
        sa.Column("text_column", sa.String(100), nullable=True),
        sa.Column("encoding", sa.String(50), default="utf-8"),
        sa.Column("null_rate", sa.Float(), default=0.0),
        sa.Column("char_count_stats", sa.JSON(), default={}),
        sa.Column("column_info", sa.JSON(), default={}),
        sa.Column("status", sa.String(20), default="ready"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    # text_records テーブル
    op.create_table(
        "text_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("dataset_id", sa.String(36), nullable=False, index=True),
        sa.Column("row_index", sa.Integer(), nullable=False),
        sa.Column("text_content", sa.Text(), nullable=False),
        sa.Column("date_value", sa.String(50), nullable=True),
        sa.Column("attributes", sa.JSON(), default={}),
    )

    # analysis_jobs テーブル
    op.create_table(
        "analysis_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("dataset_id", sa.String(36), index=True),
        sa.Column("analysis_type", sa.String(50)),
        sa.Column("parameters", sa.JSON(), default={}),
        sa.Column("result", sa.JSON(), default={}),
        sa.Column("status", sa.String(20), default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("analysis_jobs")
    op.drop_table("text_records")
    op.drop_table("datasets")
