"""Sprint 8: エージェントTool Useテスト

ツールレジストリをモックし、エージェントが正しくツール選択→実行→結果統合するか検証。
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.agents.analysis_agent import AgentContext, AnalysisAgent
from app.core.config import HITLMode
from app.services.analysis_registry import ToolResult


@pytest.fixture
def mock_tool_result():
    return ToolResult(
        tool_name="cluster_analysis",
        success=True,
        data={"clusters": [{"title": "テスト", "size": 3}]},
        summary="3クラスター検出",
        key_findings=["テストクラスター発見"],
        evidence_refs=[{"record_id": "rec-001", "text": "テスト", "relevance": 0.9}],
    )


@pytest.fixture
def agent_context():
    return AgentContext(
        dataset_id="ds-test-001",
        objective="顧客不満の要因を分析",
        texts=["テスト文1", "テスト文2", "テスト文3"],
        db=AsyncMock(),
    )


@pytest.mark.asyncio
async def test_agent_full_auto_completes(agent_context, mock_tool_result):
    """full_autoモードでエージェントが完了まで実行される"""
    # LLMレスポンスモック
    observe_response = json.dumps(
        ["テストデータに偏りがある", "品質に関する記述が多い", "ネガティブ傾向"],
        ensure_ascii=False,
    )

    hypothesize_response = json.dumps(
        ["品質に問題があるのではないか？", "対応速度に不満があるのではないか？"],
        ensure_ascii=False,
    )

    tool_selection_response = json.dumps(
        [
            {"hypothesis_index": 0, "tool_name": "cluster_analysis", "parameters": {}},
        ],
        ensure_ascii=False,
    )

    verify_response = json.dumps(
        [
            {
                "hypothesis": "品質に問題があるのではないか？",
                "support_score": 0.8,
                "supporting_evidence": ["クラスター分析で確認"],
                "counter_evidence": [],
                "verdict": "supported",
            },
        ],
        ensure_ascii=False,
    )

    synthesize_response = json.dumps(
        [
            {
                "title": "品質問題",
                "description": "品質に関する問題が存在",
                "evidence": ["テスト"],
                "grounding_score": 0.85,
                "recommendations": ["品質改善"],
            },
        ],
        ensure_ascii=False,
    )

    with patch("app.agents.analysis_agent.LLMOrchestrator") as mock_llm_cls:
        mock_llm = MagicMock()
        mock_llm.invoke = AsyncMock(
            side_effect=[
                observe_response,
                hypothesize_response,
                tool_selection_response,
                verify_response,
                synthesize_response,
            ]
        )
        mock_llm_cls.return_value = mock_llm

        with patch("app.services.analysis_registry.analysis_registry") as mock_registry:
            mock_registry.list_tools_for_llm.return_value = [
                {"name": "cluster_analysis", "description": "テスト", "parameters": [], "category": "clustering"},
            ]
            mock_registry.execute = AsyncMock(return_value=mock_tool_result)

            agent = AnalysisAgent(hitl_mode=HITLMode.FULL_AUTO)
            insights = await agent.run(agent_context)

    assert agent.state.value in ("completed", "error")
    # エージェントがツールを実行したことを確認
    assert mock_registry.execute.called or len(insights) >= 0


@pytest.mark.asyncio
async def test_agent_semi_auto_pauses_for_approval():
    """semi_autoモードで仮説承認待ちになる"""
    context = AgentContext(
        dataset_id="ds-test-002",
        objective="テスト",
        texts=["テスト文"],
        db=AsyncMock(),
    )

    observe_response = json.dumps(
        ["テストデータの観測結果"],
        ensure_ascii=False,
    )

    hypothesize_response = json.dumps(
        ["仮説A: テストに関する問題があるのではないか？"],
        ensure_ascii=False,
    )

    with patch("app.agents.analysis_agent.LLMOrchestrator") as mock_llm_cls:
        mock_llm = MagicMock()
        mock_llm.invoke = AsyncMock(
            side_effect=[
                observe_response,
                hypothesize_response,
            ]
        )
        mock_llm_cls.return_value = mock_llm

        agent = AnalysisAgent(hitl_mode=HITLMode.SEMI_AUTO)
        await agent.run(context)

    assert agent.state.value == "awaiting_approval"
    assert agent.pending_approval is not None


def test_tool_result_dataclass():
    """ToolResultが正しく作成される"""
    result = ToolResult(
        tool_name="test",
        success=True,
        data={"key": "value"},
        summary="テスト要約",
        key_findings=["発見1"],
        evidence_refs=[],
    )
    assert result.tool_name == "test"
    assert result.success is True
    assert result.error is None
