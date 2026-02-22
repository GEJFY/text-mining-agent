import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AgentPage from "../AgentPage";
import { useAnalysisStore } from "../../stores/analysisStore";

// jsdom does not implement scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("../../api/client", () => ({
  agentApi: {
    start: vi.fn(),
    logs: vi.fn(),
    pipeline: vi.fn(),
    saveSession: vi.fn(),
    listSessions: vi
      .fn()
      .mockResolvedValue({ data: { sessions: [], total: 0 } }),
    getSession: vi.fn(),
  },
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

import { agentApi } from "../../api/client";

function renderPage() {
  return render(
    <MemoryRouter>
      <AgentPage />
    </MemoryRouter>
  );
}

describe("AgentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAnalysisStore.setState({ agentSessionState: null });
  });

  it("DatasetGuard: データセット未選択時に警告表示", () => {
    useAnalysisStore.setState({ activeDatasetId: null });
    renderPage();
    expect(screen.getByText("データセットが選択されていません")).toBeTruthy();
  });

  it("データセット選択時にHITLモードと目的入力表示", () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    expect(screen.getAllByText("分析目的").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("HITL制御モード").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("AI分析を開始")).toBeTruthy();
  });

  it("開始ボタンが存在し、クリック可能", () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    const startButton = screen.getByText("AI分析を開始");
    expect(startButton).toBeTruthy();
    expect(startButton.closest("button")).not.toBeNull();
  });

  it("推論ループフェーズラベルが定義されている", () => {
    useAnalysisStore.setState({ activeDatasetId: "ds-001" });
    renderPage();
    // 推論ループのフェーズラベルが存在することを確認
    expect(screen.getByText("推論ループ")).toBeTruthy();
  });
});
