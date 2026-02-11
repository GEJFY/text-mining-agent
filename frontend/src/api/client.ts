import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";

/**
 * NexusText AI バックエンドAPI通信クライアント
 * Axiosインスタンスにインターセプターを設定
 */

// APIベースURL（Viteプロキシ経由）
const API_BASE_URL = "/api/v1";

// Axiosインスタンスの作成
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // タイムアウト: 60秒
  headers: {
    "Content-Type": "application/json",
  },
});

// ========================================
// リクエストインターセプター
// ========================================

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 認証トークンがあれば付与
    const token = localStorage.getItem("nexustext-auth-token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // リクエストのログ出力（開発環境のみ）
    if (import.meta.env.DEV) {
      console.log(
        `[API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`
      );
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// ========================================
// レスポンスインターセプター
// ========================================

apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    // エラーレスポンスのハンドリング
    if (error.response) {
      const status = error.response.status;

      switch (status) {
        case 401:
          // 認証エラー: トークンをクリアしてログインへリダイレクト
          console.warn("[API] 認証エラー: トークンが無効です");
          localStorage.removeItem("nexustext-auth-token");
          break;
        case 403:
          console.warn("[API] アクセス拒否: 権限がありません");
          break;
        case 404:
          console.warn("[API] リソースが見つかりません");
          break;
        case 422:
          console.warn("[API] バリデーションエラー:", error.response.data);
          break;
        case 429:
          console.warn("[API] レート制限: リクエストが多すぎます");
          break;
        case 500:
          console.error("[API] サーバーエラー:", error.response.data);
          break;
        default:
          console.error(`[API] エラー (${status}):`, error.response.data);
      }
    } else if (error.request) {
      // ネットワークエラー
      console.error("[API] ネットワークエラー: サーバーに接続できません");
    }

    return Promise.reject(error);
  }
);

// ========================================
// APIエンドポイント関数
// ========================================

/** データセット関連API */
export const datasetsApi = {
  /** データセット一覧を取得 */
  list: () => apiClient.get("/datasets"),

  /** データセット詳細を取得 */
  get: (id: string) => apiClient.get(`/datasets/${id}`),

  /** データセットをアップロード */
  upload: (file: File, config?: { textColumn?: string }) => {
    const formData = new FormData();
    formData.append("file", file);
    if (config?.textColumn) {
      formData.append("text_column", config.textColumn);
    }
    return apiClient.post("/datasets/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  /** データセットのプレビューを取得 */
  preview: (id: string, limit?: number) =>
    apiClient.get(`/datasets/${id}/preview`, { params: { limit: limit ?? 50 } }),

  /** データセットを削除 */
  delete: (id: string) => apiClient.delete(`/datasets/${id}`),
};

/** クラスタリング関連API */
export const clusterApi = {
  /** クラスタリングを実行 */
  run: (datasetId: string, params: {
    algorithm: string;
    n_clusters?: number;
    min_cluster_size?: number;
    epsilon?: number;
  }) => apiClient.post(`/analysis/cluster/${datasetId}`, params),

  /** クラスタリング結果を取得 */
  results: (datasetId: string) =>
    apiClient.get(`/analysis/cluster/${datasetId}/results`),
};

/** センチメント分析関連API */
export const sentimentApi = {
  /** センチメント分析を実行 */
  run: (datasetId: string, params: {
    axes?: Array<{ positive: string; negative: string }>;
  }) => apiClient.post(`/analysis/sentiment/${datasetId}`, params),

  /** コスト見積もりを取得 */
  estimate: (datasetId: string) =>
    apiClient.get(`/analysis/sentiment/${datasetId}/estimate`),

  /** センチメント結果を取得 */
  results: (datasetId: string) =>
    apiClient.get(`/analysis/sentiment/${datasetId}/results`),
};

/** 共起ネットワーク関連API */
export const cooccurrenceApi = {
  /** 共起ネットワーク分析を実行 */
  run: (datasetId: string, params?: {
    min_frequency?: number;
    window_size?: number;
  }) => apiClient.post(`/analysis/cooccurrence/${datasetId}`, params),

  /** 共起ネットワーク結果を取得 */
  results: (datasetId: string) =>
    apiClient.get(`/analysis/cooccurrence/${datasetId}/results`),
};

/** AIエージェント関連API */
export const agentApi = {
  /** エージェント分析を開始 */
  start: (datasetId: string, query?: string) =>
    apiClient.post(`/agent/start`, { dataset_id: datasetId, query }),

  /** エージェントの状態を取得 */
  status: () => apiClient.get("/agent/status"),

  /** HITL承認を送信 */
  approve: (insightId: string, approved: boolean) =>
    apiClient.post(`/agent/approve`, { insight_id: insightId, approved }),

  /** エージェントを停止 */
  stop: () => apiClient.post("/agent/stop"),
};

/** レポート関連API */
export const reportsApi = {
  /** レポートテンプレート一覧を取得 */
  templates: () => apiClient.get("/reports/templates"),

  /** レポートを生成 */
  generate: (params: {
    dataset_id: string;
    template_id: string;
    format: "pdf" | "html" | "docx" | "pptx";
    sections?: string[];
  }) => apiClient.post("/reports/generate", params),

  /** レポートをダウンロード */
  download: (reportId: string) =>
    apiClient.get(`/reports/${reportId}/download`, {
      responseType: "blob",
    }),
};

/** ダッシュボード関連API */
export const dashboardApi = {
  /** KPIサマリーを取得 */
  summary: () => apiClient.get("/dashboard/summary"),

  /** 最近のアクティビティを取得 */
  activity: () => apiClient.get("/dashboard/activity"),
};

export default apiClient;
