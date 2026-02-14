"""ローカルLLMプロバイダー

Ollama, vLLM, LM Studio等のOpenAI互換APIを呼び出す。
"""

import time

from app.core.config import settings
from app.core.logging import get_logger
from app.services.llm_providers.base import BaseLLMProvider, LLMRequest, LLMResponse
from app.services.llm_providers.errors import LLMProviderError

logger = get_logger(__name__)


class LocalLLMProvider(BaseLLMProvider):
    """ローカルLLM (Ollama/vLLM/LM Studio) プロバイダー

    OpenAI互換APIとOllama固有APIの両方をサポート。
    設定のlocal_llm_api_formatで切り替え可能。
    """

    @property
    def provider_name(self) -> str:
        return "local"

    def supports_model(self, logical_model: str) -> bool:
        return logical_model.startswith(("llama", "mistral", "phi", "qwen"))

    async def invoke(self, model_id: str, request: LLMRequest) -> LLMResponse:
        api_format = settings.local_llm_api_format

        if api_format == "openai_compatible":
            return await self._call_openai_compatible(model_id, request)
        else:
            return await self._call_ollama(model_id, request)

    async def _call_ollama(self, model_id: str, request: LLMRequest) -> LLMResponse:
        """Ollama固有API (/api/generate)"""
        import httpx

        start_time = time.monotonic()
        base_url = settings.local_llm_base_url

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/api/generate",
                    json={
                        "model": model_id,
                        "prompt": (
                            f"{request.system_prompt}\n\n{request.prompt}" if request.system_prompt else request.prompt
                        ),
                        "stream": False,
                    },
                    timeout=120.0,
                )
                data = response.json()
                latency_ms = (time.monotonic() - start_time) * 1000
                return LLMResponse(
                    content=data["response"],
                    model=model_id,
                    provider=self.provider_name,
                    latency_ms=latency_ms,
                )
        except Exception as e:
            raise LLMProviderError(
                provider=self.provider_name,
                model_id=model_id,
                original_error=e,
                message=f"Ollama API call failed: {e}",
            ) from e

    async def _call_openai_compatible(self, model_id: str, request: LLMRequest) -> LLMResponse:
        """OpenAI互換API (vLLM, LM Studio)"""
        from openai import AsyncOpenAI

        start_time = time.monotonic()
        base_url = settings.local_llm_base_url

        try:
            client = AsyncOpenAI(api_key="not-needed", base_url=f"{base_url}/v1")
            messages = []
            if request.system_prompt:
                messages.append({"role": "system", "content": request.system_prompt})
            messages.append({"role": "user", "content": request.prompt})

            response = await client.chat.completions.create(
                model=model_id, messages=messages, max_tokens=request.max_tokens
            )
            latency_ms = (time.monotonic() - start_time) * 1000
            return LLMResponse(
                content=response.choices[0].message.content or "",
                model=model_id,
                provider=self.provider_name,
                latency_ms=latency_ms,
            )
        except Exception as e:
            raise LLMProviderError(
                provider=self.provider_name,
                model_id=model_id,
                original_error=e,
                message=f"OpenAI-compatible API call failed: {e}",
            ) from e

    async def health_check(self) -> bool:
        import httpx

        base_url = settings.local_llm_base_url
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{base_url}/api/tags", timeout=5.0)
                return resp.status_code == 200
        except Exception:
            return False
