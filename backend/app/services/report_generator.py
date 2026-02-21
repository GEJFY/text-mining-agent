"""レポート生成サービス

テンプレートベースのレポート生成。PPTX/PDF/DOCX/Excel出力。
セクション別データルーティング、実エビデンス参照、セクション間コンテキスト共有。
"""

import json
from datetime import UTC, datetime
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

# セクション→分析タイプのマッピング
SECTION_DATA_MAP: dict[str, list[str]] = {
    # VOC
    "エグゼクティブサマリー": [
        "cluster",
        "cluster_analysis",
        "sentiment",
        "sentiment_analysis",
        "causal_chain_analysis",
        "taxonomy_generation",
    ],
    "感情トレンド分析": ["sentiment", "sentiment_analysis"],
    "クラスター分析結果": ["cluster", "cluster_analysis"],
    "主要テーマ別詳細": [
        "cluster",
        "cluster_analysis",
        "taxonomy_generation",
        "cooccurrence",
        "cooccurrence_analysis",
    ],
    "改善提案": [
        "actionability_scoring",
        "causal_chain_analysis",
        "contradiction_detection",
    ],
    # AUDIT
    "分析概要": [
        "cluster",
        "cluster_analysis",
        "sentiment",
        "sentiment_analysis",
    ],
    "主要発見事項": [
        "cluster_analysis",
        "causal_chain_analysis",
        "contradiction_detection",
        "taxonomy_generation",
    ],
    "リスク評価": [
        "sentiment_analysis",
        "actionability_scoring",
        "causal_chain_analysis",
    ],
    "統制上の懸念点": [
        "contradiction_detection",
        "causal_chain_analysis",
    ],
    "推奨事項": ["actionability_scoring", "causal_chain_analysis"],
    # COMPLIANCE
    "調査概要": [
        "cluster_analysis",
        "sentiment_analysis",
        "taxonomy_generation",
    ],
    "時系列分析": ["sentiment_analysis", "cluster_analysis"],
    "キーワード共起分析": ["cooccurrence", "cooccurrence_analysis"],
    "リスク分類": [
        "taxonomy_generation",
        "actionability_scoring",
        "contradiction_detection",
    ],
    "結論と提言": ["actionability_scoring", "causal_chain_analysis"],
    # RISK
    "リスク分析概要": [
        "cluster_analysis",
        "sentiment_analysis",
        "taxonomy_generation",
    ],
    "リスク分類別集計": ["taxonomy_generation", "cluster_analysis"],
    "ヒートマップ分析": [
        "sentiment_analysis",
        "actionability_scoring",
    ],
    "優先対応事項": ["actionability_scoring", "causal_chain_analysis"],
    "モニタリング計画": [
        "causal_chain_analysis",
        "contradiction_detection",
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

        # エビデンステキストを事前抽出
        evidence_pool = self._extract_evidence_texts(analysis_data)

        # LLMでセクションコンテンツを生成（セクション間コンテキスト共有）
        report_content = await self._generate_sections(sections, analysis_data, request, evidence_pool)

        # 出力形式に応じたファイル生成
        await self._export(report_id, report_content, request.output_format)

        return ReportResponse(
            report_id=report_id,
            download_url=f"/api/v1/reports/{report_id}/download",
            format=request.output_format,
            generated_at=datetime.now(UTC),
        )

    def _extract_evidence_texts(self, analysis_data: dict) -> list[dict]:
        """分析データからエビデンステキストを収集"""
        evidence = []
        idx = 1

        for atype, adata in analysis_data.items():
            if not isinstance(adata, dict):
                continue
            result = adata.get("result", adata)

            # クラスター分析の代表テキスト
            for cluster in result.get("clusters", []):
                for text in cluster.get("centroid_texts", [])[:2]:
                    evidence.append(
                        {
                            "id": f"E-{idx}",
                            "text": text[:200] if isinstance(text, str) else str(text)[:200],
                            "source": atype,
                            "context": f"クラスター「{cluster.get('title', '')}」",
                        }
                    )
                    idx += 1

            # 感情分析のハイライト
            for h in result.get("highlights", []):
                evidence.append(
                    {
                        "id": f"E-{idx}",
                        "text": h.get("text", "")[:200],
                        "source": atype,
                        "context": f"感情: {h.get('sentiment', '')}",
                    }
                )
                idx += 1

            # 因果連鎖の説明
            for chain in result.get("chains", []):
                chain_str = " → ".join(chain.get("chain", []))
                evidence.append(
                    {
                        "id": f"E-{idx}",
                        "text": chain.get("explanation", chain_str)[:200],
                        "source": atype,
                        "context": f"因果連鎖: {chain_str[:50]}",
                    }
                )
                idx += 1

            # 矛盾検出
            for c in result.get("contradictions", []):
                evidence.append(
                    {
                        "id": f"E-{idx}",
                        "text": f"{c.get('statement_a', '')} vs {c.get('statement_b', '')}",
                        "source": atype,
                        "context": f"矛盾: {c.get('contradiction_type', '')}",
                    }
                )
                idx += 1

            # アクショナビリティ上位
            for item in result.get("items", [])[:5]:
                if item.get("score", 0) >= 0.7:
                    evidence.append(
                        {
                            "id": f"E-{idx}",
                            "text": item.get("text_preview", "")[:200],
                            "source": atype,
                            "context": f"アクション優先度: {item.get('score', 0):.1f}",
                        }
                    )
                    idx += 1

        return evidence[:30]  # 最大30件

    def _format_section_data(self, section_title: str, analysis_data: dict) -> str:
        """セクションに関連する分析データを人間可読な要約に変換"""
        relevant_types = SECTION_DATA_MAP.get(section_title, [])
        parts = []

        for atype in relevant_types:
            adata = analysis_data.get(atype)
            if not adata or not isinstance(adata, dict):
                continue
            result = adata.get("result", adata)

            if atype in ("cluster", "cluster_analysis"):
                clusters = result.get("clusters", [])
                if clusters:
                    lines = [f"[クラスター分析] {len(clusters)}クラスター検出"]
                    for c in clusters[:8]:
                        title = c.get("title", f"Cluster {c.get('cluster_id', '?')}")
                        size = c.get("size", 0)
                        summary = c.get("summary", "")[:100]
                        lines.append(f"  - {title} ({size}件): {summary}")
                    parts.append("\n".join(lines))

            elif atype in ("sentiment", "sentiment_analysis"):
                dist = result.get("distribution", {})
                highlights = result.get("highlights", [])
                if dist or highlights:
                    lines = ["[感情分析]"]
                    if dist:
                        for k, v in dist.items():
                            lines.append(f"  - {k}: {v}")
                    for h in highlights[:5]:
                        lines.append(f"  ★ {h.get('text', '')[:80]} → {h.get('sentiment', '')}")
                    parts.append("\n".join(lines))

            elif atype in ("cooccurrence", "cooccurrence_analysis"):
                nodes = result.get("nodes", [])
                communities = result.get("communities", {})
                if nodes:
                    top5 = sorted(nodes, key=lambda n: n.get("degree_centrality", 0), reverse=True)[:5]
                    lines = [f"[共起ネットワーク] {len(nodes)}ノード"]
                    for n in top5:
                        lines.append(f"  - {n.get('word', '')}: 出現{n.get('frequency', 0)}回")
                    for cid, words in list(communities.items())[:3]:
                        lines.append(f"  コミュニティ{cid}: {', '.join(words[:5])}")
                    parts.append("\n".join(lines))

            elif atype == "causal_chain_analysis":
                chains = result.get("chains", [])
                if chains:
                    lines = [f"[因果連鎖] {len(chains)}チェーン検出"]
                    for c in chains[:5]:
                        arrow = " → ".join(c.get("chain", []))
                        lines.append(f"  - {arrow} (確信度: {c.get('confidence', 0):.1f})")
                    parts.append("\n".join(lines))

            elif atype == "contradiction_detection":
                contradictions = result.get("contradictions", [])
                if contradictions:
                    lines = [f"[矛盾検出] {len(contradictions)}件"]
                    for c in contradictions[:5]:
                        lines.append(
                            f"  - [{c.get('contradiction_type', '')}] "
                            f"{c.get('statement_a', '')[:60]} ⇔ {c.get('statement_b', '')[:60]}"
                        )
                    parts.append("\n".join(lines))

            elif atype == "actionability_scoring":
                items = result.get("items", [])
                if items:
                    lines = [f"[アクショナビリティ] {len(items)}件評価"]
                    top = sorted(items, key=lambda x: x.get("score", 0), reverse=True)[:5]
                    for item in top:
                        lines.append(
                            f"  - [{item.get('category', '')}] スコア{item.get('score', 0):.1f}: "
                            f"{item.get('text_preview', '')[:60]}"
                        )
                    parts.append("\n".join(lines))

            elif atype == "taxonomy_generation":
                root = result.get("root_categories", [])
                if root:
                    lines = [f"[タクソノミー] {len(root)}カテゴリ"]
                    for cat in root[:6]:
                        children = cat.get("children", [])
                        sub = ", ".join(c.get("name", "") for c in children[:3])
                        line = f"  - {cat.get('name', '')}: {cat.get('text_count', 0)}件"
                        if sub:
                            line += f" → {sub}"
                        lines.append(line)
                    parts.append("\n".join(lines))

        if not parts:
            # フォールバック: 全データの簡略表示
            available = [k for k in analysis_data if isinstance(analysis_data[k], dict)]
            if available:
                return f"利用可能な分析: {', '.join(available)}\n（セクション用の詳細データなし）"
            return "分析データなし"

        return "\n\n".join(parts)

    async def _generate_sections(
        self,
        sections: list[str],
        analysis_data: dict,
        request: ReportRequest,
        evidence_pool: list[dict],
    ) -> list[dict]:
        """各セクションのコンテンツをLLMで生成（セクション間コンテキスト共有）"""
        contents = []
        prior_context = ""

        # エビデンスプールのテキスト表現
        evidence_block = ""
        if evidence_pool:
            evidence_lines = []
            for ev in evidence_pool:
                evidence_lines.append(f"[{ev['id']}] ({ev['context']}) {ev['text']}")
            evidence_block = "\n".join(evidence_lines)

        for section_title in sections:
            section_data = self._format_section_data(section_title, analysis_data)

            prompt = f"""テキストマイニング分析レポートの「{section_title}」セクションを作成してください。

分析データ:
{section_data}

"""
            if evidence_block:
                prompt += f"""エビデンス一覧（[ID]形式で参照可能）:
{evidence_block}

"""
            if prior_context:
                prompt += f"""前セクションまでの要約:
{prior_context}

"""
            prompt += f"""要件:
- ビジネスパーソン向けの明確な文章
- データに基づく具体的な記述
- エビデンスは[E-N]形式で参照を含める
- 前セクションの内容と整合性を保つ
- 200-400字程度

JSON形式:
{{"title": "{section_title}", "content": "...", "evidence_refs": ["E-1", "E-3"]}}"""

            try:
                response = await self.llm.invoke(prompt, TaskType.SUMMARIZATION, max_tokens=1500)
                data = json.loads(response.strip().strip("```json").strip("```"))
                contents.append(data)
                # 次セクション用にコンテキスト蓄積
                content_text = data.get("content", "")
                prior_context += f"【{section_title}】{content_text[:200]}\n"
            except Exception as e:
                logger.warning("section_generation_failed", section=section_title, error=str(e))
                contents.append(
                    {
                        "title": section_title,
                        "content": f"（セクション生成中にエラーが発生しました: {e}）",
                        "evidence_refs": [],
                    }
                )

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

    async def _export(self, report_id: str, contents: list[dict], fmt: ReportFormat) -> Path:
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
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

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
            ws.append(
                [
                    section.get("title", ""),
                    section.get("content", ""),
                    " | ".join(section.get("evidence_refs", [])),
                ]
            )

        path = self.output_dir / f"{report_id}.xlsx"
        wb.save(str(path))
        return path
