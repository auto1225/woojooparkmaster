
-- ─── 1. 보안 감사 로그 테이블 ───
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'info',
  user_id UUID REFERENCES profiles(id),
  user_name VARCHAR(100),
  user_role VARCHAR(20),
  user_team VARCHAR(20),
  ip_address VARCHAR(45),
  user_agent TEXT,
  resource_type VARCHAR(50),
  resource_id UUID,
  resource_name VARCHAR(200),
  action_detail JSONB,
  before_value JSONB,
  after_value JSONB,
  success BOOLEAN DEFAULT true,
  failure_reason TEXT,
  session_id VARCHAR(100),
  request_path VARCHAR(300),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_type ON security_audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_user ON security_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_severity ON security_audit_logs(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_date ON security_audit_logs(created_at DESC);

ALTER TABLE security_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select_admin" ON security_audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "audit_insert_all" ON security_audit_logs FOR INSERT WITH CHECK (true);

-- ─── 2. IP 화이트리스트 ───
CREATE TABLE IF NOT EXISTS ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address VARCHAR(45) NOT NULL,
  ip_range VARCHAR(20),
  description VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ip_whitelist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ip_admin_all" ON ip_whitelist FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ─── 3. 활성 세션 테이블 ───
CREATE TABLE IF NOT EXISTS active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_token VARCHAR(200) UNIQUE NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_info JSONB,
  started_at TIMESTAMPTZ DEFAULT now(),
  last_activity TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON active_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON active_sessions(expires_at);

ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_own_select" ON active_sessions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "session_admin_all" ON active_sessions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "session_insert_auth" ON active_sessions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "session_update_own" ON active_sessions FOR UPDATE USING (user_id = auth.uid());

-- ─── 4. PII 접근 로그 ───
CREATE TABLE IF NOT EXISTS pii_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  user_name VARCHAR(100),
  access_type VARCHAR(30) NOT NULL,
  target_table VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  target_field VARCHAR(50) NOT NULL,
  reason VARCHAR(200),
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pii_user ON pii_access_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pii_target ON pii_access_logs(target_table, target_id);

ALTER TABLE pii_access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pii_admin_select" ON pii_access_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "pii_insert_auth" ON pii_access_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ─── 5. profiles 보안 컬럼 추가 ───
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allowed_ips TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS security_settings JSONB DEFAULT '{}';

-- ─── 6. 보안 설정 system_config 추가 ───
INSERT INTO system_config (config_key, config_value, description) VALUES
  ('security_password_min_length', '8', '비밀번호 최소 길이'),
  ('security_password_require_upper', 'true', '대문자 필수'),
  ('security_password_require_lower', 'true', '소문자 필수'),
  ('security_password_require_number', 'true', '숫자 필수'),
  ('security_password_require_special', 'true', '특수문자 필수'),
  ('security_password_expiry_days', '90', '비밀번호 유효기간'),
  ('security_max_login_attempts', '5', '최대 로그인 실패 횟수'),
  ('security_lockout_minutes', '5', '계정 잠금 시간'),
  ('security_session_timeout_minutes', '30', '세션 타임아웃'),
  ('security_max_concurrent_sessions', '3', '최대 동시 세션'),
  ('security_ip_whitelist_enabled', 'false', 'IP 화이트리스트'),
  ('security_2fa_enabled', 'false', '2단계 인증'),
  ('security_pii_masking_enabled', 'true', '개인정보 마스킹'),
  ('security_audit_retention_days', '365', '감사 로그 보관기간'),
  ('security_data_encryption_enabled', 'true', '데이터 암호화'),
  ('security_export_requires_approval', 'false', '내보내기 승인 필요')
ON CONFLICT (config_key) DO NOTHING;

-- ─── 7. 데이터 변경 추적 트리거 ───
CREATE OR REPLACE FUNCTION log_data_change()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id UUID;
  current_user_name TEXT;
BEGIN
  current_user_id := auth.uid();
  SELECT name INTO current_user_name FROM profiles WHERE id = current_user_id;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO security_audit_logs (event_type, severity, user_id, user_name, resource_type, resource_id, before_value, action_detail)
    VALUES ('data_delete', 'warning', current_user_id, current_user_name, TG_TABLE_NAME, OLD.id, to_jsonb(OLD),
      jsonb_build_object('table', TG_TABLE_NAME, 'operation', 'DELETE'));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO security_audit_logs (event_type, severity, user_id, user_name, resource_type, resource_id, before_value, after_value, action_detail)
    VALUES ('data_update', 'info', current_user_id, current_user_name, TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW),
      jsonb_build_object('table', TG_TABLE_NAME, 'operation', 'UPDATE'));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 주요 테이블에 변경 추적 트리거
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_parking_lots') THEN
    CREATE TRIGGER audit_parking_lots AFTER UPDATE OR DELETE ON parking_lots FOR EACH ROW EXECUTE FUNCTION log_data_change();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_profiles') THEN
    CREATE TRIGGER audit_profiles AFTER UPDATE OR DELETE ON profiles FOR EACH ROW EXECUTE FUNCTION log_data_change();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_system_config') THEN
    CREATE TRIGGER audit_system_config AFTER UPDATE OR DELETE ON system_config FOR EACH ROW EXECUTE FUNCTION log_data_change();
  END IF;
END $$;

-- Realtime for active_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_sessions;
