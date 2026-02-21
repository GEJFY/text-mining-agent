"""Sprint 7: 新LLM分析ツール4種のテスト

LLMをモックして各ツールのJSON解析・ToolResult生成を検証。
"""

import json
from unittest.mock import AsyncMock, patch

import pytest


@pytest.fixture
def mock_db():
    """ダミーDBセッション"""
    return AsyncMock()


@pytest.fixture
def sample_texts():
    return ["顧客対応が遅い", "品質は良いが価格が高い", "サポートが丁寧で助かった"]


@pytest.fixture
def sample_record_ids():
    return ["rec-001", "rec-002", "rec-003"]


def _patch_get_texts(texts, record_ids):
    """get_texts_by_datasetのモック"""
    return patch(
        "app.services.data_import.get_texts_by_dataset",
        new_callable=AsyncMock,
        return_value=(texts, record_ids, [None] * len(texts)),
    )


# === 因果連鎖 ===


@pytest.mark.asyncio
async def test_causal_chain_tool(mock_db, sample_texts, sample_record_ids):
    """因果連鎖ツールが正しいToolResultを返す"""
    llm_response = json.dumps(
        [
            {
                "chain": ["対応遅延", "顧客不満", "解約増加"],
                "confidence": 0.8,
                "supporting_text_indices": [0],
                "explanation": "対応の遅れが不満を引き起こす",
            }
        ],
        ensure_ascii=False,
    )

    with (
        _patch_get_texts(sample_texts, sample_record_ids),
        patch("app.services.tools.causal_chain.llm_orchestrator") as mock_llm,
    ):
        mock_llm.invoke = AsyncMock(return_value=llm_response)

        from app.services.tools.causal_chain import CausalChainTool

        tool = CausalChainTool()
        result = await tool.execute("ds-001", mock_db)

    assert result.success is True
    assert result.tool_name == "causal_chain_analysis"
    assert len(result.key_findings) > 0
    assert "chains" in result.data


# === 矛盾検出 ===


@pytest.mark.asyncio
async def test_contradiction_tool(mock_db, sample_texts, sample_record_ids):
    """矛盾検出ツールが正しいToolResultを返す"""
    llm_response = json.dumps(
        [
            {
                "statement_a": "品質は良い",
                "statement_b": "品質に問題がある",
                "index_a": 1,
                "index_b": 0,
                "contradiction_type": "direct",
                "confidence": 0.7,
            }
        ],
        ensure_ascii=False,
    )

    with (
        _patch_get_texts(sample_texts, sample_record_ids),
        patch("app.services.tools.contradiction.llm_orchestrator") as mock_llm,
    ):
        mock_llm.invoke = AsyncMock(return_value=llm_response)

        from app.services.tools.contradiction import ContradictionTool

        tool = ContradictionTool()
        result = await tool.execute("ds-001", mock_db)

    assert result.success is True
    assert result.tool_name == "contradiction_detection"
    assert "contradictions" in result.data


# === アクショナビリティ ===


@pytest.mark.asyncio
async def test_actionability_tool(mock_db, sample_texts, sample_record_ids):
    """アクショナビリティスコアリングツールが正しいToolResultを返す"""
    llm_response = json.dumps(
        [
            {
                "index": 0,
                "specificity": 0.8,
                "urgency": 0.7,
                "feasibility": 0.6,
                "impact": 0.9,
                "overall": 0.75,
                "category": "immediate",
                "suggested_actions": ["対応速度改善"],
            }
        ],
        ensure_ascii=False,
    )

    with (
        _patch_get_texts(sample_texts, sample_record_ids),
        patch("app.services.tools.actionability.llm_orchestrator") as mock_llm,
    ):
        mock_llm.invoke = AsyncMock(return_value=llm_response)

        from app.services.tools.actionability import ActionabilityTool

        tool = ActionabilityTool()
        result = await tool.execute("ds-001", mock_db)

    assert result.success is True
    assert result.tool_name == "actionability_scoring"
    assert "items" in result.data


# === タクソノミー ===


@pytest.mark.asyncio
async def test_taxonomy_tool(mock_db, sample_texts, sample_record_ids):
    """タクソノミー生成ツールが正しいToolResultを返す"""
    pass1_response = json.dumps(
        [
            {"name": "サービス", "description": "サービス関連"},
            {"name": "品質", "description": "品質関連"},
        ],
        ensure_ascii=False,
    )

    pass2_response = json.dumps(
        {
            "root_categories": [
                {
                    "name": "サービス",
                    "description": "サービス関連",
                    "text_count": 2,
                    "text_indices": [0, 2],
                    "children": [],
                },
                {"name": "品質", "description": "品質関連", "text_count": 1, "text_indices": [1], "children": []},
            ],
            "uncategorized_count": 0,
        },
        ensure_ascii=False,
    )

    with (
        _patch_get_texts(sample_texts, sample_record_ids),
        patch("app.services.tools.taxonomy.llm_orchestrator") as mock_llm,
    ):
        mock_llm.invoke = AsyncMock(side_effect=[pass1_response, pass2_response])

        from app.services.tools.taxonomy import TaxonomyTool

        tool = TaxonomyTool()
        result = await tool.execute("ds-001", mock_db)

    assert result.success is True
    assert result.tool_name == "taxonomy_generation"
    assert "root_categories" in result.data
    assert len(result.data["root_categories"]) == 2
