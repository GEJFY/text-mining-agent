import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Play,
  Loader2,
  AlertCircle,
  GitBranch,
  ChevronRight,
} from "lucide-react";
import { useAnalysisStore } from "../stores/analysisStore";
import { causalChainApi } from "../api/client";
import DatasetGuard from "../components/DatasetGuard";
import InfoTooltip from "../components/InfoTooltip";
import AnalysisProgress, { ANALYSIS_STEPS } from "../components/AnalysisProgress";
import AttributeFilter from "../components/AttributeFilter";
import type { Filters } from "../components/AttributeFilter";

/**
 * 因果連鎖分析ページ
 * テキストデータから因果関係（原因→結果→影響）を抽出しLLMで分析
 */

interface CausalChainItem {
  chain: string[];
  confidence: number;
  supportingTextIndices: number[];
  explanation: string;
}

function CausalChainPage() {
  const { activeDatasetId, setCachedResult, getCachedResult } = useAnalysisStore();
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // パラメータ
  const [maxChains, setMaxChains] = useState(10);
  const [focusTopic, setFocusTopic] = useState("");

  // 結果
  const [chains, setChains] = useState<CausalChainItem[]>([]);
  const [attrFilters, setAttrFilters] = useState<Filters>({});

  // キャッシュ復元
  useEffect(() => {
    const cached = getCachedResult("causalChain");
    if (cached?.hasResults) {
      setChains(cached.data.chains ?? []);
      setHasResults(true);
    }
  }, [getCachedResult]);

  const handleRun = async () => {
    if (!activeDatasetId) return;
    setIsRunning(true);
    setError(null);

    try {
      const response = await causalChainApi.run(activeDatasetId, {
        max_chains: maxChains,
        focus_topic: focusTopic || undefined,
        filters: Object.keys(attrFilters).length > 0 ? attrFilters : undefined,
      });

      const data = response.data;
      const mapped: CausalChainItem[] = (
        data.chains as Array<{
          chain: string[];
          confidence: number;
          supporting_text_indices: number[];
          explanation: string;
        }>
      ).map((c) => ({
        chain: c.chain,
        confidence: c.confidence,
        supportingTextIndices: c.supporting_text_indices,
        explanation: c.explanation,
      }));

      setChains(mapped);
      setHasResults(true);
      setCachedResult("causalChain", { data: { chains: mapped }, hasResults: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "因果連鎖分析に失敗しました";
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  // 横棒グラフ用データ（confidence順）
  const chartData = chains
    .map((c, i) => ({
      name: c.chain.join(" → ").slice(0, 40),
      confidence: Math.round(c.confidence * 100),
      index: i,
    }))
    .sort((a, b) => b.confidence - a.confidence);

  return (
    <DatasetGuard>
      <div className="space-y-6 w-full">
        {/* エラー表示 */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
            <AlertCircle
              size={18}
              className="text-red-500 mt-0.5 flex-shrink-0"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                分析エラー
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {error}
              </p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600"
            >
              &times;
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左パネル: パラメータ */}
          <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <GitBranch size={16} />
                分析設定
              </h3>

              <div className="space-y-4">
                {/* 最大チェーン数 */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400 flex items-center">
                      最大チェーン数
                      <InfoTooltip title="最大チェーン数" text="LLMが抽出する因果関係チェーン（原因→結果→影響）の最大数です。多くすると網羅的な分析が得られますが、LLM呼び出し回数が増え処理時間とコストが増加します。まずは5-10で全体像を把握し、必要に応じて増やしてください。" />
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {maxChains}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={maxChains}
                    onChange={(e) => setMaxChains(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-nexus-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>1</span>
                    <span>20</span>
                  </div>
                </div>

                {/* フォーカストピック */}
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                    フォーカストピック（任意）
                    <InfoTooltip title="フォーカストピック" text="特定のテーマに絞って因果関係を抽出します。例えば「顧客離反」と入力すると、顧客離反に関連する因果チェーンを重点的に抽出します。空欄の場合はデータ全体からLLMが自動的に重要な因果関係を発見します。" />
                  </label>
                  <input
                    type="text"
                    value={focusTopic}
                    onChange={(e) => setFocusTopic(e.target.value)}
                    className="input-field text-sm"
                    placeholder="例: 顧客離反、品質問題"
                  />
                </div>
              </div>

              {/* 実行ボタン */}
              <button
                onClick={handleRun}
                disabled={isRunning}
                className="btn-primary w-full mt-4"
              >
                {isRunning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    分析実行中...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    因果連鎖分析を実行
                  </>
                )}
              </button>
            </div>

            {/* 進捗タイムライン */}
            <AnalysisProgress steps={ANALYSIS_STEPS.causalChain} isRunning={isRunning} />

            {/* 属性フィルタ */}
            <AttributeFilter datasetId={activeDatasetId} filters={attrFilters} onChange={setAttrFilters} />

            {/* サマリー */}
            {hasResults && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  分析結果サマリー
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">
                      検出チェーン数
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {chains.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">
                      平均信頼度
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {chains.length > 0
                        ? (
                            (chains.reduce((s, c) => s + c.confidence, 0) /
                              chains.length) *
                            100
                          ).toFixed(1)
                        : 0}
                      %
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 右パネル: 結果 */}
          <div className="lg:col-span-2 space-y-4">
            {hasResults ? (
              <>
                {/* 信頼度棒グラフ */}
                {chartData.length > 0 && (
                  <div className="card p-6">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                      信頼度ランキング
                    </h3>
                    <ResponsiveContainer
                      width="100%"
                      height={Math.max(300, chartData.length * 45)}
                    >
                      <BarChart data={chartData} layout="vertical">
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                          className="dark:stroke-gray-700"
                        />
                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tick={{ fill: "#9ca3af", fontSize: 12 }}
                          tickFormatter={(v: number) => `${v}%`}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={250}
                          tick={{ fill: "#9ca3af", fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1f2937",
                            border: "none",
                            borderRadius: "8px",
                            color: "#f3f4f6",
                          }}
                          formatter={(value: number) => [`${value}%`, "信頼度"]}
                        />
                        <Bar
                          dataKey="confidence"
                          fill="var(--color-nexus-500)"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* 因果連鎖カード */}
                <div className="space-y-3">
                  {chains.map((chain, idx) => (
                    <div key={idx} className="card p-5">
                      {/* チェーンフロー */}
                      <div className="flex items-center flex-wrap gap-1 mb-3">
                        {chain.chain.map((node, nodeIdx) => (
                          <span key={nodeIdx} className="flex items-center">
                            <span className="px-3 py-1.5 rounded-lg bg-nexus-50 dark:bg-nexus-950 text-nexus-700 dark:text-nexus-300 text-sm font-medium border border-nexus-200 dark:border-nexus-800">
                              {node}
                            </span>
                            {nodeIdx < chain.chain.length - 1 && (
                              <ChevronRight
                                size={16}
                                className="mx-1 text-gray-400"
                              />
                            )}
                          </span>
                        ))}
                      </div>

                      {/* 説明 */}
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        {chain.explanation}
                      </p>

                      {/* メタ情報 */}
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <span>信頼度:</span>
                          <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${chain.confidence * 100}%`,
                                backgroundColor: chain.confidence > 0.7 ? "var(--color-success)" : chain.confidence > 0.4 ? "var(--color-warning)" : "var(--color-danger)",
                              }}
                            />
                          </div>
                          <span className="font-mono font-medium" style={{ color: chain.confidence > 0.7 ? "var(--color-success)" : chain.confidence > 0.4 ? "var(--color-warning)" : "var(--color-danger)" }}>
                            {(chain.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <span>
                          根拠テキスト: {chain.supportingTextIndices.length}件
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="card p-16 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <GitBranch size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-medium">
                  因果連鎖分析を実行してください
                </p>
                <p className="text-sm mt-1">
                  テキストデータから原因→結果→影響の因果チェーンを抽出します
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DatasetGuard>
  );
}

export default CausalChainPage;
