-- ============================================================
-- 0006_extra_tables.sql
-- 다음 5개 테이블: notifications, surveys, equipment, system_config, fee_policies.
-- 누적 호출 36회 추가 해소.
-- 원본 supabase/migrations 에서 추출 (RLS 제거).
-- ============================================================

-- survey_status_enum
DO $$ BEGIN
  CREATE TYPE survey_status_enum AS ENUM ('draft', 'in_progress', 'submitted', 'review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────
-- system_config — 전역 시스템 설정 (호출 6회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  description VARCHAR(300),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────────────────────────────────
-- notifications — 사용자별 알림 (호출 9회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'info',
  title VARCHAR(200) NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications(user_id, is_read, created_at DESC);

-- ──────────────────────────────────────────────
-- surveys — 현황조사 마스터 (호출 8회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  survey_type VARCHAR(30) NOT NULL DEFAULT 'initial',
  status survey_status_enum NOT NULL DEFAULT 'draft',
  surveyor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  survey_date DATE,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  reject_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS surveys_lot_id_idx ON surveys(lot_id);
CREATE INDEX IF NOT EXISTS surveys_status_idx ON surveys(status);

DROP TRIGGER IF EXISTS surveys_set_updated_at ON surveys;
CREATE TRIGGER surveys_set_updated_at
BEFORE UPDATE ON surveys FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────
-- equipment — 설비 자산 (호출 7회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  equipment_code VARCHAR(30) UNIQUE NOT NULL,
  equipment_type VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  model VARCHAR(200),
  manufacturer VARCHAR(200),
  serial_number VARCHAR(100),
  specification JSONB,
  install_date DATE,
  warranty_start DATE,
  warranty_end DATE,
  useful_life_years INTEGER,
  replacement_due DATE,
  purchase_cost BIGINT,
  current_value BIGINT,
  depreciation_method VARCHAR(20) DEFAULT 'straight_line',
  location_detail VARCHAR(200),
  floor INTEGER,
  quantity INTEGER DEFAULT 1,
  power_consumption VARCHAR(50),
  network_required BOOLEAN DEFAULT false,
  ip_address VARCHAR(45),
  firmware_version VARCHAR(50),
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  total_maintenance_cost BIGINT DEFAULT 0,
  maintenance_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'normal',
  status_changed_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipment_lot_id_idx ON equipment(lot_id);
CREATE INDEX IF NOT EXISTS equipment_status_idx ON equipment(status);
CREATE INDEX IF NOT EXISTS equipment_type_idx ON equipment(equipment_type);

DROP TRIGGER IF EXISTS equipment_set_updated_at ON equipment;
CREATE TRIGGER equipment_set_updated_at
BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────
-- fee_policies — 요금 정책 (호출 6회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  policy_name VARCHAR(100) NOT NULL,
  day_type VARCHAR(20) NOT NULL DEFAULT 'weekday',
  time_start TIME,
  time_end TIME,
  base_minutes INTEGER,
  base_fee INTEGER,
  add_minutes INTEGER,
  add_fee INTEGER,
  daily_max INTEGER,
  monthly_pass_fee INTEGER,
  is_active BOOLEAN DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  legal_basis VARCHAR(200),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_policies_lot_id_idx ON fee_policies(lot_id);
CREATE INDEX IF NOT EXISTS fee_policies_active_idx ON fee_policies(is_active, effective_from, effective_to);

DROP TRIGGER IF EXISTS fee_policies_set_updated_at ON fee_policies;
CREATE TRIGGER fee_policies_set_updated_at
BEFORE UPDATE ON fee_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
