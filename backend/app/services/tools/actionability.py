"""アクショナビリティスコアリングツール

各テキストを具体性・緊急度・対応可能性・ビジネスインパクトで
多次元評価し、優先対応すべき項目を特定する。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.core.logging import get_logger
from app.services.analysis_registry import (
    AnalysisToolBase,
    ToolDefinition,
    ToolParameter,
    ToolResult,
)
from app.services.data_import import get_texts_by_dataset
from app.services.llm_orchestrator import TaskType, llm_orchestrator

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)

BATCH_SIZE = 10


class ActionabilityTool(AnalysisToolBase):
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="actionability_scoring",
            description=(
                "各テキストのアクション可能性を多次元スコアリング。"
                "具体性・緊急度・対応可能性・ビジネスインパクトを評価し、"
                "優先対応すべき項目をランキング。改善アクションも提案。"
            ),
            parameters=[
                ToolParameter(
                    name="context",
                    type="string",
                    description="ビジネスコンテキスト（例: 'カスタマーサポート', '内部監査'）",
                    required=False,
                ),
                ToolParameter(
                    name="max_items",
                    type="integer",
                    description="スコアリング対象の最大件数",
                    required=False,
                    default=100,
                ),
            ],
            category="llm_based",
            requires_llm=True,
        )

    async def execute(self, dataset_id: str, db: AsyncSession, **kwargs: Any) -> ToolResult:
        texts, record_ids, _ = await get_texts_by_dataset(dataset_id, db)
        if not texts:
            return ToolResult(
                tool_name="actionability_scoring",
                success=False,
                data={},
                summary="",
                key_findings=[],
                evidence_refs=[],
                error="データセットが空です",
            )

        biz_context = kwargs.get("context", "")
        max_items = min(kwargs.get("max_items", 100), len(texts))
        target_texts = texts[:max_items]
        target_ids = record_ids[:max_items]

        context_instruction = ""
        if biz_context:
            context_instruction = f"\nビジネスコンテキスト: {biz_context}"

        all_items: list[dict] = []

        # バッチ処理
        for batch_start in range(0, len(target_texts), BATCH_SIZE):
            batch_texts = target_texts[batch_start : batch_start + BATCH_SIZE]
            batch_ids = target_ids[batch_start : batch_start + BATCH_SIZE]

            texts_block = "\n".join(f"[{i}] {text[:300]}" for i, text in enumerate(batch_texts))

            prompt = f"""以下のテキストそれぞれについてアクション可能性を評価してください。
{context_instruction}

テキストデータ:
{texts_block}

評価基準（各0.0〜1.0）:
- specificity: 具体性（問題や要望が具体的か）
- urgency: 緊急度（即座の対応が必要か）
- feasibility: 対応可能性（実際にアクションが取れるか）
- impact: ビジネスインパクト（対応による効果の大きさ）
- overall: 総合スコア（上記4指標の重み付き平均）

カテゴリ: "immediate"（即時対応）, "short_term"（短期）, "long_term"（長期）, "informational"（情報のみ）

JSON配列で出力:
[{{
    "index": 0,
    "overall": 0.85,
    "specificity": 0.9,
    "urgency": 0.7,
    "feasibility": 0.8,
    "impact": 0.9,
    "category": "immediate",
    "suggested_actions": ["具体的アクション1", "具体的アクション2"]
}}]"""

            try:
                from app.services.tools import extract_json

                response = await llm_orchestrator.invoke(prompt, TaskType.BATCH_CLASSIFICATION, max_tokens=2000)
                items = extract_json(response)
                if not isinstance(items, list):
                    items = [items]

                for item in items:
                    idx = item.get("index", 0)
                    if 0 <= idx < len(batch_ids):
                        item["record_id"] = batch_ids[idx]
                        item["text_preview"] = batch_texts[idx][:100]
                    all_items.append(item)
            except Exception as e:
                logger.warning("actionability_batch_failed", batch=batch_start, error=str(e))

        # スコア降順ソート
        all_items.sort(key=lambda x: x.get("overall", 0), reverse=True)

        # 分布集計
        distribution: dict[str, int] = {}
        for item in all_items:
            cat = item.get("category", "informational")
            distribution[cat] = distribution.get(cat, 0) + 1

        # key_findings: 上位5件
        key_findings = []
        for item in all_items[:5]:
            score = item.get("overall", 0)
            preview = item.get("text_preview", "")[:60]
            cat = item.get("category", "")
            actions = ", ".join(item.get("suggested_actions", [])[:2])
            key_findings.append(f"[{cat}] スコア{score:.2f}: 「{preview}」→ {actions}")

        key_findings.append(f"カテゴリ分布: {distribution}")

        evidence_refs = [
            {
                "record_id": item.get("record_id", ""),
                "text": item.get("text_preview", "")[:200],
                "relevance": item.get("overall", 0.5),
            }
            for item in all_items[:20]
        ]

        return ToolResult(
            tool_name="actionability_scoring",
            success=True,
            data={
                "items": all_items,
                "distribution": distribution,
                "total_scored": len(all_items),
            },
            summary=(
                f"{len(all_items)}件をスコアリング。"
                f"即時対応: {distribution.get('immediate', 0)}件、"
                f"短期: {distribution.get('short_term', 0)}件"
            ),
            key_findings=key_findings,
            evidence_refs=evidence_refs,
        )
