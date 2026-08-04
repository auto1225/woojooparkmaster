/** revenue_daily 타입 안전 바인딩. 호출 13회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export interface RevenueDailyRow {
  id: string;
  lot_id: string;
  revenue_date: string;
  cash_amount: number;
  card_amount: number;
  mobile_amount: number;
  monthly_pass_amount: number;
  other_amount: number;
  total_amount: number;
  total_vehicles: number;
  peak_hour_vehicles: number;
  peak_hour: string | null;
  avg_parking_minutes: number | null;
  turnover_rate: number | null;
  exemption_count: number;
  exemption_amount: number;
  exemption_detail: unknown;
  data_source: string;
  source_detail: string | null;
  verified: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RevenueDailyListQuery {
  lot_id?: string;
  date_from?: string;
  date_to?: string;
  verified?: boolean;
  limit?: number;
  offset?: number;
}

export type RevenueDailyCreateInput = Partial<Omit<RevenueDailyRow, "id" | "total_amount" | "created_at" | "updated_at" | "created_by">> & {
  lot_id: string;
  revenue_date: string;
};
export type RevenueDailyUpdateInput = Partial<RevenueDailyCreateInput>;

const PATH = "/api/revenue-daily";

export const revenueDailyApi = {
  list: (q: RevenueDailyListQuery = {}) =>
    apiClient.get<ListResult<RevenueDailyRow>>(PATH, q as Record<string, string | number | boolean | undefined>),
  get: (id: string) => apiClient.get<RevenueDailyRow>(`${PATH}/${id}`),
  create: (input: RevenueDailyCreateInput) => apiClient.post<RevenueDailyRow>(PATH, input),
  update: (id: string, input: RevenueDailyUpdateInput) => apiClient.patch<RevenueDailyRow>(`${PATH}/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
};
