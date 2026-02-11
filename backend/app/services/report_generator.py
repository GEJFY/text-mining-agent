"""レポート生成サービス

テンプレートベースのレポート生成。PPTX/PDF/DOCX/Excel出力。
エビデンスリンク自動付与、インライン編集対応。
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.core.logging import get_logger
from app.models.schemas import ReportFormat, ReportRequest, ReportResponse, ReportTemplate
from app.services.llm_orchestrator import LLMOrchestrator, TaskType

logger = get_logger(__name__)

# テンプレート構成定義
TEMPLATE_SECTIONS: dict[ReportTemplate, list[str]] = {
    ReportTemplate.VOC: [
        "エグゼクティブサマリー",
        "感情トレンド分析",
        "クラスター分析結果",
        "主要テーマ別詳細",
        "改善提案",
    ],
    ReportTemplate.AUDIT: [
        "分析概要",
        "主要発見事項",
        "リスク評価",
        "統制上の懸念点",
        "推奨事項",
    ],
    ReportTemplate.COMPLIANCE: [
        "調査概要",
        "時系列分析",
        "キーワード共起分析",
        "リスク分類",
        "結論と提言",
    ],
    ReportTemplate.RISK: [
        "リスク分析概要",
        "リスク分類別集計",
        "ヒートマップ分析",
        "優先対応事項",
        "モニタリング計画",
    ],
}


class ReportGenerator:
    """レポート生成エンジン"""

    def __init__(self, llm: LLMOrchestrator) -> None:
        self.llm = llm
        self.output_dir = Path("reports")
        self.output_dir.mkdir(exist_ok=True)

    async def generate(
        self,
        request: ReportRequest,
        analysis_data: dict,
    ) -> ReportResponse:
        """レポートを生成"""
        report_id = str(uuid4())
        logger.info("report_start", report_id=report_id, template=request.template)

        # セクション構成の取得
        if request.template == ReportTemplate.CUSTOM:
            sections = await self._generate_custom_sections(request.custom_prompt or "")
        else:
            sections = TEMPLATE_SECTIONS.get(request.template, TEMPLATE_SECTIONS[ReportTemplate.VOC])

        # LLMでセクションコンテンツを生成
        report_content = await self._generate_sections(sections, analysis_data, request)

        # 出力形式に応じたファイル生成
        file_path = await self._export(report_id, report_content, request.output_format)

        return ReportResponse(
            report_id=report_id,
            download_url=f"/api/v1/reports/{report_id}/download",
            format=request.output_format,
            generated_at=datetime.now(timezone.utc),
        )

    async def _generate_sections(
        self,
        sections: list[str],
        analysis_data: dict,
        request: ReportRequest,
    ) -> list[dict]:
        """各セクションのコンテンツをLLMで生成"""
        contents = []

        for section_title in sections:
            prompt = f"""テキストマイニング分析レポートの「{section_title}」セクションを作成してください。

分析データ:
{json.dumps(analysis_data, ensure_ascii=False, default=str)[:3000]}

要件:
- ビジネスパーソン向けの明確な文章
- データに基づく具体的な記述
- 各記述にはエビデンス（根拠テキスト）の参照を含める
- 200-400字程度

JSON形式:
{{"title": "{section_title}", "content": "...", "evidence_refs": ["根拠1", "根拠2"]}}"""

            try:
                response = await self.llm.invoke(
                    prompt, TaskType.SUMMARIZATION, max_tokens=1000
                )
                data = json.loads(response.strip().strip("```json").strip("```"))
                contents.append(data)
            except Exception as e:
                logger.warning("section_generation_failed", section=section_title, error=str(e))
                contents.append({
                    "title": section_title,
                    "content": f"（セクション生成中にエラーが発生しました: {e}）",
                    "evidence_refs": [],
                })

        return contents

    async def _generate_custom_sections(self, custom_prompt: str) -> list[str]:
        """カスタムプロンプトからセクション構成を生成"""
        prompt = f"""以下の指示に基づいてレポートのセクション構成を設計してください。
指示: {custom_prompt}
JSON配列で5-7セクションのタイトルを出力: ["セクション1", "セクション2", ...]"""

        response = await self.llm.invoke(prompt, TaskType.LABELING, max_tokens=200)
        try:
            return json.loads(response.strip().strip("```json").strip("```"))
        except json.JSONDecodeError:
            return ["概要", "分析結果", "考察", "推奨事項"]

    async def _export(
        self, report_id: str, contents: list[dict], fmt: ReportFormat
    ) -> Path:
        """各形式でファイルを出力"""
        if fmt == ReportFormat.PPTX:
            return await self._export_pptx(report_id, contents)
        elif fmt == ReportFormat.PDF:
            return await self._export_pdf(report_id, contents)
        elif fmt == ReportFormat.DOCX:
            return await self._export_docx(report_id, contents)
        elif fmt == ReportFormat.EXCEL:
            return await self._export_excel(report_id, contents)
        raise ValueError(f"Unknown format: {fmt}")

    async def _export_pptx(self, report_id: str, contents: list[dict]) -> Path:
        """PowerPoint出力"""
        from pptx import Presentation
        from pptx.util import Inches, Pt

        prs = Presentation()

        # タイトルスライド
        slide = prs.slides.add_slide(prs.slide_layouts[0])
        slide.shapes.title.text = "NexusText AI 分析レポート"

        for section in contents:
            slide = prs.slides.add_slide(prs.slide_layouts[1])
            slide.shapes.title.text = section.get("title", "")
            body = slide.placeholders[1]
            body.text = section.get("content", "")

        path = self.output_dir / f"{report_id}.pptx"
        prs.save(str(path))
        return path

    async def _export_pdf(self, report_id: str, contents: list[dict]) -> Path:
        """PDF出力"""
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet

        path = self.output_dir / f"{report_id}.pdf"
        doc = SimpleDocTemplate(str(path), pagesize=A4)
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph("NexusText AI 分析レポート", styles["Title"]))
        story.append(Spacer(1, 20))

        for section in contents:
            story.append(Paragraph(section.get("title", ""), styles["Heading2"]))
            story.append(Paragraph(section.get("content", ""), styles["Normal"]))
            story.append(Spacer(1, 12))

        doc.build(story)
        return path

    async def _export_docx(self, report_id: str, contents: list[dict]) -> Path:
        """Word出力"""
        from docx import Document

        doc = Document()
        doc.add_heading("NexusText AI 分析レポート", level=0)

        for section in contents:
            doc.add_heading(section.get("title", ""), level=1)
            doc.add_paragraph(section.get("content", ""))

            refs = section.get("evidence_refs", [])
            if refs:
                doc.add_heading("エビデンス", level=2)
                for ref in refs:
                    doc.add_paragraph(f"• {ref}", style="List Bullet")

        path = self.output_dir / f"{report_id}.docx"
        doc.save(str(path))
        return path

    async def _export_excel(self, report_id: str, contents: list[dict]) -> Path:
        """Excel出力"""
        import openpyxl

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "レポート"

        ws.append(["セクション", "内容", "エビデンス"])
        for section in contents:
            ws.append([
                section.get("title", ""),
                section.get("content", ""),
                " | ".join(section.get("evidence_refs", [])),
            ])

        path = self.output_dir / f"{report_id}.xlsx"
        wb.save(str(path))
        return path
