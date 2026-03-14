export type SurveyStatus = 'draft' | 'in_progress' | 'submitted' | 'review' | 'approved' | 'rejected';

export const SURVEY_STATUS_LABELS: Record<SurveyStatus, string> = {
  draft: '작성중', in_progress: '조사중', submitted: '제출됨',
  review: '검토중', approved: '승인', rejected: '반려'
};

export const SURVEY_STATUS_COLORS: Record<SurveyStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  submitted: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  review: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
};

export const SURVEY_TYPE_LABELS: Record<string, string> = {
  initial: '최초조사',
  regular: '정기조사',
  special: '특별조사',
};

export interface Survey {
  id: string;
  lot_id: string;
  survey_type: string;
  status: SurveyStatus;
  surveyor_id?: string | null;
  reviewer_id?: string | null;
  approver_id?: string | null;
  survey_date?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  approved_at?: string | null;
  reject_reason?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  parking_lots?: { code: string; name: string; address_jibun?: string | null };
  surveyor?: { name: string } | null;
}

export interface SurveyBasicInfo {
  id: string;
  survey_id: string;
  lot_name?: string | null;
  address?: string | null;
  lot_type?: string | null;
  lot_type_floor?: number | null;
  operator_type?: string | null;
  total_spaces?: number | null;
  disabled_spaces?: number | null;
  ev_spaces?: number | null;
  compact_spaces?: number | null;
  pregnant_spaces?: number | null;
  other_spaces?: number | null;
  other_spaces_desc?: string | null;
  entry_count?: number | null;
  exit_count?: number | null;
  entry_exit_same?: boolean | null;
  surface_type?: string | null;
  surface_type_etc?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
}

export interface SurveyOperation {
  id: string;
  survey_id: string;
  operating_hours?: string | null;
  operating_hours_custom?: string | null;
  payment_cash?: boolean | null;
  payment_card?: boolean | null;
  payment_mobile?: boolean | null;
  payment_none?: boolean | null;
  staff_type?: string | null;
  staff_count?: number | null;
  management_type?: string | null;
  management_etc?: string | null;
  control_linked?: boolean | null;
  portal_linked?: boolean | null;
}

export interface SurveyInfra {
  id: string;
  survey_id: string;
  power_status?: string | null;
  power_note?: string | null;
  network_wired?: boolean | null;
  network_wifi?: boolean | null;
  network_lte?: boolean | null;
  network_etc?: string | null;
  display_installed?: boolean | null;
  display_in_use?: boolean | null;
  display_company?: string | null;
  display_not_use_reason?: string | null;
  display_network?: string | null;
  display_sw_status?: string | null;
  display_sw_note?: string | null;
  sensor_installed?: boolean | null;
  sensor_count?: number | null;
  sensor_in_use?: boolean | null;
  sensor_company?: string | null;
  has_barrier?: boolean | null;
  has_lpr?: boolean | null;
  has_kiosk?: boolean | null;
  has_cctv?: boolean | null;
  equipment_company?: string | null;
}

export interface SurveyUsage {
  id: string;
  survey_id: string;
  avg_usage_rate?: string | null;
  peak_morning?: boolean | null;
  peak_afternoon?: boolean | null;
  peak_night?: boolean | null;
  peak_free_time?: boolean | null;
  user_residents?: boolean | null;
  user_commercial?: boolean | null;
  user_tourists?: boolean | null;
  user_etc?: string | null;
}

export interface SurveySensorPlan {
  id: string;
  survey_id: string;
  planned_sensors?: number | null;
  planned_gateways?: number | null;
  gateway_location?: string | null;
  display_sw_feasibility?: string | null;
  display_sw_note?: string | null;
  portal_feasibility?: string | null;
  portal_note?: string | null;
}

export interface SurveyPhoto {
  id: string;
  survey_id: string;
  category: string;
  file_path: string;
  thumbnail_path?: string | null;
  caption?: string | null;
  sort_order: number;
  taken_at?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  created_at: string;
}

export const PHOTO_CATEGORIES = [
  { code: 'panorama', label: '전경' },
  { code: 'entrance', label: '입구' },
  { code: 'exit', label: '출구' },
  { code: 'display', label: '안내전광판' },
  { code: 'gateway', label: '게이트웨이 설치지점(예상)' },
  { code: 'booth', label: '관제부스' },
  { code: 'barrier_lpr', label: '차단기/LPR' },
  { code: 'kiosk', label: '무인정산기' },
  { code: 'cctv', label: 'CCTV' },
] as const;
