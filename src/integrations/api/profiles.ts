/**
 * profiles 타입 안전 바인딩.
 * 호출 19회 — 사용자 프로필 조회·수정.
 */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";
import type { AuthUser } from "./auth";

export interface ProfileRow extends AuthUser {
  phone: string | null;
  employee_number: string | null;
  department: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  theme_preference: "light" | "dark";
  notification_settings: Record<string, unknown>;
  onboarding_completed: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileListQuery {
  team?: AuthUser["team"];
  role?: AuthUser["role"];
  is_active?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface ProfileSelfUpdate {
  name?: string;
  phone?: string;
  avatar_url?: string | null;
  theme_preference?: "light" | "dark";
  notification_settings?: Record<string, unknown>;
  onboarding_completed?: boolean;
}

export interface ProfileAdminUpdate extends ProfileSelfUpdate {
  team?: AuthUser["team"];
  role?: AuthUser["role"];
  is_active?: boolean;
  department?: string;
  employee_number?: string;
}

const PATH = "/api/profiles";

export const profilesApi = {
  list: (q: ProfileListQuery = {}) =>
    apiClient.get<ListResult<ProfileRow>>(PATH, q as Record<string, string | number | boolean | undefined>),

  me: () => apiClient.get<ProfileRow>(`${PATH}/me`),
  get: (id: string) => apiClient.get<ProfileRow>(`${PATH}/${id}`),

  /** 본인 프로필 수정 (이름·전화·테마 등) */
  updateSelf: (input: ProfileSelfUpdate) => apiClient.patch<ProfileRow>(`${PATH}/me`, input),

  /** admin 전용: 다른 사용자 프로필 수정 (역할·팀 변경 등) */
  updateById: (id: string, input: ProfileAdminUpdate) => apiClient.patch<ProfileRow>(`${PATH}/${id}`, input),
};
