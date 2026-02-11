import { useState } from 'react';
import apiClient from '../api/client';

/* レポートテンプレート定義 */
const TEMPLATES = [
  { value: 'voc', label: 'VOC分析レポート', description: '感情トレンド、クラスター分析、改善提案' },
  { value: 'audit', label: '監査分析レポート', description: '発見事項、リスク評価、推奨事項' },
  { value: 'compliance', label: 'コンプライアンス報告', description: '時系列分析、キーワード共起、結論' },
  { value: 'risk', label: 'リスク分析レポート', description: 'リスク分類、ヒートマップ、優先対応' },
  { value: 'custom', label: 'カスタムレポート', description: '自由なプロンプトで構成' },
];

const FORMATS = [
  { value: 'pdf', label: 'PDF', icon: '📄' },
  { value: 'pptx', label: 'PowerPoint', icon: '📊' },
  { value: 'docx', label: 'Word', icon: '📝' },
  { value: 'excel', label: 'Excel', icon: '📈' },
];

export default function ReportsPage() {
  const [datasetId, setDatasetId] = useState('');
  const [template, setTemplate] = useState('voc');
  const [format, setFormat] = useState('pdf');
  const [customPrompt, setCustomPrompt] = useState('');
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const res = await apiClient.post('/reports/generate', {
        dataset_id: datasetId,
        template,
        output_format: format,
        custom_prompt: template === 'custom' ? customPrompt : null,
        include_evidence_links: includeEvidence,
      });
      setResult(res.data);
      setReports((prev) => [res.data, ...prev]);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  return (
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
                  onClick={() => setTemplate(t.value)}
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

          {/* カスタムプロンプト */}
          {template === 'custom' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
                カスタムプロンプト
              </h2>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={4}
                className="w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-3 border"
                placeholder="このデータから○○の観点でレポートを作成してください..."
              />
            </div>
          )}

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
                  <span className="text-xl">{f.icon}</span>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  データセットID
                </label>
                <input
                  type="text"
                  value={datasetId}
                  onChange={(e) => setDatasetId(e.target.value)}
                  className="w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2 border"
                  placeholder="dataset-xxx"
                />
              </div>
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
              disabled={generating || !datasetId}
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
                  <a
                    href={r.download_url}
                    className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                  >
                    ダウンロード
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
