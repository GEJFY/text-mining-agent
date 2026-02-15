"""NexusText AI - メインアプリケーションエントリーポイント"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.exception_handlers import register_exception_handlers
from app.core.logging import setup_logging
from app.core.telemetry import setup_telemetry
from app.core.validation import validate_config
from app.middleware.correlation import CorrelationIdMiddleware
from app.middleware.rate_limit import RateLimitMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """アプリケーションのライフサイクル管理"""
    import asyncio

    setup_logging()
    validate_config()
    setup_telemetry(app)

    # データベーステーブル自動作成
    from app.core.database import engine
    from app.models.orm import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 埋め込みモデルをバックグラウンドで事前ロード（初回分析の高速化）
    from app.services.text_preprocessing import text_preprocessor

    asyncio.get_event_loop().run_in_executor(None, text_preprocessor.preload_model)

    yield


app = FastAPI(
    title="NexusText AI",
    version="7.0.0",
    description="Global Multimodal Autonomous Text Analyzer",
    lifespan=lifespan,
)

# ミドルウェア（実行順: 下→上）
app.add_middleware(RateLimitMiddleware)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 例外ハンドラー登録
register_exception_handlers(app)

# APIルーター
app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy", "version": "7.0.0"}


@app.get("/health/live")
async def liveness_root() -> dict[str, str]:
    """ルートレベルliveness（Terraform k8s probe対応）"""
    return {"status": "alive"}


@app.get("/health/ready")
async def readiness_root() -> dict:
    """ルートレベルreadiness（Terraform k8s probe対応）"""
    from app.api.endpoints.health import readiness

    return await readiness()
