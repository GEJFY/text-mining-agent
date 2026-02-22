import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReportsPage from "../ReportsPage";
import { useAnalysisStore } from "../../stores/analysisStore";

vi.mock("../../api/client", () => ({
  reportsApi: {
    generate: vi.fn(),
    download: vi.fn(),
  },
  datasetsApi: {
    getAttributes: vi.fn().mockResolvedValue({ data: { attributes: [] } }),
  },
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>
  );
}

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DatasetGuard: データセット未選択時に警告表示", () => {
    useAnalysisStore.setState({ activeDatasetId: null });
    renderPage();
    expect(screen.getByText("データセットが選択されていません")).toBeTruthy();
  });

  it("データセット選択時にテンプレート選択と出力形式表示", () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    expect(screen.getByText("テンプレート選択")).toBeTruthy();
    expect(screen.getByText("出力形式")).toBeTruthy();
    expect(screen.getByText("レポートを生成")).toBeTruthy();
  });

  it("カスタムプロンプトtextareaが表示される", () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    expect(screen.getByText("レポート指示プロンプト")).toBeTruthy();
    const textarea = screen.getByPlaceholderText(
      "このデータから○○の観点でレポートを作成してください..."
    );
    expect(textarea).toBeTruthy();
  });

  it("生成済みレポートセクションが表示される", async () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("生成済みレポート")).toBeTruthy();
    });
  });
});
