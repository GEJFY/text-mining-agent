"""因果チェーン抽出ツール

テキストデータから因果関係の連鎖（原因→結果→影響）を
LLMで構造的に抽出する。
"""

from __future__ import annotations

import random
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


def _strategic_sample(texts: list[str], record_ids: list[str], max_samples: int = 50) -> list[tuple[int, str, str]]:
    """戦略的サンプリング: 先頭・末尾・ランダムから均等に抽出"""
    if len(texts) <= max_samples:
        return [(i, record_ids[i], texts[i]) for i in range(len(texts))]

    head = max_samples // 3
    tail = max_samples // 3
    mid = max_samples - head - tail

    indices = list(range(head))
    indices += random.sample(range(head, len(texts) - tail), min(mid, len(texts) - head - tail))
    indices += list(range(len(texts) - tail, len(texts)))
    indices = sorted(set(indices))[:max_samples]

    return [(i, record_ids[i], texts[i]) for i in indices]


class CausalChainTool(AnalysisToolBase):
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="causal_chain_analysis",
            description=(
                "テキストデータから因果関係の連鎖を抽出。"
                "「原因→結果→影響」の構造を識別し、根本原因の特定を支援。"
                "インシデント報告、顧客苦情、監査指摘事項の分析に有効。"
            ),
            parameters=[
                ToolParameter(
                    name="max_chains",
                    type="integer",
                    description="抽出する因果連鎖の最大数",
                    required=False,
                    default=10,
                ),
                ToolParameter(
                    name="focus_topic",
                    type="string",
                    description="フォーカスするトピック（省略可）",
                    required=False,
                ),
            ],
            category="llm_based",
            requires_llm=True,
        )

    async def execute(self, dataset_id: str, db: AsyncSession, **kwargs: Any) -> ToolResult:
        texts, record_ids, _ = await get_texts_by_dataset(dataset_id, db)
        if not texts:
            return ToolResult(
                tool_name="causal_chain_analysis",
                success=False,
                data={},
                summary="",
                key_findings=[],
                evidence_refs=[],
                error="データセットが空です",
            )

        max_chains = kwargs.get("max_chains", 10)
        focus_topic = kwargs.get("focus_topic", "")
        samples = _strategic_sample(texts, record_ids, max_samples=50)

        focus_instruction = ""
        if focus_topic:
            focus_instruction = f"\n特に「{focus_topic}」に関連する因果関係を優先してください。"

        texts_block = "\n".join(f"[{idx}] {text[:300]}" for idx, _rid, text in samples)

        prompt = f"""以下のテキストデータから因果関係の連鎖（原因→結果→影響）を抽出してください。
{focus_instruction}

テキストデータ:
{texts_block}

要件:
- 最大{max_chains}個の因果連鎖を抽出
- 各連鎖は2〜4段階（原因→結果、または原因→中間結果→最終影響）
- 複数テキストにまたがる因果関係も考慮
- 信頼度を0.0〜1.0で評価

JSON配列で出力:
[{{
    "chain": ["原因A", "結果B", "影響C"],
    "confidence": 0.85,
    "supporting_text_indices": [0, 5, 12],
    "explanation": "テキスト[0]で報告された○○が..."
}}]"""

        try:
            from app.services.tools import extract_json

            response = await llm_orchestrator.invoke(prompt, TaskType.LABELING, max_tokens=4096)
            chains = extract_json(response)
            if not isinstance(chains, list):
                chains = [chains]
        except Exception as e:
            logger.warning("causal_chain_parse_failed", error=str(e))
            chains = []

        # key_findings構築
        key_findings = []
        evidence_refs = []
        for chain in chains[:max_chains]:
            chain_str = " → ".join(chain.get("chain", []))
            conf = chain.get("confidence", 0.5)
            key_findings.append(f"{chain_str} (信頼度: {conf:.2f})")

            for idx in chain.get("supporting_text_indices", []):
                if 0 <= idx < len(samples):
                    _, rid, text = samples[idx]
                    evidence_refs.append(
                        {
                            "record_id": rid,
                            "text": text[:200],
                            "relevance": conf,
                        }
                    )

        return ToolResult(
            tool_name="causal_chain_analysis",
            success=True,
            data={"chains": chains[:max_chains], "total_analyzed": len(samples)},
            summary=f"{len(chains)}個の因果連鎖を{len(samples)}件のテキストから抽出",
            key_findings=key_findings,
            evidence_refs=evidence_refs,
        )
