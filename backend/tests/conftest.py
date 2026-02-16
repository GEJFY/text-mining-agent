"""テスト共通フィクスチャ"""

from datetime import UTC, datetime, timedelta

import pytest


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """各テスト前にレートリミッターのバケットをリセット"""
    try:
        from app.main import app
        from app.middleware.rate_limit import RateLimitMiddleware

        mw = getattr(app, "middleware_stack", None)
        while mw is not None:
            if isinstance(mw, RateLimitMiddleware):
                mw._buckets.clear()
                break
            mw = getattr(mw, "app", None)
    except ImportError:
        pass
    yield


def _mock_current_user():
    """テスト用のダミーユーザーを返す"""
    from app.core.security import TokenData, UserRole

    return TokenData(
        user_id="test-user-001",
        role=UserRole.ANALYST,
        tenant_id="test-tenant",
        exp=datetime.now(UTC) + timedelta(hours=1),
    )


@pytest.fixture
async def client():
    """テスト用 httpx AsyncClient を生成

    lifespanイベントはASGITransportでは実行されないため、
    テスト用エンジンでテーブルを作成し、get_dbとget_current_userをオーバーライドする。
    """
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.core.config import settings
    from app.core.database import get_db
    from app.core.security import get_current_user
    from app.main import app
    from app.models.orm import Base

    # テスト用エンジンを現在のevent loopで作成
    test_engine = create_async_engine(settings.database_url, echo=False)
    test_session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    # テーブル作成
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # get_db依存をテスト用セッションでオーバーライド
    async def _test_get_db():
        async with test_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _test_get_db
    app.dependency_overrides[get_current_user] = _mock_current_user

    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    # クリーンアップ
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    await test_engine.dispose()
