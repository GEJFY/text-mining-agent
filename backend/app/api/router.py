"""API ルーター - 全エンドポイントの統合"""

from fastapi import APIRouter

from app.api.endpoints import agent, analysis, data, health, reports

api_router = APIRouter()

api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(data.router, prefix="/data", tags=["Data Import"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["Text Analysis"])
api_router.include_router(agent.router, prefix="/agent", tags=["Agent"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
