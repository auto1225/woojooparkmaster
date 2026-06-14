/** bid_projects 타입 안전 바인딩. 호출 8회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export interface BidProjectRow {
  id: string;
  title: string;
  bid_number: string;
  lot_id: string | null;
  bid_type: string;
  contract_type: string;
  category: string | null;
  estimated_amount: number | null;
  design_amount: number | null;
  vat_included: boolean;
  budget_item_id: string | null;
  budget_available_amount: number | null;
  description: string | null;
  scope_of_work: string | null;
  location: string | null;
  work_period_days: number | null;
  work_start_date: string | null;
  work_end_date: string | null;
  qualification: string | null;
  qualification_criteria: unknown;
  evaluation_method: string | null;
  evaluation_criteria: unknown;
  lowest_price_rate: number | null;
  announce_date: string | null;
  bid_start_date: string | null;
  bid_deadline: string | null;
  bid_open_date: string | null;
  bid_open_location: string | null;
  nara_ref: string | null;
  nara_url: string | null;
  successful_bidder: string | null;
  contract_amount: number | null;
  savings_rate: number | null;
  status: string;
  cancel_reason: string | null;
  rebid_count: number;
  previous_bid_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface BidProjectListQuery {
  status?: string;
  bid_type?: string;
  lot_id?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export type BidProjectCreateInput = Partial<Omit<BidProjectRow, "id" | "created_at" | "updated_at" | "created_by" | "rebid_count">> & {
  title: string;
  bid_number: string;
  bid_type: string;
  contract_type: string;
};
export type BidProjectUpdateInput = Partial<BidProjectCreateInput>;

const PATH = "/api/bid-projects";

export const bidProjectsApi = {
  list: (q: BidProjectListQuery = {}) =>
    apiClient.get<ListResult<BidProjectRow>>(PATH, q as Record<string, string | undefined>),
  get: (id: string) => apiClient.get<BidProjectRow>(`${PATH}/${id}`),
  create: (input: BidProjectCreateInput) => apiClient.post<BidProjectRow>(PATH, input),
  update: (id: string, input: BidProjectUpdateInput) => apiClient.patch<BidProjectRow>(`${PATH}/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
};
