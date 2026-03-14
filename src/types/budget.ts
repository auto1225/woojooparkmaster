export interface BudgetPlan {
  id: string;
  fiscal_year: number;
  plan_type: 'original' | 'supplementary' | 'revised';
  plan_number: number;
  title: string;
  description?: string;
  total_revenue: number;
  total_expenditure: number;
  balance: number;
  status: 'draft' | 'submitted' | 'review' | 'approved' | 'rejected' | 'executed';
  submitted_by?: string;
  submitted_at?: string;
  approved_by?: string;
  approved_at?: string;
  reject_reason?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BudgetItem {
  id: string;
  plan_id: string;
  lot_id?: string;
  parent_item_id?: string;
  item_code: string;
  budget_type: 'revenue' | 'expenditure';
  category_l1: string;
  category_l2?: string;
  category_l3?: string;
  category_l4?: string;
  item_name: string;
  description?: string;
  previous_year_amount: number;
  requested_amount: number;
  planned_amount: number;
  allocated_amount: number;
  executed_amount: number;
  returned_amount: number;
  remaining_amount: number;
  execution_rate: number;
  is_mandatory: boolean;
  is_recurring?: boolean;
  frequency?: string;
  responsible_team?: string;
  responsible_person?: string;
  sort_order: number;
  depth: number;
  is_summary: boolean;
  notes?: string;
  created_at?: string;
  children?: BudgetItem[];
  parking_lots?: { code: string; name: string };
}

export interface BudgetExecution {
  id: string;
  execution_number: string;
  item_id: string;
  lot_id?: string;
  execution_date: string;
  amount: number;
  execution_type: 'expenditure' | 'revenue_collection' | 'transfer_in' | 'transfer_out' | 'return' | 'carry_forward';
  vendor_name?: string;
  vendor_business_number?: string;
  description: string;
  document_number?: string;
  document_date?: string;
  payment_method?: string;
  bank_account?: string;
  reference_module?: string;
  reference_id?: string;
  reference_number?: string;
  requested_by?: string;
  approved_by?: string;
  approved_at?: string;
  status: 'pending' | 'approved' | 'executed' | 'rejected' | 'cancelled';
  reject_reason?: string;
  receipt_path?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
  budget_items?: { item_code: string; item_name: string; category_l1: string };
  parking_lots?: { code: string; name: string };
}

export interface BudgetTransfer {
  id: string;
  transfer_number: string;
  fiscal_year: number;
  transfer_type: 'appropriation' | 'use' | 'transfer' | 'reserve';
  from_item_id: string;
  to_item_id: string;
  amount: number;
  reason: string;
  legal_basis?: string;
  requested_by?: string;
  approved_by?: string;
  approved_at?: string;
  status: 'pending' | 'approved' | 'executed' | 'rejected' | 'cancelled';
  reject_reason?: string;
  notes?: string;
  created_by?: string;
  created_at?: string;
}

export const PLAN_TYPE_LABELS: Record<string, string> = { original: '본예산', supplementary: '추경', revised: '수정예산' };
export const BUDGET_STATUS_LABELS: Record<string, string> = { draft: '작성중', submitted: '제출', review: '검토중', approved: '승인', rejected: '반려', executed: '집행중' };
export const BUDGET_STATUS_COLORS: Record<string, string> = { draft: 'bg-gray-100 text-gray-700', submitted: 'bg-yellow-100 text-yellow-700', review: 'bg-blue-100 text-blue-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', executed: 'bg-teal-100 text-teal-700' };
export const EXECUTION_TYPE_LABELS: Record<string, string> = { expenditure: '지출', revenue_collection: '수입징수', transfer_in: '전입', transfer_out: '전출', return: '반납', carry_forward: '이월' };
export const TRANSFER_TYPE_LABELS: Record<string, string> = { appropriation: '전용(동일관내)', use: '이용(관간)', transfer: '이체(기관간)', reserve: '예비비 사용' };
export const TRANSFER_TYPE_COLORS: Record<string, string> = { appropriation: 'bg-blue-100 text-blue-700', use: 'bg-green-100 text-green-700', transfer: 'bg-purple-100 text-purple-700', reserve: 'bg-orange-100 text-orange-700' };
export const BUDGET_TYPE_LABELS: Record<string, string> = { revenue: '세입', expenditure: '세출' };
export const PAYMENT_METHOD_LABELS: Record<string, string> = { bank_transfer: '계좌이체', card: '카드', cash: '현금', check: '수표', offset: '상계' };
