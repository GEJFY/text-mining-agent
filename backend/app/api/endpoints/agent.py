"""自律型分析エージェントエンドポイント"""

from fastapi import APIRouter

from app.agents.analysis_agent import AgentContext, AnalysisAgent
from app.core.config import HITLMode
from app.models.schemas import AnalysisRequest

router = APIRouter()

# エージェントインスタンス管理（実運用ではRedis等で永続化）
_agents: dict[str, AnalysisAgent] = {}


@router.post("/start")
async def start_analysis(request: AnalysisRequest) -> dict:
    """自律分析を開始"""
    agent = AnalysisAgent(hitl_mode=HITLMode(request.hitl_mode))
    _agents[agent.agent_id] = agent

    context = AgentContext(
        dataset_id=request.dataset_id,
        objective=request.objective,
        texts=["サンプル"],  # 実運用ではDB取得
    )

    insights = await agent.run(context)

    return {
        "agent_id": agent.agent_id,
        "state": agent.state.value,
        "insights": [i.model_dump() for i in insights],
        "pending_approval": agent.pending_approval,
        "logs": [log.model_dump() for log in agent.logs],
    }


@router.post("/{agent_id}/approve")
async def approve_hypotheses(
    agent_id: str,
    approved_hypotheses: list[str],
) -> dict:
    """HITL: 仮説を承認して分析を再開"""
    agent = _agents.get(agent_id)
    if not agent:
        return {"error": "Agent not found"}

    context = AgentContext(dataset_id="", objective="", texts=["サンプル"])
    insights = await agent.resume_after_approval(context, approved_hypotheses)

    return {
        "agent_id": agent_id,
        "state": agent.state.value,
        "insights": [i.model_dump() for i in insights],
        "logs": [log.model_dump() for log in agent.logs],
    }


@router.get("/{agent_id}/logs")
async def get_agent_logs(agent_id: str) -> dict:
    """エージェントのログを取得"""
    agent = _agents.get(agent_id)
    if not agent:
        return {"error": "Agent not found"}

    return {
        "agent_id": agent_id,
        "state": agent.state.value,
        "logs": [log.model_dump() for log in agent.logs],
    }
