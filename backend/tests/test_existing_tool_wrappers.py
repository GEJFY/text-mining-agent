"""既存ツールラッパー（ClusterTool/SentimentTool/CooccurrenceTool）テスト

各ToolのToolResult形式、空データセットハンドリング、
definition()のメタデータを検証。

NOTE: numpy/pandas等の重い科学計算ライブラリがテスト環境にないため、
インポートに失敗するモジュールのみsys.modulesをモック。
CI環境（依存あり）では実モジュールを使用し、他テストへの副作用を防止。
"""

import sys
from unittest.mock import AsyncMock, MagicMock, patch

# ===================================================================
# 重い依存モジュールをインポート前にモック（ImportError時のみ）
# ===================================================================
_HEAVY_DEPS = [
    "numpy", "numpy.linalg",
    "pandas",
    "sklearn", "sklearn.cluster", "sklearn.mixture",
    "sklearn.metrics", "sklearn.metrics.pairwise", "sklearn.decomposition",
    "hdbscan",
    "umap",
    "networkx", "networkx.algorithms", "networkx.algorithms.community",
    "community",
    "sentence_transformers",
    "fugashi", "MeCab",
    "janome", "janome.tokenizer",
    "chardet", "openpyxl",
]  # fmt: skip

for _mod_name in _HEAVY_DEPS:
    if _mod_name not in sys.modules:
        try:
            __import__(_mod_name)
        except ImportError:
            sys.modules[_mod_name] = MagicMock()

# ===================================================================
# ここからimport
# ===================================================================

import pytest  # noqa: E402

from app.services.analysis_registry import ToolResult  # noqa: E402
from app.services.tools.cluster_tool import ClusterTool  # noqa: E402
from app.services.tools.cooccurrence_tool import CooccurrenceTool  # noqa: E402
from app.services.tools.sentiment_tool import SentimentTool  # noqa: E402

# === ClusterTool ===


@pytest.mark.asyncio
async def test_cluster_tool_definition():
    """ClusterTool.definition()のメタデータ"""
    tool = ClusterTool()
    defn = tool.definition()
    assert defn.name == "cluster_analysis"
    assert defn.category == "statistical"
    assert defn.requires_llm is True
    assert len(defn.parameters) >= 2
    param_names = {p.name for p in defn.parameters}
    assert "algorithm" in param_names
    assert "n_clusters" in param_names


@pytest.mark.asyncio
async def test_cluster_tool_empty_dataset():
    """空データセットでClusterTool実行→success=False"""
    tool = ClusterTool()
    with patch(
        "app.services.tools.cluster_tool.get_texts_by_dataset",
        new_callable=AsyncMock,
    ) as mock_get:
        mock_get.return_value = ([], [], [])
        result = await tool.execute("ds-empty", AsyncMock())
        assert isinstance(result, ToolResult)
        assert result.success is False
        assert "空" in (result.error or "")


@pytest.mark.asyncio
async def test_cluster_tool_success():
    """ClusterTool正常実行→ToolResult形式で返却"""
    tool = ClusterTool()

    mock_cluster_label = MagicMock()
    mock_cluster_label.title = "テストクラスター"
    mock_cluster_label.size = 10
    mock_cluster_label.summary = "テスト要約"
    mock_cluster_label.centroid_texts = ["テキスト1", "テキスト2"]
    mock_cluster_label.cluster_id = 0

    mock_result = MagicMock()
    mock_result.clusters = [mock_cluster_label]
    mock_result.silhouette_score = 0.75
    mock_result.model_dump.return_value = {
        "clusters": [{"title": "テストクラスター", "size": 10}],
        "silhouette_score": 0.75,
    }

    with (
        patch(
            "app.services.tools.cluster_tool.get_texts_by_dataset",
            new_callable=AsyncMock,
        ) as mock_get,
        patch("app.services.tools.cluster_tool.ClusteringService") as mock_svc_cls,
    ):
        mock_get.return_value = (["text1", "text2"], ["id1", "id2"], [None, None])
        mock_svc = mock_svc_cls.return_value
        mock_svc.analyze = AsyncMock(return_value=mock_result)

        result = await tool.execute("ds-001", AsyncMock(), algorithm="kmeans", n_clusters=5)

        assert isinstance(result, ToolResult)
        assert result.success is True
        assert result.tool_name == "cluster_analysis"
        assert "クラスター" in result.summary
        assert len(result.key_findings) >= 1
        assert len(result.evidence_refs) >= 1


# === SentimentTool ===


@pytest.mark.asyncio
async def test_sentiment_tool_definition():
    """SentimentTool.definition()のメタデータ"""
    tool = SentimentTool()
    defn = tool.definition()
    assert defn.name == "sentiment_analysis"
    assert defn.category == "llm_based"
    assert defn.requires_llm is True
    param_names = {p.name for p in defn.parameters}
    assert "mode" in param_names


@pytest.mark.asyncio
async def test_sentiment_tool_empty_dataset():
    """空データセットでSentimentTool実行→success=False"""
    tool = SentimentTool()
    with patch(
        "app.services.tools.sentiment_tool.get_texts_by_dataset",
        new_callable=AsyncMock,
    ) as mock_get:
        mock_get.return_value = ([], [], [])
        result = await tool.execute("ds-empty", AsyncMock())
        assert isinstance(result, ToolResult)
        assert result.success is False
        assert "空" in (result.error or "")


@pytest.mark.asyncio
async def test_sentiment_tool_success():
    """SentimentTool正常実行→ToolResult形式で返却"""
    tool = SentimentTool()

    mock_item = MagicMock()
    mock_item.record_id = "r1"
    mock_item.labels = ["positive"]
    mock_item.scores = {"positive": 0.9}
    mock_item.evidence_highlights = [{"highlight": "良い"}]

    mock_result = MagicMock()
    mock_result.distribution = {"positive": 5, "negative": 3}
    mock_result.results = [mock_item]
    mock_result.mode = MagicMock()
    mock_result.mode.value = "basic"
    mock_result.model_dump.return_value = {
        "distribution": {"positive": 5, "negative": 3},
        "results": [],
    }

    with (
        patch(
            "app.services.tools.sentiment_tool.get_texts_by_dataset",
            new_callable=AsyncMock,
        ) as mock_get,
        patch("app.services.tools.sentiment_tool.SentimentService") as mock_svc_cls,
    ):
        mock_get.return_value = (["text1", "text2"], ["r1", "r2"], [None, None])
        mock_svc = mock_svc_cls.return_value
        mock_svc.analyze = AsyncMock(return_value=mock_result)

        result = await tool.execute("ds-001", AsyncMock(), mode="basic")

        assert isinstance(result, ToolResult)
        assert result.success is True
        assert result.tool_name == "sentiment_analysis"
        assert "感情分析" in result.summary
        assert len(result.key_findings) >= 1


# === CooccurrenceTool ===


@pytest.mark.asyncio
async def test_cooccurrence_tool_definition():
    """CooccurrenceTool.definition()のメタデータ"""
    tool = CooccurrenceTool()
    defn = tool.definition()
    assert defn.name == "cooccurrence_analysis"
    assert defn.category == "network"
    assert defn.requires_llm is False
    param_names = {p.name for p in defn.parameters}
    assert "min_frequency" in param_names
    assert "window_size" in param_names


@pytest.mark.asyncio
async def test_cooccurrence_tool_empty_dataset():
    """空データセットでCooccurrenceTool実行→success=False"""
    tool = CooccurrenceTool()
    with patch(
        "app.services.tools.cooccurrence_tool.get_texts_by_dataset",
        new_callable=AsyncMock,
    ) as mock_get:
        mock_get.return_value = ([], [], [])
        result = await tool.execute("ds-empty", AsyncMock())
        assert isinstance(result, ToolResult)
        assert result.success is False
        assert "空" in (result.error or "")


@pytest.mark.asyncio
async def test_cooccurrence_tool_success():
    """CooccurrenceTool正常実行→ToolResult形式で返却"""
    tool = CooccurrenceTool()

    mock_node = MagicMock()
    mock_node.word = "テスト"
    mock_node.frequency = 10
    mock_node.degree_centrality = 0.5

    mock_result = MagicMock()
    mock_result.nodes = [mock_node]
    mock_result.edges = []
    mock_result.communities = {0: ["テスト", "データ"]}
    mock_result.modularity = 0.6
    mock_result.model_dump.return_value = {
        "nodes": [{"word": "テスト", "frequency": 10}],
        "edges": [],
        "communities": {0: ["テスト", "データ"]},
        "modularity": 0.6,
    }

    with (
        patch(
            "app.services.tools.cooccurrence_tool.get_texts_by_dataset",
            new_callable=AsyncMock,
        ) as mock_get,
        patch("app.services.tools.cooccurrence_tool.cooccurrence_service") as mock_svc,
    ):
        mock_get.return_value = (["text1", "text2"], ["r1", "r2"], [None, None])
        mock_svc.analyze.return_value = mock_result

        result = await tool.execute("ds-001", AsyncMock(), min_frequency=3, window_size=5)

        assert isinstance(result, ToolResult)
        assert result.success is True
        assert result.tool_name == "cooccurrence_analysis"
        assert "共起ネットワーク" in result.summary
        assert len(result.key_findings) >= 1
