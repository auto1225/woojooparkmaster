
-- Phase 5-A: REVENUE 모듈 테이블

-- 5-1. revenue_daily (일별 수입 집계)
CREATE TABLE revenue_daily (
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
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMPTZ,
  discrepancy_note TEXT,
  input_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lot_id, revenue_date)
);

-- 5-2. revenue_reconciliation (위탁수입 대사)
CREATE TABLE revenue_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  recon_number VARCHAR(30) UNIQUE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  reported_cash BIGINT DEFAULT 0,
  reported_card BIGINT DEFAULT 0,
  reported_mobile BIGINT DEFAULT 0,
  reported_other BIGINT DEFAULT 0,
  reported_total BIGINT GENERATED ALWAYS AS (reported_cash + reported_card + reported_mobile + reported_other) STORED,
  reported_vehicles INTEGER DEFAULT 0,
  reported_exemptions BIGINT DEFAULT 0,
  report_date DATE,
  report_document_path TEXT,
  system_cash BIGINT DEFAULT 0,
  system_card BIGINT DEFAULT 0,
  system_mobile BIGINT DEFAULT 0,
  system_other BIGINT DEFAULT 0,
  system_total BIGINT GENERATED ALWAYS AS (system_cash + system_card + system_mobile + system_other) STORED,
  system_vehicles INTEGER DEFAULT 0,
  system_exemptions BIGINT DEFAULT 0,
  diff_amount BIGINT GENERATED ALWAYS AS (
    (reported_cash + reported_card + reported_mobile + reported_other) -
    (system_cash + system_card + system_mobile + system_other)
  ) STORED,
  diff_rate DECIMAL(5,2),
  diff_analysis TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  resolution_type VARCHAR(30),
  resolution_note TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  company_name VARCHAR(200),
  contract_id UUID,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Views
CREATE OR REPLACE VIEW revenue_monthly AS
SELECT
  lot_id,
  DATE_TRUNC('month', revenue_date)::date AS month,
  SUM(cash_amount) AS cash_total,
  SUM(card_amount) AS card_total,
  SUM(mobile_amount) AS mobile_total,
  SUM(monthly_pass_amount) AS pass_total,
  SUM(other_amount) AS other_total,
  SUM(cash_amount + card_amount + mobile_amount + monthly_pass_amount + other_amount) AS grand_total,
  SUM(total_vehicles) AS vehicles_total,
  SUM(exemption_count) AS exemptions_total,
  SUM(exemption_amount) AS exemption_amount_total,
  COUNT(*) AS days_recorded
FROM revenue_daily
GROUP BY lot_id, DATE_TRUNC('month', revenue_date);

CREATE OR REPLACE VIEW revenue_yearly AS
SELECT
  lot_id,
  EXTRACT(YEAR FROM revenue_date)::integer AS year,
  SUM(cash_amount + card_amount + mobile_amount + monthly_pass_amount + other_amount) AS grand_total,
  SUM(total_vehicles) AS vehicles_total,
  COUNT(*) AS days_recorded
FROM revenue_daily
GROUP BY lot_id, EXTRACT(YEAR FROM revenue_date);

CREATE OR REPLACE VIEW revenue_summary_monthly AS
SELECT
  DATE_TRUNC('month', revenue_date)::date AS month,
  COUNT(DISTINCT lot_id) AS lot_count,
  SUM(cash_amount) AS cash_total,
  SUM(card_amount) AS card_total,
  SUM(mobile_amount) AS mobile_total,
  SUM(monthly_pass_amount) AS pass_total,
  SUM(cash_amount + card_amount + mobile_amount + monthly_pass_amount + other_amount) AS grand_total,
  SUM(total_vehicles) AS vehicles_total,
  SUM(exemption_amount) AS exemption_total
FROM revenue_daily
GROUP BY DATE_TRUNC('month', revenue_date)
ORDER BY month DESC;

-- Indexes
CREATE INDEX idx_revenue_daily_lot_date ON revenue_daily(lot_id, revenue_date DESC);
CREATE INDEX idx_revenue_daily_date ON revenue_daily(revenue_date DESC);
CREATE INDEX idx_revenue_daily_verified ON revenue_daily(verified, revenue_date);
CREATE INDEX idx_recon_lot ON revenue_reconciliation(lot_id, period_start DESC);
CREATE INDEX idx_recon_status ON revenue_reconciliation(status);
CREATE INDEX idx_recon_period ON revenue_reconciliation(period_start, period_end);

-- Triggers
CREATE TRIGGER trg_revenue_daily_updated BEFORE UPDATE ON revenue_daily FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_recon_updated BEFORE UPDATE ON revenue_reconciliation FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 대사 차이율 자동 계산
CREATE OR REPLACE FUNCTION calc_recon_diff_rate()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.system_cash + NEW.system_card + NEW.system_mobile + NEW.system_other) > 0 THEN
    NEW.diff_rate := ROUND(
      ((NEW.reported_cash + NEW.reported_card + NEW.reported_mobile + NEW.reported_other) -
       (NEW.system_cash + NEW.system_card + NEW.system_mobile + NEW.system_other))::decimal /
      (NEW.system_cash + NEW.system_card + NEW.system_mobile + NEW.system_other) * 100
    , 2);
  ELSE
    NEW.diff_rate := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recon_diff_rate
  BEFORE INSERT OR UPDATE ON revenue_reconciliation
  FOR EACH ROW EXECUTE FUNCTION calc_recon_diff_rate();

-- RLS
ALTER TABLE revenue_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_reconciliation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rev_daily_select" ON revenue_daily FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='REVENUE' AND is_active=true)
);
CREATE POLICY "rev_daily_insert" ON revenue_daily FOR INSERT WITH CHECK (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY "rev_daily_update" ON revenue_daily FOR UPDATE USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY "rev_daily_delete" ON revenue_daily FOR DELETE USING (
  get_user_role(auth.uid()) = 'admin'
);

CREATE POLICY "recon_select" ON revenue_reconciliation FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='REVENUE' AND is_active=true)
);
CREATE POLICY "recon_modify" ON revenue_reconciliation FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);
