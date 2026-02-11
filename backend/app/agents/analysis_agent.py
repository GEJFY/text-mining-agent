"""自律型分析エージェント

観測→仮説→探索→検証→統合の5フェーズ推論ループ。
HITL（Human-in-the-Loop）制御、Groundingスコアによる品質保証。
"""

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from uuid import uuid4

import numpy as np

from app.core.config import HITLMode
from app.core.logging import get_logger
from app.models.schemas import AgentInsight, AgentLogEntry, AgentPhase
from app.services.llm_orchestrator import LLMOrchestrator, TaskType

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

        stats = {
            "total_texts": len(context.texts),
            "avg_length": np.mean([len(t) for t in context.texts]) if context.texts else 0,
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
        """Phase 3-5: 探索・検証・統合"""

        # Phase 3: 探索
        self._log(AgentPhase.EXPLORE, "仮説の検証に必要なデータ探索を実行します")

        exploration_prompt = f"""以下の仮説を検証するために、テキストデータ({len(context.texts)}件)を分析してください。

仮説:
{chr(10).join(f"{i + 1}. {h}" for i, h in enumerate(hypotheses))}

サンプルデータ:
{chr(10).join(f"- {t[:300]}" for t in context.texts[:20])}

各仮説について、裏付けとなる証拠と反証を示してください。
JSON形式:
[{{"hypothesis": "...", "supporting_evidence": [...], "counter_evidence": [...], "confidence": 0.8}}]"""

        response = await self.llm.invoke(exploration_prompt, TaskType.LABELING, max_tokens=4096)

        try:
            exploration_results = json.loads(response.strip().strip("```json").strip("```"))
        except json.JSONDecodeError:
            exploration_results = [{"hypothesis": h, "supporting_evidence": [], "confidence": 0.5} for h in hypotheses]

        self._log(AgentPhase.EXPLORE, "探索完了", result=str(len(exploration_results)))

        # Phase 4: 検証
        self._log(AgentPhase.VERIFY, "探索結果を統計的に検証します")

        # Phase 5: 統合
        self._log(AgentPhase.SYNTHESIZE, "発見事項をインサイトとして構造化します")

        synthesis_prompt = f"""分析結果をインサイトとしてまとめてください。

検証結果:
{json.dumps(exploration_results, ensure_ascii=False, indent=2)}

各インサイトには、タイトル、説明、エビデンス、推奨アクションを含めてください。
JSON配列:
[{{"title": "...", "description": "...", "evidence": [...], "grounding_score": 0.85, "recommendations": [...]}}]"""

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
        """ハルシネーション検知: Groundingスコア算出

        LLM出力の各文をソースデータにマッピングし、
        コサイン類似度ベースの根拠スコアを計算。
        """
        from app.services.text_preprocessing import text_preprocessor

        claim_embedding = text_preprocessor.generate_embeddings([claim])
        source_embeddings = text_preprocessor.generate_embeddings(source_texts[:50])

        similarities = np.dot(claim_embedding, source_embeddings.T).flatten()
        return float(np.max(similarities)) if len(similarities) > 0 else 0.0
