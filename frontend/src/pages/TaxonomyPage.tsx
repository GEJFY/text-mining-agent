import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Play,
  Loader2,
  AlertCircle,
  FolderTree,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAnalysisStore } from "../stores/analysisStore";
import { taxonomyApi } from "../api/client";
import DatasetGuard from "../components/DatasetGuard";

/**
 * タクソノミー生成ページ
 * テキストデータからカテゴリ階層（タクソノミー）をLLMで自動生成
 */

interface TaxonomyNode {
  name: string;
  description: string;
  textCount: number;
  textIndices: number[];
  children: TaxonomyNode[];
}

// カテゴリカラー
const CATEGORY_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#14b8a6",
];

/** ツリーノードコンポーネント */
function TreeNode({
  node,
  depth,
  colorIndex,
}: {
  node: TaxonomyNode;
  depth: number;
  colorIndex: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const color = CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length];

  return (
    <div className={depth > 0 ? "ml-4 border-l border-gray-200 dark:border-gray-700 pl-3" : ""}>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={`
          w-full text-left flex items-center gap-2 py-2 px-3 rounded-lg transition-colors
          ${hasChildren ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" : "cursor-default"}
        `}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
          )
        ) : (
          <span className="w-3.5" />
        )}

        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />

        <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">
          {node.name}
        </span>

        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
          {node.textCount}件
        </span>
      </button>

      {node.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 ml-10 -mt-1 mb-1">
          {node.description}
        </p>
      )}

      {expanded &&
        hasChildren &&
        node.children.map((child, idx) => (
          <TreeNode
            key={`${child.name}-${idx}`}
            node={child}
            depth={depth + 1}
            colorIndex={depth === 0 ? idx : colorIndex}
          />
        ))}
    </div>
  );
}

function TaxonomyPage() {
  const { activeDatasetId } = useAnalysisStore();
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // パラメータ
  const [maxDepth, setMaxDepth] = useState(3);
  const [maxCategories, setMaxCategories] = useState(8);

  // 結果
  const [rootCategories, setRootCategories] = useState<TaxonomyNode[]>([]);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);

  const handleRun = async () => {
    if (!activeDatasetId) return;
    setIsRunning(true);
    setError(null);

    try {
      const response = await taxonomyApi.run(activeDatasetId, {
        max_depth: maxDepth,
        max_categories: maxCategories,
      });

      const data = response.data;

      const mapNode = (raw: Record<string, unknown>): TaxonomyNode => ({
        name: raw.name as string,
        description: (raw.description as string) ?? "",
        textCount: (raw.text_count as number) ?? 0,
        textIndices: (raw.text_indices as number[]) ?? [],
        children: ((raw.children as Array<Record<string, unknown>>) ?? []).map(
          mapNode,
        ),
      });

      const mapped = (
        data.root_categories as Array<Record<string, unknown>>
      ).map(mapNode);

      setRootCategories(mapped);
      setUncategorizedCount((data.uncategorized_count as number) ?? 0);
      setHasResults(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "タクソノミー生成に失敗しました";
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  // 棒グラフ用データ（トップレベルカテゴリ）
  const chartData = rootCategories.map((cat, idx) => ({
    name: cat.name,
    count: cat.textCount,
    color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
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
          {/* 左パネル */}
          <div className="lg:col-span-1 space-y-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <FolderTree size={16} />
                生成設定
              </h3>

              <div className="space-y-4">
                {/* 最大深度 */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">
                      最大深度
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {maxDepth}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-nexus-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>1</span>
                    <span>5</span>
                  </div>
                </div>

                {/* 最大カテゴリ数 */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">
                      最大カテゴリ数
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {maxCategories}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={15}
                    value={maxCategories}
                    onChange={(e) => setMaxCategories(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-nexus-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>3</span>
                    <span>15</span>
                  </div>
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
                    生成実行中...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    タクソノミー生成
                  </>
                )}
              </button>
            </div>

            {/* サマリー */}
            {hasResults && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  生成結果サマリー
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">
                      トップカテゴリ数
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {rootCategories.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">
                      分類済みテキスト
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {rootCategories.reduce((s, c) => s + c.textCount, 0)}件
                    </span>
                  </div>
                  {uncategorizedCount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">
                        未分類
                      </span>
                      <span className="text-amber-600 dark:text-amber-400">
                        {uncategorizedCount}件
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 右パネル */}
          <div className="lg:col-span-2 space-y-4">
            {hasResults ? (
              <>
                {/* カテゴリ分布棒グラフ */}
                {chartData.length > 0 && (
                  <div className="card p-6">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                      カテゴリ別テキスト数
                    </h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={chartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                          className="dark:stroke-gray-700"
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: "#9ca3af", fontSize: 11 }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={60}
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
                        <Bar
                          dataKey="count"
                          name="テキスト数"
                          radius={[4, 4, 0, 0]}
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* ツリービュー */}
                <div className="card p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                    カテゴリ階層
                  </h3>
                  <div className="space-y-1">
                    {rootCategories.map((cat, idx) => (
                      <TreeNode
                        key={`${cat.name}-${idx}`}
                        node={cat}
                        depth={0}
                        colorIndex={idx}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="card p-16 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                <FolderTree size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-medium">
                  タクソノミー生成を実行してください
                </p>
                <p className="text-sm mt-1">
                  テキストデータからカテゴリ階層を自動生成します
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DatasetGuard>
  );
}

export default TaxonomyPage;
