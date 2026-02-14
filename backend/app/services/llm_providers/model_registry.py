"""モデルID変換レジストリ

論理モデル名(例: "claude-opus-4-6")を各プロバイダー固有のモデルIDに変換する。
"""

from dataclasses import dataclass


@dataclass
class ModelMapping:
    """単一モデルのプロバイダー別マッピング"""

    logical_name: str
    direct: str | None = None
    bedrock: str | None = None
    azure: str | None = None
    vertex_ai: str | None = None
    local: str | None = None


# デフォルトマッピングテーブル
DEFAULT_MODEL_MAPPINGS: dict[str, ModelMapping] = {
    "claude-opus-4-6": ModelMapping(
        logical_name="claude-opus-4-6",
        direct="claude-opus-4-6",
        bedrock="anthropic.claude-opus-4-6-v1:0",
        azure="claude-opus-4-6",
        vertex_ai="claude-opus-4-6@20250514",
    ),
    "claude-sonnet-4-5-20250929": ModelMapping(
        logical_name="claude-sonnet-4-5-20250929",
        direct="claude-sonnet-4-5-20250929",
        bedrock="anthropic.claude-sonnet-4-5-20250929-v1:0",
        azure="claude-sonnet-4-5-20250929",
        vertex_ai="claude-sonnet-4-5-20250929@20250929",
    ),
    "gpt-5.2": ModelMapping(
        logical_name="gpt-5.2",
        direct="gpt-5.2",
        azure="gpt-5-2",
    ),
    "gpt-5-mini": ModelMapping(
        logical_name="gpt-5-mini",
        direct="gpt-5-mini",
        azure="gpt-5-mini",
    ),
    "gemini-3.0-pro": ModelMapping(
        logical_name="gemini-3.0-pro",
        direct="gemini-3.0-pro",
        vertex_ai="gemini-3.0-pro",
    ),
    "gemini-3.0-flash": ModelMapping(
        logical_name="gemini-3.0-flash",
        direct="gemini-3.0-flash",
        vertex_ai="gemini-3.0-flash",
    ),
    "llama-4-405b": ModelMapping(
        logical_name="llama-4-405b",
        bedrock="meta.llama-4-405b-v1:0",
        local="llama-4-405b",
    ),
}


class ModelRegistry:
    """モデルIDマッピングを管理するレジストリ"""

    def __init__(self, custom_mappings: dict[str, ModelMapping] | None = None):
        self._mappings = {**DEFAULT_MODEL_MAPPINGS}
        if custom_mappings:
            self._mappings.update(custom_mappings)

    def resolve(self, logical_model: str, deployment_mode: str) -> str | None:
        """論理モデル名をプロバイダー固有のモデルIDに解決する

        Args:
            logical_model: TASK_MODEL_MAPで使用される論理モデル名
            deployment_mode: LLMDeploymentMode値 ("direct", "aws_bedrock", etc.)

        Returns:
            プロバイダー固有のモデルID。マッピングが存在しない場合はNone。
        """
        mapping = self._mappings.get(logical_model)
        if mapping is None:
            return None

        mode_to_field = {
            "direct": mapping.direct,
            "aws_bedrock": mapping.bedrock,
            "azure_ai_foundry": mapping.azure,
            "gcp_vertex_ai": mapping.vertex_ai,
            "local": mapping.local,
        }
        return mode_to_field.get(deployment_mode)

    def get_supported_models(self, deployment_mode: str) -> list[str]:
        """指定プロバイダーでサポートされる論理モデル名一覧"""
        return [
            name
            for name in self._mappings
            if self.resolve(name, deployment_mode) is not None
        ]
