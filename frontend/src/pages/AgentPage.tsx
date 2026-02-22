import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Save, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import apiClient from '../api/client';
import { agentApi, reportsApi } from '../api/client';
import { useAnalysisStore } from '../stores/analysisStore';
import DatasetGuard from '../components/DatasetGuard';
import InfoTooltip from '../components/InfoTooltip';

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

interface SavedSession {
  id: string;
  dataset_id: string;
  objective: string;
  status: string;
  insight_count: number;
  created_at: string;
}

export default function AgentPage() {
  const { activeDatasetId, agentSessionState, setAgentSessionState, clearAgentSessionState } = useAnalysisStore();
  const [hitlMode, setHitlMode] = useState<'full_auto' | 'semi_auto' | 'guided'>('semi_auto');
  const [objective, setObjective] = useState('');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [state, setState] = useState<string>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingApproval, setPendingApproval] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [autoReport, setAutoReport] = useState(false);
  const [reportFormat, setReportFormat] = useState('pdf');
  const [pipelineResult, setPipelineResult] = useState<{
    reportId?: string;
    downloadUrl?: string;
    jobCount?: number;
  } | null>(null);

  // セッション保存関連
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [showSessions, setShowSessions] = useState(false);

  // ポーリング用ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Zustandからセッション状態を復元
  useEffect(() => {
    if (agentSessionState) {
      setAgentId(agentSessionState.agentId);
      setState(agentSessionState.state);
      setLogs(agentSessionState.logs || []);
      setInsights(agentSessionState.insights || []);
      setPendingApproval(agentSessionState.pendingApproval);
      setObjective(agentSessionState.objective || '');
      setHitlMode((agentSessionState.hitlMode as 'full_auto' | 'semi_auto' | 'guided') || 'semi_auto');
      setAutoReport(agentSessionState.autoReport || false);
      setReportFormat(agentSessionState.reportFormat || 'pdf');
      setPipelineResult(agentSessionState.pipelineResult || null);
      // running状態ならポーリング再開
      if (agentSessionState.agentId && !['completed', 'error', 'idle'].includes(agentSessionState.state)) {
        startPolling(agentSessionState.agentId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 状態変更時にZustandに自動保存
  useEffect(() => {
    if (agentId) {
      setAgentSessionState({
        agentId,
        state,
        logs,
        insights,
        pendingApproval,
        objective,
        hitlMode,
        autoReport,
        reportFormat,
        pipelineResult,
      });
    }
  }, [agentId, state, logs, insights, pendingApproval, objective, hitlMode, autoReport, reportFormat, pipelineResult, setAgentSessionState]);

  // 過去のセッション一覧を取得
  const loadSavedSessions = useCallback(async () => {
    if (!activeDatasetId) return;
    try {
      const res = await agentApi.listSessions(activeDatasetId);
      setSavedSessions(res.data.sessions || []);
    } catch {
      // 取得失敗は無視
    }
  }, [activeDatasetId]);

  useEffect(() => {
    loadSavedSessions();
  }, [loadSavedSessions]);

  // ログ末尾への自動スクロール
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ポーリング開始
  const startPolling = useCallback((id: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await agentApi.logs(id);
        const data = res.data;
        setLogs(data.logs || []);
        setState(data.state || 'unknown');
        if (data.insights?.length) setInsights(data.insights);
        if (data.pending_approval) setPendingApproval(data.pending_approval);
        // 完了またはエラーで停止
        if (['completed', 'error'].includes(data.state)) {
          stopPolling();
        }
      } catch {
        // ポーリングエラーは無視
      }
    }, 3000);
  }, []);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startAnalysis = async () => {
    if (!activeDatasetId) return;
    clearAgentSessionState();
    setLoading(true);
    setLogs([]);
    setInsights([]);
    setPendingApproval(null);
    setPipelineResult(null);
    setSavedMessage('');

    if (autoReport) {
      // パイプラインモード
      try {
        setState('running');
        const res = await agentApi.pipeline({
          dataset_id: activeDatasetId,
          objective,
          output_format: reportFormat,
        });
        setAgentId(res.data.agent_id);
        setInsights(res.data.insights || []);
        setLogs(res.data.logs || []);
        setState('completed');
        setPipelineResult({
          reportId: res.data.report_id,
          downloadUrl: res.data.report_download_url,
          jobCount: res.data.analysis_jobs?.length ?? 0,
        });
      } catch (e) {
        console.error(e);
        setState('error');
      } finally {
        setLoading(false);
      }
    } else {
      // 通常分析モード（ポーリングで進捗取得）
      try {
        setState('running');
        const res = await apiClient.post('/agent/start', {
          dataset_id: activeDatasetId,
          objective,
          hitl_mode: hitlMode,
        });
        const aid = res.data.agent_id;
        setAgentId(aid);
        setState(res.data.state);
        setLogs(res.data.logs || []);
        setInsights(res.data.insights || []);
        setPendingApproval(res.data.pending_approval);
      } catch (e) {
        console.error(e);
        setState('error');
      } finally {
        setLoading(false);
      }
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

  const saveSession = async () => {
    if (!agentId) return;
    setSaving(true);
    try {
      await agentApi.saveSession(agentId);
      setSavedMessage('分析結果を保存しました');
      loadSavedSessions();
    } catch {
      setSavedMessage('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const restoreSession = async (sessionId: string) => {
    try {
      const res = await agentApi.getSession(sessionId);
      const data = res.data;
      setAgentId(data.id);
      setState(data.status || 'completed');
      setLogs(data.logs || []);
      setInsights(data.insights || []);
      setObjective(data.objective || '');
      setPendingApproval(null);
      setPipelineResult(null);
      setSavedMessage('');
    } catch {
      // 復元失敗
    }
  };

  const downloadReport = async () => {
    if (!pipelineResult?.reportId) return;
    try {
      const res = await reportsApi.download(pipelineResult.reportId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexustext_report.${reportFormat}`;
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

  const isRunning = state === 'running' || (loading && state !== 'completed' && state !== 'error');

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
              <InfoTooltip title="分析目的" text="エージェントに与える分析のゴールです。具体的に記述するほど、エージェントは適切なツールを選択し、焦点を絞った分析を行います。例:「顧客離反の主要因を特定し、改善策を提案する」「製品Aに関するネガティブフィードバックのパターンを分析する」" />
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
              <InfoTooltip title="Human-in-the-Loop制御" text="エージェントの自律度を制御します。Full Auto: 全フェーズを自動実行。最速ですが中間確認なし。Semi-Auto: 仮説生成後に承認を求めます。重要な判断ポイントで人間が介入でき、バランスが良い推奨設定です。Guided: 各ステップで承認が必要。最も慎重ですが処理に時間がかかります。" />
            </label>
            <select
              value={hitlMode}
              onChange={(e) => setHitlMode(e.target.value as 'full_auto' | 'semi_auto' | 'guided')}
              className="w-full rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm p-2 border"
            >
              <option value="full_auto">Full Auto - 全自動</option>
              <option value="semi_auto">Semi-Auto - 重要判断で承認要求</option>
              <option value="guided">Guided - 各ステップで承認</option>
            </select>
          </div>
        </div>

        {/* レポート自動生成オプション */}
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoReport}
              onChange={(e) => setAutoReport(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              分析完了後にレポートを自動生成する
            </span>
            <InfoTooltip title="自動レポート" text="チェックすると、AI分析が完了した後に自動的にレポートを生成します。分析→レポート生成が一括で実行されるパイプラインモードで動作します。" />
          </label>
          {autoReport && (
            <div className="mt-2 ml-6">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">出力形式</label>
              <select
                value={reportFormat}
                onChange={(e) => setReportFormat(e.target.value)}
                className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm p-1.5 border"
              >
                <option value="pdf">PDF</option>
                <option value="pptx">PowerPoint</option>
                <option value="docx">Word</option>
                <option value="excel">Excel</option>
              </select>
            </div>
          )}
        </div>

        <div className="mt-4">
          <button
            onClick={startAnalysis}
            disabled={isRunning || !activeDatasetId}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                分析中...
              </>
            ) : (
              'AI分析を開始'
            )}
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
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold mx-auto transition-all ${
                      isCurrent && isRunning
                        ? `${getPhaseColor(phase.key)} ring-4 ring-indigo-300 animate-pulse`
                        : isCurrent
                        ? `${getPhaseColor(phase.key)} ring-4 ring-indigo-300`
                        : isActive
                        ? getPhaseColor(phase.key)
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    {isCurrent && isRunning ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      phase.icon
                    )}
                  </div>
                  <p className="text-xs mt-1 font-medium text-gray-700 dark:text-gray-300">
                    {phase.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{phase.description}</p>
                </div>
                {idx < PHASES.length - 1 && (
                  <div className={`w-12 h-0.5 mx-2 transition-colors ${
                    isActive ? 'bg-indigo-400' : 'bg-gray-300 dark:bg-gray-600'
                  }`} />
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

      {/* パイプライン結果 + 保存ボタン */}
      {pipelineResult && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200 mb-2">
            パイプライン完了
          </h3>
          <p className="text-emerald-700 dark:text-emerald-300 text-sm mb-3">
            {pipelineResult.jobCount}件の分析ジョブが実行されました。
          </p>
          <div className="flex gap-3">
            {pipelineResult.downloadUrl && (
              <button
                onClick={downloadReport}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
              >
                レポートをダウンロード
              </button>
            )}
          </div>
        </div>
      )}

      {/* 分析完了時の保存ボタン */}
      {state === 'completed' && agentId && (
        <div className="flex items-center gap-3">
          <button
            onClick={saveSession}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            分析結果を保存
          </button>
          {savedMessage && (
            <span className="text-sm text-green-600 dark:text-green-400">{savedMessage}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* エージェントログ */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
            エージェント・ログ
            {isRunning && <Loader2 size={14} className="animate-spin text-indigo-500" />}
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
            <div ref={logsEndRef} />
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

      {/* 過去の分析セッション */}
      {savedSessions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="flex items-center gap-2 w-full text-left"
          >
            <Clock size={16} className="text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              過去の分析セッション ({savedSessions.length})
            </h2>
            {showSessions ? <ChevronUp size={16} className="ml-auto text-gray-400" /> : <ChevronDown size={16} className="ml-auto text-gray-400" />}
          </button>
          {showSessions && (
            <div className="mt-4 space-y-2">
              {savedSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {session.objective || '（目的未設定）'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {session.created_at ? new Date(session.created_at).toLocaleString('ja-JP') : ''} ・ インサイト{session.insight_count}件
                    </p>
                  </div>
                  <button
                    onClick={() => restoreSession(session.id)}
                    className="ml-3 px-3 py-1 text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded hover:bg-indigo-200 dark:hover:bg-indigo-900 transition-colors"
                  >
                    復元
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
    </DatasetGuard>
  );
}
