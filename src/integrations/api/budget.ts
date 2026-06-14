/** budget_plans + budget_items 타입 안전 바인딩. 호출 11+10회. */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

export interface BudgetPlanRow {
  id: string;
  fiscal_year: number;
  plan_type: string;
  plan_number: number;
  title: string;
  description: string | null;
  total_revenue: number;
  total_expenditure: number;
  balance: number;
  status: string;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetItemRow {
  id: string;
  plan_id: string;
  lot_id: string | null;
  parent_item_id: string | null;
  item_code: string;
  budget_type: string;
  category_l1: string;
  category_l2: string | null;
  category_l3: string | null;
  category_l4: string | null;
  item_name: string;
  description: string | null;
  previous_year_amount: number;
  requested_amount: number;
  planned_amount: number;
  allocated_amount: number;
  executed_amount: number;
  returned_amount: number;
  remaining_amount: number;
  execution_rate: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetPlanWithItems extends BudgetPlanRow {
  budget_items?: BudgetItemRow[];
}

export interface BudgetPlanListQuery {
  fiscal_year?: number;
  status?: string;
  plan_type?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface BudgetItemListQuery {
  plan_id?: string;
  lot_id?: string;
  budget_type?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export type BudgetPlanCreateInput = Partial<Omit<BudgetPlanRow, "id" | "balance" | "created_at" | "updated_at" | "created_by">> & {
  fiscal_year: number;
  title: string;
};
export type BudgetPlanUpdateInput = Partial<BudgetPlanCreateInput>;

export type BudgetItemCreateInput = Partial<Omit<BudgetItemRow, "id" | "remaining_amount" | "execution_rate" | "created_at" | "updated_at" | "created_by">> & {
  plan_id: string;
  item_code: string;
  budget_type: string;
  category_l1: string;
  item_name: string;
};
export type BudgetItemUpdateInput = Partial<BudgetItemCreateInput>;

export const budgetPlansApi = {
  list: (q: BudgetPlanListQuery = {}) =>
    apiClient.get<ListResult<BudgetPlanRow>>("/api/budget-plans", q as Record<string, string | number | undefined>),
  get: (id: string, opts?: { includeItems?: boolean }) =>
    apiClient.get<BudgetPlanWithItems>(`/api/budget-plans/${id}`, opts?.includeItems ? { include: "items" } : undefined),
  create: (input: BudgetPlanCreateInput) => apiClient.post<BudgetPlanRow>("/api/budget-plans", input),
  update: (id: string, input: BudgetPlanUpdateInput) => apiClient.patch<BudgetPlanRow>(`/api/budget-plans/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`/api/budget-plans/${id}`),
};

export const budgetItemsApi = {
  list: (q: BudgetItemListQuery = {}) =>
    apiClient.get<ListResult<BudgetItemRow>>("/api/budget-items", q as Record<string, string | undefined>),
  get: (id: string) => apiClient.get<BudgetItemRow>(`/api/budget-items/${id}`),
  create: (input: BudgetItemCreateInput) => apiClient.post<BudgetItemRow>("/api/budget-items", input),
  update: (id: string, input: BudgetItemUpdateInput) => apiClient.patch<BudgetItemRow>(`/api/budget-items/${id}`, input),
  remove: (id: string) => apiClient.delete<void>(`/api/budget-items/${id}`),
};
