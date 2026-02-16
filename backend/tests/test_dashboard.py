"""ダッシュボードサマリーエンドポイントのテスト"""

import pytest
from httpx import AsyncClient


class TestDashboardSummary:
    """GET /api/v1/dashboard/summary"""

    @pytest.mark.asyncio
    async def test_summary_returns_kpi(self, client: AsyncClient) -> None:
        """サマリーにKPIフィールドが含まれること"""
        res = await client.get("/api/v1/dashboard/summary")
        assert res.status_code == 200
        data = res.json()
        assert "kpi" in data
        kpi = data["kpi"]
        assert "dataset_count" in kpi
        assert "record_count" in kpi
        assert "total_jobs" in kpi

    @pytest.mark.asyncio
    async def test_summary_returns_recent_activity(self, client: AsyncClient) -> None:
        """サマリーにrecent_activityリストが含まれること"""
        res = await client.get("/api/v1/dashboard/summary")
        assert res.status_code == 200
        data = res.json()
        assert "recent_activity" in data
        assert isinstance(data["recent_activity"], list)

    @pytest.mark.asyncio
    async def test_summary_returns_recent_datasets(self, client: AsyncClient) -> None:
        """サマリーにrecent_datasetsリストが含まれること"""
        res = await client.get("/api/v1/dashboard/summary")
        assert res.status_code == 200
        data = res.json()
        assert "recent_datasets" in data
        assert isinstance(data["recent_datasets"], list)

    @pytest.mark.asyncio
    async def test_summary_kpi_zero_on_empty_db(self, client: AsyncClient) -> None:
        """空DBではKPIが全て0であること"""
        res = await client.get("/api/v1/dashboard/summary")
        assert res.status_code == 200
        kpi = res.json()["kpi"]
        assert kpi["dataset_count"] == 0
        assert kpi["record_count"] == 0
        assert kpi["total_jobs"] == 0
