-- ============================================================
-- 0007_audit_bidding_service.sql
-- 다음 5개 테이블: security_audit_logs, active_sessions, bid_projects, service_projects, fee_exemptions.
-- ============================================================

-- ──────────────────────────────────────────────
-- security_audit_logs — 보안 감사 로그 (호출 8회) — INSERT-only 성격
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'info',
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name VARCHAR(100),
  user_role VARCHAR(20),
  user_team VARCHAR(20),
  ip_address VARCHAR(45),
  user_agent TEXT,
  resource_type VARCHAR(50),
  resource_id UUID,
  resource_name VARCHAR(200),
  action_detail JSONB,
  before_value JSONB,
  after_value JSONB,
  success BOOLEAN DEFAULT true,
  failure_reason TEXT,
  session_id VARCHAR(100),
  request_path VARCHAR(300),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_type ON security_audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_user ON security_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_severity ON security_audit_logs(severity, created_at DESC);

-- ──────────────────────────────────────────────
-- active_sessions — 활성 세션 추적 (호출 8회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_token VARCHAR(200) UNIQUE NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_info JSONB,
  started_at TIMESTAMPTZ DEFAULT now(),
  last_activity TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON active_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON active_sessions(expires_at);

-- ──────────────────────────────────────────────
-- bid_projects — 입찰 프로젝트 (호출 8회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bid_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  bid_number VARCHAR(50) UNIQUE NOT NULL,
  lot_id UUID REFERENCES parking_lots(id) ON DELETE SET NULL,
  bid_type VARCHAR(30) NOT NULL,
  contract_type VARCHAR(30) NOT NULL,
  category VARCHAR(100),
  estimated_amount BIGINT,
  design_amount BIGINT,
  vat_included BOOLEAN DEFAULT true,
  budget_item_id UUID,
  budget_available_amount BIGINT,
  description TEXT,
  scope_of_work TEXT,
  location VARCHAR(300),
  work_period_days INTEGER,
  work_start_date DATE,
  work_end_date DATE,
  qualification TEXT,
  qualification_criteria JSONB,
  evaluation_method VARCHAR(30),
  evaluation_criteria JSONB,
  lowest_price_rate DECIMAL(5,2),
  announce_date DATE,
  bid_start_date DATE,
  bid_deadline TIMESTAMPTZ,
  bid_open_date DATE,
  bid_open_location VARCHAR(200),
  nara_ref VARCHAR(50),
  nara_url TEXT,
  successful_bidder VARCHAR(200),
  contract_amount BIGINT,
  savings_rate DECIMAL(5,2),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  cancel_reason TEXT,
  rebid_count INTEGER DEFAULT 0,
  previous_bid_id UUID REFERENCES bid_projects(id),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bid_projects_status_idx ON bid_projects(status);
CREATE INDEX IF NOT EXISTS bid_projects_lot_id_idx ON bid_projects(lot_id);

DROP TRIGGER IF EXISTS bid_projects_set_updated_at ON bid_projects;
CREATE TRIGGER bid_projects_set_updated_at
BEFORE UPDATE ON bid_projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────
-- service_projects — 용역 프로젝트 (호출 6회)
-- 단순화: 핵심 컬럼만 (실제 코드에서 사용하는 부분 위주)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  project_number VARCHAR(50) UNIQUE NOT NULL,
  lot_id UUID REFERENCES parking_lots(id) ON DELETE SET NULL,
  bid_contract_id UUID,
  budget_item_id UUID,
  service_type VARCHAR(50) NOT NULL,
  service_category VARCHAR(100),
  description TEXT,
  scope_of_work TEXT,
  contractor_name VARCHAR(200) NOT NULL,
  contractor_business_number VARCHAR(20),
  contractor_representative VARCHAR(100),
  contractor_address VARCHAR(300),
  contractor_phone VARCHAR(20),
  contractor_email VARCHAR(255),
  contractor_manager VARCHAR(100),
  contractor_manager_phone VARCHAR(20),
  supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  inspector_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sub_supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  contract_amount BIGINT NOT NULL,
  vat_amount BIGINT DEFAULT 0,
  total_amount BIGINT NOT NULL,
  paid_amount BIGINT DEFAULT 0,
  remaining_amount BIGINT GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  payment_rate DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_amount > 0 THEN ROUND(paid_amount::decimal / total_amount * 100, 2) ELSE 0 END
  ) STORED,
  contract_date DATE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  actual_start_date DATE,
  actual_end_date DATE,
  work_days INTEGER,
  extended_days INTEGER DEFAULT 0,
  extended_end_date DATE,
  warranty_months INTEGER,
  warranty_start DATE,
  warranty_end DATE,
  warranty_bond_amount BIGINT,
  warranty_bond_company VARCHAR(200),
  warranty_bond_number VARCHAR(50),
  progress_pct DECIMAL(5,2) DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'planning',
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_projects_status_idx ON service_projects(status);
CREATE INDEX IF NOT EXISTS service_projects_lot_id_idx ON service_projects(lot_id);

DROP TRIGGER IF EXISTS service_projects_set_updated_at ON service_projects;
CREATE TRIGGER service_projects_set_updated_at
BEFORE UPDATE ON service_projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────
-- fee_exemptions — 요금 감면 기준 (호출 5회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_exemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES parking_lots(id) ON DELETE CASCADE,
  exemption_type VARCHAR(50) NOT NULL,
  exemption_name VARCHAR(100) NOT NULL,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'rate',
  discount_rate DECIMAL(5,2),
  discount_amount INTEGER,
  max_hours DECIMAL(4,1),
  max_discount_amount INTEGER,
  required_documents VARCHAR(300),
  description VARCHAR(300),
  legal_basis VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_exemptions_lot_id_idx ON fee_exemptions(lot_id);
CREATE INDEX IF NOT EXISTS fee_exemptions_active_idx ON fee_exemptions(is_active, effective_from);
