"""感情分析サービス

カスタム感情軸、マルチラベル対応、時系列グラフ、スパイク検知。
LLMによる判定フローと判定根拠ハイライト。
"""

import json
from uuid import uuid4

import numpy as np
import pandas as pd

from app.core.logging import get_logger
from app.models.schemas import (
    SentimentAxisDefinition,
    SentimentEstimate,
    SentimentMode,
    SentimentRequest,
    SentimentResult,
    SentimentResultItem,
)
from app.services.llm_orchestrator import LLMOrchestrator, TaskType

logger = get_logger(__name__)

# プリセット感情軸
PRESET_AXES: dict[SentimentMode, list[SentimentAxisDefinition]] = {
    SentimentMode.BASIC: [
        SentimentAxisDefinition(name="Positive", description="肯定的な内容"),
        SentimentAxisDefinition(name="Negative", description="否定的な内容"),
        SentimentAxisDefinition(name="Neutral", description="中立的な内容"),
    ],
    SentimentMode.BUSINESS: [
        SentimentAxisDefinition(name="満足", description="製品やサービスに対する満足"),
        SentimentAxisDefinition(name="不満", description="不満や苦情"),
        SentimentAxisDefinition(name="要望", description="改善要望や提案"),
        SentimentAxisDefinition(name="質問", description="問い合わせや確認"),
        SentimentAxisDefinition(name="その他", description="上記に該当しない"),
    ],
    SentimentMode.RISK: [
        SentimentAxisDefinition(name="コンプライアンスリスク", description="法令・規則違反の可能性"),
        SentimentAxisDefinition(name="不正兆候", description="不正行為の兆候"),
        SentimentAxisDefinition(name="統制不備", description="内部統制の不備"),
        SentimentAxisDefinition(name="改善要望", description="業務改善の提案"),
    ],
}


class SentimentService:
    """感情分析エンジン"""

    def __init__(self, llm: LLMOrchestrator) -> None:
        self.llm = llm

    def get_axes(self, request: SentimentRequest) -> list[SentimentAxisDefinition]:
        """感情軸の取得"""
        if request.mode == SentimentMode.CUSTOM and request.custom_axes:
            return request.custom_axes
        return PRESET_AXES.get(request.mode, PRESET_AXES[SentimentMode.BASIC])

    def estimate_cost(self, texts: list[str], request: SentimentRequest) -> SentimentEstimate:
        """実行前コスト見積り"""
        axes = self.get_axes(request)
        avg_tokens_per_text = sum(len(t) for t in texts) / max(len(texts), 1) / 2
        system_tokens = 200 + len(axes) * 50
        total_tokens = int((system_tokens + avg_tokens_per_text + 100) * len(texts))

        # Sonnet: $3/MTok input, $15/MTok output (概算)
        cost = total_tokens * 3.0 / 1_000_000

        return SentimentEstimate(
            total_records=len(texts),
            estimated_tokens=total_tokens,
            estimated_cost_usd=round(cost, 4),
            estimated_time_seconds=max(1, len(texts) // 10),
        )

    async def analyze(
        self,
        request: SentimentRequest,
        texts: list[str],
        record_ids: list[str],
        dates: list[str] | None = None,
    ) -> SentimentResult:
        """感情分析のバッチ実行"""
        job_id = str(uuid4())
        axes = self.get_axes(request)
        axis_names = [a.name for a in axes]

        logger.info("sentiment_start", job_id=job_id, count=len(texts), axes=axis_names)

        results: list[SentimentResultItem] = []

        # バッチ処理（10件ずつ）
        batch_size = 10
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i : i + batch_size]
            batch_ids = record_ids[i : i + batch_size]

            batch_results = await self._analyze_batch(batch_texts, batch_ids, axes, request.multi_label)
            results.extend(batch_results)

        # 分布集計
        distribution: dict[str, int] = {}
        for r in results:
            for label in r.labels:
                distribution[label] = distribution.get(label, 0) + 1

        # 時系列データ
        time_series = None
        if dates:
            time_series = self._build_time_series(results, dates[: len(results)])

        # テキストプレビュー（record_id → テキスト冒頭80文字）
        text_previews = {rid: t[:80] for rid, t in zip(record_ids, texts)}

        return SentimentResult(
            job_id=job_id,
            mode=request.mode,
            axes=axis_names,
            results=results,
            distribution=distribution,
            time_series=time_series,
            text_previews=text_previews,
        )

    async def _analyze_batch(
        self,
        texts: list[str],
        record_ids: list[str],
        axes: list[SentimentAxisDefinition],
        multi_label: bool,
    ) -> list[SentimentResultItem]:
        """バッチ単位での感情分析"""
        axis_desc = "\n".join(f"- {a.name}: {a.description}" for a in axes)
        multi_label_instruction = (
            "1テキストに複数のラベルを付与可能です。"
            if multi_label
            else "各テキストに最も適切な1つのラベルを付与してください。"
        )

        texts_section = "\n".join(f"[{rid}] {text[:500]}" for rid, text in zip(record_ids, texts))

        prompt = f"""以下のテキストを分類してください。

感情軸:
{axis_desc}

{multi_label_instruction}

各テキストに対し、ラベル、スコア(0.0-1.0)、判定根拠箇所を出力してください。

テキスト:
{texts_section}

JSON配列で出力:
[{{"id": "...", "labels": [...], "scores": {{"軸名": 0.8}},
  "evidence": [{{"label": "...", "highlight": "根拠テキスト"}}]}}]"""

        try:
            response = await self.llm.invoke(
                prompt=prompt,
                task_type=TaskType.BATCH_CLASSIFICATION,
                system_prompt="テキスト分類の専門家として、正確な判定と根拠を示してください。",
                max_tokens=2000,
            )
            data = json.loads(response.strip().strip("```json").strip("```"))

            results = []
            for item in data:
                results.append(
                    SentimentResultItem(
                        record_id=str(item.get("id", "")),
                        labels=item.get("labels", []),
                        scores=item.get("scores", {}),
                        evidence_highlights=item.get("evidence", []),
                    )
                )
            return results

        except Exception as e:
            logger.warning("sentiment_batch_failed", error=str(e))
            return [SentimentResultItem(record_id=rid, labels=["error"], scores={}) for rid in record_ids]

    def _build_time_series(self, results: list[SentimentResultItem], dates: list[str]) -> list[dict]:
        """時系列データの構築"""
        df = pd.DataFrame(
            {
                "date": pd.to_datetime(dates, errors="coerce"),
                "labels": [r.labels for r in results],
                "scores": [r.scores for r in results],
            }
        )
        df = df.dropna(subset=["date"])

        if df.empty:
            return []

        df["period"] = df["date"].dt.to_period("M")
        time_data = []

        for period, group in df.groupby("period"):
            all_labels: dict[str, int] = {}
            for label_list in group["labels"]:
                for label in label_list:
                    all_labels[label] = all_labels.get(label, 0) + 1

            time_data.append(
                {
                    "period": str(period),
                    "count": len(group),
                    "distribution": all_labels,
                }
            )

        return time_data

    def detect_spikes(
        self,
        time_series: list[dict],
        window: int = 3,
        threshold: float = 2.0,
    ) -> list[dict]:
        """移動平均からのスパイク検知"""
        if len(time_series) < window:
            return []

        counts = [ts["count"] for ts in time_series]
        arr = np.array(counts, dtype=float)

        # 移動平均
        sma = np.convolve(arr, np.ones(window) / window, mode="valid")

        spikes = []
        for i in range(len(sma)):
            actual_idx = i + window - 1
            deviation = abs(arr[actual_idx] - sma[i])
            if deviation > threshold * np.std(arr):
                spikes.append(
                    {
                        "period": time_series[actual_idx]["period"],
                        "actual": int(arr[actual_idx]),
                        "sma": float(sma[i]),
                        "deviation": float(deviation),
                    }
                )

        return spikes
