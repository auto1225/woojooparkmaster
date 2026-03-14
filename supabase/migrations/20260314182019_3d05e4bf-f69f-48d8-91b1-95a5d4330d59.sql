
-- Phase 10: PLANNING module tables

-- 10-1. site_candidates
CREATE TABLE site_candidates (
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
  planned_space_detail JSONB,
  nearest_road VARCHAR(200),
  road_width_m DECIMAL(4,1),
  traffic_volume VARCHAR(50),
  public_transport_access TEXT,
  pedestrian_access TEXT,
  nearby_parking_lots JSONB,
  nearby_facilities TEXT,
  surrounding_population INTEGER,
  surrounding_commercial_area DECIMAL(10,2),
  legal_restrictions TEXT,
  building_coverage_ratio DECIMAL(5,2),
  floor_area_ratio DECIMAL(5,2),
  height_limit_m DECIMAL(5,1),
  setback_m DECIMAL(4,1),
  environmental_review BOOLEAN DEFAULT false,
  traffic_impact_review BOOLEAN DEFAULT false,
  cultural_heritage_review BOOLEAN DEFAULT false,
  location_score DECIMAL(3,1),
  accessibility_score DECIMAL(3,1),
  demand_score DECIMAL(3,1),
  feasibility_score DECIMAL(3,1),
  legal_score DECIMAL(3,1),
  total_score DECIMAL(4,1),
  ranking INTEGER,
  estimated_construction_cost BIGINT,
  estimated_annual_revenue BIGINT,
  estimated_annual_expense BIGINT,
  estimated_annual_profit BIGINT,
  bc_ratio DECIMAL(4,2),
  payback_years DECIMAL(4,1),
  npv BIGINT,
  irr DECIMAL(5,2),
  status VARCHAR(20) DEFAULT 'candidate',
  evaluation_date DATE,
  evaluator_id UUID REFERENCES profiles(id),
  decision_date DATE,
  decision_note TEXT,
  photos JSONB,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10-2. construction_projects
CREATE TABLE construction_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number VARCHAR(30) UNIQUE NOT NULL,
  project_name VARCHAR(200) NOT NULL,
  site_id UUID REFERENCES site_candidates(id),
  lot_id UUID REFERENCES parking_lots(id),
  project_type VARCHAR(30) NOT NULL,
  description TEXT,
  phase VARCHAR(30) NOT NULL DEFAULT 'planning',
  contractor VARCHAR(200),
  contractor_phone VARCHAR(20),
  supervisor VARCHAR(200),
  supervisor_phone VARCHAR(20),
  designer VARCHAR(200),
  total_budget BIGINT,
  design_cost BIGINT DEFAULT 0,
  construction_cost BIGINT DEFAULT 0,
  supervision_cost BIGINT DEFAULT 0,
  other_cost BIGINT DEFAULT 0,
  spent BIGINT DEFAULT 0,
  remaining BIGINT GENERATED ALWAYS AS (total_budget - spent) STORED,
  budget_execution_rate DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_budget > 0 THEN ROUND(spent::decimal / total_budget * 100, 2) ELSE 0 END
  ) STORED,
  budget_item_id UUID,
  bid_contract_id UUID,
  service_project_id UUID,
  planning_start DATE,
  planning_end DATE,
  design_start DATE,
  design_end DATE,
  construction_start DATE,
  construction_end DATE,
  target_completion DATE,
  actual_completion DATE,
  progress_pct DECIMAL(5,2) DEFAULT 0,
  progress_detail JSONB,
  permits_required JSONB,
  permits_completed INTEGER DEFAULT 0,
  permits_total INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'planning',
  delay_days INTEGER DEFAULT 0,
  delay_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10-3. design_documents
CREATE TABLE design_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  doc_number VARCHAR(30) NOT NULL,
  doc_type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  file_format VARCHAR(10),
  file_size BIGINT,
  version VARCHAR(20) NOT NULL DEFAULT 'v1.0',
  version_note TEXT,
  is_current BOOLEAN DEFAULT true,
  previous_version_id UUID REFERENCES design_documents(id),
  review_status VARCHAR(20) DEFAULT 'draft',
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_comments TEXT,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  category VARCHAR(50),
  tags JSONB,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10-4. permits
CREATE TABLE permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  permit_number VARCHAR(50),
  permit_type VARCHAR(100) NOT NULL,
  permit_category VARCHAR(50),
  authority VARCHAR(200) NOT NULL,
  authority_department VARCHAR(100),
  authority_contact VARCHAR(100),
  application_date DATE,
  target_approval_date DATE,
  actual_approval_date DATE,
  expiry_date DATE,
  conditions TEXT,
  required_documents JSONB,
  submitted_documents JSONB,
  fee_amount BIGINT DEFAULT 0,
  fee_paid BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'not_started',
  rejection_reason TEXT,
  resubmission_date DATE,
  resubmission_count INTEGER DEFAULT 0,
  application_doc_path TEXT,
  approval_doc_path TEXT,
  notes TEXT,
  assigned_to UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Views
CREATE OR REPLACE VIEW site_evaluation_summary AS
SELECT
  sc.id, sc.site_number, sc.name, sc.address_jibun,
  sc.area_sqm, sc.estimated_spaces, sc.ownership,
  sc.total_score, sc.ranking, sc.bc_ratio, sc.payback_years,
  sc.status,
  sc.estimated_construction_cost,
  sc.estimated_annual_revenue,
  sc.estimated_annual_profit,
  CASE
    WHEN sc.total_score >= 80 THEN 'A(우수)'
    WHEN sc.total_score >= 60 THEN 'B(양호)'
    WHEN sc.total_score >= 40 THEN 'C(보통)'
    ELSE 'D(미흡)'
  END AS grade,
  cp.id AS project_id,
  cp.status AS project_status,
  cp.progress_pct AS project_progress
FROM site_candidates sc
LEFT JOIN construction_projects cp ON cp.site_id = sc.id;

CREATE OR REPLACE VIEW construction_dashboard AS
SELECT
  cp.id, cp.project_number, cp.project_name,
  cp.phase, cp.status,
  cp.total_budget, cp.spent, cp.remaining, cp.budget_execution_rate,
  cp.target_completion, cp.actual_completion,
  cp.progress_pct, cp.delay_days,
  cp.permits_completed, cp.permits_total,
  sc.name AS site_name, sc.estimated_spaces,
  pl.name AS lot_name
FROM construction_projects cp
LEFT JOIN site_candidates sc ON sc.id = cp.site_id
LEFT JOIN parking_lots pl ON pl.id = cp.lot_id;

-- Indexes
CREATE INDEX idx_sites_status ON site_candidates(status);
CREATE INDEX idx_sites_score ON site_candidates(total_score DESC);
CREATE INDEX idx_sites_ranking ON site_candidates(ranking);
CREATE INDEX idx_sites_coords ON site_candidates(latitude, longitude);
CREATE INDEX idx_construction_status ON construction_projects(status);
CREATE INDEX idx_construction_phase ON construction_projects(phase);
CREATE INDEX idx_construction_site ON construction_projects(site_id);
CREATE INDEX idx_construction_lot ON construction_projects(lot_id);
CREATE INDEX idx_construction_completion ON construction_projects(target_completion);
CREATE INDEX idx_design_docs_project ON design_documents(project_id, doc_type);
CREATE INDEX idx_design_docs_current ON design_documents(project_id, is_current);
CREATE INDEX idx_permits_project ON permits(project_id, status);
CREATE INDEX idx_permits_status ON permits(status);
CREATE INDEX idx_permits_expiry ON permits(expiry_date);

-- Triggers
CREATE TRIGGER trg_sites_updated BEFORE UPDATE ON site_candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_construction_updated BEFORE UPDATE ON construction_projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_permits_updated BEFORE UPDATE ON permits FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Site total score auto calc
CREATE OR REPLACE FUNCTION calc_site_total_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_score := COALESCE(NEW.location_score, 0) +
                     COALESCE(NEW.accessibility_score, 0) +
                     COALESCE(NEW.demand_score, 0) +
                     COALESCE(NEW.feasibility_score, 0) +
                     COALESCE(NEW.legal_score, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_site_score
  BEFORE INSERT OR UPDATE OF location_score, accessibility_score, demand_score, feasibility_score, legal_score
  ON site_candidates
  FOR EACH ROW EXECUTE FUNCTION calc_site_total_score();

-- Permit count auto update
CREATE OR REPLACE FUNCTION update_project_permits_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE construction_projects SET
    permits_completed = (
      SELECT COUNT(*) FROM permits
      WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
        AND status IN ('approved', 'conditional_approved')
    ),
    permits_total = (
      SELECT COUNT(*) FROM permits
      WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
    )
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_permit_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON permits
  FOR EACH ROW EXECUTE FUNCTION update_project_permits_count();

-- Design doc version management
CREATE OR REPLACE FUNCTION manage_doc_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE design_documents SET is_current = false
    WHERE project_id = NEW.project_id
      AND doc_type = NEW.doc_type
      AND id != NEW.id
      AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_doc_version
  AFTER INSERT OR UPDATE OF is_current ON design_documents
  FOR EACH ROW
  WHEN (NEW.is_current = true)
  EXECUTE FUNCTION manage_doc_version();

-- RLS
ALTER TABLE site_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_select" ON site_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "site_insert" ON site_candidates FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);
CREATE POLICY "site_update" ON site_candidates FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);
CREATE POLICY "site_delete" ON site_candidates FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

CREATE POLICY "const_select" ON construction_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "const_insert" ON construction_projects FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);
CREATE POLICY "const_update" ON construction_projects FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);
CREATE POLICY "const_delete" ON construction_projects FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

CREATE POLICY "design_select" ON design_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "design_insert" ON design_documents FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);
CREATE POLICY "design_update" ON design_documents FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);
CREATE POLICY "design_delete" ON design_documents FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

CREATE POLICY "permit_select" ON permits FOR SELECT TO authenticated USING (true);
CREATE POLICY "permit_insert" ON permits FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);
CREATE POLICY "permit_update" ON permits FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager','editor'))
);
CREATE POLICY "permit_delete" ON permits FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);
