import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ContradictionPage from "../ContradictionPage";
import { useAnalysisStore } from "../../stores/analysisStore";

vi.mock("../../api/client", () => ({
  contradictionApi: {
    run: vi.fn(),
  },
  datasetsApi: {
    getAttributes: vi.fn().mockResolvedValue({ data: { attributes: [] } }),
  },
}));

import { contradictionApi } from "../../api/client";

function renderPage() {
  return render(
    <MemoryRouter>
      <ContradictionPage />
    </MemoryRouter>
  );
}

describe("ContradictionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DatasetGuard: データセット未選択時に警告表示", () => {
    useAnalysisStore.setState({ activeDatasetId: null });
    renderPage();
    expect(screen.getByText("データセットが選択されていません")).toBeTruthy();
  });

  it("データセット選択時に検出設定が表示される", () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    expect(screen.getByText("検出設定")).toBeTruthy();
    expect(screen.getByText("矛盾検出を実行")).toBeTruthy();
  });

  it("実行ボタンクリックでAPI呼出し→結果表示", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });

    const mockResponse = {
      data: {
        contradictions: [
          {
            statement_a: "品質は良い",
            statement_b: "品質は悪い",
            contradiction_type: "direct",
            confidence: 0.9,
            explanation: "直接矛盾",
          },
        ],
      },
    };
    vi.mocked(contradictionApi.run).mockResolvedValue(mockResponse as any);

    renderPage();
    fireEvent.click(screen.getByText("矛盾検出を実行"));

    await waitFor(() => {
      expect(screen.getByText("検出結果サマリー")).toBeTruthy();
    });
    expect(contradictionApi.run).toHaveBeenCalledWith(
      "ds-001",
      expect.any(Object)
    );
  });

  it("API失敗時にエラー表示", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    vi.mocked(contradictionApi.run).mockRejectedValue(
      new Error("サーバーエラー")
    );

    renderPage();
    fireEvent.click(screen.getByText("矛盾検出を実行"));

    await waitFor(() => {
      expect(screen.getByText("分析エラー")).toBeTruthy();
    });
  });
});
