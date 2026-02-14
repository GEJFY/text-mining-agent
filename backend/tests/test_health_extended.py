"""拡張ヘルスチェックエンドポイントのテスト

/health/live と /health/ready の動作検証。
"""

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
    async def test_readiness_returns_200(self, client: AsyncClient) -> None:
        """readiness エンドポイントが200で返ること"""
        response = await client.get("/api/v1/health/ready")
        assert response.status_code == 200
        data = response.json()
        # ステータスは ready または degraded (依存サービスの状態による)
        assert data["status"] in ("ready", "degraded")
        assert "version" in data
        assert "checks" in data
        assert "database" in data["checks"]
        assert "redis" in data["checks"]
        assert "llm_provider" in data["checks"]

    @pytest.mark.asyncio
    async def test_readiness_root_returns_200(self, client: AsyncClient) -> None:
        """ルートレベル /health/ready が200で返ること"""
        response = await client.get("/health/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ("ready", "degraded")
        assert "checks" in data
