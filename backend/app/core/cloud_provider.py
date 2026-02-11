"""マルチクラウドAPI管理の抽象化レイヤー

設定で選択したクラウドプロバイダーに応じて、
API Gateway/APIM相当のサービスを自動的に使い分けます。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.core.config import CloudProvider, settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class APIGatewayConfig:
    """API Gateway共通設定"""

    rate_limit_per_minute: int = 100
    token_budget_per_hour: int = 1_000_000
    enable_caching: bool = True
    cache_ttl_seconds: int = 300


class BaseAPIGateway(ABC):
    """API管理の抽象基底クラス"""

    def __init__(self, config: APIGatewayConfig | None = None):
        self.config = config or APIGatewayConfig()

    @abstractmethod
    async def register_api(self, api_id: str, backend_url: str) -> dict:
        """APIをゲートウェイに登録"""
        ...

    @abstractmethod
    async def check_rate_limit(self, client_id: str) -> bool:
        """レート制限チェック"""
        ...

    @abstractmethod
    async def track_usage(self, client_id: str, tokens_used: int, model: str) -> None:
        """トークン使用量追跡"""
        ...

    @abstractmethod
    async def get_usage_report(self, client_id: str) -> dict:
        """使用量レポート取得"""
        ...

    @abstractmethod
    async def get_secret(self, secret_name: str) -> str:
        """シークレット管理サービスから値取得"""
        ...


class AWSAPIGateway(BaseAPIGateway):
    """AWS API Gateway + Secrets Manager"""

    async def register_api(self, api_id: str, backend_url: str) -> dict:
        # boto3を使ってAPI Gatewayにリソースを登録
        logger.info("aws_api_register", api_id=api_id)
        # 実運用ではboto3でREST APIリソースの作成/更新
        return {"provider": "aws", "api_id": api_id, "status": "registered"}

    async def check_rate_limit(self, client_id: str) -> bool:
        # AWS API GatewayのUsage Planで制御
        return True

    async def track_usage(self, client_id: str, tokens_used: int, model: str) -> None:
        import boto3

        cloudwatch = boto3.client("cloudwatch", region_name=settings.aws_region)
        cloudwatch.put_metric_data(
            Namespace="NexusTextAI",
            MetricData=[
                {
                    "MetricName": "TokensUsed",
                    "Dimensions": [
                        {"Name": "ClientId", "Value": client_id},
                        {"Name": "Model", "Value": model},
                    ],
                    "Value": tokens_used,
                    "Unit": "Count",
                }
            ],
        )

    async def get_usage_report(self, client_id: str) -> dict:
        return {"provider": "aws", "client_id": client_id}

    async def get_secret(self, secret_name: str) -> str:
        import boto3

        client = boto3.client("secretsmanager", region_name=settings.aws_region)
        response = client.get_secret_value(SecretId=secret_name)
        return response["SecretString"]


class AzureAPIM(BaseAPIGateway):
    """Azure API Management + Key Vault"""

    async def register_api(self, api_id: str, backend_url: str) -> dict:
        logger.info("azure_apim_register", api_id=api_id)
        # Azure APIM REST APIまたはSDKで管理
        return {"provider": "azure", "api_id": api_id, "status": "registered"}

    async def check_rate_limit(self, client_id: str) -> bool:
        # Azure APIMのポリシーで制御
        return True

    async def track_usage(self, client_id: str, tokens_used: int, model: str) -> None:
        # Azure Monitor / Log Analyticsに送信
        logger.info(
            "azure_usage_tracked",
            client_id=client_id,
            tokens_used=tokens_used,
            model=model,
        )

    async def get_usage_report(self, client_id: str) -> dict:
        return {"provider": "azure", "client_id": client_id}

    async def get_secret(self, secret_name: str) -> str:
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.secrets import SecretClient

        credential = DefaultAzureCredential()
        client = SecretClient(vault_url=settings.azure_key_vault_url, credential=credential)
        secret = client.get_secret(secret_name)
        return secret.value or ""


class GCPCloudEndpoints(BaseAPIGateway):
    """GCP Cloud Endpoints / API Gateway + Secret Manager"""

    async def register_api(self, api_id: str, backend_url: str) -> dict:
        logger.info("gcp_endpoints_register", api_id=api_id)
        return {"provider": "gcp", "api_id": api_id, "status": "registered"}

    async def check_rate_limit(self, client_id: str) -> bool:
        # GCP API Gatewayのクォータで制御
        return True

    async def track_usage(self, client_id: str, tokens_used: int, model: str) -> None:
        # Cloud Monitoringにメトリクス送信
        logger.info(
            "gcp_usage_tracked",
            client_id=client_id,
            tokens_used=tokens_used,
            model=model,
        )

    async def get_usage_report(self, client_id: str) -> dict:
        return {"provider": "gcp", "client_id": client_id}

    async def get_secret(self, secret_name: str) -> str:
        from google.cloud import secretmanager

        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{settings.gcp_project_id}/secrets/{secret_name}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        return response.payload.data.decode("UTF-8")


class LocalGateway(BaseAPIGateway):
    """ローカル開発用ゲートウェイ（インメモリ）"""

    _usage: dict[str, int] = {}

    async def register_api(self, api_id: str, backend_url: str) -> dict:
        logger.info("local_api_register", api_id=api_id)
        return {"provider": "local", "api_id": api_id, "status": "registered"}

    async def check_rate_limit(self, client_id: str) -> bool:
        return True

    async def track_usage(self, client_id: str, tokens_used: int, model: str) -> None:
        key = f"{client_id}:{model}"
        self._usage[key] = self._usage.get(key, 0) + tokens_used

    async def get_usage_report(self, client_id: str) -> dict:
        return {
            "provider": "local",
            "client_id": client_id,
            "usage": {k: v for k, v in self._usage.items() if k.startswith(client_id)},
        }

    async def get_secret(self, secret_name: str) -> str:
        import os

        return os.getenv(secret_name, "")


def get_api_gateway() -> BaseAPIGateway:
    """設定に基づいてクラウドプロバイダーのAPI Gateway実装を返す"""
    gateway_map: dict[CloudProvider, type[BaseAPIGateway]] = {
        CloudProvider.AWS: AWSAPIGateway,
        CloudProvider.AZURE: AzureAPIM,
        CloudProvider.GCP: GCPCloudEndpoints,
        CloudProvider.LOCAL: LocalGateway,
    }
    gateway_cls = gateway_map[settings.cloud_provider]
    logger.info("api_gateway_initialized", provider=settings.cloud_provider.value)
    return gateway_cls()
