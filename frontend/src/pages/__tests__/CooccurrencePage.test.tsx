import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CooccurrencePage from "../CooccurrencePage";
import { useAnalysisStore } from "../../stores/analysisStore";

vi.mock("../../api/client", () => ({
  cooccurrenceApi: {
    run: vi.fn(),
    nameCommunities: vi.fn(),
    timeslice: vi.fn(),
  },
  stopwordsApi: {
    get: vi.fn().mockResolvedValue({ data: { ja: [], en: [], custom: [] } }),
    update: vi.fn(),
    reset: vi.fn(),
  },
  datasetsApi: {
    getAttributes: vi.fn().mockResolvedValue({ data: { attributes: [] } }),
  },
}));

import { cooccurrenceApi } from "../../api/client";

function renderPage() {
  return render(
    <MemoryRouter>
      <CooccurrencePage />
    </MemoryRouter>
  );
}

describe("CooccurrencePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DatasetGuard: データセット未選択時に警告表示", () => {
    useAnalysisStore.setState({ activeDatasetId: null });
    renderPage();
    expect(screen.getByText("データセットが選択されていません")).toBeTruthy();
  });

  it("データセット選択時にパラメータ設定と実行ボタン表示", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("パラメータ設定")).toBeTruthy();
    });
    expect(screen.getByText("分析実行")).toBeTruthy();
  });

  it("実行ボタンクリックでAPI呼出し", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });

    vi.mocked(cooccurrenceApi.run).mockResolvedValue({
      data: {
        nodes: [
          { word: "品質", frequency: 10, degree: 3 },
          { word: "改善", frequency: 8, degree: 2 },
        ],
        edges: [{ source: "品質", target: "改善", weight: 5 }],
        communities: [{ id: 0, words: ["品質", "改善"], name: null }],
      },
    } as any);

    renderPage();
    await waitFor(() => {
      expect(screen.getByText("分析実行")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("分析実行"));

    await waitFor(() => {
      expect(cooccurrenceApi.run).toHaveBeenCalledWith(
        "ds-001",
        expect.any(Object)
      );
    });
  });

  it("ストップワード管理セクションが表示される", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("ストップワード管理")).toBeTruthy();
    });
  });
});
