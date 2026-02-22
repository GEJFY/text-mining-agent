import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClusterPage from "../ClusterPage";
import { useAnalysisStore } from "../../stores/analysisStore";

vi.mock("../../api/client", () => ({
  clusterApi: {
    run: vi.fn(),
    compare: vi.fn(),
  },
  stopwordsApi: {
    get: vi.fn().mockResolvedValue({ data: { ja: [], en: [], custom: [] } }),
  },
  datasetsApi: {
    getAttributes: vi.fn().mockResolvedValue({ data: { attributes: [] } }),
  },
}));

import { clusterApi } from "../../api/client";

function renderPage() {
  return render(
    <MemoryRouter>
      <ClusterPage />
    </MemoryRouter>
  );
}

describe("ClusterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DatasetGuard: データセット未選択時に警告表示", () => {
    useAnalysisStore.setState({ activeDatasetId: null });
    renderPage();
    expect(screen.getByText("データセットが選択されていません")).toBeTruthy();
  });

  it("データセット選択時にアルゴリズム設定と実行ボタン表示", () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    expect(screen.getByText("アルゴリズム設定")).toBeTruthy();
    expect(screen.getByText("分析実行")).toBeTruthy();
  });

  it("実行ボタンクリックでAPI呼出し", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });

    vi.mocked(clusterApi.run).mockResolvedValue({
      data: {
        clusters: [
          {
            id: 0,
            label: "クラスタ0",
            size: 30,
            representative_texts: ["テスト文"],
            keywords: ["品質"],
            coherence_score: 0.8,
          },
        ],
        scatter: [{ x: 1.0, y: 2.0, cluster: 0, text: "テスト" }],
        silhouette_score: 0.65,
        noise_count: 0,
        total_points: 30,
      },
    } as any);

    renderPage();
    fireEvent.click(screen.getByText("分析実行"));

    await waitFor(() => {
      expect(clusterApi.run).toHaveBeenCalledWith(
        "ds-001",
        expect.any(Object)
      );
    });
  });

  it("アルゴリズム選択肢が表示される", () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    expect(screen.getAllByText("K-Means").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("HDBSCAN").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("GMM").length).toBeGreaterThanOrEqual(1);
  });
});
