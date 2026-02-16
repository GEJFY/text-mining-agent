"""データセット一覧ページネーションのテスト"""

import pytest
from httpx import AsyncClient


class TestDatasetPagination:
    """GET /api/v1/data/datasets ページネーション検証"""

    @pytest.mark.asyncio
    async def test_datasets_returns_pagination_fields(self, client: AsyncClient) -> None:
        """レスポンスにtotal/offset/limit/datasetsが含まれること"""
        res = await client.get("/api/v1/data/datasets")
        assert res.status_code == 200
        data = res.json()
        assert "total" in data
        assert "offset" in data
        assert "limit" in data
        assert "datasets" in data
        assert isinstance(data["datasets"], list)

    @pytest.mark.asyncio
    async def test_datasets_default_pagination(self, client: AsyncClient) -> None:
        """デフォルトはoffset=0, limit=50"""
        res = await client.get("/api/v1/data/datasets")
        data = res.json()
        assert data["offset"] == 0
        assert data["limit"] == 50

    @pytest.mark.asyncio
    async def test_datasets_custom_offset_limit(self, client: AsyncClient) -> None:
        """カスタムoffset/limitが反映されること"""
        res = await client.get("/api/v1/data/datasets?offset=10&limit=5")
        assert res.status_code == 200
        data = res.json()
        assert data["offset"] == 10
        assert data["limit"] == 5

    @pytest.mark.asyncio
    async def test_datasets_empty_db_returns_zero_total(self, client: AsyncClient) -> None:
        """空DBではtotal=0、datasets=[]であること"""
        res = await client.get("/api/v1/data/datasets")
        data = res.json()
        assert data["total"] == 0
        assert data["datasets"] == []
