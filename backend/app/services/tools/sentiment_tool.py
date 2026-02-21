"""感情分析ツール - SentimentServiceのToolインターフェースラッパー"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.services.analysis_registry import (
    AnalysisToolBase,
    ToolDefinition,
    ToolParameter,
    ToolResult,
)
from app.services.data_import import get_texts_by_dataset
from app.services.llm_orchestrator import llm_orchestrator
from app.services.sentiment import SentimentService

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class SentimentTool(AnalysisToolBase):
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="sentiment_analysis",
            description=(
                "テキストデータの感情分析を実行。BASIC（ポジ/ネガ/中立）、"
                "BUSINESS（満足/不満/要望/質問/その他）、RISK（コンプライアンスリスク等）"
                "の3プリセット＋カスタム軸に対応。エビデンスハイライト付き。"
            ),
            parameters=[
                ToolParameter(
                    name="mode",
                    type="string",
                    description="分析モード",
                    required=False,
                    default="basic",
                    enum=["basic", "business", "risk"],
                ),
            ],
            category="llm_based",
            requires_llm=True,
        )

    async def execute(self, dataset_id: str, db: AsyncSession, **kwargs: Any) -> ToolResult:
        from app.models.schemas import SentimentMode, SentimentRequest

        texts, record_ids, _ = await get_texts_by_dataset(dataset_id, db)
        if not texts:
            return ToolResult(
                tool_name="sentiment_analysis",
                success=False,
                data={},
                summary="",
                key_findings=[],
                evidence_refs=[],
                error="データセットが空です",
            )

        request = SentimentRequest(
            dataset_id=dataset_id,
            mode=SentimentMode(kwargs.get("mode", "basic")),
        )
        service = SentimentService(llm_orchestrator)
        result = await service.analyze(request, texts, record_ids)
        result_dict = result.model_dump()

        # 分布情報からkey_findingsを構築
        key_findings = [f"{label}: {count}件" for label, count in result.distribution.items()]

        # エビデンスハイライトから参照を構築
        evidence_refs = []
        for item in result.results[:20]:
            for ev in item.evidence_highlights:
                evidence_refs.append(
                    {
                        "record_id": item.record_id,
                        "text": ev.get("highlight", "")[:200],
                        "label": ", ".join(item.labels),
                        "relevance": max(item.scores.values()) if item.scores else 0.5,
                    }
                )

        total = sum(result.distribution.values())
        return ToolResult(
            tool_name="sentiment_analysis",
            success=True,
            data=result_dict,
            summary=f"{total}件を{result.mode.value}モードで感情分析。分布: {result.distribution}",
            key_findings=key_findings,
            evidence_refs=evidence_refs,
        )
