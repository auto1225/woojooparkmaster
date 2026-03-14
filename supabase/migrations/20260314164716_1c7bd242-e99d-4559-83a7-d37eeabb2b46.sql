
-- surveys (조사 마스터)
CREATE TABLE surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  survey_type VARCHAR(30) NOT NULL DEFAULT 'initial',
  status survey_status_enum NOT NULL DEFAULT 'draft',
  surveyor_id UUID REFERENCES profiles(id),
  reviewer_id UUID REFERENCES profiles(id),
  approver_id UUID REFERENCES profiles(id),
  survey_date DATE,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  reject_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE surveys IS '현황조사 마스터 - 과업지시서 점검표 기반';

-- survey_basic_info (기본현황)
CREATE TABLE survey_basic_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID UNIQUE NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  lot_name VARCHAR(200),
  address VARCHAR(300),
  lot_type VARCHAR(30),
  lot_type_floor INTEGER,
  operator_type VARCHAR(30),
  total_spaces INTEGER,
  disabled_spaces INTEGER DEFAULT 0,
  ev_spaces INTEGER DEFAULT 0,
  compact_spaces INTEGER DEFAULT 0,
  pregnant_spaces INTEGER DEFAULT 0,
  other_spaces INTEGER DEFAULT 0,
  other_spaces_desc VARCHAR(100),
  entry_count INTEGER,
  exit_count INTEGER,
  entry_exit_same BOOLEAN DEFAULT false,
  surface_type VARCHAR(30),
  surface_type_etc VARCHAR(100),
  gps_lat DECIMAL(10,7),
  gps_lng DECIMAL(10,7)
);

-- survey_operation (운영현황)
CREATE TABLE survey_operation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID UNIQUE NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  operating_hours VARCHAR(100),
  operating_hours_custom VARCHAR(200),
  payment_cash BOOLEAN DEFAULT false,
  payment_card BOOLEAN DEFAULT false,
  payment_mobile BOOLEAN DEFAULT false,
  payment_none BOOLEAN DEFAULT false,
  staff_type VARCHAR(20),
  staff_count INTEGER,
  management_type VARCHAR(30),
  management_etc VARCHAR(200),
  control_linked BOOLEAN DEFAULT false,
  portal_linked BOOLEAN DEFAULT false
);

-- survey_infra (인프라현황)
CREATE TABLE survey_infra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID UNIQUE NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  power_status VARCHAR(20),
  power_note VARCHAR(200),
  network_wired BOOLEAN DEFAULT false,
  network_wifi BOOLEAN DEFAULT false,
  network_lte BOOLEAN DEFAULT false,
  network_etc VARCHAR(100),
  display_installed BOOLEAN DEFAULT false,
  display_in_use BOOLEAN DEFAULT false,
  display_company VARCHAR(100),
  display_not_use_reason VARCHAR(200),
  display_network VARCHAR(30),
  display_sw_status VARCHAR(30),
  display_sw_note VARCHAR(200),
  sensor_installed BOOLEAN DEFAULT false,
  sensor_count INTEGER DEFAULT 0,
  sensor_in_use BOOLEAN DEFAULT false,
  sensor_company VARCHAR(100),
  has_barrier BOOLEAN DEFAULT false,
  has_lpr BOOLEAN DEFAULT false,
  has_kiosk BOOLEAN DEFAULT false,
  has_cctv BOOLEAN DEFAULT false,
  equipment_company VARCHAR(200)
);

-- survey_usage (이용현황)
CREATE TABLE survey_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID UNIQUE NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  avg_usage_rate VARCHAR(20),
  peak_morning BOOLEAN DEFAULT false,
  peak_afternoon BOOLEAN DEFAULT false,
  peak_night BOOLEAN DEFAULT false,
  peak_free_time BOOLEAN DEFAULT false,
  user_residents BOOLEAN DEFAULT false,
  user_commercial BOOLEAN DEFAULT false,
  user_tourists BOOLEAN DEFAULT false,
  user_etc VARCHAR(100)
);

-- survey_sensor_plan (센서설치 예상)
CREATE TABLE survey_sensor_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID UNIQUE NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  planned_sensors INTEGER DEFAULT 0,
  planned_gateways INTEGER DEFAULT 0,
  gateway_location TEXT,
  display_sw_feasibility VARCHAR(30),
  display_sw_note VARCHAR(200),
  portal_feasibility VARCHAR(20),
  portal_note VARCHAR(200)
);

-- survey_photos (사진대장)
CREATE TABLE survey_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  category VARCHAR(30) NOT NULL,
  file_path TEXT NOT NULL,
  thumbnail_path TEXT,
  caption VARCHAR(200),
  sort_order INTEGER DEFAULT 0,
  taken_at TIMESTAMPTZ,
  gps_lat DECIMAL(10,7),
  gps_lng DECIMAL(10,7),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_surveys_lot ON surveys(lot_id);
CREATE INDEX idx_surveys_status ON surveys(status);
CREATE INDEX idx_surveys_surveyor ON surveys(surveyor_id);
CREATE INDEX idx_surveys_date ON surveys(survey_date DESC);
CREATE INDEX idx_survey_photos_survey ON survey_photos(survey_id, category);

-- Trigger
CREATE TRIGGER trg_surveys_updated BEFORE UPDATE ON surveys FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_basic_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_operation ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_infra ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_sensor_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_photos ENABLE ROW LEVEL SECURITY;

-- surveys RLS policies
CREATE POLICY "survey_select" ON surveys FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='SURVEY' AND is_active=true)
);
CREATE POLICY "survey_insert" ON surveys FOR INSERT WITH CHECK (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY "survey_update" ON surveys FOR UPDATE USING (
  surveyor_id = auth.uid()
  OR get_user_role(auth.uid()) IN ('admin','manager')
);
CREATE POLICY "survey_delete" ON surveys FOR DELETE USING (
  get_user_role(auth.uid()) = 'admin'
);

-- Sub-table RLS (access through surveys)
CREATE POLICY "sbi_all" ON survey_basic_info FOR ALL USING (
  EXISTS (SELECT 1 FROM surveys s WHERE s.id=survey_id AND (
    s.surveyor_id=auth.uid() OR get_user_role(auth.uid()) IN ('admin','manager')
  ))
);
CREATE POLICY "sbi_select" ON survey_basic_info FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "sop_all" ON survey_operation FOR ALL USING (
  EXISTS (SELECT 1 FROM surveys s WHERE s.id=survey_id AND (
    s.surveyor_id=auth.uid() OR get_user_role(auth.uid()) IN ('admin','manager')
  ))
);
CREATE POLICY "sop_select" ON survey_operation FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "sin_all" ON survey_infra FOR ALL USING (
  EXISTS (SELECT 1 FROM surveys s WHERE s.id=survey_id AND (
    s.surveyor_id=auth.uid() OR get_user_role(auth.uid()) IN ('admin','manager')
  ))
);
CREATE POLICY "sin_select" ON survey_infra FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "sus_all" ON survey_usage FOR ALL USING (
  EXISTS (SELECT 1 FROM surveys s WHERE s.id=survey_id AND (
    s.surveyor_id=auth.uid() OR get_user_role(auth.uid()) IN ('admin','manager')
  ))
);
CREATE POLICY "sus_select" ON survey_usage FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ssp_all" ON survey_sensor_plan FOR ALL USING (
  EXISTS (SELECT 1 FROM surveys s WHERE s.id=survey_id AND (
    s.surveyor_id=auth.uid() OR get_user_role(auth.uid()) IN ('admin','manager')
  ))
);
CREATE POLICY "ssp_select" ON survey_sensor_plan FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "sph_all" ON survey_photos FOR ALL USING (
  EXISTS (SELECT 1 FROM surveys s WHERE s.id=survey_id AND (
    s.surveyor_id=auth.uid() OR get_user_role(auth.uid()) IN ('admin','manager')
  ))
);
CREATE POLICY "sph_select" ON survey_photos FOR SELECT USING (auth.uid() IS NOT NULL);
