"""GCP Vertex AI LLMプロバイダー

Vertex AI上のGeminiモデルおよびClaude (Model Garden)を呼び出す。
"""

import time

from app.core.config import settings
from app.core.logging import get_logger
from app.services.llm_providers.base import BaseLLMProvider, LLMRequest, LLMResponse
from app.services.llm_providers.errors import LLMProviderError

logger = get_logger(__name__)


class GCPVertexAIProvider(BaseLLMProvider):
    """GCP Vertex AI経由のLLM呼び出し

    Geminiモデル: vertexai.GenerativeModel
    Claude on Vertex: anthropic[vertex] SDK (AnthropicVertex)
    """

    def __init__(self):
        self._initialized = False

    def _ensure_initialized(self):
        if not self._initialized:
            import vertexai

            vertexai.init(
                project=settings.gcp_vertex_ai_project
                or settings.google_cloud_project,
                location=settings.gcp_vertex_ai_region or settings.gcp_region,
            )
            self._initialized = True

    @property
    def provider_name(self) -> str:
        return "gcp_vertex_ai"

    def supports_model(self, logical_model: str) -> bool:
        return logical_model.startswith(("gemini", "claude"))

    async def invoke(self, model_id: str, request: LLMRequest) -> LLMResponse:
        self._ensure_initialized()
        start_time = time.monotonic()

        try:
            if "claude" in model_id:
                return await self._invoke_claude_on_vertex(
                    model_id, request, start_time
                )
            else:
                return await self._invoke_gemini(model_id, request, start_time)
        except LLMProviderError:
            raise
        except Exception as e:
            raise LLMProviderError(
                provider=self.provider_name,
                model_id=model_id,
                original_error=e,
                message=f"Vertex AI call failed: {e}",
            ) from e

    async def _invoke_gemini(
        self, model_id: str, request: LLMRequest, start_time: float
    ) -> LLMResponse:
        """Vertex AI Geminiモデル呼び出し"""
        from vertexai.generative_models import GenerativeModel

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

    async def _invoke_claude_on_vertex(
        self, model_id: str, request: LLMRequest, start_time: float
    ) -> LLMResponse:
        """Vertex AI Claude (Model Garden) 呼び出し"""
        from anthropic import AsyncAnthropicVertex

        client = AsyncAnthropicVertex(
            project_id=settings.gcp_vertex_ai_project
            or settings.google_cloud_project,
            region=settings.gcp_vertex_ai_region or settings.gcp_region,
        )
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
            input_tokens=response.usage.input_tokens if response.usage else None,
            output_tokens=response.usage.output_tokens if response.usage else None,
            latency_ms=latency_ms,
            finish_reason=response.stop_reason,
        )

    async def health_check(self) -> bool:
        try:
            self._ensure_initialized()
            return True
        except Exception:
            return False
