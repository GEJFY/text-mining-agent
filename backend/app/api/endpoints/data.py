"""データインポート・管理エンドポイント"""

from fastapi import APIRouter, File, Form, UploadFile

from app.models.schemas import ColumnMapping, DataImportResponse
from app.services.data_import import data_import_service

router = APIRouter()


@router.post("/import", response_model=DataImportResponse)
async def import_data(
    file: UploadFile = File(...),
    column_mappings: str = Form(default="[]"),
    encoding: str | None = Form(default=None),
) -> DataImportResponse:
    """ファイルをインポート"""
    import json

    file_bytes = await file.read()
    mappings = [ColumnMapping(**m) for m in json.loads(column_mappings)]

    return await data_import_service.import_file(
        file_bytes=file_bytes,
        file_name=file.filename or "unknown",
        column_mappings=mappings if mappings else None,
        encoding=encoding,
    )


@router.get("/datasets")
async def list_datasets() -> dict:
    """データセット一覧"""
    return {"datasets": [], "message": "Database integration required"}
