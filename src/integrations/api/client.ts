/**
 * 자체 백엔드 HTTP 클라이언트.
 *
 * Supabase JS SDK를 대체. 모든 API 호출은 이 클라이언트를 통해 나간다.
 *
 * 핵심 기능:
 *  - credentials: "include" 로 쿠키(JWT) 자동 포함
 *  - JSON 직렬화·역직렬화 자동
 *  - 에러 응답을 ApiError로 정규화
 *  - 401 응답 시 /api/auth/refresh 1회 시도 후 원본 요청 재시도
 *
 * 환경:
 *  - 개발: VITE_API_BASE = "http://localhost:4000" (Vite 프록시 가능)
 *  - 운영: 같은 도메인에서 서빙 → ""(빈 문자열)
 */

const BASE = (import.meta as { env?: { VITE_API_BASE?: string } }).env
  ?.VITE_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly clientMessage: string,
    public readonly details?: unknown,
  ) {
    super(clientMessage);
    this.name = "ApiError";
  }
}

interface RequestOpts {
  /** GET 시 쿼리 파라미터로 직렬화 */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** POST/PATCH 시 JSON 본문 */
  body?: unknown;
  /** 응답을 JSON 파싱하지 않을 때(204 등) */
  noJson?: boolean;
  /** 401 자동 refresh 시도 비활성 (refresh 자체 호출 시) */
  skipRefresh?: boolean;
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const r = await fetch(`${BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return r.ok;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

function buildUrl(path: string, query?: RequestOpts["query"]): string {
  const url = new URL(BASE + path, "http://placeholder");
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  // BASE가 빈 문자열이면 placeholder 호스트가 들어가므로, pathname+search만 반환
  return BASE
    ? url.toString()
    : url.pathname + url.search;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const url = buildUrl(path, opts.query);
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: opts.body ? { "Content-Type": "application/json" } : {},
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }

  let res = await fetch(url, init);

  // 401 → 자동 refresh 후 1회 재시도
  if (res.status === 401 && !opts.skipRefresh && path !== "/api/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await fetch(url, init);
    }
  }

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  if (!opts.noJson) {
    try {
      payload = await res.json();
    } catch {
      /* 빈 본문이거나 JSON 아님 */
    }
  }

  if (!res.ok) {
    const msg = (payload as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, msg, payload);
  }
  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, query?: RequestOpts["query"]) =>
    request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) =>
    request<T>("POST", path, { body }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>("PATCH", path, { body }),
  put: <T>(path: string, body?: unknown) =>
    request<T>("PUT", path, { body }),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
  /** 인증 등 특수 요청용 raw fetch (refresh 우회) */
  raw: <T>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown) =>
    request<T>(method, path, { body, skipRefresh: true }),
};

export type ApiClient = typeof apiClient;
