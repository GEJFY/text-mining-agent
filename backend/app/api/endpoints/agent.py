"""自律型分析エージェントエンドポイント

Redis永続化 + DB からテキスト取得。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.agent_store import agent_store
from app.agents.analysis_agent import AgentContext, AnalysisAgent
from app.core.config import HITLMode
from app.core.database import get_db
from app.models.schemas import AnalysisRequest
from app.services.data_import import get_texts_by_dataset

router = APIRouter()


@router.post("/start")
async def start_analysis(
    request: AnalysisRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """自律分析を開始"""
    texts, record_ids, dates = await get_texts_by_dataset(request.dataset_id, db)
    if not texts:
        raise HTTPException(status_code=404, detail="Dataset not found or empty")

    agent = AnalysisAgent(hitl_mode=HITLMode(request.hitl_mode))

    context = AgentContext(
        dataset_id=request.dataset_id,
        objective=request.objective,
        texts=texts,
    )

    insights = await agent.run(context)

    # Redisに状態を保存
    await agent_store.save(agent.agent_id, {
        "state": agent.state.value,
        "dataset_id": request.dataset_id,
        "objective": request.objective,
        "insights": [i.model_dump() for i in insights],
        "pending_approval": agent.pending_approval,
        "logs": [log.model_dump() for log in agent.logs],
    })

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
    db: AsyncSession = Depends(get_db),
) -> dict:
    """HITL: 仮説を承認して分析を再開"""
    saved = await agent_store.load(agent_id)
    if not saved:
        raise HTTPException(status_code=404, detail="Agent not found")

    # データセットからテキストを再取得
    dataset_id = saved.get("dataset_id", "")
    texts, _, _ = await get_texts_by_dataset(dataset_id, db)
    if not texts:
        raise HTTPException(status_code=404, detail="Dataset not found or empty")

    agent = AnalysisAgent(hitl_mode=HITLMode.SEMI_AUTO)
    agent.agent_id = agent_id

    context = AgentContext(
        dataset_id=dataset_id,
        objective=saved.get("objective", ""),
        texts=texts,
    )
    insights = await agent.resume_after_approval(context, approved_hypotheses)

    # Redis更新
    await agent_store.save(agent_id, {
        "state": agent.state.value,
        "dataset_id": dataset_id,
        "objective": saved.get("objective", ""),
        "insights": [i.model_dump() for i in insights],
        "pending_approval": agent.pending_approval,
        "logs": [log.model_dump() for log in agent.logs],
    })

    return {
        "agent_id": agent_id,
        "state": agent.state.value,
        "insights": [i.model_dump() for i in insights],
        "logs": [log.model_dump() for log in agent.logs],
    }


@router.get("/{agent_id}/logs")
async def get_agent_logs(agent_id: str) -> dict:
    """エージェントのログを取得"""
    saved = await agent_store.load(agent_id)
    if not saved:
        raise HTTPException(status_code=404, detail="Agent not found")

    return {
        "agent_id": agent_id,
        "state": saved.get("state", "unknown"),
        "logs": saved.get("logs", []),
    }
