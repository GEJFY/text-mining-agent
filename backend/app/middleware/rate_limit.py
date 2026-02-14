"""レート制限ミドルウェア

トークンバケットアルゴリズムでIP別レート制限を実施。
ヘルスチェックパスは除外。
"""

import time
from collections import defaultdict
from dataclasses import dataclass, field

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


@dataclass
class TokenBucket:
    """トークンバケット"""

    capacity: float
    refill_rate: float  # トークン/秒
    tokens: float = 0.0
    last_refill: float = field(default_factory=time.monotonic)

    def consume(self) -> bool:
        """トークンを1つ消費。成功ならTrue"""
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now

        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False

    @property
    def remaining(self) -> int:
        return max(0, int(self.tokens))


# ヘルスチェック等の除外パス
EXCLUDED_PATHS = {"/health", "/health/live", "/health/ready", "/docs", "/openapi.json"}

# デフォルト: 60リクエスト/分 (1トークン/秒)
DEFAULT_CAPACITY = 60
DEFAULT_REFILL_RATE = 1.0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """IP別レート制限ミドルウェア"""

    def __init__(self, app, capacity: float = DEFAULT_CAPACITY, refill_rate: float = DEFAULT_REFILL_RATE):
        super().__init__(app)
        self.capacity = capacity
        self.refill_rate = refill_rate
        self._buckets: dict[str, TokenBucket] = defaultdict(
            lambda: TokenBucket(capacity=self.capacity, refill_rate=self.refill_rate)
        )

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # ヘルスチェック等は除外
        if request.url.path in EXCLUDED_PATHS:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        bucket = self._buckets[client_ip]

        if not bucket.consume():
            return JSONResponse(
                status_code=429,
                content={
                    "type": "urn:nexustext:error:rate_limit_exceeded",
                    "title": "Rate Limit Exceeded",
                    "status": 429,
                    "detail": "Too many requests. Please try again later.",
                },
                headers={
                    "X-RateLimit-Limit": str(int(self.capacity)),
                    "X-RateLimit-Remaining": "0",
                    "Retry-After": "1",
                },
                media_type="application/problem+json",
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(int(self.capacity))
        response.headers["X-RateLimit-Remaining"] = str(bucket.remaining)
        return response
