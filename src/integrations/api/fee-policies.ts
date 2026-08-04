/** fee_policies 타입 안전 바인딩. 호출 6회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export interface FeePolicyRow {
  id: string;
  lot_id: string;
  policy_name: string;
  day_type: string;
  time_start: string | null;
  time_end: string | null;
  base_minutes: number | null;
  base_fee: number | null;
  add_minutes: number | null;
  add_fee: number | null;
  daily_max: number | null;
  monthly_pass_fee: number | null;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  approved_by: string | null;
  legal_basis: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeePolicyListQuery {
  lot_id?: string;
  is_active?: boolean;
  day_type?: string;
  /** YYYY-MM-DD - 이 날짜에 유효한 정책만 */
  effective_on?: string;
  limit?: number;
  offset?: number;
}

export type FeePolicyCreateInput = Partial<Omit<FeePolicyRow, "id" | "created_at" | "updated_at" | "created_by">> & {
  lot_id: string;
  policy_name: string;
};
export type FeePolicyUpdateInput = Partial<FeePolicyCreateInput>;

const PATH = "/api/fee-policies";

export const feePoliciesApi = {
  list: (q: FeePolicyListQuery = {}) =>
    apiClient.get<ListResult<FeePolicyRow>>(PATH, q as Record<string, string | boolean | number | undefined>),
  get: (id: string) => apiClient.get<FeePolicyRow>(`${PATH}/${id}`),
  create: (input: FeePolicyCreateInput) => apiClient.post<FeePolicyRow>(PATH, input),
  update: (id: string, input: FeePolicyUpdateInput) => apiClient.patch<FeePolicyRow>(`${PATH}/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
};
