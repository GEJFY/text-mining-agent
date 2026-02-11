import { create } from "zustand";

// ========================================
// 型定義
// ========================================

/** データセット情報 */
export interface Dataset {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  textColumn: string;
  createdAt: string;
  status: "pending" | "processing" | "ready" | "error";
}

/** クラスタ情報 */
export interface Cluster {
  id: number;
  label: string;
  size: number;
  keywords: string[];
  coherenceScore: number;
}

/** クラスタリング結果のデータポイント */
export interface ClusterPoint {
  id: string;
  x: number;
  y: number;
  clusterId: number;
  text: string;
  isOutlier: boolean;
}

/** センチメント結果 */
export interface SentimentResult {
  id: string;
  text: string;
  score: number;
  label: "positive" | "negative" | "neutral";
  confidence: number;
  timestamp?: string;
}

/** センチメントスパイク */
export interface SentimentSpike {
  date: string;
  score: number;
  description: string;
}

/** 共起ネットワークノード */
export interface CooccurrenceNode {
  id: string;
  word: string;
  frequency: number;
  communityId: number;
}

/** 共起ネットワークエッジ */
export interface CooccurrenceEdge {
  source: string;
  target: string;
  weight: number;
}

/** エージェントフェーズ */
export type AgentPhase =
  | "observe"
  | "hypothesize"
  | "explore"
  | "verify"
  | "synthesize";

/** エージェントログエントリ */
export interface AgentLogEntry {
  id: string;
  phase: AgentPhase;
  message: string;
  timestamp: string;
  details?: string;
}

/** インサイトカード */
export interface InsightCard {
  id: string;
  title: string;
  summary: string;
  groundingScore: number;
  evidence: string[];
  phase: AgentPhase;
  approved?: boolean;
}

/** クラスタリングアルゴリズム */
export type ClusterAlgorithm = "kmeans" | "hdbscan" | "gmm";

/** クラスタリングパラメータ */
export interface ClusterParams {
  algorithm: ClusterAlgorithm;
  nClusters: number;
  minClusterSize: number;
  epsilon: number;
}

/** センチメント軸設定 */
export interface SentimentAxis {
  positiveLabel: string;
  negativeLabel: string;
  customAxes: Array<{ name: string; positive: string; negative: string }>;
}

// ========================================
// ストア状態型
// ========================================

interface AnalysisState {
  // データセット
  datasets: Dataset[];
  activeDatasetId: string | null;

  // クラスタリング
  clusters: Cluster[];
  clusterPoints: ClusterPoint[];
  clusterParams: ClusterParams;
  isClusteringRunning: boolean;

  // センチメント
  sentimentResults: SentimentResult[];
  sentimentSpikes: SentimentSpike[];
  sentimentAxis: SentimentAxis;
  isSentimentRunning: boolean;
  estimatedCost: number;

  // 共起ネットワーク
  cooccurrenceNodes: CooccurrenceNode[];
  cooccurrenceEdges: CooccurrenceEdge[];
  isCooccurrenceRunning: boolean;

  // エージェント
  agentPhase: AgentPhase | null;
  agentLogs: AgentLogEntry[];
  insights: InsightCard[];
  isAgentRunning: boolean;

  // UI状態
  darkMode: boolean;

  // アクション
  setDatasets: (datasets: Dataset[]) => void;
  setActiveDataset: (id: string | null) => void;
  addDataset: (dataset: Dataset) => void;

  setClusters: (clusters: Cluster[]) => void;
  setClusterPoints: (points: ClusterPoint[]) => void;
  setClusterParams: (params: Partial<ClusterParams>) => void;
  setClusteringRunning: (running: boolean) => void;

  setSentimentResults: (results: SentimentResult[]) => void;
  setSentimentSpikes: (spikes: SentimentSpike[]) => void;
  setSentimentAxis: (axis: Partial<SentimentAxis>) => void;
  setSentimentRunning: (running: boolean) => void;
  setEstimatedCost: (cost: number) => void;

  setCooccurrenceData: (
    nodes: CooccurrenceNode[],
    edges: CooccurrenceEdge[]
  ) => void;
  setCooccurrenceRunning: (running: boolean) => void;

  setAgentPhase: (phase: AgentPhase | null) => void;
  addAgentLog: (log: AgentLogEntry) => void;
  clearAgentLogs: () => void;
  setInsights: (insights: InsightCard[]) => void;
  approveInsight: (id: string, approved: boolean) => void;
  setAgentRunning: (running: boolean) => void;

  toggleDarkMode: () => void;
}

// ========================================
// Zustandストア
// ========================================

export const useAnalysisStore = create<AnalysisState>((set) => ({
  // 初期状態: データセット
  datasets: [],
  activeDatasetId: null,

  // 初期状態: クラスタリング
  clusters: [],
  clusterPoints: [],
  clusterParams: {
    algorithm: "kmeans",
    nClusters: 5,
    minClusterSize: 10,
    epsilon: 0.5,
  },
  isClusteringRunning: false,

  // 初期状態: センチメント
  sentimentResults: [],
  sentimentSpikes: [],
  sentimentAxis: {
    positiveLabel: "ポジティブ",
    negativeLabel: "ネガティブ",
    customAxes: [],
  },
  isSentimentRunning: false,
  estimatedCost: 0,

  // 初期状態: 共起ネットワーク
  cooccurrenceNodes: [],
  cooccurrenceEdges: [],
  isCooccurrenceRunning: false,

  // 初期状態: エージェント
  agentPhase: null,
  agentLogs: [],
  insights: [],
  isAgentRunning: false,

  // 初期状態: UI
  darkMode: document.documentElement.classList.contains("dark"),

  // アクション: データセット
  setDatasets: (datasets) => set({ datasets }),
  setActiveDataset: (id) => set({ activeDatasetId: id }),
  addDataset: (dataset) =>
    set((state) => ({ datasets: [...state.datasets, dataset] })),

  // アクション: クラスタリング
  setClusters: (clusters) => set({ clusters }),
  setClusterPoints: (points) => set({ clusterPoints: points }),
  setClusterParams: (params) =>
    set((state) => ({
      clusterParams: { ...state.clusterParams, ...params },
    })),
  setClusteringRunning: (running) => set({ isClusteringRunning: running }),

  // アクション: センチメント
  setSentimentResults: (results) => set({ sentimentResults: results }),
  setSentimentSpikes: (spikes) => set({ sentimentSpikes: spikes }),
  setSentimentAxis: (axis) =>
    set((state) => ({
      sentimentAxis: { ...state.sentimentAxis, ...axis },
    })),
  setSentimentRunning: (running) => set({ isSentimentRunning: running }),
  setEstimatedCost: (cost) => set({ estimatedCost: cost }),

  // アクション: 共起ネットワーク
  setCooccurrenceData: (nodes, edges) =>
    set({ cooccurrenceNodes: nodes, cooccurrenceEdges: edges }),
  setCooccurrenceRunning: (running) => set({ isCooccurrenceRunning: running }),

  // アクション: エージェント
  setAgentPhase: (phase) => set({ agentPhase: phase }),
  addAgentLog: (log) =>
    set((state) => ({ agentLogs: [...state.agentLogs, log] })),
  clearAgentLogs: () => set({ agentLogs: [] }),
  setInsights: (insights) => set({ insights }),
  approveInsight: (id, approved) =>
    set((state) => ({
      insights: state.insights.map((i) =>
        i.id === id ? { ...i, approved } : i
      ),
    })),
  setAgentRunning: (running) => set({ isAgentRunning: running }),

  // アクション: UI
  toggleDarkMode: () =>
    set((state) => {
      const newMode = !state.darkMode;
      if (newMode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      localStorage.setItem("nexustext-dark-mode", String(newMode));
      return { darkMode: newMode };
    }),
}));
