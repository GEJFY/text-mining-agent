"""APIエンドポイントのテスト

httpx AsyncClient を使用して以下を検証:
- ヘルスチェックエンドポイント (GET /health)
- API v1 ヘルスチェック (GET /api/v1/health)
- データインポートエンドポイント (POST /api/v1/data/import)
"""

import io
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.models.schemas import DataImportResponse


# =============================================================================
# ヘルスチェックテスト
# =============================================================================
class TestHealthEndpoint:
    """ヘルスチェックエンドポイントのテスト"""

    @pytest.mark.asyncio
    async def test_root_health_check(self, client: AsyncClient) -> None:
        """ルートヘルスチェックが正常レスポンスを返すこと"""
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["version"] == "7.0.0"

    @pytest.mark.asyncio
    async def test_api_v1_health_check(self, client: AsyncClient) -> None:
        """API v1 ヘルスチェックが正常レスポンスを返すこと"""
        response = await client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "cloud_provider" in data

    @pytest.mark.asyncio
    async def test_health_response_content_type(self, client: AsyncClient) -> None:
        """ヘルスチェックがJSON形式で返されること"""
        response = await client.get("/health")
        assert response.headers["content-type"] == "application/json"

    @pytest.mark.asyncio
    async def test_health_cloud_provider_value(self, client: AsyncClient) -> None:
        """ヘルスチェックでcloud_providerが返されること"""
        response = await client.get("/api/v1/health")
        data = response.json()
        assert data["cloud_provider"] in ("local", "aws", "azure", "gcp")


# =============================================================================
# データインポートエンドポイントテスト
# =============================================================================
class TestDataImportEndpoint:
    """データインポートエンドポイントのテスト"""

    @pytest.mark.asyncio
    async def test_import_csv_file(self, client: AsyncClient) -> None:
        """CSVファイルのインポートが受け付けられること"""
        mock_response = DataImportResponse(
            dataset_id="test-dataset-001",
            total_rows=3,
            null_rate=0.0,
            char_count_stats={"mean": 10.0, "min": 5.0, "max": 15.0},
            unique_values={"text": 3},
            preview=[
                {"text": "サンプル1"},
                {"text": "サンプル2"},
                {"text": "サンプル3"},
            ],
        )

        with patch(
            "app.api.endpoints.data.data_import_service.import_file",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            csv_content = "text\nサンプル1\nサンプル2\nサンプル3"
            files = {
                "file": ("test.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv"),
            }
            response = await client.post("/api/v1/data/import", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["dataset_id"] == "test-dataset-001"
        assert data["total_rows"] == 3

    @pytest.mark.asyncio
    async def test_import_with_encoding(self, client: AsyncClient) -> None:
        """エンコーディング指定付きインポートが動作すること"""
        mock_response = DataImportResponse(
            dataset_id="test-dataset-002",
            total_rows=1,
            null_rate=0.0,
            char_count_stats={"mean": 5.0},
            unique_values={"text": 1},
            preview=[{"text": "テスト"}],
        )

        with patch(
            "app.api.endpoints.data.data_import_service.import_file",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            csv_content = "text\nテスト"
            files = {
                "file": ("test.csv", io.BytesIO(csv_content.encode("shift_jis")), "text/csv"),
            }
            data_fields = {"encoding": "shift_jis"}
            response = await client.post("/api/v1/data/import", files=files, data=data_fields)

        assert response.status_code == 200
        data = response.json()
        assert data["dataset_id"] == "test-dataset-002"

    @pytest.mark.asyncio
    async def test_import_with_column_mappings(self, client: AsyncClient) -> None:
        """カラムマッピング付きインポートが動作すること"""
        mock_response = DataImportResponse(
            dataset_id="test-dataset-003",
            total_rows=2,
            null_rate=0.0,
            char_count_stats={"mean": 8.0},
            unique_values={"content": 2},
            preview=[{"content": "データ1"}, {"content": "データ2"}],
        )

        with patch(
            "app.api.endpoints.data.data_import_service.import_file",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            csv_content = "content,date\nデータ1,2024-01-01\nデータ2,2024-01-02"
            files = {
                "file": (
                    "test.csv",
                    io.BytesIO(csv_content.encode("utf-8")),
                    "text/csv",
                ),
            }
            import json

            mappings = json.dumps(
                [
                    {"column_name": "content", "role": "text"},
                    {"column_name": "date", "role": "date"},
                ]
            )
            data_fields = {"column_mappings": mappings}
            response = await client.post("/api/v1/data/import", files=files, data=data_fields)

        assert response.status_code == 200
        data = response.json()
        assert data["dataset_id"] == "test-dataset-003"
        assert data["total_rows"] == 2

    @pytest.mark.asyncio
    async def test_import_missing_file_returns_422(self, client: AsyncClient) -> None:
        """ファイル未指定でインポートすると422エラーになること"""
        response = await client.post("/api/v1/data/import")
        assert response.status_code == 422


# =============================================================================
# エラーハンドリングテスト
# =============================================================================
class TestErrorHandling:
    """エラーハンドリングのテスト"""

    @pytest.mark.asyncio
    async def test_not_found_endpoint(self, client: AsyncClient) -> None:
        """存在しないエンドポイントで404が返されること"""
        response = await client.get("/api/v1/nonexistent")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_method_not_allowed(self, client: AsyncClient) -> None:
        """不正なHTTPメソッドで405が返されること"""
        response = await client.delete("/health")
        assert response.status_code == 405

    @pytest.mark.asyncio
    async def test_datasets_list(self, client: AsyncClient) -> None:
        """データセット一覧エンドポイントが動作すること"""
        response = await client.get("/api/v1/data/datasets")
        assert response.status_code == 200
        data = response.json()
        assert "datasets" in data
