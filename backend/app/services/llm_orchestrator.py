"""LLMオーケストレーション - マルチモデルルーティング

用途・コスト・データ機密度に応じて最適なLLMを自動選択します。
サーキットブレーカーによるフォールトトレランスを提供。
プロバイダー抽象化レイヤーにより、Direct/Bedrock/Azure/Vertex/Local を
設定1つで切り替え可能。
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum

from app.core.cloud_provider import get_api_gateway
from app.core.config import settings
from app.core.logging import get_logger
from app.services.llm_providers import get_llm_provider
from app.services.llm_providers.base import LLMRequest
from app.services.llm_providers.model_registry import ModelRegistry

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
    """マルチLLMオーケストレーター

    プロバイダー抽象化により、設定の llm_deployment_mode で
    Direct/Bedrock/Azure/Vertex/Local を切り替え可能。
    公開インターフェース invoke() は変更なし。
    """

    circuit_breakers: dict[str, CircuitBreaker] = field(default_factory=dict)
    _model_registry: ModelRegistry = field(default_factory=ModelRegistry)

    # タスク種別→優先モデル（論理名）のマッピング
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
        """タスク種別と機密度に基づいて論理モデル名を選択"""
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
        """LLMを呼び出す統合インターフェース（公開API変更なし）"""
        model = self.select_model(task_type, sensitivity)
        gateway = get_api_gateway()

        logger.info(
            "llm_invoke",
            model=model,
            task_type=task_type,
            sensitivity=sensitivity,
            deployment_mode=settings.llm_deployment_mode,
        )

        try:
            result = await self._call_model_via_provider(model, prompt, system_prompt, max_tokens)

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
                return await self._call_model_via_provider(fallback, prompt, system_prompt, max_tokens)
            raise

    async def _call_model_via_provider(
        self, logical_model: str, prompt: str, system_prompt: str, max_tokens: int
    ) -> str:
        """プロバイダー抽象化経由でモデルを呼び出す

        1. ModelRegistryで論理モデル名→プロバイダー固有IDに変換
        2. get_llm_provider()で現在のデプロイメントモードのプロバイダーを取得
        3. プロバイダーが非対応の場合、DirectAPIProviderにフォールバック
        """
        provider = get_llm_provider()
        deployment_mode = settings.llm_deployment_mode
        model_id = self._model_registry.resolve(logical_model, deployment_mode)

        # プロバイダーが非対応モデルの場合、Direct APIにフォールバック
        if not provider.supports_model(logical_model) and deployment_mode != "direct":
            logger.info(
                "provider_fallback_to_direct",
                logical_model=logical_model,
                provider=provider.provider_name,
            )
            from app.services.llm_providers.direct_provider import DirectAPIProvider

            provider = DirectAPIProvider()
            model_id = self._model_registry.resolve(logical_model, "direct")

        request = LLMRequest(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
        )
        response = await provider.invoke(model_id, request)

        logger.info(
            "llm_response",
            model=model_id,
            provider=response.provider,
            latency_ms=round(response.latency_ms, 1),
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
        )
        return response.content

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
