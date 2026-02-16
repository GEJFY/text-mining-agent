import { describe, it, expect, beforeEach } from "vitest";
import { useToastStore } from "./toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("addToastでトーストが追加される", () => {
    useToastStore.getState().addToast("success", "テスト成功");
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("success");
    expect(toasts[0].message).toBe("テスト成功");
  });

  it("removeToastでトーストが削除される", () => {
    useToastStore.getState().addToast("error", "エラー発生");
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("複数のトーストを追加できる", () => {
    const { addToast } = useToastStore.getState();
    addToast("info", "情報1");
    addToast("warning", "警告1");
    addToast("error", "エラー1");
    expect(useToastStore.getState().toasts).toHaveLength(3);
  });
});
