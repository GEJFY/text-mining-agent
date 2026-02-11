"""データインポートサービス

CSV/TSV, Excel, テキスト, PDF, Word, JSON/JSONL対応。
文字コード自動判定、動的カラムマッピング。
"""

import io
import json
from pathlib import Path
from uuid import uuid4

import chardet
import pandas as pd

from app.core.logging import get_logger
from app.models.schemas import ColumnMapping, ColumnRole, DataImportResponse

logger = get_logger(__name__)


class DataImportService:
    """データインポートエンジン"""

    SUPPORTED_EXTENSIONS = {".csv", ".tsv", ".xlsx", ".txt", ".pdf", ".docx", ".json", ".jsonl"}

    def detect_encoding(self, file_bytes: bytes) -> str:
        """文字コード自動判定"""
        result = chardet.detect(file_bytes[:10000])
        encoding = result.get("encoding", "utf-8") or "utf-8"
        # よくある誤検知の補正
        if encoding.lower() in ("ascii", "windows-1252"):
            encoding = "utf-8"
        return encoding

    async def import_file(
        self,
        file_bytes: bytes,
        file_name: str,
        column_mappings: list[ColumnMapping] | None = None,
        encoding: str | None = None,
    ) -> DataImportResponse:
        """ファイルをインポートしDataFrameに変換"""
        dataset_id = str(uuid4())
        ext = Path(file_name).suffix.lower()

        if ext not in self.SUPPORTED_EXTENSIONS:
            raise ValueError(f"Unsupported file format: {ext}")

        # 文字コード検出
        if not encoding:
            encoding = self.detect_encoding(file_bytes)

        logger.info("import_start", file=file_name, encoding=encoding, ext=ext)

        # 形式別読み込み
        if ext in (".csv", ".tsv"):
            df = self._read_csv(file_bytes, encoding, ext)
        elif ext == ".xlsx":
            df = self._read_excel(file_bytes)
        elif ext == ".txt":
            df = self._read_text(file_bytes, encoding)
        elif ext == ".pdf":
            df = self._read_pdf(file_bytes)
        elif ext == ".docx":
            df = self._read_docx(file_bytes)
        elif ext in (".json", ".jsonl"):
            df = self._read_json(file_bytes, encoding, ext)
        else:
            raise ValueError(f"Unsupported: {ext}")

        # 統計プレビュー
        text_col = None
        if column_mappings:
            for cm in column_mappings:
                if cm.role == ColumnRole.TEXT:
                    text_col = cm.column_name
                    break

        if text_col is None and len(df.columns) > 0:
            # テキスト列を自動推定（最も平均文字数が多い文字列列）
            str_cols = df.select_dtypes(include=["object"]).columns
            if len(str_cols) > 0:
                avg_lens = {col: df[col].dropna().str.len().mean() for col in str_cols}
                text_col = max(avg_lens, key=avg_lens.get)  # type: ignore

        char_count_stats = {}
        if text_col and text_col in df.columns:
            lengths = df[text_col].dropna().str.len()
            char_count_stats = {
                "mean": float(lengths.mean()) if len(lengths) > 0 else 0,
                "median": float(lengths.median()) if len(lengths) > 0 else 0,
                "min": float(lengths.min()) if len(lengths) > 0 else 0,
                "max": float(lengths.max()) if len(lengths) > 0 else 0,
            }

        null_rate = float(df.isna().mean().mean())
        unique_values = {col: int(df[col].nunique()) for col in df.columns[:10]}

        return DataImportResponse(
            dataset_id=dataset_id,
            total_rows=len(df),
            null_rate=null_rate,
            char_count_stats=char_count_stats,
            unique_values=unique_values,
            preview=df.head(10).to_dict(orient="records"),
        )

    def _read_csv(self, file_bytes: bytes, encoding: str, ext: str) -> pd.DataFrame:
        sep = "\t" if ext == ".tsv" else ","
        return pd.read_csv(io.BytesIO(file_bytes), encoding=encoding, sep=sep)

    def _read_excel(self, file_bytes: bytes) -> pd.DataFrame:
        return pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")

    def _read_text(self, file_bytes: bytes, encoding: str) -> pd.DataFrame:
        text = file_bytes.decode(encoding)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return pd.DataFrame({"text": lines})

    def _read_pdf(self, file_bytes: bytes) -> pd.DataFrame:
        import pdfplumber

        texts = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    texts.append(text)
        return pd.DataFrame({"text": texts})

    def _read_docx(self, file_bytes: bytes) -> pd.DataFrame:
        from docx import Document

        doc = Document(io.BytesIO(file_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return pd.DataFrame({"text": paragraphs})

    def _read_json(self, file_bytes: bytes, encoding: str, ext: str) -> pd.DataFrame:
        text = file_bytes.decode(encoding)
        if ext == ".jsonl":
            records = [json.loads(line) for line in text.splitlines() if line.strip()]
            return pd.DataFrame(records)
        else:
            data = json.loads(text)
            if isinstance(data, list):
                return pd.DataFrame(data)
            return pd.json_normalize(data)


# シングルトン
data_import_service = DataImportService()
