"""LLMプロバイダーファクトリ

デプロイメントモードに応じて適切なプロバイダーインスタンスを返す。
"""

from functools import lru_cache

from app.core.config import settings
from app.services.llm_providers.base import BaseLLMProvider


@lru_cache
def get_llm_provider() -> BaseLLMProvider:
    """設定のllm_deployment_modeに基づいてプロバイダーを返す"""
    mode = settings.llm_deployment_mode

    if mode == "aws_bedrock":
        from app.services.llm_providers.bedrock_provider import AWSBedrockProvider

        return AWSBedrockProvider()
    elif mode == "azure_ai_foundry":
        from app.services.llm_providers.azure_provider import AzureAIFoundryProvider

        return AzureAIFoundryProvider()
    elif mode == "gcp_vertex_ai":
        from app.services.llm_providers.vertex_provider import GCPVertexAIProvider

        return GCPVertexAIProvider()
    elif mode == "local":
        from app.services.llm_providers.local_provider import LocalLLMProvider

        return LocalLLMProvider()
    else:
        # デフォルト: 各ベンダー直接API（現行動作）
        from app.services.llm_providers.direct_provider import DirectAPIProvider

        return DirectAPIProvider()
