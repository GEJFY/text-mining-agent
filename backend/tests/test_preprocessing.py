"""テキスト前処理パイプラインのテスト

TextPreprocessor の以下の機能を検証:
- HTML/マークアップ除去
- Unicode正規化（全角半角統一）
- 言語別トークナイズ
- ストップワード除去
- 前処理パイプライン全体
- 統計情報の算出
"""

import pandas as pd
import pytest

from app.services.text_preprocessing import TextPreprocessor


@pytest.fixture
def preprocessor() -> TextPreprocessor:
    """テスト用 TextPreprocessor インスタンスを生成"""
    return TextPreprocessor()


# =============================================================================
# HTML除去テスト
# =============================================================================
class TestCleanHtml:
    """HTML/マークアップ除去のテスト"""

    def test_removes_basic_tags(self, preprocessor: TextPreprocessor) -> None:
        """基本的なHTMLタグが除去されること"""
        html = "<p>テスト文章</p>"
        result = preprocessor.clean_html(html)
        assert result == "テスト文章"

    def test_removes_nested_tags(self, preprocessor: TextPreprocessor) -> None:
        """入れ子のHTMLタグが除去されること"""
        html = "<div><p><strong>重要</strong>な情報</p></div>"
        result = preprocessor.clean_html(html)
        assert result == "重要な情報"

    def test_removes_html_entities(self, preprocessor: TextPreprocessor) -> None:
        """HTMLエンティティがスペースに変換されること"""
        html = "A&amp;B&lt;C"
        result = preprocessor.clean_html(html)
        assert "A" in result
        assert "B" in result
        assert "<" not in result
        assert "&amp;" not in result

    def test_removes_attributes(self, preprocessor: TextPreprocessor) -> None:
        """属性付きのHTMLタグが除去されること"""
        html = '<a href="https://example.com" class="link">リンク</a>'
        result = preprocessor.clean_html(html)
        assert result == "リンク"
        assert "href" not in result

    def test_handles_empty_string(self, preprocessor: TextPreprocessor) -> None:
        """空文字列を処理できること"""
        result = preprocessor.clean_html("")
        assert result == ""

    def test_preserves_plain_text(self, preprocessor: TextPreprocessor) -> None:
        """HTMLを含まないテキストはそのまま保持されること"""
        text = "HTMLなしの普通のテキスト"
        result = preprocessor.clean_html(text)
        assert result == text

    def test_removes_multiline_html(self, preprocessor: TextPreprocessor) -> None:
        """複数行にまたがるHTMLを処理できること"""
        html = "<div>\n<p>行1</p>\n<p>行2</p>\n</div>"
        result = preprocessor.clean_html(html)
        assert "行1" in result
        assert "行2" in result
        assert "<" not in result


# =============================================================================
# 文字正規化テスト
# =============================================================================
class TestNormalizeChars:
    """Unicode正規化のテスト"""

    def test_fullwidth_to_halfwidth_ascii(self, preprocessor: TextPreprocessor) -> None:
        """全角英数字が半角に変換されること"""
        text = "ＡＢＣ１２３"
        result = preprocessor.normalize_chars(text)
        assert result == "ABC123"

    def test_halfwidth_katakana_to_fullwidth(self, preprocessor: TextPreprocessor) -> None:
        """半角カタカナが全角に変換されること"""
        text = "ｶﾀｶﾅ"
        result = preprocessor.normalize_chars(text)
        assert result == "カタカナ"

    def test_nfkc_normalization(self, preprocessor: TextPreprocessor) -> None:
        """NFKC正規化が適用されること"""
        # 合字の分解
        text = "ﬁle"  # fi合字
        result = preprocessor.normalize_chars(text)
        assert result == "file"

    def test_handles_mixed_width(self, preprocessor: TextPreprocessor) -> None:
        """全角・半角混在テキストを正規化できること"""
        text = "Ｈello Ｗorld ２０２４年"
        result = preprocessor.normalize_chars(text)
        assert result == "Hello World 2024年"

    def test_preserves_kanji(self, preprocessor: TextPreprocessor) -> None:
        """漢字はそのまま保持されること"""
        text = "日本語テスト"
        result = preprocessor.normalize_chars(text)
        assert result == "日本語テスト"


# =============================================================================
# トークナイゼーションテスト
# =============================================================================
class TestTokenize:
    """言語別トークナイズのテスト"""

    def test_english_tokenize(self, preprocessor: TextPreprocessor) -> None:
        """英語テキストがスペース区切りでトークナイズされること"""
        text = "Hello World Test"
        tokens = preprocessor.tokenize(text, language="en")
        assert tokens == ["hello", "world", "test"]

    def test_english_tokenize_lowercased(self, preprocessor: TextPreprocessor) -> None:
        """英語トークンが小文字化されること"""
        text = "NexusText AI"
        tokens = preprocessor.tokenize(text, language="en")
        assert all(t == t.lower() for t in tokens)

    def test_japanese_tokenize_returns_list(self, preprocessor: TextPreprocessor) -> None:
        """日本語テキストがリストとしてトークナイズされること"""
        text = "自然言語処理のテスト"
        tokens = preprocessor.tokenize(text, language="ja")
        assert isinstance(tokens, list)
        assert len(tokens) > 0

    def test_unknown_language_fallback(self, preprocessor: TextPreprocessor) -> None:
        """未対応言語はスペース区切りにフォールバックすること"""
        text = "fallback test case"
        tokens = preprocessor.tokenize(text, language="unknown")
        assert tokens == ["fallback", "test", "case"]


# =============================================================================
# ストップワード除去テスト
# =============================================================================
class TestRemoveStopwords:
    """ストップワード除去のテスト"""

    def test_remove_japanese_stopwords(self, preprocessor: TextPreprocessor) -> None:
        """日本語ストップワードが除去されること"""
        tokens = ["自然", "の", "言語", "は", "処理", "を", "する"]
        result = preprocessor.remove_stopwords(tokens, language="ja")
        assert "の" not in result
        assert "は" not in result
        assert "を" not in result
        assert "自然" in result
        assert "言語" in result
        assert "処理" in result

    def test_remove_english_stopwords(self, preprocessor: TextPreprocessor) -> None:
        """英語ストップワードが除去されること"""
        tokens = ["the", "quick", "brown", "fox", "is", "a", "test"]
        result = preprocessor.remove_stopwords(tokens, language="en")
        assert "the" not in result
        assert "is" not in result
        assert "a" not in result
        assert "quick" in result
        assert "brown" in result
        assert "test" in result

    def test_remove_single_char_tokens(self, preprocessor: TextPreprocessor) -> None:
        """1文字のトークンが除去されること"""
        tokens = ["テスト", "あ", "解析", "い"]
        result = preprocessor.remove_stopwords(tokens, language="ja")
        assert "あ" not in result
        assert "い" not in result
        assert "テスト" in result

    def test_custom_stopwords(self, preprocessor: TextPreprocessor) -> None:
        """カスタムストップワードが除去されること"""
        preprocessor.custom_stopwords = {"カスタム", "除外"}
        tokens = ["テスト", "カスタム", "解析", "除外", "結果"]
        result = preprocessor.remove_stopwords(tokens, language="ja")
        assert "カスタム" not in result
        assert "除外" not in result
        assert "テスト" in result
        # クリーンアップ
        preprocessor.custom_stopwords = set()


# =============================================================================
# 統計情報テスト
# =============================================================================
class TestComputeStats:
    """前処理統計情報のテスト"""

    def test_basic_stats(self, preprocessor: TextPreprocessor) -> None:
        """基本的な統計情報が正しく算出されること"""
        texts = pd.Series(["テスト1", "テスト22", "テスト333"])
        stats = preprocessor.compute_stats(texts)
        assert stats.total_rows == 3
        assert stats.null_count == 0
        assert stats.null_rate == 0.0
        assert stats.unique_values == 3

    def test_stats_with_nulls(self, preprocessor: TextPreprocessor) -> None:
        """NULL値を含むデータの統計情報が正しいこと"""
        texts = pd.Series(["テスト", None, "テスト2", None])
        stats = preprocessor.compute_stats(texts)
        assert stats.total_rows == 4
        assert stats.null_count == 2
        assert stats.null_rate == pytest.approx(0.5)

    def test_char_count_stats(self, preprocessor: TextPreprocessor) -> None:
        """文字数統計が正しいこと"""
        texts = pd.Series(["ab", "abcd", "abcdef"])  # 長さ: 2, 4, 6
        stats = preprocessor.compute_stats(texts)
        assert stats.char_count_min == 2
        assert stats.char_count_max == 6
        assert stats.char_count_mean == pytest.approx(4.0)
        assert stats.char_count_median == pytest.approx(4.0)

    def test_empty_series(self, preprocessor: TextPreprocessor) -> None:
        """空のSeriesで統計情報が算出できること"""
        texts = pd.Series([], dtype=str)
        stats = preprocessor.compute_stats(texts)
        assert stats.total_rows == 0


# =============================================================================
# パイプライン全体テスト
# =============================================================================
class TestPreprocessPipeline:
    """前処理パイプライン全体のテスト"""

    def test_full_pipeline(self, preprocessor: TextPreprocessor) -> None:
        """パイプライン全ステップが実行されること"""
        texts = pd.Series(
            [
                "<p>テスト文章１</p>",
                "<div>Ｈello World</div>",
                None,
            ]
        )
        cleaned, stats = preprocessor.preprocess_pipeline(texts, language="ja")
        assert len(cleaned) == 2  # NULL行が除去される
        assert stats.removed_rows == 1
        assert "html_removed" in stats.transformations
        assert "chars_normalized" in stats.transformations

    def test_pipeline_html_off(self, preprocessor: TextPreprocessor) -> None:
        """HTML除去を無効化できること"""
        texts = pd.Series(["<p>テスト</p>"])
        cleaned, stats = preprocessor.preprocess_pipeline(texts, remove_html=False)
        assert "html_removed" not in stats.transformations

    def test_pipeline_normalize_off(self, preprocessor: TextPreprocessor) -> None:
        """正規化を無効化できること"""
        texts = pd.Series(["ＡＢＣ"])
        cleaned, stats = preprocessor.preprocess_pipeline(texts, normalize=False)
        assert "chars_normalized" not in stats.transformations

    def test_pipeline_removes_nulls(self, preprocessor: TextPreprocessor) -> None:
        """パイプラインがNULL行を除去すること"""
        texts = pd.Series([None, None, "テスト"])
        cleaned, stats = preprocessor.preprocess_pipeline(texts)
        assert len(cleaned) == 1
        assert stats.removed_rows == 2
