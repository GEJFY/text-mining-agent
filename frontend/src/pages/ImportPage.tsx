import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileSpreadsheet,
  X,
  Check,
  AlertTriangle,
  ChevronDown,
  Eye,
  Loader2,
  CheckCircle2,
  XCircle,
  BarChart3,
  ArrowRight,
  Database,
  Copy,
} from "lucide-react";
import { datasetsApi } from "../api/client";
import { useAnalysisStore } from "../stores/analysisStore";

/**
 * データインポートページ
 * ドラッグ&ドロップ、カラムマッピング、プレビューテーブル、
 * 実API接続 + インポート結果表示
 */

/** カラムマッピング設定 */
interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
}

/** プレビューデータ行 */
interface PreviewRow {
  [key: string]: string;
}

/** インポート結果 */
interface ImportResult {
  dataset_id: string;
  total_rows: number;
  null_rate: number;
  char_count_stats: Record<string, number>;
  unique_values: Record<string, number>;
  preview: Record<string, unknown>[];
}

// マッピング先フィールド
const TARGET_FIELDS = [
  { value: "text", label: "テキスト本文" },
  { value: "date", label: "日付" },
  { value: "category", label: "カテゴリ" },
  { value: "author", label: "著者" },
  { value: "source", label: "ソース" },
  { value: "id", label: "ID" },
  { value: "ignore", label: "無視する" },
];

function ImportPage() {
  const navigate = useNavigate();
  const addDataset = useAnalysisStore((s) => s.addDataset);
  const setActiveDataset = useAnalysisStore((s) => s.setActiveDataset);

  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "importing" | "complete">("upload");
  const [columns, setColumns] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [totalRowCount, setTotalRowCount] = useState(0);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ドラッグ&ドロップハンドラ
  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "dragenter" || e.type === "dragover") {
        setDragActive(true);
      } else if (e.type === "dragleave") {
        setDragActive(false);
      }
    },
    []
  );

  // ファイルドロップハンドラ
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  // CSVをクライアント側で解析してプレビュー生成
  const parseCSVPreview = (text: string): { columns: string[]; rows: PreviewRow[]; totalRows: number } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return { columns: [], rows: [], totalRows: 0 };

    // ヘッダー行
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows: PreviewRow[] = [];

    for (let i = 1; i < Math.min(lines.length, 6); i++) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const row: PreviewRow = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? "";
      });
      rows.push(row);
    }

    return { columns: headers, rows, totalRows: lines.length - 1 };
  };

  // ファイル選択ハンドラ
  const handleFileSelect = (file: File) => {
    const validExtensions = [".csv", ".tsv", ".xlsx", ".xls", ".json", ".jsonl", ".txt", ".pdf", ".docx"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();

    if (!validExtensions.includes(ext)) {
      setError("対応していないファイル形式です。CSV、Excel、JSON、PDF、Word、テキスト形式のファイルを選択してください。");
      return;
    }

    setError(null);
    setUploadedFile(file);
    setUploading(true);

    // CSVの場合はクライアント側でプレビュー解析
    if (ext === ".csv" || ext === ".tsv") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const { columns: cols, rows, totalRows } = parseCSVPreview(text);
        setColumns(cols);
        setPreviewData(rows);
        setTotalRowCount(totalRows);

        // テキストカラムを自動推定（最も長い文字列のカラム）
        const autoMappings = cols.map((col) => {
          const avgLen =
            rows.reduce((sum, row) => sum + (row[col]?.length ?? 0), 0) / Math.max(rows.length, 1);
          return { col, avgLen };
        });
        const textCol = autoMappings.sort((a, b) => b.avgLen - a.avgLen)[0]?.col;

        setMappings(
          cols.map((col) => ({
            sourceColumn: col,
            targetField: col === textCol ? "text" : "ignore",
          }))
        );

        setUploading(false);
        setStep("mapping");
      };
      reader.onerror = () => {
        setError("ファイルの読み込みに失敗しました。");
        setUploading(false);
      };
      reader.readAsText(file);
    } else {
      // CSV以外はプレビューなしでマッピングへ進む
      setColumns([]);
      setPreviewData([]);
      setTotalRowCount(0);
      setMappings([]);
      setTimeout(() => {
        setUploading(false);
        setStep("mapping");
      }, 500);
    }
  };

  // ファイル入力クリック
  const handleFileInputClick = () => {
    fileInputRef.current?.click();
  };

  // マッピング更新
  const updateMapping = (sourceColumn: string, targetField: string) => {
    setMappings((prev) =>
      prev.map((m) =>
        m.sourceColumn === sourceColumn ? { ...m, targetField } : m
      )
    );
  };

  // インポート実行（実API呼び出し）
  const handleImport = async () => {
    if (!uploadedFile) return;

    const textMapping = mappings.find((m) => m.targetField === "text");

    setStep("importing");
    setError(null);

    try {
      const res = await datasetsApi.upload(uploadedFile, {
        textColumn: textMapping?.sourceColumn,
      });

      const result: ImportResult = res.data;
      setImportResult(result);

      // Zustandストアにデータセットを追加
      addDataset({
        id: result.dataset_id,
        name: uploadedFile.name,
        rowCount: result.total_rows,
        columnCount: Object.keys(result.preview[0] ?? {}).length,
        textColumn: textMapping?.sourceColumn ?? "",
        createdAt: new Date().toISOString(),
        status: "ready",
      });
      setActiveDataset(result.dataset_id);

      setStep("complete");
    } catch (e: unknown) {
      const axiosError = e as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      const detail =
        axiosError.response?.data?.detail ??
        axiosError.message ??
        "インポート中にエラーが発生しました";
      setError(detail);
      setStep("preview"); // エラー時はプレビューに戻す
    }
  };

  // dataset_idをクリップボードにコピー
  const copyDatasetId = () => {
    if (importResult?.dataset_id) {
      navigator.clipboard.writeText(importResult.dataset_id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  // リセットして新規インポート
  const resetImport = () => {
    setUploadedFile(null);
    setStep("upload");
    setColumns([]);
    setPreviewData([]);
    setMappings([]);
    setImportResult(null);
    setError(null);
    setTotalRowCount(0);
  };

  // ファイルサイズをフォーマット
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ========================================
          エラー通知バナー
          ======================================== */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 animate-in fade-in slide-in-from-top-2">
          <XCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              エラーが発生しました
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 dark:hover:text-red-300"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ========================================
          ステップインジケーター
          ======================================== */}
      <div className="flex items-center gap-2">
        {[
          { key: "upload", label: "ファイル選択" },
          { key: "mapping", label: "カラムマッピング" },
          { key: "preview", label: "プレビュー・確認" },
          { key: "complete", label: "完了" },
        ].map((s, index) => {
          const stepOrder = ["upload", "mapping", "preview", "complete"];
          const currentIdx = stepOrder.indexOf(step === "importing" ? "complete" : step);
          const isActive = step === s.key || (step === "importing" && s.key === "complete");
          const isPast = index < currentIdx;

          return (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all
                  ${
                    isActive
                      ? "bg-nexus-600 text-white"
                      : isPast
                        ? "bg-nexus-100 dark:bg-nexus-900 text-nexus-700 dark:text-nexus-300"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                  }
                `}
              >
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs bg-white/20">
                  {isPast ? <Check size={12} /> : index + 1}
                </span>
                {s.label}
              </div>
              {index < 3 && (
                <ChevronDown size={16} className="text-gray-300 dark:text-gray-600 -rotate-90" />
              )}
            </div>
          );
        })}
      </div>

      {/* ========================================
          ステップ1: ファイルアップロード
          ======================================== */}
      {step === "upload" && (
        <div className="card p-8">
          <div
            className={`
              relative border-2 border-dashed rounded-xl p-12
              flex flex-col items-center justify-center gap-4
              transition-colors duration-200 cursor-pointer
              ${
                dragActive
                  ? "border-nexus-500 bg-nexus-50 dark:bg-nexus-950"
                  : "border-gray-300 dark:border-gray-700 hover:border-nexus-400 dark:hover:border-nexus-600"
              }
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleFileInputClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.xlsx,.xls,.json,.jsonl,.txt,.pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />

            {uploading ? (
              <>
                <Loader2 size={48} className="text-nexus-500 animate-spin" />
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                  ファイルを読み込んでいます...
                </p>
              </>
            ) : (
              <>
                <div className="p-4 rounded-full bg-nexus-50 dark:bg-nexus-950">
                  <Upload size={40} className="text-nexus-500" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                    ファイルをドラッグ&ドロップ
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    または<span className="text-nexus-600 dark:text-nexus-400 font-medium">クリックしてファイルを選択</span>
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                  <span>CSV</span>
                  <span>TSV</span>
                  <span>Excel (.xlsx)</span>
                  <span>JSON / JSONL</span>
                  <span>PDF</span>
                  <span>Word (.docx)</span>
                  <span>テキスト</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================
          ステップ2: カラムマッピング
          ======================================== */}
      {step === "mapping" && uploadedFile && (
        <div className="space-y-4">
          {/* アップロード済みファイル情報 */}
          <div className="card p-4 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950">
              <FileSpreadsheet
                size={24}
                className="text-emerald-600 dark:text-emerald-400"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {uploadedFile.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatFileSize(uploadedFile.size)}
                {columns.length > 0 && ` ・ ${columns.length} カラム検出`}
                {totalRowCount > 0 && ` ・ ${totalRowCount.toLocaleString()} 行`}
              </p>
            </div>
            <button
              onClick={resetImport}
              className="btn-ghost text-gray-400 hover:text-red-500"
            >
              <X size={18} />
            </button>
          </div>

          {/* マッピングテーブル */}
          <div className="card p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              カラムマッピング設定
            </h3>

            {columns.length > 0 ? (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  各カラムの用途を指定してください。「テキスト本文」は必須です。
                </p>

                <div className="space-y-3">
                  {mappings.map((mapping) => (
                    <div
                      key={mapping.sourceColumn}
                      className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="w-1/3">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {mapping.sourceColumn}
                        </span>
                      </div>
                      <ChevronDown
                        size={16}
                        className="text-gray-400 -rotate-90 flex-shrink-0"
                      />
                      <div className="w-1/3">
                        <select
                          value={mapping.targetField}
                          onChange={(e) =>
                            updateMapping(mapping.sourceColumn, e.target.value)
                          }
                          className="input-field text-sm py-1.5"
                        >
                          {TARGET_FIELDS.map((field) => (
                            <option key={field.value} value={field.value}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-shrink-0">
                        {mapping.targetField === "text" ? (
                          <Check size={18} className="text-emerald-500" />
                        ) : mapping.targetField === "ignore" ? (
                          <AlertTriangle size={18} className="text-amber-400" />
                        ) : (
                          <Check size={18} className="text-blue-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {!mappings.some((m) => m.targetField === "text") && (
                  <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle size={16} />
                      <span className="text-sm font-medium">
                        テキスト本文に対応するカラムを1つ選択してください
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <FileSpreadsheet size={40} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  このファイル形式ではプレビューが表示されません。
                  <br />
                  サーバー側でカラムを自動検出します。
                </p>
              </div>
            )}

            {/* ボタン */}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={resetImport} className="btn-secondary">
                戻る
              </button>
              {columns.length > 0 ? (
                <button
                  onClick={() => setStep("preview")}
                  className="btn-primary"
                  disabled={!mappings.some((m) => m.targetField === "text")}
                >
                  <Eye size={16} />
                  プレビュー
                </button>
              ) : (
                <button onClick={handleImport} className="btn-primary">
                  <Upload size={16} />
                  インポート実行
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================
          ステップ3: プレビュー・確認
          ======================================== */}
      {step === "preview" && (
        <div className="space-y-4">
          {/* プレビューテーブル */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                データプレビュー
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                先頭{previewData.length}行のプレビュー ・ 合計 {totalRowCount.toLocaleString()} 行
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50">
                    {columns.map((col) => {
                      const mapping = mappings.find(
                        (m) => m.sourceColumn === col
                      );
                      return (
                        <th
                          key={col}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          <div>{col}</div>
                          {mapping &&
                            mapping.targetField !== "ignore" && (
                              <span className="badge-positive mt-1 text-xs normal-case">
                                {
                                  TARGET_FIELDS.find(
                                    (f) => f.value === mapping.targetField
                                  )?.label
                                }
                              </span>
                            )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {previewData.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/30"
                    >
                      {columns.map((col) => (
                        <td
                          key={col}
                          className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate"
                        >
                          {row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* インポートサマリー */}
          <div className="card p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              インポート設定確認
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  ファイル名:
                </span>
                <p className="font-medium text-gray-900 dark:text-white mt-0.5">
                  {uploadedFile?.name ?? "-"}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  テキストカラム:
                </span>
                <p className="font-medium text-gray-900 dark:text-white mt-0.5">
                  {mappings.find((m) => m.targetField === "text")
                    ?.sourceColumn ?? "未選択"}
                </p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">
                  使用カラム数:
                </span>
                <p className="font-medium text-gray-900 dark:text-white mt-0.5">
                  {mappings.filter((m) => m.targetField !== "ignore").length}{" "}
                  / {columns.length}
                </p>
              </div>
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setStep("mapping")}
                className="btn-secondary"
              >
                戻る
              </button>
              <button onClick={handleImport} className="btn-primary">
                <Upload size={16} />
                インポート実行
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================
          インポート処理中
          ======================================== */}
      {step === "importing" && (
        <div className="card p-12">
          <div className="flex flex-col items-center justify-center gap-6">
            <div className="relative">
              <Loader2 size={64} className="text-nexus-500 animate-spin" />
              <Database size={24} className="text-nexus-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                データをインポート中...
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {uploadedFile?.name} を処理しています。
                <br />
                ファイルサイズによって数秒〜数分かかる場合があります。
              </p>
            </div>
            {/* プログレスバー風のアニメーション */}
            <div className="w-full max-w-md">
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-nexus-500 rounded-full animate-pulse" style={{ width: "70%" }} />
              </div>
              <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-2">
                <span>文字コード検出</span>
                <span>データ読み込み</span>
                <span>DB保存</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================
          ステップ4: インポート完了
          ======================================== */}
      {step === "complete" && importResult && (
        <div className="space-y-4">
          {/* 成功バナー */}
          <div className="card p-6 border-l-4 border-l-emerald-500">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-full bg-emerald-50 dark:bg-emerald-950">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  インポートが完了しました
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {uploadedFile?.name} から{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {importResult.total_rows.toLocaleString()} 件
                  </span>
                  のレコードをデータベースに保存しました。
                </p>
                {/* データセットID */}
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    データセットID:
                  </span>
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono text-gray-700 dark:text-gray-300">
                    {importResult.dataset_id}
                  </code>
                  <button
                    onClick={copyDatasetId}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="IDをコピー"
                  >
                    {copiedId ? (
                      <Check size={14} className="text-emerald-500" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 統計情報カード */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">総レコード数</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {importResult.total_rows.toLocaleString()}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">欠損率</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {(importResult.null_rate * 100).toFixed(1)}%
              </p>
            </div>
            {importResult.char_count_stats?.mean !== undefined && (
              <div className="card p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">平均文字数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {Math.round(importResult.char_count_stats.mean).toLocaleString()}
                </p>
              </div>
            )}
            {importResult.char_count_stats?.max !== undefined && (
              <div className="card p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">最大文字数</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {Math.round(importResult.char_count_stats.max).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* プレビューテーブル（API結果） */}
          {importResult.preview.length > 0 && (
            <div className="card overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  インポートされたデータ（先頭10件）
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                      {Object.keys(importResult.preview[0]).map((col) => (
                        <th
                          key={col}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {importResult.preview.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        {Object.values(row).map((val, colIdx) => (
                          <td
                            key={colIdx}
                            className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate"
                          >
                            {String(val ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* アクションボタン */}
          <div className="card p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              次のステップ
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                onClick={() => navigate("/analysis/cluster")}
                className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-nexus-400 dark:hover:border-nexus-600 hover:bg-nexus-50 dark:hover:bg-nexus-950 transition-all text-left"
              >
                <BarChart3 size={20} className="text-indigo-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">クラスタ分析</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">テキストをグループ化</p>
                </div>
                <ArrowRight size={16} className="text-gray-400 ml-auto" />
              </button>

              <button
                onClick={() => navigate("/analysis/sentiment")}
                className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-nexus-400 dark:hover:border-nexus-600 hover:bg-nexus-50 dark:hover:bg-nexus-950 transition-all text-left"
              >
                <BarChart3 size={20} className="text-pink-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">感情分析</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">ポジティブ/ネガティブ判定</p>
                </div>
                <ArrowRight size={16} className="text-gray-400 ml-auto" />
              </button>

              <button
                onClick={() => navigate("/analysis/cooccurrence")}
                className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-nexus-400 dark:hover:border-nexus-600 hover:bg-nexus-50 dark:hover:bg-nexus-950 transition-all text-left"
              >
                <BarChart3 size={20} className="text-green-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">共起ネットワーク</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">キーワード関連を可視化</p>
                </div>
                <ArrowRight size={16} className="text-gray-400 ml-auto" />
              </button>

              <button
                onClick={() => navigate("/agent")}
                className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-nexus-400 dark:hover:border-nexus-600 hover:bg-nexus-50 dark:hover:bg-nexus-950 transition-all text-left"
              >
                <BarChart3 size={20} className="text-purple-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">AIエージェント</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">自律的にデータを分析</p>
                </div>
                <ArrowRight size={16} className="text-gray-400 ml-auto" />
              </button>
            </div>

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={resetImport}
                className="btn-secondary"
              >
                <Upload size={16} />
                別のファイルをインポート
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImportPage;
