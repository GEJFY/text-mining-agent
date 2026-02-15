"""Azure AI Foundry LLMプロバイダー

Azure AI Foundryにデプロイされたモデル(Claude, GPT)を
OpenAI互換API経由で呼び出す。
"""

import time

from app.core.config import settings
from app.core.logging import get_logger
from app.services.llm_providers.base import BaseLLMProvider, LLMRequest, LLMResponse
from app.services.llm_providers.errors import LLMProviderError

logger = get_logger(__name__)


class AzureAIFoundryProvider(BaseLLMProvider):
    """Azure AI Foundry経由のLLM呼び出し

    Azure AI FoundryはOpenAI互換エンドポイントを提供するため、
    openai SDK の AsyncAzureOpenAI クライアントで統一的に呼び出し可能。
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            from openai import AsyncAzureOpenAI

            self._client = AsyncAzureOpenAI(
                azure_endpoint=settings.azure_ai_foundry_endpoint,
                api_key=settings.azure_ai_foundry_api_key,
                api_version=settings.azure_ai_foundry_api_version,
            )
        return self._client

    @property
    def provider_name(self) -> str:
        return "azure_ai_foundry"

    def supports_model(self, logical_model: str) -> bool:
        return logical_model.startswith(("claude", "gpt"))

    async def invoke(self, model_id: str, request: LLMRequest) -> LLMResponse:
        """Azure AI Foundryデプロイメントを呼び出す

        model_id はAzure上のデプロイメント名に対応する。
        """
        client = self._get_client()
        start_time = time.monotonic()

        try:
            messages = []
            if request.system_prompt:
                messages.append({"role": "system", "content": request.system_prompt})
            messages.append({"role": "user", "content": request.prompt})

            response = await client.chat.completions.create(
                model=model_id,
                messages=messages,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
            )

            latency_ms = (time.monotonic() - start_time) * 1000
            choice = response.choices[0]

            return LLMResponse(
                content=choice.message.content or "",
                model=model_id,
                provider=self.provider_name,
                input_tokens=response.usage.prompt_tokens if response.usage else None,
                output_tokens=(response.usage.completion_tokens if response.usage else None),
                latency_ms=latency_ms,
                finish_reason=choice.finish_reason,
            )

        except Exception as e:
            raise LLMProviderError(
                provider=self.provider_name,
                model_id=model_id,
                original_error=e,
                message=f"Azure AI Foundry call failed: {e}",
            ) from e

    async def health_check(self) -> bool:
        try:
            self._get_client()
            return True
        except Exception:
            return False
