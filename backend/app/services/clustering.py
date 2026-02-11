"""クラスター分析サービス

k-means, HDBSCAN, GMMによるクラスタリング。
LLMラベリング・要約、外れ値分析、階層クラスター・サブクラスター展開。
"""

import json
from uuid import uuid4

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.mixture import GaussianMixture
from umap import UMAP

from app.core.logging import get_logger
from app.models.schemas import (
    ClusterAlgorithm,
    ClusterLabel,
    ClusterRequest,
    ClusterResult,
)
from app.services.llm_orchestrator import LLMOrchestrator, TaskType
from app.services.text_preprocessing import text_preprocessor

logger = get_logger(__name__)


class ClusteringService:
    """クラスター分析エンジン"""

    def __init__(self, llm: LLMOrchestrator) -> None:
        self.llm = llm

    async def analyze(self, request: ClusterRequest, texts: list[str]) -> ClusterResult:
        """クラスター分析のフルパイプラインを実行"""
        job_id = str(uuid4())
        logger.info("clustering_start", job_id=job_id, algorithm=request.algorithm)

        # Embedding生成
        embeddings = text_preprocessor.generate_embeddings(texts)

        # UMAP次元削減
        umap_model = UMAP(
            n_neighbors=request.umap_n_neighbors,
            min_dist=request.umap_min_dist,
            n_components=2,
            metric="cosine",
            random_state=42,
        )
        umap_coords = umap_model.fit_transform(embeddings)

        # クラスタリング実行
        labels, n_clusters = self._run_clustering(embeddings, request.algorithm, request.n_clusters)

        # シルエットスコア
        valid_mask = labels >= 0
        sil_score = 0.0
        if len(set(labels[valid_mask])) > 1:
            sil_score = float(silhouette_score(embeddings[valid_mask], labels[valid_mask]))

        # 外れ値分析
        outliers = self._detect_outliers(embeddings, labels, texts, top_n=20)

        # LLMラベリング
        cluster_labels = await self._generate_labels(texts, labels, n_clusters, embeddings)

        return ClusterResult(
            job_id=job_id,
            algorithm=request.algorithm,
            clusters=cluster_labels,
            outliers=outliers,
            umap_coordinates=umap_coords.tolist(),
            cluster_assignments=labels.tolist(),
            silhouette_score=sil_score,
        )

    def _run_clustering(
        self, embeddings: np.ndarray, algorithm: ClusterAlgorithm, n_clusters: int | None
    ) -> tuple[np.ndarray, int]:
        """アルゴリズム別クラスタリング"""
        if algorithm == ClusterAlgorithm.KMEANS:
            k = n_clusters or 5
            model = KMeans(n_clusters=k, random_state=42, n_init=10)
            labels = model.fit_predict(embeddings)
            return labels, k

        elif algorithm == ClusterAlgorithm.HDBSCAN:
            import hdbscan

            model = hdbscan.HDBSCAN(min_cluster_size=10, metric="euclidean")
            labels = model.fit_predict(embeddings)
            n = len(set(labels)) - (1 if -1 in labels else 0)
            return labels, n

        elif algorithm == ClusterAlgorithm.GMM:
            k = n_clusters or 5
            model = GaussianMixture(n_components=k, random_state=42)
            labels = model.fit_predict(embeddings)
            return labels, k

        raise ValueError(f"Unknown algorithm: {algorithm}")

    def _detect_outliers(
        self,
        embeddings: np.ndarray,
        labels: np.ndarray,
        texts: list[str],
        top_n: int = 20,
    ) -> list[dict]:
        """セントロイドからの距離で外れ値を検出"""
        outliers = []
        unique_labels = set(labels)
        unique_labels.discard(-1)

        for cluster_id in unique_labels:
            mask = labels == cluster_id
            cluster_embeddings = embeddings[mask]
            centroid = cluster_embeddings.mean(axis=0)

            indices = np.where(mask)[0]
            for idx in indices:
                dist = float(np.linalg.norm(embeddings[idx] - centroid))
                outliers.append(
                    {
                        "index": int(idx),
                        "text": texts[idx][:200],
                        "cluster_id": int(cluster_id),
                        "distance": dist,
                    }
                )

        outliers.sort(key=lambda x: x["distance"], reverse=True)
        return outliers[:top_n]

    async def _generate_labels(
        self,
        texts: list[str],
        labels: np.ndarray,
        n_clusters: int,
        embeddings: np.ndarray,
    ) -> list[ClusterLabel]:
        """LLMによるクラスターラベリング・要約"""
        cluster_labels = []

        for cluster_id in range(n_clusters):
            mask = labels == cluster_id
            cluster_texts = [texts[i] for i in range(len(texts)) if mask[i]]
            cluster_size = len(cluster_texts)

            if cluster_size == 0:
                continue

            # 代表テキスト: セントロイドに近い上位5件
            cluster_embeddings = embeddings[mask]
            centroid = cluster_embeddings.mean(axis=0)
            distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
            top_indices = distances.argsort()[:5]
            representative_texts = [cluster_texts[i] for i in top_indices]

            prompt = f"""以下はテキストクラスターの代表的なコメントです。
このクラスターのタイトル（15字以内）、要約（100字以内）、キーワード（5個）をJSON形式で生成してください。

代表テキスト:
{chr(10).join(f"- {t[:200]}" for t in representative_texts)}

出力形式:
{{"title": "...", "summary": "...", "keywords": ["k1", "k2", "k3", "k4", "k5"]}}"""

            try:
                response = await self.llm.invoke(
                    prompt=prompt,
                    task_type=TaskType.LABELING,
                    system_prompt="テキストマイニングの専門家として、クラスターの特徴を簡潔に表現してください。",
                    max_tokens=500,
                )
                data = json.loads(response.strip().strip("```json").strip("```"))
                cluster_labels.append(
                    ClusterLabel(
                        cluster_id=cluster_id,
                        title=data.get("title", f"クラスター{cluster_id}")[:15],
                        summary=data.get("summary", "")[:100],
                        keywords=data.get("keywords", [])[:5],
                        size=cluster_size,
                        centroid_texts=[t[:200] for t in representative_texts],
                    )
                )
            except Exception as e:
                logger.warning("label_generation_failed", cluster_id=cluster_id, error=str(e))
                cluster_labels.append(
                    ClusterLabel(
                        cluster_id=cluster_id,
                        title=f"クラスター{cluster_id}",
                        summary=f"{cluster_size}件のテキストを含むクラスター",
                        keywords=[],
                        size=cluster_size,
                        centroid_texts=[t[:200] for t in representative_texts],
                    )
                )

        return cluster_labels

    async def sub_cluster(
        self,
        parent_cluster_texts: list[str],
        parent_embeddings: np.ndarray,
        n_sub_clusters: int = 3,
    ) -> list[ClusterLabel]:
        """サブクラスター展開"""
        if len(parent_cluster_texts) < n_sub_clusters * 3:
            return []

        model = KMeans(n_clusters=n_sub_clusters, random_state=42)
        sub_labels = model.fit_predict(parent_embeddings)
        return await self._generate_labels(parent_cluster_texts, sub_labels, n_sub_clusters, parent_embeddings)

    async def compare_clusters(self, texts: list[str], labels: np.ndarray, cluster_a: int, cluster_b: int) -> dict:
        """2つのクラスター間の比較"""
        texts_a = [texts[i] for i in range(len(texts)) if labels[i] == cluster_a]
        texts_b = [texts[i] for i in range(len(texts)) if labels[i] == cluster_b]

        prompt = f"""2つのテキストクラスターを比較分析してください。

クラスターA（{len(texts_a)}件）サンプル:
{chr(10).join(f"- {t[:150]}" for t in texts_a[:5])}

クラスターB（{len(texts_b)}件）サンプル:
{chr(10).join(f"- {t[:150]}" for t in texts_b[:5])}

JSON形式で回答:
{{"common_themes": [...], "unique_to_a": [...], "unique_to_b": [...], "summary": "..."}}"""

        response = await self.llm.invoke(prompt, TaskType.LABELING)
        try:
            return json.loads(response.strip().strip("```json").strip("```"))
        except json.JSONDecodeError:
            return {"summary": response}
