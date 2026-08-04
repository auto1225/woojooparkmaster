-- Reviewable, evidence-linked AI assistance audit trail.

CREATE TABLE IF NOT EXISTS public.ai_assistance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task varchar(50) NOT NULL,
  source_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(5,4),
  target_type varchar(50),
  target_id uuid,
  applied boolean,
  edited_before_apply boolean,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_assistance_user_created
ON public.ai_assistance_logs(user_id, created_at DESC);

ALTER TABLE public.ai_assistance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_log_select" ON public.ai_assistance_logs;
CREATE POLICY "ai_log_select"
ON public.ai_assistance_logs FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

DROP POLICY IF EXISTS "ai_log_insert" ON public.ai_assistance_logs;
CREATE POLICY "ai_log_insert"
ON public.ai_assistance_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "ai_log_update" ON public.ai_assistance_logs;
CREATE POLICY "ai_log_update"
ON public.ai_assistance_logs FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
