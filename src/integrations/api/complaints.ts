/** complaints 타입 안전 바인딩. 호출 12회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";
import type { AuthUser } from "./auth";

export type ComplaintPriority = "low" | "normal" | "high" | "urgent";
export type ComplaintStatus = "received" | "assigned" | "in_progress" | "responded" | "closed";

export interface ComplaintRow {
  id: string;
  lot_id: string | null;
  complaint_number: string;
  channel: string;
  received_at: string;
  category: string;
  sub_category: string | null;
  title: string;
  content: string;
  location_detail: string | null;
  incident_date: string | null;
  incident_time: string | null;
  vehicle_number: string | null;
  complainant_name: string | null;
  complainant_phone: string | null;
  complainant_email: string | null;
  complainant_address: string | null;
  is_anonymous: boolean;
  priority: ComplaintPriority;
  due_date: string | null;
  due_days: number | null;
  is_overdue: boolean;
  assigned_team: AuthUser["team"] | null;
  assigned_to: string | null;
  assigned_at: string | null;
  response: string | null;
  response_type: string | null;
  responded_at: string | null;
  response_channel: string | null;
  closed_at: string | null;
  status: ComplaintStatus | string;
  satisfaction_rating: number | null;
  satisfaction_feedback: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplaintListQuery {
  status?: string;
  assigned_team?: AuthUser["team"];
  assigned_to?: string;
  lot_id?: string;
  category?: string;
  priority?: ComplaintPriority;
  is_overdue?: boolean;
  q?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export type ComplaintCreateInput = Partial<Omit<ComplaintRow, "id" | "created_at" | "updated_at" | "created_by" | "received_at">> & {
  complaint_number: string;
  channel: string;
  category: string;
  title: string;
  content: string;
};
export type ComplaintUpdateInput = Partial<ComplaintCreateInput>;

const PATH = "/api/complaints";

export const complaintsApi = {
  list: (q: ComplaintListQuery = {}) =>
    apiClient.get<ListResult<ComplaintRow>>(PATH, q as Record<string, string | number | boolean | undefined>),
  get: (id: string) => apiClient.get<ComplaintRow>(`${PATH}/${id}`),
  create: (input: ComplaintCreateInput) => apiClient.post<ComplaintRow>(PATH, input),
  update: (id: string, input: ComplaintUpdateInput) => apiClient.patch<ComplaintRow>(`${PATH}/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
};
