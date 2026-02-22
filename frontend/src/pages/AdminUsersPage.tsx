import { useState, useEffect } from "react";
import { Users, Shield, ShieldOff, KeyRound } from "lucide-react";
import { adminApi } from "../api/client";

interface UserItem {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  created_at: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  analyst: "アナリスト",
  viewer: "閲覧者",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  analyst: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const loadUsers = () => {
    setLoading(true);
    adminApi
      .listUsers()
      .then((res) => setUsers(res.data.users ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadUsers, []);

  const handleRoleChange = async (userId: string, role: string) => {
    await adminApi.updateRole(userId, role);
    loadUsers();
  };

  const handleToggleActive = async (userId: string) => {
    await adminApi.toggleActive(userId);
    loadUsers();
  };

  const handleResetPassword = async () => {
    if (!resetUserId || !newPassword) return;
    await adminApi.resetPassword(resetUserId, newPassword);
    setResetUserId(null);
    setNewPassword("");
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Users size={24} className="text-nexus-600" />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          ユーザー管理
        </h1>
      </div>

      {loading ? (
        <p className="text-gray-500">読み込み中...</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">ユーザー</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">ロール</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">状態</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">登録日</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-white">{u.display_name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className={`text-xs px-2 py-1 rounded-full font-medium border-0 ${ROLE_COLORS[u.role] ?? ROLE_COLORS.viewer}`}
                    >
                      {Object.entries(ROLE_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(u.id)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                        u.is_active
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {u.is_active ? <Shield size={12} /> : <ShieldOff size={12} />}
                      {u.is_active ? "有効" : "無効"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("ja-JP") : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setResetUserId(u.id)}
                      className="text-xs text-nexus-600 dark:text-nexus-400 hover:underline flex items-center gap-1 ml-auto"
                    >
                      <KeyRound size={12} />
                      PW変更
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* パスワードリセットモーダル */}
      {resetUserId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              パスワードリセット
            </h3>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新しいパスワード"
              className="input-field text-sm w-full mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setResetUserId(null); setNewPassword(""); }}
                className="btn-ghost text-sm"
              >
                キャンセル
              </button>
              <button
                onClick={handleResetPassword}
                disabled={!newPassword}
                className="btn-primary text-sm"
              >
                リセット
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
