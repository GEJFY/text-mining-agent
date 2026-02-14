"""ヘルスチェックエンドポイント

- GET /health      → 基本チェック（現行）
- GET /health/live  → Kubernetes liveness probe
- GET /health/ready → DB・Redis・LLMプロバイダー接続チェック付き
"""

from fastapi import APIRouter

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.get("")
async def health_check() -> dict:
    """基本ヘルスチェック"""
    return {
        "status": "healthy",
        "version": settings.app_version,
        "cloud_provider": settings.cloud_provider.value,
        "llm_deployment_mode": settings.llm_deployment_mode,
    }


@router.get("/live")
async def liveness() -> dict:
    """Kubernetes liveness probe - プロセスが生存していればOK"""
    return {"status": "alive"}


@router.get("/ready")
async def readiness() -> dict:
    """Kubernetes readiness probe - 全依存サービスの接続確認"""
    checks: dict[str, str] = {}

    # DB接続チェック
    try:
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import create_async_engine

        engine = create_async_engine(settings.database_url, pool_pre_ping=True)
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        await engine.dispose()
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"
        logger.warning("readiness_db_failed", error=str(e))

    # Redis接続チェック
    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        await r.close()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"
        logger.warning("readiness_redis_failed", error=str(e))

    # LLMプロバイダーヘルスチェック
    try:
        from app.services.llm_providers import get_llm_provider

        provider = get_llm_provider()
        is_healthy = await provider.health_check()
        checks["llm_provider"] = "ok" if is_healthy else "degraded"
        checks["llm_provider_name"] = provider.provider_name
    except Exception as e:
        checks["llm_provider"] = f"error: {e}"

    all_ok = all(v == "ok" for k, v in checks.items() if k != "llm_provider_name")
    status = "ready" if all_ok else "degraded"

    return {
        "status": status,
        "version": settings.app_version,
        "llm_deployment_mode": settings.llm_deployment_mode,
        "checks": checks,
    }
