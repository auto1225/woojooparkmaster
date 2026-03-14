
-- Fix security definer views
CREATE OR REPLACE VIEW complaint_stats_monthly WITH (security_invoker = true) AS
SELECT
  DATE_TRUNC('month', received_at)::date AS month,
  category,
  COUNT(*) AS total_count,
  COUNT(CASE WHEN status = 'closed' THEN 1 END) AS closed_count,
  COUNT(CASE WHEN status NOT IN ('closed','responded') THEN 1 END) AS open_count,
  COUNT(CASE WHEN is_overdue THEN 1 END) AS overdue_count,
  ROUND(AVG(CASE WHEN closed_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (closed_at - received_at)) / 86400 END)::numeric, 1
  ) AS avg_resolution_days,
  ROUND(AVG(satisfaction_score)::numeric, 1) AS avg_satisfaction
FROM complaints
GROUP BY DATE_TRUNC('month', received_at), category;

CREATE OR REPLACE VIEW complaint_hotspot WITH (security_invoker = true) AS
SELECT
  c.lot_id,
  pl.name AS lot_name,
  pl.code AS lot_code,
  COUNT(*) AS total_complaints,
  COUNT(CASE WHEN c.received_at > now() - INTERVAL '30 days' THEN 1 END) AS last_30_days,
  COUNT(CASE WHEN c.received_at > now() - INTERVAL '90 days' THEN 1 END) AS last_90_days,
  COUNT(CASE WHEN c.is_repeat THEN 1 END) AS repeat_count,
  MODE() WITHIN GROUP (ORDER BY c.category) AS top_category
FROM complaints c
JOIN parking_lots pl ON pl.id = c.lot_id
WHERE c.lot_id IS NOT NULL
GROUP BY c.lot_id, pl.name, pl.code
ORDER BY total_complaints DESC;

CREATE OR REPLACE VIEW complaint_staff_performance WITH (security_invoker = true) AS
SELECT
  p.id AS staff_id,
  p.name AS staff_name,
  p.team,
  COUNT(c.id) AS assigned_count,
  COUNT(CASE WHEN c.status = 'closed' THEN 1 END) AS closed_count,
  COUNT(CASE WHEN c.status NOT IN ('closed','responded') THEN 1 END) AS open_count,
  COUNT(CASE WHEN c.is_overdue THEN 1 END) AS overdue_count,
  ROUND(AVG(CASE WHEN c.closed_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (c.closed_at - c.received_at)) / 86400 END)::numeric, 1
  ) AS avg_resolution_days,
  ROUND(AVG(c.satisfaction_score)::numeric, 1) AS avg_satisfaction
FROM profiles p
LEFT JOIN complaints c ON c.assigned_to = p.id
WHERE p.is_active = true
GROUP BY p.id, p.name, p.team;

-- Fix function search paths
CREATE OR REPLACE FUNCTION set_complaint_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.due_days IS NULL THEN
    NEW.due_days := CASE NEW.priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 3
      WHEN 'normal' THEN 7
      WHEN 'low' THEN 14
      ELSE 7
    END;
  END IF;
  IF NEW.due_date IS NULL THEN
    NEW.due_date := CURRENT_DATE + NEW.due_days;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION check_complaint_overdue()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.due_date IS NOT NULL AND CURRENT_DATE > NEW.due_date
    AND NEW.status NOT IN ('closed', 'responded') THEN
    NEW.is_overdue := true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION log_complaint_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO complaint_comments (complaint_id, author_id, author_name, content, comment_type, status_from, status_to, is_system)
    VALUES (
      NEW.id,
      COALESCE(auth.uid(), NEW.assigned_to, NEW.created_by),
      COALESCE(
        (SELECT name FROM profiles WHERE id = auth.uid()),
        '시스템'
      ),
      '상태 변경: ' ||
        COALESCE((SELECT name_ko FROM code_master WHERE group_code='complaint_status' AND code=OLD.status), OLD.status) || ' → ' ||
        COALESCE((SELECT name_ko FROM code_master WHERE group_code='complaint_status' AND code=NEW.status), NEW.status),
      'status_change',
      OLD.status,
      NEW.status,
      true
    );
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
