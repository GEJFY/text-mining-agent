import { useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Play,
  Settings,
  Tag,
  AlertTriangle,
  Loader2,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { useAnalysisStore } from "../stores/analysisStore";
import type { ClusterAlgorithm } from "../stores/analysisStore";
import { clusterApi } from "../api/client";
import DatasetGuard from "../components/DatasetGuard";

/**
 * クラスタ分析ページ
 * UMAP散布図、アルゴリズム選択、パラメータスライダー、クラスタラベル、外れ値リスト
 * バックエンドAPI経由で実データを分析
 */

// クラスタカラー定義
const CLUSTER_COLORS = [
  "#6366f1", // インディゴ
  "#8b5cf6", // バイオレット
  "#ec4899", // ピンク
  "#f59e0b", // アンバー
  "#10b981", // エメラルド
  "#3b82f6", // ブルー
  "#ef4444", // レッド
  "#14b8a6", // ティール
  "#f97316", // オレンジ
  "#84cc16", // ライム
];

// アルゴリズム定義
const ALGORITHMS: Array<{
  value: ClusterAlgorithm;
  label: string;
  description: string;
}> = [
  {
    value: "kmeans",
    label: "K-Means",
    description: "クラスタ数を指定する標準的な手法",
  },
  {
    value: "hdbscan",
    label: "HDBSCAN",
    description: "密度ベースのクラスタリング（クラスタ数自動決定）",
  },
  {
    value: "gmm",
    label: "GMM",
    description: "ガウス混合モデルによる確率的クラスタリング",
  },
];

/** 散布図用データポイント */
interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  clusterId: number;
  isOutlier: boolean;
}

/** クラスタ情報 */
interface ClusterInfo {
  id: number;
  label: string;
  size: number;
  keywords: string[];
  coherenceScore: number;
}

/** 外れ値情報 */
interface OutlierInfo {
  id: string;
  x: number;
  y: number;
  text?: string;
}

function ClusterPage() {
  const { clusterParams, setClusterParams, activeDatasetId } =
    useAnalysisStore();
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // API結果を保持するローカルステート
  const [points, setPoints] = useState<ScatterPoint[]>([]);
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [outlierList, setOutlierList] = useState<OutlierInfo[]>([]);
  const [silhouetteScore, setSilhouetteScore] = useState<number>(0);

  // クラスタリング実行
  const handleRunClustering = async () => {
    if (!activeDatasetId) return;

    setIsRunning(true);
    setError(null);
    setSelectedCluster(null);

    try {
      const response = await clusterApi.run(activeDatasetId, {
        algorithm: clusterParams.algorithm,
        n_clusters:
          clusterParams.algorithm !== "hdbscan"
            ? clusterParams.nClusters
            : undefined,
        min_cluster_size:
          clusterParams.algorithm === "hdbscan"
            ? clusterParams.minClusterSize
            : undefined,
        epsilon: clusterParams.epsilon,
      });

      const data = response.data;

      // UMAP座標 + クラスタ割当 → 散布図ポイント
      const mappedPoints: ScatterPoint[] = (
        data.umap_coordinates as number[][]
      ).map((coord: number[], i: number) => ({
        id: `pt-${i}`,
        x: coord[0],
        y: coord[1],
        clusterId: (data.cluster_assignments as number[])[i],
        isOutlier: (data.cluster_assignments as number[])[i] === -1,
      }));
      setPoints(mappedPoints);

      // クラスタ情報マッピング
      const mappedClusters: ClusterInfo[] = (
        data.clusters as Array<{
          cluster_id: number;
          title: string;
          keywords: string[];
          size: number;
        }>
      ).map((c) => ({
        id: c.cluster_id,
        label: c.title,
        size: c.size,
        keywords: c.keywords,
        coherenceScore: data.silhouette_score as number,
      }));
      setClusters(mappedClusters);

      // 外れ値リスト
      const mappedOutliers: OutlierInfo[] = mappedPoints
        .filter((p) => p.isOutlier)
        .map((p) => ({
          id: p.id,
          x: p.x,
          y: p.y,
        }));
      setOutlierList(mappedOutliers);

      setSilhouetteScore(data.silhouette_score as number);
      setHasResults(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "クラスタリング分析に失敗しました";
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  // 散布図のフィルタリング
  const filteredPoints =
    selectedCluster !== null
      ? points.filter(
          (p) => p.clusterId === selectedCluster || p.isOutlier,
        )
      : points;

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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ========================================
            左パネル: パラメータ設定
            ======================================== */}
        <div className="lg:col-span-1 space-y-4">
          {/* アルゴリズム選択 */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Settings size={16} />
              アルゴリズム設定
            </h3>

            <div className="space-y-2">
              {ALGORITHMS.map((algo) => (
                <label
                  key={algo.value}
                  className={`
                    flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors
                    ${
                      clusterParams.algorithm === algo.value
                        ? "border-nexus-500 bg-nexus-50 dark:bg-nexus-950"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="algorithm"
                    value={algo.value}
                    checked={clusterParams.algorithm === algo.value}
                    onChange={() =>
                      setClusterParams({ algorithm: algo.value })
                    }
                    className="mt-0.5 accent-nexus-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {algo.label}
                    </span>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {algo.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* パラメータスライダー */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              パラメータ調整
            </h3>

            <div className="space-y-4">
              {/* クラスタ数 */}
              {(clusterParams.algorithm === "kmeans" ||
                clusterParams.algorithm === "gmm") && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">
                      クラスタ数
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {clusterParams.nClusters}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={20}
                    value={clusterParams.nClusters}
                    onChange={(e) =>
                      setClusterParams({
                        nClusters: Number(e.target.value),
                      })
                    }
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-nexus-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>2</span>
                    <span>20</span>
                  </div>
                </div>
              )}

              {/* 最小クラスタサイズ (HDBSCAN) */}
              {clusterParams.algorithm === "hdbscan" && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">
                      最小クラスタサイズ
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {clusterParams.minClusterSize}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={50}
                    value={clusterParams.minClusterSize}
                    onChange={(e) =>
                      setClusterParams({
                        minClusterSize: Number(e.target.value),
                      })
                    }
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-nexus-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>2</span>
                    <span>50</span>
                  </div>
                </div>
              )}

              {/* Epsilon */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">
                    Epsilon (距離閾値)
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {clusterParams.epsilon.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={clusterParams.epsilon * 100}
                  onChange={(e) =>
                    setClusterParams({
                      epsilon: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-nexus-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>0.00</span>
                  <span>2.00</span>
                </div>
              </div>
            </div>

            {/* 実行ボタン */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={handleRunClustering}
                disabled={isRunning}
                className="btn-primary flex-1"
              >
                {isRunning ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    実行中...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    分析実行
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setClusterParams({
                    algorithm: "kmeans",
                    nClusters: 5,
                    minClusterSize: 10,
                    epsilon: 0.5,
                  });
                }}
                className="btn-ghost"
                title="パラメータをリセット"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>

          {/* シルエットスコア */}
          {hasResults && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                分析品質
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  シルエットスコア
                </span>
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-nexus-500"
                    style={{
                      width: `${Math.max(0, (silhouetteScore + 1) / 2) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">
                  {silhouetteScore.toFixed(3)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ========================================
            右パネル: 結果表示
            ======================================== */}
        <div className="lg:col-span-3 space-y-4">
          {/* UMAP散布図 */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                UMAP クラスタ散布図
              </h3>
              {selectedCluster !== null && (
                <button
                  onClick={() => setSelectedCluster(null)}
                  className="btn-ghost text-sm"
                >
                  全クラスタ表示
                </button>
              )}
            </div>

            {hasResults ? (
              <ResponsiveContainer width="100%" height={420}>
                <ScatterChart
                  margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e5e7eb"
                    className="dark:stroke-gray-700"
                  />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="UMAP-1"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    label={{
                      value: "UMAP-1",
                      position: "bottom",
                      fill: "#9ca3af",
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="UMAP-2"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    label={{
                      value: "UMAP-2",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#9ca3af",
                    }}
                  />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null;
                      const data = payload[0].payload as ScatterPoint;
                      const cluster = clusters.find(
                        (c) => c.id === data.clusterId,
                      );
                      return (
                        <div className="bg-gray-900 text-white p-3 rounded-lg shadow-lg text-sm max-w-xs">
                          <p className="font-medium">
                            {data.isOutlier
                              ? "外れ値"
                              : cluster?.label ??
                                `クラスタ ${data.clusterId}`}
                          </p>
                          <p className="text-gray-300 mt-1 text-xs">
                            ({data.x.toFixed(2)}, {data.y.toFixed(2)})
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={filteredPoints}>
                    {filteredPoints.map((point, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          point.isOutlier
                            ? "#6b7280"
                            : CLUSTER_COLORS[
                                point.clusterId % CLUSTER_COLORS.length
                              ]
                        }
                        opacity={point.isOutlier ? 0.4 : 0.7}
                        r={point.isOutlier ? 3 : 5}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-80 text-gray-400 dark:text-gray-500">
                <Settings size={48} className="mb-4 opacity-50" />
                <p className="text-lg font-medium">分析を実行してください</p>
                <p className="text-sm mt-1">
                  左パネルでパラメータを設定し、分析実行ボタンを押してください
                </p>
              </div>
            )}
          </div>

          {/* クラスタラベル一覧 */}
          {hasResults && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {clusters.map((cluster) => (
                <button
                  key={cluster.id}
                  onClick={() =>
                    setSelectedCluster(
                      selectedCluster === cluster.id ? null : cluster.id,
                    )
                  }
                  className={`
                    card p-4 text-left transition-all duration-200
                    ${
                      selectedCluster === cluster.id
                        ? "ring-2 ring-nexus-500 shadow-md"
                        : "hover:shadow-md"
                    }
                  `}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          CLUSTER_COLORS[
                            cluster.id % CLUSTER_COLORS.length
                          ],
                      }}
                    />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {cluster.label}
                    </span>
                    <span className="ml-auto text-xs text-gray-400">
                      {cluster.size}件
                    </span>
                  </div>

                  {/* キーワード */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {cluster.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      >
                        <Tag size={10} />
                        {kw}
                      </span>
                    ))}
                  </div>

                  {/* コヒーレンススコア */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-nexus-500"
                        style={{
                          width: `${Math.max(0, (cluster.coherenceScore + 1) / 2) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {cluster.coherenceScore.toFixed(3)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 外れ値リスト */}
          {hasResults && outlierList.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                外れ値一覧（{outlierList.length}件）
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {outlierList.map((outlier) => (
                  <div
                    key={outlier.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm"
                  >
                    <span className="text-gray-400 dark:text-gray-500 font-mono text-xs flex-shrink-0">
                      {outlier.id}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      ({outlier.x.toFixed(1)}, {outlier.y.toFixed(1)})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </DatasetGuard>
  );
}

export default ClusterPage;
