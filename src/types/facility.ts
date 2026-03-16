// ParkMaster™ FACILITY (시설관리) 모듈 타입

export interface Equipment {
  id: string;
  lot_id: string;
  equipment_code: string;
  equipment_type: string;
  name: string;
  model?: string;
  manufacturer?: string;
  serial_number?: string;
  specification?: Record<string, unknown>;
  install_date?: string;
  warranty_start?: string;
  warranty_end?: string;
  useful_life_years?: number;
  replacement_due?: string;
  purchase_cost?: number;
  current_value?: number;
  depreciation_method?: string;
  location_detail?: string;
  floor?: number;
  quantity: number;
  power_consumption?: string;
  network_required?: boolean;
  ip_address?: string;
  firmware_version?: string;
  last_maintenance_date?: string;
  next_maintenance_date?: string;
  total_maintenance_cost: number;
  maintenance_count: number;
  status: EquipmentStatus;
  status_changed_at?: string;
  photo_path?: string;
  manual_path?: string;
  notes?: string;
  registered_by?: string;
  created_at: string;
  updated_at: string;
  parking_lots?: { code: string; name: string };
}

export type EquipmentStatus = 'normal' | 'warning' | 'broken' | 'maintenance' | 'decommissioned';

export interface MaintenanceSchedule {
  id: string;
  lot_id: string;
  equipment_id?: string;
  schedule_name: string;
  schedule_type: string;
  description?: string;
  checklist?: { item: string; required: boolean }[];
  assigned_team?: string;
  assigned_to?: string;
  vendor_name?: string;
  estimated_cost?: number;
  estimated_hours?: number;
  last_completed?: string;
  next_due_date: string;
  recurrence_rule?: Record<string, unknown>;
  advance_notice_days: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  parking_lots?: { code: string; name: string };
  equipment?: { name: string; equipment_type: string };
  assignee?: { name: string };
}

export type MaintenanceLogStatus = 'reported' | 'assigned' | 'in_progress' | 'pending_parts' | 'completed' | 'verified' | 'cancelled';

export interface MaintenanceLog {
  id: string;
  log_number: string;
  lot_id: string;
  equipment_id?: string;
  schedule_id?: string;
  maintenance_type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  symptom?: string;
  cause?: string;
  resolution?: string;
  reported_by?: string;
  reported_at?: string;
  assigned_to?: string;
  assigned_at?: string;
  vendor_name?: string;
  vendor_contact?: string;
  parts_used?: { name: string; qty: number; unit_cost: number }[];
  labor_hours?: number;
  parts_cost: number;
  labor_cost: number;
  other_cost: number;
  total_cost: number;
  started_at?: string;
  completed_at?: string;
  downtime_hours?: number;
  before_photo?: string;
  after_photo?: string;
  checklist_results?: Record<string, unknown>[];
  status: MaintenanceLogStatus;
  closed_by?: string;
  closed_at?: string;
  satisfaction_score?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  parking_lots?: { code: string; name: string };
  equipment?: { name: string; equipment_type: string };
  reporter?: { name: string };
  assignee?: { name: string };
}

export interface SafetyInspection {
  id: string;
  inspection_number: string;
  lot_id: string;
  inspection_type: string;
  inspection_date: string;
  inspector_id?: string;
  inspector_name?: string;
  inspector_org?: string;
  checklist_template?: string;
  checklist_results: ChecklistItem[];
  total_items: number;
  pass_items: number;
  fail_items: number;
  na_items?: number;
  overall_grade?: string;
  issues_found?: string;
  corrective_actions?: string;
  correction_deadline?: string;
  correction_completed?: string;
  correction_verified_by?: string;
  follow_up_required?: boolean;
  follow_up_date?: string;
  status: string;
  photo_paths?: string[];
  report_path?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  parking_lots?: { code: string; name: string };
}

export interface ChecklistItem {
  category: string;
  item: string;
  result: 'pass' | 'fail' | 'na';
  severity?: 'low' | 'medium' | 'high';
  note?: string;
  photo?: string;
}

export interface SurfaceMarking {
  id: string;
  lot_id: string;
  marking_type: string;
  marking_name: string;
  location_detail?: string;
  floor?: number;
  quantity: number;
  material?: string;
  color?: string;
  dimension?: string;
  condition: MarkingCondition;
  condition_note?: string;
  install_date?: string;
  last_repainted?: string;
  next_due?: string;
  repaint_cycle_months?: number;
  estimated_cost?: number;
  photo_path?: string;
  is_regulatory: boolean;
  regulation_ref?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  parking_lots?: { code: string; name: string };
}

export type MarkingCondition = 'good' | 'fair' | 'poor' | 'faded' | 'damaged' | 'missing';

// 한글 라벨 매핑
export const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  barrier: '차단기', lpr: 'LPR', kiosk: '무인정산기', cctv: 'CCTV',
  display_board: '안내전광판', sensor: '주차면센서', gateway: '게이트웨이',
  lighting: '조명', ev_charger: '전기차충전기', fire_extinguisher: '소화기',
  intercom: '인터폰', booth: '관제부스', bollard: '볼라드',
  speed_bump: '과속방지턱', other: '기타',
};

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  normal: '정상', warning: '점검필요', broken: '고장', maintenance: '수리중', decommissioned: '폐기',
};
export const EQUIPMENT_STATUS_COLORS: Record<EquipmentStatus, string> = {
  normal: 'bg-green-100 text-green-800', warning: 'bg-yellow-100 text-yellow-800',
  broken: 'bg-red-100 text-red-800', maintenance: 'bg-blue-100 text-blue-800',
  decommissioned: 'bg-gray-100 text-gray-800',
};

export const PRIORITY_LABELS: Record<string, string> = { low: '낮음', medium: '보통', high: '높음', critical: '긴급' };
export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700', medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700', critical: 'bg-red-100 text-red-700',
};

export const MAINT_STATUS_LABELS: Record<MaintenanceLogStatus, string> = {
  reported: '신고', assigned: '배정', in_progress: '진행중',
  pending_parts: '부품대기', completed: '완료', verified: '검증', cancelled: '취소',
};

export const MAINT_TYPE_LABELS: Record<string, string> = {
  scheduled: '정기점검', emergency: '긴급수리', repair: '일반수리',
  replacement: '교체', inspection: '안전점검', cleaning: '청소', painting: '도색/노면시공',
};

export const CONDITION_LABELS: Record<MarkingCondition, string> = {
  good: '양호', fair: '보통', poor: '불량', faded: '탈색', damaged: '파손', missing: '없음',
};
export const CONDITION_COLORS: Record<MarkingCondition, string> = {
  good: 'bg-green-100 text-green-800', fair: 'bg-blue-100 text-blue-800',
  poor: 'bg-orange-100 text-orange-800', faded: 'bg-yellow-100 text-yellow-800',
  damaged: 'bg-red-100 text-red-800', missing: 'bg-gray-100 text-gray-800',
};

export const GRADE_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-800', B: 'bg-blue-100 text-blue-800',
  C: 'bg-yellow-100 text-yellow-800', D: 'bg-orange-100 text-orange-800',
  F: 'bg-red-100 text-red-800',
};

export const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  daily: '일간', weekly: '주간', monthly: '월간',
  quarterly: '분기', semi_annual: '반기', yearly: '연간',
};

export const INSPECTION_TYPE_LABELS: Record<string, string> = {
  monthly: '월간', quarterly: '분기', semi_annual: '반기', yearly: '연간',
  special: '특별', pre_season: '시즌전', post_typhoon: '태풍후',
};

export const MARKING_TYPE_LABELS: Record<string, string> = {
  parking_line: '주차선', arrow: '화살표/방향', number: '번호 표시',
  disabled_sign: '장애인 표시', ev_sign: '전기차 표시',
  entrance_sign: '입구 안내판', exit_sign: '출구 안내판',
  speed_limit: '속도제한', height_limit: '높이제한',
  fire_lane: '소방통로', info_board: '종합안내판', other: '기타',
};
