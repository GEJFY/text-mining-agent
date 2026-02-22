import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "../authStore";

vi.mock("../../api/client", () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    me: vi.fn(),
  },
}));

import { authApi } from "../../api/client";

describe("authStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, token: null, error: null, isLoading: false });
    localStorage.clear();
  });

  it("初期状態: user=null, token=null", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.error).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it("login成功: user, tokenが設定される", async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      data: {
        access_token: "test-token",
        user_id: "u1",
        display_name: "テスト",
        role: "analyst",
      },
    } as any);

    await useAuthStore.getState().login("test@example.com", "password");

    const state = useAuthStore.getState();
    expect(state.token).toBe("test-token");
    expect(state.user?.email).toBe("test@example.com");
    expect(state.user?.role).toBe("analyst");
    expect(state.isLoading).toBe(false);
  });

  it("logout: user, tokenがクリアされる", () => {
    useAuthStore.setState({
      user: { user_id: "u1", email: "t@t.com", display_name: "T", role: "analyst" },
      token: "token",
    });

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });

  it("login失敗: エラーメッセージが設定される", async () => {
    vi.mocked(authApi.login).mockRejectedValue({
      response: { data: { detail: "認証エラー" } },
    });

    await expect(
      useAuthStore.getState().login("bad@example.com", "wrong")
    ).rejects.toBeTruthy();

    const state = useAuthStore.getState();
    expect(state.error).toBe("認証エラー");
    expect(state.isLoading).toBe(false);
  });
});
