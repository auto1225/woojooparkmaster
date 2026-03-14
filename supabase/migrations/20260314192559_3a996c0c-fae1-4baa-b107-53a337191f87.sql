
-- P4-1: AI config entries
INSERT INTO system_config (config_key, config_value, description) VALUES
  ('ai_enabled', 'false', 'AI 기능 활성화 여부'),
  ('ai_provider', 'lovable', 'AI 제공자')
ON CONFLICT (config_key) DO NOTHING;

-- P4-4: Message logs table
CREATE TABLE IF NOT EXISTS message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type VARCHAR(20) NOT NULL DEFAULT 'notification',
  channel VARCHAR(20) NOT NULL,
  recipient_name VARCHAR(100),
  recipient_phone VARCHAR(20) NOT NULL,
  recipient_email VARCHAR(255),
  template_code VARCHAR(50),
  title VARCHAR(200),
  content TEXT NOT NULL,
  variables JSONB,
  module VARCHAR(50),
  ref_id UUID,
  ref_type VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msg_status ON message_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_channel ON message_logs(channel, status);
CREATE INDEX IF NOT EXISTS idx_msg_ref ON message_logs(module, ref_id);

ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg_select" ON message_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "msg_insert" ON message_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- P4-4: Message config entries
INSERT INTO system_config (config_key, config_value, description) VALUES
  ('alimtalk_enabled', 'false', '카카오 알림톡 활성화'),
  ('sms_enabled', 'false', 'SMS 발송 활성화'),
  ('sms_provider', 'nhn_cloud', 'SMS 제공사')
ON CONFLICT (config_key) DO NOTHING;

-- P4-6: Layout data column
ALTER TABLE parking_lots ADD COLUMN IF NOT EXISTS layout_data JSONB;

-- P4-7: Approval system tables
CREATE TABLE IF NOT EXISTS approval_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_name VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  steps JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id UUID NOT NULL REFERENCES approval_lines(id),
  module VARCHAR(50) NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  ref_id UUID NOT NULL,
  ref_number VARCHAR(50),
  title VARCHAR(200) NOT NULL,
  current_step INTEGER DEFAULT 1,
  total_steps INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'in_progress',
  initiated_by UUID NOT NULL REFERENCES profiles(id),
  initiated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES approval_records(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_label VARCHAR(50) NOT NULL,
  approver_id UUID REFERENCES profiles(id),
  approver_name VARCHAR(100),
  action VARCHAR(20) DEFAULT 'pending',
  comment TEXT,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE approval_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "al_select" ON approval_lines FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "al_insert" ON approval_lines FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "al_update" ON approval_lines FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "al_delete" ON approval_lines FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "ar_select" ON approval_records FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ar_insert" ON approval_records FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ar_update" ON approval_records FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "as_select" ON approval_steps FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "as_insert" ON approval_steps FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "as_update" ON approval_steps FOR UPDATE USING (auth.uid() IS NOT NULL);
