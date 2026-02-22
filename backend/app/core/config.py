"""アプリケーション設定 - 環境変数ベースの設定管理"""

from enum import Enum
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

# プロジェクトルート（backend/の親ディレクトリ）の.envを参照
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class CloudProvider(str, Enum):
    """対応クラウドプロバイダー（インフラ用）"""

    AWS = "aws"
    AZURE = "azure"
    GCP = "gcp"
    LOCAL = "local"


class LLMDeploymentMode(str, Enum):
    """LLM呼び出し方式（CloudProviderと独立）

    インフラはAzure、LLMはBedrock経由、という組み合わせも可能。
    """

    DIRECT = "direct"  # 各ベンダー直接API（現行動作）
    AWS_BEDROCK = "aws_bedrock"  # AWS Bedrock経由
    AZURE_AI_FOUNDRY = "azure_ai_foundry"  # Azure AI Foundry経由
    GCP_VERTEX_AI = "gcp_vertex_ai"  # GCP Vertex AI経由
    GEMINI_DIRECT = "gemini_direct"  # Google Gemini Direct API（APIキー認証）
    LOCAL = "local"  # Ollama/vLLM


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
    gemini_api_key: str = ""

    # LLMモデル設定
    primary_model: str = "claude-opus-4-6"
    secondary_model: str = "claude-sonnet-4-5-20250929"
    pii_detection_model: str = "gpt-5-nano"
    multilingual_model: str = "gpt-5.1-chat"
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

    # LLMデプロイメントモード（CloudProviderと独立）
    llm_deployment_mode: str = "direct"

    # AWS Bedrock設定
    aws_bedrock_region: str = ""

    # Azure AI Foundry設定
    azure_ai_foundry_endpoint: str = ""
    azure_ai_foundry_api_key: str = ""
    azure_ai_foundry_api_version: str = "2024-12-01-preview"

    # GCP Vertex AI設定
    gcp_vertex_ai_project: str = ""
    gcp_vertex_ai_region: str = ""

    # ローカルLLM設定
    local_llm_base_url: str = "http://localhost:11434"
    local_llm_api_format: str = "ollama"  # ollama / openai_compatible

    # Docker Compose ポート設定
    backend_port: int = 8000
    frontend_port: int = 3000
    db_port: int = 5432
    redis_port: int = 6379

    model_config = {"env_file": str(_ENV_FILE), "env_prefix": "NEXUSTEXT_", "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
