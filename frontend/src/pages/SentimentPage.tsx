import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  Play,
  DollarSign,
  Plus,
  X,
  Loader2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { useAnalysisStore } from "../stores/analysisStore";
import { sentimentApi } from "../api/client";
import DatasetGuard from "../components/DatasetGuard";

/**
 * センチメント分析ページ
 * センチメント軸設定、コスト見積もり、時系列チャート、分布チャート
 * バックエンドAPI経由で実データを分析
 */

/** カスタム軸 */
interface CustomAxis {
  name: string;
  positive: string;
  negative: string;
}

/** 分布バーデータ */
interface DistributionItem {
  label: string;
  count: number;
  color: string;
}

/** 時系列データ */
interface TimeSeriesItem {
  date: string;
  label: string;
  avgScore: number;
  count: number;
}

/** 結果テーブル行 */
interface ResultRow {
  id: string;
  labels: string[];
  scores: Record<string, number>;
}

// 分布ラベル → カラーマッピング
const DISTRIBUTION_COLORS: Record<string, string> = {
  positive: "#34d399",
  negative: "#f87171",
  neutral: "#9ca3af",
  very_positive: "#059669",
  very_negative: "#dc2626",
};

function SentimentPage() {
  const { activeDatasetId } = useAnalysisStore();
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [positiveLabel, setPositiveLabel] = useState("ポジティブ");
  const [negativeLabel, setNegativeLabel] = useState("ネガティブ");
  const [customAxes, setCustomAxes] = useState<CustomAxis[]>([]);
  const [error, setError] = useState<string | null>(null);

  // コスト見積もり
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<string | null>(null);
  const [estimatedRecords, setEstimatedRecords] = useState<number | null>(null);
  const [showCostWarning, setShowCostWarning] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);

  // 分析結果
  const [distribution, setDistribution] = useState<DistributionItem[]>([]);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesItem[]>([]);
  const [resultRows, setResultRows] = useState<ResultRow[]>([]);
  const [axes, setAxes] = useState<string[]>([]);

  // カスタム軸を追加
  const addCustomAxis = () => {
    setCustomAxes([...customAxes, { name: "", positive: "", negative: "" }]);
  };

  // カスタム軸を削除
  const removeCustomAxis = (index: number) => {
    setCustomAxes(customAxes.filter((_, i) => i !== index));
  };

  // カスタム軸を更新
  const updateCustomAxis = (
    index: number,
    field: keyof CustomAxis,
    value: string,
  ) => {
    setCustomAxes(
      customAxes.map((axis, i) =>
        i === index ? { ...axis, [field]: value } : axis,
      ),
    );
  };

  // コスト見積もり
  const handleEstimate = async () => {
    if (!activeDatasetId) return;
    setIsEstimating(true);
    setError(null);

    try {
      const response = await sentimentApi.estimate(activeDatasetId);
      const data = response.data;
      setEstimatedCost(data.estimated_cost_usd);
      setEstimatedRecords(data.total_records);
      const seconds = data.estimated_time_seconds as number;
      setEstimatedTime(
        seconds >= 60
          ? `約${Math.ceil(seconds / 60)}分`
          : `約${seconds}秒`,
      );
    } catch {
      setError("コスト見積もりに失敗しました");
    } finally {
      setIsEstimating(false);
    }
  };

  // 分析実行
  const handleRun = async () => {
    if (!activeDatasetId) return;

    if (estimatedCost && estimatedCost > 10 && !showCostWarning) {
      setShowCostWarning(true);
      return;
    }

    setShowCostWarning(false);
    setIsRunning(true);
    setError(null);

    try {
      // カスタム軸をAPI形式に変換
      const customAxesApi =
        customAxes.length > 0
          ? customAxes
              .filter((a) => a.name.trim())
              .map((a) => ({
                name: a.name,
                description: `${a.positive} vs ${a.negative}`,
              }))
          : undefined;

      const response = await sentimentApi.run(activeDatasetId, {
        mode: customAxesApi ? "custom" : "basic",
        custom_axes: customAxesApi,
      });

      const data = response.data;

      // 軸情報
      setAxes(data.axes as string[]);

      // 分布マッピング
      const dist = data.distribution as Record<string, number>;
      const mappedDist: DistributionItem[] = Object.entries(dist).map(
        ([label, count]) => ({
          label,
          count,
          color: DISTRIBUTION_COLORS[label] ?? "#6366f1",
        }),
      );
      setDistribution(mappedDist);

      // 時系列データ
      if (data.time_series) {
        const ts = (data.time_series as Array<Record<string, unknown>>).map(
          (item) => ({
            date: item.date as string,
            label: (item.label as string) ?? (item.date as string),
            avgScore: (item.avg_score as number) ?? 0,
            count: (item.count as number) ?? 0,
          }),
        );
        setTimeSeries(ts);
      } else {
        setTimeSeries([]);
      }

      // 結果テーブル（最大20件）
      const results = (
        data.results as Array<{
          record_id: string;
          labels: string[];
          scores: Record<string, number>;
        }>
      ).slice(0, 20);
      setResultRows(
        results.map((r) => ({
          id: r.record_id,
          labels: r.labels,
          scores: r.scores,
        })),
      );

      setHasResults(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "センチメント分析に失敗しました";
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <DatasetGuard>
    <div className="space-y-6 max-w-7xl mx-auto">
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
        {/* ========================================
            左パネル: 軸設定・コスト見積もり
            ======================================== */}
        <div className="lg:col-span-1 space-y-4">
          {/* センチメント軸設定 */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              センチメント軸設定
            </h3>

            {/* デフォルト軸 */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                  ポジティブ側ラベル
                </label>
                <input
                  type="text"
                  value={positiveLabel}
                  onChange={(e) => setPositiveLabel(e.target.value)}
                  className="input-field text-sm"
                  placeholder="例: 満足、好意的"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                  ネガティブ側ラベル
                </label>
                <input
                  type="text"
                  value={negativeLabel}
                  onChange={(e) => setNegativeLabel(e.target.value)}
                  className="input-field text-sm"
                  placeholder="例: 不満、否定的"
                />
              </div>
            </div>

            {/* カスタム軸 */}
            {customAxes.length > 0 && (
              <div className="mt-4 space-y-3">
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  カスタム軸
                </h4>
                {customAxes.map((axis, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={axis.name}
                        onChange={(e) =>
                          updateCustomAxis(idx, "name", e.target.value)
                        }
                        className="input-field text-sm flex-1 mr-2"
                        placeholder="軸名 (例: 信頼性)"
                      />
                      <button
                        onClick={() => removeCustomAxis(idx)}
                        className="btn-ghost text-gray-400 hover:text-red-500 p-1"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={axis.positive}
                      onChange={(e) =>
                        updateCustomAxis(idx, "positive", e.target.value)
                      }
                      className="input-field text-xs"
                      placeholder="ポジティブ側"
                    />
                    <input
                      type="text"
                      value={axis.negative}
                      onChange={(e) =>
                        updateCustomAxis(idx, "negative", e.target.value)
                      }
                      className="input-field text-xs"
                      placeholder="ネガティブ側"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={addCustomAxis}
              className="btn-ghost w-full mt-3 text-sm text-nexus-600 dark:text-nexus-400"
            >
              <Plus size={14} />
              カスタム軸を追加
            </button>
          </div>

          {/* コスト見積もり */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <DollarSign size={16} />
              コスト見積もり
            </h3>

            <button
              onClick={handleEstimate}
              disabled={isEstimating}
              className="btn-secondary w-full mb-3 text-sm"
            >
              {isEstimating ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  計算中...
                </>
              ) : (
                "見積もりを計算"
              )}
            </button>

            {estimatedCost !== null && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">
                    推定コスト:
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    ${estimatedCost.toFixed(2)}
                  </span>
                </div>
                {estimatedTime && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">
                      推定処理時間:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {estimatedTime}
                    </span>
                  </div>
                )}
                {estimatedRecords !== null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">
                      対象レコード数:
                    </span>
                    <span className="text-gray-900 dark:text-white">
                      {estimatedRecords.toLocaleString()}件
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">
                    分析軸数:
                  </span>
                  <span className="text-gray-900 dark:text-white">
                    {1 + customAxes.length}
                  </span>
                </div>
              </div>
            )}

            {/* コスト警告 */}
            {showCostWarning && (
              <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                  <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium">コストが$10を超えています</p>
                    <p className="mt-1">
                      もう一度「分析実行」を押すと実行されます
                    </p>
                  </div>
                </div>
              </div>
            )}

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
                  分析実行
                </>
              )}
            </button>
          </div>
        </div>

        {/* ========================================
            右パネル: 結果表示
            ======================================== */}
        <div className="lg:col-span-2 space-y-4">
          {hasResults ? (
            <>
              {/* 時系列チャート */}
              {timeSeries.length > 0 && (
                <div className="card p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                    センチメントスコア推移
                  </h3>
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={timeSeries}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e5e7eb"
                        className="dark:stroke-gray-700"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                      />
                      <YAxis
                        domain={[-1, 1]}
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                        tickFormatter={(v: number) => v.toFixed(1)}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1f2937",
                          border: "none",
                          borderRadius: "8px",
                          color: "#f3f4f6",
                        }}
                        formatter={(value: number) => [
                          value.toFixed(2),
                          "スコア",
                        ]}
                      />
                      {/* ゼロライン */}
                      <Line
                        type="monotone"
                        dataKey={() => 0}
                        stroke="#6b7280"
                        strokeDasharray="5 5"
                        strokeWidth={1}
                        dot={false}
                      />
                      {/* センチメントライン */}
                      <Line
                        type="monotone"
                        dataKey="avgScore"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: "#6366f1" }}
                        name="平均スコア"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* センチメント分布 */}
              {distribution.length > 0 && (
                <div className="card p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                    センチメント分布
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={distribution} layout="vertical">
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e5e7eb"
                        className="dark:stroke-gray-700"
                      />
                      <XAxis
                        type="number"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={120}
                        tick={{ fill: "#9ca3af", fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1f2937",
                          border: "none",
                          borderRadius: "8px",
                          color: "#f3f4f6",
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="件数"
                        radius={[0, 4, 4, 0]}
                      >
                        {distribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 分析結果テーブル */}
              <div className="card overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    分析結果（{resultRows.length}件表示）
                  </h3>
                  {axes.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      分析軸: {axes.join(", ")}
                    </p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                          レコードID
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-32">
                          ラベル
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-40">
                          スコア
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {resultRows.map((row) => {
                        const primaryLabel = row.labels[0] ?? "-";
                        const primaryScore =
                          Object.values(row.scores)[0] ?? 0;
                        return (
                          <tr
                            key={row.id}
                            className="hover:bg-gray-50 dark:hover:bg-gray-800/30"
                          >
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-mono">
                              {row.id}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={
                                  primaryLabel === "positive"
                                    ? "badge-positive"
                                    : primaryLabel === "negative"
                                      ? "badge-negative"
                                      : "badge-neutral"
                                }
                              >
                                {primaryLabel === "positive"
                                  ? positiveLabel
                                  : primaryLabel === "negative"
                                    ? negativeLabel
                                    : primaryLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span
                                className={`text-sm font-mono font-medium ${
                                  primaryScore > 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : primaryScore < 0
                                      ? "text-red-600 dark:text-red-400"
                                      : "text-gray-600 dark:text-gray-400"
                                }`}
                              >
                                {primaryScore > 0 ? "+" : ""}
                                {primaryScore.toFixed(2)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="card p-16 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <TrendingUp size={48} className="mb-4 opacity-50" />
              <p className="text-lg font-medium">
                センチメント分析を実行してください
              </p>
              <p className="text-sm mt-1">
                左パネルで軸設定を行い、分析実行ボタンを押してください
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
    </DatasetGuard>
  );
}

export default SentimentPage;
