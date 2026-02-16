import { describe, it, expect, beforeEach } from "vitest";
import type { AxiosError, AxiosResponse } from "axios";
import { handleApiError } from "./handleApiError";
import { useToastStore } from "../stores/toastStore";

function makeAxiosError(status: number, detail?: string): AxiosError {
  return {
    response: {
      status,
      data: detail ? { detail } : {},
    } as AxiosResponse,
    isAxiosError: true,
  } as AxiosError;
}

describe("handleApiError", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("403エラーでwarningトーストが表示される", () => {
    handleApiError(makeAxiosError(403, "権限不足"));
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("warning");
    expect(toasts[0].message).toBe("権限不足");
  });

  it("500エラーでerrorトーストが表示される", () => {
    handleApiError(makeAxiosError(500));
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("error");
  });

  it("ネットワークエラーで接続エラーメッセージが表示される", () => {
    handleApiError({ request: {} } as AxiosError);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("サーバーに接続できません");
  });
});
