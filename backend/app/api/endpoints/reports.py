"""レポート生成エンドポイント"""

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.models.schemas import ReportRequest, ReportResponse
from app.services.llm_orchestrator import llm_orchestrator
from app.services.report_generator import ReportGenerator

router = APIRouter()


@router.post("/generate", response_model=ReportResponse)
async def generate_report(request: ReportRequest) -> ReportResponse:
    """レポートを生成"""
    generator = ReportGenerator(llm_orchestrator)
    analysis_data = {"message": "Analysis data from database"}  # placeholder
    return await generator.generate(request, analysis_data)


@router.get("/{report_id}/download")
async def download_report(report_id: str) -> FileResponse:
    """レポートをダウンロード"""
    from pathlib import Path

    # 出力ディレクトリからファイルを検索
    reports_dir = Path("reports")
    for ext in [".pdf", ".pptx", ".docx", ".xlsx"]:
        path = reports_dir / f"{report_id}{ext}"
        if path.exists():
            return FileResponse(
                path=str(path),
                filename=f"nexustext_report{ext}",
                media_type="application/octet-stream",
            )

    return FileResponse(path="not_found", status_code=404)
