"""自律型分析エージェント

観測→仮説→探索（ツール実行）→検証→統合の5フェーズ推論ループ。
HITL（Human-in-the-Loop）制御、Groundingスコアによる品質保証。
分析ツールレジストリ経由でクラスター・感情分析・因果連鎖等を動的に実行。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import numpy as np

from app.core.config import HITLMode
from app.core.logging import get_logger
from app.models.schemas import AgentInsight, AgentLogEntry, AgentPhase
from app.services.llm_orchestrator import LLMOrchestrator, TaskType

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.services.analysis_registry import ToolResult

logger = get_logger(__name__)


class AgentState(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    COMPLETED = "completed"
    ERROR = "error"


@dataclass
class AgentContext:
    """エージェントの実行コンテキスト"""

    dataset_id: str
    objective: str
    texts: list[str] = field(default_factory=list)
    attributes: dict[str, list] = field(default_factory=dict)
    db: Any = None  # AsyncSession（TYPE_CHECKINGのため Any）
    tool_results: list[Any] = field(default_factory=list)  # list[ToolResult]
    # 後方互換フィールド
    cluster_results: dict | None = None
    sentiment_results: dict | None = None
    cooccurrence_results: dict | None = None
    observations: list[str] = field(default_factory=list)
    hypotheses: list[str] = field(default_factory=list)
    findings: list[str] = field(default_factory=list)


@dataclass
class AnalysisAgent:
    """自律型テキスト分析エージェント"""

    agent_id: str = field(default_factory=lambda: str(uuid4()))
    state: AgentState = AgentState.IDLE
    hitl_mode: HITLMode = HITLMode.SEMI_AUTO
    logs: list[AgentLogEntry] = field(default_factory=list)
    insights: list[AgentInsight] = field(default_factory=list)
    pending_approval: dict | None = None

    def __post_init__(self) -> None:
        self.llm = LLMOrchestrator()

    def _log(
        self,
        phase: AgentPhase,
        thought: str,
        action: str | None = None,
        result: str | None = None,
        confidence: float = 0.0,
    ) -> None:
        """ログエントリを追加"""
        entry = AgentLogEntry(
            timestamp=datetime.now(UTC),
            phase=phase,
            thought=thought,
            action=action,
            result=result,
            confidence=confidence,
        )
        self.logs.append(entry)
        logger.info("agent_log", phase=phase, thought=thought[:100])

    async def run(self, context: AgentContext) -> list[AgentInsight]:
        """推論・実行ループのメインエントリポイント"""
        self.state = AgentState.RUNNING
        logger.info("agent_start", agent_id=self.agent_id, objective=context.objective)

        try:
            # Phase 1: 観測
            observations = await self._observe(context)

            # Phase 2: 仮説生成
            hypotheses = await self._hypothesize(context, observations)

            # HITL: Semi-Auto/Guidedの場合、仮説承認を待つ
            if self.hitl_mode in (HITLMode.SEMI_AUTO, HITLMode.GUIDED):
                self.state = AgentState.AWAITING_APPROVAL
                self.pending_approval = {
                    "phase": "hypothesize",
                    "hypotheses": hypotheses,
                    "message": "以下の仮説を検証してよろしいですか？",
                }
                return []  # 承認後にresumeで継続

            # Phase 3-5: 探索→検証→統合
            return await self._explore_verify_synthesize(context, hypotheses)

        except Exception as e:
            self.state = AgentState.ERROR
            logger.error("agent_error", error=str(e))
            raise

    async def resume_after_approval(self, context: AgentContext, approved_hypotheses: list[str]) -> list[AgentInsight]:
        """HITL承認後に推論を再開"""
        self.state = AgentState.RUNNING
        self.pending_approval = None
        return await self._explore_verify_synthesize(context, approved_hypotheses)

    async def _observe(self, context: AgentContext) -> list[str]:
        """Phase 1: データの統計・特徴をスキャン"""
        self._log(AgentPhase.OBSERVE, "データ全体の統計と特徴をスキャンします")

        stats: dict[str, Any] = {
            "total_texts": len(context.texts),
            "avg_length": float(np.mean([len(t) for t in context.texts])) if context.texts else 0,
            "attributes": list(context.attributes.keys()),
        }

        if context.cluster_results:
            stats["cluster_count"] = len(context.cluster_results.get("clusters", []))
        if context.sentiment_results:
            stats["sentiment_distribution"] = context.sentiment_results.get("distribution", {})

        prompt = f"""以下のデータ統計から、注目すべき特徴や偏りを3-5点で報告してください。

統計情報:
{json.dumps(stats, ensure_ascii=False, indent=2)}

サンプルテキスト(最初の5件):
{chr(10).join(f"- {t[:200]}" for t in context.texts[:5])}

JSON配列で出力: ["観測1", "観測2", ...]"""

        response = await self.llm.invoke(prompt, TaskType.LABELING)
        try:
            observations = json.loads(response.strip().strip("```json").strip("```"))
        except json.JSONDecodeError:
            observations = [response[:200]]

        context.observations = observations
        self._log(AgentPhase.OBSERVE, "観測完了", result=str(observations[:3]))
        return observations

    async def _hypothesize(self, context: AgentContext, observations: list[str]) -> list[str]:
        """Phase 2: 観測から検証可能な仮説を生成"""
        self._log(AgentPhase.HYPOTHESIZE, "観測結果から仮説を生成します")

        prompt = f"""以下の観測結果から、データ分析で検証可能な仮説を3つ生成してください。

分析目的: {context.objective or "自由探索"}

観測:
{chr(10).join(f"- {o}" for o in observations)}

各仮説は「〜ではないか？」の形式で、フィルタリング・セグメント分析・深堀りで検証可能なものにしてください。
JSON配列: ["仮説1", "仮説2", "仮説3"]"""

        response = await self.llm.invoke(prompt, TaskType.LABELING)
        try:
            hypotheses = json.loads(response.strip().strip("```json").strip("```"))
        except json.JSONDecodeError:
            hypotheses = [response[:200]]

        context.hypotheses = hypotheses
        self._log(AgentPhase.HYPOTHESIZE, "仮説生成完了", result=str(hypotheses))
        return hypotheses

    async def _explore_verify_synthesize(self, context: AgentContext, hypotheses: list[str]) -> list[AgentInsight]:
        """Phase 3-5: ツール選択→実行→検証→統合"""

        # Phase 3: ツール選択と実行
        exploration_results = await self._explore_with_tools(context, hypotheses)

        # Phase 4: 検証
        verification_results = await self._verify(context, hypotheses, exploration_results)

        # Phase 5: 統合
        return await self._synthesize(context, hypotheses, verification_results)

    async def _explore_with_tools(self, context: AgentContext, hypotheses: list[str]) -> list[dict]:
        """Phase 3: ツール選択→実行（Tool Use パターン）"""
        from app.services.analysis_registry import analysis_registry

        self._log(AgentPhase.EXPLORE, "仮説検証に最適な分析ツールを選択します")

        tool_definitions = analysis_registry.list_tools_for_llm()

        # LLMにツール選択を依頼
        plan_prompt = f"""以下の仮説を検証するために、利用可能な分析ツールから最適なものを選択してください。

仮説:
{chr(10).join(f"{i + 1}. {h}" for i, h in enumerate(hypotheses))}

データセット情報:
- テキスト件数: {len(context.texts)}件
- 平均文字数: {sum(len(t) for t in context.texts) / max(len(context.texts), 1):.0f}

利用可能な分析ツール:
{json.dumps(tool_definitions, ensure_ascii=False, indent=2)}

各仮説について実行すべきツールとパラメータをJSON配列で出力してください。
同一ツールの重複呼出しは避け、最大5ツールまで。
[{{"hypothesis_index": 0, "tool_name": "cluster_analysis", "parameters": {{"n_clusters": 5}}}}]"""

        try:
            response = await self.llm.invoke(plan_prompt, TaskType.LABELING, max_tokens=2000)
            tool_calls = json.loads(response.strip().strip("```json").strip("```"))
            if not isinstance(tool_calls, list):
                tool_calls = [tool_calls]
        except (json.JSONDecodeError, Exception) as e:
            logger.warning("tool_plan_parse_failed", error=str(e))
            # フォールバック: クラスター + 感情分析
            tool_calls = [
                {"hypothesis_index": 0, "tool_name": "cluster_analysis", "parameters": {}},
                {"hypothesis_index": 1, "tool_name": "sentiment_analysis", "parameters": {}},
            ]

        # 重複ツール除去（最大5件）
        seen_tools: set[str] = set()
        unique_calls = []
        for call in tool_calls:
            name = call.get("tool_name", "")
            if name not in seen_tools:
                seen_tools.add(name)
                unique_calls.append(call)
        tool_calls = unique_calls[:5]

        # ツール実行
        exploration_results = []
        for call in tool_calls:
            tool_name = call.get("tool_name", "")
            params = call.get("parameters", {})

            self._log(
                AgentPhase.EXPLORE,
                f"ツール実行: {tool_name}",
                action=json.dumps(params, ensure_ascii=False),
            )

            result = await analysis_registry.execute(
                tool_name=tool_name,
                dataset_id=context.dataset_id,
                db=context.db,
                **params,
            )
            context.tool_results.append(result)

            # AnalysisJobに保存
            if result.success and context.db:
                await self._save_tool_result(context.db, context.dataset_id, tool_name, params, result)

            exploration_results.append(
                {
                    "tool": tool_name,
                    "success": result.success,
                    "summary": result.summary,
                    "key_findings": result.key_findings,
                    "hypothesis_index": call.get("hypothesis_index"),
                    "error": result.error,
                }
            )

            self._log(
                AgentPhase.EXPLORE,
                f"ツール完了: {tool_name}",
                result=result.summary if result.success else f"エラー: {result.error}",
                confidence=0.8 if result.success else 0.2,
            )

        return exploration_results

    async def _save_tool_result(
        self, db: AsyncSession, dataset_id: str, tool_name: str, params: dict, result: ToolResult
    ) -> None:
        """ツール実行結果をAnalysisJobに永続化"""
        from app.models.orm import AnalysisJob

        job = AnalysisJob(
            id=str(uuid4()),
            dataset_id=dataset_id,
            analysis_type=tool_name,
            parameters=params,
            result=result.data,
            status="completed",
            completed_at=datetime.now(UTC),
        )
        db.add(job)
        await db.flush()

    async def _verify(
        self,
        context: AgentContext,
        hypotheses: list[str],
        exploration_results: list[dict],
    ) -> list[dict]:
        """Phase 4: ツール結果を元に仮説を検証"""
        self._log(AgentPhase.VERIFY, "ツール実行結果に基づき仮説を検証します")

        # ツール結果の要約を構築
        evidence_summary = []
        for tr in context.tool_results:
            if tr.success:
                evidence_summary.append(
                    {
                        "tool": tr.tool_name,
                        "summary": tr.summary,
                        "findings": tr.key_findings[:5],
                        "evidence_count": len(tr.evidence_refs),
                    }
                )

        verify_prompt = f"""以下の仮説を、分析ツールの実行結果に基づいて検証してください。

仮説:
{chr(10).join(f"{i + 1}. {h}" for i, h in enumerate(hypotheses))}

分析ツール実行結果:
{json.dumps(evidence_summary, ensure_ascii=False, indent=2)}

各仮説について、支持度(0.0-1.0)、支持する根拠、反証をJSON形式で出力:
[{{
    "hypothesis": "仮説テキスト",
    "support_score": 0.8,
    "supporting_evidence": ["根拠1", "根拠2"],
    "counter_evidence": ["反証1"],
    "verdict": "supported"
}}]

verdictは: "supported"（支持）, "partially_supported"（部分支持）, "refuted"（反証）, "inconclusive"（不明確）"""

        try:
            response = await self.llm.invoke(verify_prompt, TaskType.LABELING, max_tokens=4096)
            verification = json.loads(response.strip().strip("```json").strip("```"))
            if not isinstance(verification, list):
                verification = [verification]
        except (json.JSONDecodeError, Exception):
            verification = [
                {
                    "hypothesis": h,
                    "support_score": 0.5,
                    "supporting_evidence": [],
                    "counter_evidence": [],
                    "verdict": "inconclusive",
                }
                for h in hypotheses
            ]

        self._log(
            AgentPhase.VERIFY,
            "検証完了",
            result=json.dumps(
                [{"h": v.get("hypothesis", "")[:50], "v": v.get("verdict", "")} for v in verification],
                ensure_ascii=False,
            ),
        )
        return verification

    async def _synthesize(
        self,
        context: AgentContext,
        hypotheses: list[str],
        verification_results: list[dict],
    ) -> list[AgentInsight]:
        """Phase 5: 検証結果とツール結果をインサイトに統合"""
        self._log(AgentPhase.SYNTHESIZE, "発見事項をインサイトとして構造化します")

        # 全ツール結果のkey_findingsを集約
        all_findings = []
        for tr in context.tool_results:
            if tr.success:
                all_findings.extend(tr.key_findings[:3])

        # 全エビデンスを集約
        all_evidence = []
        for tr in context.tool_results:
            if tr.success:
                for ref in tr.evidence_refs[:5]:
                    all_evidence.append(ref.get("text", "")[:200])

        synthesis_prompt = f"""分析結果をアクショナブルなインサイトとしてまとめてください。

仮説検証結果:
{json.dumps(verification_results, ensure_ascii=False, indent=2)}

分析ツールの主要発見事項:
{chr(10).join(f"- {f}" for f in all_findings)}

エビデンス（原文テキスト抜粋）:
{chr(10).join(f"[E{i}] {e}" for i, e in enumerate(all_evidence[:15]))}

各インサイトには以下を含めてください:
- title: 端的なタイトル（20文字以内）
- description: 詳細説明（データに基づく具体的記述、200-400字）
- evidence: 根拠となるエビデンス参照 [E0], [E1] 等
- grounding_score: エビデンスの裏付け度合い（0.0-1.0）
- recommendations: 具体的な推奨アクション

JSON配列で出力:
[{{"title": "...", "description": "...", "evidence": ["[E0] ...", "[E2] ..."],
   "grounding_score": 0.85, "recommendations": ["推奨1", "推奨2"]}}]"""

        response = await self.llm.invoke(synthesis_prompt, TaskType.SUMMARIZATION)

        try:
            insights_data = json.loads(response.strip().strip("```json").strip("```"))
            self.insights = [
                AgentInsight(
                    title=i.get("title", ""),
                    description=i.get("description", ""),
                    evidence=i.get("evidence", []),
                    grounding_score=min(1.0, max(0.0, i.get("grounding_score", 0.5))),
                    recommendations=i.get("recommendations", []),
                )
                for i in insights_data
            ]
        except (json.JSONDecodeError, KeyError):
            self.insights = [
                AgentInsight(
                    title="分析結果",
                    description=response[:500],
                    evidence=[],
                    grounding_score=0.5,
                )
            ]

        self.state = AgentState.COMPLETED
        self._log(AgentPhase.SYNTHESIZE, "分析完了", result=f"{len(self.insights)}件のインサイト")
        return self.insights

    def compute_grounding_score(self, claim: str, source_texts: list[str]) -> float:
        """ハルシネーション検知: Groundingスコア算出"""
        from app.services.text_preprocessing import text_preprocessor

        claim_embedding = text_preprocessor.generate_embeddings([claim])
        source_embeddings = text_preprocessor.generate_embeddings(source_texts[:50])

        similarities = np.dot(claim_embedding, source_embeddings.T).flatten()
        return float(np.max(similarities)) if len(similarities) > 0 else 0.0
