"""共起ネットワーク分析ツール - CooccurrenceServiceのToolインターフェースラッパー"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.services.analysis_registry import (
    AnalysisToolBase,
    ToolDefinition,
    ToolParameter,
    ToolResult,
)
from app.services.cooccurrence import cooccurrence_service
from app.services.data_import import get_texts_by_dataset

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class CooccurrenceTool(AnalysisToolBase):
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="cooccurrence_analysis",
            description=(
                "テキストの共起ネットワークを構築。頻出語間の関連性を可視化し、"
                "Louvainコミュニティ検出で語彙クラスターを特定。"
                "中心性指標（次数・媒介）で重要キーワードをランキング。"
            ),
            parameters=[
                ToolParameter(
                    name="min_frequency",
                    type="integer",
                    description="最小出現頻度（これ以下の語は除外）",
                    required=False,
                    default=3,
                ),
                ToolParameter(
                    name="window_size",
                    type="integer",
                    description="共起ウィンドウサイズ（2〜20）",
                    required=False,
                    default=5,
                ),
            ],
            category="network",
            requires_llm=False,
        )

    async def execute(self, dataset_id: str, db: AsyncSession, **kwargs: Any) -> ToolResult:
        from app.models.schemas import CooccurrenceRequest

        texts, _, _ = await get_texts_by_dataset(dataset_id, db)
        if not texts:
            return ToolResult(
                tool_name="cooccurrence_analysis",
                success=False,
                data={},
                summary="",
                key_findings=[],
                evidence_refs=[],
                error="データセットが空です",
            )

        request = CooccurrenceRequest(
            dataset_id=dataset_id,
            min_frequency=kwargs.get("min_frequency", 3),
            window_size=kwargs.get("window_size", 5),
        )
        result = cooccurrence_service.analyze(texts, request)
        result_dict = result.model_dump()

        # 中心性上位のキーワードをkey_findingsに
        top_nodes = sorted(result.nodes, key=lambda n: n.degree_centrality, reverse=True)[:10]
        key_findings = [f"「{n.word}」: 出現{n.frequency}回, 次数中心性{n.degree_centrality:.3f}" for n in top_nodes]

        # コミュニティ情報
        for cid, words in result.communities.items():
            key_findings.append(f"コミュニティ{cid}: {', '.join(words[:5])}")

        return ToolResult(
            tool_name="cooccurrence_analysis",
            success=True,
            data=result_dict,
            summary=(
                f"{len(result.nodes)}ノード, {len(result.edges)}エッジの共起ネットワーク。"
                f"モジュラリティ: {result.modularity:.3f}"
            ),
            key_findings=key_findings,
            evidence_refs=[],
        )
