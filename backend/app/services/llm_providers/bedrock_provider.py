"""AWS Bedrock LLMプロバイダー

boto3 bedrock-runtimeを使用してClaudeおよびLlamaモデルを呼び出す。
Converse APIで統一的なインターフェースを提供。
"""

import asyncio
import time

from app.core.config import settings
from app.core.logging import get_logger
from app.services.llm_providers.base import BaseLLMProvider, LLMRequest, LLMResponse
from app.services.llm_providers.errors import LLMProviderError

logger = get_logger(__name__)


class AWSBedrockProvider(BaseLLMProvider):
    """AWS Bedrock経由のLLM呼び出し"""

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            import boto3

            self._client = boto3.client(
                "bedrock-runtime",
                region_name=settings.aws_bedrock_region or settings.aws_region,
            )
        return self._client

    @property
    def provider_name(self) -> str:
        return "aws_bedrock"

    def supports_model(self, logical_model: str) -> bool:
        return logical_model.startswith(("claude", "llama"))

    async def invoke(self, model_id: str, request: LLMRequest) -> LLMResponse:
        """Bedrock Converse APIでモデルを呼び出す"""
        client = self._get_client()
        start_time = time.monotonic()

        try:
            messages = [{"role": "user", "content": [{"text": request.prompt}]}]
            system_list = []
            if request.system_prompt:
                system_list = [{"text": request.system_prompt}]

            inference_config = {
                "maxTokens": request.max_tokens,
                "temperature": request.temperature,
            }

            # boto3は同期のためrun_in_executorで非同期化
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: client.converse(
                    modelId=model_id,
                    messages=messages,
                    system=system_list,
                    inferenceConfig=inference_config,
                ),
            )

            latency_ms = (time.monotonic() - start_time) * 1000
            content = response["output"]["message"]["content"][0]["text"]
            usage = response.get("usage", {})

            return LLMResponse(
                content=content,
                model=model_id,
                provider=self.provider_name,
                input_tokens=usage.get("inputTokens"),
                output_tokens=usage.get("outputTokens"),
                latency_ms=latency_ms,
                finish_reason=response.get("stopReason"),
            )

        except Exception as e:
            raise LLMProviderError(
                provider=self.provider_name,
                model_id=model_id,
                original_error=e,
                message=f"Bedrock Converse API failed: {e}",
            ) from e

    async def health_check(self) -> bool:
        try:
            self._get_client()
            return True
        except Exception:
            return False
