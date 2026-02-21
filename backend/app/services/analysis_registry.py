"""分析ツールレジストリ

全分析サービスを統一インターフェースで公開。
エージェントからの動的呼び出し、およびレポート生成での統一的な結果参照を実現。
"""

from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from app.core.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)


@dataclass
class ToolParameter:
    """ツールパラメータ定義（LLMへの説明用）"""

    name: str
    type: str  # "string", "integer", "float", "boolean"
    description: str
    required: bool = True
    default: Any = None
    enum: list[str] | None = None


@dataclass
class ToolDefinition:
    """ツール定義（LLM Function Calling形式に変換可能）"""

    name: str
    description: str
    parameters: list[ToolParameter]
    category: str  # "statistical", "llm_based", "network"
    requires_llm: bool = True


@dataclass
class ToolResult:
    """ツール実行結果の統一形式"""

    tool_name: str
    success: bool
    data: dict  # 分析結果の全体
    summary: str  # LLMが生成した1-2文の要約
    key_findings: list[str]  # 主要発見事項のリスト
    evidence_refs: list[dict]  # {"record_id": "...", "text": "...", "relevance": 0.9}
    error: str | None = None


class AnalysisToolBase(abc.ABC):
    """分析ツールの基底クラス"""

    @abc.abstractmethod
    def definition(self) -> ToolDefinition:
        """ツール定義を返す（LLM提示用）"""
        ...

    @abc.abstractmethod
    async def execute(
        self,
        dataset_id: str,
        db: AsyncSession,
        **kwargs: Any,
    ) -> ToolResult:
        """ツールを実行して結果を返す"""
        ...


class AnalysisToolRegistry:
    """分析ツールの登録・検索・呼び出しを管理するレジストリ"""

    def __init__(self) -> None:
        self._tools: dict[str, AnalysisToolBase] = {}

    def register(self, tool: AnalysisToolBase) -> None:
        defn = tool.definition()
        self._tools[defn.name] = tool
        logger.info("tool_registered", name=defn.name, category=defn.category)

    def get(self, name: str) -> AnalysisToolBase | None:
        return self._tools.get(name)

    def list_tools(self) -> list[ToolDefinition]:
        return [t.definition() for t in self._tools.values()]

    def list_tools_for_llm(self) -> list[dict]:
        """LLM Function Calling形式のツール定義リストを返す"""
        tools = []
        for tool in self._tools.values():
            defn = tool.definition()
            properties: dict[str, Any] = {}
            required: list[str] = []
            for p in defn.parameters:
                prop: dict[str, Any] = {"type": p.type, "description": p.description}
                if p.enum:
                    prop["enum"] = p.enum
                if p.default is not None:
                    prop["default"] = p.default
                properties[p.name] = prop
                if p.required:
                    required.append(p.name)

            tools.append(
                {
                    "name": defn.name,
                    "description": defn.description,
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "required": required,
                    },
                }
            )
        return tools

    async def execute(
        self,
        tool_name: str,
        dataset_id: str,
        db: AsyncSession,
        **kwargs: Any,
    ) -> ToolResult:
        """名前指定でツールを実行"""
        tool = self._tools.get(tool_name)
        if not tool:
            return ToolResult(
                tool_name=tool_name,
                success=False,
                data={},
                summary="",
                key_findings=[],
                evidence_refs=[],
                error=f"Unknown tool: {tool_name}",
            )
        try:
            return await tool.execute(dataset_id, db, **kwargs)
        except Exception as e:
            logger.error("tool_execution_failed", tool=tool_name, error=str(e))
            return ToolResult(
                tool_name=tool_name,
                success=False,
                data={},
                summary="",
                key_findings=[],
                evidence_refs=[],
                error=str(e),
            )


# シングルトン
analysis_registry = AnalysisToolRegistry()
