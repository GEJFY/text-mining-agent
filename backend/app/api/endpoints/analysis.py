"""テキスト解析エンドポイント

クラスター分析、感情分析、共起ネットワーク、テキスト類似性検索。
データベースからテキストを取得して実分析を実行。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.schemas import (
    ClusterRequest,
    ClusterResult,
    CooccurrenceRequest,
    CooccurrenceResult,
    SentimentEstimate,
    SentimentRequest,
    SentimentResult,
)
from app.services.clustering import ClusteringService
from app.services.cooccurrence import cooccurrence_service
from app.services.data_import import get_texts_by_dataset
from app.services.llm_orchestrator import llm_orchestrator
from app.services.sentiment import SentimentService

router = APIRouter()


async def _fetch_texts(dataset_id: str, db: AsyncSession) -> tuple[list[str], list[str], list[str | None]]:
    """データセットからテキストを取得（共通ヘルパー）"""
    texts, record_ids, dates = await get_texts_by_dataset(dataset_id, db)
    if not texts:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found or empty")
    return texts, record_ids, dates


@router.post("/cluster", response_model=ClusterResult)
async def run_clustering(
    request: ClusterRequest,
    db: AsyncSession = Depends(get_db),
) -> ClusterResult:
    """クラスター分析を実行"""
    texts, _, _ = await _fetch_texts(request.dataset_id, db)
    service = ClusteringService(llm_orchestrator)
    return await service.analyze(request, texts)


@router.post("/cluster/compare")
async def compare_clusters(
    dataset_id: str,
    cluster_a: int,
    cluster_b: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """2つのクラスターを比較"""
    texts, _, _ = await _fetch_texts(dataset_id, db)
    service = ClusteringService(llm_orchestrator)
    return await service.compare_clusters(texts, [], cluster_a, cluster_b)


@router.post("/sentiment/estimate", response_model=SentimentEstimate)
async def estimate_sentiment(
    request: SentimentRequest,
    db: AsyncSession = Depends(get_db),
) -> SentimentEstimate:
    """感情分析のコスト見積り"""
    texts, _, _ = await _fetch_texts(request.dataset_id, db)
    service = SentimentService(llm_orchestrator)
    return service.estimate_cost(texts, request)


@router.post("/sentiment", response_model=SentimentResult)
async def run_sentiment(
    request: SentimentRequest,
    db: AsyncSession = Depends(get_db),
) -> SentimentResult:
    """感情分析を実行"""
    texts, record_ids, _ = await _fetch_texts(request.dataset_id, db)
    service = SentimentService(llm_orchestrator)
    return await service.analyze(request, texts, record_ids)


@router.post("/cooccurrence", response_model=CooccurrenceResult)
async def run_cooccurrence(
    request: CooccurrenceRequest,
    db: AsyncSession = Depends(get_db),
) -> CooccurrenceResult:
    """共起ネットワーク分析を実行"""
    texts, _, _ = await _fetch_texts(request.dataset_id, db)
    return cooccurrence_service.analyze(texts, request)


@router.post("/cooccurrence/timeslice")
async def run_cooccurrence_timeslice(
    request: CooccurrenceRequest,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """時間スライス共起ネットワーク分析"""
    texts, _, dates = await _fetch_texts(request.dataset_id, db)
    return cooccurrence_service.time_sliced_analysis(texts, dates, request)


@router.post("/similarity/search")
async def search_similar(
    dataset_id: str,
    query: str,
    top_k: int = 10,
    threshold: float = 0.5,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """テキスト類似性検索"""
    texts, record_ids, _ = await _fetch_texts(dataset_id, db)
    # テキスト前処理サービスで類似検索
    from app.services.text_preprocessing import text_preprocessing_service

    embeddings = text_preprocessing_service.embedding_model.encode(texts)
    query_emb = text_preprocessing_service.embedding_model.encode([query])[0]

    import numpy as np

    similarities = np.dot(embeddings, query_emb) / (
        np.linalg.norm(embeddings, axis=1) * np.linalg.norm(query_emb) + 1e-9
    )

    # top_k件を閾値でフィルタ
    indices = np.argsort(similarities)[::-1][:top_k]
    results = []
    for idx in indices:
        score = float(similarities[idx])
        if score >= threshold:
            results.append(
                {
                    "record_id": record_ids[idx],
                    "text": texts[idx][:200],
                    "similarity": round(score, 4),
                }
            )

    return {"query": query, "results": results, "total_searched": len(texts)}
