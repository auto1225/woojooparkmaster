/**
 * Long-tail 8개 테이블 typed 바인딩.
 * 백엔드 routes/long-tail.ts와 1:1 대응. 단순 CRUD라 한 파일로 통합.
 */
import { apiClient } from "./client";
import type { ListResult } from "./code-master";

// ─── free_hours_settings ───
export interface FreeHoursRow {
  id: string;
  lot_id: string;
  setting_name: string | null;
  day_type: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  approved_by: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
}
export const freeHoursApi = makeCrud<FreeHoursRow>("/api/free-hours-settings");

// ─── monthly_passes ───
export interface MonthlyPassRow {
  id: string;
  lot_id: string;
  pass_number: string;
  vehicle_number: string;
  vehicle_type: string | null;
  holder_name: string | null;
  holder_phone: string | null;
  holder_address: string | null;
  pass_start: string;
  pass_end: string;
  fee_amount: number;
  fee_paid: number;
  payment_method: string | null;
  payment_date: string | null;
  receipt_number: string | null;
  status: string;
  auto_renew: boolean;
  renewal_count: number;
  previous_pass_id: string | null;
  issued_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export const monthlyPassesApi = makeCrud<MonthlyPassRow>("/api/monthly-passes");

// ─── survey_photos ───
export interface SurveyPhotoRow {
  id: string;
  survey_id: string;
  category: string;
  file_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  sort_order: number;
  taken_at: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  created_at: string;
}
export const surveyPhotosApi = makeCrud<SurveyPhotoRow>("/api/survey-photos");

// ─── outsourcing_contracts ───
export interface OutsourcingContractRow {
  id: string;
  lot_id: string;
  company_name: string;
  business_number: string | null;
  representative: string | null;
  contract_number: string | null;
  contract_start: string;
  contract_end: string;
  contract_amount: number | null;
  monthly_fee: number | null;
  revenue_share_rate: number | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  performance_score: number | null;
  evaluation_date: string | null;
  evaluation_note: string | null;
  auto_renew: boolean;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
export const outsourcingContractsApi = makeCrud<OutsourcingContractRow>("/api/outsourcing-contracts");

// ─── gateway_devices ───
export interface GatewayDeviceRow {
  id: string;
  lot_id: string;
  device_id: string;
  device_name: string | null;
  ip_address: string | null;
  mac_address: string | null;
  protocol: string;
  mqtt_topic: string | null;
  location_detail: string | null;
  floor: number | null;
  install_date: string | null;
  connected_sensors: number;
  max_sensors: number;
  firmware_version: string | null;
  last_heartbeat: string | null;
  uptime_hours: number | null;
  status: string;
  config: unknown;
  notes: string | null;
  registered_by: string | null;
  created_at: string;
  updated_at: string;
}
export const gatewayDevicesApi = makeCrud<GatewayDeviceRow>("/api/gateway-devices");

// ─── display_boards ───
export interface DisplayBoardRow {
  id: string;
  lot_id: string;
  board_id: string;
  board_name: string | null;
  location: string | null;
  location_type: string | null;
  floor: number | null;
  direction: string | null;
  protocol: string | null;
  ip_address: string | null;
  port: number | null;
  display_type: string | null;
  display_size: string | null;
  max_lines: number;
  current_message: string | null;
  last_push: string | null;
  status: string;
  manufacturer: string | null;
  model: string | null;
  install_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export const displayBoardsApi = makeCrud<DisplayBoardRow>("/api/display-boards");

// ─── survey_basic_info ───
export interface SurveyBasicInfoRow {
  id: string;
  survey_id: string;
  lot_name: string | null;
  address: string | null;
  lot_type: string | null;
  total_spaces: number | null;
  disabled_spaces: number;
  ev_spaces: number;
  compact_spaces: number;
  pregnant_spaces: number;
  other_spaces: number;
  surface_type: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
}
export const surveyBasicInfoApi = makeCrud<SurveyBasicInfoRow>("/api/survey-basic-info");

// ─── survey_operation ───
export interface SurveyOperationRow {
  id: string;
  survey_id: string;
  operating_hours: string | null;
  operating_hours_custom: string | null;
  payment_cash: boolean;
  payment_card: boolean;
  payment_mobile: boolean;
  payment_none: boolean;
  staff_type: string | null;
  staff_count: number | null;
  management_type: string | null;
  control_linked: boolean;
  portal_linked: boolean;
}
export const surveyOperationApi = makeCrud<SurveyOperationRow>("/api/survey-operation");

// ─── 0009 추가 10개 ─── (호출 4~7회)

export const operationsStaffApi = makeCrud<{
  id: string; lot_id: string; staff_name: string; staff_type: string;
  phone: string | null; position: string | null; schedule: unknown;
  hire_date: string | null; resign_date: string | null; is_active: boolean;
  notes: string | null; created_at: string; updated_at: string;
}>("/api/operations-staff");

export const enforcementRecordsApi = makeCrud<{
  id: string; lot_id: string | null; enforcement_number: string;
  vehicle_number: string; vehicle_type: string | null; violation_type: string;
  violation_date: string; violation_location: string | null;
  fine_amount: number | null; payment_status: string;
  appeal_status: string | null; officer_id: string | null; officer_name: string | null;
  notes: string | null; created_at: string; updated_at: string;
}>("/api/enforcement-records");

export const budgetExecutionsApi = makeCrud<{
  id: string; execution_number: string; item_id: string; lot_id: string | null;
  execution_date: string; amount: number; execution_type: string;
  vendor_name: string | null; description: string;
  status: string; approved_by: string | null; approved_at: string | null;
  created_at: string; updated_at: string;
}>("/api/budget-executions");

export const bidEvaluationsApi = makeCrud<{
  id: string; bid_project_id: string; submission_id: string;
  evaluator_id: string | null; evaluator_name: string | null;
  total_score: number; rank: number | null; is_qualified: boolean;
  created_at: string; updated_at: string;
}>("/api/bid-evaluations");

export const bidContractsApi = makeCrud<{
  id: string; bid_project_id: string; submission_id: string;
  contract_number: string; contractor_name: string;
  contract_amount: number; total_amount: number;
  contract_date: string; contract_start: string; contract_end: string;
  status: string; created_at: string; updated_at: string;
}>("/api/bid-contracts");

export const surveyInfraApi = makeCrud<{
  id: string; survey_id: string;
  power_status: string | null; network_wired: boolean; network_wifi: boolean;
  display_installed: boolean; sensor_installed: boolean; sensor_count: number;
  has_barrier: boolean; has_lpr: boolean; has_kiosk: boolean; has_cctv: boolean;
}>("/api/survey-infra");

export const siteCandidatesApi = makeCrud<{
  id: string; site_number: string; name: string;
  address_jibun: string | null; address_road: string | null;
  latitude: number | null; longitude: number | null;
  area_sqm: number | null; ownership: string | null;
  estimated_land_cost: number | null; status: string;
  created_at: string; updated_at: string;
}>("/api/site-candidates");

export const reportGeneratedApi = makeCrud<{
  id: string; report_number: string; template_id: string | null;
  title: string; period_start: string | null; period_end: string | null;
  file_path: string | null; file_format: string | null;
  status: string; generated_by: string | null; created_at: string;
}>("/api/report-generated");

export const maintenanceLogsApi = makeCrud<{
  id: string; log_number: string; lot_id: string;
  equipment_id: string | null; maintenance_type: string;
  priority: string; title: string; description: string | null;
  total_cost: number; status: string;
  reported_at: string; created_at: string; updated_at: string;
}>("/api/maintenance-logs");

// lot_realtime_status — lot_id가 PK라 별도 처리
export interface LotRealtimeStatusRow {
  lot_id: string;
  total_spaces: number;
  occupied_spaces: number;
  available_spaces: number;
  occupancy_rate: number;
  congestion_level: string;
  status: string;
  last_updated: string;
}
export const lotRealtimeStatusApi = {
  list: () => apiClient.get<{ data: LotRealtimeStatusRow[]; total: number }>("/api/lot-realtime-status"),
  get: (lotId: string) => apiClient.get<LotRealtimeStatusRow>(`/api/lot-realtime-status/${lotId}`),
  upsert: (lotId: string, input: Partial<LotRealtimeStatusRow>) =>
    apiClient.put<LotRealtimeStatusRow>(`/api/lot-realtime-status/${lotId}`, input),
};

// ─── 공용 CRUD 헬퍼 ───
function makeCrud<T>(path: string) {
  return {
    list: (q: Record<string, string | number | boolean | undefined> = {}) =>
      apiClient.get<ListResult<T>>(path, q),
    get: (id: string) => apiClient.get<T>(`${path}/${id}`),
    create: (input: Partial<T>) => apiClient.post<T>(path, input),
    update: (id: string, input: Partial<T>) => apiClient.patch<T>(`${path}/${id}`, input),
    remove: (id: string) => apiClient.delete<void>(`${path}/${id}`),
  };
}
