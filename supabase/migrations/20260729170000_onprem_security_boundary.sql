-- Internal-zone deployment defaults and auditable server-side external integrations.

INSERT INTO public.system_config (config_key, config_value, description)
VALUES
  ('deployment_mode', 'on_premises', 'Deployment mode for the institution internal zone'),
  ('external_network_zone', 'controlled_egress', 'Only approved external services may be reached'),
  ('ai_enabled', 'false', 'External AI is disabled until an agency security review approves it')
ON CONFLICT (config_key) DO UPDATE
SET config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = now();

CREATE TABLE IF NOT EXISTS public.external_integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL CHECK (service IN ('naver_maps', 'approved_ai', 'sensor_console')),
  operation text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'blocked')),
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_integration_logs_created
ON public.external_integration_logs(created_at DESC);

ALTER TABLE public.external_integration_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "external_integration_log_admin_read" ON public.external_integration_logs;
CREATE POLICY "external_integration_log_admin_read"
ON public.external_integration_logs FOR SELECT TO authenticated
USING (public.get_user_role(auth.uid()) = 'admin');

REVOKE INSERT, UPDATE, DELETE ON public.external_integration_logs FROM anon, authenticated;
