import { useState, useEffect } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  Play,
  DollarSign,
  Plus,
  X,
  Loader2,
  AlertCircle,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAnalysisStore } from "../stores/analysisStore";
import { sentimentApi } from "../api/client";
import DatasetGuard from "../components/DatasetGuard";
import InfoTooltip from "../components/InfoTooltip";
import AnalysisProgress, { ANALYSIS_STEPS } from "../components/AnalysisProgress";
import AttributeFilter from "../components/AttributeFilter";
import type { Filters } from "../components/AttributeFilter";

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

/** 時系列データ（バックエンドフォーマット準拠） */
interface TimeSeriesItem {
  period: string;
  count: number;
  distribution: Record<string, number>;
}

/** 結果テーブル行 */
interface ResultRow {
  id: string;
  labels: string[];
  scores: Record<string, number>;
}

// 分布ラベル → カラーマッピング（日本語・英語両対応）
const DISTRIBUTION_COLORS: Record<string, string> = {
  positive: "#34d399",
  negative: "#f87171",
  neutral: "#9ca3af",
  very_positive: "#059669",
  very_negative: "#dc2626",
  "ポジティブ": "#34d399",
  "ネガティブ": "#f87171",
  "中立": "#9ca3af",
  "満足": "#059669",
  "不満": "#dc2626",
  error: "#6b7280",
};

// ラベルの感情分類
const POSITIVE_LABELS = new Set(["positive", "Positive", "ポジティブ", "満足", "好意的", "very_positive"]);
const NEGATIVE_LABELS = new Set(["negative", "Negative", "ネガティブ", "不満", "批判的", "very_negative"]);
const ERROR_LABELS = new Set(["error", "分析失敗"]);

const getLabelBadgeClass = (label: string) =>
  ERROR_LABELS.has(label) ? "badge-warning"
  : POSITIVE_LABELS.has(label) ? "badge-positive"
  : NEGATIVE_LABELS.has(label) ? "badge-negative"
  : "badge-neutral";

// 時系列チャート用カラー
const TS_COLORS = ["#34d399", "#f87171", "#9ca3af", "#6366f1", "#f59e0b", "#ec4899"];

function SentimentPage() {
  const { activeDatasetId, setCachedResult, getCachedResult } = useAnalysisStore();
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
  const [textPreviews, setTextPreviews] = useState<Record<string, string>>({});
  const [attrFilters, setAttrFilters] = useState<Filters>({});

  // ページネーション
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // キャッシュ復元
  useEffect(() => {
    const cached = getCachedResult("sentiment");
    if (cached?.hasResults) {
      const d = cached.data;
      setDistribution(d.distribution ?? []);
      setTimeSeries(d.timeSeries ?? []);
      setResultRows(d.resultRows ?? []);
      setAxes(d.axes ?? []);
      setTextPreviews(d.textPreviews ?? {});
      setHasResults(true);
    }
  }, [getCachedResult]);

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
        filters: Object.keys(attrFilters).length > 0 ? attrFilters : undefined,
      });

      const data = response.data;

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

      // 時系列データ（バックエンドフォーマット: {period, count, distribution}）
      let mappedTs: TimeSeriesItem[] = [];
      if (data.time_series && Array.isArray(data.time_series) && (data.time_series as unknown[]).length > 0) {
        mappedTs = (data.time_series as Array<{
          period: string;
          count: number;
          distribution: Record<string, number>;
        }>).map((item) => ({
          period: item.period,
          count: item.count,
          distribution: item.distribution ?? {},
        }));
      }
      setTimeSeries(mappedTs);

      // テキストプレビュー
      const mappedPreviews = (data.text_previews as Record<string, string>) ?? {};
      setTextPreviews(mappedPreviews);

      // 結果テーブル（全件保持）
      const results = (
        data.results as Array<{
          record_id: string;
          labels: string[];
          scores: Record<string, number>;
        }>
      );
      const mappedRows = results.map((r) => ({
        id: r.record_id,
        labels: r.labels,
        scores: r.scores,
      }));
      setResultRows(mappedRows);
      setPage(1);

      const mappedAxes = data.axes as string[];
      setAxes(mappedAxes);
      setHasResults(true);
      setCachedResult("sentiment", {
        data: { distribution: mappedDist, timeSeries: mappedTs, resultRows: mappedRows, axes: mappedAxes, textPreviews: mappedPreviews },
        hasResults: true,
      });
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
        {/* ========================================
            左パネル: 軸設定・コスト見積もり（sticky）
            ======================================== */}
        <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          {/* センチメント軸設定 */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              センチメント軸設定
            </h3>

            {/* デフォルト軸 */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                  ポジティブ側ラベル
                  <InfoTooltip title="ポジティブラベル" text="LLMがポジティブと判定した際に付与するラベル名です。デフォルトは「ポジティブ」ですが、業界に合わせて「満足」「好意的」「推奨」など目的に応じた表現に変更できます。分布チャートやテーブルにこのラベルが表示されます。" />
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
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                  ネガティブ側ラベル
                  <InfoTooltip title="ネガティブラベル" text="LLMがネガティブと判定した際に付与するラベル名です。デフォルトは「ネガティブ」ですが、「不満」「批判的」「リスク」など分析目的に応じた表現に変更できます。カスタム軸を追加すると、複数の感情次元で同時に評価できます。" />
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

          {/* 進捗タイムライン */}
          <AnalysisProgress steps={ANALYSIS_STEPS.sentiment} isRunning={isRunning} />

          {/* 属性フィルタ */}
          <AttributeFilter datasetId={activeDatasetId} filters={attrFilters} onChange={setAttrFilters} />
        </div>

        {/* ========================================
            右パネル: 結果表示
            ======================================== */}
        <div className="lg:col-span-2 space-y-4">
          {hasResults ? (
            <>
              {/* 時系列チャート（積み上げバー） */}
              {timeSeries.length > 0 && (
                <div className="card p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                    感情ラベル推移（月別）
                  </h3>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={timeSeries.map(ts => ({ ...ts, ...ts.distribution }))}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e5e7eb"
                        className="dark:stroke-gray-700"
                      />
                      <XAxis
                        dataKey="period"
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                      />
                      <YAxis
                        tick={{ fill: "#9ca3af", fontSize: 12 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1f2937",
                          border: "none",
                          borderRadius: "8px",
                          color: "#f3f4f6",
                        }}
                      />
                      {axes.map((axis, i) => (
                        <Bar
                          key={axis}
                          dataKey={axis}
                          stackId="a"
                          fill={DISTRIBUTION_COLORS[axis] ?? TS_COLORS[i % TS_COLORS.length]}
                          name={axis}
                        />
                      ))}
                    </BarChart>
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

              {/* レーダーチャート（3軸以上の場合に表示） */}
              {axes.length >= 3 && distribution.length > 0 && (
                <div className="card p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                    感情プロファイル レーダーチャート
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={distribution.map((d) => ({ axis: d.label, value: d.count }))}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="axis" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <PolarRadiusAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
                      <Radar
                        name="件数"
                        dataKey="value"
                        stroke="var(--color-nexus-500)"
                        fill="var(--color-nexus-500)"
                        fillOpacity={0.3}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 分析結果テーブル */}
              {(() => {
                const totalPages = Math.ceil(resultRows.length / pageSize);
                const paginatedRows = resultRows.slice((page - 1) * pageSize, page * pageSize);
                return (
                  <div className="card overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                          分析結果（全{resultRows.length}件）
                        </h3>
                        {axes.length > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            分析軸: {axes.join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 dark:text-gray-400">表示件数:</label>
                        <select
                          value={pageSize}
                          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                          className="text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1"
                        >
                          {[10, 20, 50, 100].map((n) => (
                            <option key={n} value={n}>{n}件</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800/50">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-12">
                              #
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                              テキスト
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-32">
                              ラベル
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-32">
                              スコア
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                          {paginatedRows.map((row, idx) => {
                            const primaryLabel = row.labels[0] ?? "-";
                            const primaryScore =
                              Object.values(row.scores)[0] ?? 0;
                            const preview = textPreviews[row.id] ?? row.id.slice(0, 12) + "…";
                            return (
                              <tr
                                key={row.id}
                                className="hover:bg-gray-50 dark:hover:bg-gray-800/30"
                              >
                                <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                                  {(page - 1) * pageSize + idx + 1}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs">
                                  <span className="line-clamp-2" title={preview}>{preview}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={getLabelBadgeClass(primaryLabel)}>
                                    {primaryLabel}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span
                                    className={`text-sm font-mono font-medium ${
                                      primaryScore > 0.5
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : primaryScore < 0.3
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-gray-600 dark:text-gray-400"
                                    }`}
                                  >
                                    {primaryScore.toFixed(2)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* ページネーション */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {(page - 1) * pageSize + 1}〜{Math.min(page * pageSize, resultRows.length)}件 / 全{resultRows.length}件
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page === 1}
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 7) {
                              pageNum = i + 1;
                            } else if (page <= 4) {
                              pageNum = i + 1;
                            } else if (page >= totalPages - 3) {
                              pageNum = totalPages - 6 + i;
                            } else {
                              pageNum = page - 3 + i;
                            }
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setPage(pageNum)}
                                className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${
                                  page === pageNum
                                    ? "bg-nexus-500 text-white"
                                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => setPage(Math.min(totalPages, page + 1))}
                            disabled={page === totalPages}
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
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
