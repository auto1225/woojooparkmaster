
-- 4-1. equipment (시설물 대장)
CREATE TABLE equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  equipment_code VARCHAR(30) UNIQUE NOT NULL,
  equipment_type VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  model VARCHAR(200),
  manufacturer VARCHAR(200),
  serial_number VARCHAR(100),
  specification JSONB,
  install_date DATE,
  warranty_start DATE,
  warranty_end DATE,
  useful_life_years INTEGER,
  replacement_due DATE,
  purchase_cost BIGINT,
  current_value BIGINT,
  depreciation_method VARCHAR(20) DEFAULT 'straight_line',
  location_detail VARCHAR(200),
  floor INTEGER,
  quantity INTEGER DEFAULT 1,
  power_consumption VARCHAR(50),
  network_required BOOLEAN DEFAULT false,
  ip_address VARCHAR(45),
  firmware_version VARCHAR(50),
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  total_maintenance_cost BIGINT DEFAULT 0,
  maintenance_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'normal',
  status_changed_at TIMESTAMPTZ,
  photo_path TEXT,
  manual_path TEXT,
  notes TEXT,
  registered_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4-2. maintenance_schedules (정기점검 스케줄)
CREATE TABLE maintenance_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
  schedule_name VARCHAR(200) NOT NULL,
  schedule_type VARCHAR(20) NOT NULL,
  description TEXT,
  checklist JSONB,
  assigned_team team_type,
  assigned_to UUID REFERENCES profiles(id),
  vendor_name VARCHAR(200),
  estimated_cost BIGINT,
  estimated_hours DECIMAL(4,1),
  last_completed DATE,
  next_due_date DATE NOT NULL,
  recurrence_rule JSONB,
  advance_notice_days INTEGER DEFAULT 7,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4-3. maintenance_logs (유지보수 이력)
CREATE TABLE maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_number VARCHAR(30) UNIQUE NOT NULL,
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
  maintenance_type VARCHAR(30) NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  title VARCHAR(200) NOT NULL,
  description TEXT,
  symptom TEXT,
  cause TEXT,
  resolution TEXT,
  reported_by UUID REFERENCES profiles(id),
  reported_at TIMESTAMPTZ DEFAULT now(),
  assigned_to UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ,
  vendor_name VARCHAR(200),
  vendor_contact VARCHAR(100),
  parts_used JSONB,
  labor_hours DECIMAL(6,1),
  parts_cost BIGINT DEFAULT 0,
  labor_cost BIGINT DEFAULT 0,
  other_cost BIGINT DEFAULT 0,
  total_cost BIGINT GENERATED ALWAYS AS (parts_cost + labor_cost + other_cost) STORED,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  downtime_hours DECIMAL(6,1),
  before_photo TEXT,
  after_photo TEXT,
  checklist_results JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'reported',
  closed_by UUID REFERENCES profiles(id),
  closed_at TIMESTAMPTZ,
  satisfaction_score INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4-4. safety_inspections (안전점검)
CREATE TABLE safety_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_number VARCHAR(30) UNIQUE NOT NULL,
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  inspection_type VARCHAR(30) NOT NULL,
  inspection_date DATE NOT NULL,
  inspector_id UUID REFERENCES profiles(id),
  inspector_name VARCHAR(100),
  inspector_org VARCHAR(200),
  checklist_template VARCHAR(50),
  checklist_results JSONB NOT NULL,
  total_items INTEGER DEFAULT 0,
  pass_items INTEGER DEFAULT 0,
  fail_items INTEGER DEFAULT 0,
  na_items INTEGER DEFAULT 0,
  overall_grade VARCHAR(5),
  issues_found TEXT,
  corrective_actions TEXT,
  correction_deadline DATE,
  correction_completed DATE,
  correction_verified_by UUID REFERENCES profiles(id),
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  status VARCHAR(20) DEFAULT 'completed',
  photo_paths JSONB,
  report_path TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4-5. surface_markings (노면표시/안내표지판)
CREATE TABLE surface_markings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  marking_type VARCHAR(30) NOT NULL,
  marking_name VARCHAR(100) NOT NULL,
  location_detail VARCHAR(200),
  floor INTEGER,
  quantity INTEGER DEFAULT 1,
  material VARCHAR(50),
  color VARCHAR(50),
  dimension VARCHAR(100),
  condition VARCHAR(20) DEFAULT 'good',
  condition_note VARCHAR(200),
  install_date DATE,
  last_repainted DATE,
  next_due DATE,
  repaint_cycle_months INTEGER,
  estimated_cost BIGINT,
  photo_path TEXT,
  is_regulatory BOOLEAN DEFAULT false,
  regulation_ref VARCHAR(200),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_equipment_lot ON equipment(lot_id, equipment_type);
CREATE INDEX idx_equipment_status ON equipment(status);
CREATE INDEX idx_equipment_warranty ON equipment(warranty_end);
CREATE INDEX idx_equipment_replacement ON equipment(replacement_due);
CREATE INDEX idx_maint_schedule_lot ON maintenance_schedules(lot_id, is_active);
CREATE INDEX idx_maint_schedule_due ON maintenance_schedules(next_due_date);
CREATE INDEX idx_maint_logs_lot ON maintenance_logs(lot_id, status);
CREATE INDEX idx_maint_logs_equipment ON maintenance_logs(equipment_id);
CREATE INDEX idx_maint_logs_status ON maintenance_logs(status, priority);
CREATE INDEX idx_maint_logs_date ON maintenance_logs(reported_at DESC);
CREATE INDEX idx_safety_lot ON safety_inspections(lot_id, inspection_date DESC);
CREATE INDEX idx_safety_status ON safety_inspections(status);
CREATE INDEX idx_safety_followup ON safety_inspections(follow_up_required, follow_up_date);
CREATE INDEX idx_markings_lot ON surface_markings(lot_id, marking_type);
CREATE INDEX idx_markings_condition ON surface_markings(condition);
CREATE INDEX idx_markings_due ON surface_markings(next_due);

-- Triggers
CREATE TRIGGER trg_equipment_updated BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_maint_schedule_updated BEFORE UPDATE ON maintenance_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_maint_logs_updated BEFORE UPDATE ON maintenance_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_safety_updated BEFORE UPDATE ON safety_inspections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_markings_updated BEFORE UPDATE ON surface_markings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 유지보수 완료 시 장비 상태 & 비용 자동 갱신
CREATE OR REPLACE FUNCTION update_equipment_on_maintenance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.equipment_id IS NOT NULL THEN
    UPDATE equipment SET
      status = 'normal',
      status_changed_at = now(),
      last_maintenance_date = COALESCE(NEW.completed_at::date, CURRENT_DATE),
      total_maintenance_cost = total_maintenance_cost + COALESCE(NEW.parts_cost,0) + COALESCE(NEW.labor_cost,0) + COALESCE(NEW.other_cost,0),
      maintenance_count = maintenance_count + 1
    WHERE id = NEW.equipment_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_maintenance_completed
  AFTER UPDATE OF status ON maintenance_logs
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
  EXECUTE FUNCTION update_equipment_on_maintenance();

-- RLS
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE surface_markings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equip_select" ON equipment FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='FACILITY' AND is_active=true)
);
CREATE POLICY "equip_modify" ON equipment FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);

CREATE POLICY "maint_sched_select" ON maintenance_schedules FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='FACILITY' AND is_active=true)
);
CREATE POLICY "maint_sched_modify" ON maintenance_schedules FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);

CREATE POLICY "maint_log_select" ON maintenance_logs FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='FACILITY' AND is_active=true)
);
CREATE POLICY "maint_log_insert" ON maintenance_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "maint_log_update" ON maintenance_logs FOR UPDATE USING (
  reported_by = auth.uid()
  OR assigned_to = auth.uid()
  OR get_user_role(auth.uid()) IN ('admin','manager')
);

CREATE POLICY "safety_select" ON safety_inspections FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='FACILITY' AND is_active=true)
);
CREATE POLICY "safety_modify" ON safety_inspections FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);

CREATE POLICY "marking_select" ON surface_markings FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='FACILITY' AND is_active=true)
);
CREATE POLICY "marking_modify" ON surface_markings FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);

-- 초기 데이터: 공통코드
INSERT INTO code_master (group_code, code, name_ko, sort_order) VALUES
  ('equipment_type', 'barrier', '차단기', 1),
  ('equipment_type', 'lpr', 'LPR(차량번호인식)', 2),
  ('equipment_type', 'kiosk', '무인정산기', 3),
  ('equipment_type', 'cctv', 'CCTV', 4),
  ('equipment_type', 'display_board', '안내전광판', 5),
  ('equipment_type', 'sensor', '주차면센서', 6),
  ('equipment_type', 'gateway', '게이트웨이', 7),
  ('equipment_type', 'lighting', '조명', 8),
  ('equipment_type', 'ev_charger', '전기차충전기', 9),
  ('equipment_type', 'fire_extinguisher', '소화기', 10),
  ('equipment_type', 'intercom', '인터폰', 11),
  ('equipment_type', 'booth', '관제부스', 12),
  ('equipment_type', 'bollard', '볼라드', 13),
  ('equipment_type', 'speed_bump', '과속방지턱', 14),
  ('equipment_type', 'other', '기타', 99),
  ('marking_type', 'parking_line', '주차선', 1),
  ('marking_type', 'arrow', '화살표/방향 표시', 2),
  ('marking_type', 'number', '번호 표시', 3),
  ('marking_type', 'disabled_sign', '장애인 표시', 4),
  ('marking_type', 'ev_sign', '전기차 표시', 5),
  ('marking_type', 'entrance_sign', '입구 안내판', 6),
  ('marking_type', 'exit_sign', '출구 안내판', 7),
  ('marking_type', 'speed_limit', '속도제한 표시', 8),
  ('marking_type', 'height_limit', '높이제한 표시', 9),
  ('marking_type', 'fire_lane', '소방통로 표시', 10),
  ('marking_type', 'info_board', '종합안내판', 11),
  ('marking_type', 'other', '기타', 99),
  ('maintenance_type', 'scheduled', '정기점검', 1),
  ('maintenance_type', 'emergency', '긴급수리', 2),
  ('maintenance_type', 'repair', '일반수리', 3),
  ('maintenance_type', 'replacement', '교체', 4),
  ('maintenance_type', 'inspection', '안전점검', 5),
  ('maintenance_type', 'cleaning', '청소', 6),
  ('maintenance_type', 'painting', '도색/노면시공', 7);
