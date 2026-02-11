"""テキスト解析エンドポイント

クラスター分析、感情分析、共起ネットワーク、トピックモデリング、テキスト類似性検索。
"""

from fastapi import APIRouter

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
from app.services.llm_orchestrator import llm_orchestrator
from app.services.sentiment import SentimentService

router = APIRouter()


@router.post("/cluster", response_model=ClusterResult)
async def run_clustering(request: ClusterRequest) -> ClusterResult:
    """クラスター分析を実行"""
    service = ClusteringService(llm_orchestrator)
    # 実運用ではデータベースからテキストを取得
    texts = ["サンプルテキスト"]  # placeholder
    return await service.analyze(request, texts)


@router.post("/cluster/compare")
async def compare_clusters(
    dataset_id: str,
    cluster_a: int,
    cluster_b: int,
) -> dict:
    """2つのクラスターを比較"""
    service = ClusteringService(llm_orchestrator)
    return await service.compare_clusters([], [], cluster_a, cluster_b)


@router.post("/sentiment/estimate", response_model=SentimentEstimate)
async def estimate_sentiment(request: SentimentRequest) -> SentimentEstimate:
    """感情分析のコスト見積り"""
    service = SentimentService(llm_orchestrator)
    texts = ["サンプル"]  # placeholder
    return service.estimate_cost(texts, request)


@router.post("/sentiment", response_model=SentimentResult)
async def run_sentiment(request: SentimentRequest) -> SentimentResult:
    """感情分析を実行"""
    service = SentimentService(llm_orchestrator)
    texts = ["サンプル"]  # placeholder
    record_ids = ["1"]
    return await service.analyze(request, texts, record_ids)


@router.post("/cooccurrence", response_model=CooccurrenceResult)
async def run_cooccurrence(request: CooccurrenceRequest) -> CooccurrenceResult:
    """共起ネットワーク分析を実行"""
    texts = ["サンプル テキスト 分析"]  # placeholder
    return cooccurrence_service.analyze(texts, request)


@router.post("/cooccurrence/timeslice")
async def run_cooccurrence_timeslice(request: CooccurrenceRequest) -> list[dict]:
    """時間スライス共起ネットワーク分析"""
    return cooccurrence_service.time_sliced_analysis([], [], request)


@router.post("/similarity/search")
async def search_similar(
    dataset_id: str,
    query: str,
    top_k: int = 10,
    threshold: float = 0.5,
) -> dict:
    """テキスト類似性検索"""
    # 実運用ではEmbeddingを生成しデータベースからコサイン類似度計算
    return {"query": query, "results": [], "message": "Database integration required"}
