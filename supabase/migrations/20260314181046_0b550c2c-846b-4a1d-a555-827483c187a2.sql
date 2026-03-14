
-- 9-1. complaints (민원 접수/처리)
CREATE TABLE complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES parking_lots(id),
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
  assigned_to UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ,
  response TEXT,
  response_type VARCHAR(30),
  responded_at TIMESTAMPTZ,
  response_channel VARCHAR(20),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES profiles(id),
  resolution_type VARCHAR(30),
  satisfaction_score INTEGER,
  satisfaction_feedback TEXT,
  satisfaction_date DATE,
  saeol_ref VARCHAR(50),
  saeol_status VARCHAR(20),
  external_ref VARCHAR(100),
  is_repeat BOOLEAN DEFAULT false,
  related_complaint_id UUID REFERENCES complaints(id),
  repeat_count INTEGER DEFAULT 0,
  attachment_paths JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'received',
  status_changed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9-2. complaint_comments
CREATE TABLE complaint_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  author_name VARCHAR(100),
  content TEXT NOT NULL,
  comment_type VARCHAR(20) DEFAULT 'internal',
  status_from VARCHAR(20),
  status_to VARCHAR(20),
  attachment_path TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Views
CREATE OR REPLACE VIEW complaint_stats_monthly AS
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

CREATE OR REPLACE VIEW complaint_hotspot AS
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

CREATE OR REPLACE VIEW complaint_staff_performance AS
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

-- Indexes
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_lot ON complaints(lot_id);
CREATE INDEX idx_complaints_category ON complaints(category);
CREATE INDEX idx_complaints_priority ON complaints(priority, status);
CREATE INDEX idx_complaints_assigned ON complaints(assigned_to, status);
CREATE INDEX idx_complaints_received ON complaints(received_at DESC);
CREATE INDEX idx_complaints_due ON complaints(due_date, is_overdue);
CREATE INDEX idx_complaints_saeol ON complaints(saeol_ref);
CREATE INDEX idx_complaints_vehicle ON complaints(vehicle_number);
CREATE INDEX idx_complaints_repeat ON complaints(related_complaint_id);
CREATE INDEX idx_comments_complaint ON complaint_comments(complaint_id, created_at DESC);

-- Triggers
CREATE TRIGGER trg_complaints_updated BEFORE UPDATE ON complaints FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_complaint_due_date()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_complaint_due_date
  BEFORE INSERT ON complaints
  FOR EACH ROW EXECUTE FUNCTION set_complaint_due_date();

CREATE OR REPLACE FUNCTION check_complaint_overdue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.due_date IS NOT NULL AND CURRENT_DATE > NEW.due_date
    AND NEW.status NOT IN ('closed', 'responded') THEN
    NEW.is_overdue := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_complaint_overdue
  BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION check_complaint_overdue();

CREATE OR REPLACE FUNCTION log_complaint_status_change()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_complaint_status_log
  BEFORE UPDATE OF status ON complaints
  FOR EACH ROW EXECUTE FUNCTION log_complaint_status_change();

-- RLS
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_select" ON complaints FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='COMPLAINT' AND is_active=true)
);
CREATE POLICY "comp_insert" ON complaints FOR INSERT WITH CHECK (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY "comp_update" ON complaints FOR UPDATE USING (
  assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR get_user_role(auth.uid()) IN ('admin','manager')
);
CREATE POLICY "comp_delete" ON complaints FOR DELETE USING (
  get_user_role(auth.uid()) = 'admin'
);

CREATE POLICY "cc_select" ON complaint_comments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cc_insert" ON complaint_comments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
