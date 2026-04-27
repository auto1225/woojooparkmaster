/**
 * Supabase JS SDK 호환 shim.
 *
 * 388회의 supabase.from('x')... 호출을 백엔드 API로 위임한다.
 * 점진적 마이그레이션 동안에만 사용; 모든 호출이 typed 바인딩으로 옮겨지면 제거.
 *
 * 지원하는 체인 메서드:
 *   .select(columns?, opts?)  ← columns는 무시(백엔드가 결정), opts.count는 지원
 *   .insert(data)             ← 단건/다건
 *   .update(data)             ← .eq() 와 결합 시 단건 PATCH
 *   .upsert(data)             ← INSERT ON CONFLICT
 *   .delete()                 ← .eq() 와 결합 시 단건 DELETE
 *   .eq, .neq, .in, .gt, .gte, .lt, .lte, .like, .ilike, .contains, .is
 *   .order(col, { ascending? })
 *   .limit(n) / .range(from, to)
 *   .single() / .maybeSingle()
 *   .then()                   ← Promise처럼 사용 가능
 *
 * 미지원 (의도적으로 throw):
 *   - JOIN 셀렉트 (.select('*, related(*)'))  → 전용 엔드포인트로 수동 변환
 *   - .rpc()                                  → 백엔드 라우트 추가로 대체
 *   - .channel() / realtime                   → 코드에 0회. 미사용
 *   - .storage / .functions                   → 별도 모듈 사용
 *
 * 매핑 규약:
 *   테이블명 'code_master' → URL '/api/code-master' (snake_case → kebab-case)
 *   GET /api/{table}             ← 목록 + 필터를 query string으로
 *   GET /api/{table}/{id}        ← .eq('id', x).single()
 *   POST /api/{table}            ← .insert
 *   PATCH /api/{table}/{id}      ← .update().eq('id', x)
 *   DELETE /api/{table}/{id}     ← .delete().eq('id', x)
 *
 * 백엔드 라우트가 아직 없는 테이블을 호출하면 404가 떨어지며, 호출자가
 * 정확히 어디서 막혔는지 보고 그 테이블의 백엔드 라우트를 우선 작성하도록 유도한다.
 */
import { apiClient, ApiError } from "./client";

// ───── helpers ─────

function tableToPath(table: string): string {
  return "/api/" + table.replace(/_/g, "-");
}

interface FilterEntry {
  op: "eq" | "neq" | "in" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is" | "contains";
  col: string;
  val: unknown;
}

interface BuilderState {
  joins?: ParsedJoin[];
  table: string;
  filters: FilterEntry[];
  orderBy: { col: string; ascending: boolean }[];
  limit?: number;
  range?: { from: number; to: number };
  countMode?: "exact" | "planned" | "estimated";
  headOnly?: boolean;
  /** insert/update/upsert/delete 를 만나면 세팅 */
  mutation?: { type: "insert" | "update" | "upsert" | "delete"; payload?: unknown };
  /** select() 후 반환 한정 */
  selectMode?: "many" | "single" | "maybeSingle";
}


/**
 * '*, parking_lots(code, name), surveyor:profiles!fk_name(name)' 같은 select 문자열을 파싱.
 * 반환:
 *   - mainCols: 메인 테이블 컬럼 (* 또는 id, code 등). API에서는 무시되지만 보존.
 *   - joins: [{ alias, table, fk, cols }]
 *
 * 미지원 syntax는 그대로 throw하지 않고 무시 (warn) — 호출자에게 빈 객체 nested 반환.
 */
interface ParsedJoin {
  alias: string;       // 응답에 부착할 키
  table: string;       // 부모 테이블
  fk?: string;         // 명시적 FK 컬럼명 (...!fk_name(...))
  cols: string[];      // 가져올 컬럼 (best-effort)
}
function parseJoinSelect(columns: string): { mainCols: string; joins: ParsedJoin[] } {
  const joins: ParsedJoin[] = [];
  let depth = 0;
  let buf = "";
  const tokens: string[] = [];
  for (const ch of columns) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      tokens.push(buf.trim());
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) tokens.push(buf.trim());

  const mainTokens: string[] = [];
  for (const t of tokens) {
    // alias:table!fk(cols)  또는  table(cols)
    const m = t.match(/^(?:([a-zA-Z_][\w]*)\s*:\s*)?([a-zA-Z_][\w]*)\s*(?:!([a-zA-Z_][\w]*))?\s*\(([^)]*)\)\s*$/);
    if (m) {
      const [, alias, table, fk, colsRaw] = m;
      joins.push({
        alias: alias || table,
        table,
        fk: fk || undefined,
        cols: colsRaw.split(",").map((x) => x.trim()).filter(Boolean),
      });
    } else {
      mainTokens.push(t);
    }
  }
  return { mainCols: mainTokens.join(", ") || "*", joins };
}

/**
 * 부모 테이블 fetch — 단순 단수형 외래키 추론 (parking_lots → lot_id 등).
 * 실패하면 빈 객체 부착하고 진행 (앱 폭발 방지).
 */
async function fetchParents(rows: any[], join: ParsedJoin): Promise<void> {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const fkCol = join.fk
    ? guessFkFromFkName(join.fk, join.table)
    : guessFkColumn(join.table);
  if (!fkCol) return;
  const ids = Array.from(new Set(rows.map((r) => r?.[fkCol]).filter(Boolean)));
  if (ids.length === 0) return;
  try {
    const path = "/api/" + join.table.replace(/_/g, "-");
    const url = path + "?id__in=" + encodeURIComponent(ids.join(","));
    const r = await apiClient.get<{ data: any[] }>(url);
    const map = new Map<string, any>();
    for (const item of r.data ?? []) map.set(item.id, item);
    for (const row of rows) {
      const parentId = row?.[fkCol];
      const parent = parentId ? map.get(parentId) : null;
      row[join.alias] = parent ?? null;
    }
  } catch {
    for (const row of rows) row[join.alias] = null;
  }
}

function guessFkColumn(tableName: string): string {
  // parking_lots → lot_id, profiles → profile_id (불완전), bid_projects → project_id (불완전)
  // 가장 흔한 패턴: 마지막 단어 단수형 + _id
  const map: Record<string, string> = {
    parking_lots: "lot_id",
    profiles: "user_id",
    bid_projects: "bid_project_id",
    bid_submissions: "submission_id",
    service_projects: "project_id",
    construction_projects: "project_id",
    report_templates: "template_id",
    equipment: "equipment_id",
    gateway_devices: "gateway_id",
    surveys: "survey_id",
    budget_items: "item_id",
    budget_plans: "plan_id",
    approval_records: "step_id",
  };
  return map[tableName] ?? tableName.replace(/s$/, "") + "_id";
}

function guessFkFromFkName(fkName: string, _table: string): string | null {
  // surveys_surveyor_id_fkey → surveyor_id
  const m = fkName.match(/_([a-zA-Z_]+_id)_fkey$/);
  return m ? m[1] : null;
}

function detectJoinSelect(columns: string): boolean {
  // 'a, related(b)' 또는 'a:rel(b)' 같은 패턴
  return /[a-zA-Z_]+\([^)]*\)/.test(columns);
}

function flattenFilters(filters: FilterEntry[]): Record<string, string> {
  // 필터를 query string용 key=value로 변환.
  // 백엔드가 여러 필터를 어떻게 받을지에 따라 정책이 달라지는데, 기본은
  // op가 eq면 col=val, 그 외는 col__op=val 로 표기한다.
  const out: Record<string, string> = {};
  for (const f of filters) {
    const key = f.op === "eq" ? f.col : `${f.col}__${f.op}`;
    out[key] = Array.isArray(f.val) ? f.val.join(",") : String(f.val);
  }
  return out;
}

function findIdFilter(filters: FilterEntry[]): string | undefined {
  const f = filters.find((x) => x.op === "eq" && x.col === "id");
  return f?.val as string | undefined;
}

// ───── execution ─────

interface ExecResult<T> {
  data: T | null;
  error: { message: string; status?: number } | null;
  count: number | null;
}

async function execute<T>(state: BuilderState): Promise<ExecResult<T>> {
  const path = tableToPath(state.table);
  try {
    // INSERT
    if (state.mutation?.type === "insert") {
      const r = await apiClient.post<unknown>(path, state.mutation.payload);
      return { data: r as T, error: null, count: null };
    }

    // UPDATE
    if (state.mutation?.type === "update") {
      const id = findIdFilter(state.filters);
      if (!id) {
        return errorResult("update()는 .eq('id', x) 와 함께 사용해야 합니다.");
      }
      const r = await apiClient.patch<unknown>(`${path}/${id}`, state.mutation.payload);
      return { data: r as T, error: null, count: null };
    }

    // DELETE
    if (state.mutation?.type === "delete") {
      const id = findIdFilter(state.filters);
      if (!id) {
        return errorResult("delete()는 .eq('id', x) 와 함께 사용해야 합니다.");
      }
      await apiClient.delete<void>(`${path}/${id}`);
      return { data: null as T, error: null, count: null };
    }

    // UPSERT
    if (state.mutation?.type === "upsert") {
      const r = await apiClient.post<unknown>(path + "?upsert=true", state.mutation.payload);
      return { data: r as T, error: null, count: null };
    }

    // SELECT
    const id = findIdFilter(state.filters);
    if (id && state.selectMode === "single" && state.filters.length === 1) {
      // .eq('id', x).single() 최적 경로
      // 단건 GET은 일반적으로 expand를 지원하지 않으므로 polyfill 그대로 사용
      const r = await apiClient.get<unknown>(`${path}/${id}`);
      const obj = r as any;
      if (state.joins?.length) {
        for (const j of state.joins) {
          if (!(j.alias in obj)) {
            await fetchParents([obj], j);
          }
        }
      }
      return { data: obj as T, error: null, count: null };
    }

    const query: Record<string, unknown> = flattenFilters(state.filters);
    if (state.limit !== undefined) query.limit = state.limit;
    if (state.range) {
      query.limit = state.range.to - state.range.from + 1;
      query.offset = state.range.from;
    }
    if (state.orderBy.length > 0) {
      query.order = state.orderBy.map((o) => (o.ascending ? o.col : `-${o.col}`)).join(",");
    }
    if (state.countMode) query.count = state.countMode;
    if (state.headOnly) query.head = "true";

    // 백엔드 expand 자동 활용: joins가 있으면 ?expand= 쿼리에 추가
    if (state.joins?.length) {
      const aliasList = state.joins.map((j) => j.alias).join(",");
      query.expand = aliasList;
    }
    const list = await apiClient.get<{ data: unknown[]; total: number }>(path, query as Record<string, string | number | boolean | undefined | null>);
    // 백엔드가 expand를 지원하지 않으면 응답에 nested가 없음 → fallback polyfill
    if (state.joins?.length && Array.isArray(list.data) && list.data.length > 0) {
      for (const j of state.joins) {
        const sample = (list.data[0] as any) ?? {};
        if (!(j.alias in sample)) {
          await fetchParents(list.data as any[], j);
        }
      }
    }
    if (state.selectMode === "single") {
      if (!list.data || list.data.length === 0) {
        return errorResult("Row not found", 404);
      }
      if (list.data.length > 1) {
        return errorResult(".single() expected 1 row, got " + list.data.length);
      }
      return { data: list.data[0] as T, error: null, count: list.total };
    }
    if (state.selectMode === "maybeSingle") {
      return { data: (list.data[0] as T) ?? null, error: null, count: list.total };
    }
    return { data: list.data as T, error: null, count: list.total };
  } catch (err) {
    if (err instanceof ApiError) {
      return errorResult(err.clientMessage, err.status);
    }
    return errorResult((err as Error).message ?? "알 수 없는 오류");
  }
}

function errorResult<T>(message: string, status?: number): ExecResult<T> {
  return { data: null, error: { message, status }, count: null };
}

// ───── chainable builder ─────

class QueryBuilder<T = unknown> implements PromiseLike<ExecResult<T>> {
  constructor(private state: BuilderState) {}

  // SELECT
  select(columns: string = "*", opts?: { count?: BuilderState["countMode"]; head?: boolean }): this {
    if (detectJoinSelect(columns)) {
      throw new Error(
        `[supabase-compat] JOIN 형식 select('${columns}')는 호환 shim에서 지원되지 않습니다.\n` +
        `백엔드(/api/${this.state.table.replace(/_/g, "-")})에 전용 엔드포인트를 추가해 처리하세요.`,
      );
    }
    if (opts?.count) this.state.countMode = opts.count;
    if (opts?.head) this.state.headOnly = true;
    return this;
  }

  // FILTERS
  eq(col: string, val: unknown): this { return this.addFilter("eq", col, val); }
  neq(col: string, val: unknown): this { return this.addFilter("neq", col, val); }
  in(col: string, vals: unknown[]): this { return this.addFilter("in", col, vals); }
  gt(col: string, val: unknown): this { return this.addFilter("gt", col, val); }
  gte(col: string, val: unknown): this { return this.addFilter("gte", col, val); }
  lt(col: string, val: unknown): this { return this.addFilter("lt", col, val); }
  lte(col: string, val: unknown): this { return this.addFilter("lte", col, val); }
  like(col: string, val: string): this { return this.addFilter("like", col, val); }
  ilike(col: string, val: string): this { return this.addFilter("ilike", col, val); }
  is(col: string, val: unknown): this { return this.addFilter("is", col, val); }
  contains(col: string, val: unknown): this { return this.addFilter("contains", col, val); }

  private addFilter(op: FilterEntry["op"], col: string, val: unknown): this {
    this.state.filters.push({ op, col, val });
    return this;
  }

  // ORDER / PAGE
  order(col: string, opts?: { ascending?: boolean }): this {
    this.state.orderBy.push({ col, ascending: opts?.ascending ?? true });
    return this;
  }
  limit(n: number): this { this.state.limit = n; return this; }
  range(from: number, to: number): this { this.state.range = { from, to }; return this; }

  // SINGLE
  single(): this { this.state.selectMode = "single"; return this; }
  maybeSingle(): this { this.state.selectMode = "maybeSingle"; return this; }

  // MUTATIONS
  insert(payload: unknown): QueryBuilder<T> {
    return new QueryBuilder<T>({ ...this.state, mutation: { type: "insert", payload } });
  }
  update(payload: unknown): QueryBuilder<T> {
    return new QueryBuilder<T>({ ...this.state, mutation: { type: "update", payload } });
  }
  upsert(payload: unknown): QueryBuilder<T> {
    return new QueryBuilder<T>({ ...this.state, mutation: { type: "upsert", payload } });
  }
  delete(): QueryBuilder<T> {
    return new QueryBuilder<T>({ ...this.state, mutation: { type: "delete" } });
  }

  // PromiseLike — await로 실행
  then<T1 = ExecResult<T>, T2 = never>(
    onfulfilled?: ((value: ExecResult<T>) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return execute<T>(this.state).then(onfulfilled, onrejected);
  }
}

// ───── public surface ─────

export const supabase = {
  from<T = unknown>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>({
      table,
      filters: [],
      orderBy: [],
      selectMode: "many",
    });
  },

  // auth, storage, functions는 별도 모듈에서 import 권장.
  // 여기서는 마이그레이션 안내 메시지만.
  auth: new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      throw new Error(
        `[supabase-compat] supabase.auth.${String(prop)} 는 지원되지 않습니다.\n` +
        `대신 'authApi' from '@/integrations/api'를 사용하세요. 매핑은 src/integrations/api/auth.ts 주석 참고.`,
      );
    },
  }),

  storage: new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      throw new Error(
        `[supabase-compat] supabase.storage.${String(prop)} 는 지원되지 않습니다. 자체 파일 API로 변환 필요.`,
      );
    },
  }),

  functions: new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      throw new Error(
        `[supabase-compat] supabase.functions.${String(prop)} 는 지원되지 않습니다. 백엔드 라우트로 변환 필요.`,
      );
    },
  }),
};
