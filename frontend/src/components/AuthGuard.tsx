import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

/**
 * 認証ガード: トークンがない場合はログインページにリダイレクト
 * トークンがある場合はユーザー情報をロード
 */
export default function AuthGuard() {
  const { token, user, loadUser } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (token && !user) {
      loadUser();
    }
  }, [token, user, loadUser]);

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
