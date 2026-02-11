"""LLMオーケストレーション - マルチモデルルーティング

用途・コスト・データ機密度に応じて最適なLLMを自動選択します。
サーキットブレーカーによるフォールトトレランスを提供。
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum

from app.core.cloud_provider import get_api_gateway
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class TaskType(str, Enum):
    """タスク種別によるモデル選択"""

    LABELING = "labeling"  # クラスターラベリング・要約 → Opus
    SUMMARIZATION = "summarization"  # レポート生成・要約 → Opus
    BATCH_CLASSIFICATION = "batch_classification"  # 感情分析バッチ → Sonnet
    PII_DETECTION = "pii_detection"  # PII検知 → mini
    TRANSLATION = "translation"  # 多言語翻訳 → GPT-5.2
    VISION = "vision"  # 画像読取 → Gemini
    CONFIDENTIAL = "confidential"  # 機密データ → Llama (ローカル)
    CHAT = "chat"  # 対話応答 → Sonnet


class DataSensitivity(str, Enum):
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


@dataclass
class CircuitBreaker:
    """サーキットブレーカーによる障害時自動切替"""

    failure_count: int = 0
    failure_threshold: int = 3
    last_failure: datetime | None = None
    is_open: bool = False

    def record_failure(self) -> None:
        self.failure_count += 1
        self.last_failure = datetime.now(UTC)
        if self.failure_count >= self.failure_threshold:
            self.is_open = True
            logger.warning("circuit_breaker_open", failures=self.failure_count)

    def record_success(self) -> None:
        self.failure_count = 0
        self.is_open = False

    def can_proceed(self) -> bool:
        if not self.is_open:
            return True
        # 60秒後にhalf-openで再試行
        if self.last_failure:
            elapsed = (datetime.now(UTC) - self.last_failure).total_seconds()
            if elapsed > 60:
                return True
        return False


@dataclass
class LLMOrchestrator:
    """マルチLLMオーケストレーター"""

    circuit_breakers: dict[str, CircuitBreaker] = field(default_factory=dict)

    # タスク種別→優先モデルのマッピング
    TASK_MODEL_MAP: dict[TaskType, list[str]] = field(
        default_factory=lambda: {
            TaskType.LABELING: ["claude-opus-4-6", "gpt-5.2", "gemini-3.0-pro"],
            TaskType.SUMMARIZATION: ["claude-opus-4-6", "gemini-3.0-pro", "gpt-5.2"],
            TaskType.BATCH_CLASSIFICATION: ["claude-sonnet-4-5-20250929", "gpt-5-mini", "gemini-3.0-flash"],
            TaskType.PII_DETECTION: ["gpt-5-mini", "claude-sonnet-4-5-20250929"],
            TaskType.TRANSLATION: ["gpt-5.2", "claude-opus-4-6", "gemini-3.0-pro"],
            TaskType.VISION: ["gemini-3.0-pro", "gpt-5.2", "claude-opus-4-6"],
            TaskType.CONFIDENTIAL: ["llama-4-405b"],
            TaskType.CHAT: ["claude-sonnet-4-5-20250929", "gpt-5-mini"],
        }
    )

    def select_model(
        self,
        task_type: TaskType,
        sensitivity: DataSensitivity = DataSensitivity.INTERNAL,
    ) -> str:
        """タスク種別と機密度に基づいてモデルを選択"""
        # 機密データはローカルモデルを強制
        if sensitivity == DataSensitivity.RESTRICTED:
            return "llama-4-405b"

        candidates = self.TASK_MODEL_MAP.get(task_type, ["claude-sonnet-4-5-20250929"])

        for model in candidates:
            cb = self.circuit_breakers.get(model)
            if cb is None or cb.can_proceed():
                return model

        # 全モデルがダウンの場合、最初の候補をフォールバック
        logger.error("all_models_unavailable", task_type=task_type)
        return candidates[0]

    async def invoke(
        self,
        prompt: str,
        task_type: TaskType,
        sensitivity: DataSensitivity = DataSensitivity.INTERNAL,
        system_prompt: str = "",
        max_tokens: int = 4096,
    ) -> str:
        """LLMを呼び出す統合インターフェース"""
        model = self.select_model(task_type, sensitivity)
        gateway = get_api_gateway()

        logger.info("llm_invoke", model=model, task_type=task_type, sensitivity=sensitivity)

        try:
            result = await self._call_model(model, prompt, system_prompt, max_tokens)

            # 使用量追跡
            estimated_tokens = len(prompt) // 4 + len(result) // 4
            await gateway.track_usage("system", estimated_tokens, model)

            cb = self.circuit_breakers.setdefault(model, CircuitBreaker())
            cb.record_success()
            return result

        except Exception as e:
            logger.error("llm_invoke_failed", model=model, error=str(e))
            cb = self.circuit_breakers.setdefault(model, CircuitBreaker())
            cb.record_failure()

            # フォールバックモデルで再試行
            fallback = self._get_fallback(model, task_type)
            if fallback and fallback != model:
                logger.info("llm_fallback", from_model=model, to_model=fallback)
                return await self._call_model(fallback, prompt, system_prompt, max_tokens)
            raise

    async def _call_model(self, model: str, prompt: str, system_prompt: str, max_tokens: int) -> str:
        """モデル固有のAPI呼び出し"""
        if model.startswith("claude"):
            return await self._call_anthropic(model, prompt, system_prompt, max_tokens)
        elif model.startswith("gpt"):
            return await self._call_openai(model, prompt, system_prompt, max_tokens)
        elif model.startswith("gemini"):
            return await self._call_google(model, prompt, system_prompt, max_tokens)
        elif model.startswith("llama"):
            return await self._call_local(model, prompt, system_prompt, max_tokens)
        else:
            raise ValueError(f"Unknown model: {model}")

    async def _call_anthropic(self, model: str, prompt: str, system_prompt: str, max_tokens: int) -> str:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt or "You are a text mining analysis assistant.",
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text

    async def _call_openai(self, model: str, prompt: str, system_prompt: str, max_tokens: int) -> str:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await client.chat.completions.create(model=model, messages=messages, max_tokens=max_tokens)
        return response.choices[0].message.content or ""

    async def _call_google(self, model: str, prompt: str, system_prompt: str, max_tokens: int) -> str:
        import vertexai
        from vertexai.generative_models import GenerativeModel

        vertexai.init(project=settings.google_cloud_project, location=settings.gcp_region)
        gen_model = GenerativeModel(model)
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
        response = await gen_model.generate_content_async(full_prompt)
        return response.text

    async def _call_local(self, model: str, prompt: str, system_prompt: str, max_tokens: int) -> str:
        """ローカルLLM (Ollama/vLLM互換)"""
        import httpx

        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": model,
                    "prompt": f"{system_prompt}\n\n{prompt}" if system_prompt else prompt,
                    "stream": False,
                },
                timeout=120.0,
            )
            return response.json()["response"]

    def _get_fallback(self, failed_model: str, task_type: TaskType) -> str | None:
        candidates = self.TASK_MODEL_MAP.get(task_type, [])
        for m in candidates:
            if m != failed_model:
                cb = self.circuit_breakers.get(m)
                if cb is None or cb.can_proceed():
                    return m
        return None


# シングルトン
llm_orchestrator = LLMOrchestrator()
