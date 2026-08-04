-- ============================================================
-- 0005_revenue_complaints_budget.sql
-- 호출 빈도 상위 4개 테이블: revenue_daily, complaints, budget_plans, budget_items.
-- 원본 supabase/migrations 에서 추출 (RLS·auth.uid 제거).
-- ============================================================

-- ──────────────────────────────────────────────
-- revenue_daily — 주차장별 일일 수입 (호출 13회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revenue_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  revenue_date DATE NOT NULL,
  cash_amount BIGINT DEFAULT 0,
  card_amount BIGINT DEFAULT 0,
  mobile_amount BIGINT DEFAULT 0,
  monthly_pass_amount BIGINT DEFAULT 0,
  other_amount BIGINT DEFAULT 0,
  total_amount BIGINT GENERATED ALWAYS AS (cash_amount + card_amount + mobile_amount + monthly_pass_amount + other_amount) STORED,
  total_vehicles INTEGER DEFAULT 0,
  peak_hour_vehicles INTEGER DEFAULT 0,
  peak_hour VARCHAR(5),
  avg_parking_minutes INTEGER,
  turnover_rate DECIMAL(4,2),
  exemption_count INTEGER DEFAULT 0,
  exemption_amount BIGINT DEFAULT 0,
  exemption_detail JSONB,
  data_source VARCHAR(20) DEFAULT 'manual',
  source_detail VARCHAR(200),
  verified BOOLEAN DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lot_id, revenue_date)
);

CREATE INDEX IF NOT EXISTS revenue_daily_lot_date_idx ON revenue_daily(lot_id, revenue_date DESC);
CREATE INDEX IF NOT EXISTS revenue_daily_date_idx ON revenue_daily(revenue_date DESC);

DROP TRIGGER IF EXISTS revenue_daily_set_updated_at ON revenue_daily;
CREATE TRIGGER revenue_daily_set_updated_at
BEFORE UPDATE ON revenue_daily FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────
-- complaints — 민원 (호출 12회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES parking_lots(id) ON DELETE SET NULL,
  complaint_number VARCHAR(30) UNIQUE NOT NULL,
  channel VARCHAR(20) NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  category VARCHAR(50) NOT NULL,
  sub_category VARCHAR(50),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  location_detail VARCHAR(300),
  incident_date DATE,
  incident_time VARCHAR(10),
  vehicle_number VARCHAR(20),
  complainant_name VARCHAR(100),
  complainant_phone VARCHAR(20),
  complainant_email VARCHAR(255),
  complainant_address VARCHAR(300),
  is_anonymous BOOLEAN DEFAULT false,
  priority VARCHAR(10) DEFAULT 'normal',
  due_date DATE,
  due_days INTEGER,
  is_overdue BOOLEAN DEFAULT false,
  assigned_team team_type,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  response TEXT,
  response_type VARCHAR(30),
  responded_at TIMESTAMPTZ,
  response_channel VARCHAR(20),
  closed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'received',
  satisfaction_rating INTEGER,
  satisfaction_feedback TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints(status);
CREATE INDEX IF NOT EXISTS complaints_assigned_to_idx ON complaints(assigned_to);
CREATE INDEX IF NOT EXISTS complaints_received_at_idx ON complaints(received_at DESC);

DROP TRIGGER IF EXISTS complaints_set_updated_at ON complaints;
CREATE TRIGGER complaints_set_updated_at
BEFORE UPDATE ON complaints FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────
-- budget_plans — 예산 계획 (호출 11회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INTEGER NOT NULL,
  plan_type VARCHAR(20) NOT NULL DEFAULT 'original',
  plan_number INTEGER DEFAULT 1,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  total_revenue BIGINT DEFAULT 0,
  total_expenditure BIGINT DEFAULT 0,
  balance BIGINT GENERATED ALWAYS AS (total_revenue - total_expenditure) STORED,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  reject_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fiscal_year, plan_type, plan_number)
);

CREATE INDEX IF NOT EXISTS budget_plans_fiscal_year_idx ON budget_plans(fiscal_year DESC);

DROP TRIGGER IF EXISTS budget_plans_set_updated_at ON budget_plans;
CREATE TRIGGER budget_plans_set_updated_at
BEFORE UPDATE ON budget_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ──────────────────────────────────────────────
-- budget_items — 예산 세목 (호출 10회)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES budget_plans(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES parking_lots(id) ON DELETE SET NULL,
  parent_item_id UUID REFERENCES budget_items(id) ON DELETE SET NULL,
  item_code VARCHAR(30) NOT NULL,
  budget_type VARCHAR(20) NOT NULL,
  category_l1 VARCHAR(100) NOT NULL,
  category_l2 VARCHAR(100),
  category_l3 VARCHAR(100),
  category_l4 VARCHAR(100),
  item_name VARCHAR(200) NOT NULL,
  description TEXT,
  previous_year_amount BIGINT DEFAULT 0,
  requested_amount BIGINT DEFAULT 0,
  planned_amount BIGINT DEFAULT 0,
  allocated_amount BIGINT DEFAULT 0,
  executed_amount BIGINT DEFAULT 0,
  returned_amount BIGINT DEFAULT 0,
  remaining_amount BIGINT GENERATED ALWAYS AS (allocated_amount - executed_amount - returned_amount) STORED,
  execution_rate DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN allocated_amount > 0
      THEN ROUND(executed_amount::decimal / allocated_amount * 100, 2)
      ELSE 0
    END
  ) STORED,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS budget_items_plan_id_idx ON budget_items(plan_id);
CREATE INDEX IF NOT EXISTS budget_items_lot_id_idx ON budget_items(lot_id);

DROP TRIGGER IF EXISTS budget_items_set_updated_at ON budget_items;
CREATE TRIGGER budget_items_set_updated_at
BEFORE UPDATE ON budget_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
