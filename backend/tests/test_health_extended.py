"""拡張ヘルスチェックエンドポイントのテスト

/health/live と /health/ready の動作検証。
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient


class TestLivenessEndpoint:
    """Kubernetes liveness probe のテスト"""

    @pytest.mark.asyncio
    async def test_root_liveness(self, client: AsyncClient) -> None:
        """ルートレベル /health/live が正常応答すること"""
        response = await client.get("/health/live")
        assert response.status_code == 200
        assert response.json()["status"] == "alive"

    @pytest.mark.asyncio
    async def test_api_v1_liveness(self, client: AsyncClient) -> None:
        """API v1 /health/live が正常応答すること"""
        response = await client.get("/api/v1/health/live")
        assert response.status_code == 200
        assert response.json()["status"] == "alive"


class TestReadinessEndpoint:
    """Kubernetes readiness probe のテスト"""

    @pytest.mark.asyncio
    async def test_readiness_all_ok(self, client: AsyncClient) -> None:
        """全チェック成功時に status=ready が返ること"""
        # DB mock
        mock_conn = AsyncMock()
        mock_engine = AsyncMock()
        mock_engine.connect.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_engine.connect.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_engine.dispose = AsyncMock()

        # Redis mock
        mock_redis = AsyncMock()
        mock_redis.ping = AsyncMock()
        mock_redis.close = AsyncMock()

        # LLM provider mock
        mock_provider = MagicMock()
        mock_provider.health_check = AsyncMock(return_value=True)
        mock_provider.provider_name = "direct"

        with (
            patch("sqlalchemy.ext.asyncio.create_async_engine", return_value=mock_engine),
            patch("redis.asyncio.from_url", return_value=mock_redis),
            patch("app.services.llm_providers.get_llm_provider", return_value=mock_provider),
        ):
            response = await client.get("/api/v1/health/ready")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert data["checks"]["database"] == "ok"
        assert data["checks"]["redis"] == "ok"
        assert data["checks"]["llm_provider"] == "ok"

    @pytest.mark.asyncio
    async def test_readiness_db_failure(self, client: AsyncClient) -> None:
        """DB接続失敗時に status=degraded が返ること"""
        mock_engine = AsyncMock()
        mock_engine.connect.side_effect = Exception("Connection refused")
        mock_engine.dispose = AsyncMock()

        mock_redis = AsyncMock()
        mock_redis.ping = AsyncMock()
        mock_redis.close = AsyncMock()

        mock_provider = MagicMock()
        mock_provider.health_check = AsyncMock(return_value=True)
        mock_provider.provider_name = "direct"

        with (
            patch("sqlalchemy.ext.asyncio.create_async_engine", return_value=mock_engine),
            patch("redis.asyncio.from_url", return_value=mock_redis),
            patch("app.services.llm_providers.get_llm_provider", return_value=mock_provider),
        ):
            response = await client.get("/api/v1/health/ready")

        data = response.json()
        assert data["status"] == "degraded"
        assert "error" in data["checks"]["database"]
