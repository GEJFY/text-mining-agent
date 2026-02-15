"""RFC 7807 Problem Details エラークラスのテスト"""

from app.core.errors import (
    AppError,
    ErrorCode,
    FileProcessingError,
    LLMRateLimitError,
    LLMTimeoutError,
    LLMUnavailableError,
    NotFoundError,
)


class TestErrorCode:
    """ErrorCode enum の検証"""

    def test_all_error_codes_exist(self) -> None:
        codes = [e.value for e in ErrorCode]
        assert "VALIDATION_ERROR" in codes
        assert "LLM_UNAVAILABLE" in codes
        assert "LLM_TIMEOUT" in codes
        assert "LLM_RATE_LIMIT" in codes
        assert "NOT_FOUND" in codes
        assert "INTERNAL_ERROR" in codes

    def test_error_code_is_string(self) -> None:
        assert isinstance(ErrorCode.VALIDATION_ERROR.value, str)


class TestAppError:
    """AppError 基底クラスの検証"""

    def test_to_problem_detail_basic(self) -> None:
        err = AppError(
            code=ErrorCode.INTERNAL_ERROR,
            title="Test Error",
            detail="Something went wrong",
            status=500,
        )
        body = err.to_problem_detail()
        assert body["type"] == "urn:nexustext:error:internal_error"
        assert body["title"] == "Test Error"
        assert body["status"] == 500
        assert body["detail"] == "Something went wrong"

    def test_to_problem_detail_with_correlation_id(self) -> None:
        err = AppError(
            code=ErrorCode.INTERNAL_ERROR,
            title="Error",
            detail="detail",
        )
        body = err.to_problem_detail(correlation_id="abc-123")
        assert body["correlation_id"] == "abc-123"

    def test_to_problem_detail_with_extra(self) -> None:
        err = AppError(
            code=ErrorCode.INTERNAL_ERROR,
            title="Error",
            detail="detail",
            extra={"key": "value"},
        )
        body = err.to_problem_detail()
        assert body["key"] == "value"

    def test_to_problem_detail_with_instance(self) -> None:
        err = AppError(
            code=ErrorCode.INTERNAL_ERROR,
            title="Error",
            detail="detail",
            instance="/api/v1/test",
        )
        body = err.to_problem_detail()
        assert body["instance"] == "/api/v1/test"

    def test_str_representation(self) -> None:
        err = AppError(
            code=ErrorCode.INTERNAL_ERROR,
            title="Error",
            detail="my detail message",
        )
        assert str(err) == "my detail message"


class TestLLMUnavailableError:
    def test_default_detail(self) -> None:
        err = LLMUnavailableError(provider="bedrock")
        assert err.status == 503
        assert err.code == ErrorCode.LLM_UNAVAILABLE
        assert "bedrock" in err.detail
        body = err.to_problem_detail()
        assert body["provider"] == "bedrock"

    def test_custom_detail(self) -> None:
        err = LLMUnavailableError(provider="azure", detail="Connection refused")
        assert err.detail == "Connection refused"


class TestLLMTimeoutError:
    def test_fields(self) -> None:
        err = LLMTimeoutError(provider="vertex", model="gemini-3.0-pro", timeout_seconds=30.0)
        assert err.status == 504
        assert err.code == ErrorCode.LLM_TIMEOUT
        body = err.to_problem_detail()
        assert body["provider"] == "vertex"
        assert body["model"] == "gemini-3.0-pro"


class TestLLMRateLimitError:
    def test_without_retry_after(self) -> None:
        err = LLMRateLimitError(provider="openai")
        assert err.status == 429
        body = err.to_problem_detail()
        assert body["provider"] == "openai"
        assert "retry_after_seconds" not in body

    def test_with_retry_after(self) -> None:
        err = LLMRateLimitError(provider="anthropic", retry_after=60.0)
        body = err.to_problem_detail()
        assert body["retry_after_seconds"] == 60.0


class TestFileProcessingError:
    def test_fields(self) -> None:
        err = FileProcessingError(filename="test.csv", detail="Invalid encoding")
        assert err.status == 422
        body = err.to_problem_detail()
        assert body["filename"] == "test.csv"


class TestNotFoundError:
    def test_fields(self) -> None:
        err = NotFoundError(resource="Dataset", resource_id="ds-001")
        assert err.status == 404
        assert "ds-001" in err.detail
        body = err.to_problem_detail()
        assert body["resource"] == "Dataset"
        assert body["resource_id"] == "ds-001"
