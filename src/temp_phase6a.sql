-- ============================================================
-- ParkMaster™ Phase 6-A: BUDGET (예산관리) 모듈 테이블
-- ============================================================
-- 실행 시점: BUDGET 모듈 구매/활성화 시
-- 선행 조건: Phase 0 (CORE) 완료
-- ============================================================

-- 6-1. budget_plans (예산 편성안)
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

COMMENT ON TABLE budget_plans IS '예산 편성안 - 회계연도별 본예산/추경 관리';
COMMENT ON COLUMN budget_plans.plan_type IS 'original(본예산)/supplementary(추경)/revised(수정)';
COMMENT ON COLUMN budget_plans.plan_number IS '차수 (본예산=1, 추경1차=1, 추경2차=2 ...)';
COMMENT ON COLUMN budget_plans.status IS 'draft/submitted/review/approved/rejected/executed';

-- 6-2. budget_items (예산 세부항목)
CREATE TABLE budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES budget_plans(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES parking_lots(id),
  parent_item_id UUID REFERENCES budget_items(id),
  item_code VARCHAR(30) NOT NULL,
  budget_type VARCHAR(10) NOT NULL,
  -- 분류 체계 (장-관-항-목)
  category_l1 VARCHAR(100) NOT NULL,
  category_l2 VARCHAR(100),
  category_l3 VARCHAR(100),
  category_l4 VARCHAR(100),
  item_name VARCHAR(200) NOT NULL,
  description TEXT,
  -- 금액
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
  -- 속성
  is_mandatory BOOLEAN DEFAULT false,
  is_recurring BOOLEAN DEFAULT false,
  frequency VARCHAR(20),
  responsible_team team_type,
  responsible_person UUID REFERENCES profiles(id),
  -- 메타
  sort_order INTEGER DEFAULT 0,
  depth INTEGER DEFAULT 0,
  is_summary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE budget_items IS '예산 세부항목 - 장→관→항→목 계층 구조';
COMMENT ON COLUMN budget_items.budget_type IS 'revenue(세입)/expenditure(세출)';
COMMENT ON COLUMN budget_items.parent_item_id IS '상위 항목 (계층 구조)';
COMMENT ON COLUMN budget_items.lot_id IS '특정 주차장 귀속 (NULL이면 공통)';
COMMENT ON COLUMN budget_items.is_mandatory IS '의무적 경비 여부 (인건비, 법정부담금 등)';
COMMENT ON COLUMN budget_items.frequency IS 'once/monthly/quarterly/yearly (집행 빈도)';
COMMENT ON COLUMN budget_items.is_summary IS '합계 행 여부 (소계/합계)';
COMMENT ON COLUMN budget_items.depth IS '계층 깊이 (0=장, 1=관, 2=항, 3=목)';

-- 6-3. budget_executions (예산 집행 내역)
CREATE TABLE budget_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_number VARCHAR(30) UNIQUE NOT NULL,
  item_id UUID NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES parking_lots(id),
  execution_date DATE NOT NULL,
  amount BIGINT NOT NULL,
  execution_type VARCHAR(30) NOT NULL,
  -- 거래 상대
  vendor_name VARCHAR(200),
  vendor_business_number VARCHAR(20),
  -- 상세
  description VARCHAR(500) NOT NULL,
  document_number VARCHAR(50),
  document_date DATE,
  payment_method VARCHAR(30),
  bank_account VARCHAR(50),
  -- 크로스 모듈 연계
  reference_module VARCHAR(30),
  reference_id UUID,
  reference_number VARCHAR(50),
  -- 결재
  requested_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  -- 메타
  receipt_path TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE budget_executions IS '예산 집행 내역 - 지출/수입 개별 건';
COMMENT ON COLUMN budget_executions.execution_type IS 'expenditure(지출)/revenue_collection(수입징수)/transfer_in(전입)/transfer_out(전출)/return(반납)/carry_forward(이월)';
COMMENT ON COLUMN budget_executions.status IS 'pending/approved/executed/rejected/cancelled';
COMMENT ON COLUMN budget_executions.reference_module IS '연계 모듈 (service/procurement/facility/ops 등)';
COMMENT ON COLUMN budget_executions.reference_id IS '연계 레코드 ID (service_payments.id, bid_contracts.id 등)';
COMMENT ON COLUMN budget_executions.reference_number IS '연계 문서 번호';
COMMENT ON COLUMN budget_executions.document_number IS '지출결의서/수입결의서 번호';
COMMENT ON COLUMN budget_executions.payment_method IS 'bank_transfer/card/cash/check/offset';

-- 6-4. budget_transfers (예산 전용/이용/이체)
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
  -- 결재
  requested_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approval_number VARCHAR(50),
  approved_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  -- 메타
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE budget_transfers IS '예산 전용/이용/이체 - 항목간 예산 이동';
COMMENT ON COLUMN budget_transfers.transfer_type IS 'appropriation(전용-동일관내)/use(이용-관간)/transfer(이체-기관간)/reserve(예비비사용)';
COMMENT ON COLUMN budget_transfers.status IS 'pending/approved/executed/rejected/cancelled';
COMMENT ON COLUMN budget_transfers.legal_basis IS '근거 법령/조례 (예: 지방재정법 제47조)';


-- ─── Views ───

-- 편성안별 세입세출 요약
CREATE OR REPLACE VIEW budget_plan_summary AS
SELECT
  bp.id AS plan_id,
  bp.fiscal_year,
  bp.plan_type,
  bp.title,
  bp.status,
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

-- 월별 집행 현황
CREATE OR REPLACE VIEW budget_execution_monthly AS
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


-- ─── Indexes ───
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
CREATE INDEX idx_budget_exec_vendor ON budget_executions(vendor_name);
CREATE INDEX idx_budget_transfer_year ON budget_transfers(fiscal_year, status);
CREATE INDEX idx_budget_transfer_items ON budget_transfers(from_item_id, to_item_id);

-- ─── Triggers ───
CREATE TRIGGER trg_budget_plans_updated BEFORE UPDATE ON budget_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_budget_items_updated BEFORE UPDATE ON budget_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_budget_exec_updated BEFORE UPDATE ON budget_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_budget_transfer_updated BEFORE UPDATE ON budget_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 집행 승인 시 budget_items.executed_amount 자동 갱신
CREATE OR REPLACE FUNCTION update_budget_item_on_execution()
RETURNS TRIGGER AS $$
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
  -- 집행 취소 시 롤백
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_execution_update_item
  AFTER UPDATE OF status ON budget_executions
  FOR EACH ROW EXECUTE FUNCTION update_budget_item_on_execution();

-- 전용/이체 승인 시 양쪽 budget_items 금액 조정
CREATE OR REPLACE FUNCTION update_budget_items_on_transfer()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'executed' AND OLD.status != 'executed' THEN
    UPDATE budget_items SET allocated_amount = allocated_amount - NEW.amount WHERE id = NEW.from_item_id;
    UPDATE budget_items SET allocated_amount = allocated_amount + NEW.amount WHERE id = NEW.to_item_id;
  END IF;
  -- 취소 시 롤백
  IF NEW.status = 'cancelled' AND OLD.status = 'executed' THEN
    UPDATE budget_items SET allocated_amount = allocated_amount + OLD.amount WHERE id = OLD.from_item_id;
    UPDATE budget_items SET allocated_amount = allocated_amount - OLD.amount WHERE id = OLD.to_item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transfer_update_items
  AFTER UPDATE OF status ON budget_transfers
  FOR EACH ROW EXECUTE FUNCTION update_budget_items_on_transfer();

-- budget_plans.total_revenue/expenditure 자동 갱신
CREATE OR REPLACE FUNCTION update_budget_plan_totals()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_items_update_plan_totals
  AFTER INSERT OR UPDATE OR DELETE ON budget_items
  FOR EACH ROW EXECUTE FUNCTION update_budget_plan_totals();


-- ─── RLS ───
ALTER TABLE budget_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bp_select" ON budget_plans FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='BUDGET' AND is_active=true)
);
CREATE POLICY "bp_insert" ON budget_plans FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);
CREATE POLICY "bp_update" ON budget_plans FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);
CREATE POLICY "bp_delete" ON budget_plans FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin')
);

CREATE POLICY "bi_select" ON budget_items FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='BUDGET' AND is_active=true)
);
CREATE POLICY "bi_modify" ON budget_items FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);

CREATE POLICY "be_select" ON budget_executions FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='BUDGET' AND is_active=true)
);
CREATE POLICY "be_insert" ON budget_executions FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);
CREATE POLICY "be_update" ON budget_executions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

CREATE POLICY "bt_select" ON budget_transfers FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='BUDGET' AND is_active=true)
);
CREATE POLICY "bt_modify" ON budget_transfers FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);


-- ─── 초기 데이터: 세입세출 분류 코드 ───
INSERT INTO code_master (group_code, code, name_ko, sort_order) VALUES
  -- 세입 분류
  ('budget_revenue_l1', 'parking_fee', '주차요금 수입', 1),
  ('budget_revenue_l1', 'monthly_pass', '월정기권 수입', 2),
  ('budget_revenue_l1', 'fine', '과태료 수입', 3),
  ('budget_revenue_l1', 'subsidy', '보조금', 4),
  ('budget_revenue_l1', 'other_revenue', '기타 수입', 5),
  -- 세출 분류 (장)
  ('budget_expense_l1', 'personnel', '인건비', 1),
  ('budget_expense_l1', 'operation', '운영비', 2),
  ('budget_expense_l1', 'facility', '시설비', 3),
  ('budget_expense_l1', 'outsourcing', '위탁비', 4),
  ('budget_expense_l1', 'equipment', '장비비', 5),
  ('budget_expense_l1', 'other_expense', '기타 경비', 6),
  -- 세출 분류 (관) - 인건비
  ('budget_expense_l2_personnel', 'salary', '급여', 1),
  ('budget_expense_l2_personnel', 'allowance', '수당', 2),
  ('budget_expense_l2_personnel', 'social_insurance', '사회보험 부담금', 3),
  -- 세출 분류 (관) - 운영비
  ('budget_expense_l2_operation', 'utility', '공공요금', 1),
  ('budget_expense_l2_operation', 'consumable', '소모품비', 2),
  ('budget_expense_l2_operation', 'printing', '인쇄비', 3),
  ('budget_expense_l2_operation', 'communication', '통신비', 4),
  ('budget_expense_l2_operation', 'insurance', '보험료', 5),
  -- 세출 분류 (관) - 시설비
  ('budget_expense_l2_facility', 'repair', '시설보수비', 1),
  ('budget_expense_l2_facility', 'safety', '안전점검비', 2),
  ('budget_expense_l2_facility', 'painting', '도색/노면공사비', 3),
  ('budget_expense_l2_facility', 'cleaning', '청소비', 4),
  ('budget_expense_l2_facility', 'landscaping', '조경비', 5),
  -- 세출 분류 (관) - 장비비
  ('budget_expense_l2_equipment', 'purchase', '장비 구입비', 1),
  ('budget_expense_l2_equipment', 'maintenance', '장비 유지보수비', 2),
  ('budget_expense_l2_equipment', 'lease', '장비 임차비', 3);

-- BUDGET 모듈 라이선스 활성화
UPDATE module_licenses SET is_active = true, activated_at = now() WHERE module_code = 'BUDGET';

-- ============================================================
-- BUDGET 테이블 생성 완료 (4개 테이블 + 2개 View + 4개 자동화 트리거)
-- ============================================================
