import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TaxonomyPage from "../TaxonomyPage";
import { useAnalysisStore } from "../../stores/analysisStore";

vi.mock("../../api/client", () => ({
  taxonomyApi: {
    run: vi.fn(),
  },
  datasetsApi: {
    getAttributes: vi.fn().mockResolvedValue({ data: { attributes: [] } }),
  },
}));

import { taxonomyApi } from "../../api/client";

function renderPage() {
  return render(
    <MemoryRouter>
      <TaxonomyPage />
    </MemoryRouter>
  );
}

describe("TaxonomyPage", () => {
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
    expect(screen.getByText("生成設定")).toBeTruthy();
    expect(screen.getByText("タクソノミー生成")).toBeTruthy();
  });

  it("実行ボタンクリックでAPI呼出し→結果表示", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });

    const mockResponse = {
      data: {
        root_categories: [
          {
            name: "製品品質",
            description: "製品の品質に関するフィードバック",
            text_count: 30,
            text_indices: [0, 1, 2],
            children: [
              {
                name: "耐久性",
                text_count: 15,
                children: [],
              },
            ],
          },
        ],
        uncategorized_count: 5,
      },
    };
    vi.mocked(taxonomyApi.run).mockResolvedValue(mockResponse as any);

    renderPage();
    fireEvent.click(screen.getByText("タクソノミー生成"));

    await waitFor(() => {
      expect(screen.getByText("生成結果サマリー")).toBeTruthy();
    });
    expect(taxonomyApi.run).toHaveBeenCalledWith("ds-001", expect.any(Object));
  });

  it("API失敗時にエラー表示", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    vi.mocked(taxonomyApi.run).mockRejectedValue(
      new Error("サーバーエラー")
    );

    renderPage();
    fireEvent.click(screen.getByText("タクソノミー生成"));

    await waitFor(() => {
      expect(screen.getByText("分析エラー")).toBeTruthy();
    });
  });
});
