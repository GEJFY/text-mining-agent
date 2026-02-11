import { useState, useEffect, useRef } from "react";
import {
  Play,
  Loader2,
  Settings,
  Maximize2,
  Download,
} from "lucide-react";

/**
 * 共起ネットワークページ
 * D3フォースグラフ（プレースホルダー）、コミュニティ検出表示、ワードクラウド
 */

// サンプルコミュニティデータ
const sampleCommunities = [
  {
    id: 0,
    name: "製品・品質コミュニティ",
    color: "#6366f1",
    words: [
      { word: "品質", frequency: 120 },
      { word: "製品", frequency: 95 },
      { word: "耐久性", frequency: 78 },
      { word: "デザイン", frequency: 65 },
      { word: "素材", frequency: 52 },
    ],
  },
  {
    id: 1,
    name: "サービス・対応コミュニティ",
    color: "#8b5cf6",
    words: [
      { word: "対応", frequency: 105 },
      { word: "サポート", frequency: 88 },
      { word: "問い合わせ", frequency: 72 },
      { word: "返品", frequency: 58 },
      { word: "迅速", frequency: 45 },
    ],
  },
  {
    id: 2,
    name: "価格・コストコミュニティ",
    color: "#ec4899",
    words: [
      { word: "価格", frequency: 98 },
      { word: "コスパ", frequency: 82 },
      { word: "値段", frequency: 68 },
      { word: "割引", frequency: 55 },
      { word: "キャンペーン", frequency: 40 },
    ],
  },
  {
    id: 3,
    name: "配送・物流コミュニティ",
    color: "#f59e0b",
    words: [
      { word: "配送", frequency: 115 },
      { word: "到着", frequency: 85 },
      { word: "梱包", frequency: 62 },
      { word: "追跡", frequency: 48 },
      { word: "遅延", frequency: 38 },
    ],
  },
];

// サンプルワードクラウドデータ
const wordCloudData = [
  { word: "品質", size: 48, color: "#6366f1" },
  { word: "配送", size: 44, color: "#f59e0b" },
  { word: "対応", size: 42, color: "#8b5cf6" },
  { word: "価格", size: 40, color: "#ec4899" },
  { word: "製品", size: 38, color: "#6366f1" },
  { word: "サポート", size: 35, color: "#8b5cf6" },
  { word: "到着", size: 33, color: "#f59e0b" },
  { word: "コスパ", size: 32, color: "#ec4899" },
  { word: "耐久性", size: 30, color: "#6366f1" },
  { word: "問い合わせ", size: 28, color: "#8b5cf6" },
  { word: "デザイン", size: 27, color: "#6366f1" },
  { word: "値段", size: 26, color: "#ec4899" },
  { word: "梱包", size: 25, color: "#f59e0b" },
  { word: "返品", size: 24, color: "#8b5cf6" },
  { word: "素材", size: 23, color: "#6366f1" },
  { word: "割引", size: 22, color: "#ec4899" },
  { word: "迅速", size: 21, color: "#8b5cf6" },
  { word: "追跡", size: 20, color: "#f59e0b" },
  { word: "キャンペーン", size: 19, color: "#ec4899" },
  { word: "遅延", size: 18, color: "#f59e0b" },
];

// サンプルネットワークノード
const sampleNodes = [
  { id: "品質", x: 200, y: 150, r: 30, community: 0 },
  { id: "製品", x: 270, y: 120, r: 25, community: 0 },
  { id: "耐久性", x: 160, y: 210, r: 20, community: 0 },
  { id: "デザイン", x: 250, y: 200, r: 18, community: 0 },
  { id: "対応", x: 450, y: 150, r: 28, community: 1 },
  { id: "サポート", x: 500, y: 100, r: 24, community: 1 },
  { id: "問い合わせ", x: 420, y: 220, r: 19, community: 1 },
  { id: "価格", x: 350, y: 350, r: 26, community: 2 },
  { id: "コスパ", x: 300, y: 310, r: 22, community: 2 },
  { id: "値段", x: 400, y: 300, r: 18, community: 2 },
  { id: "配送", x: 150, y: 350, r: 30, community: 3 },
  { id: "到着", x: 100, y: 300, r: 22, community: 3 },
  { id: "梱包", x: 200, y: 380, r: 17, community: 3 },
];

// サンプルエッジ
const sampleEdges = [
  { source: "品質", target: "製品", weight: 0.8 },
  { source: "品質", target: "耐久性", weight: 0.7 },
  { source: "品質", target: "デザイン", weight: 0.5 },
  { source: "製品", target: "デザイン", weight: 0.6 },
  { source: "製品", target: "耐久性", weight: 0.4 },
  { source: "対応", target: "サポート", weight: 0.85 },
  { source: "対応", target: "問い合わせ", weight: 0.7 },
  { source: "サポート", target: "問い合わせ", weight: 0.55 },
  { source: "価格", target: "コスパ", weight: 0.8 },
  { source: "価格", target: "値段", weight: 0.75 },
  { source: "コスパ", target: "値段", weight: 0.5 },
  { source: "配送", target: "到着", weight: 0.8 },
  { source: "配送", target: "梱包", weight: 0.6 },
  { source: "到着", target: "梱包", weight: 0.4 },
  { source: "品質", target: "価格", weight: 0.3 },
  { source: "対応", target: "配送", weight: 0.25 },
];

function CooccurrencePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(true);
  const [minFrequency, setMinFrequency] = useState(10);
  const [windowSize, setWindowSize] = useState(5);
  const [selectedCommunity, setSelectedCommunity] = useState<number | null>(
    null
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // D3フォースグラフのプレースホルダー描画
  useEffect(() => {
    if (!hasResults || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // 背景クリア
    ctx.clearRect(0, 0, rect.width, rect.height);

    const communityColors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b"];

    // スケーリング
    const scaleX = rect.width / 600;
    const scaleY = rect.height / 450;

    // エッジ描画
    sampleEdges.forEach((edge) => {
      const sourceNode = sampleNodes.find((n) => n.id === edge.source);
      const targetNode = sampleNodes.find((n) => n.id === edge.target);
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
      ctx.strokeStyle =
        selectedCommunity !== null &&
        (sourceNode.community !== selectedCommunity ||
          targetNode.community !== selectedCommunity)
          ? "rgba(156, 163, 175, 0.15)"
          : `rgba(156, 163, 175, ${edge.weight * 0.5})`;
      ctx.lineWidth = edge.weight * 3;
      ctx.stroke();
    });

    // ノード描画
    sampleNodes.forEach((node) => {
      const isHighlighted =
        selectedCommunity === null ||
        node.community === selectedCommunity;

      ctx.beginPath();
      ctx.arc(
        node.x * scaleX,
        node.y * scaleY,
        node.r * Math.min(scaleX, scaleY) * 0.8,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = isHighlighted
        ? communityColors[node.community]
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
      ctx.fillText(node.id, node.x * scaleX, node.y * scaleY);
    });
  }, [hasResults, selectedCommunity]);

  // 分析実行
  const handleRun = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
      setHasResults(true);
    }, 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
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

          {/* コミュニティ検出結果 */}
          {hasResults && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                検出コミュニティ
              </h3>

              <div className="space-y-2">
                {sampleCommunities.map((community) => (
                  <button
                    key={community.id}
                    onClick={() =>
                      setSelectedCommunity(
                        selectedCommunity === community.id
                          ? null
                          : community.id
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
              {/* ネットワークグラフ (Canvas プレースホルダー) */}
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
                  {/* D3への移行案内 */}
                  <div className="absolute bottom-3 right-3 text-xs text-gray-400 dark:text-gray-500 bg-white/80 dark:bg-gray-900/80 px-2 py-1 rounded">
                    D3.js フォースグラフ用プレースホルダー
                  </div>
                </div>

                {/* 凡例 */}
                <div className="flex flex-wrap gap-4 mt-3">
                  {sampleCommunities.map((c) => (
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
              <div className="card p-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                  ワードクラウド
                </h3>

                <div className="flex flex-wrap items-center justify-center gap-3 py-8 bg-gray-50 dark:bg-gray-800/30 rounded-lg min-h-[200px]">
                  {wordCloudData.map((item) => (
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
                        opacity: 0.6 + (item.size / 48) * 0.4,
                        transform: `rotate(${Math.random() > 0.7 ? (Math.random() > 0.5 ? -15 : 15) : 0}deg)`,
                      }}
                      title={`出現回数: ${item.size * 3}`}
                    >
                      {item.word}
                    </span>
                  ))}
                </div>
              </div>

              {/* コミュニティ詳細テーブル */}
              {selectedCommunity !== null && (
                <div className="card overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      {sampleCommunities[selectedCommunity]?.name} - 単語一覧
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
                        {sampleCommunities[selectedCommunity]?.words.map(
                          (w) => (
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
                                      width: `${(w.frequency / 120) * 100}%`,
                                      backgroundColor:
                                        sampleCommunities[selectedCommunity]
                                          ?.color,
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          )
                        )}
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
  );
}

export default CooccurrencePage;
