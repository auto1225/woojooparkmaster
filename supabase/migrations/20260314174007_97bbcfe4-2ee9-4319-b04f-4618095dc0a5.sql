
-- 7-1. bid_projects (입찰 사업)
CREATE TABLE bid_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  bid_number VARCHAR(50) UNIQUE NOT NULL,
  lot_id UUID REFERENCES parking_lots(id),
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
  created_by UUID REFERENCES profiles(id),
  assigned_to UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7-2. bid_submissions (입찰 참여 업체)
CREATE TABLE bid_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_project_id UUID NOT NULL REFERENCES bid_projects(id) ON DELETE CASCADE,
  submission_number VARCHAR(30) UNIQUE NOT NULL,
  company_name VARCHAR(200) NOT NULL,
  business_number VARCHAR(20),
  representative VARCHAR(100),
  established_date DATE,
  employee_count INTEGER,
  annual_revenue BIGINT,
  main_business VARCHAR(200),
  contact_person VARCHAR(100),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(255),
  contact_fax VARCHAR(20),
  company_address VARCHAR(300),
  bid_amount BIGINT,
  bid_rate DECIMAL(8,4),
  submitted_at TIMESTAMPTZ,
  documents JSONB,
  is_valid BOOLEAN DEFAULT true,
  invalid_reason VARCHAR(300),
  invalidated_by UUID REFERENCES profiles(id),
  invalidated_at TIMESTAMPTZ,
  past_performance JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7-3. bid_evaluations (입찰 평가)
CREATE TABLE bid_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_project_id UUID NOT NULL REFERENCES bid_projects(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES bid_submissions(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES profiles(id),
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

-- 7-4. bid_contracts (낙찰/계약)
CREATE TABLE bid_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_project_id UUID NOT NULL REFERENCES bid_projects(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES bid_submissions(id),
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
  performance_bond_company VARCHAR(200),
  performance_bond_number VARCHAR(50),
  performance_bond_end DATE,
  defect_bond_rate DECIMAL(5,2),
  defect_bond_amount BIGINT,
  advance_bond_amount BIGINT,
  payment_terms JSONB,
  penalty_rate DECIMAL(5,3) DEFAULT 0.25,
  special_conditions TEXT,
  status VARCHAR(20) DEFAULT 'active',
  termination_date DATE,
  termination_reason TEXT,
  service_project_id UUID,
  signed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7-5. bid_documents (입찰 관련 서류)
CREATE TABLE bid_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_project_id UUID NOT NULL REFERENCES bid_projects(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES bid_contracts(id),
  doc_type VARCHAR(50) NOT NULL,
  doc_category VARCHAR(30) NOT NULL DEFAULT 'bid',
  title VARCHAR(200) NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  file_format VARCHAR(10),
  version VARCHAR(20) DEFAULT 'v1.0',
  is_current BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT false,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_bid_projects_status ON bid_projects(status);
CREATE INDEX idx_bid_projects_type ON bid_projects(bid_type, contract_type);
CREATE INDEX idx_bid_projects_lot ON bid_projects(lot_id);
CREATE INDEX idx_bid_projects_date ON bid_projects(announce_date DESC);
CREATE INDEX idx_bid_projects_deadline ON bid_projects(bid_deadline);
CREATE INDEX idx_bid_projects_budget ON bid_projects(budget_item_id);
CREATE INDEX idx_bid_submissions_project ON bid_submissions(bid_project_id);
CREATE INDEX idx_bid_submissions_company ON bid_submissions(company_name);
CREATE INDEX idx_bid_evaluations_project ON bid_evaluations(bid_project_id, rank);
CREATE INDEX idx_bid_evaluations_submission ON bid_evaluations(submission_id);
CREATE INDEX idx_bid_contracts_project ON bid_contracts(bid_project_id);
CREATE INDEX idx_bid_contracts_status ON bid_contracts(status);
CREATE INDEX idx_bid_contracts_end ON bid_contracts(contract_end);
CREATE INDEX idx_bid_contracts_service ON bid_contracts(service_project_id);
CREATE INDEX idx_bid_documents_project ON bid_documents(bid_project_id, doc_type);
CREATE INDEX idx_bid_documents_contract ON bid_documents(contract_id);

-- Triggers
CREATE TRIGGER trg_bid_projects_updated BEFORE UPDATE ON bid_projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bid_submissions_updated BEFORE UPDATE ON bid_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bid_evaluations_updated BEFORE UPDATE ON bid_evaluations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bid_contracts_updated BEFORE UPDATE ON bid_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 낙찰 시 bid_projects에 결과 자동 반영
CREATE OR REPLACE FUNCTION update_bid_project_on_award()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bid_projects SET
    successful_bidder = NEW.contractor_name,
    contract_amount = NEW.contract_amount,
    savings_rate = CASE
      WHEN estimated_amount > 0
      THEN ROUND((estimated_amount - NEW.contract_amount)::decimal / estimated_amount * 100, 2)
      ELSE 0
    END,
    status = 'contracted'
  WHERE id = NEW.bid_project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contract_update_project
  AFTER INSERT ON bid_contracts
  FOR EACH ROW EXECUTE FUNCTION update_bid_project_on_award();

-- 투찰률 자동 계산
CREATE OR REPLACE FUNCTION calc_bid_rate()
RETURNS TRIGGER AS $$
DECLARE
  est_amount BIGINT;
BEGIN
  SELECT estimated_amount INTO est_amount FROM bid_projects WHERE id = NEW.bid_project_id;
  IF est_amount > 0 AND NEW.bid_amount > 0 THEN
    NEW.bid_rate := ROUND(NEW.bid_amount::decimal / est_amount * 100, 4);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_bid_rate
  BEFORE INSERT OR UPDATE OF bid_amount ON bid_submissions
  FOR EACH ROW EXECUTE FUNCTION calc_bid_rate();

-- RLS
ALTER TABLE bid_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bidp_select" ON bid_projects FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='PROCUREMENT' AND is_active=true)
);
CREATE POLICY "bidp_insert" ON bid_projects FOR INSERT WITH CHECK (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY "bidp_update" ON bid_projects FOR UPDATE USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY "bidp_delete" ON bid_projects FOR DELETE USING (
  get_user_role(auth.uid()) = 'admin'
);

CREATE POLICY "bids_select" ON bid_submissions FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='PROCUREMENT' AND is_active=true)
);
CREATE POLICY "bids_modify" ON bid_submissions FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);

CREATE POLICY "bide_select" ON bid_evaluations FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='PROCUREMENT' AND is_active=true)
);
CREATE POLICY "bide_modify" ON bid_evaluations FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager')
);

CREATE POLICY "bidc_select" ON bid_contracts FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='PROCUREMENT' AND is_active=true)
);
CREATE POLICY "bidc_modify" ON bid_contracts FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager')
);

CREATE POLICY "bidd_select" ON bid_documents FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='PROCUREMENT' AND is_active=true)
);
CREATE POLICY "bidd_modify" ON bid_documents FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);
