"""直接API LLMプロバイダー

各ベンダーの直接API (Anthropic, OpenAI, Google) を呼び出す。
現行の LLMOrchestrator._call_* メソッドのリファクタリング。
"""

import time

from app.core.config import settings
from app.core.logging import get_logger
from app.services.llm_providers.base import BaseLLMProvider, LLMRequest, LLMResponse
from app.services.llm_providers.errors import LLMProviderError

logger = get_logger(__name__)


class DirectAPIProvider(BaseLLMProvider):
    """各ベンダーの直接APIを呼び出すプロバイダー

    モデル名のプレフィックスに基づいて、適切なSDKクライアントにディスパッチ。
    現行動作との完全な後方互換性を維持。
    """

    @property
    def provider_name(self) -> str:
        return "direct"

    def supports_model(self, logical_model: str) -> bool:
        return logical_model.startswith(("claude", "gpt", "gemini"))

    async def invoke(self, model_id: str, request: LLMRequest) -> LLMResponse:
        start_time = time.monotonic()
        try:
            if model_id.startswith("claude"):
                return await self._call_anthropic(model_id, request, start_time)
            elif model_id.startswith("gpt"):
                return await self._call_openai(model_id, request, start_time)
            elif model_id.startswith("gemini"):
                return await self._call_google(model_id, request, start_time)
            else:
                raise ValueError(f"DirectAPIProvider does not support model: {model_id}")
        except LLMProviderError:
            raise
        except Exception as e:
            raise LLMProviderError(
                provider=self.provider_name,
                model_id=model_id,
                original_error=e,
                message=f"Direct API call failed: {e}",
            ) from e

    async def _call_anthropic(
        self, model_id: str, request: LLMRequest, start_time: float
    ) -> LLMResponse:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model=model_id,
            max_tokens=request.max_tokens,
            system=request.system_prompt or "You are a text mining analysis assistant.",
            messages=[{"role": "user", "content": request.prompt}],
        )
        latency_ms = (time.monotonic() - start_time) * 1000
        return LLMResponse(
            content=response.content[0].text,
            model=model_id,
            provider=self.provider_name,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            latency_ms=latency_ms,
            finish_reason=response.stop_reason,
        )

    async def _call_openai(
        self, model_id: str, request: LLMRequest, start_time: float
    ) -> LLMResponse:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.append({"role": "user", "content": request.prompt})

        response = await client.chat.completions.create(
            model=model_id, messages=messages, max_tokens=request.max_tokens
        )
        latency_ms = (time.monotonic() - start_time) * 1000
        choice = response.choices[0]
        return LLMResponse(
            content=choice.message.content or "",
            model=model_id,
            provider=self.provider_name,
            input_tokens=response.usage.prompt_tokens if response.usage else None,
            output_tokens=response.usage.completion_tokens if response.usage else None,
            latency_ms=latency_ms,
            finish_reason=choice.finish_reason,
        )

    async def _call_google(
        self, model_id: str, request: LLMRequest, start_time: float
    ) -> LLMResponse:
        import vertexai
        from vertexai.generative_models import GenerativeModel

        vertexai.init(
            project=settings.google_cloud_project, location=settings.gcp_region
        )
        gen_model = GenerativeModel(model_id)
        full_prompt = (
            f"{request.system_prompt}\n\n{request.prompt}"
            if request.system_prompt
            else request.prompt
        )
        response = await gen_model.generate_content_async(full_prompt)
        latency_ms = (time.monotonic() - start_time) * 1000
        return LLMResponse(
            content=response.text,
            model=model_id,
            provider=self.provider_name,
            latency_ms=latency_ms,
        )

    async def health_check(self) -> bool:
        return True
