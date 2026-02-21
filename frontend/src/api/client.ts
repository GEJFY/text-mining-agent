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
  timeout: 300000, // タイムアウト: 300秒（分析処理は重いため余裕を持つ）
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
// レスポンスインターセプター（自動トークンリフレッシュ付き）
// ========================================

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token);
    } else {
      prom.reject(error);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 401かつリフレッシュ未試行の場合、トークンリフレッシュを試みる
    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== "/auth/refresh" && originalRequest.url !== "/auth/login") {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          }, reject });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await apiClient.post("/auth/refresh");
        const newToken = data.access_token;
        localStorage.setItem("nexustext-auth-token", newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return apiClient(originalRequest);
      } catch {
        processQueue(error, null);
        localStorage.removeItem("nexustext-auth-token");
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // その他のエラーハンドリング
    if (error.response) {
      const status = error.response.status;

      switch (status) {
        case 401:
          localStorage.removeItem("nexustext-auth-token");
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
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
  list: () => apiClient.get("/data/datasets"),

  /** データセットをアップロード */
  upload: (file: File, config?: { textColumn?: string }) => {
    const formData = new FormData();
    formData.append("file", file);
    if (config?.textColumn) {
      formData.append("text_column", config.textColumn);
    }
    return apiClient.post("/data/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

/** クラスタリング関連API */
export const clusterApi = {
  /** クラスタリングを実行 */
  run: (datasetId: string, params: {
    algorithm: string;
    n_clusters?: number;
    min_cluster_size?: number;
    epsilon?: number;
  }) => apiClient.post("/analysis/cluster", {
    dataset_id: datasetId,
    ...params,
  }),

  /** クラスター比較 */
  compare: (datasetId: string, clusterA: number, clusterB: number) =>
    apiClient.post("/analysis/cluster/compare", null, {
      params: { dataset_id: datasetId, cluster_a: clusterA, cluster_b: clusterB },
    }),
};

/** センチメント分析関連API */
export const sentimentApi = {
  /** センチメント分析を実行 */
  run: (datasetId: string, params?: {
    mode?: string;
    custom_axes?: Array<{ name: string; description: string }>;
  }) => apiClient.post("/analysis/sentiment", {
    dataset_id: datasetId,
    ...params,
  }),

  /** コスト見積もりを取得 */
  estimate: (datasetId: string) =>
    apiClient.post("/analysis/sentiment/estimate", {
      dataset_id: datasetId,
    }),
};

/** 共起ネットワーク関連API */
export const cooccurrenceApi = {
  /** 共起ネットワーク分析を実行 */
  run: (datasetId: string, params?: {
    min_frequency?: number;
    window_size?: number;
  }) => apiClient.post("/analysis/cooccurrence", {
    dataset_id: datasetId,
    ...params,
  }),

  /** 時間スライス分析 */
  timeslice: (datasetId: string, params?: {
    min_frequency?: number;
    window_size?: number;
    time_interval?: string;
  }) => apiClient.post("/analysis/cooccurrence/timeslice", {
    dataset_id: datasetId,
    time_slice: true,
    ...params,
  }),
};

/** AIエージェント関連API */
export const agentApi = {
  /** エージェント分析を開始 */
  start: (datasetId: string, objective?: string, hitlMode?: string) =>
    apiClient.post("/agent/start", {
      dataset_id: datasetId,
      objective: objective ?? "",
      hitl_mode: hitlMode ?? "full_auto",
    }),

  /** HITL承認を送信 */
  approve: (agentId: string, approvedHypotheses: string[]) =>
    apiClient.post(`/agent/${agentId}/approve`, null, {
      params: { approved_hypotheses: approvedHypotheses },
    }),

  /** エージェントのログを取得 */
  logs: (agentId: string) => apiClient.get(`/agent/${agentId}/logs`),

  /** Agent→Analysis→Report自動パイプライン */
  pipeline: (params: {
    dataset_id: string;
    objective?: string;
    template?: string;
    output_format?: string;
  }) => apiClient.post("/agent/pipeline", params),
};

/** レポート関連API */
export const reportsApi = {
  /** レポートを生成 */
  generate: (params: {
    dataset_id: string;
    template?: string;
    output_format?: string;
    custom_prompt?: string;
  }) => apiClient.post("/reports/generate", params),

  /** レポートをダウンロード */
  download: (reportId: string) =>
    apiClient.get(`/reports/${reportId}/download`, {
      responseType: "blob",
    }),
};

/** 認証関連API */
export const authApi = {
  /** ユーザー登録 */
  register: (email: string, password: string, displayName: string) =>
    apiClient.post("/auth/register", {
      email,
      password,
      display_name: displayName,
    }),

  /** ログイン */
  login: (email: string, password: string) =>
    apiClient.post("/auth/login", { email, password }),

  /** トークンリフレッシュ */
  refresh: () => apiClient.post("/auth/refresh"),

  /** 現在のユーザー情報を取得 */
  me: () => apiClient.get("/auth/me"),
};

/** ダッシュボード関連API */
export const dashboardApi = {
  /** KPIサマリーを取得 */
  summary: () => apiClient.get("/dashboard/summary"),

  /** ヘルスチェック */
  ready: () => apiClient.get("/health/ready"),
};

/** 因果連鎖分析API */
export const causalChainApi = {
  run: (datasetId: string, params?: { max_chains?: number; focus_topic?: string }) =>
    apiClient.post("/analysis/causal-chain", { dataset_id: datasetId, ...params }),
};

/** 矛盾検出API */
export const contradictionApi = {
  run: (datasetId: string, params?: { sensitivity?: string }) =>
    apiClient.post("/analysis/contradiction", { dataset_id: datasetId, ...params }),
};

/** アクショナビリティスコアリングAPI */
export const actionabilityApi = {
  run: (datasetId: string, params?: { context?: string }) =>
    apiClient.post("/analysis/actionability", { dataset_id: datasetId, ...params }),
};

/** タクソノミー生成API */
export const taxonomyApi = {
  run: (datasetId: string, params?: { max_depth?: number; max_categories?: number }) =>
    apiClient.post("/analysis/taxonomy", { dataset_id: datasetId, ...params }),
};

/** 類似検索API */
export const similarityApi = {
  /** テキスト類似性検索 */
  search: (datasetId: string, query: string, topK?: number) =>
    apiClient.post("/analysis/similarity/search", null, {
      params: { dataset_id: datasetId, query, top_k: topK ?? 10 },
    }),
};

export default apiClient;
