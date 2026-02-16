"""データインポート・管理エンドポイント"""

import json

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import TokenData, get_current_user
from app.models.orm import Dataset as DatasetModel
from app.models.schemas import ColumnMapping, DataImportResponse
from app.services.data_import import data_import_service

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


@router.get("/datasets")
async def list_datasets(
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """データセット一覧"""
    result = await db.execute(select(DatasetModel).order_by(DatasetModel.created_at.desc()))
    datasets = result.scalars().all()
    return {
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
        ]
    }
