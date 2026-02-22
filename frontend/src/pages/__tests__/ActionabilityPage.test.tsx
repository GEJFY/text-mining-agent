import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ActionabilityPage from "../ActionabilityPage";
import { useAnalysisStore } from "../../stores/analysisStore";

vi.mock("../../api/client", () => ({
  actionabilityApi: {
    run: vi.fn(),
  },
  datasetsApi: {
    getAttributes: vi.fn().mockResolvedValue({ data: { attributes: [] } }),
  },
}));

import { actionabilityApi } from "../../api/client";

function renderPage() {
  return render(
    <MemoryRouter>
      <ActionabilityPage />
    </MemoryRouter>
  );
}

describe("ActionabilityPage", () => {
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
    expect(screen.getByText("アクショナビリティ分析")).toBeTruthy();
  });

  it("実行ボタンクリックでAPI呼出し→結果表示", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });

    const mockResponse = {
      data: {
        items: [
          {
            record_id: "r1",
            text_preview: "具体的な改善提案",
            overall: 0.85,
            specificity: 0.9,
            urgency: 0.7,
            feasibility: 0.8,
            impact: 0.9,
            category: "immediate",
            suggested_actions: ["対応する"],
          },
        ],
        distribution: { immediate: 1 },
      },
    };
    vi.mocked(actionabilityApi.run).mockResolvedValue(mockResponse as any);

    renderPage();
    fireEvent.click(screen.getByText("アクショナビリティ分析"));

    await waitFor(() => {
      expect(screen.getByText("カテゴリ分布")).toBeTruthy();
    });
    expect(actionabilityApi.run).toHaveBeenCalledWith(
      "ds-001",
      expect.any(Object)
    );
  });

  it("API失敗時にエラー表示", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    vi.mocked(actionabilityApi.run).mockRejectedValue(
      new Error("サーバーエラー")
    );

    renderPage();
    fireEvent.click(screen.getByText("アクショナビリティ分析"));

    await waitFor(() => {
      expect(screen.getByText("分析エラー")).toBeTruthy();
    });
  });
});
