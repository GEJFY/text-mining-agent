"""Pydanticスキーマバリデーションテスト

CausalChain, Contradiction, ActionabilityItem, TaxonomyNode,
PipelineRequest/Response 等の正常系・異常系を検証。
"""

import pytest
from pydantic import ValidationError

from app.models.schemas import (
    ActionabilityItem,
    ActionabilityResult,
    CausalChain,
    CausalChainResult,
    ClusterAlgorithm,
    ClusterRequest,
    Contradiction,
    ContradictionResult,
    CooccurrenceRequest,
    PipelineRequest,
    PipelineResponse,
    ReportFormat,
    ReportTemplate,
    SentimentMode,
    SentimentRequest,
    TaxonomyNode,
    TaxonomyResult,
)

# === CausalChain ===


def test_causal_chain_valid():
    """正常な因果連鎖"""
    chain = CausalChain(
        chain=["原因", "結果", "影響"],
        confidence=0.85,
        supporting_text_indices=[0, 1, 2],
        explanation="原因により結果が生じた",
    )
    assert len(chain.chain) == 3
    assert chain.confidence == 0.85


def test_causal_chain_confidence_boundary():
    """信頼度の境界値: 0.0 と 1.0"""
    chain_min = CausalChain(chain=["A"], confidence=0.0)
    assert chain_min.confidence == 0.0

    chain_max = CausalChain(chain=["A"], confidence=1.0)
    assert chain_max.confidence == 1.0


def test_causal_chain_confidence_out_of_range():
    """信頼度が範囲外でバリデーションエラー"""
    with pytest.raises(ValidationError):
        CausalChain(chain=["A"], confidence=1.5)

    with pytest.raises(ValidationError):
        CausalChain(chain=["A"], confidence=-0.1)


def test_causal_chain_defaults():
    """デフォルト値が設定される"""
    chain = CausalChain(chain=["A", "B"], confidence=0.5)
    assert chain.supporting_text_indices == []
    assert chain.explanation == ""


def test_causal_chain_result():
    """CausalChainResult"""
    result = CausalChainResult(
        chains=[CausalChain(chain=["A", "B"], confidence=0.9)],
        total_analyzed=100,
    )
    assert len(result.chains) == 1
    assert result.total_analyzed == 100


# === Contradiction ===


def test_contradiction_valid():
    """正常な矛盾ペア"""
    c = Contradiction(
        statement_a="品質が良い",
        statement_b="品質が悪い",
        record_id_a="r1",
        record_id_b="r2",
        contradiction_type="direct",
        confidence=0.9,
        explanation="直接矛盾",
    )
    assert c.contradiction_type == "direct"
    assert c.confidence == 0.9


def test_contradiction_defaults():
    """デフォルト値"""
    c = Contradiction(statement_a="A", statement_b="B")
    assert c.record_id_a == ""
    assert c.record_id_b == ""
    assert c.contradiction_type == "direct"
    assert c.confidence == 0.5
    assert c.explanation == ""


def test_contradiction_confidence_range():
    """信頼度範囲外"""
    with pytest.raises(ValidationError):
        Contradiction(statement_a="A", statement_b="B", confidence=2.0)


def test_contradiction_result():
    """ContradictionResult"""
    result = ContradictionResult(
        contradictions=[Contradiction(statement_a="A", statement_b="B")],
        total_analyzed=50,
        sensitivity="high",
    )
    assert len(result.contradictions) == 1
    assert result.sensitivity == "high"


# === ActionabilityItem ===


def test_actionability_item_valid():
    """正常なアクショナビリティ項目"""
    item = ActionabilityItem(
        record_id="r1",
        text_preview="テスト",
        overall=0.8,
        specificity=0.7,
        urgency=0.9,
        feasibility=0.6,
        impact=0.85,
        category="immediate",
        suggested_actions=["対応する"],
    )
    assert item.overall == 0.8
    assert item.category == "immediate"


def test_actionability_item_defaults():
    """デフォルト値"""
    item = ActionabilityItem()
    assert item.record_id == ""
    assert item.overall == 0.0
    assert item.category == "informational"
    assert item.suggested_actions == []


def test_actionability_item_score_range():
    """スコア範囲外"""
    with pytest.raises(ValidationError):
        ActionabilityItem(overall=1.5)

    with pytest.raises(ValidationError):
        ActionabilityItem(specificity=-0.1)


def test_actionability_result():
    """ActionabilityResult"""
    result = ActionabilityResult(
        items=[ActionabilityItem(overall=0.8)],
        distribution={"immediate": 1},
        total_scored=1,
    )
    assert len(result.items) == 1
    assert result.total_scored == 1


# === TaxonomyNode ===


def test_taxonomy_node_valid():
    """正常なタクソノミーノード"""
    node = TaxonomyNode(
        name="製品品質",
        description="製品に関する品質の声",
        text_count=30,
        text_indices=[0, 1, 2],
        children=[
            TaxonomyNode(name="耐久性", text_count=15),
            TaxonomyNode(name="デザイン", text_count=10),
        ],
    )
    assert node.name == "製品品質"
    assert len(node.children) == 2


def test_taxonomy_node_defaults():
    """デフォルト値"""
    node = TaxonomyNode(name="テスト")
    assert node.description == ""
    assert node.text_count == 0
    assert node.text_indices == []
    assert node.children == []


def test_taxonomy_node_recursive():
    """再帰的ネスト"""
    leaf = TaxonomyNode(name="leaf", text_count=5)
    mid = TaxonomyNode(name="mid", children=[leaf])
    root = TaxonomyNode(name="root", children=[mid])
    assert root.children[0].children[0].name == "leaf"


def test_taxonomy_result():
    """TaxonomyResult"""
    result = TaxonomyResult(
        root_categories=[TaxonomyNode(name="Cat1", text_count=20)],
        uncategorized_count=5,
    )
    assert len(result.root_categories) == 1
    assert result.uncategorized_count == 5


# === PipelineRequest / PipelineResponse ===


def test_pipeline_request_valid():
    """正常なパイプラインリクエスト"""
    req = PipelineRequest(
        dataset_id="ds-001",
        objective="顧客離反分析",
        template=ReportTemplate.VOC,
        output_format=ReportFormat.PDF,
    )
    assert req.dataset_id == "ds-001"
    assert req.template == ReportTemplate.VOC


def test_pipeline_request_defaults():
    """デフォルト値"""
    req = PipelineRequest(dataset_id="ds-002")
    assert req.objective == ""
    assert req.template == ReportTemplate.VOC
    assert req.output_format == ReportFormat.PDF


def test_pipeline_request_missing_dataset():
    """dataset_id必須"""
    with pytest.raises(ValidationError):
        PipelineRequest()


def test_pipeline_response():
    """PipelineResponse"""
    from app.models.schemas import AgentInsight

    resp = PipelineResponse(
        agent_id="agent-001",
        insights=[AgentInsight(title="insight1", description="desc", evidence=["e1"], grounding_score=0.9)],
        analysis_jobs=["job1"],
        report_id="rep-001",
        report_download_url="/download/rep-001",
    )
    assert resp.agent_id == "agent-001"
    assert len(resp.insights) == 1


# === 既存スキーマ追加検証 ===


def test_cluster_request_n_clusters_range():
    """ClusterRequest n_clusters の範囲 (2-50)"""
    req = ClusterRequest(dataset_id="ds-001", n_clusters=2)
    assert req.n_clusters == 2

    req = ClusterRequest(dataset_id="ds-001", n_clusters=50)
    assert req.n_clusters == 50

    with pytest.raises(ValidationError):
        ClusterRequest(dataset_id="ds-001", n_clusters=1)

    with pytest.raises(ValidationError):
        ClusterRequest(dataset_id="ds-001", n_clusters=51)


def test_cluster_algorithm_enum():
    """ClusterAlgorithm列挙値"""
    assert ClusterAlgorithm.KMEANS.value == "kmeans"
    assert ClusterAlgorithm.HDBSCAN.value == "hdbscan"
    assert ClusterAlgorithm.GMM.value == "gmm"


def test_sentiment_mode_enum():
    """SentimentMode列挙値"""
    assert SentimentMode.BASIC.value == "basic"
    assert SentimentMode.BUSINESS.value == "business"
    assert SentimentMode.RISK.value == "risk"
    assert SentimentMode.CUSTOM.value == "custom"


def test_cooccurrence_request_range():
    """CooccurrenceRequest のバリデーション"""
    req = CooccurrenceRequest(dataset_id="ds-001", min_frequency=1, window_size=2)
    assert req.min_frequency == 1

    with pytest.raises(ValidationError):
        CooccurrenceRequest(dataset_id="ds-001", window_size=21)

    with pytest.raises(ValidationError):
        CooccurrenceRequest(dataset_id="ds-001", window_size=1)


def test_sentiment_request_defaults():
    """SentimentRequest デフォルト値"""
    req = SentimentRequest(dataset_id="ds-001")
    assert req.mode == SentimentMode.BASIC
    assert req.custom_axes is None
    assert req.multi_label is False


def test_report_format_enum():
    """ReportFormat列挙値"""
    assert ReportFormat.PPTX.value == "pptx"
    assert ReportFormat.PDF.value == "pdf"
    assert ReportFormat.DOCX.value == "docx"
    assert ReportFormat.EXCEL.value == "excel"
