"""起動時設定バリデーション

アプリケーション起動時に必須設定の検証を行い、
不足している場合は警告またはエラーを出力する。
"""

import sys

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def validate_config() -> None:
    """設定の妥当性を検証"""
    warnings: list[str] = []
    errors: list[str] = []

    # シークレットキーのデフォルト値チェック
    if settings.secret_key in ("change-me-in-production", "change-me-in-production-use-openssl-rand-hex-64"):
        if settings.debug:
            warnings.append("SECRET_KEY is using default value (OK for debug mode)")
        else:
            errors.append("SECRET_KEY must be changed in production mode")

    # LLMデプロイメントモード別の必須チェック
    mode = settings.llm_deployment_mode

    if mode == "direct":
        _check_direct_api_keys(warnings)
    elif mode == "aws_bedrock":
        if not settings.aws_bedrock_region and not settings.aws_region:
            errors.append("AWS_BEDROCK_REGION or AWS_REGION is required for Bedrock mode")
    elif mode == "azure_ai_foundry":
        if not settings.azure_ai_foundry_endpoint:
            errors.append("AZURE_AI_FOUNDRY_ENDPOINT is required for Azure AI Foundry mode")
        if not settings.azure_ai_foundry_api_key:
            errors.append("AZURE_AI_FOUNDRY_API_KEY is required for Azure AI Foundry mode")
    elif mode == "gcp_vertex_ai":
        project = settings.gcp_vertex_ai_project or settings.google_cloud_project
        if not project:
            errors.append(
                "GCP_VERTEX_AI_PROJECT or GOOGLE_CLOUD_PROJECT is required for Vertex AI mode"
            )
    elif mode == "local":
        if not settings.local_llm_base_url:
            warnings.append("LOCAL_LLM_BASE_URL is empty, defaulting to http://localhost:11434")

    # 警告出力
    for w in warnings:
        logger.warning("config_warning", message=w)

    # エラー出力（非デバッグモードでは致命的）
    for e in errors:
        logger.error("config_error", message=e)

    if errors and not settings.debug:
        logger.error("config_validation_failed", error_count=len(errors))
        sys.exit(1)


def _check_direct_api_keys(warnings: list[str]) -> None:
    """直接APIモードのAPIキー検証"""
    dummy_prefixes = ("sk-ant-xxx", "sk-xxx", "your-")

    if not settings.anthropic_api_key or settings.anthropic_api_key.startswith(
        tuple(dummy_prefixes)
    ):
        warnings.append("ANTHROPIC_API_KEY is not configured (Claude models will not work)")

    if not settings.openai_api_key or settings.openai_api_key.startswith(
        tuple(dummy_prefixes)
    ):
        warnings.append("OPENAI_API_KEY is not configured (GPT models will not work)")

    if not settings.google_cloud_project or settings.google_cloud_project.startswith("your-"):
        warnings.append(
            "GOOGLE_CLOUD_PROJECT is not configured (Gemini models will not work)"
        )
