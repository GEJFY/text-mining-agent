import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Play,
  Loader2,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { useAnalysisStore } from "../stores/analysisStore";
import { contradictionApi } from "../api/client";
import DatasetGuard from "../components/DatasetGuard";

/**
 * 矛盾検出ページ
 * テキストデータ内の矛盾する記述ペアをLLMで検出
 */

interface ContradictionItem {
  statementA: string;
  statementB: string;
  indexA: number;
  indexB: number;
  contradictionType: string;
  confidence: number;
}

const TYPE_COLORS: Record<string, string> = {
  direct: "#ef4444",
  implicit: "#f59e0b",
  temporal: "#3b82f6",
};

const TYPE_LABELS: Record<string, string> = {
  direct: "直接的矛盾",
  implicit: "暗黙的矛盾",
  temporal: "時間的矛盾",
};

const SENSITIVITY_OPTIONS = [
  { value: "low", label: "低", description: "明確な矛盾のみ検出" },
  { value: "medium", label: "中", description: "一般的な矛盾を検出" },
  { value: "high", label: "高", description: "微妙な矛盾も検出" },
];

function ContradictionPage() {
  const { activeDatasetId } = useAnalysisStore();
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // パラメータ
  const [sensitivity, setSensitivity] = useState("medium");

  // 結果
  const [contradictions, setContradictions] = useState<ContradictionItem[]>([]);

  const handleRun = async () => {
    if (!activeDatasetId) return;
    setIsRunning(true);
    setError(null);

    try {
      const response = await contradictionApi.run(activeDatasetId, {
        sensitivity,
      });

      const data = response.data;
      const mapped: ContradictionItem[] = (
        data.contradictions as Array<{
          statement_a: string;
          statement_b: string;
          index_a: number;
          index_b: number;
          contradiction_type: string;
          confidence: number;
        }>
      ).map((c) => ({
        statementA: c.statement_a,
        statementB: c.statement_b,
        indexA: c.index_a,
        indexB: c.index_b,
        contradictionType: c.contradiction_type,
        confidence: c.confidence,
      }));

      setContradictions(mapped);
      setHasResults(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "矛盾検出に失敗しました";
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  // タイプ別分布データ
  const typeCounts = contradictions.reduce<Record<string, number>>(
    (acc, c) => {
      acc[c.contradictionType] = (acc[c.contradictionType] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const pieData = Object.entries(typeCounts).map(([type, count]) => ({
    name: TYPE_LABELS[type] ?? type,
    value: count,
    color: TYPE_COLORS[type] ?? "#6366f1",
  }));

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
          {/* 左パネル: パラメータ */}
          <div className="lg:col-span-1 space-y-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <AlertTriangle size={16} />
                検出設定
              </h3>

              <div className="space-y-2">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                  検出感度
                </label>
                {SENSITIVITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`
                      flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors
                      ${
                        sensitivity === opt.value
                          ? "border-nexus-500 bg-nexus-50 dark:bg-nexus-950"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="sensitivity"
                      value={opt.value}
                      checked={sensitivity === opt.value}
                      onChange={() => setSensitivity(opt.value)}
                      className="mt-0.5 accent-nexus-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {opt.label}
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {opt.description}
                      </p>
                    </div>
                  </label>
                ))}
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
                    検出実行中...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    矛盾検出を実行
                  </>
                )}
              </button>
            </div>

            {/* サマリー */}
            {hasResults && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  検出結果サマリー
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">
                      検出矛盾数
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {contradictions.length}
                    </span>
                  </div>
                  {Object.entries(typeCounts).map(([type, count]) => (
                    <div key={type} className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{
                            backgroundColor: TYPE_COLORS[type] ?? "#6366f1",
                          }}
                        />
                        {TYPE_LABELS[type] ?? type}
                      </span>
                      <span className="text-gray-900 dark:text-white">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右パネル: 結果 */}
          <div className="lg:col-span-2 space-y-4">
            {hasResults ? (
              <>
                {/* タイプ分布ドーナツチャート */}
                {pieData.length > 0 && (
                  <div className="card p-6">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                      矛盾タイプ分布
                    </h3>
                    <div className="flex items-center gap-8">
                      <ResponsiveContainer width="50%" height={200}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#1f2937",
                              border: "none",
                              borderRadius: "8px",
                              color: "#f3f4f6",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2">
                        {pieData.map((item) => (
                          <div
                            key={item.name}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-gray-600 dark:text-gray-400">
                              {item.name}
                            </span>
                            <span className="font-semibold text-gray-900 dark:text-white ml-auto">
                              {item.value}件
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 矛盾ペアカード */}
                <div className="space-y-3">
                  {contradictions.map((item, idx) => (
                    <div key={idx} className="card p-5">
                      {/* タイプバッジ + 信頼度 */}
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium text-white"
                          style={{
                            backgroundColor:
                              TYPE_COLORS[item.contradictionType] ?? "#6366f1",
                          }}
                        >
                          {TYPE_LABELS[item.contradictionType] ??
                            item.contradictionType}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                          信頼度: {(item.confidence * 100).toFixed(0)}%
                        </span>
                      </div>

                      {/* 対比表示 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                          <p className="text-xs text-red-500 dark:text-red-400 mb-1 font-medium">
                            記述A (#{item.indexA})
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {item.statementA}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                          <p className="text-xs text-amber-500 dark:text-amber-400 mb-1 font-medium">
                            記述B (#{item.indexB})
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {item.statementB}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="card p-16 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <AlertTriangle size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-medium">
                  矛盾検出を実行してください
                </p>
                <p className="text-sm mt-1">
                  テキストデータ内の矛盾する記述ペアを自動検出します
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DatasetGuard>
  );
}

export default ContradictionPage;
