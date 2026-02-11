"""PII匿名化サービスのテスト

PIIAnonymizer の以下の機能を検証:
- 電話番号の検知・匿名化
- メールアドレスの検知・匿名化
- 郵便番号の検知・匿名化
- クレジットカード番号の検知・匿名化
- SSN (英語) の検知・匿名化
- バッチ匿名化
- 匿名化の復元（可逆）
- マッピングレポートの生成
"""

import pytest

from app.services.pii_anonymizer import PIIAnonymizer, PIIMapping


@pytest.fixture
def anonymizer() -> PIIAnonymizer:
    """テスト用 PIIAnonymizer インスタンスを生成（毎テスト新規）"""
    return PIIAnonymizer()


# =============================================================================
# 電話番号検知テスト
# =============================================================================
class TestPhoneDetection:
    """電話番号の検知・匿名化テスト"""

    def test_japanese_phone_with_hyphens(self, anonymizer: PIIAnonymizer) -> None:
        """ハイフン付き日本語電話番号が匿名化されること"""
        text = "連絡先は 03-1234-5678 です"
        result = anonymizer.anonymize(text, language="ja")
        assert "03-1234-5678" not in result
        assert "[ANONYMIZED_PHONE_" in result

    def test_japanese_phone_without_hyphens(self, anonymizer: PIIAnonymizer) -> None:
        """ハイフンなし日本語電話番号が匿名化されること"""
        text = "電話番号: 09012345678"
        result = anonymizer.anonymize(text, language="ja")
        assert "09012345678" not in result

    def test_japanese_mobile_phone(self, anonymizer: PIIAnonymizer) -> None:
        """携帯電話番号が匿名化されること"""
        text = "携帯: 090-1234-5678"
        result = anonymizer.anonymize(text, language="ja")
        assert "090-1234-5678" not in result

    def test_english_phone(self, anonymizer: PIIAnonymizer) -> None:
        """英語電話番号が匿名化されること"""
        text = "Call me at (555) 123-4567"
        result = anonymizer.anonymize(text, language="en")
        assert "(555) 123-4567" not in result

    def test_english_phone_dot_separated(self, anonymizer: PIIAnonymizer) -> None:
        """ドット区切り英語電話番号が匿名化されること"""
        text = "Phone: 555.123.4567"
        result = anonymizer.anonymize(text, language="en")
        assert "555.123.4567" not in result


# =============================================================================
# メールアドレス検知テスト
# =============================================================================
class TestEmailDetection:
    """メールアドレスの検知・匿名化テスト"""

    def test_basic_email(self, anonymizer: PIIAnonymizer) -> None:
        """基本的なメールアドレスが匿名化されること"""
        text = "メールは test@example.com まで"
        result = anonymizer.anonymize(text, language="ja")
        assert "test@example.com" not in result
        assert "[ANONYMIZED_EMAIL_" in result

    def test_email_with_dots(self, anonymizer: PIIAnonymizer) -> None:
        """ドット含みメールアドレスが匿名化されること"""
        text = "連絡先: first.last@company.co.jp"
        result = anonymizer.anonymize(text, language="ja")
        assert "first.last@company.co.jp" not in result

    def test_email_with_plus(self, anonymizer: PIIAnonymizer) -> None:
        """プラス記号含みメールアドレスが匿名化されること"""
        text = "送信先: user+tag@gmail.com"
        result = anonymizer.anonymize(text, language="ja")
        assert "user+tag@gmail.com" not in result

    def test_email_english_mode(self, anonymizer: PIIAnonymizer) -> None:
        """英語モードでもメールアドレスが匿名化されること"""
        text = "Email: admin@nexustext.ai"
        result = anonymizer.anonymize(text, language="en")
        assert "admin@nexustext.ai" not in result

    def test_multiple_emails(self, anonymizer: PIIAnonymizer) -> None:
        """複数メールアドレスが全て匿名化されること"""
        text = "CC: a@test.com, b@test.com"
        result = anonymizer.anonymize(text, language="ja")
        assert "a@test.com" not in result
        assert "b@test.com" not in result


# =============================================================================
# 郵便番号・クレジットカード検知テスト
# =============================================================================
class TestOtherPIIDetection:
    """その他のPII検知テスト"""

    def test_japanese_zipcode(self, anonymizer: PIIAnonymizer) -> None:
        """日本語郵便番号が匿名化されること"""
        text = "住所: 〒100-0001 東京都千代田区"
        result = anonymizer.anonymize(text, language="ja")
        assert "100-0001" not in result

    def test_credit_card_with_spaces(self, anonymizer: PIIAnonymizer) -> None:
        """スペース区切りクレジットカード番号が匿名化されること"""
        text = "カード: 4111 1111 1111 1111"
        result = anonymizer.anonymize(text, language="ja")
        assert "4111 1111 1111 1111" not in result

    def test_credit_card_with_hyphens(self, anonymizer: PIIAnonymizer) -> None:
        """ハイフン区切りクレジットカード番号が匿名化されること"""
        text = "カード番号: 5500-0000-0000-0004"
        result = anonymizer.anonymize(text, language="ja")
        assert "5500-0000-0000-0004" not in result

    def test_ssn_english(self, anonymizer: PIIAnonymizer) -> None:
        """英語SSNが匿名化されること"""
        text = "SSN: 123-45-6789"
        result = anonymizer.anonymize(text, language="en")
        assert "123-45-6789" not in result


# =============================================================================
# 匿名化の一貫性テスト
# =============================================================================
class TestAnonymizationConsistency:
    """匿名化の一貫性テスト"""

    def test_same_value_same_placeholder(self, anonymizer: PIIAnonymizer) -> None:
        """同一PII値は同一プレースホルダーに変換されること"""
        text1 = "連絡先: test@example.com"
        text2 = "CC: test@example.com"
        result1 = anonymizer.anonymize(text1, language="ja")
        result2 = anonymizer.anonymize(text2, language="ja")

        # 同一メールアドレスは同一プレースホルダーになる
        placeholder = None
        for mapping in anonymizer.mappings.values():
            if mapping.original == "test@example.com":
                placeholder = mapping.anonymized
                break
        assert placeholder is not None
        assert placeholder in result1
        assert placeholder in result2

    def test_different_values_different_placeholders(self, anonymizer: PIIAnonymizer) -> None:
        """異なるPII値は異なるプレースホルダーに変換されること"""
        text = "a@test.com と b@test.com"
        anonymizer.anonymize(text, language="ja")
        placeholders = [m.anonymized for m in anonymizer.mappings.values()]
        assert len(placeholders) == len(set(placeholders))  # 全てユニーク


# =============================================================================
# 匿名化復元テスト
# =============================================================================
class TestDeanonymization:
    """匿名化の復元（可逆マッピング）テスト"""

    def test_deanonymize_email(self, anonymizer: PIIAnonymizer) -> None:
        """メールアドレスが復元できること"""
        original = "連絡先は test@example.com です"
        anonymized = anonymizer.anonymize(original, language="ja")
        restored = anonymizer.deanonymize(anonymized)
        assert "test@example.com" in restored

    def test_deanonymize_phone(self, anonymizer: PIIAnonymizer) -> None:
        """電話番号が復元できること"""
        original = "電話: 03-1234-5678"
        anonymized = anonymizer.anonymize(original, language="ja")
        assert "03-1234-5678" not in anonymized
        restored = anonymizer.deanonymize(anonymized)
        assert "03-1234-5678" in restored

    def test_deanonymize_multiple_pii(self, anonymizer: PIIAnonymizer) -> None:
        """複数種のPIIが全て復元できること"""
        original = "名前: test@a.com 電話: 03-9999-8888"
        anonymized = anonymizer.anonymize(original, language="ja")
        assert "test@a.com" not in anonymized
        assert "03-9999-8888" not in anonymized
        restored = anonymizer.deanonymize(anonymized)
        assert "test@a.com" in restored
        assert "03-9999-8888" in restored

    def test_deanonymize_preserves_non_pii(self, anonymizer: PIIAnonymizer) -> None:
        """PII以外のテキストが保持されること"""
        original = "メモ: test@example.com に送信済み"
        anonymized = anonymizer.anonymize(original, language="ja")
        restored = anonymizer.deanonymize(anonymized)
        assert "メモ:" in restored
        assert "に送信済み" in restored


# =============================================================================
# バッチ匿名化テスト
# =============================================================================
class TestBatchAnonymization:
    """バッチ匿名化テスト"""

    def test_batch_anonymize(self, anonymizer: PIIAnonymizer) -> None:
        """複数テキストのバッチ匿名化が動作すること"""
        texts = [
            "連絡先: user1@test.com",
            "電話: 03-1111-2222",
            "PIIなしのテキスト",
        ]
        results = anonymizer.anonymize_batch(texts, language="ja")
        assert len(results) == 3
        assert "user1@test.com" not in results[0]
        assert "03-1111-2222" not in results[1]
        assert results[2] == "PIIなしのテキスト"

    def test_batch_anonymize_empty_list(self, anonymizer: PIIAnonymizer) -> None:
        """空リストのバッチ匿名化が動作すること"""
        results = anonymizer.anonymize_batch([], language="ja")
        assert results == []


# =============================================================================
# マッピングレポートテスト
# =============================================================================
class TestMappingReport:
    """マッピングレポート生成テスト"""

    def test_mapping_report_structure(self, anonymizer: PIIAnonymizer) -> None:
        """マッピングレポートのデータ構造が正しいこと"""
        anonymizer.anonymize("test@example.com 03-1234-5678", language="ja")
        report = anonymizer.get_mapping_report()
        assert len(report) >= 2

        for entry in report:
            assert "anonymized" in entry
            assert "entity_type" in entry
            assert "hash" in entry

    def test_mapping_report_empty(self, anonymizer: PIIAnonymizer) -> None:
        """PIIなし時に空レポートが返されること"""
        anonymizer.anonymize("PIIを含まないテキスト", language="ja")
        report = anonymizer.get_mapping_report()
        assert report == []

    def test_mapping_report_entity_types(self, anonymizer: PIIAnonymizer) -> None:
        """レポートのエンティティタイプが正しいこと"""
        anonymizer.anonymize("test@example.com", language="ja")
        report = anonymizer.get_mapping_report()
        entity_types = [entry["entity_type"] for entry in report]
        assert "EMAIL" in entity_types
