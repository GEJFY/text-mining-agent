"""グローバル例外ハンドラー

FastAPIに登録して、全例外をRFC 7807 Problem Details形式で返す。
"""

from contextvars import ContextVar

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.errors import AppError, ErrorCode
from app.core.logging import get_logger

logger = get_logger(__name__)

# 相関IDをcontextvarsで共有（correlation middlewareから設定）
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")


def register_exception_handlers(app: FastAPI) -> None:
    """FastAPIに例外ハンドラーを登録"""

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        """アプリケーション例外 → Problem Detail JSON"""
        cid = correlation_id_var.get("")
        logger.warning(
            "app_error",
            error_code=exc.code.value,
            status=exc.status,
            detail=exc.detail,
            correlation_id=cid,
            path=str(request.url),
        )
        return JSONResponse(
            status_code=exc.status,
            content=exc.to_problem_detail(correlation_id=cid),
            media_type="application/problem+json",
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        """Pydanticバリデーション例外 → 422 Problem Detail"""
        cid = correlation_id_var.get("")
        errors = []
        for err in exc.errors():
            errors.append(
                {
                    "field": ".".join(str(loc) for loc in err.get("loc", [])),
                    "message": err.get("msg", ""),
                    "type": err.get("type", ""),
                }
            )
        logger.warning(
            "validation_error",
            error_count=len(errors),
            correlation_id=cid,
            path=str(request.url),
        )
        return JSONResponse(
            status_code=422,
            content={
                "type": f"urn:nexustext:error:{ErrorCode.VALIDATION_ERROR.value.lower()}",
                "title": "Validation Error",
                "status": 422,
                "detail": f"{len(errors)} validation error(s) in request.",
                "errors": errors,
                "correlation_id": cid,
            },
            media_type="application/problem+json",
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        """未処理例外 → 500 with相関ID付きログ"""
        cid = correlation_id_var.get("")
        logger.error(
            "unhandled_exception",
            error_type=type(exc).__name__,
            error=str(exc),
            correlation_id=cid,
            path=str(request.url),
        )
        return JSONResponse(
            status_code=500,
            content={
                "type": f"urn:nexustext:error:{ErrorCode.INTERNAL_ERROR.value.lower()}",
                "title": "Internal Server Error",
                "status": 500,
                "detail": "An unexpected error occurred. Check logs with the correlation ID.",
                "correlation_id": cid,
            },
            media_type="application/problem+json",
        )
