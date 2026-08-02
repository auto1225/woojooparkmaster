export interface SurveyDataSourceSummary {
  source_code: string;
  title: string;
  publisher: string;
  contractor: string | null;
  report_month: string;
  source_filename: string;
  source_sha256: string;
  validation_status: 'pending' | 'validated' | 'rejected';
}

export interface ParkingLotSurveyFact {
  id: string;
  lot_id: string;
  source_id: string;
  source_record_no: number;
  general_spaces: number;
  other_space_type: string | null;
  operation_category: string | null;
  operating_hours_text: string | null;
  management_type: string | null;
  resident_staff_count: number;
  control_system_linked: boolean;
  parking_portal_linked: boolean;
  display_installation_status: string | null;
  display_network_type: string | null;
  display_use_status: string | null;
  entrance_count: number;
  exit_count: number;
  entrance_exit_shared: boolean;
  existing_sensor_status: string | null;
  sensor_manufacturer: string | null;
  sensor_use_status: string | null;
  control_manufacturer: string | null;
  utilization_band: string | null;
  peak_period: string | null;
  primary_users: string | null;
  user_notes: string | null;
  new_sensor_target_count: number;
  gateway_target_count: number;
  display_development_possible: string | null;
  portal_link_possible: string | null;
  power_supply_status: string | null;
  wired_network_status: string | null;
  windows_update_status: string | null;
  priority_rank: number | null;
  priority_score: number | null;
  priority_note: string | null;
  source_pages: Record<string, number>;
  survey_data_sources: SurveyDataSourceSummary;
}
