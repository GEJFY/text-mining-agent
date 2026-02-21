import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CausalChainPage from "../CausalChainPage";
import { useAnalysisStore } from "../../stores/analysisStore";

// API モック
vi.mock("../../api/client", () => ({
  causalChainApi: {
    run: vi.fn(),
  },
}));

import { causalChainApi } from "../../api/client";

function renderPage() {
  return render(
    <MemoryRouter>
      <CausalChainPage />
    </MemoryRouter>
  );
}

describe("CausalChainPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DatasetGuard: データセット未選択時に警告表示", () => {
    useAnalysisStore.setState({ activeDatasetId: null });
    renderPage();
    expect(screen.getByText("データセットが選択されていません")).toBeTruthy();
  });

  it("データセット選択時に分析設定が表示される", () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    expect(screen.getByText("分析設定")).toBeTruthy();
    expect(screen.getByText("因果連鎖分析を実行")).toBeTruthy();
  });

  it("実行ボタンクリックでAPI呼出し→結果表示", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });

    const mockResponse = {
      data: {
        chains: [
          {
            chain: ["品質低下", "顧客不満", "解約増加"],
            confidence: 0.85,
            supporting_text_indices: [0, 1],
            explanation: "品質低下が顧客不満を引き起こし解約に至る",
          },
        ],
      },
    };
    vi.mocked(causalChainApi.run).mockResolvedValue(mockResponse as any);

    renderPage();
    fireEvent.click(screen.getByText("因果連鎖分析を実行"));

    await waitFor(() => {
      expect(screen.getByText("分析結果サマリー")).toBeTruthy();
    });
    expect(causalChainApi.run).toHaveBeenCalledWith("ds-001", expect.any(Object));
  });

  it("API失敗時にエラー表示", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    vi.mocked(causalChainApi.run).mockRejectedValue(
      new Error("サーバーエラー")
    );

    renderPage();
    fireEvent.click(screen.getByText("因果連鎖分析を実行"));

    await waitFor(() => {
      expect(screen.getByText("分析エラー")).toBeTruthy();
    });
  });
});
