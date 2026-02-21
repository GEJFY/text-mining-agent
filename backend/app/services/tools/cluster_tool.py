"""クラスター分析ツール - ClusteringServiceのToolインターフェースラッパー"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.services.analysis_registry import (
    AnalysisToolBase,
    ToolDefinition,
    ToolParameter,
    ToolResult,
)
from app.services.clustering import ClusteringService
from app.services.data_import import get_texts_by_dataset
from app.services.llm_orchestrator import llm_orchestrator

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class ClusterTool(AnalysisToolBase):
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="cluster_analysis",
            description=(
                "テキストデータをクラスタリングし、トピック別にグループ化。"
                "各クラスターにLLMでラベル・要約・キーワードを付与。"
                "外れ値検出とシルエットスコアによる品質評価を含む。"
            ),
            parameters=[
                ToolParameter(
                    name="algorithm",
                    type="string",
                    description="クラスタリングアルゴリズム",
                    required=False,
                    default="kmeans",
                    enum=["kmeans", "hdbscan", "gmm"],
                ),
                ToolParameter(
                    name="n_clusters",
                    type="integer",
                    description="クラスター数（2〜50）",
                    required=False,
                    default=5,
                ),
            ],
            category="statistical",
            requires_llm=True,
        )

    async def execute(self, dataset_id: str, db: AsyncSession, **kwargs: Any) -> ToolResult:
        from app.models.schemas import ClusterAlgorithm, ClusterRequest

        texts, record_ids, _ = await get_texts_by_dataset(dataset_id, db)
        if not texts:
            return ToolResult(
                tool_name="cluster_analysis",
                success=False,
                data={},
                summary="",
                key_findings=[],
                evidence_refs=[],
                error="データセットが空です",
            )

        request = ClusterRequest(
            dataset_id=dataset_id,
            algorithm=ClusterAlgorithm(kwargs.get("algorithm", "kmeans")),
            n_clusters=kwargs.get("n_clusters", 5),
        )
        service = ClusteringService(llm_orchestrator)
        result = await service.analyze(request, texts)
        result_dict = result.model_dump()

        key_findings = [f"クラスター「{c.title}」: {c.size}件 - {c.summary}" for c in result.clusters]
        evidence_refs = []
        for c in result.clusters:
            for text in c.centroid_texts[:2]:
                evidence_refs.append(
                    {
                        "cluster_id": c.cluster_id,
                        "text": text[:200],
                        "relevance": 1.0,
                    }
                )

        return ToolResult(
            tool_name="cluster_analysis",
            success=True,
            data=result_dict,
            summary=(f"{len(result.clusters)}個のクラスターを検出。シルエットスコア: {result.silhouette_score:.3f}"),
            key_findings=key_findings,
            evidence_refs=evidence_refs,
        )
