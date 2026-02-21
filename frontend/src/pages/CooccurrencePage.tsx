import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Loader2,
  Settings,
  Maximize2,
  AlertCircle,
  X,
  Plus,
  RotateCcw,
  Upload,
} from "lucide-react";
import * as d3 from "d3";
import { useAnalysisStore } from "../stores/analysisStore";
import { cooccurrenceApi, stopwordsApi } from "../api/client";
import DatasetGuard from "../components/DatasetGuard";

/**
 * 共起ネットワークページ
 * D3フォースグラフ、コミュニティ検出表示、ワードクラウド、ストップワード管理
 */

// プロフェッショナルカラーパレット
const COMMUNITY_COLORS = [
  "#4f46e5",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#059669",
  "#2563eb",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#65a30d",
];

/** ネットワークノード（D3描画用） */
interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  word: string;
  frequency: number;
  community: number;
  r: number;
}

/** ネットワークエッジ */
interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
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
  frequency: number;
}

/** ストップワード状態 */
interface StopwordState {
  ja: string[];
  en: string[];
  custom: string[];
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
  const svgRef = useRef<SVGSVGElement>(null);
  const wordCloudRef = useRef<SVGSVGElement>(null);

  // API結果
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [communities, setCommunities] = useState<CommunityInfo[]>([]);
  const [wordCloud, setWordCloud] = useState<WordCloudItem[]>([]);

  // ストップワード管理
  const [stopwords, setStopwords] = useState<StopwordState>({
    ja: [],
    en: [],
    custom: [],
  });
  const [activeTab, setActiveTab] = useState<"ja" | "en" | "custom">("ja");
  const [newStopword, setNewStopword] = useState("");
  const [stopwordsLoaded, setStopwordsLoaded] = useState(false);

  // ストップワード初回ロード
  useEffect(() => {
    const loadStopwords = async () => {
      try {
        const res = await stopwordsApi.get();
        setStopwords(res.data as StopwordState);
        setStopwordsLoaded(true);
      } catch {
        // 認証エラー等は無視
      }
    };
    loadStopwords();
  }, []);

  // D3 Force Graph 描画
  const drawForceGraph = useCallback(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 800;
    const height = 450;

    // ズーム設定
    const g = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    // ノードとエッジのコピー（D3がmutateするため）
    const simNodes = nodes.map((n) => ({ ...n }));
    const simEdges = edges.map((e) => ({
      ...e,
      source:
        typeof e.source === "string" ? e.source : (e.source as GraphNode).id,
      target:
        typeof e.target === "string" ? e.target : (e.target as GraphNode).id,
    }));

    const maxWeight = Math.max(...simEdges.map((e) => e.weight), 1);

    // Force simulation
    const simulation = d3
      .forceSimulation<GraphNode>(simNodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(simEdges as GraphEdge[])
          .id((d) => d.id)
          .distance((d) => 80 - (d.weight / maxWeight) * 40),
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide<GraphNode>().radius((d) => d.r + 4),
      );

    // エッジ描画
    const link = g
      .selectAll<SVGLineElement, GraphEdge>("line")
      .data(simEdges as GraphEdge[])
      .join("line")
      .attr("stroke", "#94a3b8")
      .attr(
        "stroke-opacity",
        (d) => 0.15 + (d.weight / maxWeight) * 0.5,
      )
      .attr(
        "stroke-width",
        (d) => 1 + (d.weight / maxWeight) * 4,
      );

    // ノードグループ
    const node = g
      .selectAll<SVGGElement, GraphNode>("g.node")
      .data(simNodes)
      .join("g")
      .attr("class", "node")
      .style("cursor", "grab")
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    // ノード円
    node
      .append("circle")
      .attr("r", (d) => d.r)
      .attr(
        "fill",
        (d) => COMMUNITY_COLORS[d.community % COMMUNITY_COLORS.length],
      )
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("opacity", 0.85);

    // ノードラベル
    node
      .append("text")
      .text((d) => d.word)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("font-size", (d) => `${Math.max(9, d.r * 0.55)}px`)
      .attr("font-family", "'Noto Sans JP', sans-serif")
      .attr("fill", "#fff")
      .attr("font-weight", "600")
      .attr("pointer-events", "none");

    // ツールチップ
    node
      .append("title")
      .text((d) => `${d.word}\n出現頻度: ${d.frequency}`);

    // Tick更新
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
        .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
        .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
        .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // コミュニティフィルタ
    if (selectedCommunity !== null) {
      node.attr("opacity", (d) =>
        d.community === selectedCommunity ? 1 : 0.15,
      );
      link.attr("stroke-opacity", (d) => {
        const src = d.source as GraphNode;
        const tgt = d.target as GraphNode;
        return src.community === selectedCommunity ||
          tgt.community === selectedCommunity
          ? 0.15 + ((d as GraphEdge).weight / maxWeight) * 0.5
          : 0.03;
      });
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, selectedCommunity]);

  useEffect(() => {
    if (hasResults) {
      drawForceGraph();
    }
  }, [hasResults, drawForceGraph]);

  // ワードクラウド SVG 描画
  const drawWordCloud = useCallback(() => {
    if (!wordCloudRef.current || wordCloud.length === 0) return;

    const svg = d3.select(wordCloudRef.current);
    svg.selectAll("*").remove();

    const width = wordCloudRef.current.clientWidth || 700;
    const height = 280;

    const g = svg
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    // スパイラル配置でワード配置を計算
    const sortedWords = [...wordCloud].sort(
      (a, b) => b.frequency - a.frequency,
    );
    const maxFreq = sortedWords[0]?.frequency ?? 1;

    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];

    sortedWords.forEach((item, i) => {
      const fontSize = 14 + (item.frequency / maxFreq) * 42;
      const rotation = i % 5 === 0 ? -90 : i % 7 === 0 ? 90 : 0;
      const textW =
        item.word.length * fontSize * (rotation !== 0 ? 0.4 : 0.65);
      const textH = fontSize * (rotation !== 0 ? item.word.length * 0.65 : 1.2);

      // スパイラル配置
      let x = 0,
        y = 0;
      let step = 0;
      let foundSpot = false;
      while (step < 500 && !foundSpot) {
        const angle = step * 0.15;
        const radius = step * 0.8;
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius;

        const overlaps = placed.some(
          (p) =>
            Math.abs(p.x - x) < (p.w + textW) / 2 + 4 &&
            Math.abs(p.y - y) < (p.h + textH) / 2 + 2,
        );

        if (
          !overlaps &&
          Math.abs(x) < width / 2 - 20 &&
          Math.abs(y) < height / 2 - 15
        ) {
          foundSpot = true;
        }
        step++;
      }

      if (foundSpot) {
        placed.push({ x, y, w: textW, h: textH });
        const text = g
          .append("text")
          .attr("transform", `translate(${x},${y}) rotate(${rotation})`)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("font-size", `${fontSize}px`)
          .attr("font-family", "'Noto Sans JP', sans-serif")
          .attr(
            "font-weight",
            fontSize > 35 ? "700" : fontSize > 25 ? "600" : "400",
          )
          .attr("fill", item.color)
          .attr("opacity", 0.7 + (item.frequency / maxFreq) * 0.3)
          .style("cursor", "default")
          .text(item.word);

        text.append("title").text(`${item.word}: ${item.frequency}`);
      }
    });
  }, [wordCloud]);

  useEffect(() => {
    if (hasResults) {
      drawWordCloud();
    }
  }, [hasResults, drawWordCloud]);

  // ストップワード操作
  const handleAddStopword = async () => {
    const word = newStopword.trim();
    if (!word) return;
    try {
      const res = await stopwordsApi.update(activeTab, [word], "add");
      setStopwords(res.data as StopwordState);
      setNewStopword("");
    } catch {
      setError("ストップワードの追加に失敗しました");
    }
  };

  const handleRemoveStopword = async (word: string) => {
    try {
      const res = await stopwordsApi.update(activeTab, [word], "remove");
      setStopwords(res.data as StopwordState);
    } catch {
      setError("ストップワードの削除に失敗しました");
    }
  };

  const handleResetStopwords = async () => {
    try {
      const res = await stopwordsApi.reset(activeTab);
      setStopwords(res.data as StopwordState);
    } catch {
      setError("ストップワードのリセットに失敗しました");
    }
  };

  const handleUploadStopwords = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const words = text
      .split(/\r?\n/)
      .map((w) => w.trim())
      .filter(Boolean);
    if (words.length === 0) return;
    try {
      const res = await stopwordsApi.update(activeTab, words, "add");
      setStopwords(res.data as StopwordState);
    } catch {
      setError("ストップワードファイルの読み込みに失敗しました");
    }
    e.target.value = "";
  };

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
        data.edges as Array<{
          source: string;
          target: string;
          weight: number;
        }>
      ).map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
      }));
      setEdges(mappedEdges);

      // ノードマッピング
      const rawNodes = data.nodes as Array<{
        word: string;
        frequency: number;
        community_id: number;
        degree_centrality: number;
      }>;

      // コミュニティマップ
      const communityMap = data.communities as Record<string, string[]>;
      const communityIds = Object.keys(communityMap)
        .map(Number)
        .sort((a, b) => a - b);

      // コミュニティ情報
      const mappedCommunities: CommunityInfo[] = communityIds.map((cid) => {
        const communityWords = communityMap[String(cid)] ?? [];
        const wordsWithFreq = communityWords.map((w) => {
          const nd = rawNodes.find((n) => n.word === w);
          return { word: w, frequency: nd?.frequency ?? 0 };
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

      // ノード（D3 force用）
      const maxFreq = Math.max(...rawNodes.map((n) => n.frequency), 1);
      const mappedNodes: GraphNode[] = rawNodes.map((n) => ({
        id: n.word,
        word: n.word,
        frequency: n.frequency,
        community: n.community_id,
        r: 10 + (n.frequency / maxFreq) * 22,
      }));
      setNodes(mappedNodes);

      // ワードクラウドデータ（頻度上位40語）
      const sortedByFreq = [...rawNodes]
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 40);
      const topFreq = sortedByFreq[0]?.frequency ?? 1;
      const mappedWordCloud: WordCloudItem[] = sortedByFreq.map((n) => ({
        word: n.word,
        size: 14 + (n.frequency / topFreq) * 42,
        color: COMMUNITY_COLORS[n.community_id % COMMUNITY_COLORS.length],
        frequency: n.frequency,
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

  const activeStopwords = stopwords[activeTab] ?? [];

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
              左パネル: パラメータ・ストップワード・コミュニティ
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

            {/* ストップワード管理 */}
            {stopwordsLoaded && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  ストップワード管理
                </h3>

                {/* タブ切替 */}
                <div className="flex gap-1 mb-3">
                  {(["ja", "en", "custom"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                        activeTab === tab
                          ? "bg-nexus-100 dark:bg-nexus-900 text-nexus-700 dark:text-nexus-300"
                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      {tab === "ja"
                        ? "日本語"
                        : tab === "en"
                          ? "English"
                          : "カスタム"}
                    </button>
                  ))}
                </div>

                {/* 追加フォーム */}
                <div className="flex gap-1 mb-2">
                  <input
                    type="text"
                    value={newStopword}
                    onChange={(e) => setNewStopword(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleAddStopword()
                    }
                    placeholder="単語を追加..."
                    className="flex-1 text-xs px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-nexus-500"
                  />
                  <button
                    onClick={handleAddStopword}
                    className="p-1.5 rounded-md bg-nexus-500 text-white hover:bg-nexus-600"
                    title="追加"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* アクションボタン */}
                <div className="flex gap-1 mb-2">
                  <button
                    onClick={handleResetStopwords}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    title="デフォルトに戻す"
                  >
                    <RotateCcw size={12} />
                    リセット
                  </button>
                  <label className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
                    <Upload size={12} />
                    ファイル読込
                    <input
                      type="file"
                      accept=".txt,.csv"
                      onChange={handleUploadStopwords}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* ストップワード一覧 */}
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {activeStopwords.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">
                      ストップワードが設定されていません
                    </p>
                  ) : (
                    activeStopwords.map((word) => (
                      <div
                        key={word}
                        className="flex items-center justify-between px-2 py-1 rounded text-xs group hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      >
                        <span className="text-gray-700 dark:text-gray-300 truncate">
                          {word}
                        </span>
                        <button
                          onClick={() => handleRemoveStopword(word)}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-0.5"
                          title="削除"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {activeStopwords.length}語
                </p>
              </div>
            )}

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
                {/* ネットワークグラフ (D3 SVG) */}
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      共起ネットワークグラフ
                    </h3>
                    <div className="flex gap-2">
                      {selectedCommunity !== null && (
                        <button
                          onClick={() => setSelectedCommunity(null)}
                          className="btn-ghost text-sm"
                        >
                          全表示
                        </button>
                      )}
                      <button className="btn-ghost" title="全画面表示">
                        <Maximize2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="relative bg-gray-50 dark:bg-gray-800/30 rounded-lg overflow-hidden">
                    <svg
                      ref={svgRef}
                      className="w-full"
                      style={{ height: "450px" }}
                    />
                  </div>

                  {/* 凡例 */}
                  <div className="flex flex-wrap gap-4 mt-3">
                    {communities.map((c) => (
                      <button
                        key={c.id}
                        onClick={() =>
                          setSelectedCommunity(
                            selectedCommunity === c.id ? null : c.id,
                          )
                        }
                        className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ワードクラウド (D3 SVG) */}
                {wordCloud.length > 0 && (
                  <div className="card p-6">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                      ワードクラウド
                    </h3>

                    <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg overflow-hidden">
                      <svg
                        ref={wordCloudRef}
                        className="w-full"
                        style={{ height: "280px" }}
                      />
                    </div>
                  </div>
                )}

                {/* コミュニティ詳細テーブル */}
                {selectedCommunity !== null && (
                  <div className="card overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                        {communities.find((c) => c.id === selectedCommunity)
                          ?.name ??
                          `コミュニティ ${selectedCommunity}`}{" "}
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
                                ...(
                                  communities.find(
                                    (c) => c.id === selectedCommunity,
                                  )?.words ?? [{ frequency: 1 }]
                                ).map((x) => x.frequency),
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
                                            )?.color ?? "#4f46e5",
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
