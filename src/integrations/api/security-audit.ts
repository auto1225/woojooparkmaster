/** security_audit_logs + active_sessions 타입 안전 바인딩. 호출 16회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export type AuditSeverity = "info" | "warning" | "critical";

export interface SecurityAuditLogRow {
  id: string;
  event_type: string;
  severity: AuditSeverity;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  user_team: string | null;
  ip_address: string | null;
  user_agent: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  action_detail: unknown;
  before_value: unknown;
  after_value: unknown;
  success: boolean;
  failure_reason: string | null;
  session_id: string | null;
  request_path: string | null;
  created_at: string;
}

export interface SecurityAuditQuery {
  event_type?: string;
  severity?: AuditSeverity;
  user_id?: string;
  success?: boolean;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export const securityAuditApi = {
  list: (q: SecurityAuditQuery = {}) =>
    apiClient.get<ListResult<SecurityAuditLogRow>>(
      "/api/security-audit-logs",
      q as Record<string, string | boolean | number | undefined>,
    ),
  /** 시스템·서버 코드에서만 사용 — admin 전용 */
  log: (input: Partial<Omit<SecurityAuditLogRow, "id" | "created_at" | "ip_address" | "user_agent">> & { event_type: string }) =>
    apiClient.post<SecurityAuditLogRow>("/api/security-audit-logs", input),
};

export interface ActiveSessionRow {
  id: string;
  user_id: string;
  session_token: string;
  ip_address: string | null;
  user_agent: string | null;
  device_info: unknown;
  started_at: string;
  last_activity: string;
  expires_at: string;
  is_active: boolean;
}

export const activeSessionsApi = {
  list: (q: { user_id?: string; is_active?: boolean; limit?: number; offset?: number } = {}) =>
    apiClient.get<ListResult<ActiveSessionRow>>(
      "/api/active-sessions",
      q as Record<string, string | boolean | number | undefined>,
    ),
  /** 본인 세션 종료 (admin은 모든 세션 종료 가능) */
  terminate: (id: string) => apiClient.delete<void>(`/api/active-sessions/${id}`),
};
