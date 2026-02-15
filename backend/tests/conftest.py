"""テスト共通フィクスチャ"""

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


@pytest.fixture
async def client():
    """テスト用 httpx AsyncClient を生成"""
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
