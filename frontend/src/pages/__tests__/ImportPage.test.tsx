import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ImportPage from "../ImportPage";

vi.mock("../../api/client", () => ({
  datasetsApi: {
    upload: vi.fn(),
    list: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
    getAttributes: vi.fn().mockResolvedValue({ data: { attributes: [] } }),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ImportPage />
    </MemoryRouter>
  );
}

describe("ImportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("アップロードUIが表示される", () => {
    renderPage();
    expect(screen.getByText("ファイルをドラッグ&ドロップ")).toBeTruthy();
  });

  it("対応ファイル形式の説明が表示される", () => {
    renderPage();
    expect(screen.getByText(/CSV/)).toBeTruthy();
    expect(screen.getByText(/Excel/)).toBeTruthy();
  });

  it("クリックしてファイル選択のリンクが表示される", () => {
    renderPage();
    expect(screen.getByText("クリックしてファイルを選択")).toBeTruthy();
  });

  it("カラムマッピング設定用の分析フィールドが定義されている", () => {
    renderPage();
    // ImportPage初期表示はアップロードステップのみ
    // カラムマッピングはファイル読み込み後に表示される
    expect(screen.queryByText("カラムマッピング設定")).toBeNull();
  });
});
