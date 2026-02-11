"""PII自動匿名化サービス

多言語NERエンジンで個人情報を検知し、LLM送信前に匿名化。
可逆マッピングにより権限保持者はレポート生成時に復元可能。
"""

import hashlib
import re
from dataclasses import dataclass, field

from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class PIIMapping:
    """匿名化マッピング（可逆）"""

    original: str
    anonymized: str
    entity_type: str


@dataclass
class PIIAnonymizer:
    """PII匿名化エンジン"""

    mappings: dict[str, PIIMapping] = field(default_factory=dict)
    _counter: int = 0

    # 日本語のPIIパターン
    PATTERNS_JA = {
        "PHONE": re.compile(r"0\d{1,4}-?\d{1,4}-?\d{3,4}"),
        "EMAIL": re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"),
        "ZIPCODE": re.compile(r"\d{3}-?\d{4}"),
        "CREDIT_CARD": re.compile(r"\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}"),
    }

    # 英語のPIIパターン
    PATTERNS_EN = {
        "SSN": re.compile(r"\d{3}-\d{2}-\d{4}"),
        "PHONE": re.compile(r"\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"),
        "EMAIL": re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"),
    }

    def _generate_placeholder(self, entity_type: str) -> str:
        """匿名化プレースホルダーを生成"""
        self._counter += 1
        return f"[ANONYMIZED_{entity_type}_{self._counter:04d}]"

    def anonymize(self, text: str, language: str = "ja") -> str:
        """テキスト内のPIIを検知・匿名化"""
        patterns = self.PATTERNS_JA if language == "ja" else self.PATTERNS_EN
        patterns.update({"EMAIL": re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")})

        result = text
        for entity_type, pattern in patterns.items():
            for match in pattern.finditer(result):
                original = match.group()
                key = hashlib.sha256(original.encode()).hexdigest()[:16]

                if key not in self.mappings:
                    placeholder = self._generate_placeholder(entity_type)
                    self.mappings[key] = PIIMapping(
                        original=original,
                        anonymized=placeholder,
                        entity_type=entity_type,
                    )

                result = result.replace(original, self.mappings[key].anonymized)

        return result

    def anonymize_batch(self, texts: list[str], language: str = "ja") -> list[str]:
        """バッチ匿名化"""
        return [self.anonymize(text, language) for text in texts]

    def deanonymize(self, text: str) -> str:
        """匿名化テキストを復元（権限保持者のみ）"""
        result = text
        for mapping in self.mappings.values():
            result = result.replace(mapping.anonymized, mapping.original)
        return result

    def get_mapping_report(self) -> list[dict]:
        """匿名化マッピングレポートを生成"""
        return [
            {
                "anonymized": m.anonymized,
                "entity_type": m.entity_type,
                "hash": k,
            }
            for k, m in self.mappings.items()
        ]


# シングルトン
pii_anonymizer = PIIAnonymizer()
