import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Loader2,
  Settings,
  Maximize2,
  Download,
  AlertCircle,
} from "lucide-react";
import { useAnalysisStore } from "../stores/analysisStore";
import { cooccurrenceApi } from "../api/client";
import DatasetGuard from "../components/DatasetGuard";

/**
 * 共起ネットワークページ
 * Canvasフォースグラフ、コミュニティ検出表示、ワードクラウド
 * バックエンドAPI経由で実データを分析
 */

// コミュニティカラー
const COMMUNITY_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#14b8a6",
];

/** ネットワークノード（描画用） */
interface GraphNode {
  id: string;
  word: string;
  frequency: number;
  community: number;
  x: number;
  y: number;
  r: number;
}

/** ネットワークエッジ */
interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

/** コミュニティ情報 */
interface CommunityInfo {
  id: number;
  name: string;
  color: string;
  words: Array<{ word: string; frequency: number }>;
}

/** ワードクラウドアイテム */
interface WordCloudItem {
  word: string;
  size: number;
  color: string;
}

function CooccurrencePage() {
  const { activeDatasetId } = useAnalysisStore();
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [minFrequency, setMinFrequency] = useState(3);
  const [windowSize, setWindowSize] = useState(5);
  const [selectedCommunity, setSelectedCommunity] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [modularity, setModularity] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // API結果
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [communities, setCommunities] = useState<CommunityInfo[]>([]);
  const [wordCloud, setWordCloud] = useState<WordCloudItem[]>([]);

  // Canvas描画
  const drawGraph = useCallback(() => {
    if (!hasResults || !canvasRef.current || nodes.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);

    // スケーリング
    const scaleX = rect.width / 600;
    const scaleY = rect.height / 450;

    // エッジ描画
    edges.forEach((edge) => {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (!sourceNode || !targetNode) return;

      if (
        selectedCommunity !== null &&
        sourceNode.community !== selectedCommunity &&
        targetNode.community !== selectedCommunity
      ) {
        return;
      }

      ctx.beginPath();
      ctx.moveTo(sourceNode.x * scaleX, sourceNode.y * scaleY);
      ctx.lineTo(targetNode.x * scaleX, targetNode.y * scaleY);

      const maxWeight = Math.max(...edges.map((e) => e.weight), 1);
      const normalizedWeight = edge.weight / maxWeight;

      ctx.strokeStyle =
        selectedCommunity !== null &&
        (sourceNode.community !== selectedCommunity ||
          targetNode.community !== selectedCommunity)
          ? "rgba(156, 163, 175, 0.15)"
          : `rgba(156, 163, 175, ${normalizedWeight * 0.6 + 0.1})`;
      ctx.lineWidth = normalizedWeight * 3 + 0.5;
      ctx.stroke();
    });

    // ノード描画
    nodes.forEach((node) => {
      const isHighlighted =
        selectedCommunity === null || node.community === selectedCommunity;

      ctx.beginPath();
      ctx.arc(
        node.x * scaleX,
        node.y * scaleY,
        node.r * Math.min(scaleX, scaleY) * 0.8,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = isHighlighted
        ? COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length]
        : "rgba(156, 163, 175, 0.3)";
      ctx.fill();
      ctx.strokeStyle = isHighlighted
        ? "rgba(255, 255, 255, 0.8)"
        : "rgba(156, 163, 175, 0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // ラベル
      ctx.fillStyle = isHighlighted
        ? "#1f2937"
        : "rgba(156, 163, 175, 0.5)";
      ctx.font = `${Math.max(10, node.r * 0.45 * Math.min(scaleX, scaleY))}px "Noto Sans JP", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(node.word, node.x * scaleX, node.y * scaleY);
    });
  }, [hasResults, nodes, edges, selectedCommunity]);

  useEffect(() => {
    drawGraph();
  }, [drawGraph]);

  // 分析実行
  const handleRun = async () => {
    if (!activeDatasetId) return;

    setIsRunning(true);
    setError(null);
    setSelectedCommunity(null);

    try {
      const response = await cooccurrenceApi.run(activeDatasetId, {
        min_frequency: minFrequency,
        window_size: windowSize,
      });

      const data = response.data;
      setModularity(data.modularity as number);

      // エッジマッピング
      const mappedEdges: GraphEdge[] = (
        data.edges as Array<{ source: string; target: string; weight: number }>
      ).map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
      }));
      setEdges(mappedEdges);

      // ノードマッピング + レイアウト計算
      const rawNodes = data.nodes as Array<{
        word: string;
        frequency: number;
        community_id: number;
        degree_centrality: number;
      }>;

      // コミュニティごとにグループ化
      const communityMap = data.communities as Record<string, string[]>;
      const communityIds = Object.keys(communityMap)
        .map(Number)
        .sort((a, b) => a - b);

      // コミュニティ情報を構築
      const mappedCommunities: CommunityInfo[] = communityIds.map((cid) => {
        const communityWords = communityMap[String(cid)] ?? [];
        const wordsWithFreq = communityWords.map((w) => {
          const node = rawNodes.find((n) => n.word === w);
          return { word: w, frequency: node?.frequency ?? 0 };
        });
        wordsWithFreq.sort((a, b) => b.frequency - a.frequency);

        return {
          id: cid,
          name: `コミュニティ ${cid + 1}`,
          color: COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length],
          words: wordsWithFreq,
        };
      });
      setCommunities(mappedCommunities);

      // ノードの位置をコミュニティベースで計算
      const maxFreq = Math.max(...rawNodes.map((n) => n.frequency), 1);
      const centerX = 300;
      const centerY = 225;
      const communityRadius = 130;

      const mappedNodes: GraphNode[] = rawNodes.map((n) => {
        const cIdx = communityIds.indexOf(n.community_id);
        const angle =
          ((cIdx >= 0 ? cIdx : 0) / Math.max(communityIds.length, 1)) *
          Math.PI *
          2;
        const cx = centerX + Math.cos(angle) * communityRadius;
        const cy = centerY + Math.sin(angle) * communityRadius;

        // コミュニティ内での位置をランダムオフセット
        const communityWords = communityMap[String(n.community_id)] ?? [];
        const wordIdx = communityWords.indexOf(n.word);
        const innerAngle =
          (wordIdx / Math.max(communityWords.length, 1)) * Math.PI * 2;
        const innerRadius = 40 + Math.random() * 30;

        return {
          id: n.word,
          word: n.word,
          frequency: n.frequency,
          community: n.community_id,
          x: cx + Math.cos(innerAngle) * innerRadius,
          y: cy + Math.sin(innerAngle) * innerRadius,
          r: 12 + (n.frequency / maxFreq) * 25,
        };
      });
      setNodes(mappedNodes);

      // ワードクラウドデータ（頻度上位30語）
      const sortedByFreq = [...rawNodes]
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 30);
      const topFreq = sortedByFreq[0]?.frequency ?? 1;
      const mappedWordCloud: WordCloudItem[] = sortedByFreq.map((n) => ({
        word: n.word,
        size: 16 + (n.frequency / topFreq) * 36,
        color: COMMUNITY_COLORS[n.community_id % COMMUNITY_COLORS.length],
      }));
      setWordCloud(mappedWordCloud);

      setHasResults(true);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "共起ネットワーク分析に失敗しました";
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ========================================
            左パネル: パラメータ・コミュニティ
            ======================================== */}
        <div className="lg:col-span-1 space-y-4">
          {/* パラメータ設定 */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Settings size={16} />
              パラメータ設定
            </h3>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">
                    最小出現頻度
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {minFrequency}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={minFrequency}
                  onChange={(e) => setMinFrequency(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-nexus-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">
                    ウィンドウサイズ
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {windowSize}
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={15}
                  value={windowSize}
                  onChange={(e) => setWindowSize(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-nexus-600"
                />
              </div>
            </div>

            <button
              onClick={handleRun}
              disabled={isRunning}
              className="btn-primary w-full mt-4"
            >
              {isRunning ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  分析中...
                </>
              ) : (
                <>
                  <Play size={16} />
                  分析実行
                </>
              )}
            </button>
          </div>

          {/* モジュラリティ */}
          {hasResults && (
            <div className="card p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  モジュラリティ
                </span>
                <span className="font-mono font-medium text-gray-900 dark:text-white">
                  {modularity.toFixed(4)}
                </span>
              </div>
            </div>
          )}

          {/* コミュニティ検出結果 */}
          {hasResults && communities.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                検出コミュニティ（{communities.length}）
              </h3>

              <div className="space-y-2">
                {communities.map((community) => (
                  <button
                    key={community.id}
                    onClick={() =>
                      setSelectedCommunity(
                        selectedCommunity === community.id
                          ? null
                          : community.id,
                      )
                    }
                    className={`
                      w-full text-left p-3 rounded-lg transition-all duration-200 border
                      ${
                        selectedCommunity === community.id
                          ? "border-nexus-500 bg-nexus-50 dark:bg-nexus-950 shadow-sm"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }
                    `}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: community.color }}
                      />
                      <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {community.name}
                      </span>
                      <span className="ml-auto text-xs text-gray-400">
                        {community.words.length}語
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {community.words.slice(0, 3).map((w) => (
                        <span
                          key={w.word}
                          className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        >
                          {w.word}
                        </span>
                      ))}
                      {community.words.length > 3 && (
                        <span className="text-xs text-gray-400">
                          +{community.words.length - 3}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ========================================
            右パネル: グラフ・ワードクラウド
            ======================================== */}
        <div className="lg:col-span-3 space-y-4">
          {hasResults ? (
            <>
              {/* ネットワークグラフ (Canvas) */}
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    共起ネットワークグラフ
                  </h3>
                  <div className="flex gap-2">
                    <button className="btn-ghost" title="全画面表示">
                      <Maximize2 size={16} />
                    </button>
                    <button className="btn-ghost" title="画像をダウンロード">
                      <Download size={16} />
                    </button>
                  </div>
                </div>

                <div className="relative bg-gray-50 dark:bg-gray-800/30 rounded-lg overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    className="w-full"
                    style={{ height: "420px" }}
                  />
                </div>

                {/* 凡例 */}
                <div className="flex flex-wrap gap-4 mt-3">
                  {communities.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* ワードクラウド */}
              {wordCloud.length > 0 && (
                <div className="card p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                    ワードクラウド
                  </h3>

                  <div className="flex flex-wrap items-center justify-center gap-3 py-8 bg-gray-50 dark:bg-gray-800/30 rounded-lg min-h-[200px]">
                    {wordCloud.map((item) => (
                      <span
                        key={item.word}
                        className="cursor-pointer transition-all duration-200 hover:opacity-70 select-none"
                        style={{
                          fontSize: `${item.size}px`,
                          color: item.color,
                          fontWeight:
                            item.size > 35
                              ? 700
                              : item.size > 25
                                ? 600
                                : 400,
                          opacity: 0.6 + (item.size / 52) * 0.4,
                        }}
                        title={item.word}
                      >
                        {item.word}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* コミュニティ詳細テーブル */}
              {selectedCommunity !== null && (
                <div className="card overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      {communities.find((c) => c.id === selectedCommunity)
                        ?.name ?? `コミュニティ ${selectedCommunity}`}{" "}
                      - 単語一覧
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                            単語
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                            出現頻度
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                            頻度バー
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                        {communities
                          .find((c) => c.id === selectedCommunity)
                          ?.words.map((w) => {
                            const maxFreq = Math.max(
                              ...(communities.find(
                                (c) => c.id === selectedCommunity,
                              )?.words ?? [{ frequency: 1 }]).map(
                                (x) => x.frequency,
                              ),
                              1,
                            );
                            return (
                              <tr
                                key={w.word}
                                className="hover:bg-gray-50 dark:hover:bg-gray-800/30"
                              >
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                  {w.word}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                                  {w.frequency}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${(w.frequency / maxFreq) * 100}%`,
                                        backgroundColor:
                                          communities.find(
                                            (c) =>
                                              c.id === selectedCommunity,
                                          )?.color ?? "#6366f1",
                                      }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card p-16 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <Settings size={48} className="mb-4 opacity-50" />
              <p className="text-lg font-medium">
                共起ネットワーク分析を実行してください
              </p>
              <p className="text-sm mt-1">
                左パネルでパラメータを設定し、分析実行ボタンを押してください
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
    </DatasetGuard>
  );
}

export default CooccurrencePage;
