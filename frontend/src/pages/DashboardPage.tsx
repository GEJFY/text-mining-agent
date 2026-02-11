import { useState } from "react";
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
  LineChart,
  Line,
} from "recharts";
import {
  Database,
  Layers,
  Heart,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";

/**
 * ダッシュボードページ
 * KPIカード、サマリーチャート、最近のアクティビティを表示
 */

// サンプルKPIデータ
const kpiData = [
  {
    label: "登録データセット",
    value: "12",
    change: "+3",
    changeType: "positive" as const,
    icon: <Database size={24} />,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950",
  },
  {
    label: "クラスタ分析完了",
    value: "8",
    change: "+2",
    changeType: "positive" as const,
    icon: <Layers size={24} />,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950",
  },
  {
    label: "センチメント分析済",
    value: "2,450",
    change: "+180",
    changeType: "positive" as const,
    icon: <Heart size={24} />,
    color: "text-rose-600 dark:text-rose-400",
    bgColor: "bg-rose-50 dark:bg-rose-950",
  },
  {
    label: "生成インサイト",
    value: "34",
    change: "+7",
    changeType: "positive" as const,
    icon: <TrendingUp size={24} />,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950",
  },
];

// サンプルクラスタ分布データ
const clusterDistribution = [
  { name: "製品品質", count: 342, fill: "#6366f1" },
  { name: "カスタマーサポート", count: 256, fill: "#8b5cf6" },
  { name: "価格・コスト", count: 198, fill: "#a78bfa" },
  { name: "配送・物流", count: 167, fill: "#c4b5fd" },
  { name: "その他", count: 87, fill: "#ddd6fe" },
];

// サンプルセンチメントトレンド
const sentimentTrend = [
  { date: "1月", positive: 65, negative: 20, neutral: 15 },
  { date: "2月", positive: 59, negative: 25, neutral: 16 },
  { date: "3月", positive: 70, negative: 18, neutral: 12 },
  { date: "4月", positive: 62, negative: 22, neutral: 16 },
  { date: "5月", positive: 75, negative: 15, neutral: 10 },
  { date: "6月", positive: 68, negative: 20, neutral: 12 },
];

// サンプル月別処理件数
const monthlyProcessing = [
  { month: "1月", count: 120 },
  { month: "2月", count: 180 },
  { month: "3月", count: 250 },
  { month: "4月", count: 200 },
  { month: "5月", count: 320 },
  { month: "6月", count: 280 },
];

// サンプル最近のアクティビティ
const recentActivity = [
  {
    id: "1",
    action: "クラスタ分析完了",
    dataset: "顧客フィードバック_2024Q2",
    time: "5分前",
    status: "completed" as const,
  },
  {
    id: "2",
    action: "データインポート",
    dataset: "SNS投稿データ_0610",
    time: "23分前",
    status: "completed" as const,
  },
  {
    id: "3",
    action: "センチメント分析実行中",
    dataset: "製品レビュー_全期間",
    time: "1時間前",
    status: "processing" as const,
  },
  {
    id: "4",
    action: "AIエージェント分析完了",
    dataset: "アンケート回答_2024",
    time: "3時間前",
    status: "completed" as const,
  },
  {
    id: "5",
    action: "レポート生成",
    dataset: "月次サマリー_6月",
    time: "5時間前",
    status: "completed" as const,
  },
];

// パイチャートの色
const PIE_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

function DashboardPage() {
  const [_selectedPeriod] = useState("month");

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ========================================
          KPIカード
          ======================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi) => (
          <div key={kpi.label} className="kpi-card">
            <div className="flex items-center justify-between">
              <div
                className={`p-2.5 rounded-lg ${kpi.bgColor} ${kpi.color}`}
              >
                {kpi.icon}
              </div>
              <span className="badge-positive flex items-center gap-1">
                <ArrowUpRight size={12} />
                {kpi.change}
              </span>
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {kpi.value}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {kpi.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ========================================
          チャートエリア
          ======================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* センチメントトレンドチャート */}
        <div className="card p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            センチメントトレンド
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={sentimentTrend}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                className="dark:stroke-gray-700"
              />
              <XAxis
                dataKey="date"
                tick={{ fill: "#9ca3af", fontSize: 12 }}
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
              <Line
                type="monotone"
                dataKey="positive"
                stroke="#10b981"
                strokeWidth={2}
                name="ポジティブ"
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="negative"
                stroke="#ef4444"
                strokeWidth={2}
                name="ネガティブ"
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="neutral"
                stroke="#6b7280"
                strokeWidth={2}
                name="ニュートラル"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* クラスタ分布チャート */}
        <div className="card p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            クラスタ分布
          </h3>
          <div className="flex items-center">
            <ResponsiveContainer width="50%" height={280}>
              <PieChart>
                <Pie
                  data={clusterDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="count"
                >
                  {clusterDistribution.map((_entry, index) => (
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
              {clusterDistribution.map((item, index) => (
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
        </div>
      </div>

      {/* ========================================
          下段: 月別処理件数 + アクティビティ
          ======================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 月別処理件数バーチャート */}
        <div className="card p-6 lg:col-span-1">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            月別処理件数
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyProcessing}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e5e7eb"
                className="dark:stroke-gray-700"
              />
              <XAxis
                dataKey="month"
                tick={{ fill: "#9ca3af", fontSize: 12 }}
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
                name="処理件数"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 最近のアクティビティ */}
        <div className="card p-6 lg:col-span-2">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
            最近のアクティビティ
          </h3>
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
              >
                {/* ステータスアイコン */}
                <div className="flex-shrink-0">
                  {activity.status === "completed" ? (
                    <CheckCircle2
                      size={20}
                      className="text-emerald-500"
                    />
                  ) : activity.status === "processing" ? (
                    <Clock
                      size={20}
                      className="text-amber-500 animate-pulse"
                    />
                  ) : (
                    <AlertCircle size={20} className="text-red-500" />
                  )}
                </div>

                {/* アクション情報 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {activity.action}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {activity.dataset}
                  </p>
                </div>

                {/* 時刻 */}
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {activity.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
