-- Real report artifacts and concurrency-safe schedule execution.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reports',
  'reports',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "reports_select" ON storage.objects;
CREATE POLICY "reports_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'reports'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  )
);

DROP POLICY IF EXISTS "reports_insert" ON storage.objects;
CREATE POLICY "reports_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "reports_update" ON storage.objects;
CREATE POLICY "reports_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'reports'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  )
)
WITH CHECK (bucket_id = 'reports');

DROP POLICY IF EXISTS "reports_delete" ON storage.objects;
CREATE POLICY "reports_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'reports'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  )
);

ALTER TABLE public.report_schedules
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS last_error text;

DROP POLICY IF EXISTS "gen_delete" ON public.report_generated;
CREATE POLICY "gen_delete"
ON public.report_generated FOR DELETE TO authenticated
USING (
  generated_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  )
);

CREATE OR REPLACE FUNCTION public.next_report_schedule_run(
  p_frequency text,
  p_previous timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_next timestamptz := COALESCE(p_previous, now());
  v_step interval;
BEGIN
  v_step := CASE p_frequency
    WHEN 'daily' THEN interval '1 day'
    WHEN 'weekly' THEN interval '7 days'
    WHEN 'monthly' THEN interval '1 month'
    WHEN 'quarterly' THEN interval '3 months'
    WHEN 'semi_annual' THEN interval '6 months'
    WHEN 'yearly' THEN interval '1 year'
    ELSE interval '1 month'
  END;

  v_next := v_next + v_step;
  WHILE v_next <= now() LOOP
    v_next := v_next + v_step;
  END LOOP;
  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_due_report_schedule()
RETURNS SETOF public.report_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION '보고서 스케줄 실행 권한이 없습니다.';
  END IF;

  SELECT id INTO v_id
  FROM public.report_schedules
  WHERE is_active
    AND next_run IS NOT NULL
    AND next_run <= now()
    AND (locked_at IS NULL OR locked_at < now() - interval '20 minutes')
  ORDER BY next_run
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.report_schedules
  SET locked_at = now(),
      locked_by = auth.uid(),
      last_status = 'generating',
      last_error = NULL
  WHERE id = v_id;

  RETURN QUERY
  SELECT * FROM public.report_schedules WHERE id = v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_report_schedule_result(
  p_schedule_id uuid,
  p_report_id uuid,
  p_success boolean,
  p_error text DEFAULT NULL,
  p_advance_next boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule public.report_schedules%ROWTYPE;
BEGIN
  SELECT * INTO v_schedule
  FROM public.report_schedules
  WHERE id = p_schedule_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '보고서 스케줄을 찾을 수 없습니다.';
  END IF;

  IF auth.uid() <> v_schedule.locked_by AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION '보고서 스케줄 결과 기록 권한이 없습니다.';
  END IF;

  UPDATE public.report_schedules
  SET last_run = now(),
      last_status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
      last_report_id = COALESCE(p_report_id, last_report_id),
      run_count = COALESCE(run_count, 0) + 1,
      fail_count = COALESCE(fail_count, 0) + CASE WHEN p_success THEN 0 ELSE 1 END,
      consecutive_fails = CASE WHEN p_success THEN 0 ELSE COALESCE(consecutive_fails, 0) + 1 END,
      next_run = CASE
        WHEN p_advance_next THEN public.next_report_schedule_run(frequency, next_run)
        ELSE next_run
      END,
      locked_at = NULL,
      locked_by = NULL,
      last_error = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error, '알 수 없는 오류'), 1000) END
  WHERE id = p_schedule_id;

  IF v_schedule.created_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, module, type, title, message, link)
    VALUES (
      v_schedule.created_by,
      'REPORT',
      CASE WHEN p_success THEN 'success' ELSE 'error' END,
      CASE WHEN p_success THEN '정기 보고서 생성 완료' ELSE '정기 보고서 생성 실패' END,
      CASE WHEN p_success
        THEN v_schedule.schedule_name || ' 보고서가 생성되었습니다.'
        ELSE v_schedule.schedule_name || ': ' || left(COALESCE(p_error, '알 수 없는 오류'), 500)
      END,
      '/reports/history'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_due_report_schedule() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_report_schedule_result(uuid, uuid, boolean, text, boolean) TO authenticated;
