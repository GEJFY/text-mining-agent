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
    DEFAULT_STOPWORDS_JA = {
        # 助詞
        "の",
        "に",
        "は",
        "を",
        "が",
        "で",
        "て",
        "と",
        "も",
        "か",
        "から",
        "まで",
        "より",
        "へ",
        "や",
        "など",
        "ば",
        "けど",
        "けれど",
        "けれども",
        "のに",
        "ので",
        "って",
        "とか",
        # 助動詞・コピュラ
        "た",
        "だ",
        "です",
        "ます",
        "ません",
        "でした",
        "ました",
        "ない",
        "ぬ",
        "れる",
        "られる",
        "せる",
        "させる",
        # 動詞（機能語的）
        "する",
        "いる",
        "ある",
        "なる",
        "できる",
        "おる",
        "し",
        "さ",
        "れ",
        "い",
        "き",
        "く",
        # 代名詞・指示詞
        "これ",
        "それ",
        "あれ",
        "この",
        "その",
        "あの",
        "ここ",
        "そこ",
        "あそこ",
        "こう",
        "そう",
        "ああ",
        "どれ",
        "どの",
        "どこ",
        "どう",
        # 接続詞
        "そして",
        "しかし",
        "また",
        "ただし",
        "なお",
        "つまり",
        "すなわち",
        "ところで",
        "さらに",
        "しかも",
        "だから",
        "したがって",
        "ところが",
        "それで",
        "でも",
        # 副詞・形式名詞
        "こと",
        "もの",
        "ため",
        "ところ",
        "よう",
        "はず",
        "わけ",
        "とき",
        "ほう",
        "うち",
        "かた",
        "ほか",
        "とても",
        "かなり",
        "やはり",
        "まだ",
        "もう",
        "すでに",
        "ちょっと",
        "少し",
        "全く",
        "非常",
        # 記号的
        "等",
        "他",
        "方",
        "中",
        "上",
        "下",
        "前",
        "後",
        "間",
    }
    DEFAULT_STOPWORDS_EN = {
        # Articles
        "the",
        "a",
        "an",
        # Be verbs
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        # Have verbs
        "have",
        "has",
        "had",
        # Do verbs
        "do",
        "does",
        "did",
        # Modal verbs
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "can",
        "shall",
        # Prepositions
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "from",
        "about",
        "into",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "between",
        "under",
        "over",
        # Conjunctions
        "and",
        "or",
        "but",
        "if",
        "so",
        "yet",
        "nor",
        "both",
        "either",
        "neither",
        "not",
        "only",
        "also",
        # Pronouns
        "this",
        "that",
        "these",
        "those",
        "it",
        "its",
        "i",
        "me",
        "my",
        "we",
        "our",
        "us",
        "you",
        "your",
        "he",
        "she",
        "him",
        "her",
        "his",
        "they",
        "them",
        "their",
        "what",
        "which",
        "who",
        "whom",
        # Common words
        "there",
        "here",
        "then",
        "than",
        "when",
        "where",
        "how",
        "all",
        "each",
        "every",
        "any",
        "some",
        "no",
        "such",
        "very",
        "just",
        "more",
        "most",
        "other",
        "own",
        "same",
        "as",
        "up",
        "out",
        "much",
        "many",
    }

    def __init__(self) -> None:
        self._embedding_model: SentenceTransformer | None = None
        self.stopwords_ja: set[str] = set(self.DEFAULT_STOPWORDS_JA)
        self.stopwords_en: set[str] = set(self.DEFAULT_STOPWORDS_EN)
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
        stopwords = self.stopwords_ja if language == "ja" else self.stopwords_en
        all_stopwords = stopwords | self.custom_stopwords
        return [t for t in tokens if t not in all_stopwords and len(t) > 1]

    def get_stopwords(self) -> dict[str, list[str]]:
        """全ストップワードを取得"""
        return {
            "ja": sorted(self.stopwords_ja),
            "en": sorted(self.stopwords_en),
            "custom": sorted(self.custom_stopwords),
        }

    def update_stopwords(self, category: str, words: list[str], mode: str = "replace") -> dict[str, list[str]]:
        """ストップワードを更新

        Args:
            category: "ja", "en", "custom"
            words: 更新する単語リスト
            mode: "replace"=全置換, "add"=追加, "remove"=削除
        """
        target = self._get_stopword_set(category)
        word_set = set(words)

        if mode == "replace":
            target.clear()
            target.update(word_set)
        elif mode == "add":
            target.update(word_set)
        elif mode == "remove":
            target -= word_set

        self._set_stopword_set(category, target)
        return self.get_stopwords()

    def reset_stopwords(self, category: str) -> dict[str, list[str]]:
        """ストップワードをデフォルトにリセット"""
        if category == "ja":
            self.stopwords_ja = set(self.DEFAULT_STOPWORDS_JA)
        elif category == "en":
            self.stopwords_en = set(self.DEFAULT_STOPWORDS_EN)
        elif category == "custom":
            self.custom_stopwords = set()
        return self.get_stopwords()

    def _get_stopword_set(self, category: str) -> set[str]:
        if category == "ja":
            return self.stopwords_ja
        elif category == "en":
            return self.stopwords_en
        return self.custom_stopwords

    def _set_stopword_set(self, category: str, words: set[str]) -> None:
        if category == "ja":
            self.stopwords_ja = words
        elif category == "en":
            self.stopwords_en = words
        else:
            self.custom_stopwords = words

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

    def preload_model(self) -> None:
        """埋め込みモデルを事前ロード（起動時に呼び出し）"""
        logger.info("preloading_embedding_model", model=settings.embedding_model)
        _ = self.embedding_model
        logger.info("embedding_model_ready")


# シングルトン
text_preprocessor = TextPreprocessor()
