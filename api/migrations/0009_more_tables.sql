-- ============================================================
-- 0009_more_tables.sql
-- 다음 10개 테이블 (호출 4~7회).
-- 일부 FK는 '아직 마이그레이션되지 않은 테이블' 참조이므로 UUID만 두고 FK 제약은 생략.
-- (운영 시점에 해당 테이블을 추가하면서 ALTER TABLE로 FK 추가 권장)
-- ============================================================

-- operations_staff
CREATE TABLE IF NOT EXISTS operations_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  staff_name VARCHAR(100) NOT NULL,
  staff_type VARCHAR(20) NOT NULL DEFAULT 'resident',
  phone VARCHAR(20),
  position VARCHAR(50),
  schedule JSONB,
  hire_date DATE,
  resign_date DATE,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operations_staff_lot_idx ON operations_staff(lot_id, is_active);
DROP TRIGGER IF EXISTS operations_staff_set_updated_at ON operations_staff;
CREATE TRIGGER operations_staff_set_updated_at
BEFORE UPDATE ON operations_staff FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- enforcement_records
CREATE TABLE IF NOT EXISTS enforcement_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES parking_lots(id) ON DELETE SET NULL,
  enforcement_number VARCHAR(30) UNIQUE NOT NULL,
  vehicle_number VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(30),
  violation_type VARCHAR(50) NOT NULL,
  violation_date TIMESTAMPTZ NOT NULL,
  violation_location VARCHAR(200),
  location_detail VARCHAR(200),
  photo_paths JSONB,
  fine_amount INTEGER,
  fine_due_date DATE,
  fine_paid_date DATE,
  payment_status VARCHAR(20) DEFAULT 'unpaid',
  appeal_status VARCHAR(20),
  appeal_date DATE,
  appeal_reason TEXT,
  appeal_result VARCHAR(20),
  officer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  officer_name VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enforcement_payment_idx ON enforcement_records(payment_status, violation_date DESC);
CREATE INDEX IF NOT EXISTS enforcement_vehicle_idx ON enforcement_records(vehicle_number);
DROP TRIGGER IF EXISTS enforcement_records_set_updated_at ON enforcement_records;
CREATE TRIGGER enforcement_records_set_updated_at
BEFORE UPDATE ON enforcement_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- budget_executions
CREATE TABLE IF NOT EXISTS budget_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_number VARCHAR(30) UNIQUE NOT NULL,
  item_id UUID NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES parking_lots(id) ON DELETE SET NULL,
  execution_date DATE NOT NULL,
  amount BIGINT NOT NULL,
  execution_type VARCHAR(30) NOT NULL,
  vendor_name VARCHAR(200),
  vendor_business_number VARCHAR(20),
  description VARCHAR(500) NOT NULL,
  document_number VARCHAR(50),
  document_date DATE,
  payment_method VARCHAR(30),
  bank_account VARCHAR(50),
  reference_module VARCHAR(30),
  reference_id UUID,
  reference_number VARCHAR(50),
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  receipt_path TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budget_executions_item_idx ON budget_executions(item_id);
CREATE INDEX IF NOT EXISTS budget_executions_status_idx ON budget_executions(status, execution_date DESC);
DROP TRIGGER IF EXISTS budget_executions_set_updated_at ON budget_executions;
CREATE TRIGGER budget_executions_set_updated_at
BEFORE UPDATE ON budget_executions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- bid_evaluations (bid_submissions FK 생략 — 추후 ALTER로 추가)
CREATE TABLE IF NOT EXISTS bid_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_project_id UUID NOT NULL REFERENCES bid_projects(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL,                         -- bid_submissions(id) 참조 — 별도 테이블 추가 시 FK
  evaluator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  evaluator_name VARCHAR(100),
  evaluator_org VARCHAR(200),
  evaluation_date DATE,
  price_score DECIMAL(5,2) DEFAULT 0,
  technical_score DECIMAL(5,2) DEFAULT 0,
  business_score DECIMAL(5,2) DEFAULT 0,
  performance_score DECIMAL(5,2) DEFAULT 0,
  total_score DECIMAL(5,2) DEFAULT 0,
  rank INTEGER,
  evaluation_detail JSONB,
  strengths TEXT,
  weaknesses TEXT,
  comments TEXT,
  is_qualified BOOLEAN DEFAULT true,
  disqualification_reason VARCHAR(300),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS bid_evaluations_set_updated_at ON bid_evaluations;
CREATE TRIGGER bid_evaluations_set_updated_at
BEFORE UPDATE ON bid_evaluations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- bid_contracts
CREATE TABLE IF NOT EXISTS bid_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_project_id UUID NOT NULL REFERENCES bid_projects(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL,                         -- bid_submissions(id)
  contract_number VARCHAR(50) UNIQUE NOT NULL,
  contractor_name VARCHAR(200) NOT NULL,
  contractor_business_number VARCHAR(20),
  contractor_representative VARCHAR(100),
  contractor_address VARCHAR(300),
  contractor_phone VARCHAR(20),
  contractor_email VARCHAR(255),
  contract_amount BIGINT NOT NULL,
  vat_amount BIGINT DEFAULT 0,
  total_amount BIGINT NOT NULL,
  advance_payment_rate DECIMAL(5,2),
  advance_payment_amount BIGINT,
  contract_date DATE NOT NULL,
  contract_start DATE NOT NULL,
  contract_end DATE NOT NULL,
  work_days INTEGER,
  warranty_months INTEGER,
  warranty_end DATE,
  performance_bond_rate DECIMAL(5,2),
  performance_bond_amount BIGINT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS bid_contracts_set_updated_at ON bid_contracts;
CREATE TRIGGER bid_contracts_set_updated_at
BEFORE UPDATE ON bid_contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- survey_infra
CREATE TABLE IF NOT EXISTS survey_infra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID UNIQUE NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  power_status VARCHAR(20),
  power_note VARCHAR(200),
  network_wired BOOLEAN DEFAULT false,
  network_wifi BOOLEAN DEFAULT false,
  network_lte BOOLEAN DEFAULT false,
  network_etc VARCHAR(100),
  display_installed BOOLEAN DEFAULT false,
  display_in_use BOOLEAN DEFAULT false,
  display_company VARCHAR(100),
  display_not_use_reason VARCHAR(200),
  display_network VARCHAR(30),
  display_sw_status VARCHAR(30),
  display_sw_note VARCHAR(200),
  sensor_installed BOOLEAN DEFAULT false,
  sensor_count INTEGER DEFAULT 0,
  sensor_in_use BOOLEAN DEFAULT false,
  sensor_company VARCHAR(100),
  has_barrier BOOLEAN DEFAULT false,
  has_lpr BOOLEAN DEFAULT false,
  has_kiosk BOOLEAN DEFAULT false,
  has_cctv BOOLEAN DEFAULT false,
  equipment_company VARCHAR(200)
);

-- site_candidates (lot_type_enum은 0003에서 생성됨)
CREATE TABLE IF NOT EXISTS site_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_number VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  address_jibun VARCHAR(300),
  address_road VARCHAR(300),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  administrative_dong VARCHAR(100),
  area_sqm DECIMAL(10,2),
  shape VARCHAR(30),
  frontage_m DECIMAL(6,1),
  depth_m DECIMAL(6,1),
  slope_pct DECIMAL(4,1),
  ground_condition VARCHAR(50),
  zoning VARCHAR(100),
  land_use VARCHAR(100),
  land_category VARCHAR(50),
  ownership VARCHAR(50),
  owner_name VARCHAR(100),
  acquisition_method VARCHAR(50),
  estimated_land_cost BIGINT,
  planned_lot_type lot_type_enum,
  estimated_spaces INTEGER,
  estimated_floors INTEGER DEFAULT 1,
  status VARCHAR(20) DEFAULT 'survey',
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS site_candidates_set_updated_at ON site_candidates;
CREATE TRIGGER site_candidates_set_updated_at
BEFORE UPDATE ON site_candidates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- report_generated (template_id FK 생략 — report_templates 미생성)
CREATE TABLE IF NOT EXISTS report_generated (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number VARCHAR(30) UNIQUE NOT NULL,
  template_id UUID,                                     -- report_templates(id)
  title VARCHAR(300) NOT NULL,
  description TEXT,
  period_type VARCHAR(20),
  period_start DATE,
  period_end DATE,
  target_lots JSONB,
  parameters_used JSONB,
  file_path TEXT,
  file_format VARCHAR(10),
  file_size BIGINT,
  page_count INTEGER,
  excel_path TEXT,
  hwp_path TEXT,
  data_snapshot JSONB,
  summary_data JSONB,
  status VARCHAR(20) DEFAULT 'generating',
  error_message TEXT,
  generation_time_ms INTEGER,
  is_shared BOOLEAN DEFAULT false,
  shared_with JSONB,
  shared_at TIMESTAMPTZ,
  generated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_generated_status_idx ON report_generated(status, created_at DESC);

-- maintenance_logs (schedule_id FK 생략 — maintenance_schedules 미생성)
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_number VARCHAR(30) UNIQUE NOT NULL,
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  schedule_id UUID,                                      -- maintenance_schedules(id)
  maintenance_type VARCHAR(30) NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  title VARCHAR(200) NOT NULL,
  description TEXT,
  symptom TEXT,
  cause TEXT,
  resolution TEXT,
  reported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ DEFAULT now(),
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  vendor_name VARCHAR(200),
  vendor_contact VARCHAR(100),
  parts_used JSONB,
  labor_hours DECIMAL(6,1),
  parts_cost BIGINT DEFAULT 0,
  labor_cost BIGINT DEFAULT 0,
  other_cost BIGINT DEFAULT 0,
  total_cost BIGINT GENERATED ALWAYS AS (parts_cost + labor_cost + other_cost) STORED,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  downtime_hours DECIMAL(6,1),
  before_photo TEXT,
  after_photo TEXT,
  status VARCHAR(20) DEFAULT 'reported',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maintenance_logs_lot_idx ON maintenance_logs(lot_id, status);
CREATE INDEX IF NOT EXISTS maintenance_logs_equipment_idx ON maintenance_logs(equipment_id);
DROP TRIGGER IF EXISTS maintenance_logs_set_updated_at ON maintenance_logs;
CREATE TRIGGER maintenance_logs_set_updated_at
BEFORE UPDATE ON maintenance_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- lot_realtime_status (lot_id PK)
CREATE TABLE IF NOT EXISTS lot_realtime_status (
  lot_id UUID PRIMARY KEY REFERENCES parking_lots(id) ON DELETE CASCADE,
  total_spaces INTEGER DEFAULT 0,
  occupied_spaces INTEGER DEFAULT 0,
  available_spaces INTEGER GENERATED ALWAYS AS (total_spaces - occupied_spaces) STORED,
  occupancy_rate DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_spaces > 0 THEN ROUND(occupied_spaces::decimal / total_spaces * 100, 2) ELSE 0 END
  ) STORED,
  occupied_disabled INTEGER DEFAULT 0,
  occupied_ev INTEGER DEFAULT 0,
  occupied_compact INTEGER DEFAULT 0,
  available_disabled INTEGER DEFAULT 0,
  available_ev INTEGER DEFAULT 0,
  congestion_level VARCHAR(20) DEFAULT 'normal',
  status VARCHAR(20) DEFAULT 'normal',
  gate_count_in INTEGER DEFAULT 0,
  gate_count_out INTEGER DEFAULT 0,
  gate_calculated_occupied INTEGER DEFAULT 0,
  sensor_vs_gate_diff INTEGER DEFAULT 0,
  last_sensor_update TIMESTAMPTZ,
  last_gate_update TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT now(),
  today_total_in INTEGER DEFAULT 0,
  today_total_out INTEGER DEFAULT 0,
  today_peak_occupied INTEGER DEFAULT 0,
  today_peak_time VARCHAR(5),
  today_avg_duration_min INTEGER
);
