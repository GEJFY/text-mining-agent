import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Database,
  Layers,
  FileText,
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { dashboardApi } from "../api/client";
import { getThemeColors } from "../hooks/useThemeColors";

/**
 * ダッシュボードページ
 * KPIカード、分析ジョブ分布、最近のアクティビティをAPIから取得して表示
 */

const PIE_COLORS = getThemeColors().slice(0, 5);

/** 分析タイプの日本語ラベル */
const ANALYSIS_TYPE_LABELS: Record<string, string> = {
  cluster: "クラスタ分析",
  sentiment: "センチメント分析",
  cooccurrence: "共起ネットワーク",
  agent: "AIエージェント",
};

/** ステータスの日本語ラベル */
const STATUS_LABELS: Record<string, string> = {
  completed: "完了",
  pending: "待機中",
  processing: "実行中",
  failed: "失敗",
};

interface KpiData {
  dataset_count: number;
  record_count: number;
  cluster_jobs: number;
  sentiment_jobs: number;
  cooccurrence_jobs: number;
  total_jobs: number;
}

interface ActivityItem {
  id: string;
  analysis_type: string;
  dataset_name: string;
  status: string;
  created_at: string | null;
}

interface DatasetItem {
  id: string;
  name: string;
  total_rows: number;
  status: string;
  created_at: string | null;
}

function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await dashboardApi.summary();
      const data = response.data;
      setKpi(data.kpi);
      setActivity(data.recent_activity ?? []);
      setDatasets(data.recent_datasets ?? []);
    } catch {
      setError("ダッシュボードデータの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ジョブ分布チャート用データ
  const jobDistribution =
    kpi
      ? [
          { name: "クラスタ", count: kpi.cluster_jobs, fill: PIE_COLORS[0] },
          {
            name: "センチメント",
            count: kpi.sentiment_jobs,
            fill: PIE_COLORS[1],
          },
          {
            name: "共起ネットワーク",
            count: kpi.cooccurrence_jobs,
            fill: PIE_COLORS[2],
          },
        ].filter((d) => d.count > 0)
      : [];

  // データセット別レコード数バーチャート
  const datasetBars = datasets.map((d) => ({
    name: d.name.length > 10 ? d.name.substring(0, 10) + "..." : d.name,
    count: d.total_rows,
  }));

  if (loading) {
    return (
      <div className="w-full flex flex-col items-center justify-center h-64">
        <Loader2 size={36} className="animate-spin text-nexus-500 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="card p-8 flex flex-col items-center text-center">
          <AlertCircle size={36} className="text-red-500 mb-3" />
          <p className="text-gray-700 dark:text-gray-300">{error}</p>
          <button onClick={fetchData} className="btn-primary mt-4">
            <RefreshCw size={16} />
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* ========================================
          KPIカード
          ======================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <Database size={24} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {kpi?.dataset_count ?? 0}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              登録データセット
            </p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
              <Layers size={24} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {kpi?.total_jobs ?? 0}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              分析ジョブ完了
            </p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
              <FileText size={24} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {(kpi?.record_count ?? 0).toLocaleString()}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              テキストレコード
            </p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <Activity size={24} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {kpi?.cluster_jobs ?? 0} / {kpi?.sentiment_jobs ?? 0}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              クラスタ / センチメント
            </p>
          </div>
        </div>
      </div>

      {/* ========================================
          チャートエリア
          ======================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* データセット別レコード数 */}
        <div className="card p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            データセット別レコード数
          </h3>
          {datasetBars.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={datasetBars}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                  className="dark:stroke-gray-700"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "none",
                    borderRadius: "8px",
                    color: "#f3f4f6",
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                  name="レコード数"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Database size={36} className="mb-3 opacity-50" />
              <p className="text-sm">データセットがありません</p>
            </div>
          )}
        </div>

        {/* 分析ジョブ分布 */}
        <div className="card p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            分析ジョブ分布
          </h3>
          {jobDistribution.length > 0 ? (
            <div className="flex items-center">
              <ResponsiveContainer width="50%" height={280}>
                <PieChart>
                  <Pie
                    data={jobDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="count"
                  >
                    {jobDistribution.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "none",
                      borderRadius: "8px",
                      color: "#f3f4f6",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-1/2 space-y-3">
                {jobDistribution.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          PIE_COLORS[index % PIE_COLORS.length],
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                        {item.name}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Layers size={36} className="mb-3 opacity-50" />
              <p className="text-sm">分析ジョブがありません</p>
            </div>
          )}
        </div>
      </div>

      {/* ========================================
          最近のアクティビティ
          ======================================== */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            最近のアクティビティ
          </h3>
          <button onClick={fetchData} className="btn-ghost text-sm">
            <RefreshCw size={14} />
            更新
          </button>
        </div>
        {activity.length > 0 ? (
          <div className="space-y-3">
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex-shrink-0">
                  {item.status === "completed" ? (
                    <CheckCircle2
                      size={20}
                      className="text-emerald-500"
                    />
                  ) : item.status === "processing" ||
                    item.status === "pending" ? (
                    <Clock
                      size={20}
                      className="text-amber-500 animate-pulse"
                    />
                  ) : (
                    <AlertCircle size={20} className="text-red-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {ANALYSIS_TYPE_LABELS[item.analysis_type] ??
                      item.analysis_type}{" "}
                    - {STATUS_LABELS[item.status] ?? item.status}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {item.dataset_name}
                  </p>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {item.created_at
                    ? new Date(item.created_at).toLocaleString("ja-JP", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Activity size={36} className="mb-3 opacity-50" />
            <p className="text-sm">アクティビティがありません</p>
            <p className="text-xs mt-1">
              データをインポートして分析を実行してください
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;
