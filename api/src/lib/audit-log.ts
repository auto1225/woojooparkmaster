/**
 * 감사 로그(activity_logs) 헬퍼.
 *
 * 공공기관 업무 시스템 요건상 "누가, 언제, 무엇을, 어떻게 변경했는가"를
 * 추적할 수 있어야 한다. 이 모듈은 INSERT/UPDATE/DELETE 후 호출되어
 * activity_logs 테이블에 자동 기록한다.
 *
 * 라우트에서 다음 패턴으로 사용:
 *
 *   const updated = await pool.query(...);
 *   await logActivity({
 *     userId: req.authUser!.id,
 *     action: "UPDATE",
 *     table: "code_master",
 *     recordId: updated.rows[0].id,
 *     diff: { before, after },
 *   });
 *
 * 실패 시 본 작업을 막지 않도록 fire-and-forget(에러는 콘솔만)로 처리.
 * 운영 시 로깅 실패 자체도 별도 로그 시스템에 적재할 수 있게 확장 가능.
 */
import { pool } from "../db.js";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "PASSWORD_CHANGE"
  | "ADMIN_PASSWORD_RESET"
  | "FILE_UPLOAD"
  | "FILE_DELETE"
  | "EXPORT";

export interface AuditEntry {
  userId: string | null; // null = 시스템 작업 (마이그레이션 등)
  action: AuditAction;
  table?: string;
  recordId?: string;
  diff?: { before?: unknown; after?: unknown };
  ipAddress?: string | null;
  userAgent?: string | null;
  extra?: Record<string, unknown>;
}

export async function logActivity(entry: AuditEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO activity_logs
         (user_id, action, table_name, record_id, diff, ip_address, user_agent, extra)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.userId,
        entry.action,
        entry.table ?? null,
        entry.recordId ?? null,
        entry.diff ? JSON.stringify(entry.diff) : null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
        entry.extra ? JSON.stringify(entry.extra) : null,
      ],
    );
  } catch (err) {
    // 감사 로그 실패가 본 작업을 무너뜨리면 안 됨
    console.error("[audit] 로그 기록 실패:", err);
  }
}
