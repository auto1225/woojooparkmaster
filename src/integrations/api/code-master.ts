/**
 * code_master 테이블 타입 안전 바인딩.
 *
 * 이 파일은 "70개 테이블 타입 바인딩의 기준 패턴"이다.
 * 다른 테이블도 동일 구조로 작성:
 *  1) Row 타입 (백엔드 컬럼과 1:1)
 *  2) ListQuery 타입 (필터·페이지네이션)
 *  3) Create/Update 입력 타입
 *  4) list/get/create/update/remove 함수
 *  5) (선택) TanStack Query 훅
 *
 * 백엔드 라우트(api/src/routes/code-master.ts)와 1:1 대응.
 * 백엔드가 컬럼을 추가하면 여기 Row 타입에도 추가하면 된다.
 */
import { apiClient } from "./client";

export interface CodeMasterRow {
  id: string;
  group_code: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface CodeMasterListQuery {
  group_code?: string;
  active_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface CodeMasterCreateInput {
  group_code: string;
  code: string;
  name: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
}

export type CodeMasterUpdateInput = Partial<CodeMasterCreateInput>;

const PATH = "/api/code-master";

export const codeMasterApi = {
  list: (q: CodeMasterListQuery = {}) =>
    apiClient.get<ListResult<CodeMasterRow>>(PATH, {
      group_code: q.group_code,
      active_only: q.active_only,
      limit: q.limit,
      offset: q.offset,
    }),

  get: (id: string) => apiClient.get<CodeMasterRow>(`${PATH}/${id}`),

  create: (input: CodeMasterCreateInput) =>
    apiClient.post<CodeMasterRow>(PATH, input),

  update: (id: string, input: CodeMasterUpdateInput) =>
    apiClient.patch<CodeMasterRow>(`${PATH}/${id}`, input),

  remove: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
};
