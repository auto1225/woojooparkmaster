-- ============================================================
-- 0010_remaining_tables.sql
-- 남은 28개 테이블 일괄 추가 (호출 1~3회).
-- 핵심 컬럼 위주로 간소화. 운영 시점에 필요한 컬럼은 ALTER로 추가.
-- ============================================================

-- ─── 결재 시스템 (3개) ───
CREATE TABLE IF NOT EXISTS approval_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(50) NOT NULL,
  reference_id UUID NOT NULL,
  line_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id UUID NOT NULL REFERENCES approval_lines(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approver_role VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES approval_steps(id) ON DELETE CASCADE,
  approver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action VARCHAR(20) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS approval_lines_set_updated_at ON approval_lines;
CREATE TRIGGER approval_lines_set_updated_at
BEFORE UPDATE ON approval_lines FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 첨부파일·문서 (4개) ───
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(50) NOT NULL,
  reference_id UUID NOT NULL,
  file_name VARCHAR(300) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bid_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_project_id UUID NOT NULL REFERENCES bid_projects(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  file_path TEXT,
  is_required BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bid_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_project_id UUID NOT NULL REFERENCES bid_projects(id) ON DELETE CASCADE,
  bidder_name VARCHAR(200) NOT NULL,
  bidder_business_number VARCHAR(20),
  bid_amount BIGINT,
  submission_date DATE,
  documents_submitted JSONB,
  is_qualified BOOLEAN DEFAULT true,
  disqualification_reason VARCHAR(300),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS design_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES parking_lots(id) ON DELETE SET NULL,
  document_type VARCHAR(50) NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  file_path TEXT,
  version VARCHAR(20),
  status VARCHAR(20) DEFAULT 'draft',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 예산 (1개 추가) ───
CREATE TABLE IF NOT EXISTS budget_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number VARCHAR(30) UNIQUE NOT NULL,
  from_item_id UUID NOT NULL REFERENCES budget_items(id),
  to_item_id UUID NOT NULL REFERENCES budget_items(id),
  amount BIGINT NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 민원 (1개 추가) ───
CREATE TABLE IF NOT EXISTS complaint_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 건설 프로젝트 ───
CREATE TABLE IF NOT EXISTS construction_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(300) NOT NULL,
  lot_id UUID REFERENCES parking_lots(id) ON DELETE SET NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  budget BIGINT,
  status VARCHAR(20) DEFAULT 'planning',
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 대시보드 위젯 ───
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  widget_type VARCHAR(50) NOT NULL,
  title VARCHAR(200),
  position INTEGER DEFAULT 0,
  config JSONB,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 보안 (3개) ───
CREATE TABLE IF NOT EXISTS ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address VARCHAR(45) UNIQUE NOT NULL,
  description VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pii_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  table_name VARCHAR(100),
  record_id UUID,
  field_name VARCHAR(100),
  access_type VARCHAR(20),
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  scopes JSONB,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 정비 (1개) ───
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  schedule_name VARCHAR(200) NOT NULL,
  schedule_type VARCHAR(30) NOT NULL,
  frequency_days INTEGER,
  next_due_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 메시지·라이센스·모듈 ───
CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(50),
  recipient VARCHAR(200) NOT NULL,
  subject VARCHAR(300),
  body TEXT,
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS module_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code VARCHAR(30) UNIQUE NOT NULL,
  module_name VARCHAR(100) NOT NULL,
  license_type VARCHAR(20) NOT NULL DEFAULT 'standard',
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE,
  max_users INTEGER,
  is_active BOOLEAN DEFAULT true,
  license_key VARCHAR(100),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 허가증 ───
CREATE TABLE IF NOT EXISTS permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_number VARCHAR(30) UNIQUE NOT NULL,
  permit_type VARCHAR(50) NOT NULL,
  lot_id UUID REFERENCES parking_lots(id) ON DELETE SET NULL,
  applicant_name VARCHAR(100),
  vehicle_number VARCHAR(20),
  effective_from DATE NOT NULL,
  effective_to DATE,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 보고서 (2개) ───
CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code VARCHAR(50) UNIQUE NOT NULL,
  template_name VARCHAR(200) NOT NULL,
  description TEXT,
  template_type VARCHAR(30),
  parameters JSONB,
  layout JSONB,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  schedule_name VARCHAR(200) NOT NULL,
  cron_expression VARCHAR(100),
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  recipients JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 수입 정산 ───
CREATE TABLE IF NOT EXISTS revenue_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  reconciliation_date DATE NOT NULL,
  expected_amount BIGINT,
  actual_amount BIGINT,
  difference BIGINT GENERATED ALWAYS AS (COALESCE(actual_amount,0) - COALESCE(expected_amount,0)) STORED,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  reconciled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 안전점검·교육 ───
CREATE TABLE IF NOT EXISTS safety_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  inspector_name VARCHAR(100),
  result VARCHAR(20),
  findings TEXT,
  corrective_actions TEXT,
  next_inspection_date DATE,
  status VARCHAR(20) DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 센서 ───
CREATE TABLE IF NOT EXISTS sensor_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  space_id UUID,
  gateway_id UUID REFERENCES gateway_devices(id) ON DELETE SET NULL,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  device_name VARCHAR(100),
  device_type VARCHAR(30) NOT NULL DEFAULT 'radar_60ghz',
  install_date DATE,
  location_detail VARCHAR(200),
  battery_level DECIMAL(5,2),
  last_heartbeat TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 용역 (3개 추가) ───
CREATE TABLE IF NOT EXISTS service_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES service_projects(id) ON DELETE CASCADE,
  milestone_number INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  target_date DATE NOT NULL,
  actual_date DATE,
  weight_pct DECIMAL(5,2) DEFAULT 0,
  payment_amount BIGINT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, milestone_number)
);

CREATE TABLE IF NOT EXISTS service_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES service_projects(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES service_milestones(id) ON DELETE SET NULL,
  inspection_number VARCHAR(30) UNIQUE NOT NULL,
  inspection_type VARCHAR(20) NOT NULL,
  inspection_date DATE NOT NULL,
  inspector_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_amount BIGINT,
  approved_amount BIGINT,
  result VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES service_projects(id) ON DELETE CASCADE,
  inspection_id UUID REFERENCES service_inspections(id) ON DELETE SET NULL,
  payment_number VARCHAR(30) UNIQUE NOT NULL,
  payment_type VARCHAR(20) NOT NULL,
  payment_seq INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  gross_amount BIGINT NOT NULL,
  paid_amount BIGINT,
  request_date DATE NOT NULL,
  paid_date DATE,
  status VARCHAR(20) DEFAULT 'requested',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES service_projects(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES service_milestones(id) ON DELETE SET NULL,
  title VARCHAR(300) NOT NULL,
  deliverable_type VARCHAR(50),
  file_path TEXT,
  submitted_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 노면 표시 ───
CREATE TABLE IF NOT EXISTS surface_markings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  marking_type VARCHAR(50) NOT NULL,
  description TEXT,
  installed_date DATE,
  last_repainted DATE,
  status VARCHAR(20) DEFAULT 'good',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 조사 (2개 추가) ───
CREATE TABLE IF NOT EXISTS survey_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID UNIQUE NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  avg_usage_rate VARCHAR(20),
  peak_morning BOOLEAN DEFAULT false,
  peak_afternoon BOOLEAN DEFAULT false,
  peak_night BOOLEAN DEFAULT false,
  peak_free_time BOOLEAN DEFAULT false,
  user_residents BOOLEAN DEFAULT false,
  user_commercial BOOLEAN DEFAULT false,
  user_tourists BOOLEAN DEFAULT false,
  user_etc VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS survey_sensor_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID UNIQUE NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  planned_sensors INTEGER DEFAULT 0,
  planned_gateways INTEGER DEFAULT 0,
  gateway_location TEXT,
  display_sw_feasibility VARCHAR(30),
  display_sw_note VARCHAR(200),
  portal_feasibility VARCHAR(20),
  portal_note VARCHAR(200)
);

-- ─── 보안 교육 로그 ───
CREATE TABLE IF NOT EXISTS security_training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  training_type VARCHAR(50) NOT NULL,
  training_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  score INTEGER,
  passed BOOLEAN,
  certificate_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
