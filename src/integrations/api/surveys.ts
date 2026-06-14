/** surveys 타입 안전 바인딩. 호출 8회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export type SurveyStatus = "draft" | "in_progress" | "submitted" | "review" | "approved" | "rejected";

export interface SurveyRow {
  id: string;
  lot_id: string;
  survey_type: string;
  status: SurveyStatus;
  surveyor_id: string | null;
  reviewer_id: string | null;
  approver_id: string | null;
  survey_date: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SurveyListQuery {
  lot_id?: string;
  status?: SurveyStatus;
  surveyor_id?: string;
  reviewer_id?: string;
  survey_type?: string;
  limit?: number;
  offset?: number;
}

export type SurveyCreateInput = Partial<Omit<SurveyRow, "id" | "created_at" | "updated_at">> & {
  lot_id: string;
};
export type SurveyUpdateInput = Partial<SurveyCreateInput>;

const PATH = "/api/surveys";

export const surveysApi = {
  list: (q: SurveyListQuery = {}) =>
    apiClient.get<ListResult<SurveyRow>>(PATH, q as Record<string, string | undefined>),
  get: (id: string) => apiClient.get<SurveyRow>(`${PATH}/${id}`),
  create: (input: SurveyCreateInput) => apiClient.post<SurveyRow>(PATH, input),
  update: (id: string, input: SurveyUpdateInput) => apiClient.patch<SurveyRow>(`${PATH}/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`${PATH}/${id}`),
};
