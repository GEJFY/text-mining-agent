"""レポート生成サービステスト

SECTION_DATA_MAP ルーティング、_extract_evidence_texts 出力形式、
_format_section_data 各analysis_type変換を検証。
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.report_generator import (
    SECTION_DATA_MAP,
    TEMPLATE_SECTIONS,
    ReportGenerator,
)

# === テンプレート・マッピング定数 ===


def test_template_sections_voc():
    """VOCテンプレートに必須セクションが存在"""
    from app.models.schemas import ReportTemplate

    sections = TEMPLATE_SECTIONS[ReportTemplate.VOC]
    assert "エグゼクティブサマリー" in sections
    assert "改善提案" in sections
    assert len(sections) >= 4


def test_template_sections_all_templates():
    """全テンプレート（CUSTOM以外）にセクション構成が存在"""
    from app.models.schemas import ReportTemplate

    for tmpl in [ReportTemplate.VOC, ReportTemplate.AUDIT, ReportTemplate.COMPLIANCE, ReportTemplate.RISK]:
        assert tmpl in TEMPLATE_SECTIONS
        assert len(TEMPLATE_SECTIONS[tmpl]) >= 4


def test_section_data_map_covers_all_sections():
    """TEMPLATE_SECTIONSの全セクションがSECTION_DATA_MAPに存在"""
    for tmpl, sections in TEMPLATE_SECTIONS.items():
        for section in sections:
            assert section in SECTION_DATA_MAP, f"{tmpl.value}/{section} not in SECTION_DATA_MAP"


def test_section_data_map_analysis_types():
    """SECTION_DATA_MAPの値が有効な分析タイプを参照"""
    valid_types = {
        "cluster",
        "cluster_analysis",
        "sentiment",
        "sentiment_analysis",
        "cooccurrence",
        "cooccurrence_analysis",
        "causal_chain_analysis",
        "contradiction_detection",
        "actionability_scoring",
        "taxonomy_generation",
    }
    for section, types in SECTION_DATA_MAP.items():
        for t in types:
            assert t in valid_types, f"Unknown type '{t}' in section '{section}'"


# === _extract_evidence_texts ===


def test_extract_evidence_cluster():
    """クラスター分析からエビデンス抽出"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    data = {
        "cluster_analysis": {
            "result": {
                "clusters": [
                    {"title": "テストC", "centroid_texts": ["テキスト1", "テキスト2", "テキスト3"]},
                ],
            },
        },
    }
    evidence = gen._extract_evidence_texts(data)
    assert len(evidence) >= 1
    assert evidence[0]["id"].startswith("E-")
    assert evidence[0]["source"] == "cluster_analysis"
    assert "テキスト" in evidence[0]["text"]


def test_extract_evidence_causal_chain():
    """因果連鎖からエビデンス抽出"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    data = {
        "causal_chain_analysis": {
            "result": {
                "chains": [
                    {"chain": ["原因", "結果"], "explanation": "テスト説明"},
                ],
            },
        },
    }
    evidence = gen._extract_evidence_texts(data)
    assert len(evidence) >= 1
    assert "因果連鎖" in evidence[0]["context"]


def test_extract_evidence_contradiction():
    """矛盾検出からエビデンス抽出"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    data = {
        "contradiction_detection": {
            "result": {
                "contradictions": [
                    {
                        "statement_a": "品質は良い",
                        "statement_b": "品質は悪い",
                        "contradiction_type": "direct",
                    },
                ],
            },
        },
    }
    evidence = gen._extract_evidence_texts(data)
    assert len(evidence) >= 1
    assert "矛盾" in evidence[0]["context"]


def test_extract_evidence_empty_data():
    """空データからエビデンス抽出→空リスト"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    evidence = gen._extract_evidence_texts({})
    assert evidence == []


def test_extract_evidence_max_30():
    """エビデンスは最大30件に制限"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    data = {
        "cluster_analysis": {
            "result": {
                "clusters": [{"title": f"C{i}", "centroid_texts": [f"text{j}" for j in range(3)]} for i in range(20)],
            },
        },
    }
    evidence = gen._extract_evidence_texts(data)
    assert len(evidence) <= 30


# === _format_section_data ===


def test_format_section_cluster():
    """クラスター分析データのフォーマット"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    data = {
        "cluster_analysis": {
            "result": {
                "clusters": [
                    {"title": "顧客不満", "size": 50, "summary": "不満の声", "cluster_id": 0},
                ],
            },
        },
    }
    result = gen._format_section_data("クラスター分析結果", data)
    assert "クラスター分析" in result
    assert "顧客不満" in result
    assert "50" in result


def test_format_section_sentiment():
    """感情分析データのフォーマット"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    data = {
        "sentiment_analysis": {
            "result": {
                "distribution": {"positive": 10, "negative": 5},
                "highlights": [{"text": "良い製品", "sentiment": "positive"}],
            },
        },
    }
    result = gen._format_section_data("感情トレンド分析", data)
    assert "感情分析" in result
    assert "positive" in result


def test_format_section_causal_chain():
    """因果連鎖データのフォーマット"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    data = {
        "causal_chain_analysis": {
            "result": {
                "chains": [
                    {"chain": ["品質低下", "顧客不満", "解約増加"], "confidence": 0.85},
                ],
            },
        },
    }
    result = gen._format_section_data("改善提案", data)
    assert "因果連鎖" in result
    assert "品質低下" in result


def test_format_section_contradiction():
    """矛盾検出データのフォーマット"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    data = {
        "contradiction_detection": {
            "result": {
                "contradictions": [
                    {
                        "statement_a": "対応が早い",
                        "statement_b": "対応が遅い",
                        "contradiction_type": "direct",
                    },
                ],
            },
        },
    }
    result = gen._format_section_data("改善提案", data)
    assert "矛盾検出" in result


def test_format_section_taxonomy():
    """タクソノミーデータのフォーマット"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    data = {
        "taxonomy_generation": {
            "result": {
                "root_categories": [
                    {
                        "name": "製品品質",
                        "text_count": 30,
                        "children": [{"name": "耐久性", "text_count": 10}],
                    },
                ],
            },
        },
    }
    result = gen._format_section_data("エグゼクティブサマリー", data)
    assert "タクソノミー" in result
    assert "製品品質" in result


def test_format_section_no_data():
    """該当データなし→フォールバック"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    result = gen._format_section_data("改善提案", {})
    assert "分析データなし" in result


def test_format_section_fallback_with_available():
    """セクション用データなしだが他データあり→利用可能な分析表示"""
    llm_mock = AsyncMock()
    gen = ReportGenerator(llm_mock)

    data = {"unknown_analysis": {"some": "data"}}
    result = gen._format_section_data("改善提案", data)
    assert "利用可能な分析" in result


# === generate 全体フロー ===


@pytest.mark.asyncio
async def test_generate_full_flow():
    """generate()全体フロー（LLM+exportモック）"""
    from app.models.schemas import ReportFormat, ReportRequest, ReportTemplate

    llm_mock = AsyncMock()
    llm_mock.invoke = AsyncMock(return_value='{"title": "テスト", "content": "内容", "evidence_refs": ["E-1"]}')

    gen = ReportGenerator(llm_mock)

    request = ReportRequest(
        dataset_id="ds-001",
        template=ReportTemplate.VOC,
        output_format=ReportFormat.PDF,
    )
    analysis_data = {
        "cluster_analysis": {
            "result": {
                "clusters": [{"title": "C1", "centroid_texts": ["text1"], "size": 5, "summary": "test"}],
            },
        },
    }

    with patch.object(gen, "_export", new_callable=AsyncMock) as mock_export:
        result = await gen.generate(request, analysis_data)
        assert result.report_id is not None
        assert result.format == ReportFormat.PDF
        assert "/api/v1/reports/" in result.download_url
        mock_export.assert_called_once()
