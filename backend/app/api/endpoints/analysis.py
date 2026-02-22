"""テキスト解析エンドポイント

クラスター分析、感情分析、共起ネットワーク、テキスト類似性検索。
データベースからテキストを取得して実分析を実行し、結果をAnalysisJobに永続化。
"""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenData, get_current_user
from app.models.orm import AnalysisJob
from app.models.schemas import (
    ActionabilityRequest,
    CausalChainRequest,
    ClusterRequest,
    ClusterResult,
    CommunityNamingRequest,
    ContradictionRequest,
    CooccurrenceRequest,
    CooccurrenceResult,
    SentimentEstimate,
    SentimentRequest,
    SentimentResult,
    StopwordUpdateRequest,
    TaxonomyRequest,
)
from app.services.cache import analysis_cache
from app.services.clustering import ClusteringService
from app.services.cooccurrence import cooccurrence_service
from app.services.data_import import get_texts_by_dataset
from app.services.llm_orchestrator import llm_orchestrator
from app.services.sentiment import SentimentService

router = APIRouter()


async def _fetch_texts(
    dataset_id: str,
    db: AsyncSession,
    filters: dict | None = None,
) -> tuple[list[str], list[str], list[str | None]]:
    """データセットからテキストを取得（共通ヘルパー、フィルタ対応）"""
    texts, record_ids, dates = await get_texts_by_dataset(dataset_id, db, filters=filters)
    if not texts:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' not found or empty")
    return texts, record_ids, dates


async def _save_analysis_job(
    db: AsyncSession,
    dataset_id: str,
    analysis_type: str,
    parameters: dict,
    result: dict,
) -> str:
    """分析結果をAnalysisJobテーブルに永続化"""
    job_id = str(uuid4())
    job = AnalysisJob(
        id=job_id,
        dataset_id=dataset_id,
        analysis_type=analysis_type,
        parameters=parameters,
        result=result,
        status="completed",
        completed_at=datetime.now(UTC),
    )
    db.add(job)
    await db.flush()
    return job_id


@router.post("/cluster", response_model=ClusterResult)
async def run_clustering(
    request: ClusterRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> ClusterResult:
    """クラスター分析を実行"""
    params = request.model_dump()
    cached = await analysis_cache.get(request.dataset_id, "cluster", params)
    if cached:
        return ClusterResult(**cached)
    texts, _, _ = await _fetch_texts(request.dataset_id, db, filters=request.filters)
    service = ClusteringService(llm_orchestrator)
    result = await service.analyze(request, texts)
    await _save_analysis_job(db, request.dataset_id, "cluster", params, result.model_dump())
    await analysis_cache.set(request.dataset_id, "cluster", params, result.model_dump(), ttl=3600)
    return result


@router.post("/cluster/compare")
async def compare_clusters(
    dataset_id: str,
    cluster_a: int,
    cluster_b: int,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """2つのクラスターを比較"""
    texts, _, _ = await _fetch_texts(dataset_id, db)
    service = ClusteringService(llm_orchestrator)
    return await service.compare_clusters(texts, [], cluster_a, cluster_b)


@router.post("/sentiment/estimate", response_model=SentimentEstimate)
async def estimate_sentiment(
    request: SentimentRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> SentimentEstimate:
    """感情分析のコスト見積り"""
    texts, _, _ = await _fetch_texts(request.dataset_id, db, filters=request.filters)
    service = SentimentService(llm_orchestrator)
    return service.estimate_cost(texts, request)


@router.post("/sentiment", response_model=SentimentResult)
async def run_sentiment(
    request: SentimentRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> SentimentResult:
    """感情分析を実行"""
    params = request.model_dump()
    cached = await analysis_cache.get(request.dataset_id, "sentiment", params)
    if cached:
        return SentimentResult(**cached)
    texts, record_ids, dates = await _fetch_texts(request.dataset_id, db, filters=request.filters)
    service = SentimentService(llm_orchestrator)
    result = await service.analyze(request, texts, record_ids, dates=dates)
    await _save_analysis_job(db, request.dataset_id, "sentiment", params, result.model_dump())
    await analysis_cache.set(request.dataset_id, "sentiment", params, result.model_dump(), ttl=3600)
    return result


@router.post("/cooccurrence", response_model=CooccurrenceResult)
async def run_cooccurrence(
    request: CooccurrenceRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> CooccurrenceResult:
    """共起ネットワーク分析を実行"""
    params = request.model_dump()
    cached = await analysis_cache.get(request.dataset_id, "cooccurrence", params)
    if cached:
        return CooccurrenceResult(**cached)
    texts, _, _ = await _fetch_texts(request.dataset_id, db, filters=request.filters)
    result = cooccurrence_service.analyze(texts, request)
    await _save_analysis_job(db, request.dataset_id, "cooccurrence", params, result.model_dump())
    await analysis_cache.set(request.dataset_id, "cooccurrence", params, result.model_dump(), ttl=3600)
    return result


@router.post("/cooccurrence/timeslice")
async def run_cooccurrence_timeslice(
    request: CooccurrenceRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> list[dict]:
    """時間スライス共起ネットワーク分析"""
    texts, _, dates = await _fetch_texts(request.dataset_id, db, filters=request.filters)
    return cooccurrence_service.time_sliced_analysis(texts, dates, request)


@router.post("/cooccurrence/name-communities")
async def name_communities(
    request: CommunityNamingRequest,
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """LLMでコミュニティにテーマ名を付与"""
    from app.services.llm_providers.base import LLMRequest

    names: dict[str, str] = {}
    for cid, words in request.communities.items():
        top_words = words[:15]
        prompt = (
            f"以下の単語グループに、10文字以内の日本語テーマ名を1つだけ付けてください。\n"
            f"単語リスト: {', '.join(top_words)}\n"
            f"テーマ名のみを出力してください。説明不要。"
        )
        try:
            resp = await llm_orchestrator.invoke(LLMRequest(prompt=prompt, max_tokens=30, temperature=0.3))
            name = resp.content.strip().strip("「」\"'").strip()[:15]
            names[cid] = name if name else f"コミュニティ {int(cid) + 1}"
        except Exception:
            names[cid] = f"コミュニティ {int(cid) + 1}"
    return {"names": names}


@router.post("/similarity/search")
async def search_similar(
    dataset_id: str,
    query: str,
    top_k: int = 10,
    threshold: float = 0.5,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
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


# === 新規LLM分析エンドポイント（ツールレジストリ経由） ===


@router.post("/causal-chain")
async def run_causal_chain(
    request: CausalChainRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """因果チェーン抽出"""
    params = {"max_chains": request.max_chains, "focus_topic": request.focus_topic}
    cached = await analysis_cache.get(request.dataset_id, "causal_chain", params)
    if cached:
        return cached

    from app.services.analysis_registry import analysis_registry

    result = await analysis_registry.execute(
        "causal_chain_analysis",
        request.dataset_id,
        db,
        max_chains=request.max_chains,
        focus_topic=request.focus_topic,
    )
    response = {
        "success": result.success,
        **result.data,
        "summary": result.summary,
        "key_findings": result.key_findings,
        "error": result.error,
    }
    if result.success:
        await _save_analysis_job(db, request.dataset_id, "causal_chain", params, result.data)
        await analysis_cache.set(request.dataset_id, "causal_chain", params, response, ttl=1800)
    return response


@router.post("/contradiction")
async def run_contradiction(
    request: ContradictionRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """矛盾検出"""
    params = {"sensitivity": request.sensitivity}
    cached = await analysis_cache.get(request.dataset_id, "contradiction", params)
    if cached:
        return cached

    from app.services.analysis_registry import analysis_registry

    result = await analysis_registry.execute(
        "contradiction_detection",
        request.dataset_id,
        db,
        sensitivity=request.sensitivity,
    )
    response = {
        "success": result.success,
        **result.data,
        "summary": result.summary,
        "key_findings": result.key_findings,
        "error": result.error,
    }
    if result.success:
        await _save_analysis_job(db, request.dataset_id, "contradiction", params, result.data)
        await analysis_cache.set(request.dataset_id, "contradiction", params, response, ttl=1800)
    return response


@router.post("/actionability")
async def run_actionability(
    request: ActionabilityRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """アクショナビリティスコアリング"""
    params = {"context": request.context, "max_items": request.max_items}
    cached = await analysis_cache.get(request.dataset_id, "actionability", params)
    if cached:
        return cached

    from app.services.analysis_registry import analysis_registry

    result = await analysis_registry.execute(
        "actionability_scoring",
        request.dataset_id,
        db,
        context=request.context,
        max_items=request.max_items,
    )
    response = {
        "success": result.success,
        **result.data,
        "summary": result.summary,
        "key_findings": result.key_findings,
        "error": result.error,
    }
    if result.success:
        await _save_analysis_job(db, request.dataset_id, "actionability", params, result.data)
        await analysis_cache.set(request.dataset_id, "actionability", params, response, ttl=1800)
    return response


@router.post("/taxonomy")
async def run_taxonomy(
    request: TaxonomyRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """タクソノミー自動生成"""
    params = {"max_depth": request.max_depth, "max_categories": request.max_categories}
    cached = await analysis_cache.get(request.dataset_id, "taxonomy", params)
    if cached:
        return cached

    from app.services.analysis_registry import analysis_registry

    result = await analysis_registry.execute(
        "taxonomy_generation",
        request.dataset_id,
        db,
        max_depth=request.max_depth,
        max_categories=request.max_categories,
    )
    response = {
        "success": result.success,
        **result.data,
        "summary": result.summary,
        "key_findings": result.key_findings,
        "error": result.error,
    }
    if result.success:
        await _save_analysis_job(db, request.dataset_id, "taxonomy", params, result.data)
        await analysis_cache.set(request.dataset_id, "taxonomy", params, response, ttl=1800)
    return response


# === ストップワード管理 ===


@router.get("/stopwords")
async def get_stopwords(
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """現在のストップワード一覧を取得"""
    from app.services.text_preprocessing import text_preprocessor

    return text_preprocessor.get_stopwords()


@router.put("/stopwords")
async def update_stopwords(
    request: StopwordUpdateRequest,
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """ストップワードを更新"""
    from app.services.text_preprocessing import text_preprocessor

    if request.category not in ("ja", "en", "custom"):
        raise HTTPException(status_code=400, detail="category must be 'ja', 'en', or 'custom'")
    if request.mode not in ("replace", "add", "remove"):
        raise HTTPException(status_code=400, detail="mode must be 'replace', 'add', or 'remove'")

    return text_preprocessor.update_stopwords(request.category, request.words, request.mode)


@router.post("/stopwords/reset")
async def reset_stopwords(
    category: str = "all",
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """ストップワードをデフォルトにリセット"""
    from app.services.text_preprocessing import text_preprocessor

    if category == "all":
        text_preprocessor.reset_stopwords("ja")
        text_preprocessor.reset_stopwords("en")
        text_preprocessor.reset_stopwords("custom")
        return text_preprocessor.get_stopwords()
    if category not in ("ja", "en", "custom"):
        raise HTTPException(status_code=400, detail="category must be 'ja', 'en', 'custom', or 'all'")
    return text_preprocessor.reset_stopwords(category)
