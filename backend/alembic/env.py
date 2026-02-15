"""Alembic env.py - 非同期マイグレーション対応

asyncpg + SQLAlchemy 2.0 async engine を使用。
DB URLは .env の NEXUSTEXT_DATABASE_URL から取得。
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Alembic Config
config = context.config

# ロギング設定
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ORMメタデータ（autogenerate用）
from app.models.orm import Base  # noqa: E402

target_metadata = Base.metadata

# .env から DB URL を取得して alembic.ini の値を上書き
from app.core.config import settings  # noqa: E402

config.set_main_option("sqlalchemy.url", settings.database_url)


def run_migrations_offline() -> None:
    """オフラインモード: SQL出力のみ（DB接続なし）"""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    """マイグレーション実行（sync context）"""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """非同期エンジンでマイグレーション実行"""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """オンラインモード: 非同期エンジンで実行"""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
