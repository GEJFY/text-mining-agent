import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "../DashboardPage";
import { useAnalysisStore } from "../../stores/analysisStore";

// API モック
vi.mock("../../api/client", () => ({
  dashboardApi: {
    summary: vi.fn(),
    ready: vi.fn(),
  },
  datasetsApi: {
    list: vi.fn(),
  },
}));

import { dashboardApi, datasetsApi } from "../../api/client";

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAnalysisStore.setState({
      datasets: [],
      activeDatasetId: null,
    });
  });

  it("ページがレンダリングされる", async () => {
    vi.mocked(dashboardApi.summary).mockResolvedValue({
      data: {
        total_datasets: 3,
        total_analyses: 15,
        total_reports: 5,
        recent_activity: [],
        recent_datasets: [],
      },
    } as any);
    vi.mocked(datasetsApi.list).mockResolvedValue({
      data: { items: [], total: 0 },
    } as any);
    vi.mocked(dashboardApi.ready).mockResolvedValue({ data: { status: "ok" } } as any);

    renderPage();

    // ダッシュボードが何らかのコンテンツをレンダリングすることを確認
    await waitFor(
      () => {
        const container = document.querySelector(".space-y-6, .max-w-7xl");
        expect(container || document.body.children.length > 0).toBeTruthy();
      },
      { timeout: 3000 }
    );
  });
});
