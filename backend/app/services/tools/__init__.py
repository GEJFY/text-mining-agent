"""分析ツール群の登録

全ツールをAnalysisToolRegistryに一括登録する。
main.pyのlifespan起動時に呼び出す。
"""

import json
import re
from typing import Any

from app.services.analysis_registry import analysis_registry
from app.services.tools.cluster_tool import ClusterTool
from app.services.tools.cooccurrence_tool import CooccurrenceTool
from app.services.tools.sentiment_tool import SentimentTool


def extract_json(text: str) -> Any:
    """LLMレスポンスからJSONを堅牢に抽出

    1. 直接パース
    2. markdown fenceを除去してパース
    3. regex で最初の JSON 配列/オブジェクトを抽出してパース
    """
    text = text.strip()

    # 1. 直接パース
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. markdown fence除去
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", text)
    cleaned = re.sub(r"\n?```\s*$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 3. regex で JSON 配列またはオブジェクトを抽出
    for pattern in [r"\[[\s\S]*\]", r"\{[\s\S]*\}"]:
        match = re.search(pattern, text)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                continue

    raise json.JSONDecodeError("No valid JSON found in LLM response", text, 0)


def register_all_tools() -> None:
    """全分析ツールをレジストリに登録"""
    analysis_registry.register(ClusterTool())
    analysis_registry.register(SentimentTool())
    analysis_registry.register(CooccurrenceTool())

    # Sprint 7: 新規LLM分析ツール
    from app.services.tools.actionability import ActionabilityTool
    from app.services.tools.causal_chain import CausalChainTool
    from app.services.tools.contradiction import ContradictionTool
    from app.services.tools.taxonomy import TaxonomyTool

    analysis_registry.register(CausalChainTool())
    analysis_registry.register(ContradictionTool())
    analysis_registry.register(ActionabilityTool())
    analysis_registry.register(TaxonomyTool())
