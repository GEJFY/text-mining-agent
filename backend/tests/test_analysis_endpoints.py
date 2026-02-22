"""分析エンドポイントテスト

4つの新LLM分析エンドポイント (causal-chain, contradiction, actionability, taxonomy) の
HTTP 200レスポンス形式を検証。analysis_registry.execute をモックして高速テスト。
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.analysis_registry import ToolResult


def _make_tool_result(tool_name: str, data: dict) -> ToolResult:
    """テスト用ToolResult生成"""
    return ToolResult(
        tool_name=tool_name,
        success=True,
        data=data,
        summary=f"{tool_name} completed",
        key_findings=["finding1"],
        evidence_refs=[],
    )


@pytest.mark.asyncio
async def test_causal_chain_endpoint(client):
    """POST /analysis/causal-chain → 200 + 正しいレスポンス形式"""
    mock_result = _make_tool_result(
        "causal_chain_analysis",
        {
            "chains": [{"chain": ["A", "B"], "confidence": 0.9}],
            "total_analyzed": 100,
        },
    )

    with (
        patch("app.api.endpoints.analysis.analysis_cache") as mock_cache,
        patch("app.api.endpoints.analysis._save_analysis_job", new_callable=AsyncMock),
        patch("app.services.analysis_registry.AnalysisToolRegistry.execute", new_callable=AsyncMock) as mock_exec,
    ):
        mock_cache.get = AsyncMock(return_value=None)
        mock_cache.set = AsyncMock()
        mock_exec.return_value = mock_result

        resp = await client.post(
            "/api/v1/analysis/causal-chain",
            json={
                "dataset_id": "ds-001",
                "max_chains": 5,
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "chains" in body
    assert "summary" in body


@pytest.mark.asyncio
async def test_contradiction_endpoint(client):
    """POST /analysis/contradiction → 200 + 正しいレスポンス形式"""
    mock_result = _make_tool_result(
        "contradiction_detection",
        {
            "contradictions": [
                {"statement_a": "A", "statement_b": "B", "contradiction_type": "direct", "confidence": 0.8},
            ],
            "total_analyzed": 50,
        },
    )

    with (
        patch("app.api.endpoints.analysis.analysis_cache") as mock_cache,
        patch("app.api.endpoints.analysis._save_analysis_job", new_callable=AsyncMock),
        patch("app.services.analysis_registry.AnalysisToolRegistry.execute", new_callable=AsyncMock) as mock_exec,
    ):
        mock_cache.get = AsyncMock(return_value=None)
        mock_cache.set = AsyncMock()
        mock_exec.return_value = mock_result

        resp = await client.post(
            "/api/v1/analysis/contradiction",
            json={
                "dataset_id": "ds-001",
                "sensitivity": "medium",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "contradictions" in body


@pytest.mark.asyncio
async def test_actionability_endpoint(client):
    """POST /analysis/actionability → 200 + 正しいレスポンス形式"""
    mock_result = _make_tool_result(
        "actionability_scoring",
        {
            "items": [{"record_id": "r1", "overall": 0.8, "category": "immediate"}],
            "distribution": {"immediate": 1},
            "total_scored": 1,
        },
    )

    with (
        patch("app.api.endpoints.analysis.analysis_cache") as mock_cache,
        patch("app.api.endpoints.analysis._save_analysis_job", new_callable=AsyncMock),
        patch("app.services.analysis_registry.AnalysisToolRegistry.execute", new_callable=AsyncMock) as mock_exec,
    ):
        mock_cache.get = AsyncMock(return_value=None)
        mock_cache.set = AsyncMock()
        mock_exec.return_value = mock_result

        resp = await client.post(
            "/api/v1/analysis/actionability",
            json={
                "dataset_id": "ds-001",
                "context": "テスト",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "items" in body


@pytest.mark.asyncio
async def test_taxonomy_endpoint(client):
    """POST /analysis/taxonomy → 200 + 正しいレスポンス形式"""
    mock_result = _make_tool_result(
        "taxonomy_generation",
        {
            "root_categories": [{"name": "Cat1", "text_count": 10, "children": []}],
            "uncategorized_count": 5,
        },
    )

    with (
        patch("app.api.endpoints.analysis.analysis_cache") as mock_cache,
        patch("app.api.endpoints.analysis._save_analysis_job", new_callable=AsyncMock),
        patch("app.services.analysis_registry.AnalysisToolRegistry.execute", new_callable=AsyncMock) as mock_exec,
    ):
        mock_cache.get = AsyncMock(return_value=None)
        mock_cache.set = AsyncMock()
        mock_exec.return_value = mock_result

        resp = await client.post(
            "/api/v1/analysis/taxonomy",
            json={
                "dataset_id": "ds-001",
                "max_depth": 3,
                "max_categories": 8,
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "root_categories" in body


@pytest.mark.asyncio
async def test_causal_chain_cache_hit(client):
    """キャッシュヒット時はレジストリを呼ばない"""
    cached_response = {
        "success": True,
        "data": {"chains": []},
        "summary": "cached",
        "key_findings": [],
        "error": None,
    }

    with (
        patch("app.api.endpoints.analysis.analysis_cache") as mock_cache,
        patch("app.services.analysis_registry.AnalysisToolRegistry.execute", new_callable=AsyncMock) as mock_exec,
    ):
        mock_cache.get = AsyncMock(return_value=cached_response)

        resp = await client.post(
            "/api/v1/analysis/causal-chain",
            json={
                "dataset_id": "ds-001",
            },
        )

    assert resp.status_code == 200
    mock_exec.assert_not_called()


@pytest.mark.asyncio
async def test_endpoint_failure_response(client):
    """ツール実行失敗時もレスポンスを返す"""
    mock_result = ToolResult(
        tool_name="causal_chain_analysis",
        success=False,
        data={},
        summary="",
        key_findings=[],
        evidence_refs=[],
        error="解析失敗",
    )

    with (
        patch("app.api.endpoints.analysis.analysis_cache") as mock_cache,
        patch("app.services.analysis_registry.AnalysisToolRegistry.execute", new_callable=AsyncMock) as mock_exec,
    ):
        mock_cache.get = AsyncMock(return_value=None)
        mock_cache.set = AsyncMock()
        mock_exec.return_value = mock_result

        resp = await client.post(
            "/api/v1/analysis/causal-chain",
            json={
                "dataset_id": "ds-001",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is False
    assert body["error"] == "解析失敗"
