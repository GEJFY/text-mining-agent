"""起動時設定バリデーションのテスト"""

from unittest.mock import MagicMock, patch

from app.core.validation import validate_config


class TestValidateConfig:
    """validate_config の検証"""

    def _make_mock_settings(self, **overrides) -> MagicMock:
        """テスト用のモック設定を生成"""
        defaults = {
            "secret_key": "change-me-in-production-use-openssl-rand-hex-64",
            "debug": True,
            "llm_deployment_mode": "direct",
            "anthropic_api_key": "sk-ant-xxx",
            "openai_api_key": "sk-xxx",
            "google_cloud_project": "your-gcp-project",
            "aws_bedrock_region": "",
            "aws_region": "",
            "azure_ai_foundry_endpoint": "",
            "azure_ai_foundry_api_key": "",
            "gcp_vertex_ai_project": "",
            "local_llm_base_url": "http://localhost:11434",
        }
        defaults.update(overrides)
        mock = MagicMock()
        for k, v in defaults.items():
            setattr(mock, k, v)
        return mock

    @patch("app.core.validation.logger")
    @patch("app.core.validation.settings")
    def test_default_secret_key_warns_in_debug(self, mock_settings, mock_logger) -> None:
        """デバッグモードではデフォルトシークレットキーで警告のみ"""
        s = self._make_mock_settings(debug=True)
        mock_settings.__class__ = s.__class__
        for attr in dir(s):
            if not attr.startswith("_"):
                setattr(mock_settings, attr, getattr(s, attr))

        validate_config()

        # warning が呼ばれたことを確認
        warning_calls = [call for call in mock_logger.warning.call_args_list if "SECRET_KEY" in str(call)]
        assert len(warning_calls) > 0

    @patch("app.core.validation.logger")
    @patch("app.core.validation.settings")
    def test_direct_mode_warns_missing_api_keys(self, mock_settings, mock_logger) -> None:
        """directモードでAPIキー未設定の警告"""
        s = self._make_mock_settings(llm_deployment_mode="direct")
        for attr in dir(s):
            if not attr.startswith("_"):
                setattr(mock_settings, attr, getattr(s, attr))

        validate_config()

        warning_msgs = " ".join(str(c) for c in mock_logger.warning.call_args_list)
        assert "ANTHROPIC_API_KEY" in warning_msgs
        assert "OPENAI_API_KEY" in warning_msgs

    @patch("app.core.validation.logger")
    @patch("app.core.validation.settings")
    def test_bedrock_mode_errors_without_region(self, mock_settings, mock_logger) -> None:
        """Bedrockモードでリージョン未設定はエラー"""
        s = self._make_mock_settings(
            llm_deployment_mode="aws_bedrock",
            aws_bedrock_region="",
            aws_region="",
            debug=True,
        )
        for attr in dir(s):
            if not attr.startswith("_"):
                setattr(mock_settings, attr, getattr(s, attr))

        validate_config()

        error_msgs = " ".join(str(c) for c in mock_logger.error.call_args_list)
        assert "AWS_BEDROCK_REGION" in error_msgs or "AWS_REGION" in error_msgs

    @patch("app.core.validation.logger")
    @patch("app.core.validation.settings")
    def test_azure_mode_errors_without_endpoint(self, mock_settings, mock_logger) -> None:
        """Azure AI Foundryモードでエンドポイント未設定はエラー"""
        s = self._make_mock_settings(
            llm_deployment_mode="azure_ai_foundry",
            azure_ai_foundry_endpoint="",
            azure_ai_foundry_api_key="",
            debug=True,
        )
        for attr in dir(s):
            if not attr.startswith("_"):
                setattr(mock_settings, attr, getattr(s, attr))

        validate_config()

        error_msgs = " ".join(str(c) for c in mock_logger.error.call_args_list)
        assert "AZURE_AI_FOUNDRY_ENDPOINT" in error_msgs

    @patch("app.core.validation.logger")
    @patch("app.core.validation.settings")
    def test_valid_config_no_errors(self, mock_settings, mock_logger) -> None:
        """有効な設定ではエラーが出ないこと"""
        s = self._make_mock_settings(
            secret_key="a-real-production-key-that-is-not-default",
            llm_deployment_mode="direct",
            anthropic_api_key="sk-ant-real-key-12345",
            openai_api_key="sk-real-key-12345",
            google_cloud_project="my-real-project",
        )
        for attr in dir(s):
            if not attr.startswith("_"):
                setattr(mock_settings, attr, getattr(s, attr))

        validate_config()

        mock_logger.error.assert_not_called()
