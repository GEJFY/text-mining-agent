"""レポート生成エンドポイント

AnalysisJobテーブルから分析結果を取得してレポート生成。
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.orm import AnalysisJob
from app.models.schemas import ReportRequest, ReportResponse
from app.services.llm_orchestrator import llm_orchestrator
from app.services.report_generator import ReportGenerator

router = APIRouter()


@router.post("/generate", response_model=ReportResponse)
async def generate_report(
    request: ReportRequest,
    db: AsyncSession = Depends(get_db),
) -> ReportResponse:
    """レポートを生成"""
    # データセットの分析結果をDBから取得
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

    if not analysis_data:
        analysis_data = {"message": "No analysis results found. Run analysis first."}

    generator = ReportGenerator(llm_orchestrator)
    return await generator.generate(request, analysis_data)


@router.get("/{report_id}/download")
async def download_report(report_id: str) -> FileResponse:
    """レポートをダウンロード"""
    from pathlib import Path

    reports_dir = Path("reports")
    for ext in [".pdf", ".pptx", ".docx", ".xlsx"]:
        path = reports_dir / f"{report_id}{ext}"
        if path.exists():
            return FileResponse(
                path=str(path),
                filename=f"nexustext_report{ext}",
                media_type="application/octet-stream",
            )

    raise HTTPException(status_code=404, detail="Report file not found")
