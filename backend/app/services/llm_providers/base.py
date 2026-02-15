"""LLMプロバイダー抽象基底クラス

各クラウドプラットフォーム/直接API経由のLLM呼び出しを統一する。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class LLMResponse:
    """LLM呼び出しレスポンスの統一データ構造"""

    content: str
    model: str
    provider: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    latency_ms: float | None = None
    finish_reason: str | None = None


@dataclass
class LLMRequest:
    """LLM呼び出しリクエストの統一データ構造"""

    prompt: str
    system_prompt: str = ""
    max_tokens: int = 4096
    temperature: float = 0.0


class BaseLLMProvider(ABC):
    """LLMプロバイダーの抽象基底クラス

    全てのLLMプロバイダー(Bedrock, Azure AI Foundry, Vertex AI, Direct API, Local)
    はこのクラスを継承し、共通インターフェースを実装する。
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """プロバイダー識別名 (ログ・メトリクス用)"""
        ...

    @abstractmethod
    async def invoke(self, model_id: str, request: LLMRequest) -> LLMResponse:
        """モデルを呼び出して結果を返す

        Args:
            model_id: プロバイダー固有のモデルID
            request: 統一リクエスト構造

        Returns:
            LLMResponse: 統一レスポンス構造

        Raises:
            LLMProviderError: プロバイダー固有エラーのラップ
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """プロバイダーの接続性チェック"""
        ...

    @abstractmethod
    def supports_model(self, logical_model: str) -> bool:
        """このプロバイダーが指定された論理モデル名をサポートするか"""
        ...

    async def close(self) -> None:  # noqa: B027
        """リソースのクリーンアップ (オプショナル)"""
