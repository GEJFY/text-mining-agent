"""Sprint 5: 分析結果のAnalysisJob永続化テスト"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.schemas import ClusterAlgorithm


@pytest.fixture
async def seeded_client(client):
    """テスト用データセット + テキストレコードをDBに投入済みのクライアント"""
    from app.core.database import get_db
    from app.main import app
    from app.models.orm import Dataset, TextRecord

    # get_dbオーバーライドからセッションを取得
    db_gen = app.dependency_overrides[get_db]()
    db = await db_gen.__anext__()

    ds = Dataset(id="ds-persist-001", name="test", file_name="test.csv", total_rows=3)
    db.add(ds)
    for i, text in enumerate(["テスト文1", "テスト文2", "テスト文3"]):
        db.add(TextRecord(dataset_id="ds-persist-001", row_index=i, text_content=text))
    await db.commit()

    yield client


def _mock_cluster_result():
    """ClusterResult互換の辞書を返すモック"""
    from app.models.schemas import ClusterLabel, ClusterResult

    return ClusterResult(
        job_id="mock-job-001",
        algorithm=ClusterAlgorithm.KMEANS,
        clusters=[
            ClusterLabel(
                cluster_id=0,
                title="テスト",
                summary="テスト要約",
                keywords=["kw1"],
                size=3,
                centroid_texts=["テスト文1"],
            )
        ],
        outliers=[],
        umap_coordinates=[[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]],
        cluster_assignments=[0, 0, 0],
        silhouette_score=0.75,
    )


def _mock_sentiment_result():
    from app.models.schemas import SentimentMode, SentimentResult

    return SentimentResult(
        job_id="mock-job-002",
        mode=SentimentMode.BASIC,
        axes=["positive", "negative", "neutral"],
        results=[],
        distribution={"positive": 2, "negative": 1},
    )


def _mock_cooccurrence_result():
    from app.models.schemas import CooccurrenceResult

    return CooccurrenceResult(
        nodes=[],
        edges=[],
        communities={},
        modularity=0.0,
    )


@pytest.mark.asyncio
async def test_cluster_saves_analysis_job(seeded_client):
    """クラスター分析後にAnalysisJobが保存される"""
    with patch("app.api.endpoints.analysis.ClusteringService") as mock_cls:
        mock_instance = MagicMock()
        mock_instance.analyze = AsyncMock(return_value=_mock_cluster_result())
        mock_cls.return_value = mock_instance

        res = await seeded_client.post(
            "/api/v1/analysis/cluster",
            json={"dataset_id": "ds-persist-001", "algorithm": "kmeans", "n_clusters": 2},
        )
        assert res.status_code == 200

    # AnalysisJobが保存されているか確認
    from sqlalchemy import select

    from app.core.database import get_db
    from app.main import app
    from app.models.orm import AnalysisJob

    db_gen = app.dependency_overrides[get_db]()
    db = await db_gen.__anext__()
    result = await db.execute(select(AnalysisJob).where(AnalysisJob.dataset_id == "ds-persist-001"))
    jobs = result.scalars().all()
    assert len(jobs) >= 1
    job = jobs[0]
    assert job.analysis_type == "cluster"
    assert job.status == "completed"
    assert job.completed_at is not None


@pytest.mark.asyncio
async def test_sentiment_saves_analysis_job(seeded_client):
    """感情分析後にAnalysisJobが保存される"""
    with patch("app.api.endpoints.analysis.SentimentService") as mock_cls:
        mock_instance = MagicMock()
        mock_instance.analyze = AsyncMock(return_value=_mock_sentiment_result())
        mock_cls.return_value = mock_instance

        res = await seeded_client.post(
            "/api/v1/analysis/sentiment",
            json={"dataset_id": "ds-persist-001"},
        )
        assert res.status_code == 200

    from sqlalchemy import select

    from app.core.database import get_db
    from app.main import app
    from app.models.orm import AnalysisJob

    db_gen = app.dependency_overrides[get_db]()
    db = await db_gen.__anext__()
    result = await db.execute(
        select(AnalysisJob).where(
            AnalysisJob.dataset_id == "ds-persist-001",
            AnalysisJob.analysis_type == "sentiment",
        )
    )
    job = result.scalar_one_or_none()
    assert job is not None
    assert job.status == "completed"


@pytest.mark.asyncio
async def test_cooccurrence_saves_analysis_job(seeded_client):
    """共起ネットワーク分析後にAnalysisJobが保存される"""
    with patch("app.api.endpoints.analysis.cooccurrence_service") as mock_svc:
        mock_svc.analyze = MagicMock(return_value=_mock_cooccurrence_result())

        res = await seeded_client.post(
            "/api/v1/analysis/cooccurrence",
            json={"dataset_id": "ds-persist-001"},
        )
        assert res.status_code == 200

    from sqlalchemy import select

    from app.core.database import get_db
    from app.main import app
    from app.models.orm import AnalysisJob

    db_gen = app.dependency_overrides[get_db]()
    db = await db_gen.__anext__()
    result = await db.execute(
        select(AnalysisJob).where(
            AnalysisJob.dataset_id == "ds-persist-001",
            AnalysisJob.analysis_type == "cooccurrence",
        )
    )
    job = result.scalar_one_or_none()
    assert job is not None
    assert job.status == "completed"
