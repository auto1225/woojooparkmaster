export interface BidProject {
  id: string;
  title: string;
  bid_number: string;
  lot_id?: string;
  bid_type: 'open' | 'limited' | 'private' | 'negotiation';
  contract_type: 'construction' | 'goods' | 'service' | 'lease' | 'outsourcing';
  category?: string;
  estimated_amount?: number;
  design_amount?: number;
  vat_included?: boolean;
  budget_item_id?: string;
  budget_available_amount?: number;
  description?: string;
  scope_of_work?: string;
  location?: string;
  work_period_days?: number;
  work_start_date?: string;
  work_end_date?: string;
  qualification?: string;
  qualification_criteria?: any[];
  evaluation_method?: string;
  evaluation_criteria?: any[];
  lowest_price_rate?: number;
  announce_date?: string;
  bid_start_date?: string;
  bid_deadline?: string;
  bid_open_date?: string;
  bid_open_location?: string;
  nara_ref?: string;
  nara_url?: string;
  successful_bidder?: string;
  contract_amount?: number;
  savings_rate?: number;
  status: string;
  cancel_reason?: string;
  rebid_count?: number;
  previous_bid_id?: string;
  created_by?: string;
  assigned_to?: string;
  created_at: string;
  updated_at?: string;
  parking_lots?: { code: string; name: string };
  profiles?: { name: string };
}

export interface BidSubmission {
  id: string;
  bid_project_id: string;
  submission_number: string;
  company_name: string;
  business_number?: string;
  representative?: string;
  established_date?: string;
  employee_count?: number;
  annual_revenue?: number;
  main_business?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  bid_amount?: number;
  bid_rate?: number;
  submitted_at?: string;
  documents?: any[];
  is_valid: boolean;
  invalid_reason?: string;
  past_performance?: any[];
  notes?: string;
  created_at: string;
}

export interface BidEvaluation {
  id: string;
  bid_project_id: string;
  submission_id: string;
  evaluator_name?: string;
  evaluation_date?: string;
  price_score: number;
  technical_score: number;
  business_score: number;
  performance_score: number;
  total_score: number;
  rank?: number;
  evaluation_detail?: any[];
  is_qualified: boolean;
  disqualification_reason?: string;
  bid_submissions?: BidSubmission;
}

export interface BidContract {
  id: string;
  bid_project_id: string;
  submission_id: string;
  contract_number: string;
  contractor_name: string;
  contractor_business_number?: string;
  contractor_representative?: string;
  contract_amount: number;
  vat_amount: number;
  total_amount: number;
  contract_date: string;
  contract_start: string;
  contract_end: string;
  warranty_months?: number;
  warranty_end?: string;
  performance_bond_rate?: number;
  performance_bond_amount?: number;
  performance_bond_company?: string;
  penalty_rate: number;
  payment_terms?: any[];
  special_conditions?: string;
  status: string;
  service_project_id?: string;
  created_at: string;
  bid_projects?: BidProject;
}

export interface BidDocument {
  id: string;
  bid_project_id: string;
  contract_id?: string;
  doc_type: string;
  doc_category: string;
  title: string;
  file_path: string;
  file_size?: number;
  file_format?: string;
  version: string;
  is_current: boolean;
  is_public: boolean;
  uploaded_by?: string;
  created_at: string;
}

export const BID_TYPE_LABELS: Record<string, string> = {
  open: '일반경쟁', limited: '제한경쟁', private: '지명경쟁', negotiation: '수의계약',
};
export const BID_TYPE_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700', limited: 'bg-purple-100 text-purple-700',
  private: 'bg-orange-100 text-orange-700', negotiation: 'bg-teal-100 text-teal-700',
};
export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  construction: '공사', goods: '물품', service: '용역', lease: '임대', outsourcing: '위탁',
};
export const BID_STATUS_LABELS: Record<string, string> = {
  draft: '작성중', review: '검토중', announced: '공고중', bidding: '입찰진행',
  closed: '마감', evaluation: '평가중', awarded: '낙찰', contracted: '계약완료',
  cancelled: '취소', failed: '유찰', rebid: '재공고',
};
export const BID_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', review: 'bg-yellow-100 text-yellow-700',
  announced: 'bg-blue-100 text-blue-700', bidding: 'bg-cyan-100 text-cyan-700',
  closed: 'bg-orange-100 text-orange-700', evaluation: 'bg-purple-100 text-purple-700',
  awarded: 'bg-teal-100 text-teal-700', contracted: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700', failed: 'bg-red-100 text-red-700',
  rebid: 'bg-pink-100 text-pink-700',
};
export const EVAL_METHOD_LABELS: Record<string, string> = {
  lowest_price: '최저가', qualification: '적격심사', technical: '기술평가', negotiation: '협상',
};
export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  active: '이행중', completed: '완료', terminated: '해지', extended: '연장',
};
export const DOC_TYPE_LABELS: Record<string, string> = {
  specification: '설계서/시방서', task_order: '과업지시서', estimate: '원가계산서',
  announcement: '공고문', contract: '계약서', performance_bond: '이행보증',
  defect_bond: '하자보증', advance_bond: '선급보증', insurance: '보험증권', other: '기타',
};
export const DOC_CATEGORY_LABELS: Record<string, string> = {
  bid: '입찰서류', contract: '계약서류', bond: '보증서류', other: '기타',
};

export const PIPELINE_STEPS = [
  { key: 'draft', label: '작성중' },
  { key: 'announced', label: '공고중' },
  { key: 'bidding', label: '입찰진행' },
  { key: 'evaluation', label: '평가중' },
  { key: 'awarded', label: '낙찰' },
  { key: 'contracted', label: '계약완료' },
] as const;

export function formatOkWon(amount: number | null | undefined): string {
  if (!amount) return '0';
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억`;
  if (amount >= 10000) return `${Math.round(amount / 10000).toLocaleString()}만`;
  return amount.toLocaleString();
}
