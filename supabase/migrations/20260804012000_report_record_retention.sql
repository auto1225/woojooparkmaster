-- Flag previously generated calendar-boundary defects and protect report records.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.report_generated'::regclass
      AND conname = 'report_generated_status_check'
  ) THEN
    ALTER TABLE public.report_generated
      ADD CONSTRAINT report_generated_status_check
      CHECK (status IN ('queued', 'generating', 'completed', 'failed', 'archived'));
  END IF;
END $$;

UPDATE public.report_generated report
SET status = 'failed',
    error_message = '기존 생성 파일의 보고기간 종료일이 한국 표준시 기준보다 하루 짧습니다. 같은 조건으로 다시 생성해 주세요.'
FROM public.report_templates template
WHERE report.template_id = template.id
  AND report.status = 'completed'
  AND report.period_start IS NOT NULL
  AND report.period_end IS NOT NULL
  AND (
    (template.report_type = 'monthly' AND report.period_end::date <> (date_trunc('month', report.period_start::date) + interval '1 month - 1 day')::date)
    OR
    (template.report_type = 'quarterly' AND report.period_end::date <> (date_trunc('quarter', report.period_start::date) + interval '3 months - 1 day')::date)
  );

CREATE OR REPLACE FUNCTION public.guard_report_generated_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role(auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION '보고서 영구 삭제는 관리자만 수행할 수 있습니다.' USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'archived' THEN
    RAISE EXCEPTION '보고서를 먼저 보관 처리한 뒤 삭제해 주세요.' USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_report_generated_delete ON public.report_generated;
CREATE TRIGGER trg_guard_report_generated_delete
BEFORE DELETE ON public.report_generated
FOR EACH ROW EXECUTE FUNCTION public.guard_report_generated_delete();

REVOKE ALL ON FUNCTION public.guard_report_generated_delete() FROM PUBLIC;

COMMENT ON FUNCTION public.guard_report_generated_delete() IS
  '공식 보고서 이력은 관리자 보관 절차를 거친 경우에만 영구 삭제하도록 강제한다.';
