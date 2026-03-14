
-- Fix function search paths
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
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

-- Fix security definer views by recreating with security_invoker
DROP VIEW IF EXISTS service_payment_summary;
DROP VIEW IF EXISTS service_issue_summary;

CREATE VIEW service_payment_summary WITH (security_invoker = true) AS
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

CREATE VIEW service_issue_summary WITH (security_invoker = true) AS
SELECT
  project_id,
  COUNT(*) AS total_issues,
  COUNT(CASE WHEN status IN ('open','in_progress','pending_approval') THEN 1 END) AS open_issues,
  COUNT(CASE WHEN severity = 'critical' AND status NOT IN ('resolved','closed') THEN 1 END) AS critical_open,
  SUM(impact_amount) AS total_impact_amount,
  SUM(impact_days) AS total_impact_days
FROM service_issues
GROUP BY project_id;
