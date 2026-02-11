"""ヘルスチェックエンドポイント"""

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("")
async def health_check() -> dict:
    return {
        "status": "healthy",
        "version": settings.app_version,
        "cloud_provider": settings.cloud_provider.value,
    }
