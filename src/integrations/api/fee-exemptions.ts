/** fee_exemptions 타입 안전 바인딩. 호출 5회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export interface FeeExemptionRow {
  id: string;
  lot_id: string | null;
  exemption_type: string;
  exemption_name: string;
  discount_type: string;
  discount_rate: number | null;
  discount_amount: number | null;
  max_hours: number | null;
  max_discount_amount: number | null;
  required_documents: string | null;
  description: string | null;
  legal_basis: string | null;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface FeeExemptionListQuery {
  lot_id?: string;
  is_active?: boolean;
  exemption_type?: string;
  limit?: number;
  offset?: number;
}

export type FeeExemptionCreateInput = Partial<Omit<FeeExemptionRow, "id" | "created_at">> & {
  exemption_type: string;
  exemption_name: string;
};
export type FeeExemptionUpdateInput = Partial<FeeExemptionCreateInput>;

const PATH = "/api/fee-exemptions";

export const feeExemptionsApi = {
  list: (q: FeeExemptionListQuery = {}) =>
    apiClient.get<ListResult<FeeExemptionRow>>(PATH, q as Record<string, string | boolean | undefined>),
  get: (id: string) => apiClient.get<FeeExemptionRow>(`${PATH}/${id}`),
  create: (input: FeeExemptionCreateInput) => apiClient.post<FeeExemptionRow>(PATH, input),
  update: (id: string, input: FeeExemptionUpdateInput) => apiClient.patch<FeeExemptionRow>(`${PATH}/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
};
