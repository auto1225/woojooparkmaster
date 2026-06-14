/**
 * 행 단위 권한 (RLS의 일부 기능 대체) 헬퍼.
 *
 * Supabase RLS의 대부분은 단순한 패턴이었음:
 *   - "본인이 만든 행만 수정" → created_by = auth.uid()
 *   - "본인 팀 데이터만 조회" → team = current_user_team()
 *   - "관리자는 모두 가능" → role = 'admin'
 *
 * 이 모듈은 그 검사를 라우트 핸들러에서 일관되게 수행하도록 도와준다.
 *
 * 사용 패턴:
 *
 *   const row = await pool.query("SELECT * FROM lots WHERE id = $1", [id]);
 *   ensureOwnership(row.rows[0], req.authUser, { ownerColumn: "created_by" });
 *   // → 권한 없으면 ApiError(403) throw, 통과하면 정상 진행
 *
 * 또는 SELECT 시 자동 필터:
 *   const sql = "SELECT * FROM lots " + ownershipFilter(req.authUser, "created_by");
 */
import { ApiError } from "./pg-errors.js";
import type { AuthUser, UserRole } from "../types.js";

interface OwnershipOptions {
  /** 행에서 소유자 user_id를 담은 컬럼명 */
  ownerColumn: string;
  /** 이 역할 이상은 소유 검사 면제 (기본 admin) */
  bypassRoles?: UserRole[];
}

/**
 * 단일 행이 사용자 소유인지 검사. 아니면 403 throw.
 */
export function ensureOwnership(
  row: Record<string, unknown> | null | undefined,
  user: AuthUser | undefined,
  opts: OwnershipOptions,
): void {
  if (!user) throw new ApiError(401, "인증 필요");
  if (!row) throw new ApiError(404, "Not found");

  const bypass = opts.bypassRoles ?? ["admin"];
  if (bypass.includes(user.role)) return;

  const owner = row[opts.ownerColumn];
  if (owner !== user.id) {
    throw new ApiError(403, "본인이 작성한 데이터만 수정/삭제할 수 있습니다.");
  }
}

/**
 * SELECT 쿼리에 붙일 WHERE 절 조각.
 * admin/manager는 모두 조회, 그 외는 본인 데이터만.
 *
 * 사용:
 *   const { clause, params } = ownershipFilter(req.authUser, "created_by");
 *   pool.query(`SELECT * FROM x WHERE 1=1 ${clause}`, params);
 */
export function ownershipFilter(
  user: AuthUser | undefined,
  ownerColumn: string,
  options?: { bypassRoles?: UserRole[]; paramOffset?: number },
): { clause: string; params: unknown[] } {
  if (!user) return { clause: " AND false ", params: [] };
  const bypass = options?.bypassRoles ?? ["admin", "manager"];
  if (bypass.includes(user.role)) return { clause: "", params: [] };
  const offset = options?.paramOffset ?? 0;
  return {
    clause: ` AND ${ownerColumn} = $${offset + 1} `,
    params: [user.id],
  };
}
