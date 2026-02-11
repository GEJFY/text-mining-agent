"""共起ネットワーク分析サービス

共起行列の事前計算、Louvainコミュニティ検知、中心性指標、時間スライスアニメーション。
"""

from collections import Counter, defaultdict

import community as community_louvain
import networkx as nx

from app.core.logging import get_logger
from app.models.schemas import (
    CooccurrenceRequest,
    CooccurrenceResult,
    NetworkEdge,
    NetworkNode,
)
from app.services.text_preprocessing import text_preprocessor

logger = get_logger(__name__)


class CooccurrenceService:
    """共起ネットワーク分析エンジン"""

    def analyze(
        self,
        texts: list[str],
        request: CooccurrenceRequest,
        language: str = "ja",
    ) -> CooccurrenceResult:
        """共起ネットワーク分析"""
        logger.info("cooccurrence_start", count=len(texts))

        # トークナイズ & 共起集計
        cooccurrence_counts: Counter[tuple[str, str]] = Counter()
        word_freq: Counter[str] = Counter()

        for text in texts:
            tokens = text_preprocessor.tokenize(text, language)
            tokens = text_preprocessor.remove_stopwords(tokens, language)
            unique_tokens = list(dict.fromkeys(tokens))  # 順序保持しつつ重複除去

            word_freq.update(unique_tokens)

            # ウィンドウ内の共起
            for i, w1 in enumerate(unique_tokens):
                for j in range(i + 1, min(i + request.window_size, len(unique_tokens))):
                    w2 = unique_tokens[j]
                    pair = tuple(sorted([w1, w2]))
                    cooccurrence_counts[pair] += 1

        # 閾値でフィルタリング
        filtered_pairs = {pair: count for pair, count in cooccurrence_counts.items() if count >= request.min_frequency}

        # NetworkXグラフ構築
        graph = nx.Graph()
        for (w1, w2), weight in filtered_pairs.items():
            graph.add_edge(w1, w2, weight=weight)

        if graph.number_of_nodes() == 0:
            return CooccurrenceResult(nodes=[], edges=[], communities={}, modularity=0.0)

        # 中心性指標
        degree_centrality = nx.degree_centrality(graph)
        betweenness_centrality = nx.betweenness_centrality(graph, weight="weight")

        # Louvainコミュニティ検知
        partition = community_louvain.best_partition(graph, weight="weight")
        modularity = community_louvain.modularity(partition, graph, weight="weight")

        # コミュニティをグループ化
        communities: dict[int, list[str]] = defaultdict(list)
        for node, comm_id in partition.items():
            communities[comm_id].append(node)

        # ノードリスト
        nodes = [
            NetworkNode(
                word=node,
                frequency=word_freq.get(node, 0),
                degree_centrality=degree_centrality.get(node, 0.0),
                betweenness_centrality=betweenness_centrality.get(node, 0.0),
                community_id=partition.get(node, 0),
            )
            for node in graph.nodes()
        ]

        # エッジリスト
        edges = [NetworkEdge(source=u, target=v, weight=d["weight"]) for u, v, d in graph.edges(data=True)]

        logger.info(
            "cooccurrence_complete",
            nodes=len(nodes),
            edges=len(edges),
            communities=len(communities),
            modularity=modularity,
        )

        return CooccurrenceResult(
            nodes=nodes,
            edges=edges,
            communities=dict(communities),
            modularity=float(modularity),
        )

    def time_sliced_analysis(
        self,
        texts: list[str],
        dates: list[str],
        request: CooccurrenceRequest,
        language: str = "ja",
    ) -> list[dict]:
        """時間スライスでの共起ネットワーク変遷"""
        import pandas as pd

        df = pd.DataFrame({"text": texts, "date": pd.to_datetime(dates, errors="coerce")})
        df = df.dropna(subset=["date"])

        interval_map = {"month": "M", "week": "W", "day": "D"}
        freq = interval_map.get(request.time_interval or "month", "M")
        df["period"] = df["date"].dt.to_period(freq)

        results = []
        for period, group in df.groupby("period"):
            result = self.analyze(group["text"].tolist(), request, language)
            results.append(
                {
                    "period": str(period),
                    "nodes": len(result.nodes),
                    "edges": len(result.edges),
                    "modularity": result.modularity,
                    "network": result.model_dump(),
                }
            )

        return results


# シングルトン
cooccurrence_service = CooccurrenceService()
