
-- Phase 6-A: BUDGET 모듈 테이블

CREATE TABLE budget_plans (
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
  submitted_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  reject_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fiscal_year, plan_type, plan_number)
);

CREATE TABLE budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES budget_plans(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES parking_lots(id),
  parent_item_id UUID REFERENCES budget_items(id),
  item_code VARCHAR(30) NOT NULL,
  budget_type VARCHAR(10) NOT NULL,
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
  is_mandatory BOOLEAN DEFAULT false,
  is_recurring BOOLEAN DEFAULT false,
  frequency VARCHAR(20),
  responsible_team team_type,
  responsible_person UUID REFERENCES profiles(id),
  sort_order INTEGER DEFAULT 0,
  depth INTEGER DEFAULT 0,
  is_summary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE budget_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_number VARCHAR(30) UNIQUE NOT NULL,
  item_id UUID NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES parking_lots(id),
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
  requested_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  receipt_path TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE budget_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number VARCHAR(30) UNIQUE NOT NULL,
  fiscal_year INTEGER NOT NULL,
  transfer_type VARCHAR(20) NOT NULL,
  from_item_id UUID NOT NULL REFERENCES budget_items(id),
  to_item_id UUID NOT NULL REFERENCES budget_items(id),
  amount BIGINT NOT NULL,
  reason TEXT NOT NULL,
  legal_basis VARCHAR(200),
  requested_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approval_number VARCHAR(50),
  approved_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Views
CREATE OR REPLACE VIEW budget_plan_summary WITH (security_invoker = true) AS
SELECT
  bp.id AS plan_id, bp.fiscal_year, bp.plan_type, bp.title, bp.status,
  SUM(CASE WHEN bi.budget_type='revenue' AND NOT bi.is_summary THEN bi.planned_amount ELSE 0 END) AS total_planned_revenue,
  SUM(CASE WHEN bi.budget_type='expenditure' AND NOT bi.is_summary THEN bi.planned_amount ELSE 0 END) AS total_planned_expenditure,
  SUM(CASE WHEN bi.budget_type='revenue' AND NOT bi.is_summary THEN bi.allocated_amount ELSE 0 END) AS total_allocated_revenue,
  SUM(CASE WHEN bi.budget_type='expenditure' AND NOT bi.is_summary THEN bi.allocated_amount ELSE 0 END) AS total_allocated_expenditure,
  SUM(CASE WHEN bi.budget_type='expenditure' AND NOT bi.is_summary THEN bi.executed_amount ELSE 0 END) AS total_executed_expenditure,
  CASE
    WHEN SUM(CASE WHEN bi.budget_type='expenditure' AND NOT bi.is_summary THEN bi.allocated_amount ELSE 0 END) > 0
    THEN ROUND(
      SUM(CASE WHEN bi.budget_type='expenditure' AND NOT bi.is_summary THEN bi.executed_amount ELSE 0 END)::decimal /
      SUM(CASE WHEN bi.budget_type='expenditure' AND NOT bi.is_summary THEN bi.allocated_amount ELSE 0 END) * 100, 2)
    ELSE 0
  END AS overall_execution_rate
FROM budget_plans bp
LEFT JOIN budget_items bi ON bi.plan_id = bp.id
GROUP BY bp.id, bp.fiscal_year, bp.plan_type, bp.title, bp.status;

CREATE OR REPLACE VIEW budget_execution_monthly WITH (security_invoker = true) AS
SELECT
  bi.plan_id,
  DATE_TRUNC('month', be.execution_date)::date AS month,
  bi.budget_type,
  SUM(be.amount) AS total_amount,
  COUNT(*) AS execution_count
FROM budget_executions be
JOIN budget_items bi ON bi.id = be.item_id
WHERE be.status IN ('approved', 'executed')
GROUP BY bi.plan_id, DATE_TRUNC('month', be.execution_date), bi.budget_type;

-- Indexes
CREATE INDEX idx_budget_plans_year ON budget_plans(fiscal_year, plan_type);
CREATE INDEX idx_budget_plans_status ON budget_plans(status);
CREATE INDEX idx_budget_items_plan ON budget_items(plan_id, budget_type, sort_order);
CREATE INDEX idx_budget_items_parent ON budget_items(parent_item_id);
CREATE INDEX idx_budget_items_lot ON budget_items(lot_id);
CREATE INDEX idx_budget_items_team ON budget_items(responsible_team);
CREATE INDEX idx_budget_exec_item ON budget_executions(item_id, execution_date);
CREATE INDEX idx_budget_exec_date ON budget_executions(execution_date DESC);
CREATE INDEX idx_budget_exec_status ON budget_executions(status);
CREATE INDEX idx_budget_exec_ref ON budget_executions(reference_module, reference_id);
CREATE INDEX idx_budget_transfer_year ON budget_transfers(fiscal_year, status);
CREATE INDEX idx_budget_transfer_items ON budget_transfers(from_item_id, to_item_id);

-- Triggers
CREATE TRIGGER trg_budget_plans_updated BEFORE UPDATE ON budget_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_budget_items_updated BEFORE UPDATE ON budget_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_budget_exec_updated BEFORE UPDATE ON budget_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_budget_transfer_updated BEFORE UPDATE ON budget_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 집행 승인 시 budget_items.executed_amount 자동 갱신
CREATE OR REPLACE FUNCTION update_budget_item_on_execution()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'executed' AND OLD.status != 'executed' THEN
    IF NEW.execution_type = 'expenditure' THEN
      UPDATE budget_items SET executed_amount = executed_amount + NEW.amount WHERE id = NEW.item_id;
    ELSIF NEW.execution_type = 'return' THEN
      UPDATE budget_items SET returned_amount = returned_amount + NEW.amount WHERE id = NEW.item_id;
    ELSIF NEW.execution_type = 'revenue_collection' THEN
      UPDATE budget_items SET executed_amount = executed_amount + NEW.amount WHERE id = NEW.item_id;
    END IF;
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status = 'executed' THEN
    IF OLD.execution_type = 'expenditure' THEN
      UPDATE budget_items SET executed_amount = executed_amount - OLD.amount WHERE id = OLD.item_id;
    ELSIF OLD.execution_type = 'return' THEN
      UPDATE budget_items SET returned_amount = returned_amount - OLD.amount WHERE id = OLD.item_id;
    ELSIF OLD.execution_type = 'revenue_collection' THEN
      UPDATE budget_items SET executed_amount = executed_amount - OLD.amount WHERE id = OLD.item_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_execution_update_item
  AFTER UPDATE OF status ON budget_executions
  FOR EACH ROW EXECUTE FUNCTION update_budget_item_on_execution();

-- 전용/이체 승인 시 양쪽 budget_items 금액 조정
CREATE OR REPLACE FUNCTION update_budget_items_on_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'executed' AND OLD.status != 'executed' THEN
    UPDATE budget_items SET allocated_amount = allocated_amount - NEW.amount WHERE id = NEW.from_item_id;
    UPDATE budget_items SET allocated_amount = allocated_amount + NEW.amount WHERE id = NEW.to_item_id;
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status = 'executed' THEN
    UPDATE budget_items SET allocated_amount = allocated_amount + OLD.amount WHERE id = OLD.from_item_id;
    UPDATE budget_items SET allocated_amount = allocated_amount - OLD.amount WHERE id = OLD.to_item_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transfer_update_items
  AFTER UPDATE OF status ON budget_transfers
  FOR EACH ROW EXECUTE FUNCTION update_budget_items_on_transfer();

-- budget_plans.total_revenue/expenditure 자동 갱신
CREATE OR REPLACE FUNCTION update_budget_plan_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE budget_plans SET
    total_revenue = COALESCE((
      SELECT SUM(planned_amount) FROM budget_items
      WHERE plan_id = COALESCE(NEW.plan_id, OLD.plan_id)
        AND budget_type = 'revenue' AND NOT is_summary
    ), 0),
    total_expenditure = COALESCE((
      SELECT SUM(planned_amount) FROM budget_items
      WHERE plan_id = COALESCE(NEW.plan_id, OLD.plan_id)
        AND budget_type = 'expenditure' AND NOT is_summary
    ), 0)
  WHERE id = COALESCE(NEW.plan_id, OLD.plan_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_items_update_plan_totals
  AFTER INSERT OR UPDATE OR DELETE ON budget_items
  FOR EACH ROW EXECUTE FUNCTION update_budget_plan_totals();

-- RLS
ALTER TABLE budget_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bp_select" ON budget_plans FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='BUDGET' AND is_active=true)
);
CREATE POLICY "bp_insert" ON budget_plans FOR INSERT WITH CHECK (
  get_user_role(auth.uid()) IN ('admin','manager')
);
CREATE POLICY "bp_update" ON budget_plans FOR UPDATE USING (
  get_user_role(auth.uid()) IN ('admin','manager')
);
CREATE POLICY "bp_delete" ON budget_plans FOR DELETE USING (
  get_user_role(auth.uid()) = 'admin'
);

CREATE POLICY "bi_select" ON budget_items FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='BUDGET' AND is_active=true)
);
CREATE POLICY "bi_modify" ON budget_items FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);

CREATE POLICY "be_select" ON budget_executions FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='BUDGET' AND is_active=true)
);
CREATE POLICY "be_insert" ON budget_executions FOR INSERT WITH CHECK (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY "be_update" ON budget_executions FOR UPDATE USING (
  get_user_role(auth.uid()) IN ('admin','manager')
);

CREATE POLICY "bt_select" ON budget_transfers FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='BUDGET' AND is_active=true)
);
CREATE POLICY "bt_modify" ON budget_transfers FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager')
);

-- 초기 데이터: 세입세출 분류 코드
INSERT INTO code_master (group_code, code, name_ko, sort_order) VALUES
  ('budget_revenue_l1', 'parking_fee', '주차요금 수입', 1),
  ('budget_revenue_l1', 'monthly_pass', '월정기권 수입', 2),
  ('budget_revenue_l1', 'fine', '과태료 수입', 3),
  ('budget_revenue_l1', 'subsidy', '보조금', 4),
  ('budget_revenue_l1', 'other_revenue', '기타 수입', 5),
  ('budget_expense_l1', 'personnel', '인건비', 1),
  ('budget_expense_l1', 'operation', '운영비', 2),
  ('budget_expense_l1', 'facility', '시설비', 3),
  ('budget_expense_l1', 'outsourcing', '위탁비', 4),
  ('budget_expense_l1', 'equipment', '장비비', 5),
  ('budget_expense_l1', 'other_expense', '기타 경비', 6),
  ('budget_expense_l2_personnel', 'salary', '급여', 1),
  ('budget_expense_l2_personnel', 'allowance', '수당', 2),
  ('budget_expense_l2_personnel', 'social_insurance', '사회보험 부담금', 3),
  ('budget_expense_l2_operation', 'utility', '공공요금', 1),
  ('budget_expense_l2_operation', 'consumable', '소모품비', 2),
  ('budget_expense_l2_operation', 'printing', '인쇄비', 3),
  ('budget_expense_l2_operation', 'communication', '통신비', 4),
  ('budget_expense_l2_operation', 'insurance', '보험료', 5),
  ('budget_expense_l2_facility', 'repair', '시설보수비', 1),
  ('budget_expense_l2_facility', 'safety', '안전점검비', 2),
  ('budget_expense_l2_facility', 'painting', '도색/노면공사비', 3),
  ('budget_expense_l2_facility', 'cleaning', '청소비', 4),
  ('budget_expense_l2_facility', 'landscaping', '조경비', 5),
  ('budget_expense_l2_equipment', 'purchase', '장비 구입비', 1),
  ('budget_expense_l2_equipment', 'maintenance', '장비 유지보수비', 2),
  ('budget_expense_l2_equipment', 'lease', '장비 임차비', 3);
