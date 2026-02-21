import { useState } from 'react';
import apiClient from '../api/client';
import { agentApi, reportsApi } from '../api/client';
import { useAnalysisStore } from '../stores/analysisStore';
import DatasetGuard from '../components/DatasetGuard';

/* 推論フェーズの定義 */
const PHASES = [
  { key: 'observe', label: '観測', icon: '1', description: 'データの統計・特徴をスキャン' },
  { key: 'hypothesize', label: '仮説', icon: '2', description: '検証可能な問いを生成' },
  { key: 'explore', label: '探索', icon: '3', description: 'フィルタ・セグメント分析を実行' },
  { key: 'verify', label: '検証', icon: '4', description: '統計的検定で仮説を裏付け' },
  { key: 'synthesize', label: '統合', icon: '5', description: 'インサイトとして構造化' },
];

interface LogEntry {
  timestamp: string;
  phase: string;
  thought: string;
  action?: string;
  result?: string;
  confidence: number;
}

interface Insight {
  title: string;
  description: string;
  evidence: string[];
  grounding_score: number;
  recommendations: string[];
}

export default function AgentPage() {
  const { activeDatasetId } = useAnalysisStore();
  const [hitlMode, setHitlMode] = useState<'full_auto' | 'semi_auto' | 'guided'>('semi_auto');
  const [objective, setObjective] = useState('');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [state, setState] = useState<string>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [pendingApproval, setPendingApproval] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<{
    reportId?: string;
    downloadUrl?: string;
    jobCount?: number;
  } | null>(null);

  const startAnalysis = async () => {
    setLoading(true);
    try {
      const res = await apiClient.post('/agent/start', {
        dataset_id: activeDatasetId,
        objective,
        hitl_mode: hitlMode,
      });
      setAgentId(res.data.agent_id);
      setState(res.data.state);
      setLogs(res.data.logs || []);
      setInsights(res.data.insights || []);
      setPendingApproval(res.data.pending_approval);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const approveHypotheses = async (hypotheses: string[]) => {
    if (!agentId) return;
    setLoading(true);
    try {
      const res = await apiClient.post(`/agent/${agentId}/approve`, {
        approved_hypotheses: hypotheses,
      });
      setState(res.data.state);
      setLogs(res.data.logs || []);
      setInsights(res.data.insights || []);
      setPendingApproval(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const runPipeline = async () => {
    setLoading(true);
    setPipelineResult(null);
    try {
      const res = await agentApi.pipeline({
        dataset_id: activeDatasetId!,
        objective,
      });
      setAgentId(res.data.agent_id);
      setInsights(res.data.insights || []);
      setLogs([]);
      setState('completed');
      setPipelineResult({
        reportId: res.data.report_id,
        downloadUrl: res.data.report_download_url,
        jobCount: res.data.analysis_jobs?.length ?? 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = async () => {
    if (!pipelineResult?.reportId) return;
    try {
      const res = await reportsApi.download(pipelineResult.reportId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexustext_report.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  const getPhaseColor = (phase: string) => {
    const colors: Record<string, string> = {
      observe: 'bg-blue-500',
      hypothesize: 'bg-purple-500',
      explore: 'bg-green-500',
      verify: 'bg-yellow-500',
      synthesize: 'bg-red-500',
    };
    return colors[phase] || 'bg-gray-500';
  };

  const getGroundingColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 dark:text-green-400';
    if (score >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <DatasetGuard>
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">自律型分析エージェント</h1>

      {/* 設定パネル */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">分析設定</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              分析目的
            </label>
            <input
              type="text"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2 border"
              placeholder="顧客の不満要因を特定する"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              HITL制御モード
            </label>
            <select
              value={hitlMode}
              onChange={(e) => setHitlMode(e.target.value as any)}
              className="w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2 border"
            >
              <option value="full_auto">Full Auto - 全自動</option>
              <option value="semi_auto">Semi-Auto - 重要判断で承認要求</option>
              <option value="guided">Guided - 各ステップで承認</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={startAnalysis}
            disabled={loading || !activeDatasetId}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? '分析中...' : '分析開始'}
          </button>
          <button
            onClick={runPipeline}
            disabled={loading || !activeDatasetId}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? '実行中...' : '自動パイプライン（分析→レポート）'}
          </button>
        </div>
      </div>

      {/* 推論フェーズ進捗 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">推論ループ</h2>
        <div className="flex items-center justify-between">
          {PHASES.map((phase, idx) => {
            const isActive = logs.some((l) => l.phase === phase.key);
            const isCurrent = logs.length > 0 && logs[logs.length - 1].phase === phase.key;
            return (
              <div key={phase.key} className="flex items-center">
                <div className="text-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold mx-auto ${
                      isCurrent
                        ? `${getPhaseColor(phase.key)} ring-4 ring-indigo-300`
                        : isActive
                        ? getPhaseColor(phase.key)
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    {phase.icon}
                  </div>
                  <p className="text-xs mt-1 font-medium text-gray-700 dark:text-gray-300">
                    {phase.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{phase.description}</p>
                </div>
                {idx < PHASES.length - 1 && (
                  <div className="w-12 h-0.5 bg-gray-300 dark:bg-gray-600 mx-2" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* HITL承認パネル */}
      {pendingApproval && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
            承認が必要です
          </h3>
          <p className="text-yellow-700 dark:text-yellow-300 mb-4">{pendingApproval.message}</p>
          {pendingApproval.hypotheses?.map((h: string, i: number) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <span className="text-sm text-yellow-800 dark:text-yellow-200">
                {i + 1}. {h}
              </span>
            </div>
          ))}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => approveHypotheses(pendingApproval.hypotheses)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              全て承認
            </button>
            <button
              onClick={() => setPendingApproval(null)}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* パイプライン結果 */}
      {pipelineResult && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200 mb-2">
            パイプライン完了
          </h3>
          <p className="text-emerald-700 dark:text-emerald-300 text-sm mb-3">
            {pipelineResult.jobCount}件の分析ジョブが実行されました。
          </p>
          {pipelineResult.downloadUrl && (
            <button
              onClick={downloadReport}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
            >
              レポートをダウンロード
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* エージェントログ */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
            エージェント・ログ
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {logs.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                分析を開始するとログが表示されます
              </p>
            )}
            {logs.map((log, i) => (
              <div key={i} className="border-l-4 pl-3 py-2" style={{ borderColor: 'var(--phase-color)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded text-white ${getPhaseColor(log.phase)}`}
                  >
                    {log.phase}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(log.timestamp).toLocaleTimeString('ja-JP')}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{log.thought}</p>
                {log.result && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    結果: {log.result}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* インサイト */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
            インサイト
          </h2>
          <div className="space-y-4">
            {insights.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                分析完了後にインサイトが表示されます
              </p>
            )}
            {insights.map((insight, i) => (
              <div
                key={i}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                    {insight.title}
                  </h3>
                  <span
                    className={`text-sm font-mono ${getGroundingColor(insight.grounding_score)}`}
                  >
                    Grounding: {(insight.grounding_score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {insight.description}
                </p>
                {insight.evidence.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                      エビデンス:
                    </p>
                    {insight.evidence.map((ev, j) => (
                      <p key={j} className="text-xs text-gray-500 dark:text-gray-400 pl-2">
                        - {ev}
                      </p>
                    ))}
                  </div>
                )}
                {insight.recommendations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                      推奨アクション:
                    </p>
                    {insight.recommendations.map((rec, j) => (
                      <p key={j} className="text-xs text-blue-600 dark:text-blue-400 pl-2">
                        - {rec}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </DatasetGuard>
  );
}
