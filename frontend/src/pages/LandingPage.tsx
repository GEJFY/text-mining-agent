import { useNavigate } from "react-router-dom";
import {
  Layers,
  Heart,
  Network,
  GitBranch,
  Target,
  FolderTree,
  ArrowRight,
  Sparkles,
  Shield,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: <Layers size={28} />,
    title: "クラスタ分析",
    desc: "K-Means / HDBSCAN / GMM による自動テキスト分類。UMAP次元削減と散布図可視化でデータの全体像を把握。",
  },
  {
    icon: <Heart size={28} />,
    title: "センチメント分析",
    desc: "LLMベースの高精度感情分析。カスタム軸やマルチラベル対応でビジネスに最適化した分類が可能。",
  },
  {
    icon: <Network size={28} />,
    title: "共起ネットワーク",
    desc: "D3.jsフォースグラフによる単語の共起関係可視化。コミュニティ検出とワードクラウドで話題を構造化。",
  },
  {
    icon: <GitBranch size={28} />,
    title: "因果連鎖分析",
    desc: "テキストから原因→結果→影響の因果連鎖をLLMで抽出。根本原因の特定と問題の連鎖を可視化。",
  },
  {
    icon: <Target size={28} />,
    title: "アクショナビリティ",
    desc: "具体性・緊急度・実現可能性・インパクトの多次元スコアリングでアクション優先度を自動判定。",
  },
  {
    icon: <FolderTree size={28} />,
    title: "タクソノミー生成",
    desc: "テキストデータからカテゴリ階層を自動生成。データの構造化と分類体系の構築を支援。",
  },
];

const STATS = [
  { label: "分析手法", value: "9+" },
  { label: "対応フォーマット", value: "7種類" },
  { label: "LLM統合", value: "Azure AI" },
  { label: "セキュリティ", value: "RBAC" },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#D04A02] via-[#E87722] to-[#D04A02] opacity-95" />
        <div className="relative max-w-6xl mx-auto px-6 py-20 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Sparkles size={28} className="text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
              NexusText AI
            </h1>
          </div>
          <p className="text-xl md:text-2xl text-white/90 mb-4 max-w-2xl mx-auto">
            AI駆動テキストマイニングプラットフォーム
          </p>
          <p className="text-base text-white/70 mb-10 max-w-xl mx-auto">
            大量のテキストデータからインサイトを発見。
            クラスタリング、センチメント分析、因果連鎖、タクソノミーまで一気通貫で分析。
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => navigate("/login")}
              className="px-8 py-3 bg-white text-[#D04A02] font-semibold rounded-lg hover:bg-white/90 transition-colors flex items-center gap-2"
            >
              ログイン
              <ArrowRight size={18} />
            </button>
            <button
              onClick={() => navigate("/login")}
              className="px-8 py-3 border-2 border-white/50 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors"
            >
              新規登録
            </button>
          </div>
        </div>
      </header>

      {/* 統計バー */}
      <div className="bg-gray-50 dark:bg-gray-900 border-y border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold text-[#D04A02]">{s.value}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 機能カード */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-3">
          主要機能
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-center mb-12 max-w-lg mx-auto">
          テキストマイニングに必要な全ての分析を、一つのプラットフォームで実行可能
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 hover:shadow-lg hover:border-[#D04A02]/30 transition-all group"
            >
              <div className="w-12 h-12 rounded-lg bg-[#D04A02]/10 text-[#D04A02] flex items-center justify-center mb-4 group-hover:bg-[#D04A02] group-hover:text-white transition-colors">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {f.title}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 特長 */}
      <section className="bg-gray-50 dark:bg-gray-900 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <Zap size={32} className="text-[#D04A02] mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">高速分析</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Azure AI Foundryとの連携で大規模テキストの高速処理を実現
              </p>
            </div>
            <div className="text-center">
              <Shield size={32} className="text-[#D04A02] mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">エンタープライズ対応</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                RBAC認証、PII検出、監査ログで企業レベルのセキュリティ
              </p>
            </div>
            <div className="text-center">
              <Sparkles size={32} className="text-[#D04A02] mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AIエージェント</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                自律型AIエージェントがデータを探索し、インサイトを自動発見
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          テキストデータの価値を最大化しませんか？
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          今すぐ無料で始められます
        </p>
        <button
          onClick={() => navigate("/login")}
          className="px-10 py-4 bg-[#D04A02] text-white font-semibold rounded-lg hover:bg-[#B53D02] transition-colors text-lg"
        >
          無料で始める
        </button>
      </section>

      {/* フッター */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-gray-500 dark:text-gray-400">
          &copy; 2026 NexusText AI. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
