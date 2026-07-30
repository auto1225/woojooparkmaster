/**
 * Supabase JS SDK 호환 shim.
 *
 * 기존 화면의 supabase.from('x') 체인을 자체 Fastify API로 위임한다.
 * 점진적 마이그레이션 동안만 유지하며, 신규 코드는 typed API 바인딩을 사용한다.
 *
 * 지원 범위:
 *   - select / insert / update / upsert / delete
 *   - eq / neq / in / gt / gte / lt / lte / like / ilike / contains / is
 *   - or / not / order / limit / range
 *   - single / maybeSingle
 *   - 관계 select의 expand 및 fallback parent 조회
 *   - 기존 실시간 호출이 중단되지 않도록 no-op channel 호환 표면 제공
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
  orExpression?: string;
  /** insert/update/upsert/delete 를 만나면 설정 */
  mutation?: { type: "insert" | "update" | "upsert" | "delete"; payload?: unknown };
  /** select() 후 반환 형식 */
  selectMode?: "many" | "single" | "maybeSingle";
}

/**
 * `*, parking_lots(code, name), surveyor:profiles!fk_name(name)` 같은
 * Supabase 관계 select 문자열을 파싱한다.
 */
interface ParsedJoin {
  alias: string;
  table: string;
  fk?: string;
  cols: string[];
}

function parseJoinSelect(columns: string): { mainCols: string; joins: ParsedJoin[] } {
  const joins: ParsedJoin[] = [];
  let depth = 0;
  let buffer = "";
  const tokens: string[] = [];

  for (const char of columns) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (char === "," && depth === 0) {
      tokens.push(buffer.trim());
      buffer = "";
    } else {
      buffer += char;
    }
  }

  if (buffer.trim()) tokens.push(buffer.trim());

  const mainTokens: string[] = [];
  for (const token of tokens) {
    const match = token.match(
      /^(?:([a-zA-Z_][\w]*)\s*:\s*)?([a-zA-Z_][\w]*)\s*(?:!([a-zA-Z_][\w]*))?\s*\(([^)]*)\)\s*$/,
    );

    if (!match) {
      mainTokens.push(token);
      continue;
    }

    const [, alias, table, fk, columnsRaw] = match;
    joins.push({
      alias: alias || table,
      table,
      fk: fk || undefined,
      cols: columnsRaw.split(",").map((value) => value.trim()).filter(Boolean),
    });
  }

  return { mainCols: mainTokens.join(", ") || "*", joins };
}

/**
 * 백엔드가 expand를 제공하지 않는 경우 부모 데이터를 보완한다.
 * 실패해도 화면 전체가 중단되지 않도록 관계 필드를 null로 둔다.
 */
async function fetchParents(rows: any[], join: ParsedJoin): Promise<void> {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const foreignKeyColumn = join.fk
    ? guessFkFromFkName(join.fk)
    : guessFkColumn(join.table);
  if (!foreignKeyColumn) return;

  const ids = Array.from(
    new Set(rows.map((row) => row?.[foreignKeyColumn]).filter(Boolean)),
  );
  if (ids.length === 0) return;

  try {
    const path = tableToPath(join.table);
    const response = await apiClient.get<{ data: any[] }>(
      `${path}?id__in=${encodeURIComponent(ids.join(","))}`,
    );
    const parentById = new Map<string, any>();

    for (const item of response.data ?? []) {
      parentById.set(item.id, item);
    }

    for (const row of rows) {
      const parentId = row?.[foreignKeyColumn];
      row[join.alias] = parentId ? parentById.get(parentId) ?? null : null;
    }
  } catch {
    for (const row of rows) row[join.alias] = null;
  }
}

function guessFkColumn(tableName: string): string {
  const knownColumns: Record<string, string> = {
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

  return knownColumns[tableName] ?? `${tableName.replace(/s$/, "")}_id`;
}

function guessFkFromFkName(foreignKeyName: string): string | null {
  const match = foreignKeyName.match(/_([a-zA-Z_]+_id)_fkey$/);
  return match ? match[1] : null;
}

function detectJoinSelect(columns: string): boolean {
  return /[a-zA-Z_]+\([^)]*\)/.test(columns);
}

function flattenFilters(filters: FilterEntry[]): Record<string, string> {
  const query: Record<string, string> = {};

  for (const filter of filters) {
    const key = filter.op === "eq" ? filter.col : `${filter.col}__${filter.op}`;
    query[key] = Array.isArray(filter.val)
      ? filter.val.join(",")
      : String(filter.val);
  }

  return query;
}

function findIdFilter(filters: FilterEntry[]): string | undefined {
  const filter = filters.find((item) => item.op === "eq" && item.col === "id");
  return filter?.val as string | undefined;
}

function applyOrExpression(
  query: Record<string, unknown>,
  expression: string | undefined,
): void {
  if (!expression) return;

  const parts = expression
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ilikeValues = parts
    .map((part) => part.match(/^[^.]+\.ilike\.(.*)$/)?.[1])
    .filter((value): value is string => Boolean(value));

  // 전역 검색 화면에서 사용하는 동일 검색어의 다중 ilike 조건은
  // 백엔드 공통 q 파라미터로 축약한다.
  if (ilikeValues.length === parts.length && new Set(ilikeValues).size === 1) {
    query.q = ilikeValues[0].replace(/^%+|%+$/g, "");
    return;
  }

  // 라우트가 원본 OR 구문을 지원하는 경우를 위해 그대로 전달한다.
  query.or = expression;
}

// ───── execution ─────

interface ExecResult<T> {
  data: T | null;
  error: { message: string; status?: number } | null;
  count: number | null;
}

function errorResult<T>(message: string, status?: number): ExecResult<T> {
  return { data: null, error: { message, status }, count: null };
}

async function execute<T>(state: BuilderState): Promise<ExecResult<T>> {
  const path = tableToPath(state.table);

  try {
    if (state.mutation?.type === "insert") {
      const response = await apiClient.post<unknown>(path, state.mutation.payload);
      return { data: response as T, error: null, count: null };
    }

    if (state.mutation?.type === "update") {
      const id = findIdFilter(state.filters);
      if (!id) {
        return errorResult("update()는 .eq('id', x) 와 함께 사용해야 합니다.");
      }
      const response = await apiClient.patch<unknown>(
        `${path}/${id}`,
        state.mutation.payload,
      );
      return { data: response as T, error: null, count: null };
    }

    if (state.mutation?.type === "delete") {
      const id = findIdFilter(state.filters);
      if (!id) {
        return errorResult("delete()는 .eq('id', x) 와 함께 사용해야 합니다.");
      }
      await apiClient.delete<void>(`${path}/${id}`);
      return { data: null as T, error: null, count: null };
    }

    if (state.mutation?.type === "upsert") {
      const response = await apiClient.post<unknown>(
        `${path}?upsert=true`,
        state.mutation.payload,
      );
      return { data: response as T, error: null, count: null };
    }

    const id = findIdFilter(state.filters);
    if (id && state.selectMode === "single" && state.filters.length === 1) {
      const response = await apiClient.get<unknown>(`${path}/${id}`);
      const row = response as any;

      if (state.joins?.length) {
        for (const join of state.joins) {
          if (!(join.alias in row)) await fetchParents([row], join);
        }
      }

      return { data: row as T, error: null, count: null };
    }

    const query: Record<string, unknown> = flattenFilters(state.filters);
    applyOrExpression(query, state.orExpression);

    if (state.limit !== undefined) query.limit = state.limit;
    if (state.range) {
      query.limit = state.range.to - state.range.from + 1;
      query.offset = state.range.from;
    }
    if (state.orderBy.length > 0) {
      query.order = state.orderBy
        .map((order) => (order.ascending ? order.col : `-${order.col}`))
        .join(",");
    }
    if (state.countMode) query.count = state.countMode;
    if (state.headOnly) query.head = "true";
    if (state.joins?.length) {
      query.expand = state.joins.map((join) => join.alias).join(",");
    }

    const list = await apiClient.get<{ data: any[]; total: number }>(
      path,
      query as Record<string, string | number | boolean | undefined | null>,
    );

    if (state.joins?.length && Array.isArray(list.data) && list.data.length > 0) {
      for (const join of state.joins) {
        const sample = list.data[0] ?? {};
        if (!(join.alias in sample)) await fetchParents(list.data, join);
      }
    }

    if (state.selectMode === "single") {
      if (!list.data || list.data.length === 0) {
        return errorResult("Row not found", 404);
      }
      if (list.data.length > 1) {
        return errorResult(`.single() expected 1 row, got ${list.data.length}`);
      }
      return { data: list.data[0] as T, error: null, count: list.total };
    }

    if (state.selectMode === "maybeSingle") {
      return { data: (list.data[0] as T) ?? null, error: null, count: list.total };
    }

    return { data: list.data as T, error: null, count: list.total };
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResult(error.clientMessage, error.status);
    }
    return errorResult((error as Error).message ?? "알 수 없는 오류");
  }
}

// ───── chainable builder ─────

class QueryBuilder<T = any> implements PromiseLike<ExecResult<T>> {
  constructor(private state: BuilderState) {}

  select(
    columns: string = "*",
    options?: { count?: BuilderState["countMode"]; head?: boolean },
  ): this {
    if (detectJoinSelect(columns)) {
      const { joins } = parseJoinSelect(columns);
      this.state.joins = joins;
    }
    if (options?.count) this.state.countMode = options.count;
    if (options?.head) this.state.headOnly = true;
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.addFilter("eq", column, value);
  }
  neq(column: string, value: unknown): this {
    return this.addFilter("neq", column, value);
  }
  in(column: string, values: unknown[]): this {
    return this.addFilter("in", column, values);
  }
  gt(column: string, value: unknown): this {
    return this.addFilter("gt", column, value);
  }
  gte(column: string, value: unknown): this {
    return this.addFilter("gte", column, value);
  }
  lt(column: string, value: unknown): this {
    return this.addFilter("lt", column, value);
  }
  lte(column: string, value: unknown): this {
    return this.addFilter("lte", column, value);
  }
  like(column: string, value: string): this {
    return this.addFilter("like", column, value);
  }
  ilike(column: string, value: string): this {
    return this.addFilter("ilike", column, value);
  }
  is(column: string, value: unknown): this {
    return this.addFilter("is", column, value);
  }
  contains(column: string, value: unknown): this {
    return this.addFilter("contains", column, value);
  }

  or(expression: string): this {
    this.state.orExpression = expression;
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    if (operator !== "eq" && operator !== "is") {
      console.warn(
        `[supabase-compat] .not(${column}, ${operator}, ...)를 제외 필터로 변환합니다.`,
      );
    }
    return this.addFilter("neq", column, value);
  }

  private addFilter(
    operator: FilterEntry["op"],
    column: string,
    value: unknown,
  ): this {
    this.state.filters.push({ op: operator, col: column, val: value });
    return this;
  }

  order(
    column: string,
    options?: {
      ascending?: boolean;
      nullsFirst?: boolean;
      foreignTable?: string;
      referencedTable?: string;
    },
  ): this {
    this.state.orderBy.push({
      col: column,
      ascending: options?.ascending ?? true,
    });
    return this;
  }

  limit(value: number): this {
    this.state.limit = value;
    return this;
  }

  range(from: number, to: number): this {
    this.state.range = { from, to };
    return this;
  }

  single(): this {
    this.state.selectMode = "single";
    return this;
  }

  maybeSingle(): this {
    this.state.selectMode = "maybeSingle";
    return this;
  }

  insert(payload: unknown): QueryBuilder<T> {
    return new QueryBuilder<T>({
      ...this.state,
      mutation: { type: "insert", payload },
    });
  }

  update(payload: unknown): QueryBuilder<T> {
    return new QueryBuilder<T>({
      ...this.state,
      mutation: { type: "update", payload },
    });
  }

  upsert(payload: unknown): QueryBuilder<T> {
    return new QueryBuilder<T>({
      ...this.state,
      mutation: { type: "upsert", payload },
    });
  }

  delete(): QueryBuilder<T> {
    return new QueryBuilder<T>({
      ...this.state,
      mutation: { type: "delete" },
    });
  }

  then<TFulfilled = ExecResult<T>, TRejected = never>(
    onfulfilled?:
      | ((value: ExecResult<T>) => TFulfilled | PromiseLike<TFulfilled>)
      | null,
    onrejected?:
      | ((reason: unknown) => TRejected | PromiseLike<TRejected>)
      | null,
  ): PromiseLike<TFulfilled | TRejected> {
    return execute<T>(this.state).then(onfulfilled, onrejected);
  }
}

// ───── realtime compatibility ─────

type RealtimeCallback = (payload: any) => void;

class RealtimeChannelCompat {
  on(
    _type: string,
    _filter: Record<string, unknown>,
    _callback: RealtimeCallback,
  ): this {
    return this;
  }

  subscribe(callback?: (status: string) => void): this {
    queueMicrotask(() => callback?.("SUBSCRIBED"));
    return this;
  }

  async unsubscribe(): Promise<{ status: "ok" }> {
    return { status: "ok" };
  }
}

// ───── public surface ─────

export const supabase = {
  from<T = any>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>({
      table,
      filters: [],
      orderBy: [],
      selectMode: "many",
    });
  },

  channel(_name: string): RealtimeChannelCompat {
    return new RealtimeChannelCompat();
  },

  async removeChannel(
    channel: RealtimeChannelCompat,
  ): Promise<{ status: "ok" }> {
    return channel.unsubscribe();
  },

  // 인증·파일·함수 호출은 전용 자체 API 모듈 사용을 권장한다.
  auth: new Proxy({} as Record<string, any>, {
    get(_target, property) {
      throw new Error(
        `[supabase-compat] supabase.auth.${String(property)}는 지원되지 않습니다. ` +
          `대신 '@/integrations/api'의 authApi를 사용하세요.`,
      );
    },
  }) as any,

  storage: new Proxy({} as Record<string, any>, {
    get(_target, property) {
      throw new Error(
        `[supabase-compat] supabase.storage.${String(property)}는 지원되지 않습니다. ` +
          `자체 파일 API를 사용하세요.`,
      );
    },
  }) as any,

  functions: new Proxy({} as Record<string, any>, {
    get(_target, property) {
      throw new Error(
        `[supabase-compat] supabase.functions.${String(property)}는 지원되지 않습니다. ` +
          `백엔드 REST 라우트를 사용하세요.`,
      );
    },
  }) as any,
};
