"""ミドルウェアのテスト

CorrelationIdMiddleware と RateLimitMiddleware の動作検証。
"""

import time

import pytest
from httpx import AsyncClient

from app.middleware.rate_limit import TokenBucket


# =============================================================================
# TokenBucket 単体テスト
# =============================================================================
class TestTokenBucket:
    """トークンバケットアルゴリズムの検証"""

    def test_default_tokens_equals_capacity(self) -> None:
        bucket = TokenBucket(capacity=10.0, refill_rate=1.0)
        assert bucket.tokens == 10.0

    def test_initial_consume_succeeds(self) -> None:
        bucket = TokenBucket(capacity=10.0, refill_rate=1.0)
        assert bucket.consume() is True

    def test_empty_bucket_fails(self) -> None:
        bucket = TokenBucket(capacity=10.0, refill_rate=0.0, tokens=0.0)
        assert bucket.consume() is False

    def test_remaining_decreases(self) -> None:
        bucket = TokenBucket(capacity=5.0, refill_rate=0.0, tokens=5.0)
        bucket.consume()
        assert bucket.remaining == 4

    def test_capacity_not_exceeded(self) -> None:
        bucket = TokenBucket(capacity=5.0, refill_rate=100.0, tokens=0.0)
        # 高速リフィルでもcapacityを超えない
        time.sleep(0.1)
        bucket.consume()
        assert bucket.remaining <= 5


# =============================================================================
# CorrelationIdMiddleware 統合テスト
# =============================================================================
class TestCorrelationIdMiddleware:
    """相関IDミドルウェアの検証"""

    @pytest.mark.asyncio
    async def test_response_has_correlation_id(self, client: AsyncClient) -> None:
        """レスポンスにX-Correlation-IDが付与されること"""
        response = await client.get("/health")
        assert "x-correlation-id" in response.headers

    @pytest.mark.asyncio
    async def test_client_id_is_propagated(self, client: AsyncClient) -> None:
        """クライアントから渡したIDがそのまま返されること"""
        custom_id = "test-correlation-id-12345"
        response = await client.get("/health", headers={"X-Correlation-ID": custom_id})
        assert response.headers["x-correlation-id"] == custom_id

    @pytest.mark.asyncio
    async def test_auto_generated_id_is_uuid_format(self, client: AsyncClient) -> None:
        """自動生成されたIDがUUID形式であること"""
        response = await client.get("/health")
        cid = response.headers["x-correlation-id"]
        # UUID形式: 8-4-4-4-12
        parts = cid.split("-")
        assert len(parts) == 5


# =============================================================================
# RateLimitMiddleware 統合テスト
# =============================================================================
class TestRateLimitMiddleware:
    """レート制限ミドルウェアの検証"""

    @pytest.mark.asyncio
    async def test_rate_limit_headers_present(self, client: AsyncClient) -> None:
        """レート制限ヘッダーが付与されること"""
        response = await client.get("/api/v1/health")
        assert "x-ratelimit-limit" in response.headers
        assert "x-ratelimit-remaining" in response.headers

    @pytest.mark.asyncio
    async def test_health_endpoint_excluded(self, client: AsyncClient) -> None:
        """ヘルスチェックパスはレート制限の対象外であること"""
        response = await client.get("/health")
        # ヘルスチェックにはレート制限ヘッダーが付かない
        assert "x-ratelimit-limit" not in response.headers
