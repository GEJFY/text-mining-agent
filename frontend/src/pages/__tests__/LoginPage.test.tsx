import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "../LoginPage";

vi.mock("../../api/client", () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    me: vi.fn(),
  },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ログインフォームがレンダリングされる", () => {
    renderPage();
    expect(screen.getByText("NexusText AI")).toBeTruthy();
    expect(screen.getByText("テキストマイニングプラットフォーム")).toBeTruthy();
    expect(screen.getByPlaceholderText("user@example.com")).toBeTruthy();
    expect(screen.getByPlaceholderText("6文字以上")).toBeTruthy();
  });

  it("新規登録タブに切り替えると表示名フィールドが表示される", () => {
    renderPage();
    fireEvent.click(screen.getByText("新規登録"));
    expect(screen.getByPlaceholderText("山田 太郎")).toBeTruthy();
    expect(screen.getByText("アカウント作成")).toBeTruthy();
  });

  it("ログインタブではログインボタンが表示される", () => {
    renderPage();
    const buttons = screen.getAllByText("ログイン");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });
});
