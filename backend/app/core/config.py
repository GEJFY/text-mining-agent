"""アプリケーション設定 - 環境変数ベースの設定管理"""

from enum import Enum
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class CloudProvider(str, Enum):
    """対応クラウドプロバイダー"""
    AWS = "aws"
    AZURE = "azure"
    GCP = "gcp"
    LOCAL = "local"


class HITLMode(str, Enum):
    """Human-in-the-Loop制御モード"""
    FULL_AUTO = "full_auto"
    SEMI_AUTO = "semi_auto"
    GUIDED = "guided"


class Settings(BaseSettings):
    """グローバル設定"""
    # アプリケーション
    app_name: str = "NexusText AI"
    app_version: str = "7.0.0"
    debug: bool = False
    log_level: str = "INFO"

    # クラウドプロバイダー選択
    cloud_provider: CloudProvider = CloudProvider.LOCAL

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # データベース
    database_url: str = "postgresql+asyncpg://nexustext:nexustext@localhost:5432/nexustext"
    redis_url: str = "redis://localhost:6379/0"

    # LLM API Keys
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_cloud_project: str = ""

    # LLMモデル設定
    primary_model: str = "claude-opus-4-6"
    secondary_model: str = "claude-sonnet-4-5-20250929"
    pii_detection_model: str = "gpt-5-mini"
    multilingual_model: str = "gpt-5.2"
    vision_model: str = "gemini-3.0-pro"
    local_model: str = "llama-4-405b"

    # AWS設定
    aws_region: str = "ap-northeast-1"
    aws_api_gateway_id: str = ""
    aws_s3_bucket: str = ""

    # Azure設定
    azure_apim_endpoint: str = ""
    azure_apim_subscription_key: str = ""
    azure_blob_connection_string: str = ""
    azure_key_vault_url: str = ""

    # GCP設定
    gcp_project_id: str = ""
    gcp_region: str = "asia-northeast1"
    gcp_api_gateway_id: str = ""
    gcp_gcs_bucket: str = ""

    # セキュリティ
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 60

    # エージェント
    default_hitl_mode: HITLMode = HITLMode.SEMI_AUTO

    # Embedding
    embedding_model: str = "paraphrase-multilingual-MiniLM-L12-v2"
    embedding_dimension: int = 384

    model_config = {"env_file": ".env", "env_prefix": "NEXUSTEXT_", "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
