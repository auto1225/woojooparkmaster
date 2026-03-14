
-- Fix security definer views
CREATE OR REPLACE VIEW site_evaluation_summary WITH (security_invoker = true) AS
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

CREATE OR REPLACE VIEW construction_dashboard WITH (security_invoker = true) AS
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

-- Fix function search_path
CREATE OR REPLACE FUNCTION calc_site_total_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.total_score := COALESCE(NEW.location_score, 0) +
                     COALESCE(NEW.accessibility_score, 0) +
                     COALESCE(NEW.demand_score, 0) +
                     COALESCE(NEW.feasibility_score, 0) +
                     COALESCE(NEW.legal_score, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_project_permits_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION manage_doc_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
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
$$;
