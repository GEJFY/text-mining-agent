"""相関IDミドルウェア

全リクエストにX-Correlation-IDを付与し、structlogのcontextvarsにバインド。
これにより全ログに相関IDが自動的に含まれる。
"""

import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.exception_handlers import correlation_id_var

HEADER_NAME = "X-Correlation-ID"


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """リクエストごとに相関IDを生成・伝播するミドルウェア"""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # クライアントから渡された場合はそのまま使用
        correlation_id = request.headers.get(HEADER_NAME) or str(uuid.uuid4())

        # contextvarsに設定（exception_handlersや全ログから参照可能）
        token = correlation_id_var.set(correlation_id)

        # structlog contextvarsにもバインド
        try:
            import structlog

            structlog.contextvars.bind_contextvars(correlation_id=correlation_id)
        except Exception:
            pass

        try:
            response = await call_next(request)
            response.headers[HEADER_NAME] = correlation_id
            return response
        finally:
            correlation_id_var.reset(token)
            try:
                import structlog

                structlog.contextvars.unbind_contextvars("correlation_id")
            except Exception:
                pass
