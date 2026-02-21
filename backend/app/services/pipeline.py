"""Agent → Analysis → Report 自動パイプライン

エージェント分析実行 → AnalysisJob集約 → レポート生成を一括実行。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select

from app.agents.analysis_agent import AgentContext, AnalysisAgent
from app.core.config import HITLMode
from app.core.logging import get_logger
from app.models.orm import AnalysisJob
from app.models.schemas import (
    PipelineRequest,
    PipelineResponse,
    ReportRequest,
)
from app.services.data_import import get_texts_by_dataset
from app.services.llm_orchestrator import llm_orchestrator
from app.services.report_generator import ReportGenerator

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)


async def run_pipeline(
    request: PipelineRequest,
    db: AsyncSession,
) -> PipelineResponse:
    """Agent → Analysis → Report パイプラインを実行"""
    logger.info(
        "pipeline_start",
        dataset_id=request.dataset_id,
        objective=request.objective,
    )

    # 1. テキスト取得
    texts, _record_ids, _dates = await get_texts_by_dataset(request.dataset_id, db)
    if not texts:
        return PipelineResponse(
            agent_id="",
            insights=[],
            analysis_jobs=[],
            report_id=None,
            report_download_url=None,
        )

    # 2. Agent実行（full_auto → ツール実行 → AnalysisJob保存）
    agent = AnalysisAgent(hitl_mode=HITLMode.FULL_AUTO)
    context = AgentContext(
        dataset_id=request.dataset_id,
        objective=request.objective,
        texts=texts,
        db=db,
    )
    insights = await agent.run(context)

    # 3. AnalysisJob集約
    result = await db.execute(
        select(AnalysisJob)
        .where(AnalysisJob.dataset_id == request.dataset_id)
        .where(AnalysisJob.status == "completed")
        .order_by(AnalysisJob.created_at.desc())
    )
    jobs = result.scalars().all()

    analysis_data: dict = {}
    for job in jobs:
        analysis_data[job.analysis_type] = {
            "id": job.id,
            "parameters": job.parameters,
            "result": job.result,
            "created_at": job.created_at.isoformat() if job.created_at else None,
        }

    job_ids = [job.id for job in jobs]

    # 4. レポート生成
    report_id = None
    download_url = None
    if analysis_data:
        try:
            generator = ReportGenerator(llm_orchestrator)
            report_request = ReportRequest(
                dataset_id=request.dataset_id,
                template=request.template,
                output_format=request.output_format,
            )
            report_response = await generator.generate(report_request, analysis_data)
            report_id = report_response.report_id
            download_url = report_response.download_url
        except Exception as e:
            logger.warning("pipeline_report_failed", error=str(e))

    logger.info(
        "pipeline_complete",
        agent_id=agent.agent_id,
        insights_count=len(insights),
        jobs_count=len(job_ids),
        report_id=report_id,
    )

    return PipelineResponse(
        agent_id=agent.agent_id,
        insights=insights,
        analysis_jobs=job_ids,
        report_id=report_id,
        report_download_url=download_url,
    )
