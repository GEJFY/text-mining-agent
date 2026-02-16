"""Prometheusメトリクスエンドポイントのテスト"""

import pytest
from httpx import AsyncClient


class TestPrometheusMetrics:
    """GET /metrics"""

    @pytest.mark.asyncio
    async def test_metrics_returns_200(self, client: AsyncClient) -> None:
        """メトリクスエンドポイントが200を返すこと"""
        res = await client.get("/metrics")
        assert res.status_code == 200

    @pytest.mark.asyncio
    async def test_metrics_content_type(self, client: AsyncClient) -> None:
        """Content-TypeがPrometheus形式であること"""
        res = await client.get("/metrics")
        assert "text/plain" in res.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_metrics_contains_python_info(self, client: AsyncClient) -> None:
        """デフォルトのpython_info メトリクスが含まれること"""
        res = await client.get("/metrics")
        assert "python_info" in res.text
