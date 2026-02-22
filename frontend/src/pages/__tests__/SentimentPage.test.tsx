import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SentimentPage from "../SentimentPage";
import { useAnalysisStore } from "../../stores/analysisStore";

vi.mock("../../api/client", () => ({
  sentimentApi: {
    run: vi.fn(),
    estimate: vi.fn(),
  },
  datasetsApi: {
    getAttributes: vi.fn().mockResolvedValue({ data: { attributes: [] } }),
  },
}));

import { sentimentApi } from "../../api/client";

function renderPage() {
  return render(
    <MemoryRouter>
      <SentimentPage />
    </MemoryRouter>
  );
}

describe("SentimentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DatasetGuard: データセット未選択時に警告表示", () => {
    useAnalysisStore.setState({ activeDatasetId: null });
    renderPage();
    expect(screen.getByText("データセットが選択されていません")).toBeTruthy();
  });

  it("データセット選択時にセンチメント軸設定と実行ボタン表示", () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    expect(screen.getByText("センチメント軸設定")).toBeTruthy();
    expect(screen.getByText("分析実行")).toBeTruthy();
  });

  it("実行ボタンクリックでAPI呼出し", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });

    const mockResponse = {
      data: {
        results: [
          {
            record_id: "r1",
            text_preview: "良い製品",
            labels: ["ポジティブ"],
            scores: { ポジティブ: 0.9 },
          },
        ],
        distribution: { ポジティブ: 1 },
        axes: ["ポジティブ-ネガティブ"],
        time_series: [],
      },
    };
    vi.mocked(sentimentApi.run).mockResolvedValue(mockResponse as any);

    renderPage();
    fireEvent.click(screen.getByText("分析実行"));

    await waitFor(() => {
      expect(sentimentApi.run).toHaveBeenCalledWith(
        "ds-001",
        expect.any(Object)
      );
    });
  });

  it("コスト見積もりボタンが表示される", () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    expect(screen.getByText("見積もりを計算")).toBeTruthy();
  });
});
