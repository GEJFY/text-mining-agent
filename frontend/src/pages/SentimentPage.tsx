import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
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
  TrendingDown,
} from "lucide-react";

/**
 * センチメント分析ページ
 * センチメント軸設定、コスト見積もり、時系列チャート、スパイクマーカー
 */

// サンプル時系列データ
const timeSeriesData = [
  { date: "2024-01", avgScore: 0.35, count: 180, label: "1月" },
  { date: "2024-02", avgScore: 0.28, count: 210, label: "2月" },
  { date: "2024-03", avgScore: 0.42, count: 195, label: "3月" },
  { date: "2024-04", avgScore: -0.15, count: 250, label: "4月" },
  { date: "2024-05", avgScore: 0.55, count: 220, label: "5月" },
  { date: "2024-06", avgScore: 0.48, count: 190, label: "6月" },
  { date: "2024-07", avgScore: 0.12, count: 230, label: "7月" },
  { date: "2024-08", avgScore: -0.25, count: 270, label: "8月" },
  { date: "2024-09", avgScore: 0.38, count: 200, label: "9月" },
  { date: "2024-10", avgScore: 0.62, count: 185, label: "10月" },
  { date: "2024-11", avgScore: 0.45, count: 215, label: "11月" },
  { date: "2024-12", avgScore: 0.52, count: 240, label: "12月" },
];

// サンプルスパイク
const spikePoints = [
  {
    date: "2024-04",
    avgScore: -0.15,
    description: "大規模サービス障害発生。SNSでネガティブ反応急増",
  },
  {
    date: "2024-08",
    avgScore: -0.25,
    description: "価格改定発表に対する不満が多数発生",
  },
  {
    date: "2024-10",
    avgScore: 0.62,
    description: "新機能リリースに対する好評価が急増",
  },
];

// サンプルセンチメント分布
const sentimentDistribution = [
  { label: "非常にポジティブ", count: 320, color: "#059669" },
  { label: "ポジティブ", count: 580, color: "#34d399" },
  { label: "ニュートラル", count: 450, color: "#9ca3af" },
  { label: "ネガティブ", count: 280, color: "#f87171" },
  { label: "非常にネガティブ", count: 120, color: "#dc2626" },
];

// サンプルセンチメント結果
const sampleResults = [
  {
    id: "s1",
    text: "新しいアップデートで使いやすさが大幅に向上しました！素晴らしい改善です。",
    score: 0.89,
    label: "positive" as const,
    confidence: 0.94,
  },
  {
    id: "s2",
    text: "カスタマーサポートの対応が遅く、問題が解決しませんでした。",
    score: -0.72,
    label: "negative" as const,
    confidence: 0.88,
  },
  {
    id: "s3",
    text: "機能は普通です。特に良くも悪くもない印象です。",
    score: 0.05,
    label: "neutral" as const,
    confidence: 0.76,
  },
  {
    id: "s4",
    text: "配送が予想より早く届いて嬉しかったです。梱包も丁寧でした。",
    score: 0.78,
    label: "positive" as const,
    confidence: 0.91,
  },
  {
    id: "s5",
    text: "アプリが頻繁にクラッシュします。早急な修正を求めます。",
    score: -0.85,
    label: "negative" as const,
    confidence: 0.96,
  },
];

/** カスタム軸 */
interface CustomAxis {
  name: string;
  positive: string;
  negative: string;
}

function SentimentPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(true);
  const [positiveLabel, setPositiveLabel] = useState("ポジティブ");
  const [negativeLabel, setNegativeLabel] = useState("ネガティブ");
  const [customAxes, setCustomAxes] = useState<CustomAxis[]>([]);
  const [estimatedCost, setEstimatedCost] = useState(12.50);
  const [estimatedTime, setEstimatedTime] = useState("約3分");
  const [showCostWarning, setShowCostWarning] = useState(false);

  // カスタム軸を追加
  const addCustomAxis = () => {
    setCustomAxes([
      ...customAxes,
      { name: "", positive: "", negative: "" },
    ]);
  };

  // カスタム軸を削除
  const removeCustomAxis = (index: number) => {
    setCustomAxes(customAxes.filter((_, i) => i !== index));
  };

  // カスタム軸を更新
  const updateCustomAxis = (
    index: number,
    field: keyof CustomAxis,
    value: string
  ) => {
    setCustomAxes(
      customAxes.map((axis, i) =>
        i === index ? { ...axis, [field]: value } : axis
      )
    );
  };

  // 分析実行
  const handleRun = () => {
    if (estimatedCost > 10 && !showCostWarning) {
      setShowCostWarning(true);
      return;
    }
    setShowCostWarning(false);
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setHasResults(true);
    }, 2500);
  };

  // コスト見積もり
  const handleEstimate = () => {
    const baseCost = 8.0;
    const axisCost = customAxes.length * 2.5;
    setEstimatedCost(baseCost + axisCost);
    setEstimatedTime(
      customAxes.length > 2 ? "約8分" : customAxes.length > 0 ? "約5分" : "約3分"
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
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
              className="btn-secondary w-full mb-3 text-sm"
            >
              見積もりを計算
            </button>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">
                  推定コスト:
                </span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  ${estimatedCost.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">
                  推定処理時間:
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {estimatedTime}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">
                  分析軸数:
                </span>
                <span className="text-gray-900 dark:text-white">
                  {1 + customAxes.length}
                </span>
              </div>
            </div>

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
              <div className="card p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                  センチメントスコア推移
                </h3>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={timeSeriesData}>
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
                    {/* スパイクマーカー */}
                    {spikePoints.map((spike, idx) => (
                      <ReferenceDot
                        key={idx}
                        x={
                          timeSeriesData.find(
                            (d) => d.date === spike.date
                          )?.label
                        }
                        y={spike.avgScore}
                        r={8}
                        fill={spike.avgScore > 0 ? "#10b981" : "#ef4444"}
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>

                {/* スパイク説明 */}
                <div className="mt-4 space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    検出スパイク
                  </h4>
                  {spikePoints.map((spike, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="mt-0.5">
                        {spike.avgScore > 0 ? (
                          <TrendingUp
                            size={16}
                            className="text-emerald-500"
                          />
                        ) : (
                          <TrendingDown
                            size={16}
                            className="text-red-500"
                          />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            {spike.date}
                          </span>
                          <span
                            className={`badge text-xs ${
                              spike.avgScore > 0
                                ? "badge-positive"
                                : "badge-negative"
                            }`}
                          >
                            {spike.avgScore.toFixed(2)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {spike.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* センチメント分布 */}
              <div className="card p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                  センチメント分布
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={sentimentDistribution} layout="vertical">
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
                    <Bar dataKey="count" name="件数" radius={[0, 4, 4, 0]}>
                      {sentimentDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* サンプル結果テーブル */}
              <div className="card overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    分析結果サンプル
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                          テキスト
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">
                          スコア
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">
                          ラベル
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">
                          信頼度
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {sampleResults.map((result) => (
                        <tr
                          key={result.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/30"
                        >
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-md truncate">
                            {result.text}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-sm font-mono font-medium ${
                                result.score > 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : result.score < 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-gray-600 dark:text-gray-400"
                              }`}
                            >
                              {result.score > 0 ? "+" : ""}
                              {result.score.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={
                                result.label === "positive"
                                  ? "badge-positive"
                                  : result.label === "negative"
                                    ? "badge-negative"
                                    : "badge-neutral"
                              }
                            >
                              {result.label === "positive"
                                ? positiveLabel
                                : result.label === "negative"
                                  ? negativeLabel
                                  : "中立"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                            {(result.confidence * 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
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
  );
}

export default SentimentPage;
