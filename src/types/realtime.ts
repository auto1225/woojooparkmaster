export interface GatewayDevice {
  id: string; lot_id: string; device_id: string; device_name?: string;
  ip_address?: string; mac_address?: string; protocol: string; mqtt_topic?: string;
  location_detail?: string; floor?: number; install_date?: string;
  connected_sensors: number; max_sensors: number;
  firmware_version?: string; hardware_version?: string;
  last_heartbeat?: string; last_data_received?: string;
  uptime_hours?: number; restart_count?: number;
  status: 'active' | 'offline' | 'maintenance' | 'decommissioned';
  alert_offline_minutes?: number; config?: Record<string, any>;
  notes?: string; registered_by?: string;
  created_at?: string; updated_at?: string;
  // from view
  health_status?: 'online' | 'offline' | string;
  active_sensors?: number; problem_sensors?: number;
  lot_name?: string; lot_code?: string;
  parking_lots?: { code: string; name: string; };
}

export interface SensorDevice {
  id: string; lot_id: string; space_id?: string; gateway_id?: string;
  device_id: string; device_name?: string; device_type: string; model?: string;
  install_date?: string; location_detail?: string; floor?: number; zone?: string;
  mounting_type?: string; mounting_height_cm?: number;
  firmware_version?: string; battery_level?: number; battery_voltage?: number;
  rssi?: number; snr?: number;
  last_heartbeat?: string; last_reading?: string;
  total_readings: number; error_count: number;
  status: 'active' | 'offline' | 'low_battery' | 'error' | 'maintenance' | 'decommissioned';
  calibration_date?: string;
  alert_battery_threshold?: number; alert_offline_minutes?: number;
  config?: Record<string, any>; notes?: string;
  created_at?: string; updated_at?: string;
  // from view
  health_status?: string;
  lot_name?: string; lot_code?: string;
  gateway_device_id?: string;
  parking_lots?: { code: string; name: string; };
  gateway_devices?: { device_id: string; };
}

export interface LotRealtimeStatus {
  lot_id: string; total_spaces: number; occupied_spaces: number;
  available_spaces: number; occupancy_rate: number;
  occupied_disabled?: number; occupied_ev?: number;
  available_disabled?: number; available_ev?: number;
  congestion_level: 'empty' | 'normal' | 'crowded' | 'full';
  status: string; last_updated?: string;
  gate_count_in?: number; gate_count_out?: number;
  sensor_vs_gate_diff?: number;
  today_total_in: number; today_total_out?: number;
  today_peak_occupied: number; today_peak_time?: string;
  today_avg_duration_min?: number;
  parking_lots?: { code: string; name: string; latitude?: number; longitude?: number; };
}

export interface DisplayBoard {
  id: string; lot_id: string; board_id: string; board_name?: string;
  location?: string; location_type?: string; floor?: number; direction?: string;
  protocol?: string; ip_address?: string; port?: number;
  serial_config?: Record<string, any>;
  display_type?: string; display_size?: string; max_lines?: number;
  display_template?: Record<string, any>;
  current_message?: string;
  last_push?: string; last_push_success?: boolean; last_error?: string;
  push_interval_sec?: number;
  status: 'active' | 'offline' | 'error' | 'maintenance';
  manufacturer?: string; model?: string; install_date?: string;
  notes?: string; created_at?: string; updated_at?: string;
  parking_lots?: { code: string; name: string; };
}

export const CONGESTION_LABELS: Record<string, string> = { empty: '여유', normal: '보통', crowded: '혼잡', full: '만차' };
export const CONGESTION_COLORS: Record<string, string> = {
  empty: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  normal: 'text-blue-600 bg-blue-50 border-blue-200',
  crowded: 'text-orange-600 bg-orange-50 border-orange-200',
  full: 'text-red-600 bg-red-50 border-red-200',
};
export const CONGESTION_BG: Record<string, string> = {
  empty: 'bg-emerald-500', normal: 'bg-blue-500', crowded: 'bg-orange-500', full: 'bg-red-500',
};

export const SENSOR_TYPE_LABELS: Record<string, string> = {
  radar_60ghz: '60GHz 레이더', ultrasonic: '초음파', magnetic: '지자기', camera: '카메라', infrared: '적외선',
};
export const SENSOR_STATUS_LABELS: Record<string, string> = {
  active: '정상', offline: '오프라인', low_battery: '배터리부족', error: '오류', maintenance: '점검중', decommissioned: '폐기',
};
export const SENSOR_STATUS_COLORS: Record<string, string> = {
  active: 'text-emerald-600 bg-emerald-50', offline: 'text-gray-600 bg-gray-100',
  low_battery: 'text-orange-600 bg-orange-50', error: 'text-red-600 bg-red-50',
  maintenance: 'text-blue-600 bg-blue-50', decommissioned: 'text-gray-400 bg-gray-50',
};
export const DISPLAY_LOCATION_LABELS: Record<string, string> = {
  entrance: '입구', exit: '출구', indoor: '실내', outdoor: '실외', road: '도로변',
};
export const GW_STATUS_LABELS: Record<string, string> = {
  active: '가동중', offline: '오프라인', maintenance: '점검중', decommissioned: '폐기',
};
export const DISPLAY_PROTOCOL_LABELS: Record<string, string> = {
  serial_rs232: 'RS-232', serial_rs485: 'RS-485', tcp: 'TCP', http: 'HTTP', udp: 'UDP',
};
export const MOUNTING_TYPE_LABELS: Record<string, string> = {
  ceiling: '천장', ground: '바닥매립', pole: '폴', wall: '벽면',
};
