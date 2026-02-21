import { describe, it, expect, beforeEach } from "vitest";
import { useAnalysisStore } from "./analysisStore";

describe("analysisStore", () => {
  beforeEach(() => {
    // ストアをリセット
    useAnalysisStore.setState({
      datasets: [],
      activeDatasetId: null,
      clusters: [],
      clusterPoints: [],
      isClusteringRunning: false,
      sentimentResults: [],
      isSentimentRunning: false,
      cooccurrenceNodes: [],
      cooccurrenceEdges: [],
      isCooccurrenceRunning: false,
      agentPhase: null,
      agentLogs: [],
      insights: [],
      isAgentRunning: false,
    });
  });

  // === データセット ===

  it("setDatasetsでデータセット一覧を設定", () => {
    const datasets = [
      {
        id: "ds-001",
        name: "test.csv",
        rowCount: 100,
        columnCount: 5,
        textColumn: "text",
        createdAt: "2024-01-01",
        status: "ready" as const,
      },
    ];
    useAnalysisStore.getState().setDatasets(datasets);
    expect(useAnalysisStore.getState().datasets).toHaveLength(1);
    expect(useAnalysisStore.getState().datasets[0].id).toBe("ds-001");
  });

  it("setActiveDatasetでアクティブデータセットを設定", () => {
    useAnalysisStore.getState().setActiveDataset("ds-001");
    expect(useAnalysisStore.getState().activeDatasetId).toBe("ds-001");
  });

  it("setActiveDataset(null)でクリア", () => {
    useAnalysisStore.getState().setActiveDataset("ds-001");
    useAnalysisStore.getState().setActiveDataset(null);
    expect(useAnalysisStore.getState().activeDatasetId).toBeNull();
  });

  it("addDatasetでデータセットを追加", () => {
    const ds = {
      id: "ds-002",
      name: "data.csv",
      rowCount: 50,
      columnCount: 3,
      textColumn: "content",
      createdAt: "2024-01-02",
      status: "ready" as const,
    };
    useAnalysisStore.getState().addDataset(ds);
    expect(useAnalysisStore.getState().datasets).toHaveLength(1);
    useAnalysisStore.getState().addDataset({ ...ds, id: "ds-003" });
    expect(useAnalysisStore.getState().datasets).toHaveLength(2);
  });

  // === クラスタリング ===

  it("setClusterParamsでパラメータを部分更新", () => {
    useAnalysisStore.getState().setClusterParams({ algorithm: "hdbscan" });
    const params = useAnalysisStore.getState().clusterParams;
    expect(params.algorithm).toBe("hdbscan");
    expect(params.nClusters).toBe(5); // デフォルト値保持
  });

  it("setClusteringRunningでフラグを切替", () => {
    useAnalysisStore.getState().setClusteringRunning(true);
    expect(useAnalysisStore.getState().isClusteringRunning).toBe(true);
    useAnalysisStore.getState().setClusteringRunning(false);
    expect(useAnalysisStore.getState().isClusteringRunning).toBe(false);
  });

  // === センチメント ===

  it("setSentimentRunningでフラグを切替", () => {
    useAnalysisStore.getState().setSentimentRunning(true);
    expect(useAnalysisStore.getState().isSentimentRunning).toBe(true);
  });

  it("setEstimatedCostでコストを設定", () => {
    useAnalysisStore.getState().setEstimatedCost(1.5);
    expect(useAnalysisStore.getState().estimatedCost).toBe(1.5);
  });

  // === エージェント ===

  it("addAgentLogでログを追加", () => {
    useAnalysisStore.getState().addAgentLog({
      id: "log-1",
      phase: "observe",
      message: "テスト",
      timestamp: "2024-01-01T00:00:00Z",
    });
    expect(useAnalysisStore.getState().agentLogs).toHaveLength(1);
  });

  it("clearAgentLogsでログをクリア", () => {
    useAnalysisStore.getState().addAgentLog({
      id: "log-1",
      phase: "observe",
      message: "テスト",
      timestamp: "2024-01-01T00:00:00Z",
    });
    useAnalysisStore.getState().clearAgentLogs();
    expect(useAnalysisStore.getState().agentLogs).toHaveLength(0);
  });

  it("approveInsightでインサイト承認状態を更新", () => {
    useAnalysisStore.getState().setInsights([
      {
        id: "i1",
        title: "テスト",
        summary: "テスト",
        groundingScore: 0.9,
        evidence: [],
        phase: "synthesize",
        approved: undefined,
      },
    ]);
    useAnalysisStore.getState().approveInsight("i1", true);
    expect(useAnalysisStore.getState().insights[0].approved).toBe(true);
  });

  // === 共起ネットワーク ===

  it("setCooccurrenceDataでノードとエッジを設定", () => {
    useAnalysisStore.getState().setCooccurrenceData(
      [{ id: "n1", word: "テスト", frequency: 10, communityId: 0 }],
      [{ source: "n1", target: "n2", weight: 3 }]
    );
    expect(useAnalysisStore.getState().cooccurrenceNodes).toHaveLength(1);
    expect(useAnalysisStore.getState().cooccurrenceEdges).toHaveLength(1);
  });
});
