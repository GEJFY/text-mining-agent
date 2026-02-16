"""認証エンドポイントのテスト

- POST /api/v1/auth/register
- POST /api/v1/auth/login
- GET /api/v1/auth/me
- 認証なしリクエストの401テスト
"""

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def raw_client():
    """認証オーバーライドなしのクライアント（401テスト用）"""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.core.config import settings
    from app.core.database import get_db
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
    # get_current_user はオーバーライドしない

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.pop(get_db, None)
    await test_engine.dispose()


class TestAuthRegisterLogin:
    """ユーザー登録・ログインフローのテスト"""

    @pytest.mark.asyncio
    async def test_register_and_login(self, raw_client: AsyncClient) -> None:
        """登録→ログインの一連フローが成功すること"""
        # 登録
        reg_res = await raw_client.post(
            "/api/v1/auth/register",
            json={"email": "test@example.com", "password": "secret123", "display_name": "Test User"},
        )
        assert reg_res.status_code == 201
        reg_data = reg_res.json()
        assert "access_token" in reg_data
        assert reg_data["display_name"] == "Test User"

        # ログイン
        login_res = await raw_client.post(
            "/api/v1/auth/login",
            json={"email": "test@example.com", "password": "secret123"},
        )
        assert login_res.status_code == 200
        login_data = login_res.json()
        assert "access_token" in login_data

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, raw_client: AsyncClient) -> None:
        """同じメールアドレスでの二重登録が409になること"""
        body = {"email": "dup@example.com", "password": "pass123", "display_name": "Dup"}
        res1 = await raw_client.post("/api/v1/auth/register", json=body)
        assert res1.status_code == 201

        res2 = await raw_client.post("/api/v1/auth/register", json=body)
        assert res2.status_code == 409

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, raw_client: AsyncClient) -> None:
        """誤パスワードでログインすると401になること"""
        await raw_client.post(
            "/api/v1/auth/register",
            json={"email": "wrong@example.com", "password": "correct", "display_name": "User"},
        )
        res = await raw_client.post(
            "/api/v1/auth/login",
            json={"email": "wrong@example.com", "password": "incorrect"},
        )
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_me_with_token(self, raw_client: AsyncClient) -> None:
        """有効トークンで /auth/me がユーザー情報を返すこと"""
        reg_res = await raw_client.post(
            "/api/v1/auth/register",
            json={"email": "me@example.com", "password": "pass123", "display_name": "Me User"},
        )
        token = reg_res.json()["access_token"]

        me_res = await raw_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["email"] == "me@example.com"
        assert me_data["display_name"] == "Me User"


class TestAuthRequired:
    """認証なしリクエストが401を返すことの検証"""

    @pytest.mark.asyncio
    async def test_dashboard_requires_auth(self, raw_client: AsyncClient) -> None:
        """ダッシュボードは認証が必要"""
        res = await raw_client.get("/api/v1/dashboard/summary")
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_datasets_requires_auth(self, raw_client: AsyncClient) -> None:
        """データセット一覧は認証が必要"""
        res = await raw_client.get("/api/v1/data/datasets")
        assert res.status_code == 401
