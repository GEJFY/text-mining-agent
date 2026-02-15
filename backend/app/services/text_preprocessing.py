"""テキスト前処理パイプライン

HTML除去、文字コード正規化、形態素解析、ストップワード除去、Embedding生成。
各ステップの可視化・カスタマイズに対応。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np
import pandas as pd

from app.core.config import settings
from app.core.logging import get_logger

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = get_logger(__name__)


@dataclass
class PreprocessingStats:
    """前処理の統計情報"""

    total_rows: int = 0
    null_count: int = 0
    null_rate: float = 0.0
    char_count_mean: float = 0.0
    char_count_median: float = 0.0
    char_count_min: int = 0
    char_count_max: int = 0
    unique_values: int = 0
    removed_rows: int = 0
    transformations: list[str] = field(default_factory=list)


class TextPreprocessor:
    """テキスト前処理エンジン"""

    # 言語別ストップワード（プリセット）
    STOPWORDS_JA = {
        "の",
        "に",
        "は",
        "を",
        "た",
        "が",
        "で",
        "て",
        "と",
        "し",
        "れ",
        "さ",
        "ある",
        "いる",
        "する",
        "こと",
        "これ",
        "それ",
        "もの",
        "ない",
        "です",
        "ます",
    }
    STOPWORDS_EN = {
        "the",
        "a",
        "an",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "can",
        "shall",
        "and",
        "or",
        "but",
        "if",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "from",
        "this",
        "that",
    }

    def __init__(self) -> None:
        self._embedding_model: SentenceTransformer | None = None
        self.custom_stopwords: set[str] = set()

    @property
    def embedding_model(self) -> SentenceTransformer:
        if self._embedding_model is None:
            from sentence_transformers import SentenceTransformer

            self._embedding_model = SentenceTransformer(settings.embedding_model)
        return self._embedding_model

    def compute_stats(self, texts: pd.Series) -> PreprocessingStats:
        """テキストの統計プレビューを生成"""
        char_counts = texts.dropna().str.len()
        return PreprocessingStats(
            total_rows=len(texts),
            null_count=int(texts.isna().sum()),
            null_rate=float(texts.isna().mean()),
            char_count_mean=float(char_counts.mean()) if len(char_counts) > 0 else 0.0,
            char_count_median=float(char_counts.median()) if len(char_counts) > 0 else 0.0,
            char_count_min=int(char_counts.min()) if len(char_counts) > 0 else 0,
            char_count_max=int(char_counts.max()) if len(char_counts) > 0 else 0,
            unique_values=int(texts.nunique()),
        )

    def clean_html(self, text: str) -> str:
        """HTML/マークアップ除去"""
        text = re.sub(r"<[^>]+>", "", text)
        text = re.sub(r"&[a-zA-Z]+;", " ", text)
        return text.strip()

    def normalize_chars(self, text: str) -> str:
        """全角半角統一・Unicode正規化"""
        import unicodedata

        text = unicodedata.normalize("NFKC", text)
        return text

    def tokenize_ja(self, text: str) -> list[str]:
        """日本語形態素解析（MeCab/fugashi）"""
        try:
            import fugashi

            tagger = fugashi.Tagger()
            return [word.surface for word in tagger(text) if word.feature[0] in ("名詞", "動詞", "形容詞")]
        except ImportError:
            # フォールバック: 簡易分割
            return text.split()

    def tokenize_zh(self, text: str) -> list[str]:
        """中国語分かち書き（jieba）"""
        import jieba

        return list(jieba.cut(text))

    def tokenize(self, text: str, language: str = "ja") -> list[str]:
        """言語別トークナイズ"""
        if language == "ja":
            return self.tokenize_ja(text)
        elif language == "zh":
            return self.tokenize_zh(text)
        else:
            return text.lower().split()

    def remove_stopwords(self, tokens: list[str], language: str = "ja") -> list[str]:
        """ストップワード除去"""
        stopwords = self.STOPWORDS_JA if language == "ja" else self.STOPWORDS_EN
        all_stopwords = stopwords | self.custom_stopwords
        return [t for t in tokens if t not in all_stopwords and len(t) > 1]

    def preprocess_pipeline(
        self,
        texts: pd.Series,
        language: str = "ja",
        remove_html: bool = True,
        normalize: bool = True,
        remove_stops: bool = True,
    ) -> tuple[pd.Series, PreprocessingStats]:
        """前処理パイプライン実行"""
        stats = self.compute_stats(texts)

        # NULL除去
        cleaned = texts.dropna().copy()
        stats.removed_rows = len(texts) - len(cleaned)

        if remove_html:
            cleaned = cleaned.apply(self.clean_html)
            stats.transformations.append("html_removed")

        if normalize:
            cleaned = cleaned.apply(self.normalize_chars)
            stats.transformations.append("chars_normalized")

        if remove_stops:
            stats.transformations.append("stopwords_removed")

        logger.info(
            "preprocessing_complete",
            total=stats.total_rows,
            removed=stats.removed_rows,
            steps=stats.transformations,
        )
        return cleaned, stats

    def generate_embeddings(self, texts: list[str], batch_size: int = 64) -> np.ndarray:
        """多言語SBERTによるEmbedding生成"""
        logger.info("generating_embeddings", count=len(texts), model=settings.embedding_model)
        embeddings = self.embedding_model.encode(
            texts, batch_size=batch_size, show_progress_bar=True, normalize_embeddings=True
        )
        return np.array(embeddings)


# シングルトン
text_preprocessor = TextPreprocessor()
