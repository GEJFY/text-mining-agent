"""セキュリティヘッダーミドルウェアのテスト

全レスポンスにOWASP推奨ヘッダーが付与されていることを検証。
"""

import pytest
from httpx import AsyncClient

EXPECTED_HEADERS = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-xss-protection": "1; mode=block",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
}


class TestSecurityHeaders:
    """レスポンスにセキュリティヘッダーが付与されること"""

    @pytest.mark.asyncio
    async def test_health_endpoint_has_security_headers(self, client: AsyncClient) -> None:
        """ヘルスチェックのレスポンスにセキュリティヘッダーが付与"""
        res = await client.get("/health")
        for header, value in EXPECTED_HEADERS.items():
            assert res.headers.get(header) == value, f"Missing or wrong header: {header}"

    @pytest.mark.asyncio
    async def test_api_endpoint_has_security_headers(self, client: AsyncClient) -> None:
        """APIエンドポイントのレスポンスにセキュリティヘッダーが付与"""
        res = await client.get("/api/v1/dashboard/summary")
        for header, value in EXPECTED_HEADERS.items():
            assert res.headers.get(header) == value, f"Missing or wrong header: {header}"
