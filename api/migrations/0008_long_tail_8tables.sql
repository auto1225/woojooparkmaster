-- ============================================================
-- 0008_long_tail_8tables.sql
-- 호출 빈도 4~5회의 8개 테이블 추가.
--   free_hours_settings, monthly_passes, survey_photos,
--   outsourcing_contracts, gateway_devices, display_boards,
--   survey_basic_info, survey_operation
-- ============================================================

-- free_hours_settings — 무료 운영 시간대
CREATE TABLE IF NOT EXISTS free_hours_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  setting_name VARCHAR(100),
  day_type VARCHAR(20) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  reason VARCHAR(200),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS free_hours_settings_lot_idx ON free_hours_settings(lot_id, is_active);

-- monthly_passes — 정기 주차권
CREATE TABLE IF NOT EXISTS monthly_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  pass_number VARCHAR(30) UNIQUE NOT NULL,
  vehicle_number VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(30),
  holder_name VARCHAR(100),
  holder_phone VARCHAR(20),
  holder_address VARCHAR(300),
  pass_start DATE NOT NULL,
  pass_end DATE NOT NULL,
  fee_amount INTEGER NOT NULL,
  fee_paid INTEGER DEFAULT 0,
  payment_method VARCHAR(20),
  payment_date DATE,
  receipt_number VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active',
  auto_renew BOOLEAN DEFAULT false,
  renewal_count INTEGER DEFAULT 0,
  previous_pass_id UUID REFERENCES monthly_passes(id),
  issued_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS monthly_passes_lot_idx ON monthly_passes(lot_id, status);
CREATE INDEX IF NOT EXISTS monthly_passes_vehicle_idx ON monthly_passes(vehicle_number);
DROP TRIGGER IF EXISTS monthly_passes_set_updated_at ON monthly_passes;
CREATE TRIGGER monthly_passes_set_updated_at
BEFORE UPDATE ON monthly_passes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- survey_photos — 조사 사진
CREATE TABLE IF NOT EXISTS survey_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  category VARCHAR(30) NOT NULL,
  file_path TEXT NOT NULL,
  thumbnail_path TEXT,
  caption VARCHAR(200),
  sort_order INTEGER DEFAULT 0,
  taken_at TIMESTAMPTZ,
  gps_lat DECIMAL(10,7),
  gps_lng DECIMAL(10,7),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS survey_photos_survey_idx ON survey_photos(survey_id);

-- outsourcing_contracts — 위탁 계약
CREATE TABLE IF NOT EXISTS outsourcing_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  company_name VARCHAR(200) NOT NULL,
  business_number VARCHAR(20),
  representative VARCHAR(100),
  contract_number VARCHAR(50),
  contract_start DATE NOT NULL,
  contract_end DATE NOT NULL,
  contract_amount BIGINT,
  monthly_fee BIGINT,
  revenue_share_rate DECIMAL(5,2),
  contact_person VARCHAR(100),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(255),
  performance_score DECIMAL(3,1),
  evaluation_date DATE,
  evaluation_note TEXT,
  auto_renew BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outsourcing_contracts_lot_idx ON outsourcing_contracts(lot_id, status);
DROP TRIGGER IF EXISTS outsourcing_contracts_set_updated_at ON outsourcing_contracts;
CREATE TRIGGER outsourcing_contracts_set_updated_at
BEFORE UPDATE ON outsourcing_contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- gateway_devices — IoT 게이트웨이
CREATE TABLE IF NOT EXISTS gateway_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  device_name VARCHAR(100),
  ip_address VARCHAR(45),
  mac_address VARCHAR(20),
  subnet VARCHAR(20),
  protocol VARCHAR(20) DEFAULT 'mqtt',
  mqtt_topic VARCHAR(200),
  location_detail VARCHAR(200),
  floor INTEGER,
  install_date DATE,
  connected_sensors INTEGER DEFAULT 0,
  max_sensors INTEGER DEFAULT 200,
  firmware_version VARCHAR(30),
  hardware_version VARCHAR(30),
  last_heartbeat TIMESTAMPTZ,
  last_data_received TIMESTAMPTZ,
  uptime_hours DECIMAL(10,1),
  restart_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  status_changed_at TIMESTAMPTZ DEFAULT now(),
  alert_offline_minutes INTEGER DEFAULT 10,
  alert_sent BOOLEAN DEFAULT false,
  config JSONB,
  notes TEXT,
  registered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS gateway_devices_set_updated_at ON gateway_devices;
CREATE TRIGGER gateway_devices_set_updated_at
BEFORE UPDATE ON gateway_devices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- display_boards — 안내 표시판
CREATE TABLE IF NOT EXISTS display_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  board_id VARCHAR(50) UNIQUE NOT NULL,
  board_name VARCHAR(100),
  location VARCHAR(200),
  location_type VARCHAR(30),
  floor INTEGER,
  direction VARCHAR(20),
  protocol VARCHAR(30),
  ip_address VARCHAR(45),
  port INTEGER,
  serial_config JSONB,
  display_type VARCHAR(30),
  display_size VARCHAR(30),
  max_lines INTEGER DEFAULT 2,
  display_template JSONB,
  current_message TEXT,
  last_push TIMESTAMPTZ,
  last_push_success BOOLEAN,
  last_error TEXT,
  push_interval_sec INTEGER DEFAULT 10,
  status VARCHAR(20) DEFAULT 'active',
  manufacturer VARCHAR(100),
  model VARCHAR(100),
  install_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS display_boards_set_updated_at ON display_boards;
CREATE TRIGGER display_boards_set_updated_at
BEFORE UPDATE ON display_boards FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- survey_basic_info — 조사 기본 현황 (1:1 with surveys)
CREATE TABLE IF NOT EXISTS survey_basic_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID UNIQUE NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  lot_name VARCHAR(200),
  address VARCHAR(300),
  lot_type VARCHAR(30),
  lot_type_floor INTEGER,
  operator_type VARCHAR(30),
  total_spaces INTEGER,
  disabled_spaces INTEGER DEFAULT 0,
  ev_spaces INTEGER DEFAULT 0,
  compact_spaces INTEGER DEFAULT 0,
  pregnant_spaces INTEGER DEFAULT 0,
  other_spaces INTEGER DEFAULT 0,
  other_spaces_desc VARCHAR(100),
  entry_count INTEGER,
  exit_count INTEGER,
  entry_exit_same BOOLEAN DEFAULT false,
  surface_type VARCHAR(30),
  surface_type_etc VARCHAR(100),
  gps_lat DECIMAL(10,7),
  gps_lng DECIMAL(10,7)
);

-- survey_operation — 조사 운영 정보 (1:1 with surveys)
CREATE TABLE IF NOT EXISTS survey_operation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID UNIQUE NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  operating_hours VARCHAR(100),
  operating_hours_custom VARCHAR(200),
  payment_cash BOOLEAN DEFAULT false,
  payment_card BOOLEAN DEFAULT false,
  payment_mobile BOOLEAN DEFAULT false,
  payment_none BOOLEAN DEFAULT false,
  staff_type VARCHAR(20),
  staff_count INTEGER,
  management_type VARCHAR(30),
  management_etc VARCHAR(200),
  control_linked BOOLEAN DEFAULT false,
  portal_linked BOOLEAN DEFAULT false
);
