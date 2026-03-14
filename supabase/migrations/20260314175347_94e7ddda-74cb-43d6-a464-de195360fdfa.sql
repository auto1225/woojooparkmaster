
-- 8-1. service_projects
CREATE TABLE service_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  project_number VARCHAR(50) UNIQUE NOT NULL,
  lot_id UUID REFERENCES parking_lots(id),
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
  supervisor_id UUID REFERENCES profiles(id),
  inspector_id UUID REFERENCES profiles(id),
  sub_supervisor_id UUID REFERENCES profiles(id),
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
  progress_note TEXT,
  last_progress_update TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'preparing',
  status_changed_at TIMESTAMPTZ DEFAULT now(),
  suspension_reason TEXT,
  suspension_start DATE,
  suspension_end DATE,
  termination_reason TEXT,
  termination_date DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8-2. service_milestones
CREATE TABLE service_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES service_projects(id) ON DELETE CASCADE,
  milestone_number INTEGER NOT NULL,
  milestone_type VARCHAR(30) NOT NULL DEFAULT 'progress',
  title VARCHAR(200) NOT NULL,
  description TEXT,
  target_date DATE NOT NULL,
  actual_date DATE,
  delay_days INTEGER GENERATED ALWAYS AS (
    CASE WHEN actual_date IS NOT NULL AND actual_date > target_date
      THEN actual_date - target_date ELSE 0 END
  ) STORED,
  weight_pct DECIMAL(5,2) DEFAULT 0,
  deliverables_expected TEXT,
  deliverables_count INTEGER DEFAULT 0,
  deliverables_submitted INTEGER DEFAULT 0,
  payment_amount BIGINT DEFAULT 0,
  payment_requested BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, milestone_number)
);

-- 8-3. service_deliverables
CREATE TABLE service_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES service_projects(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES service_milestones(id) ON DELETE SET NULL,
  deliverable_number VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  deliverable_type VARCHAR(30) NOT NULL,
  description TEXT,
  format_required VARCHAR(50),
  required_copies INTEGER DEFAULT 1,
  file_path TEXT,
  file_format VARCHAR(10),
  file_size BIGINT,
  submitted_at TIMESTAMPTZ,
  submitted_by VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  review_note TEXT,
  review_score INTEGER,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  revision_count INTEGER DEFAULT 0,
  revision_deadline DATE,
  revision_note TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8-4. service_inspections
CREATE TABLE service_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES service_projects(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES service_milestones(id),
  inspection_number VARCHAR(30) UNIQUE NOT NULL,
  inspection_type VARCHAR(20) NOT NULL,
  inspection_seq INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  inspection_date DATE NOT NULL,
  inspector_id UUID NOT NULL REFERENCES profiles(id),
  inspector_name VARCHAR(100),
  sub_inspector_id UUID REFERENCES profiles(id),
  target_amount BIGINT NOT NULL,
  deduction_amount BIGINT DEFAULT 0,
  approved_amount BIGINT,
  deduction_reason TEXT,
  checklist_results JSONB,
  total_items INTEGER DEFAULT 0,
  pass_items INTEGER DEFAULT 0,
  fail_items INTEGER DEFAULT 0,
  result VARCHAR(20),
  result_note TEXT,
  deficiency_note TEXT,
  correction_items JSONB,
  correction_deadline DATE,
  correction_submitted_at TIMESTAMPTZ,
  correction_verified BOOLEAN DEFAULT false,
  correction_verified_by UUID REFERENCES profiles(id),
  correction_verified_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending',
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  report_path TEXT,
  photos JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8-5. service_payments
CREATE TABLE service_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES service_projects(id) ON DELETE CASCADE,
  inspection_id UUID REFERENCES service_inspections(id),
  payment_number VARCHAR(30) UNIQUE NOT NULL,
  payment_type VARCHAR(20) NOT NULL,
  payment_seq INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  gross_amount BIGINT NOT NULL,
  advance_deduction BIGINT DEFAULT 0,
  other_deduction BIGINT DEFAULT 0,
  deduction_detail JSONB,
  net_amount BIGINT GENERATED ALWAYS AS (gross_amount - advance_deduction - other_deduction) STORED,
  request_date DATE NOT NULL,
  request_document_path TEXT,
  due_date DATE,
  paid_date DATE,
  paid_amount BIGINT,
  payment_method VARCHAR(20),
  bank_name VARCHAR(50),
  bank_account VARCHAR(50),
  receipt_number VARCHAR(50),
  budget_execution_id UUID,
  is_delayed BOOLEAN DEFAULT false,
  delay_days INTEGER,
  delay_interest BIGINT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'requested',
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  reject_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8-6. service_issues
CREATE TABLE service_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES service_projects(id) ON DELETE CASCADE,
  issue_number VARCHAR(30) UNIQUE NOT NULL,
  issue_type VARCHAR(30) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'medium',
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  impact_amount BIGINT DEFAULT 0,
  impact_days INTEGER DEFAULT 0,
  impact_scope TEXT,
  reported_by UUID REFERENCES profiles(id),
  reported_at TIMESTAMPTZ DEFAULT now(),
  assigned_to UUID REFERENCES profiles(id),
  requires_approval BOOLEAN DEFAULT false,
  approval_status VARCHAR(20),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  approval_document_path TEXT,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  revised_amount BIGINT,
  revised_end_date DATE,
  status VARCHAR(20) DEFAULT 'open',
  attachments JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Views
CREATE OR REPLACE VIEW service_payment_summary AS
SELECT
  sp.id AS project_id, sp.project_number, sp.title, sp.total_amount, sp.paid_amount,
  sp.remaining_amount, sp.payment_rate,
  COUNT(CASE WHEN pay.status = 'paid' THEN 1 END) AS paid_count,
  COUNT(CASE WHEN pay.status IN ('requested','reviewing','approved') THEN 1 END) AS pending_count,
  SUM(CASE WHEN pay.status = 'paid' THEN pay.paid_amount ELSE 0 END) AS actual_paid,
  SUM(CASE WHEN pay.is_delayed THEN pay.delay_interest ELSE 0 END) AS total_delay_interest
FROM service_projects sp
LEFT JOIN service_payments pay ON pay.project_id = sp.id
GROUP BY sp.id, sp.project_number, sp.title, sp.total_amount, sp.paid_amount, sp.remaining_amount, sp.payment_rate;

CREATE OR REPLACE VIEW service_issue_summary AS
SELECT
  project_id,
  COUNT(*) AS total_issues,
  COUNT(CASE WHEN status IN ('open','in_progress','pending_approval') THEN 1 END) AS open_issues,
  COUNT(CASE WHEN severity = 'critical' AND status NOT IN ('resolved','closed') THEN 1 END) AS critical_open,
  SUM(impact_amount) AS total_impact_amount,
  SUM(impact_days) AS total_impact_days
FROM service_issues
GROUP BY project_id;

-- Indexes
CREATE INDEX idx_svc_projects_status ON service_projects(status);
CREATE INDEX idx_svc_projects_lot ON service_projects(lot_id);
CREATE INDEX idx_svc_projects_type ON service_projects(service_type);
CREATE INDEX idx_svc_projects_end ON service_projects(end_date);
CREATE INDEX idx_svc_projects_warranty ON service_projects(warranty_end);
CREATE INDEX idx_svc_projects_contract ON service_projects(bid_contract_id);
CREATE INDEX idx_svc_projects_budget ON service_projects(budget_item_id);
CREATE INDEX idx_svc_milestones_project ON service_milestones(project_id, milestone_number);
CREATE INDEX idx_svc_milestones_date ON service_milestones(target_date);
CREATE INDEX idx_svc_deliverables_project ON service_deliverables(project_id, status);
CREATE INDEX idx_svc_deliverables_milestone ON service_deliverables(milestone_id);
CREATE INDEX idx_svc_inspections_project ON service_inspections(project_id, inspection_type);
CREATE INDEX idx_svc_inspections_status ON service_inspections(status);
CREATE INDEX idx_svc_payments_project ON service_payments(project_id, payment_type);
CREATE INDEX idx_svc_payments_status ON service_payments(status);
CREATE INDEX idx_svc_payments_due ON service_payments(due_date);
CREATE INDEX idx_svc_payments_budget ON service_payments(budget_execution_id);
CREATE INDEX idx_svc_issues_project ON service_issues(project_id, status);
CREATE INDEX idx_svc_issues_severity ON service_issues(severity, status);

-- Triggers
CREATE TRIGGER trg_svc_projects_updated BEFORE UPDATE ON service_projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_svc_milestones_updated BEFORE UPDATE ON service_milestones FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_svc_deliverables_updated BEFORE UPDATE ON service_deliverables FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_svc_inspections_updated BEFORE UPDATE ON service_inspections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_svc_payments_updated BEFORE UPDATE ON service_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_svc_issues_updated BEFORE UPDATE ON service_issues FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Payment trigger
CREATE OR REPLACE FUNCTION update_project_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    UPDATE service_projects SET
      paid_amount = paid_amount + COALESCE(NEW.paid_amount, NEW.net_amount),
      updated_at = now()
    WHERE id = NEW.project_id;
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status = 'paid' THEN
    UPDATE service_projects SET
      paid_amount = paid_amount - COALESCE(OLD.paid_amount, OLD.net_amount),
      updated_at = now()
    WHERE id = OLD.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_update_project
  AFTER UPDATE OF status ON service_payments
  FOR EACH ROW EXECUTE FUNCTION update_project_on_payment();

-- Milestone progress trigger
CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
  new_progress DECIMAL(5,2);
BEGIN
  SELECT COALESCE(SUM(CASE WHEN status='completed' THEN weight_pct ELSE 0 END), 0)
  INTO new_progress
  FROM service_milestones WHERE project_id = NEW.project_id;
  UPDATE service_projects SET
    progress_pct = new_progress,
    last_progress_update = now()
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_milestone_update_progress
  AFTER UPDATE OF status ON service_milestones
  FOR EACH ROW EXECUTE FUNCTION update_project_progress();

-- RLS
ALTER TABLE service_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "svcp_select" ON service_projects FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='SERVICE' AND is_active=true)
);
CREATE POLICY "svcp_modify" ON service_projects FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);

CREATE POLICY "svcm_select" ON service_milestones FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "svcm_modify" ON service_milestones FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);

CREATE POLICY "svcd_select" ON service_deliverables FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "svcd_modify" ON service_deliverables FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);

CREATE POLICY "svci_select" ON service_inspections FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "svci_modify" ON service_inspections FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

CREATE POLICY "svcp_pay_select" ON service_payments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "svcp_pay_modify" ON service_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

CREATE POLICY "svci_issue_select" ON service_issues FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "svci_issue_modify" ON service_issues FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);
