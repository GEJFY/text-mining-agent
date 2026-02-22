"""Google Gemini Direct API プロバイダー

google-generativeai SDK を使用して Gemini API を直接呼び出す。
Vertex AI ではなく、Google AI Studio の API キーで認証。
"""

import time

from app.core.config import settings
from app.core.logging import get_logger
from app.services.llm_providers.base import BaseLLMProvider, LLMRequest, LLMResponse
from app.services.llm_providers.errors import LLMProviderError

logger = get_logger(__name__)


class GeminiDirectProvider(BaseLLMProvider):
    """Google Gemini Direct API プロバイダー

    google-generativeai SDK を使用。API キーベースの認証。
    """

    def __init__(self) -> None:
        self._configured = False

    def _ensure_configured(self) -> None:
        if self._configured:
            return
        import google.generativeai as genai

        api_key = settings.gemini_api_key
        if not api_key:
            raise LLMProviderError(
                provider=self.provider_name,
                model_id="",
                message="NEXUSTEXT_GEMINI_API_KEY is not set",
            )
        genai.configure(api_key=api_key)
        self._configured = True

    @property
    def provider_name(self) -> str:
        return "gemini_direct"

    def supports_model(self, logical_model: str) -> bool:
        return logical_model.startswith("gemini")

    async def invoke(self, model_id: str, request: LLMRequest) -> LLMResponse:
        start_time = time.monotonic()
        try:
            self._ensure_configured()
            import google.generativeai as genai

            model = genai.GenerativeModel(
                model_name=model_id,
                system_instruction=request.system_prompt or None,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=request.max_tokens,
                    temperature=request.temperature,
                ),
            )

            response = await model.generate_content_async(request.prompt)
            latency_ms = (time.monotonic() - start_time) * 1000

            # トークン使用量
            input_tokens = None
            output_tokens = None
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                input_tokens = getattr(response.usage_metadata, "prompt_token_count", None)
                output_tokens = getattr(response.usage_metadata, "candidates_token_count", None)

            return LLMResponse(
                content=response.text,
                model=model_id,
                provider=self.provider_name,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                finish_reason="stop",
            )

        except LLMProviderError:
            raise
        except Exception as e:
            raise LLMProviderError(
                provider=self.provider_name,
                model_id=model_id,
                original_error=e,
                message=f"Gemini Direct API call failed: {e}",
            ) from e

    async def health_check(self) -> bool:
        try:
            self._ensure_configured()
            import google.generativeai as genai

            model = genai.GenerativeModel("gemini-2.0-flash")
            response = await model.generate_content_async("ping")
            return bool(response.text)
        except Exception:
            return False
