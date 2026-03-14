
-- SEC-C-7: 개인정보보호 관련 system_config 추가
INSERT INTO system_config (config_key, config_value, description) VALUES
  ('privacy_policy_version', '1.0', '개인정보 처리방침 버전'),
  ('privacy_policy_date', '2025-09-01', '시행일'),
  ('privacy_manager_name', '', '개인정보 보호책임자 이름'),
  ('privacy_manager_dept', '', '개인정보 보호책임자 부서'),
  ('privacy_manager_phone', '', '개인정보 보호책임자 연락처'),
  ('privacy_manager_email', '', '개인정보 보호책임자 이메일')
ON CONFLICT (config_key) DO NOTHING;

-- SEC-C-8: 비상 연락망 system_config 추가
INSERT INTO system_config (config_key, config_value, description) VALUES
  ('emergency_contact_security', '', '정보보안담당관 연락처'),
  ('emergency_contact_privacy', '', '개인정보보호책임자 연락처'),
  ('emergency_contact_system', '', '시스템 관리자 연락처'),
  ('emergency_contact_vendor', '', '유지보수 업체 연락처')
ON CONFLICT (config_key) DO NOTHING;

-- SEC-C-5: 보안 교육 이력 테이블
CREATE TABLE IF NOT EXISTS security_training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  training_type VARCHAR(50) NOT NULL,
  training_title VARCHAR(200) NOT NULL,
  training_date DATE NOT NULL,
  duration_hours DECIMAL(4,1),
  provider VARCHAR(200),
  certificate_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE security_training_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view training logs"
  ON security_training_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage training logs"
  ON security_training_logs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- SEC-C-7: 개인정보 파기 대장 테이블
CREATE TABLE IF NOT EXISTS pii_purge_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table VARCHAR(50) NOT NULL,
  target_count INTEGER NOT NULL,
  purge_reason VARCHAR(100) NOT NULL,
  purge_method VARCHAR(50) NOT NULL DEFAULT 'null_replace',
  executed_by UUID REFERENCES profiles(id),
  executed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pii_purge_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view purge logs"
  ON pii_purge_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can insert purge logs"
  ON pii_purge_logs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- SEC-C-7: 민원 테이블에 개인정보 동의일시 컬럼 추가
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS privacy_agreed_at TIMESTAMPTZ;

-- SEC-C-3: profiles에 비밀번호 변경일시 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
