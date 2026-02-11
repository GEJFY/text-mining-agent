import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  X,
  Check,
  AlertTriangle,
  ChevronDown,
  Eye,
  Loader2,
} from "lucide-react";

/**
 * データインポートページ
 * ドラッグ&ドロップ、カラムマッピング、プレビューテーブル
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

// サンプルプレビューデータ
const SAMPLE_COLUMNS = [
  "id",
  "投稿日",
  "投稿者",
  "テキスト内容",
  "カテゴリ",
];

const SAMPLE_PREVIEW: PreviewRow[] = [
  {
    id: "001",
    投稿日: "2024-06-01",
    投稿者: "ユーザーA",
    テキスト内容: "製品の使いやすさが向上しました。非常に満足しています。",
    カテゴリ: "製品レビュー",
  },
  {
    id: "002",
    投稿日: "2024-06-02",
    投稿者: "ユーザーB",
    テキスト内容: "配送に時間がかかりすぎます。改善してください。",
    カテゴリ: "配送",
  },
  {
    id: "003",
    投稿日: "2024-06-03",
    投稿者: "ユーザーC",
    テキスト内容: "カスタマーサポートの対応が素晴らしかったです。",
    カテゴリ: "サポート",
  },
  {
    id: "004",
    投稿日: "2024-06-04",
    投稿者: "ユーザーD",
    テキスト内容: "価格に見合った品質だと思います。特に問題なし。",
    カテゴリ: "製品レビュー",
  },
  {
    id: "005",
    投稿日: "2024-06-05",
    投稿者: "ユーザーE",
    テキスト内容: "アプリのUIが分かりにくい。もっと直感的にしてほしい。",
    カテゴリ: "UI/UX",
  },
];

function ImportPage() {
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [columns] = useState<string[]>(SAMPLE_COLUMNS);
  const [previewData] = useState<PreviewRow[]>(SAMPLE_PREVIEW);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
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

  // ファイル選択ハンドラ
  const handleFileSelect = (file: File) => {
    const validTypes = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/json",
    ];
    const validExtensions = [".csv", ".xlsx", ".xls", ".json", ".tsv"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      alert("対応していないファイル形式です。CSV、Excel、JSON形式のファイルを選択してください。");
      return;
    }

    setUploadedFile(file);
    // 初期カラムマッピングを設定
    setMappings(
      SAMPLE_COLUMNS.map((col) => ({
        sourceColumn: col,
        targetField: col === "テキスト内容" ? "text" : "ignore",
      }))
    );

    // アップロードシミュレーション
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      setStep("mapping");
    }, 1500);
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

  // インポート実行
  const handleImport = () => {
    const textMapping = mappings.find((m) => m.targetField === "text");
    if (!textMapping) {
      alert("テキスト本文に対応するカラムを選択してください。");
      return;
    }
    // 実際にはAPIにリクエストを送る
    alert(
      `インポートを開始します。\nテキストカラム: ${textMapping.sourceColumn}`
    );
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
          ステップインジケーター
          ======================================== */}
      <div className="flex items-center gap-2">
        {[
          { key: "upload", label: "ファイル選択" },
          { key: "mapping", label: "カラムマッピング" },
          { key: "preview", label: "プレビュー・確認" },
        ].map((s, index) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium
                ${
                  step === s.key
                    ? "bg-nexus-600 text-white"
                    : index <
                        ["upload", "mapping", "preview"].indexOf(step)
                      ? "bg-nexus-100 dark:bg-nexus-900 text-nexus-700 dark:text-nexus-300"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                }
              `}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs bg-white/20">
                {index + 1}
              </span>
              {s.label}
            </div>
            {index < 2 && (
              <ChevronDown size={16} className="text-gray-300 dark:text-gray-600 -rotate-90" />
            )}
          </div>
        ))}
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
              accept=".csv,.xlsx,.xls,.json,.tsv"
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
                  <span>Excel (.xlsx)</span>
                  <span>JSON</span>
                  <span>TSV</span>
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
                {formatFileSize(uploadedFile.size)} ・{" "}
                {columns.length} カラム検出
              </p>
            </div>
            <button
              onClick={() => {
                setUploadedFile(null);
                setStep("upload");
              }}
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
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              各カラムの用途を指定してください。「テキスト本文」は必須です。
            </p>

            <div className="space-y-3">
              {mappings.map((mapping) => (
                <div
                  key={mapping.sourceColumn}
                  className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                >
                  {/* ソースカラム名 */}
                  <div className="w-1/3">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {mapping.sourceColumn}
                    </span>
                  </div>

                  {/* 矢印 */}
                  <ChevronDown
                    size={16}
                    className="text-gray-400 -rotate-90 flex-shrink-0"
                  />

                  {/* マッピング先セレクト */}
                  <div className="w-1/3">
                    <select
                      value={mapping.targetField}
                      onChange={(e) =>
                        updateMapping(
                          mapping.sourceColumn,
                          e.target.value
                        )
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

                  {/* ステータスアイコン */}
                  <div className="flex-shrink-0">
                    {mapping.targetField === "text" ? (
                      <Check
                        size={18}
                        className="text-emerald-500"
                      />
                    ) : mapping.targetField === "ignore" ? (
                      <AlertTriangle
                        size={18}
                        className="text-amber-400"
                      />
                    ) : (
                      <Check size={18} className="text-blue-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* テキストカラム警告 */}
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

            {/* ボタン */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setUploadedFile(null);
                  setStep("upload");
                }}
                className="btn-secondary"
              >
                戻る
              </button>
              <button
                onClick={() => setStep("preview")}
                className="btn-primary"
                disabled={!mappings.some((m) => m.targetField === "text")}
              >
                <Eye size={16} />
                プレビュー
              </button>
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
                先頭5行のプレビュー ・ 合計 {previewData.length} 行表示中
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
                                    (f) =>
                                      f.value ===
                                      mapping.targetField
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
    </div>
  );
}

export default ImportPage;
