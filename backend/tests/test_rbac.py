"""RBACロール制御のテスト

require_role() が正しく403を返すことを検証。
"""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient


def _make_user(role: str):
    """指定ロールのダミーユーザーを返す"""
    from app.core.security import TokenData, UserRole

    return TokenData(
        user_id="test-user-001",
        role=UserRole(role),
        tenant_id="test-tenant",
        exp=datetime.now(UTC) + timedelta(hours=1),
    )


@pytest.fixture
async def viewer_client():
    """VIEWERロールのクライアント"""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.core.config import settings
    from app.core.database import get_db
    from app.core.security import get_current_user
    from app.main import app
    from app.models.orm import Base

    test_engine = create_async_engine(settings.database_url, echo=False)
    test_session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def _test_get_db():
        async with test_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _test_get_db
    app.dependency_overrides[get_current_user] = lambda: _make_user("viewer")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    await test_engine.dispose()


class TestRBAC:
    """VIEWERロールが制限されたエンドポイントにアクセスできないことを検証"""

    @pytest.mark.asyncio
    async def test_viewer_cannot_start_agent(self, viewer_client: AsyncClient) -> None:
        """VIEWERはエージェント起動が403"""
        res = await viewer_client.post(
            "/api/v1/agent/start",
            json={"dataset_id": "ds-1", "objective": "test", "hitl_mode": "auto"},
        )
        assert res.status_code == 403

    @pytest.mark.asyncio
    async def test_viewer_cannot_generate_report(self, viewer_client: AsyncClient) -> None:
        """VIEWERはレポート生成が403"""
        res = await viewer_client.post(
            "/api/v1/reports/generate",
            json={
                "dataset_id": "ds-1",
                "template": "voc",
                "output_format": "pdf",
            },
        )
        assert res.status_code == 403

    @pytest.mark.asyncio
    async def test_viewer_can_access_dashboard(self, viewer_client: AsyncClient) -> None:
        """VIEWERはダッシュボードにアクセス可能（認証のみ）"""
        res = await viewer_client.get("/api/v1/dashboard/summary")
        assert res.status_code == 200

    @pytest.mark.asyncio
    async def test_viewer_can_list_datasets(self, viewer_client: AsyncClient) -> None:
        """VIEWERはデータセット一覧にアクセス可能（認証のみ）"""
        res = await viewer_client.get("/api/v1/data/datasets")
        assert res.status_code == 200
