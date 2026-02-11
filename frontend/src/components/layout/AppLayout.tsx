import { useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useAnalysisStore } from "../../stores/analysisStore";
import {
  LayoutDashboard,
  Upload,
  Layers,
  Heart,
  Network,
  Bot,
  FileText,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Menu,
} from "lucide-react";

/**
 * メインレイアウトコンポーネント
 * サイドバーナビゲーション、ヘッダー、ダークモード切替を含む
 */

/** ナビゲーションアイテム定義 */
interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  group?: string;
}

const navItems: NavItem[] = [
  {
    path: "/dashboard",
    label: "ダッシュボード",
    icon: <LayoutDashboard size={20} />,
  },
  {
    path: "/import",
    label: "データインポート",
    icon: <Upload size={20} />,
  },
  {
    path: "/analysis/cluster",
    label: "クラスタ分析",
    icon: <Layers size={20} />,
    group: "分析",
  },
  {
    path: "/analysis/sentiment",
    label: "センチメント分析",
    icon: <Heart size={20} />,
    group: "分析",
  },
  {
    path: "/analysis/cooccurrence",
    label: "共起ネットワーク",
    icon: <Network size={20} />,
    group: "分析",
  },
  {
    path: "/agent",
    label: "AIエージェント",
    icon: <Bot size={20} />,
  },
  {
    path: "/reports",
    label: "レポート生成",
    icon: <FileText size={20} />,
  },
];

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { darkMode, toggleDarkMode } = useAnalysisStore();
  const location = useLocation();

  // 現在のページタイトルを取得
  const currentPageTitle =
    navItems.find((item) => location.pathname.startsWith(item.path))?.label ??
    "NexusText AI";

  // ナビゲーションアイテムをグループに分類
  const groupedItems = navItems.reduce<
    Array<{ group: string | null; items: NavItem[] }>
  >((acc, item) => {
    const group = item.group ?? null;
    const existing = acc.find((g) => g.group === group);
    if (existing) {
      existing.items.push(item);
    } else {
      acc.push({ group, items: [item] });
    }
    return acc;
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ========================================
          モバイルオーバーレイ
          ======================================== */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ========================================
          サイドバー
          ======================================== */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          flex flex-col
          bg-white dark:bg-gray-900
          border-r border-gray-200 dark:border-gray-800
          transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? "w-16" : "w-64"}
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* ロゴエリア */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-nexus-600 text-white flex-shrink-0">
            <Sparkles size={18} />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-gray-900 dark:text-white truncate">
                NexusText AI
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                v7.0
              </span>
            </div>
          )}
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          {groupedItems.map((group, groupIdx) => (
            <div key={groupIdx} className="mb-2">
              {/* グループラベル */}
              {group.group && !sidebarCollapsed && (
                <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {group.group}
                </div>
              )}
              {group.group && sidebarCollapsed && (
                <div className="mx-auto my-2 w-6 border-t border-gray-200 dark:border-gray-700" />
              )}

              {/* ナビゲーションリンク */}
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5
                     transition-colors duration-200
                     ${
                       isActive
                         ? "bg-nexus-50 dark:bg-nexus-950 text-nexus-700 dark:text-nexus-300 font-medium"
                         : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200"
                     }
                     ${sidebarCollapsed ? "justify-center" : ""}
                    `
                  }
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!sidebarCollapsed && (
                    <span className="text-sm truncate">{item.label}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* サイドバー下部 */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-2">
          {/* ダークモード切替 */}
          <button
            onClick={toggleDarkMode}
            className="btn-ghost w-full justify-start gap-3"
            title={darkMode ? "ライトモードに切替" : "ダークモードに切替"}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            {!sidebarCollapsed && (
              <span className="text-sm">
                {darkMode ? "ライトモード" : "ダークモード"}
              </span>
            )}
          </button>

          {/* 折りたたみボタン */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="btn-ghost w-full justify-start gap-3 hidden lg:flex"
            title={sidebarCollapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={20} />
            ) : (
              <>
                <ChevronLeft size={20} />
                <span className="text-sm">折りたたむ</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ========================================
          メインコンテンツエリア
          ======================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* ヘッダー */}
        <header className="flex items-center gap-4 px-6 h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          {/* モバイルメニューボタン */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="btn-ghost lg:hidden -ml-2"
            aria-label="メニューを開く"
          >
            <Menu size={20} />
          </button>

          {/* ページタイトル */}
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {currentPageTitle}
          </h1>

          {/* ヘッダー右側 */}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
              テキストマイニングプラットフォーム
            </span>
          </div>
        </header>

        {/* ページコンテンツ */}
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
