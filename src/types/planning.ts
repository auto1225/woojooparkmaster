// ParkMaster™ PLANNING (신설기획) 모듈 타입 & 라벨

export interface SiteCandidate {
  id: string;
  site_number: string;
  name: string;
  address_jibun?: string;
  address_road?: string;
  latitude?: number;
  longitude?: number;
  administrative_dong?: string;
  area_sqm?: number;
  shape?: string;
  frontage_m?: number;
  depth_m?: number;
  slope_pct?: number;
  ground_condition?: string;
  zoning?: string;
  land_use?: string;
  land_category?: string;
  ownership?: string;
  owner_name?: string;
  acquisition_method?: string;
  estimated_land_cost?: number;
  planned_lot_type?: string;
  estimated_spaces?: number;
  estimated_floors?: number;
  planned_space_detail?: Record<string, number>;
  nearest_road?: string;
  road_width_m?: number;
  traffic_volume?: string;
  public_transport_access?: string;
  pedestrian_access?: string;
  nearby_parking_lots?: any[];
  nearby_facilities?: string;
  surrounding_population?: number;
  surrounding_commercial_area?: number;
  legal_restrictions?: string;
  building_coverage_ratio?: number;
  floor_area_ratio?: number;
  height_limit_m?: number;
  setback_m?: number;
  environmental_review?: boolean;
  traffic_impact_review?: boolean;
  cultural_heritage_review?: boolean;
  location_score?: number;
  accessibility_score?: number;
  demand_score?: number;
  feasibility_score?: number;
  legal_score?: number;
  total_score?: number;
  ranking?: number;
  estimated_construction_cost?: number;
  estimated_annual_revenue?: number;
  estimated_annual_expense?: number;
  estimated_annual_profit?: number;
  bc_ratio?: number;
  payback_years?: number;
  npv?: number;
  irr?: number;
  status: string;
  evaluation_date?: string;
  evaluator_id?: string;
  decision_date?: string;
  decision_note?: string;
  photos?: any;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ConstructionProject {
  id: string;
  project_number: string;
  project_name: string;
  site_id?: string;
  lot_id?: string;
  project_type: string;
  description?: string;
  phase: string;
  contractor?: string;
  contractor_phone?: string;
  supervisor?: string;
  supervisor_phone?: string;
  designer?: string;
  total_budget?: number;
  design_cost?: number;
  construction_cost?: number;
  supervision_cost?: number;
  other_cost?: number;
  spent?: number;
  remaining?: number;
  budget_execution_rate?: number;
  budget_item_id?: string;
  bid_contract_id?: string;
  service_project_id?: string;
  planning_start?: string;
  planning_end?: string;
  design_start?: string;
  design_end?: string;
  construction_start?: string;
  construction_end?: string;
  target_completion?: string;
  actual_completion?: string;
  progress_pct: number;
  progress_detail?: any;
  permits_required?: any;
  permits_completed: number;
  permits_total: number;
  status: string;
  delay_days?: number;
  delay_reason?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  site?: SiteCandidate;
  parking_lot?: { code: string; name: string };
}

export interface DesignDocument {
  id: string;
  project_id: string;
  doc_number: string;
  doc_type: string;
  title: string;
  description?: string;
  file_path: string;
  file_format?: string;
  file_size?: number;
  version: string;
  version_note?: string;
  is_current: boolean;
  previous_version_id?: string;
  review_status: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_comments?: string;
  approved_by?: string;
  approved_at?: string;
  category?: string;
  tags?: any;
  uploaded_by?: string;
  created_at: string;
}

export interface Permit {
  id: string;
  project_id: string;
  permit_number?: string;
  permit_type: string;
  permit_category?: string;
  authority: string;
  authority_department?: string;
  authority_contact?: string;
  application_date?: string;
  target_approval_date?: string;
  actual_approval_date?: string;
  expiry_date?: string;
  conditions?: string;
  required_documents?: any;
  submitted_documents?: any;
  fee_amount?: number;
  fee_paid?: boolean;
  status: string;
  rejection_reason?: string;
  resubmission_date?: string;
  resubmission_count?: number;
  application_doc_path?: string;
  approval_doc_path?: string;
  notes?: string;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
}

// 한글 매핑
export const SITE_STATUS_LABELS: Record<string, string> = {
  candidate: '후보', evaluating: '평가중', selected: '선정',
  rejected: '탈락', construction: '공사중', completed: '완료',
};
export const SITE_STATUS_COLORS: Record<string, string> = {
  candidate: 'bg-muted text-muted-foreground',
  evaluating: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  selected: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  construction: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  completed: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
};
export const OWNERSHIP_LABELS: Record<string, string> = {
  municipal: '시유지', national: '국유지', private: '사유지', mixed: '혼합',
};
export const PROJECT_TYPE_LABELS: Record<string, string> = {
  new_construction: '신설', expansion: '확장', renovation: '리모델링',
  multilevel: '복층화', underground: '지하화',
};
export const PHASE_LABELS: Record<string, string> = {
  planning: '기획', basic_design: '기본설계', detail_design: '실시설계',
  permitting: '인허가', bidding: '입찰', construction: '시공',
  inspection: '준공검수', completion: '준공',
};
export const PHASE_ORDER = [
  'planning', 'basic_design', 'detail_design', 'permitting',
  'bidding', 'construction', 'inspection', 'completion',
];
export const CONSTRUCTION_STATUS_LABELS: Record<string, string> = {
  planning: '기획중', in_progress: '진행중', suspended: '중단',
  completed: '완료', cancelled: '취소',
};
export const CONSTRUCTION_STATUS_COLORS: Record<string, string> = {
  planning: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  suspended: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};
export const PERMIT_STATUS_LABELS: Record<string, string> = {
  not_started: '미착수', preparing: '준비중', submitted: '제출',
  reviewing: '심사중', approved: '승인', conditional_approved: '조건부승인',
  rejected: '반려', expired: '만료', resubmitting: '재제출',
};
export const PERMIT_STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-muted text-muted-foreground',
  preparing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  submitted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  reviewing: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  conditional_approved: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-muted text-muted-foreground',
  resubmitting: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
};
export const REVIEW_STATUS_LABELS: Record<string, string> = {
  draft: '작성중', submitted: '제출', reviewing: '검토중',
  approved: '승인', revision_required: '수정요청', final: '최종',
};
export const DOC_TYPE_LABELS: Record<string, string> = {
  master_plan: '종합배치도', floor_plan: '층별 평면도', elevation: '입면도',
  section: '단면도', detail: '상세도', structural: '구조도',
  electrical: '전기도', mechanical: '기계설비도', landscape: '조경도',
  traffic: '교통처리도', as_built: '준공도면', other: '기타',
};
export const DOC_CATEGORY_LABELS: Record<string, string> = {
  architectural: '건축', structural: '구조', mep: '기계전기',
  civil: '토목', landscape: '조경', traffic: '교통',
};
export const SHAPE_LABELS: Record<string, string> = {
  rectangular: '직사각', square: '정사각', irregular: '부정형',
  triangular: '삼각형', L_shape: 'L자형',
};
export const ACQUISITION_LABELS: Record<string, string> = {
  owned: '기보유', purchase: '매입', lease: '임차',
  donation: '기부채납', expropriation: '수용',
};

export function getSiteGrade(score?: number | null): string {
  if (!score) return 'D(미흡)';
  if (score >= 80) return 'A(우수)';
  if (score >= 60) return 'B(양호)';
  if (score >= 40) return 'C(보통)';
  return 'D(미흡)';
}

export function getSiteGradeColor(score?: number | null): string {
  if (!score) return 'bg-muted text-muted-foreground';
  if (score >= 80) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
  if (score >= 60) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  if (score >= 40) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
  return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
}

export function formatBudgetWon(value?: number | null): string {
  if (!value) return '-';
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억원`;
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만원`;
  return `${value.toLocaleString()}원`;
}
