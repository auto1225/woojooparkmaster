/**
 * CRUD 라우트 공용 헬퍼.
 *
 * 70개 테이블에 같은 패턴(GET 목록·단건, POST, PATCH, DELETE, 감사로그)이 반복되는데
 * 라우트 파일마다 같은 코드를 복붙하면 70개를 동시에 손봐야 하는 상황이 생긴다.
 * 여기 모은 헬퍼들로 라우트 파일은 "테이블 고유의 부분(검증 스키마, 필터 빌드)"만 작성한다.
 *
 * 각 헬퍼는 라우트 핸들러 안에서 호출되는 함수일 뿐, 라우트 자체를 자동 생성하지는 않는다.
 * (자동 생성은 디버깅 비용이 더 커서 의도적으로 피함.)
 */
import type pg from "pg";
import { pool } from "../db.js";
import { logActivity, type AuditAction } from "./audit-log.js";
import { ApiError } from "./pg-errors.js";
import type { AuthUser } from "../types.js";

/**
 * INSERT 동적 빌더.
 * data의 키를 그대로 컬럼명으로 사용 (zod로 검증된 후 호출 가정).
 *
 * 사용:
 *   const { sql, params } = buildInsert("complaints", body, ["created_by"]);
 *   const r = await pool.query(sql + " RETURNING *", [...params, userId]);
 */
export function buildInsert(
  table: string,
  data: Record<string, unknown>,
  extraCols: string[] = [],
): { sql: string; params: unknown[] } {
  const fields = Object.entries(data).filter(([, v]) => v !== undefined);
  const cols = [...fields.map(([k]) => k), ...extraCols];
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const params = fields.map(([, v]) => v);
  // extraCols의 값은 호출자가 params에 직접 추가해야 한다.
  return {
    sql: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
    params,
  };
}

/**
 * UPDATE 동적 빌더 (WHERE id = $1).
 *
 * 사용:
 *   const { setSql, params } = buildUpdateSet(body);
 *   const r = await pool.query(`UPDATE x SET ${setSql} WHERE id = $1 RETURNING *`, [id, ...params]);
 */
export function buildUpdateSet(
  data: Record<string, unknown>,
): { setSql: string; params: unknown[] } {
  const fields = Object.entries(data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) {
    throw new ApiError(400, "수정할 필드가 없습니다.");
  }
  const sets = fields.map(([k], i) => `${k} = $${i + 2}`);
  return {
    setSql: sets.join(", "),
    params: fields.map(([, v]) => v),
  };
}

/**
 * 단건 조회 (없으면 404 throw).
 *
 * 사용: const row = await fetchOne("parking_lots", id);
 */
export async function fetchOne<T = Record<string, unknown>>(
  table: string,
  id: string,
  notFoundMsg = "Not found",
): Promise<T> {
  const r = await pool.query<T>(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  if (r.rows.length === 0) throw new ApiError(404, notFoundMsg);
  return r.rows[0];
}

/**
 * 라우트 핸들러용 감사 로그 기록 헬퍼.
 *
 * action·table·record_id·diff·요청 메타를 한 번에 정리.
 */
export async function recordAudit(opts: {
  action: AuditAction;
  table: string;
  recordId: string;
  user: AuthUser;
  diff?: { before?: unknown; after?: unknown };
  ipAddress?: string;
  userAgent?: string | null;
}) {
  await logActivity({
    userId: opts.user.id,
    action: opts.action,
    table: opts.table,
    recordId: opts.recordId,
    diff: opts.diff,
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent?.slice(0, 300) ?? null,
  });
}

/**
 * 페이지네이션 결과 형태 통일.
 */
export async function listWithCount<T>(
  client: pg.Pool | pg.PoolClient,
  table: string,
  whereSql: string,
  whereParams: unknown[],
  orderSql: string,
  limit: number,
  offset: number,
  selectCols = "*",
): Promise<{ data: T[]; total: number; limit: number; offset: number }> {
  const total = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${table} ${whereSql}`,
    whereParams,
  );
  const params = [...whereParams, limit, offset];
  const rows = await client.query<T>(
    `SELECT ${selectCols} FROM ${table} ${whereSql} ${orderSql} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    data: rows.rows,
    total: Number(total.rows[0].count),
    limit,
    offset,
  };
}

/**
 * 동적 WHERE 빌더 — { col: value } 형태를 받아 col = $N 조건 누적.
 * undefined 값은 무시한다.
 *
 * 사용:
 *   const wb = new WhereBuilder();
 *   wb.eq("status", q.status);
 *   wb.eq("lot_type", q.lot_type);
 *   wb.ilikeAny(["name", "code"], q.q);
 *   const { sql, params } = wb.build();
 */
export class WhereBuilder {
  private conditions: string[] = [];
  private params: unknown[] = [];

  eq(col: string, val: unknown): this {
    if (val === undefined || val === null || val === "") return this;
    this.params.push(val);
    this.conditions.push(`${col} = $${this.params.length}`);
    return this;
  }

  in(col: string, vals: unknown[] | undefined): this {
    if (!vals || vals.length === 0) return this;
    const placeholders = vals.map((v) => {
      this.params.push(v);
      return `$${this.params.length}`;
    });
    this.conditions.push(`${col} IN (${placeholders.join(", ")})`);
    return this;
  }

  /** 여러 컬럼을 같은 검색어로 ILIKE %q% (OR 결합) */
  ilikeAny(cols: string[], val: string | undefined): this {
    if (!val) return this;
    this.params.push(`%${val}%`);
    const idx = this.params.length;
    this.conditions.push(`(${cols.map((c) => `${c} ILIKE $${idx}`).join(" OR ")})`);
    return this;
  }

  /** col >= val */
  gte(col: string, val: unknown): this {
    if (val === undefined || val === null) return this;
    this.params.push(val);
    this.conditions.push(`${col} >= $${this.params.length}`);
    return this;
  }
  /** col <= val */
  lte(col: string, val: unknown): this {
    if (val === undefined || val === null) return this;
    this.params.push(val);
    this.conditions.push(`${col} <= $${this.params.length}`);
    return this;
  }

  /** 임의 SQL 조각을 직접 추가 (params 인덱스 직접 관리해야 함) */
  raw(sql: string, ...params: unknown[]): this {
    // 외부에서 $1, $2... 형태로 작성할 수 없으니 helper만 추가
    if (params.length > 0) {
      const placeholders = params.map((p) => {
        this.params.push(p);
        return `$${this.params.length}`;
      });
      // sql 에 ?를 사용하면 placeholders로 치환
      let i = 0;
      const replaced = sql.replace(/\?/g, () => placeholders[i++]);
      this.conditions.push(replaced);
    } else {
      this.conditions.push(sql);
    }
    return this;
  }

  build(): { sql: string; params: unknown[] } {
    return {
      sql: this.conditions.length > 0 ? `WHERE ${this.conditions.join(" AND ")}` : "",
      params: [...this.params],
    };
  }
}
