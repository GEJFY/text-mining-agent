import { useState, useEffect } from "react";
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
import InfoTooltip from "../components/InfoTooltip";
import AttributeFilter from "../components/AttributeFilter";
import type { Filters } from "../components/AttributeFilter";
import AnalysisProgress, { ANALYSIS_STEPS } from "../components/AnalysisProgress";

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
  text: string;
}

/** クラスタ情報 */
interface ClusterInfo {
  id: number;
  label: string;
  size: number;
  keywords: string[];
  coherenceScore: number;
  summary: string;
  centroidTexts: string[];
}

/** 外れ値情報 */
interface OutlierInfo {
  id: string;
  index: number;
  x: number;
  y: number;
  text: string;
  clusterId: number;
  distance: number;
}

function ClusterPage() {
  const { clusterParams, setClusterParams, activeDatasetId, setCachedResult, getCachedResult } =
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
  const [attrFilters, setAttrFilters] = useState<Filters>({});

  // キャッシュ復元
  useEffect(() => {
    const cached = getCachedResult("cluster");
    if (cached?.hasResults) {
      const d = cached.data;
      setPoints(d.points ?? []);
      setClusters(d.clusters ?? []);
      setOutlierList(d.outlierList ?? []);
      setSilhouetteScore(d.silhouetteScore ?? 0);
      setHasResults(true);
    }
  }, [getCachedResult]);

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
        filters: Object.keys(attrFilters).length > 0 ? attrFilters : undefined,
      });

      const data = response.data;

      // UMAP座標 + クラスタ割当 + テキスト → 散布図ポイント
      const pointTexts = (data.point_texts as string[]) || [];
      const mappedPoints: ScatterPoint[] = (
        data.umap_coordinates as number[][]
      ).map((coord: number[], i: number) => ({
        id: `pt-${i}`,
        x: coord[0],
        y: coord[1],
        clusterId: (data.cluster_assignments as number[])[i],
        isOutlier: (data.cluster_assignments as number[])[i] === -1,
        text: pointTexts[i] || "",
      }));
      setPoints(mappedPoints);

      // HDBSCANノイズ率が高い場合に警告
      const noiseCount = mappedPoints.filter(p => p.isOutlier).length;
      const noiseRatio = mappedPoints.length > 0 ? noiseCount / mappedPoints.length : 0;
      if (noiseRatio > 0.5) {
        setError(
          `警告: データの${(noiseRatio * 100).toFixed(0)}%がノイズ点（灰色）に分類されました。` +
          `「最小クラスタサイズ」パラメータを小さくして再実行してください。`
        );
      }

      // クラスタ情報マッピング
      const mappedClusters: ClusterInfo[] = (
        data.clusters as Array<{
          cluster_id: number;
          title: string;
          keywords: string[];
          size: number;
          summary: string;
          centroid_texts: string[];
        }>
      ).map((c) => ({
        id: c.cluster_id,
        label: c.title,
        size: c.size,
        keywords: c.keywords,
        coherenceScore: data.silhouette_score as number,
        summary: c.summary || "",
        centroidTexts: c.centroid_texts || [],
      }));
      setClusters(mappedClusters);

      // 外れ値リスト（バックエンドのセントロイド距離ベース上位外れ値）
      const rawOutliers = (data.outliers as Array<{
        index: number;
        text: string;
        cluster_id: number;
        distance: number;
      }>) || [];
      const umapCoords = data.umap_coordinates as number[][];
      const mappedOutliers: OutlierInfo[] = rawOutliers.map((o) => ({
        id: `outlier-${o.index}`,
        index: o.index,
        x: umapCoords[o.index]?.[0] ?? 0,
        y: umapCoords[o.index]?.[1] ?? 0,
        text: o.text,
        clusterId: o.cluster_id,
        distance: o.distance,
      }));
      setOutlierList(mappedOutliers);

      const score = data.silhouette_score as number;
      setSilhouetteScore(score);
      setHasResults(true);
      setCachedResult("cluster", {
        data: { points: mappedPoints, clusters: mappedClusters, outlierList: mappedOutliers, silhouetteScore: score },
        hasResults: true,
      });
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
                    <span className="text-sm font-medium text-gray-900 dark:text-white flex items-center">
                      {algo.label}
                      <InfoTooltip
                        title={algo.label}
                        text={
                          algo.value === "kmeans"
                            ? "データを指定した数のグループに分割する最も標準的なクラスタリング手法です。各データ点を最も近いクラスタ中心に割り当て、中心を再計算する反復処理で分類します。大規模データでも高速に処理でき、結果が安定しています。クラスタ数を事前に決める必要があります。"
                            : algo.value === "hdbscan"
                              ? "データの密度の違いを自動的に検出し、密集した領域をクラスタとして抽出します。クラスタ数の事前指定が不要で、形状が不規則なクラスタも検出可能です。どのクラスタにも属さない外れ値（ノイズ点）も自動検出します。データ量が少ない場合はmin_cluster_sizeを小さく設定してください。"
                              : "各データ点が複数のガウス分布の混合から生成されたと仮定し、確率的にクラスタを推定します。クラスタ間の境界が曖昧で重なりがある場合に有効です。各データ点の所属確率が得られるため、不確実性の評価にも利用できます。"
                        }
                      />
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
                    <span className="text-gray-600 dark:text-gray-400 flex items-center">
                      クラスタ数
                      <InfoTooltip title="クラスタ数（K値）" text="データを何グループに分割するかを指定します。少ない値（3-5）では大きなテーマが抽出され、多い値（10-20）ではより細かいサブテーマまで分類されます。最適な値はデータの多様性に依存します。シルエットスコアが高くなるKを探してみてください。" />
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
                    <span className="text-gray-600 dark:text-gray-400 flex items-center">
                      最小クラスタサイズ
                      <InfoTooltip title="最小クラスタサイズ" text="1つのクラスタとして認識するために必要な最小データ数です。値を大きくすると大きな主要クラスタのみ検出され、小さくすると少数派の意見グループも独立クラスタとして検出されます。データ数の1/10〜1/20が目安です。全てノイズ（灰色）になる場合は値を小さくしてください。" />
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
                    <InfoTooltip title="Epsilon（ε）" text="近傍とみなす距離の閾値です。値を大きくすると遠いデータ点同士も同じクラスタと判定され、クラスタが統合されやすくなります。小さくするとクラスタが分裂しやすくなります。HDBSCANでは補助的に使用されます。" width="md" />
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

          {/* 進捗タイムライン */}
          <AnalysisProgress steps={ANALYSIS_STEPS.cluster} isRunning={isRunning} />

          {/* 属性フィルタ */}
          <AttributeFilter
            datasetId={activeDatasetId}
            filters={attrFilters}
            onChange={setAttrFilters}
          />

          {/* シルエットスコア */}
          {hasResults && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                分析品質
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  シルエットスコア
                  <InfoTooltip title="シルエットスコア" text="クラスタリングの品質を-1.0〜1.0で評価する指標です。0.5以上: 良好な分離（クラスタ間の境界が明確）。0.25〜0.5: やや重なりあり（パラメータ調整で改善の余地あり）。0.25未満: クラスタ同士が大きく重なっている（クラスタ数やアルゴリズムの見直しを推奨）。値が高いほどクラスタ内のデータが密集し、クラスタ間が離れていることを意味します。" />
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
              <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center">
                UMAP クラスタ散布図
                <InfoTooltip title="UMAP散布図" text="高次元のテキストデータを2次元に圧縮（次元削減）して可視化したものです。近くに配置されたドットは内容が類似したテキストを表します。同じ色のドットは同じクラスタに属しています。灰色のドットはどのクラスタにも明確に属さない外れ値（ノイズ点）です。UMAP-1/UMAP-2の軸は数学的に導出された座標で、直接的な意味はありません。" />
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
              <ResponsiveContainer width="100%" height={500}>
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
                          {data.text && (
                            <p className="text-gray-200 mt-1.5 text-xs leading-relaxed border-t border-gray-700 pt-1.5">
                              {data.text}
                            </p>
                          )}
                          <p className="text-gray-400 mt-1 text-xs">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

                  {/* LLM要約 */}
                  {cluster.summary && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 leading-relaxed">
                      {cluster.summary}
                    </p>
                  )}

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

                  {/* 代表テキスト */}
                  {cluster.centroidTexts.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1">
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">代表テキスト:</p>
                      {cluster.centroidTexts.slice(0, 5).map((t, i) => (
                        <p
                          key={i}
                          className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2"
                          title={t}
                        >
                          {t}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* コヒーレンススコア */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-400 flex items-center flex-shrink-0">
                      品質
                      <InfoTooltip title="コヒーレンススコア" text="クラスタ内のテキストがどれだけ一貫したテーマを持っているかを示す指標です。シルエットスコアと同じ値が使われ、-1.0〜1.0の範囲です。値が高いほどクラスタ内のテキストが類似しており、明確なテーマを持つことを意味します。" />
                    </span>
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
                外れ値一覧（セントロイド距離 上位{outlierList.length}件）
                <InfoTooltip title="セントロイド距離と外れ値" text="セントロイド距離は、各テキストがそのクラスタの中心（セントロイド）からどれだけ離れているかを数値化したものです。距離が大きいほどクラスタの典型的なテキストとは異なる内容を持つことを意味します。ここに表示されるのは各クラスタで最もセントロイドから離れた「外れ値」テキストで、独自の視点、ユニークな意見、または分類が難しい境界的なテキストです。少数意見や重要な例外の発見に役立ちます。" />
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                各クラスターの中心から最も離れたテキスト。独自の視点や重要な少数意見を含む可能性があります。
              </p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {outlierList.map((outlier) => {
                  const cluster = clusters.find((c) => c.id === outlier.clusterId);
                  return (
                    <div
                      key={outlier.id}
                      className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor:
                              CLUSTER_COLORS[outlier.clusterId % CLUSTER_COLORS.length],
                          }}
                        />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {cluster?.label ?? `クラスタ ${outlier.clusterId}`}
                        </span>
                        <span className="ml-auto text-xs text-gray-400 font-mono">
                          距離: {outlier.distance.toFixed(3)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">
                        {outlier.text}
                      </p>
                    </div>
                  );
                })}
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
