"""データインポート・管理エンドポイント"""

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenData, UserRole, get_current_user, require_role
from app.models.orm import Dataset as DatasetModel
from app.models.orm import TextRecord
from app.models.schemas import ColumnMapping, DataImportResponse
from app.services.data_import import data_import_service
from app.services.pii_anonymizer import PIIAnonymizer

router = APIRouter()


@router.post("/import", response_model=DataImportResponse)
async def import_data(
    file: UploadFile = File(...),
    column_mappings: str = Form(default="[]"),
    encoding: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> DataImportResponse:
    """ファイルをインポート"""
    file_bytes = await file.read()
    mappings = [ColumnMapping(**m) for m in json.loads(column_mappings)]

    return await data_import_service.import_file(
        file_bytes=file_bytes,
        file_name=file.filename or "unknown",
        column_mappings=mappings if mappings else None,
        encoding=encoding,
        db=db,
    )


@router.post("/{dataset_id}/pii-scan")
async def scan_pii(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(require_role(UserRole.ADMIN, UserRole.ANALYST)),
) -> dict:
    """データセット内のPIIを検知してレポートを返す"""
    records = (await db.execute(select(TextRecord).where(TextRecord.dataset_id == dataset_id))).scalars().all()
    if not records:
        raise HTTPException(status_code=404, detail="Dataset not found or empty")

    anonymizer = PIIAnonymizer()
    texts = [r.text_content for r in records]
    anonymizer.anonymize_batch(texts)

    return {
        "dataset_id": dataset_id,
        "total_records": len(records),
        "pii_detected": len(anonymizer.mappings),
        "entities": anonymizer.get_mapping_report(),
    }


@router.get("/datasets")
async def list_datasets(
    offset: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """データセット一覧（ページネーション対応）"""
    from sqlalchemy import func

    total = (await db.execute(select(func.count(DatasetModel.id)))).scalar() or 0
    result = await db.execute(select(DatasetModel).order_by(DatasetModel.created_at.desc()).offset(offset).limit(limit))
    datasets = result.scalars().all()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "datasets": [
            {
                "id": d.id,
                "name": d.name,
                "total_rows": d.total_rows,
                "text_column": d.text_column,
                "status": d.status,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in datasets
        ],
    }
