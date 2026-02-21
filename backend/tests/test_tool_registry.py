"""Sprint 6: AnalysisToolRegistryテスト"""

import pytest

from app.services.analysis_registry import (
    AnalysisToolBase,
    AnalysisToolRegistry,
    ToolDefinition,
    ToolParameter,
    ToolResult,
)


class DummyTool(AnalysisToolBase):
    """テスト用ダミーツール"""

    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="dummy_tool",
            description="テスト用ダミーツール",
            parameters=[
                ToolParameter(
                    name="param1",
                    type="string",
                    description="テストパラメータ",
                    required=False,
                    default="default",
                ),
            ],
            category="test",
            requires_llm=False,
        )

    async def execute(self, dataset_id, db, **kwargs) -> ToolResult:
        return ToolResult(
            tool_name="dummy_tool",
            success=True,
            data={"result": "ok", "param1": kwargs.get("param1", "default")},
            summary="テスト完了",
            key_findings=["テスト結果1"],
            evidence_refs=[],
        )


class FailingTool(AnalysisToolBase):
    def definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="failing_tool",
            description="エラーを起こすツール",
            parameters=[],
            category="test",
            requires_llm=False,
        )

    async def execute(self, dataset_id, db, **kwargs) -> ToolResult:
        raise ValueError("意図的エラー")


def test_register_and_get():
    """ツール登録→取得"""
    registry = AnalysisToolRegistry()
    tool = DummyTool()
    registry.register(tool)

    got = registry.get("dummy_tool")
    assert got is not None
    assert got.definition().name == "dummy_tool"


def test_list_tools():
    """ツール一覧取得"""
    registry = AnalysisToolRegistry()
    registry.register(DummyTool())
    tools = registry.list_tools()
    assert len(tools) == 1
    assert tools[0].name == "dummy_tool"


def test_list_tools_for_llm():
    """LLM向けツール定義取得"""
    registry = AnalysisToolRegistry()
    registry.register(DummyTool())
    llm_tools = registry.list_tools_for_llm()
    assert len(llm_tools) == 1
    assert llm_tools[0]["name"] == "dummy_tool"
    assert "parameters" in llm_tools[0]


@pytest.mark.asyncio
async def test_execute_success():
    """ツール実行成功"""
    registry = AnalysisToolRegistry()
    registry.register(DummyTool())
    result = await registry.execute("dummy_tool", "ds-001", None, param1="custom")
    assert result.success is True
    assert result.data["param1"] == "custom"


@pytest.mark.asyncio
async def test_execute_not_found():
    """存在しないツール実行"""
    registry = AnalysisToolRegistry()
    result = await registry.execute("nonexistent", "ds-001", None)
    assert result.success is False
    assert "見つかりません" in (result.error or "")


@pytest.mark.asyncio
async def test_execute_error_handling():
    """ツール実行エラーのハンドリング"""
    registry = AnalysisToolRegistry()
    registry.register(FailingTool())
    result = await registry.execute("failing_tool", "ds-001", None)
    assert result.success is False
    assert "意図的エラー" in (result.error or "")
