// ParkMaster™ TypeScript Types & Labels

export type TeamType = 'operations' | 'facilities' | 'planning' | 'admin';
export type RoleType = 'admin' | 'manager' | 'editor' | 'viewer';
export type LotType = 'offstreet' | 'onstreet' | 'multilevel' | 'vacant_lot' | 'underground';
export type OperatorType = 'direct' | 'outsourced' | 'other';
export type SurfaceType = 'ascon' | 'block' | 'concrete' | 'other';
export type PowerStatus = 'supplied' | 'available' | 'unavailable';
export type LotStatus = 'active' | 'inactive' | 'construction' | 'closed';
export type SpaceType = 'general' | 'disabled' | 'ev' | 'compact' | 'pregnant' | 'motorcycle' | 'other';
export type SurveyStatus = 'draft' | 'in_progress' | 'submitted' | 'review' | 'approved' | 'rejected';

export const TEAM_LABELS: Record<TeamType, string> = { operations: '운영관리팀', facilities: '시설관리팀', planning: '기획팀', admin: '관리자' };
export const ROLE_LABELS: Record<RoleType, string> = { admin: '관리자', manager: '매니저', editor: '편집자', viewer: '열람자' };
export const LOT_TYPE_LABELS: Record<LotType, string> = { offstreet: '노외주차장', onstreet: '노상주차장', multilevel: '복층화 주차장', vacant_lot: '공한지 주차장', underground: '지하주차장' };
export const OPERATOR_LABELS: Record<OperatorType, string> = { direct: '직영', outsourced: '위탁운영', other: '기타' };
export const SURFACE_LABELS: Record<SurfaceType, string> = { ascon: '아스콘', block: '블럭', concrete: '콘크리트', other: '기타' };
export const LOT_STATUS_LABELS: Record<LotStatus, string> = { active: '운영중', inactive: '미운영', construction: '공사중', closed: '폐쇄' };
export const POWER_LABELS: Record<PowerStatus, string> = { supplied: '공급중', available: '가능', unavailable: '불가' };

export interface Profile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  employee_number?: string;
  department?: string;
  team: TeamType;
  role: RoleType;
  avatar_url?: string;
  is_active: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ParkingLot {
  id: string;
  code: string;
  name: string;
  address_jibun?: string;
  address_road?: string;
  latitude?: number;
  longitude?: number;
  lot_type: LotType;
  total_spaces: number;
  disabled_spaces: number;
  ev_spaces: number;
  compact_spaces: number;
  pregnant_spaces: number;
  other_spaces: number;
  floors: number;
  area_sqm?: number;
  operator_type: OperatorType;
  operator_name?: string;
  surface_type?: SurfaceType;
  has_gate: boolean;
  has_lpr: boolean;
  has_kiosk: boolean;
  has_cctv: boolean;
  has_display_board: boolean;
  has_sensor: boolean;
  control_system_linked: boolean;
  portal_linked: boolean;
  power_status?: PowerStatus;
  network_type?: string;
  status: LotStatus;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface SystemConfig {
  id: string;
  config_key: string;
  config_value: string;
  description?: string;
}

export interface ModuleLicense {
  id: string;
  module_code: string;
  module_name: string;
  license_type: string;
  is_active: boolean;
  license_key?: string;
  starts_at: string;
  expires_at?: string;
  activated_at?: string;
}

export interface ActivityLog {
  id: string;
  user_id?: string;
  user_name?: string;
  module: string;
  action: string;
  target_type?: string;
  target_id?: string;
  target_name?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  module: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}
