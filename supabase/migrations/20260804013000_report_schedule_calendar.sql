CREATE OR REPLACE FUNCTION public.next_report_schedule_run_calendar(
  p_frequency text,
  p_day_of_week integer,
  p_day_of_month integer,
  p_month_of_year integer,
  p_execution_time time without time zone,
  p_from timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_local_from timestamp without time zone := GREATEST(COALESCE(p_from, now()), now()) AT TIME ZONE 'Asia/Seoul';
  v_date date := (GREATEST(COALESCE(p_from, now()), now()) AT TIME ZONE 'Asia/Seoul')::date;
  v_candidate timestamp without time zone;
  v_basis_month integer := LEAST(GREATEST(COALESCE(p_month_of_year, 1), 1), 12);
  v_day integer := LEAST(GREATEST(COALESCE(p_day_of_month, 1), 1), 28);
  v_matches boolean;
BEGIN
  FOR v_offset IN 0..800 LOOP
    v_matches := CASE p_frequency
      WHEN 'daily' THEN true
      WHEN 'weekly' THEN EXTRACT(DOW FROM v_date)::integer = LEAST(GREATEST(COALESCE(p_day_of_week, 1), 0), 6)
      WHEN 'monthly' THEN EXTRACT(DAY FROM v_date)::integer = v_day
      WHEN 'quarterly' THEN EXTRACT(DAY FROM v_date)::integer = v_day
        AND MOD(EXTRACT(MONTH FROM v_date)::integer - v_basis_month + 12, 3) = 0
      WHEN 'semi_annual' THEN EXTRACT(DAY FROM v_date)::integer = v_day
        AND MOD(EXTRACT(MONTH FROM v_date)::integer - v_basis_month + 12, 6) = 0
      WHEN 'yearly' THEN EXTRACT(DAY FROM v_date)::integer = v_day
        AND EXTRACT(MONTH FROM v_date)::integer = v_basis_month
      ELSE false
    END;

    IF v_matches THEN
      v_candidate := v_date::timestamp + COALESCE(p_execution_time, time '06:00');
      IF v_candidate > v_local_from THEN
        RETURN v_candidate AT TIME ZONE 'Asia/Seoul';
      END IF;
    END IF;
    v_date := v_date + 1;
  END LOOP;
  RAISE EXCEPTION '다음 보고서 실행일을 계산하지 못했습니다.';
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
  SELECT * INTO v_schedule FROM public.report_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '보고서 스케줄을 찾을 수 없습니다.'; END IF;
  IF auth.uid() <> v_schedule.locked_by AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
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
      next_run = CASE WHEN p_advance_next THEN public.next_report_schedule_run_calendar(
        frequency, day_of_week, day_of_month, month_of_year, execution_time, GREATEST(COALESCE(next_run, now()), now())
      ) ELSE next_run END,
      locked_at = NULL,
      locked_by = NULL,
      last_error = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error, '알 수 없는 오류'), 1000) END
  WHERE id = p_schedule_id;

  IF v_schedule.created_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, module, type, title, message, link)
    VALUES (
      v_schedule.created_by, 'REPORT', CASE WHEN p_success THEN 'success' ELSE 'error' END,
      CASE WHEN p_success THEN '예약 보고서 생성 완료' ELSE '예약 보고서 생성 실패' END,
      CASE WHEN p_success THEN v_schedule.schedule_name || ' 보고서가 생성되었습니다.'
        ELSE v_schedule.schedule_name || ': ' || left(COALESCE(p_error, '알 수 없는 오류'), 500) END,
      '/reports/history'
    );
  END IF;
END;
$$;

UPDATE public.report_schedules
SET schedule_name = replace(schedule_name, '자동 발송', '예약 생성')
WHERE schedule_name LIKE '%자동 발송%';

UPDATE public.report_schedules
SET frequency = 'yearly', day_of_month = COALESCE(day_of_month, 10), month_of_year = 1,
    next_run = public.next_report_schedule_run_calendar('yearly', NULL, COALESCE(day_of_month, 10), 1, execution_time, now())
WHERE schedule_name LIKE '연간 종합 보고서%';

GRANT EXECUTE ON FUNCTION public.next_report_schedule_run_calendar(text, integer, integer, integer, time without time zone, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_report_schedule_result(uuid, uuid, boolean, text, boolean) TO authenticated;
