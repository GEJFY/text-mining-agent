import { useState, useEffect, useRef } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAnalysisStore } from "../../stores/analysisStore";
import { datasetsApi } from "../../api/client";
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
  Palette,
  ChevronDown,
  Sparkles,
  Menu,
  LogOut,
  GitBranch,
  AlertTriangle,
  Target,
  FolderTree,
  Users,
  BookOpen,
} from "lucide-react";
import { useAuthStore } from "../../stores/authStore";

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
    group: "基本分析",
  },
  {
    path: "/analysis/sentiment",
    label: "センチメント分析",
    icon: <Heart size={20} />,
    group: "基本分析",
  },
  {
    path: "/analysis/cooccurrence",
    label: "共起ネットワーク",
    icon: <Network size={20} />,
    group: "基本分析",
  },
  {
    path: "/analysis/causal-chain",
    label: "因果連鎖分析",
    icon: <GitBranch size={20} />,
    group: "高度な分析",
  },
  {
    path: "/analysis/contradiction",
    label: "矛盾検出",
    icon: <AlertTriangle size={20} />,
    group: "高度な分析",
  },
  {
    path: "/analysis/actionability",
    label: "アクショナビリティ",
    icon: <Target size={20} />,
    group: "高度な分析",
  },
  {
    path: "/analysis/taxonomy",
    label: "タクソノミー生成",
    icon: <FolderTree size={20} />,
    group: "高度な分析",
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
  {
    path: "/admin/users",
    label: "ユーザー管理",
    icon: <Users size={20} />,
    group: "管理",
  },
];

/** 折りたたみ可能なグループ名 */
const COLLAPSIBLE_GROUPS = ["基本分析", "高度な分析"];

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { darkMode, toggleDarkMode, datasets, setDatasets, activeDatasetId, setActiveDataset } = useAnalysisStore();
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // グループ展開状態（localStorageで永続化）
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("nexustext-nav-groups");
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return { "基本分析": true, "高度な分析": true };
  });

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = { ...prev, [group]: !prev[group] };
      localStorage.setItem("nexustext-nav-groups", JSON.stringify(next));
      return next;
    });
  };

  // 起動時にパレット設定を復元
  useEffect(() => {
    const palette = localStorage.getItem("nexustext-palette");
    if (palette && palette !== "pwc") {
      document.documentElement.setAttribute("data-palette", palette);
    }
  }, []);

  // 起動時にデータセット一覧を取得
  useEffect(() => {
    datasetsApi.list().then((res) => {
      const list = (res.data.datasets ?? []).map((d: { id: string; name: string; total_rows: number; text_column: string; created_at: string; status: string }) => ({
        id: d.id,
        name: d.name,
        rowCount: d.total_rows,
        columnCount: 0,
        textColumn: d.text_column ?? "",
        createdAt: d.created_at ?? "",
        status: d.status ?? "ready",
      }));
      setDatasets(list);
      if (!activeDatasetId && list.length > 0) {
        setActiveDataset(list[0].id);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 設定ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    if (settingsOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [settingsOpen]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

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
          {groupedItems.map((group, groupIdx) => {
            const isCollapsible = group.group !== null && COLLAPSIBLE_GROUPS.includes(group.group);
            const isExpanded = !isCollapsible || expandedGroups[group.group!] !== false;

            return (
              <div key={groupIdx} className="mb-2">
                {/* グループラベル（折りたたみ対応） */}
                {group.group && !sidebarCollapsed && (
                  isCollapsible ? (
                    <button
                      onClick={() => toggleGroup(group.group!)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      <span>{group.group}</span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
                      />
                    </button>
                  ) : (
                    <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      {group.group}
                    </div>
                  )
                )}
                {group.group && sidebarCollapsed && (
                  <div className="mx-auto my-2 w-6 border-t border-gray-200 dark:border-gray-700" />
                )}

                {/* ナビゲーションリンク（折りたたみ時は非表示） */}
                {(isExpanded || sidebarCollapsed) && group.items.map((item) => (
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
            );
          })}
        </nav>

        {/* サイドバー下部 */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-2">
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

          {/* データセットセレクタ */}
          {datasets.length > 0 && (
            <select
              value={activeDatasetId ?? ""}
              onChange={(e) => setActiveDataset(e.target.value || null)}
              className="ml-4 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1.5 max-w-[200px] truncate"
            >
              <option value="">データセット選択</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.rowCount}行)
                </option>
              ))}
            </select>
          )}

          {/* ヘッダー右側 */}
          <div className="ml-auto flex items-center gap-3">
            {/* テーマ/ダークモード設定 */}
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="btn-ghost"
                title="テーマ設定"
              >
                <Palette size={18} />
              </button>
              {settingsOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 p-4 space-y-4">
                  {/* ダークモード切替 */}
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">モード</span>
                    <button
                      onClick={toggleDarkMode}
                      className="mt-1.5 flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                      {darkMode ? "ライトモード" : "ダークモード"}
                    </button>
                  </div>
                  {/* カラーパレット */}
                  <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">テーマカラー</span>
                    <div className="grid grid-cols-6 gap-2 mt-1.5">
                      {[
                        { id: "pwc", color: "#D04A02", label: "Orange" },
                        { id: "indigo", color: "#6366f1", label: "Indigo" },
                        { id: "teal", color: "#14b8a6", label: "Teal" },
                        { id: "emerald", color: "#10b981", label: "Emerald" },
                        { id: "slate", color: "#64748b", label: "Slate" },
                        { id: "purple", color: "#a855f7", label: "Purple" },
                      ].map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (p.id === "pwc") {
                              document.documentElement.removeAttribute("data-palette");
                            } else {
                              document.documentElement.setAttribute("data-palette", p.id);
                            }
                            localStorage.setItem("nexustext-palette", p.id);
                          }}
                          className="w-7 h-7 rounded-full border-2 border-gray-300 dark:border-gray-600 hover:scale-110 transition-transform"
                          style={{ backgroundColor: p.color }}
                          title={p.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <a
              href={`${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8002"}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
              title="APIドキュメント"
            >
              <BookOpen size={18} />
            </a>
            {user && (
              <span className="text-sm text-gray-600 dark:text-gray-400 hidden sm:inline">
                {user.display_name}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="btn-ghost"
              title="ログアウト"
            >
              <LogOut size={18} />
            </button>
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
