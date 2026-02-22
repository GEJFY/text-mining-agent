"""自律型分析エージェントエンドポイント

Redis永続化 + DB からテキスト取得。
ツールレジストリ経由で分析を実行し、結果をAnalysisJobに保存。
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.agent_store import agent_store
from app.agents.analysis_agent import AgentContext, AnalysisAgent
from app.core.config import HITLMode
from app.core.database import get_db
from app.core.security import TokenData, UserRole, get_current_user, require_role
from app.models.schemas import AnalysisRequest, PipelineRequest
from app.services.data_import import get_texts_by_dataset

router = APIRouter()


@router.post("/start")
async def start_analysis(
    request: AnalysisRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(require_role(UserRole.ADMIN, UserRole.ANALYST)),
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
        db=db,
    )

    insights = await agent.run(context)

    # Redisに状態を保存
    await agent_store.save(
        agent.agent_id,
        {
            "state": agent.state.value,
            "dataset_id": request.dataset_id,
            "objective": request.objective,
            "insights": [i.model_dump() for i in insights],
            "pending_approval": agent.pending_approval,
            "logs": [log.model_dump() for log in agent.logs],
        },
    )

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
    _current_user: TokenData = Depends(require_role(UserRole.ADMIN, UserRole.ANALYST)),
) -> dict:
    """HITL: 仮説を承認して分析を再開"""
    saved = await agent_store.load(agent_id)
    if not saved:
        raise HTTPException(status_code=404, detail="Agent not found")

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
        db=db,
    )
    insights = await agent.resume_after_approval(context, approved_hypotheses)

    await agent_store.save(
        agent_id,
        {
            "state": agent.state.value,
            "dataset_id": dataset_id,
            "objective": saved.get("objective", ""),
            "insights": [i.model_dump() for i in insights],
            "pending_approval": agent.pending_approval,
            "logs": [log.model_dump() for log in agent.logs],
        },
    )

    return {
        "agent_id": agent_id,
        "state": agent.state.value,
        "insights": [i.model_dump() for i in insights],
        "logs": [log.model_dump() for log in agent.logs],
    }


@router.get("/{agent_id}/logs")
async def get_agent_logs(
    agent_id: str,
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """エージェントのログを取得（ポーリング用: insights, pending_approvalも返却）"""
    saved = await agent_store.load(agent_id)
    if not saved:
        raise HTTPException(status_code=404, detail="Agent not found")

    return {
        "agent_id": agent_id,
        "state": saved.get("state", "unknown"),
        "logs": saved.get("logs", []),
        "insights": saved.get("insights", []),
        "pending_approval": saved.get("pending_approval"),
    }


@router.post("/{agent_id}/save")
async def save_agent_session(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(require_role(UserRole.ADMIN, UserRole.ANALYST)),
) -> dict:
    """エージェント分析結果をDB永続化（Redis→DB）"""
    from app.models.orm import AgentSession

    saved = await agent_store.load(agent_id)
    if not saved:
        raise HTTPException(status_code=404, detail="Agent not found")

    session = AgentSession(
        id=agent_id,
        dataset_id=saved.get("dataset_id", ""),
        objective=saved.get("objective", ""),
        insights=saved.get("insights", []),
        logs=saved.get("logs", []),
        status=saved.get("state", "completed"),
    )
    db.add(session)
    await db.flush()

    return {"saved": True, "session_id": agent_id}


@router.get("/sessions/list")
async def list_agent_sessions(
    dataset_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """保存済みエージェントセッション一覧"""
    from sqlalchemy import select

    from app.models.orm import AgentSession

    query = select(AgentSession).order_by(AgentSession.created_at.desc())
    if dataset_id:
        query = query.where(AgentSession.dataset_id == dataset_id)
    result = await db.execute(query.limit(50))
    sessions = result.scalars().all()

    return {
        "sessions": [
            {
                "id": s.id,
                "dataset_id": s.dataset_id,
                "objective": s.objective,
                "status": s.status,
                "insight_count": len(s.insights) if isinstance(s.insights, list) else 0,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ]
    }


@router.get("/sessions/{session_id}")
async def get_agent_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """保存済みセッション詳細取得"""
    from sqlalchemy import select

    from app.models.orm import AgentSession

    result = await db.execute(select(AgentSession).where(AgentSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "id": session.id,
        "dataset_id": session.dataset_id,
        "objective": session.objective,
        "insights": session.insights,
        "logs": session.logs,
        "status": session.status,
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }


@router.post("/pipeline")
async def run_analysis_pipeline(
    request: PipelineRequest,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(require_role(UserRole.ADMIN, UserRole.ANALYST)),
) -> dict:
    """Agent → Analysis → Report 自動パイプライン"""
    from app.services.pipeline import run_pipeline

    result = await run_pipeline(request, db)
    return result.model_dump()
