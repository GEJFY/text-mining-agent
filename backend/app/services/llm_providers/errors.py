"""LLMプロバイダー統一エラー定義"""


class LLMProviderError(Exception):
    """全プロバイダーの例外を統一するベースエラー"""

    def __init__(
        self,
        provider: str,
        model_id: str,
        original_error: Exception | None = None,
        message: str = "",
        retryable: bool = True,
    ):
        self.provider = provider
        self.model_id = model_id
        self.original_error = original_error
        self.retryable = retryable
        super().__init__(message or f"[{provider}] {model_id}: {original_error}")

    @property
    def is_rate_limit(self) -> bool:
        """レート制限エラーかどうかを判定"""
        if self.original_error is None:
            return False
        err_str = str(self.original_error).lower()
        return any(
            keyword in err_str
            for keyword in ["rate limit", "throttl", "too many requests", "429"]
        )

    @property
    def is_auth_error(self) -> bool:
        """認証エラーかどうかを判定 (リトライ不可)"""
        if self.original_error is None:
            return False
        err_str = str(self.original_error).lower()
        return any(
            keyword in err_str
            for keyword in ["unauthorized", "forbidden", "401", "403", "invalid api key"]
        )


class ModelNotAvailableError(LLMProviderError):
    """指定モデルが現在のプロバイダーで利用不可"""

    def __init__(self, logical_model: str, deployment_mode: str):
        super().__init__(
            provider=deployment_mode,
            model_id=logical_model,
            retryable=False,
            message=f"Model '{logical_model}' is not available on {deployment_mode}",
        )
