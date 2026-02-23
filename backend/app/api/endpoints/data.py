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
    merge_dataset_id: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> DataImportResponse:
    """ファイルをインポート"""
    import pandas as pd

    from app.core.errors import FileProcessingError

    filename = file.filename or "unknown"

    # ファイル読み込み
    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise FileProcessingError(
            filename=filename,
            detail="アップロードされたファイルが空です。ファイルの内容を確認してください。",
        )

    # カラムマッピング解析
    try:
        mappings = [ColumnMapping(**m) for m in json.loads(column_mappings)]
    except (json.JSONDecodeError, TypeError, ValueError) as e:
        raise FileProcessingError(
            filename=filename,
            detail=f"カラムマッピングの形式が不正です: {e}",
        ) from e

    # インポート実行
    try:
        result = await data_import_service.import_file(
            file_bytes=file_bytes,
            file_name=filename,
            column_mappings=mappings if mappings else None,
            encoding=encoding,
            db=db,
            merge_dataset_id=merge_dataset_id,
        )
    except UnicodeDecodeError as e:
        raise FileProcessingError(
            filename=filename,
            detail="ファイルの文字コードを正しく検出できませんでした。UTF-8またはShift_JISで保存したファイルを使用してください。",
        ) from e
    except pd.errors.EmptyDataError as e:
        raise FileProcessingError(
            filename=filename,
            detail="ファイルにデータが含まれていません。ヘッダー行とデータ行があることを確認してください。",
        ) from e
    except ValueError as e:
        raise FileProcessingError(
            filename=filename,
            detail=str(e),
        ) from e
    except FileProcessingError:
        raise
    except Exception as e:
        from app.core.logging import get_logger

        get_logger(__name__).error("import_unexpected_error", filename=filename, error=str(e))
        raise FileProcessingError(
            filename=filename,
            detail="インポート中に予期しないエラーが発生しました。ファイル形式やデータ内容を確認してください。",
        ) from e

    # インポート成功時にキャッシュを無効化
    from app.services.cache import analysis_cache

    await analysis_cache.invalidate_dataset(result.dataset_id)

    return result


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


@router.get("/datasets/{dataset_id}/attributes")
async def get_dataset_attributes(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(get_current_user),
) -> dict:
    """データセットの属性メタデータを取得（フィルタ用）"""
    result = await db.execute(select(TextRecord.attributes).where(TextRecord.dataset_id == dataset_id).limit(500))
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Dataset not found or empty")

    # 属性キーと値の収集
    attr_meta: dict[str, dict] = {}
    for attrs in rows:
        if not attrs:
            continue
        for key, val in attrs.items():
            if key not in attr_meta:
                attr_meta[key] = {"values": set(), "numeric": True}
            attr_meta[key]["values"].add(str(val) if val is not None else "")
            if attr_meta[key]["numeric"]:
                try:
                    float(val)
                except (ValueError, TypeError):
                    attr_meta[key]["numeric"] = False

    attributes = []
    for key, meta in attr_meta.items():
        unique_count = len(meta["values"])
        if meta["numeric"]:
            attr_type = "numeric"
        elif unique_count <= 30:
            attr_type = "categorical"
        else:
            attr_type = "text"
        attributes.append(
            {
                "name": key,
                "type": attr_type,
                "unique_values": sorted(meta["values"])[:50] if attr_type == "categorical" else [],
                "unique_count": unique_count,
            }
        )

    return {"dataset_id": dataset_id, "attributes": attributes}


@router.delete("/datasets/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: TokenData = Depends(require_role(UserRole.ADMIN, UserRole.ANALYST)),
) -> dict:
    """データセットとその全レコードを削除（CASCADE）"""
    dataset = (await db.execute(select(DatasetModel).where(DatasetModel.id == dataset_id))).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await db.delete(dataset)
    await db.flush()

    from app.services.cache import analysis_cache

    await analysis_cache.invalidate_dataset(dataset_id)

    return {"deleted": True, "dataset_id": dataset_id}


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
