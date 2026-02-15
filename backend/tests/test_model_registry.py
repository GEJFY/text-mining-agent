"""モデルID変換レジストリのテスト"""

from app.services.llm_providers.model_registry import ModelMapping, ModelRegistry


class TestModelRegistry:
    """ModelRegistry の基本動作テスト"""

    def test_resolve_direct_mode(self) -> None:
        registry = ModelRegistry()
        result = registry.resolve("claude-opus-4-6", "direct")
        assert result == "claude-opus-4-6"

    def test_resolve_bedrock_mode(self) -> None:
        registry = ModelRegistry()
        result = registry.resolve("claude-opus-4-6", "aws_bedrock")
        assert result == "anthropic.claude-opus-4-6-v1:0"

    def test_resolve_azure_mode(self) -> None:
        registry = ModelRegistry()
        result = registry.resolve("gpt-5.1-chat", "azure_ai_foundry")
        assert result == "gpt-51-chat"

    def test_resolve_vertex_ai_mode(self) -> None:
        registry = ModelRegistry()
        result = registry.resolve("gemini-3.0-pro", "gcp_vertex_ai")
        assert result == "gemini-3-pro-preview"

    def test_resolve_local_mode(self) -> None:
        registry = ModelRegistry()
        result = registry.resolve("llama-4-405b", "local")
        assert result == "llama-4-405b"

    def test_resolve_unsupported_model_returns_none(self) -> None:
        registry = ModelRegistry()
        result = registry.resolve("nonexistent-model", "direct")
        assert result is None

    def test_resolve_model_not_available_in_mode(self) -> None:
        """GPTモデルはBedrockでは利用不可"""
        registry = ModelRegistry()
        result = registry.resolve("gpt-5.1-chat", "aws_bedrock")
        assert result is None

    def test_resolve_unknown_mode_returns_none(self) -> None:
        registry = ModelRegistry()
        result = registry.resolve("claude-opus-4-6", "unknown_mode")
        assert result is None


class TestGetSupportedModels:
    """get_supported_models のテスト"""

    def test_direct_mode_supports_most_models(self) -> None:
        registry = ModelRegistry()
        models = registry.get_supported_models("direct")
        assert "claude-opus-4-6" in models
        assert "gpt-5.1-chat" in models
        assert "gemini-3.0-pro" in models

    def test_local_mode_supports_limited_models(self) -> None:
        registry = ModelRegistry()
        models = registry.get_supported_models("local")
        assert "llama-4-405b" in models
        assert "claude-opus-4-6" not in models

    def test_unknown_mode_returns_empty(self) -> None:
        registry = ModelRegistry()
        models = registry.get_supported_models("unknown_mode")
        assert models == []


class TestCustomMappings:
    """カスタムマッピング追加のテスト"""

    def test_custom_mapping_overrides_default(self) -> None:
        custom = {
            "claude-opus-4-6": ModelMapping(
                logical_name="claude-opus-4-6",
                direct="custom-claude-id",
            ),
        }
        registry = ModelRegistry(custom_mappings=custom)
        assert registry.resolve("claude-opus-4-6", "direct") == "custom-claude-id"

    def test_custom_mapping_adds_new_model(self) -> None:
        custom = {
            "my-custom-model": ModelMapping(
                logical_name="my-custom-model",
                direct="custom-direct-id",
                local="custom-local-id",
            ),
        }
        registry = ModelRegistry(custom_mappings=custom)
        assert registry.resolve("my-custom-model", "direct") == "custom-direct-id"
        assert registry.resolve("my-custom-model", "local") == "custom-local-id"
