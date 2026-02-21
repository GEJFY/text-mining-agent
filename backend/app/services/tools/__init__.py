"""分析ツール群の登録

全ツールをAnalysisToolRegistryに一括登録する。
main.pyのlifespan起動時に呼び出す。
"""

from app.services.analysis_registry import analysis_registry
from app.services.tools.cluster_tool import ClusterTool
from app.services.tools.cooccurrence_tool import CooccurrenceTool
from app.services.tools.sentiment_tool import SentimentTool


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
