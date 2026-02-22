import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "../LandingPage";

vi.mock("../../api/client", () => ({}));

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe("LandingPage", () => {
  it("ヒーローセクションと機能カードがレンダリングされる", () => {
    renderPage();
    expect(screen.getByText("NexusText AI")).toBeTruthy();
    expect(
      screen.getByText("AI駆動テキストマイニングプラットフォーム")
    ).toBeTruthy();
    expect(screen.getByText("クラスタ分析")).toBeTruthy();
    expect(screen.getByText("センチメント分析")).toBeTruthy();
    expect(screen.getByText("共起ネットワーク")).toBeTruthy();
  });

  it("CTAボタンが表示される", () => {
    renderPage();
    const loginButtons = screen.getAllByText("ログイン");
    expect(loginButtons.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("無料で始める")).toBeTruthy();
  });
});
