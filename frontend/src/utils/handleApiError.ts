import type { AxiosError } from "axios";
import { useToastStore } from "../stores/toastStore";

/**
 * APIエラーをToast通知として表示するユーティリティ
 * ページコンポーネントの catch ブロックで使用する。
 */
export function handleApiError(error: unknown, fallbackMessage = "エラーが発生しました") {
  const { addToast } = useToastStore.getState();
  const axiosErr = error as AxiosError<{ detail?: string }>;

  if (axiosErr.response) {
    const status = axiosErr.response.status;
    const detail = axiosErr.response.data?.detail;

    if (status === 403) {
      addToast("warning", detail || "この操作を行う権限がありません");
    } else if (status === 422) {
      addToast("warning", detail || "入力内容に問題があります");
    } else if (status === 429) {
      addToast("warning", "リクエストが多すぎます。少し待ってから再試行してください");
    } else if (status >= 500) {
      addToast("error", detail || "サーバーエラーが発生しました");
    } else {
      addToast("error", detail || fallbackMessage);
    }
  } else {
    addToast("error", "サーバーに接続できません");
  }
}
