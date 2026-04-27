/**
 * 인증 API 바인딩.
 *
 * Supabase의 supabase.auth.* 25개 호출을 대체.
 * 호출 패턴은 비슷하게 유지하되, 반환은 우리 백엔드 응답 구조를 따른다.
 *
 * 매핑:
 *   supabase.auth.signInWithPassword()  → authApi.login()
 *   supabase.auth.signOut()             → authApi.logout()
 *   supabase.auth.getUser()             → authApi.me()
 *   supabase.auth.getSession()          → authApi.me() (세션은 쿠키로 관리, 별도 토큰 노출 X)
 *   supabase.auth.onAuthStateChange()   → React Context로 대체 (useAuth.tsx 리팩토링 시)
 *   supabase.auth.updateUser({pwd})     → authApi.changePassword()
 *   supabase.auth.refreshSession()      → authApi.refresh()
 *   supabase.auth.resetPasswordForEmail → 미지원 (관리자 수동 초기화로 정책 변경)
 */
import { apiClient, ApiError } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "editor" | "viewer";
  team: "operations" | "facilities" | "planning" | "admin";
}

export const authApi = {
  async login(email: string, password: string): Promise<AuthUser> {
    const r = await apiClient.raw<{ user: AuthUser }>("POST", "/api/auth/login", { email, password });
    return r.user;
  },

  async logout(): Promise<void> {
    await apiClient.raw("POST", "/api/auth/logout");
  },

  async me(): Promise<AuthUser | null> {
    try {
      const r = await apiClient.get<{ user: AuthUser }>("/api/auth/me");
      return r.user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  async refresh(): Promise<AuthUser | null> {
    try {
      const r = await apiClient.raw<{ user: AuthUser }>("POST", "/api/auth/refresh");
      return r.user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.post("/api/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },
};
