"""LLMプロバイダーのテスト

ファクトリ関数、データクラス、エラークラスの検証。
"""

from unittest.mock import patch

from app.services.llm_providers.base import LLMRequest, LLMResponse
from app.services.llm_providers.errors import LLMProviderError, ModelNotAvailableError


class TestLLMRequest:
    """LLMRequest データクラスの検証"""

    def test_default_values(self) -> None:
        req = LLMRequest(prompt="Hello")
        assert req.prompt == "Hello"
        assert req.system_prompt == ""
        assert req.max_tokens == 4096
        assert req.temperature == 0.0

    def test_custom_values(self) -> None:
        req = LLMRequest(
            prompt="Test",
            system_prompt="You are helpful",
            max_tokens=1000,
            temperature=0.7,
        )
        assert req.system_prompt == "You are helpful"
        assert req.max_tokens == 1000
        assert req.temperature == 0.7


class TestLLMResponse:
    """LLMResponse データクラスの検証"""

    def test_required_fields(self) -> None:
        resp = LLMResponse(content="Hello!", model="claude-opus-4-6", provider="direct")
        assert resp.content == "Hello!"
        assert resp.model == "claude-opus-4-6"
        assert resp.provider == "direct"
        assert resp.input_tokens is None
        assert resp.output_tokens is None

    def test_optional_fields(self) -> None:
        resp = LLMResponse(
            content="Result",
            model="gpt-5.1-chat",
            provider="azure",
            input_tokens=100,
            output_tokens=50,
            latency_ms=1234.5,
            finish_reason="stop",
        )
        assert resp.input_tokens == 100
        assert resp.output_tokens == 50
        assert resp.latency_ms == 1234.5
        assert resp.finish_reason == "stop"


class TestLLMProviderError:
    """LLMProviderError 例外クラスの検証"""

    def test_basic_error(self) -> None:
        err = LLMProviderError(
            provider="bedrock",
            model_id="claude-opus-4-6",
            message="Connection timeout",
        )
        assert err.provider == "bedrock"
        assert err.model_id == "claude-opus-4-6"
        assert "Connection timeout" in str(err)

    def test_retryable_default_true(self) -> None:
        err = LLMProviderError(provider="direct", model_id="test", message="error")
        assert err.retryable is True

    def test_retryable_set_false(self) -> None:
        err = LLMProviderError(provider="direct", model_id="test", retryable=False)
        assert err.retryable is False

    def test_is_rate_limit_detection(self) -> None:
        original = Exception("429 Too Many Requests")
        err = LLMProviderError(
            provider="azure",
            model_id="gpt-5.1-chat",
            original_error=original,
        )
        assert err.is_rate_limit is True

    def test_is_not_rate_limit(self) -> None:
        original = Exception("Internal Server Error")
        err = LLMProviderError(
            provider="direct",
            model_id="test",
            original_error=original,
        )
        assert err.is_rate_limit is False

    def test_is_auth_error_detection(self) -> None:
        original = Exception("401 Unauthorized")
        err = LLMProviderError(
            provider="vertex",
            model_id="gemini-3.0-pro",
            original_error=original,
        )
        assert err.is_auth_error is True

    def test_is_not_auth_error(self) -> None:
        original = Exception("timeout")
        err = LLMProviderError(
            provider="direct",
            model_id="test",
            original_error=original,
        )
        assert err.is_auth_error is False

    def test_no_original_error_properties(self) -> None:
        """original_error が None の場合は is_rate_limit/is_auth_error は False"""
        err = LLMProviderError(provider="direct", model_id="test", message="error")
        assert err.is_rate_limit is False
        assert err.is_auth_error is False


class TestModelNotAvailableError:
    """ModelNotAvailableError 例外クラスの検証"""

    def test_error_message(self) -> None:
        err = ModelNotAvailableError(
            logical_model="gpt-5.1-chat",
            deployment_mode="aws_bedrock",
        )
        assert "gpt-5.1-chat" in str(err)
        assert "aws_bedrock" in str(err)

    def test_not_retryable(self) -> None:
        err = ModelNotAvailableError(logical_model="test", deployment_mode="local")
        assert err.retryable is False

    def test_inherits_from_provider_error(self) -> None:
        err = ModelNotAvailableError(logical_model="test", deployment_mode="direct")
        assert isinstance(err, LLMProviderError)


class TestGetLLMProvider:
    """get_llm_provider ファクトリ関数の検証"""

    @patch("app.services.llm_providers.settings")
    def test_direct_mode_returns_direct_provider(self, mock_settings) -> None:
        mock_settings.llm_deployment_mode = "direct"
        mock_settings.anthropic_api_key = "test"
        mock_settings.openai_api_key = "test"
        mock_settings.google_cloud_project = "test"

        from app.services.llm_providers import get_llm_provider

        get_llm_provider.cache_clear()
        provider = get_llm_provider()
        assert provider.provider_name == "direct"
        get_llm_provider.cache_clear()

    @patch("app.services.llm_providers.settings")
    def test_local_mode_returns_local_provider(self, mock_settings) -> None:
        mock_settings.llm_deployment_mode = "local"
        mock_settings.local_llm_base_url = "http://localhost:11434"
        mock_settings.local_llm_api_format = "ollama"

        from app.services.llm_providers import get_llm_provider

        get_llm_provider.cache_clear()
        provider = get_llm_provider()
        assert provider.provider_name == "local"
        get_llm_provider.cache_clear()
