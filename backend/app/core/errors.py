"""RFC 7807 Problem Details エラーレスポンス

アプリケーション全体の例外基盤クラスと、LLM固有の例外を定義。
"""

from enum import Enum
from typing import Any


class ErrorCode(str, Enum):
    """アプリケーションエラーコード"""

    VALIDATION_ERROR = "VALIDATION_ERROR"
    LLM_UNAVAILABLE = "LLM_UNAVAILABLE"
    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_RATE_LIMIT = "LLM_RATE_LIMIT"
    LLM_AUTH_ERROR = "LLM_AUTH_ERROR"
    MODEL_NOT_AVAILABLE = "MODEL_NOT_AVAILABLE"
    CIRCUIT_BREAKER_OPEN = "CIRCUIT_BREAKER_OPEN"
    FILE_PROCESSING_ERROR = "FILE_PROCESSING_ERROR"
    DATABASE_ERROR = "DATABASE_ERROR"
    REDIS_ERROR = "REDIS_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    NOT_FOUND = "NOT_FOUND"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"


class AppError(Exception):
    """アプリケーション例外基底クラス (RFC 7807 Problem Details対応)"""

    def __init__(
        self,
        *,
        code: ErrorCode,
        title: str,
        detail: str,
        status: int = 500,
        instance: str | None = None,
        extra: dict[str, Any] | None = None,
    ):
        self.code = code
        self.title = title
        self.detail = detail
        self.status = status
        self.instance = instance
        self.extra = extra or {}
        super().__init__(detail)

    def to_problem_detail(self, correlation_id: str | None = None) -> dict[str, Any]:
        """RFC 7807準拠のJSON応答を生成"""
        body: dict[str, Any] = {
            "type": f"urn:nexustext:error:{self.code.value.lower()}",
            "title": self.title,
            "status": self.status,
            "detail": self.detail,
        }
        if self.instance:
            body["instance"] = self.instance
        if correlation_id:
            body["correlation_id"] = correlation_id
        if self.extra:
            body.update(self.extra)
        return body


class LLMUnavailableError(AppError):
    """LLMプロバイダーに接続できない"""

    def __init__(self, provider: str, detail: str = ""):
        super().__init__(
            code=ErrorCode.LLM_UNAVAILABLE,
            title="LLM Provider Unavailable",
            detail=detail or f"LLM provider '{provider}' is currently unavailable.",
            status=503,
            extra={"provider": provider},
        )


class LLMTimeoutError(AppError):
    """LLM呼び出しがタイムアウト"""

    def __init__(self, provider: str, model: str, timeout_seconds: float):
        super().__init__(
            code=ErrorCode.LLM_TIMEOUT,
            title="LLM Request Timeout",
            detail=f"LLM request to {model} via {provider} timed out after {timeout_seconds}s.",
            status=504,
            extra={"provider": provider, "model": model},
        )


class LLMRateLimitError(AppError):
    """LLM APIのレート制限"""

    def __init__(self, provider: str, retry_after: float | None = None):
        extra: dict[str, Any] = {"provider": provider}
        if retry_after:
            extra["retry_after_seconds"] = retry_after
        super().__init__(
            code=ErrorCode.LLM_RATE_LIMIT,
            title="LLM Rate Limit Exceeded",
            detail=f"Rate limit exceeded for provider '{provider}'.",
            status=429,
            extra=extra,
        )


class FileProcessingError(AppError):
    """ファイル処理エラー"""

    def __init__(self, filename: str, detail: str):
        super().__init__(
            code=ErrorCode.FILE_PROCESSING_ERROR,
            title="File Processing Error",
            detail=detail,
            status=422,
            extra={"filename": filename},
        )


class NotFoundError(AppError):
    """リソースが見つからない"""

    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            code=ErrorCode.NOT_FOUND,
            title="Resource Not Found",
            detail=f"{resource} '{resource_id}' not found.",
            status=404,
            extra={"resource": resource, "resource_id": resource_id},
        )
