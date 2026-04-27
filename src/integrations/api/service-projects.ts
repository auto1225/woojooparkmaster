/** service_projects 타입 안전 바인딩. 호출 6회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export interface ServiceProjectRow {
  id: string;
  title: string;
  project_number: string;
  lot_id: string | null;
  service_type: string;
  service_category: string | null;
  description: string | null;
  contractor_name: string;
  contractor_business_number: string | null;
  contractor_representative: string | null;
  contract_amount: number;
  vat_amount: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_rate: number;
  contract_date: string | null;
  start_date: string;
  end_date: string;
  actual_start_date: string | null;
  actual_end_date: string | null;
  warranty_months: number | null;
  warranty_start: string | null;
  warranty_end: string | null;
  progress_pct: number;
  status: string;
  notes: string | null;
  supervisor_id: string | null;
  inspector_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceProjectListQuery {
  status?: string;
  service_type?: string;
  lot_id?: string;
  supervisor_id?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export type ServiceProjectCreateInput = Partial<Omit<ServiceProjectRow, "id" | "remaining_amount" | "payment_rate" | "created_at" | "updated_at" | "created_by">> & {
  title: string;
  project_number: string;
  service_type: string;
  contractor_name: string;
  contract_amount: number;
  total_amount: number;
  start_date: string;
  end_date: string;
};
export type ServiceProjectUpdateInput = Partial<ServiceProjectCreateInput>;

const PATH = "/api/service-projects";

export const serviceProjectsApi = {
  list: (q: ServiceProjectListQuery = {}) =>
    apiClient.get<ListResult<ServiceProjectRow>>(PATH, q as Record<string, string | undefined>),
  get: (id: string) => apiClient.get<ServiceProjectRow>(`${PATH}/${id}`),
  create: (input: ServiceProjectCreateInput) => apiClient.post<ServiceProjectRow>(PATH, input),
  update: (id: string, input: ServiceProjectUpdateInput) => apiClient.patch<ServiceProjectRow>(`${PATH}/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
};
