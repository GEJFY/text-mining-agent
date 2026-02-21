"""タクソノミー自動生成ツール

テキストデータから階層的カテゴリ体系（タクソノミー）を
2パスLLMアプローチで自動生成する。
"""

from __future__ import annotations

import json
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


class TaxonomyTool(AnalysisToolBase):
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="taxonomy_generation",
            description=(
                "テキストデータから階層的なカテゴリ体系（タクソノミー）を自動生成。"
                "2パスLLMアプローチ: Pass1でトップカテゴリ発見、Pass2でサブカテゴリ展開。"
                "新規データの全体像把握や分析の切り口発見に有効。"
            ),
            parameters=[
                ToolParameter(
                    name="max_depth",
                    type="integer",
                    description="階層の最大深さ",
                    required=False,
                    default=3,
                ),
                ToolParameter(
                    name="max_categories",
                    type="integer",
                    description="トップレベルカテゴリの最大数",
                    required=False,
                    default=8,
                ),
            ],
            category="llm_based",
            requires_llm=True,
        )

    async def execute(self, dataset_id: str, db: AsyncSession, **kwargs: Any) -> ToolResult:
        from app.services.tools import extract_json

        texts, record_ids, _ = await get_texts_by_dataset(dataset_id, db)
        if not texts:
            return ToolResult(
                tool_name="taxonomy_generation",
                success=False,
                data={},
                summary="",
                key_findings=[],
                evidence_refs=[],
                error="データセットが空です",
            )

        max_depth = kwargs.get("max_depth", 3)
        max_categories = kwargs.get("max_categories", 8)

        # Pass 1: サンプルからトップレベルカテゴリを生成
        sample_size = min(len(texts), 40)
        if len(texts) > sample_size:
            sample_indices = sorted(random.sample(range(len(texts)), sample_size))
        else:
            sample_indices = list(range(len(texts)))

        sample_block = "\n".join(f"- {texts[i][:200]}" for i in sample_indices)

        pass1_prompt = f"""以下のテキストサンプルを分析し、データ全体を分類するための
トップレベルカテゴリ体系を設計してください。

テキストサンプル({sample_size}件):
{sample_block}

要件:
- 最大{max_categories}個のトップレベルカテゴリ
- 各カテゴリに簡潔な名前（10文字以内）と説明
- 「その他」カテゴリは最後に1つだけ
- MECE（相互排他・全体網羅）を意識

JSON配列で出力:
[{{
    "name": "カテゴリ名",
    "description": "このカテゴリに含まれるテキストの特徴"
}}]"""

        try:
            response = await llm_orchestrator.invoke(pass1_prompt, TaskType.LABELING, max_tokens=1500)
            categories = extract_json(response)
            if not isinstance(categories, list):
                categories = [categories]
        except Exception as e:
            logger.warning("taxonomy_pass1_failed", error=str(e))
            categories = [{"name": "未分類", "description": "分類不能"}]

        # Pass 2: 全テキストを分類し、サブカテゴリを発見
        category_names = [c["name"] for c in categories]
        classification_sample = min(len(texts), 80)
        classify_texts = texts[:classification_sample]
        classify_ids = record_ids[:classification_sample]

        texts_block = "\n".join(f"[{i}] {text[:200]}" for i, text in enumerate(classify_texts))

        pass2_prompt = f"""以下のテキストを指定カテゴリに分類し、各カテゴリのサブカテゴリを発見してください。

カテゴリ: {json.dumps(category_names, ensure_ascii=False)}

テキストデータ:
{texts_block}

要件:
- 各テキストを最も適切なカテゴリに分類
- 各カテゴリ内で共通パターンからサブカテゴリを発見（最大{max_depth - 1}階層）
- 各ノードにテキスト件数を記載

JSON形式で出力:
{{
    "root_categories": [
        {{
            "name": "カテゴリ名",
            "description": "説明",
            "text_count": 15,
            "text_indices": [0, 3, 7],
            "children": [
                {{
                    "name": "サブカテゴリ名",
                    "description": "説明",
                    "text_count": 8,
                    "text_indices": [0, 3],
                    "children": []
                }}
            ]
        }}
    ],
    "uncategorized_count": 2
}}"""

        try:
            response = await llm_orchestrator.invoke(pass2_prompt, TaskType.LABELING, max_tokens=4096)
            taxonomy = extract_json(response)
            if not isinstance(taxonomy, dict):
                taxonomy = {"root_categories": categories, "uncategorized_count": 0}
        except Exception as e:
            logger.warning("taxonomy_pass2_failed", error=str(e))
            taxonomy = {
                "root_categories": [
                    {"name": c["name"], "description": c["description"], "text_count": 0, "children": []}
                    for c in categories
                ],
                "uncategorized_count": len(classify_texts),
            }

        root_cats = taxonomy.get("root_categories", [])

        # key_findings
        key_findings = []
        for cat in root_cats:
            name = cat.get("name", "")
            count = cat.get("text_count", 0)
            children = cat.get("children", [])
            sub_names = ", ".join(c.get("name", "") for c in children[:3])
            finding = f"「{name}」: {count}件"
            if sub_names:
                finding += f" → サブカテゴリ: {sub_names}"
            key_findings.append(finding)

        uncat = taxonomy.get("uncategorized_count", 0)
        if uncat > 0:
            key_findings.append(f"未分類: {uncat}件")

        # evidence_refs: 各カテゴリの代表テキスト
        evidence_refs = []
        for cat in root_cats:
            for idx in cat.get("text_indices", [])[:2]:
                if 0 <= idx < len(classify_ids):
                    evidence_refs.append(
                        {
                            "record_id": classify_ids[idx],
                            "text": classify_texts[idx][:200],
                            "category": cat.get("name", ""),
                            "relevance": 1.0,
                        }
                    )

        return ToolResult(
            tool_name="taxonomy_generation",
            success=True,
            data=taxonomy,
            summary=(f"{len(root_cats)}個のトップカテゴリを生成。{classification_sample}件を分類（未分類: {uncat}件）"),
            key_findings=key_findings,
            evidence_refs=evidence_refs,
        )
