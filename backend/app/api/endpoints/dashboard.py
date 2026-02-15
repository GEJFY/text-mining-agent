"""ダッシュボードサマリーエンドポイント"""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.orm import AnalysisJob, Dataset, TextRecord

router = APIRouter()


@router.get("/summary")
async def dashboard_summary(db: AsyncSession = Depends(get_db)) -> dict:
    """ダッシュボードKPI・最近のアクティビティを返す"""

    # データセット数
    ds_count = (await db.execute(select(func.count(Dataset.id)))).scalar() or 0

    # テキストレコード総数
    record_count = (await db.execute(select(func.count(TextRecord.id)))).scalar() or 0

    # 分析ジョブ集計（タイプ別）
    jobs_result = await db.execute(
        select(AnalysisJob.analysis_type, func.count(AnalysisJob.id))
        .where(AnalysisJob.status == "completed")
        .group_by(AnalysisJob.analysis_type)
    )
    jobs_by_type = {row[0]: row[1] for row in jobs_result.all()}

    # 最近のアクティビティ（直近10件）
    recent_result = await db.execute(
        select(AnalysisJob)
        .order_by(AnalysisJob.created_at.desc())
        .limit(10)
    )
    recent_jobs = recent_result.scalars().all()

    # データセットID→名前のマッピング
    if recent_jobs:
        ds_ids = list({j.dataset_id for j in recent_jobs})
        ds_result = await db.execute(
            select(Dataset.id, Dataset.name).where(Dataset.id.in_(ds_ids))
        )
        ds_names = {row[0]: row[1] for row in ds_result.all()}
    else:
        ds_names = {}

    # データセット一覧（直近5件）
    ds_list_result = await db.execute(
        select(Dataset).order_by(Dataset.created_at.desc()).limit(5)
    )
    recent_datasets = ds_list_result.scalars().all()

    return {
        "kpi": {
            "dataset_count": ds_count,
            "record_count": record_count,
            "cluster_jobs": jobs_by_type.get("cluster", 0),
            "sentiment_jobs": jobs_by_type.get("sentiment", 0),
            "cooccurrence_jobs": jobs_by_type.get("cooccurrence", 0),
            "total_jobs": sum(jobs_by_type.values()),
        },
        "recent_activity": [
            {
                "id": j.id,
                "analysis_type": j.analysis_type,
                "dataset_name": ds_names.get(j.dataset_id, j.dataset_id),
                "status": j.status,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in recent_jobs
        ],
        "recent_datasets": [
            {
                "id": d.id,
                "name": d.name,
                "total_rows": d.total_rows,
                "status": d.status,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in recent_datasets
        ],
    }
