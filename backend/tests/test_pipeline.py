"""Sprint 9: パイプラインテスト"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.schemas import PipelineRequest


@pytest.fixture
async def seeded_client(client, request):
    """テスト用データセットを投入済みクライアント"""
    from sqlalchemy import select

    from app.core.database import get_db
    from app.main import app
    from app.models.orm import Dataset, TextRecord

    ds_id = f"ds-pipe-{request.node.name[:20]}"

    db_gen = app.dependency_overrides[get_db]()
    db = await db_gen.__anext__()

    existing = await db.execute(select(Dataset).where(Dataset.id == ds_id))
    if not existing.scalar_one_or_none():
        ds = Dataset(id=ds_id, name="pipe_test", file_name="test.csv", total_rows=3)
        db.add(ds)
        for i, text in enumerate(["パイプラインテスト1", "パイプラインテスト2", "パイプラインテスト3"]):
            db.add(TextRecord(dataset_id=ds_id, row_index=i, text_content=text))
        await db.commit()

    client._test_dataset_id = ds_id
    yield client


@pytest.mark.asyncio
async def test_pipeline_endpoint(seeded_client):
    """パイプラインエンドポイントが正常に動作する"""
    # エージェント・LLM・レポートをモック
    with (
        patch("app.services.pipeline.AnalysisAgent") as mock_agent_cls,
        patch("app.services.pipeline.ReportGenerator") as mock_report_cls,
    ):
        # Agentモック
        mock_agent = MagicMock()
        mock_agent.agent_id = "agent-pipe-001"
        mock_agent.run = AsyncMock(return_value=[])
        mock_agent_cls.return_value = mock_agent

        # ReportGeneratorモック
        from datetime import UTC, datetime

        from app.models.schemas import ReportFormat, ReportResponse

        mock_generator = MagicMock()
        mock_generator.generate = AsyncMock(
            return_value=ReportResponse(
                report_id="report-001",
                download_url="/api/v1/reports/report-001/download",
                format=ReportFormat.PDF,
                generated_at=datetime.now(UTC),
            )
        )
        mock_report_cls.return_value = mock_generator

        res = await seeded_client.post(
            "/api/v1/agent/pipeline",
            json={
                "dataset_id": seeded_client._test_dataset_id,
                "objective": "テスト分析",
            },
        )

    assert res.status_code == 200
    data = res.json()
    assert "agent_id" in data
    assert "insights" in data


@pytest.mark.asyncio
async def test_pipeline_empty_dataset(client):
    """空データセットではパイプラインが空結果を返す"""
    res = await client.post(
        "/api/v1/agent/pipeline",
        json={
            "dataset_id": "nonexistent-ds",
            "objective": "テスト",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["agent_id"] == ""
    assert data["insights"] == []


def test_pipeline_request_schema():
    """PipelineRequestのバリデーション"""
    req = PipelineRequest(dataset_id="ds-001")
    assert req.objective == ""
    assert req.template.value == "voc"
    assert req.output_format.value == "pdf"
