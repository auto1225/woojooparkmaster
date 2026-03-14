export interface ServiceProject {
  id: string; title: string; project_number: string; lot_id?: string;
  bid_contract_id?: string; budget_item_id?: string;
  service_type: string; service_category?: string;
  contractor_name: string; contractor_business_number?: string;
  contractor_representative?: string; contractor_address?: string;
  contractor_phone?: string; contractor_email?: string;
  contractor_manager?: string; contractor_manager_phone?: string;
  supervisor_id?: string; inspector_id?: string; sub_supervisor_id?: string;
  contract_amount: number; vat_amount?: number; total_amount: number;
  paid_amount: number; remaining_amount: number; payment_rate: number;
  contract_date?: string; start_date: string; end_date: string;
  actual_start_date?: string; actual_end_date?: string;
  work_days?: number; extended_days?: number; extended_end_date?: string;
  warranty_months?: number; warranty_start?: string; warranty_end?: string;
  warranty_bond_amount?: number; warranty_bond_company?: string;
  progress_pct: number; progress_note?: string;
  status: string; status_changed_at?: string;
  suspension_reason?: string; termination_reason?: string;
  description?: string; scope_of_work?: string;
  notes?: string; created_by?: string; created_at: string; updated_at?: string;
  parking_lots?: { code: string; name: string };
  supervisor?: { name: string };
  inspector?: { name: string };
}

export interface ServiceMilestone {
  id: string; project_id: string; milestone_number: number;
  milestone_type: string; title: string; description?: string;
  target_date: string; actual_date?: string; delay_days: number;
  weight_pct: number; deliverables_expected?: string;
  deliverables_count: number; deliverables_submitted: number;
  payment_amount: number; payment_requested: boolean;
  status: string; notes?: string; created_at: string;
}

export interface ServiceDeliverable {
  id: string; project_id: string; milestone_id?: string;
  deliverable_number: string; title: string; deliverable_type: string;
  description?: string; format_required?: string; required_copies: number;
  file_path?: string; submitted_at?: string; submitted_by?: string;
  status: string; review_note?: string; review_score?: number;
  revision_count: number; revision_deadline?: string; revision_note?: string;
  sort_order: number; created_at: string;
}

export interface ServiceInspection {
  id: string; project_id: string; milestone_id?: string;
  inspection_number: string; inspection_type: string;
  inspection_seq: number; title: string; inspection_date: string;
  inspector_id: string; inspector_name?: string;
  target_amount: number; deduction_amount: number; approved_amount?: number;
  deduction_reason?: string;
  checklist_results?: { item: string; result: string; note?: string }[];
  total_items: number; pass_items: number; fail_items: number;
  result?: string; result_note?: string;
  deficiency_note?: string; correction_items?: any[];
  correction_deadline?: string; correction_verified: boolean;
  status: string; approved_by?: string; approved_at?: string;
  notes?: string; created_at: string;
  service_projects?: { title: string; project_number: string };
}

export interface ServicePayment {
  id: string; project_id: string; inspection_id?: string;
  payment_number: string; payment_type: string;
  payment_seq: number; title: string;
  gross_amount: number; advance_deduction: number;
  other_deduction: number; net_amount: number;
  request_date: string; due_date?: string; paid_date?: string;
  paid_amount?: number; payment_method?: string;
  budget_execution_id?: string;
  is_delayed: boolean; delay_days?: number; delay_interest: number;
  status: string; approved_by?: string; reject_reason?: string;
  notes?: string; created_at: string;
  service_projects?: { title: string; project_number: string };
}

export interface ServiceIssue {
  id: string; project_id: string; issue_number: string;
  issue_type: string; severity: string; title: string;
  description: string; impact_amount: number; impact_days: number;
  impact_scope?: string;
  reported_by?: string; reported_at: string; assigned_to?: string;
  requires_approval: boolean; approval_status?: string;
  resolution?: string; resolved_at?: string;
  revised_amount?: number; revised_end_date?: string;
  status: string; notes?: string; created_at: string;
  service_projects?: { title: string; project_number: string };
}

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  facility_maintenance: '시설보수', cleaning: '청소', landscaping: '조경',
  security: '보안/경비', consulting: '컨설팅', it_service: 'IT용역',
  survey: '현황조사', construction_supervision: '감리', other: '기타',
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  preparing: '준비중', in_progress: '진행중', suspended: '중지',
  inspection: '검수중', completed: '완료', warranty: '하자보증',
  closed: '종결', terminated: '해지',
};

export const PROJECT_STATUS_COLORS: Record<string, string> = {
  preparing: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-100 text-blue-700',
  suspended: 'bg-orange-100 text-orange-700',
  inspection: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  warranty: 'bg-teal-100 text-teal-700',
  closed: 'bg-muted text-muted-foreground',
  terminated: 'bg-destructive/10 text-destructive',
};

export const MILESTONE_TYPE_LABELS: Record<string, string> = {
  kickoff: '착수', progress: '기성', interim: '중간', final: '최종', warranty: '하자',
};

export const MILESTONE_STATUS_LABELS: Record<string, string> = {
  pending: '대기', in_progress: '진행중', completed: '완료', delayed: '지연', skipped: '건너뜀',
};

export const INSPECTION_TYPE_LABELS: Record<string, string> = {
  progress: '기성검수', interim: '중간검수', final: '준공검수', defect: '하자검수',
};

export const INSPECTION_STATUS_LABELS: Record<string, string> = {
  pending: '대기', inspecting: '검수중', correction_required: '보완요구',
  correction_submitted: '보완제출', approved: '승인', rejected: '반려',
};

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  advance: '선급금', progress: '기성금', final: '준공금',
  retention_return: '하자보증금반환', delay_penalty: '지체상금',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  requested: '청구', reviewing: '검토중', approved: '승인', paid: '지급완료',
  rejected: '반려', cancelled: '취소',
};

export const ISSUE_TYPE_LABELS: Record<string, string> = {
  change_order: '설계변경', extension: '공기연장', defect: '하자', dispute: '분쟁',
  safety: '안전', quality: '품질', delay: '지연', cost: '비용', other: '기타',
};

export const SEVERITY_LABELS: Record<string, string> = {
  low: '낮음', medium: '보통', high: '높음', critical: '긴급',
};

export const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-destructive/10 text-destructive',
};

export const ISSUE_STATUS_LABELS: Record<string, string> = {
  open: '미해결', in_progress: '처리중', pending_approval: '승인대기',
  approved: '승인', resolved: '해결', closed: '종결', rejected: '반려',
};

export const DELIVERABLE_STATUS_LABELS: Record<string, string> = {
  pending: '대기', submitted: '제출', reviewing: '검토중',
  accepted: '승인', revision_required: '보완요청', rejected: '반려', final: '최종확정',
};

export const RESULT_LABELS: Record<string, string> = {
  pass: '합격', conditional: '조건부합격', fail: '불합격',
};

export const RESULT_COLORS: Record<string, string> = {
  pass: 'bg-green-100 text-green-700',
  conditional: 'bg-yellow-100 text-yellow-700',
  fail: 'bg-destructive/10 text-destructive',
};

export function formatServiceAmount(amount: number): string {
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억`;
  if (amount >= 10000) return `${Math.round(amount / 10000).toLocaleString()}만`;
  return amount.toLocaleString();
}
