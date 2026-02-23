import { useState } from 'react';
import { FileText, Presentation, FileType2, Sheet } from 'lucide-react';
import apiClient, { reportsApi } from '../api/client';
import { useAnalysisStore } from '../stores/analysisStore';
import DatasetGuard from '../components/DatasetGuard';
import { handleApiError } from '../utils/handleApiError';

/* レポートテンプレート定義 */
const TEMPLATES = [
  { value: 'voc', label: 'VOC分析レポート', description: '感情トレンド、クラスター分析、改善提案' },
  { value: 'audit', label: '監査分析レポート', description: '発見事項、リスク評価、推奨事項' },
  { value: 'compliance', label: 'コンプライアンス報告', description: '時系列分析、キーワード共起、結論' },
  { value: 'risk', label: 'リスク分析レポート', description: 'リスク分類、ヒートマップ、優先対応' },
  { value: 'custom', label: 'カスタムレポート', description: '自由なプロンプトで構成' },
];

/* テンプレート別プロンプトひな型 */
const TEMPLATE_PROMPTS: Record<string, string> = {
  voc: '顧客の声（VOC）を分析し、感情トレンド・主要テーマ・改善提案をまとめてください。特に顧客満足度に影響する要因を重点的に分析してください。',
  audit: '内部監査の観点から、発見事項・リスク評価・統制上の懸念点・推奨事項をまとめてください。重要度と緊急度を明示してください。',
  compliance: 'コンプライアンスの観点から、時系列での変化・キーワード共起による関連性・リスク分類・改善提言をまとめてください。',
  risk: 'リスク分析の観点から、リスク分類・影響度評価・優先対応事項・モニタリング計画をまとめてください。リスクの相互関連も分析してください。',
  custom: '',
};

const FORMATS = [
  { value: 'pdf', label: 'PDF', icon: <FileText size={20} className="text-nexus-600" /> },
  { value: 'pptx', label: 'PowerPoint', icon: <Presentation size={20} className="text-nexus-600" /> },
  { value: 'docx', label: 'Word', icon: <FileType2 size={20} className="text-nexus-600" /> },
  { value: 'excel', label: 'Excel', icon: <Sheet size={20} className="text-nexus-600" /> },
];

export default function ReportsPage() {
  const { activeDatasetId } = useAnalysisStore();
  const [template, setTemplate] = useState('voc');
  const [format, setFormat] = useState('pdf');
  const [customPrompt, setCustomPrompt] = useState(TEMPLATE_PROMPTS['voc']);
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const res = await apiClient.post('/reports/generate', {
        dataset_id: activeDatasetId,
        template,
        output_format: format,
        custom_prompt: customPrompt || undefined,
        include_evidence_links: includeEvidence,
      });
      setResult(res.data);
      setReports((prev) => [res.data, ...prev]);
    } catch (e) {
      handleApiError(e, "レポート生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <DatasetGuard>
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">レポート生成</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 設定パネル */}
        <div className="lg:col-span-2 space-y-6">
          {/* テンプレート選択 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              テンプレート選択
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    setTemplate(t.value);
                    setCustomPrompt(TEMPLATE_PROMPTS[t.value] ?? '');
                  }}
                  className={`text-left p-4 rounded-lg border-2 transition-colors ${
                    template === t.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <p className="font-medium text-gray-800 dark:text-gray-200">{t.label}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* レポートプロンプト（全テンプレートで編集可能） */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
              レポート指示プロンプト
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              テンプレートの標準プロンプトをベースに、自由にカスタマイズできます。LLMはこの指示に従ってレポートを生成します。
            </p>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={4}
              className="w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-3 border text-sm"
              placeholder="このデータから○○の観点でレポートを作成してください..."
            />
          </div>

          {/* 出力形式 */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              出力形式
            </h2>
            <div className="flex gap-3">
              {FORMATS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFormat(f.value)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                    format === f.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span>{f.icon}</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* オプション */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              オプション
            </h2>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeEvidence}
                  onChange={(e) => setIncludeEvidence(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  エビデンスリンクを含める
                </span>
              </label>
            </div>

            <button
              onClick={generateReport}
              disabled={generating || !activeDatasetId}
              className="mt-4 w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              {generating ? 'レポート生成中...' : 'レポートを生成'}
            </button>
          </div>
        </div>

        {/* 生成済みレポート一覧 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
            生成済みレポート
          </h2>
          <div className="space-y-3">
            {reports.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                まだレポートはありません
              </p>
            )}
            {reports.map((r, i) => (
              <div
                key={i}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {r.report_id?.slice(0, 8)}...
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {r.format?.toUpperCase()} -{' '}
                      {r.generated_at ? new Date(r.generated_at).toLocaleString('ja-JP') : ''}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const res = await reportsApi.download(r.report_id);
                        const blob = new Blob([res.data]);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `report-${r.report_id?.slice(0, 8)}.${r.format || "pdf"}`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {
                        handleApiError(null, "ダウンロードに失敗しました");
                      }
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                  >
                    ダウンロード
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </DatasetGuard>
  );
}
