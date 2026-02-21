import { create } from "zustand";
import { authApi } from "../api/client";

interface AuthUser {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

const TOKEN_KEY = "nexustext-auth-token";

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem(TOKEN_KEY),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.login(email, password);
      const { access_token, user_id, display_name, role } = res.data;
      localStorage.setItem(TOKEN_KEY, access_token);
      set({
        token: access_token,
        user: { user_id, email, display_name, role },
        isLoading: false,
      });
    } catch (e: any) {
      const msg =
        e.response?.data?.detail ?? "ログインに失敗しました";
      set({ error: msg, isLoading: false });
      throw e;
    }
  },

  register: async (email, password, displayName) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.register(email, password, displayName);
      const { access_token, user_id, display_name, role } = res.data;
      localStorage.setItem(TOKEN_KEY, access_token);
      set({
        token: access_token,
        user: { user_id, email, display_name, role },
        isLoading: false,
      });
    } catch (e: any) {
      const msg =
        e.response?.data?.detail ?? "登録に失敗しました";
      set({ error: msg, isLoading: false });
      throw e;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ user: null, token: null, error: null });
  },

  loadUser: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try {
      const res = await authApi.me();
      set({ user: res.data, token });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      set({ user: null, token: null });
    }
  },
}));
