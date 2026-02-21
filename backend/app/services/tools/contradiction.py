"""矛盾検出ツール

データセット内の矛盾する記述・意見の対立をLLMで検出する。
ポリシー文書の整合性チェックやVOCの意見対立分析に有効。
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


class ContradictionTool(AnalysisToolBase):
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="contradiction_detection",
            description=(
                "データセット内の矛盾する記述や意見の対立を検出。"
                "直接矛盾・暗黙矛盾・時間的矛盾を識別し、論点の両面を明示化。"
                "ポリシー整合性チェックやVOC分析に有効。"
            ),
            parameters=[
                ToolParameter(
                    name="sensitivity",
                    type="string",
                    description="検出感度（low=明確な矛盾のみ、high=暗黙的矛盾も含む）",
                    required=False,
                    default="medium",
                    enum=["low", "medium", "high"],
                ),
            ],
            category="llm_based",
            requires_llm=True,
        )

    async def execute(self, dataset_id: str, db: AsyncSession, **kwargs: Any) -> ToolResult:
        texts, record_ids, _ = await get_texts_by_dataset(dataset_id, db)
        if not texts:
            return ToolResult(
                tool_name="contradiction_detection",
                success=False,
                data={},
                summary="",
                key_findings=[],
                evidence_refs=[],
                error="データセットが空です",
            )

        sensitivity = kwargs.get("sensitivity", "medium")
        sensitivity_instruction = {
            "low": "明確に事実として矛盾している記述のみを検出してください。",
            "medium": "事実の矛盾に加え、意見や方針の不整合も検出してください。",
            "high": "明示的矛盾に加え、暗黙的な矛盾や論理的不整合も検出してください。",
        }

        # バッチ処理: 最大60件をLLMに渡す
        sample_size = min(len(texts), 60)
        sample_texts = texts[:sample_size]
        sample_ids = record_ids[:sample_size]

        texts_block = "\n".join(f"[{i}] {text[:300]}" for i, text in enumerate(sample_texts))

        prompt = f"""以下のテキストデータ内で矛盾する記述や意見の対立を検出してください。

{sensitivity_instruction[sensitivity]}

テキストデータ:
{texts_block}

各矛盾について以下を特定:
- 矛盾する2つの記述（原文に近い形で引用）
- 矛盾の種類: "direct"（直接矛盾）, "implicit"（暗黙矛盾）, "temporal"（時間的矛盾）
- 信頼度（0.0〜1.0）

JSON配列で出力:
[{{
    "statement_a": "記述A（テキストからの引用）",
    "statement_b": "記述B（テキストからの引用）",
    "index_a": 0,
    "index_b": 5,
    "contradiction_type": "direct",
    "confidence": 0.9,
    "explanation": "AではXと述べているが、BではYと述べており矛盾"
}}]

矛盾が見つからない場合は空配列[]を返してください。"""

        try:
            from app.services.tools import extract_json

            response = await llm_orchestrator.invoke(prompt, TaskType.LABELING, max_tokens=4096)
            contradictions = extract_json(response)
            if not isinstance(contradictions, list):
                contradictions = [contradictions] if contradictions else []
        except Exception as e:
            logger.warning("contradiction_parse_failed", error=str(e))
            contradictions = []

        key_findings = []
        evidence_refs = []
        for c in contradictions:
            ctype = c.get("contradiction_type", "unknown")
            conf = c.get("confidence", 0.5)
            key_findings.append(
                f"[{ctype}] 「{c.get('statement_a', '')[:50]}」vs "
                f"「{c.get('statement_b', '')[:50]}」(信頼度: {conf:.2f})"
            )
            for key in ("index_a", "index_b"):
                idx = c.get(key, -1)
                if 0 <= idx < len(sample_ids):
                    evidence_refs.append(
                        {
                            "record_id": sample_ids[idx],
                            "text": sample_texts[idx][:200],
                            "relevance": conf,
                        }
                    )

        # record_idを結果に付与
        for c in contradictions:
            idx_a = c.get("index_a", -1)
            idx_b = c.get("index_b", -1)
            c["record_id_a"] = sample_ids[idx_a] if 0 <= idx_a < len(sample_ids) else ""
            c["record_id_b"] = sample_ids[idx_b] if 0 <= idx_b < len(sample_ids) else ""

        return ToolResult(
            tool_name="contradiction_detection",
            success=True,
            data={
                "contradictions": contradictions,
                "total_analyzed": sample_size,
                "sensitivity": sensitivity,
            },
            summary=(f"{len(contradictions)}件の矛盾を{sample_size}件のテキストから検出（感度: {sensitivity}）"),
            key_findings=key_findings,
            evidence_refs=evidence_refs,
        )
