import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, LogIn, UserPlus, Loader2 } from "lucide-react";
import { useAuthStore } from "../stores/authStore";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const { login, register, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
      navigate("/dashboard", { replace: true });
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        {/* ロゴ */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-nexus-600 text-white mb-4">
            <Sparkles size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            NexusText AI
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            テキストマイニングプラットフォーム
          </p>
        </div>

        {/* カード */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          {/* タブ */}
          <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1 mb-6">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "login"
                  ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <LogIn size={16} />
              ログイン
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "register"
                  ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <UserPlus size={16} />
              新規登録
            </button>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* フォーム */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  表示名
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2.5 text-sm focus:ring-2 focus:ring-nexus-500 focus:border-transparent outline-none transition-shadow"
                  placeholder="山田 太郎"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2.5 text-sm focus:ring-2 focus:ring-nexus-500 focus:border-transparent outline-none transition-shadow"
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-4 py-2.5 text-sm focus:ring-2 focus:ring-nexus-500 focus:border-transparent outline-none transition-shadow"
                placeholder="6文字以上"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-nexus-600 hover:bg-nexus-700 text-white font-medium text-sm disabled:opacity-50 transition-colors"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : mode === "login" ? (
                <LogIn size={18} />
              ) : (
                <UserPlus size={18} />
              )}
              {isLoading
                ? "処理中..."
                : mode === "login"
                  ? "ログイン"
                  : "アカウント作成"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
