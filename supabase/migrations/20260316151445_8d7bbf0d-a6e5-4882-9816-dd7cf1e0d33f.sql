
-- API 키 관리 테이블
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name VARCHAR(200) NOT NULL,
  api_key VARCHAR(100) NOT NULL UNIQUE,
  key_prefix VARCHAR(20) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  rate_limit_per_minute INT DEFAULT 60,
  allowed_endpoints TEXT[] DEFAULT '{}',
  allowed_ips TEXT[],
  total_calls BIGINT DEFAULT 0,
  monthly_calls INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

-- API 호출 로그 테이블
CREATE TABLE public.api_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  endpoint VARCHAR(200) NOT NULL,
  method VARCHAR(10) NOT NULL DEFAULT 'GET',
  status_code INT,
  response_time_ms INT,
  ip_address VARCHAR(50),
  user_agent TEXT,
  called_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 정책
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_call_logs ENABLE ROW LEVEL SECURITY;

-- admin/manager만 API 키 관리 가능
CREATE POLICY "admin_manager_api_keys_select" ON public.api_keys
  FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "admin_manager_api_keys_insert" ON public.api_keys
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "admin_manager_api_keys_update" ON public.api_keys
  FOR UPDATE TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "admin_manager_api_keys_delete" ON public.api_keys
  FOR DELETE TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- 호출 로그는 admin/manager 조회 가능
CREATE POLICY "admin_manager_api_logs_select" ON public.api_call_logs
  FOR SELECT TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "api_logs_insert_all" ON public.api_call_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 인덱스
CREATE INDEX idx_api_keys_status ON public.api_keys(status);
CREATE INDEX idx_api_call_logs_key_id ON public.api_call_logs(api_key_id);
CREATE INDEX idx_api_call_logs_called_at ON public.api_call_logs(called_at);

-- updated_at 트리거
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
