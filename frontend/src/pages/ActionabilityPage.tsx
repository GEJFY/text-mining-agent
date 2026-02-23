import { useState, useEffect } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Play, Loader2, AlertCircle, Target } from "lucide-react";
import { useAnalysisStore } from "../stores/analysisStore";
import { actionabilityApi } from "../api/client";
import DatasetGuard from "../components/DatasetGuard";
import InfoTooltip from "../components/InfoTooltip";
import AnalysisProgress, { ANALYSIS_STEPS } from "../components/AnalysisProgress";
import AttributeFilter from "../components/AttributeFilter";
import type { Filters } from "../components/AttributeFilter";

/**
 * アクショナビリティスコアリングページ
 * テキストの具体性・緊急度・対応可能性・ビジネスインパクトを5次元評価
 */

interface ActionabilityItem {
  index: number;
  specificity: number;
  urgency: number;
  feasibility: number;
  impact: number;
  overall: number;
  category: string;
  suggestedActions: string[];
}

const CATEGORY_COLORS: Record<string, string> = {
  immediate: "#ef4444",
  short_term: "#f59e0b",
  long_term: "#3b82f6",
  informational: "#9ca3af",
};

const CATEGORY_LABELS: Record<string, string> = {
  immediate: "即時対応",
  short_term: "短期対応",
  long_term: "長期対応",
  informational: "参考情報",
};

const CATEGORY_ORDER = ["immediate", "short_term", "long_term", "informational"];

function ActionabilityPage() {
  const { activeDatasetId, setCachedResult, getCachedResult } = useAnalysisStore();
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // パラメータ
  const [context, setContext] = useState("");

  // 結果
  const [items, setItems] = useState<ActionabilityItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [attrFilters, setAttrFilters] = useState<Filters>({});

  // キャッシュ復元
  useEffect(() => {
    const cached = getCachedResult("actionability");
    if (cached?.hasResults) {
      setItems(cached.data.items ?? []);
      setHasResults(true);
    }
  }, [getCachedResult]);

  const handleRun = async () => {
    if (!activeDatasetId) return;
    setIsRunning(true);
    setError(null);

    try {
      const response = await actionabilityApi.run(activeDatasetId, {
        context: context || undefined,
        filters: Object.keys(attrFilters).length > 0 ? attrFilters : undefined,
      });

      const data = response.data;
      const mapped: ActionabilityItem[] = (
        data.items as Array<{
          index: number;
          specificity: number;
          urgency: number;
          feasibility: number;
          impact: number;
          overall: number;
          category: string;
          suggested_actions: string[];
        }>
      ).map((item) => ({
        index: item.index,
        specificity: item.specificity,
        urgency: item.urgency,
        feasibility: item.feasibility,
        impact: item.impact,
        overall: item.overall,
        category: item.category,
        suggestedActions: item.suggested_actions,
      }));

      setItems(mapped);
      setHasResults(true);
      setActiveCategory(null);
      setCachedResult("actionability", { data: { items: mapped }, hasResults: true });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "アクショナビリティ分析に失敗しました";
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  // カテゴリ別分布
  const categoryCounts = CATEGORY_ORDER.map((cat) => ({
    name: CATEGORY_LABELS[cat] ?? cat,
    value: items.filter((i) => i.category === cat).length,
    color: CATEGORY_COLORS[cat] ?? "#6366f1",
    key: cat,
  }));

  // フィルタ済みアイテム
  const filteredItems = activeCategory
    ? items.filter((i) => i.category === activeCategory)
    : items;

  // 選択アイテムのレーダーデータ（平均値）
  const radarData =
    filteredItems.length > 0
      ? [
          {
            dimension: "具体性",
            value:
              filteredItems.reduce((s, i) => s + i.specificity, 0) /
              filteredItems.length,
          },
          {
            dimension: "緊急度",
            value:
              filteredItems.reduce((s, i) => s + i.urgency, 0) /
              filteredItems.length,
          },
          {
            dimension: "対応可能性",
            value:
              filteredItems.reduce((s, i) => s + i.feasibility, 0) /
              filteredItems.length,
          },
          {
            dimension: "インパクト",
            value:
              filteredItems.reduce((s, i) => s + i.impact, 0) /
              filteredItems.length,
          },
          {
            dimension: "総合",
            value:
              filteredItems.reduce((s, i) => s + i.overall, 0) /
              filteredItems.length,
          },
        ]
      : [];

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
          {/* 左パネル */}
          <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Target size={16} />
                分析設定
              </h3>

              {/* ビジネスコンテキスト */}
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                  ビジネスコンテキスト（任意）
                  <InfoTooltip title="ビジネスコンテキスト" text="分析対象の業界や目的を記述すると、LLMがその文脈に基づいて具体性・緊急度・実現可能性・インパクトの5次元をより適切に評価します。例：「SaaS企業の顧客フィードバック」「製造業の品質クレーム」など。空欄でも一般的な基準で評価しますが、コンテキストを指定するとより実用的な結果が得られます。" />
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  className="input-field text-sm min-h-[80px] resize-y"
                  placeholder="例: SaaS企業のカスタマーサポート改善を目的とした顧客フィードバック分析"
                />
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
                    アクショナビリティ分析
                  </>
                )}
              </button>
            </div>

            {/* 進捗タイムライン */}
            <AnalysisProgress steps={ANALYSIS_STEPS.actionability} isRunning={isRunning} />

            {/* 属性フィルタ */}
            <AttributeFilter datasetId={activeDatasetId} filters={attrFilters} onChange={setAttrFilters} />

            {/* カテゴリフィルタ */}
            {hasResults && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  カテゴリフィルタ
                </h3>
                <div className="space-y-1">
                  <button
                    onClick={() => setActiveCategory(null)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeCategory === null
                        ? "bg-nexus-50 dark:bg-nexus-950 text-nexus-700 dark:text-nexus-300 font-medium"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    すべて ({items.length})
                  </button>
                  {categoryCounts.map((cat) => (
                    <button
                      key={cat.key}
                      onClick={() => setActiveCategory(cat.key)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                        activeCategory === cat.key
                          ? "bg-nexus-50 dark:bg-nexus-950 text-nexus-700 dark:text-nexus-300 font-medium"
                          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.name} ({cat.value})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右パネル */}
          <div className="lg:col-span-2 space-y-4">
            {hasResults ? (
              <>
                {/* チャートエリア */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* レーダーチャート */}
                  {radarData.length > 0 && (
                    <div className="card p-6">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                        5次元評価（平均）
                      </h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <RadarChart data={radarData}>
                          <PolarGrid stroke="#e5e7eb" />
                          <PolarAngleAxis
                            dataKey="dimension"
                            tick={{ fill: "#9ca3af", fontSize: 11 }}
                          />
                          <PolarRadiusAxis
                            domain={[0, 1]}
                            tick={{ fill: "#9ca3af", fontSize: 10 }}
                            tickFormatter={(v: number) => v.toFixed(1)}
                          />
                          <Radar
                            dataKey="value"
                            stroke="var(--color-nexus-500)"
                            fill="var(--color-nexus-500)"
                            fillOpacity={0.3}
                            strokeWidth={2}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* カテゴリ分布 */}
                  <div className="card p-6">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                      カテゴリ分布
                    </h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={categoryCounts}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                          className="dark:stroke-gray-700"
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: "#9ca3af", fontSize: 11 }}
                        />
                        <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1f2937",
                            border: "none",
                            borderRadius: "8px",
                            color: "#f3f4f6",
                          }}
                        />
                        <Bar dataKey="value" name="件数" radius={[4, 4, 0, 0]}>
                          {categoryCounts.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* スコアリング方法論 */}
                <details className="card p-4">
                  <summary className="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer">
                    スコアリング方法論
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 pr-4 text-gray-500">評価次元</th>
                          <th className="text-center py-2 px-2 text-gray-500">0.0</th>
                          <th className="text-center py-2 px-2 text-gray-500">0.5</th>
                          <th className="text-center py-2 px-2 text-gray-500">1.0</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-600 dark:text-gray-400">
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 pr-4 font-medium">具体性</td>
                          <td className="py-2 px-2 text-center">抽象的</td>
                          <td className="py-2 px-2 text-center">一般的</td>
                          <td className="py-2 px-2 text-center">非常に具体的</td>
                        </tr>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 pr-4 font-medium">緊急度</td>
                          <td className="py-2 px-2 text-center">低い</td>
                          <td className="py-2 px-2 text-center">中程度</td>
                          <td className="py-2 px-2 text-center">即時対応必要</td>
                        </tr>
                        <tr className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 pr-4 font-medium">実現可能性</td>
                          <td className="py-2 px-2 text-center">困難</td>
                          <td className="py-2 px-2 text-center">対応可能</td>
                          <td className="py-2 px-2 text-center">容易に実行可能</td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-4 font-medium">インパクト</td>
                          <td className="py-2 px-2 text-center">限定的</td>
                          <td className="py-2 px-2 text-center">中程度</td>
                          <td className="py-2 px-2 text-center">大きな影響</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>

                {/* スコアカード一覧 */}
                <div className="space-y-3">
                  {filteredItems
                    .sort((a, b) => b.overall - a.overall)
                    .map((item, idx) => (
                      <div key={idx} className="card p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium text-white"
                            style={{
                              backgroundColor:
                                CATEGORY_COLORS[item.category] ?? "#6366f1",
                            }}
                          >
                            {CATEGORY_LABELS[item.category] ?? item.category}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            テキスト #{item.index}
                          </span>
                          <span className="ml-auto text-sm font-semibold text-gray-900 dark:text-white">
                            総合: {(item.overall * 100).toFixed(0)}%
                          </span>
                        </div>

                        {/* スコアバー */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          {[
                            {
                              label: "具体性",
                              value: item.specificity,
                              color: "#6366f1",
                            },
                            {
                              label: "緊急度",
                              value: item.urgency,
                              color: "#ef4444",
                            },
                            {
                              label: "実現可能性",
                              value: item.feasibility,
                              color: "#10b981",
                            },
                            {
                              label: "インパクト",
                              value: item.impact,
                              color: "#f59e0b",
                            },
                          ].map((dim) => (
                            <div key={dim.label}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-500 dark:text-gray-400">
                                  {dim.label}
                                </span>
                                <span className="font-mono text-gray-900 dark:text-white">
                                  {(dim.value * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${dim.value * 100}%`,
                                    backgroundColor: dim.color,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* 推奨アクション */}
                        {item.suggestedActions.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.suggestedActions.map((action, aIdx) => (
                              <span
                                key={aIdx}
                                className="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                              >
                                {action}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <div className="card p-16 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <Target size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-medium">
                  アクショナビリティ分析を実行してください
                </p>
                <p className="text-sm mt-1">
                  テキストの実行可能性を5次元で評価し、優先度を判定します
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DatasetGuard>
  );
}

export default ActionabilityPage;
