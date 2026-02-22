"""クラスター分析サービス

k-means, HDBSCAN, GMMによるクラスタリング。
LLMラベリング・要約、外れ値分析、階層クラスター・サブクラスター展開。
"""

import asyncio
import json
import re
from functools import partial
from uuid import uuid4

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from sklearn.mixture import GaussianMixture

from app.core.logging import get_logger
from app.models.schemas import (
    ClusterAlgorithm,
    ClusterLabel,
    ClusterRequest,
    ClusterResult,
)
from app.services.llm_orchestrator import LLMOrchestrator, TaskType
from app.services.text_preprocessing import text_preprocessor

# LLMラベリング1クラスタあたりのタイムアウト（秒）
LLM_LABEL_TIMEOUT = 20

logger = get_logger(__name__)


class ClusteringService:
    """クラスター分析エンジン"""

    def __init__(self, llm: LLMOrchestrator) -> None:
        self.llm = llm

    async def analyze(self, request: ClusterRequest, texts: list[str]) -> ClusterResult:
        """クラスター分析のフルパイプラインを実行"""
        job_id = str(uuid4())
        logger.info("clustering_start", job_id=job_id, algorithm=request.algorithm, n_texts=len(texts))

        loop = asyncio.get_event_loop()

        # Embedding生成（CPU重い処理をスレッドで実行）
        logger.info("clustering_embedding_start")
        embeddings = await loop.run_in_executor(None, text_preprocessor.generate_embeddings, texts)
        logger.info("clustering_embedding_done", shape=str(embeddings.shape))

        # UMAP次元削減（CPU重い処理をスレッドで実行）
        logger.info("clustering_umap_start")
        umap_func = partial(
            self._run_umap,
            embeddings,
            request.umap_n_neighbors,
            request.umap_min_dist,
        )
        umap_coords = await loop.run_in_executor(None, umap_func)
        logger.info("clustering_umap_done")

        # クラスタリング実行（スレッドで実行）
        labels, n_clusters = await loop.run_in_executor(
            None, self._run_clustering, embeddings, request.algorithm, request.n_clusters, request.min_cluster_size
        )

        # シルエットスコア
        valid_mask = labels >= 0
        sil_score = 0.0
        if len(set(labels[valid_mask])) > 1:
            sil_score = float(silhouette_score(embeddings[valid_mask], labels[valid_mask]))

        # 外れ値分析
        outliers = self._detect_outliers(embeddings, labels, texts, top_n=20)

        # LLMラベリング（並列実行 + タイムアウト保護）
        logger.info("clustering_labeling_start", n_clusters=n_clusters)
        cluster_labels = await self._generate_labels(texts, labels, n_clusters, embeddings)
        logger.info("clustering_labeling_done")

        return ClusterResult(
            job_id=job_id,
            algorithm=request.algorithm,
            clusters=cluster_labels,
            outliers=outliers,
            umap_coordinates=umap_coords.tolist(),
            cluster_assignments=labels.tolist(),
            silhouette_score=sil_score,
            point_texts=[t[:200] for t in texts],
        )

    @staticmethod
    def _run_umap(embeddings: np.ndarray, n_neighbors: int, min_dist: float) -> np.ndarray:
        """UMAP次元削減（失敗時はPCAフォールバック）"""
        try:
            from umap import UMAP

            umap_model = UMAP(
                n_neighbors=n_neighbors,
                min_dist=min_dist,
                n_components=2,
                metric="cosine",
                random_state=42,
                low_memory=True,
            )
            return umap_model.fit_transform(embeddings)
        except Exception as e:
            logger.warning("umap_failed_fallback_pca", error=str(e))
            pca = PCA(n_components=2, random_state=42)
            return pca.fit_transform(embeddings)

    def _run_clustering(
        self,
        embeddings: np.ndarray,
        algorithm: ClusterAlgorithm,
        n_clusters: int | None,
        min_cluster_size: int | None = None,
    ) -> tuple[np.ndarray, int]:
        """アルゴリズム別クラスタリング"""
        if algorithm == ClusterAlgorithm.KMEANS:
            k = n_clusters or 5
            model = KMeans(n_clusters=k, random_state=42, n_init=10)
            labels = model.fit_predict(embeddings)
            return labels, k

        elif algorithm == ClusterAlgorithm.HDBSCAN:
            import hdbscan

            # min_cluster_size 自動算出: 未指定ならデータ数の1/15（最小2）
            auto_mcs = max(2, len(embeddings) // 15)
            mcs = min_cluster_size if min_cluster_size is not None else auto_mcs
            model = hdbscan.HDBSCAN(min_cluster_size=mcs, metric="euclidean")
            labels = model.fit_predict(embeddings)
            n = len(set(labels)) - (1 if -1 in labels else 0)
            noise_ratio = float((labels == -1).sum()) / len(labels)
            if noise_ratio > 0.5:
                logger.warning("hdbscan_high_noise", noise_ratio=f"{noise_ratio:.2f}", mcs=mcs)
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
        """LLMによるクラスターラベリング・要約（全クラスタ並列実行）"""

        async def _label_one(cluster_id: int) -> ClusterLabel:
            mask = labels == cluster_id
            cluster_texts = [texts[i] for i in range(len(texts)) if mask[i]]
            cluster_size = len(cluster_texts)

            if cluster_size == 0:
                return ClusterLabel(
                    cluster_id=cluster_id,
                    title=f"クラスター{cluster_id}",
                    summary="空のクラスター",
                    keywords=[],
                    size=0,
                    centroid_texts=[],
                )

            # 代表テキスト: セントロイドに近い上位5件
            cluster_embeddings = embeddings[mask]
            centroid = cluster_embeddings.mean(axis=0)
            distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
            top_indices = distances.argsort()[:5]
            representative_texts = [cluster_texts[i] for i in top_indices]

            # キーワードフォールバック用：頻出単語を抽出
            fallback_keywords = self._extract_keywords(cluster_texts)

            # 全テキストを投入（最大30件、各300字）
            all_sample_texts = cluster_texts[:30]
            texts_block = chr(10).join(f"- {t[:300]}" for t in all_sample_texts)

            prompt = f"""以下はテキストクラスター（全{cluster_size}件）のコメントです。
このクラスターのタイトル（15字以内）、詳細な要約（200-300字）、キーワード（5個）をJSON形式で生成してください。
要約は、クラスターの主要なテーマ、共通する意見傾向、注目すべき特徴を含めてください。

テキスト一覧（{len(all_sample_texts)}件）:
{texts_block}

出力形式:
{{"title": "...", "summary": "...", "keywords": ["k1", "k2", "k3", "k4", "k5"]}}"""

            try:
                response = await asyncio.wait_for(
                    self.llm.invoke(
                        prompt=prompt,
                        task_type=TaskType.LABELING,
                        system_prompt="テキストマイニングの専門家として、クラスターの特徴を簡潔に表現してください。",
                        max_tokens=500,
                    ),
                    timeout=LLM_LABEL_TIMEOUT,
                )
                data = json.loads(response.strip().strip("```json").strip("```"))
                return ClusterLabel(
                    cluster_id=cluster_id,
                    title=data.get("title", f"クラスター{cluster_id}")[:15],
                    summary=data.get("summary", "")[:500],
                    keywords=data.get("keywords", fallback_keywords)[:5],
                    size=cluster_size,
                    centroid_texts=[t[:200] for t in representative_texts],
                )
            except Exception as e:
                logger.warning("label_generation_failed", cluster_id=cluster_id, error=str(e))
                return ClusterLabel(
                    cluster_id=cluster_id,
                    title=f"クラスター{cluster_id}",
                    summary=f"{cluster_size}件のテキストを含むクラスター",
                    keywords=fallback_keywords,
                    size=cluster_size,
                    centroid_texts=[t[:200] for t in representative_texts],
                )

        # 全クラスタのラベルを並列生成
        results = await asyncio.gather(*[_label_one(cid) for cid in range(n_clusters)])
        return [r for r in results if r.size > 0]

    @staticmethod
    def _extract_keywords(texts: list[str], top_n: int = 5) -> list[str]:
        """テキストから頻出キーワードを抽出（LLMフォールバック用）"""
        from collections import Counter

        words: list[str] = []
        for t in texts[:50]:
            # 2文字以上のカタカナ・漢字・英単語を抽出
            tokens = re.findall(r"[\u30A0-\u30FF]{2,}|[\u4E00-\u9FFF]{2,}|[a-zA-Z]{3,}", t)
            words.extend(tokens)
        counter = Counter(words)
        return [w for w, _ in counter.most_common(top_n)]

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
