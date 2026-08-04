-- Report register linkage, traceability, and sample-template cleanup.

ALTER TABLE public.report_generated
  ADD COLUMN IF NOT EXISTS official_document_number text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE public.report_templates
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.report_generated
SET official_document_number = NULLIF(btrim(parameters_used ->> 'official_document_number'), '')
WHERE official_document_number IS NULL
  AND parameters_used ? 'official_document_number';

CREATE INDEX IF NOT EXISTS idx_report_generated_official_document
  ON public.report_generated (official_document_number)
  WHERE official_document_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_report_generated_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.official_document_number := NULLIF(btrim(NEW.parameters_used ->> 'official_document_number'), '');
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.row_version := OLD.row_version + 1;
    IF NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN
      NEW.archived_at := now();
      NEW.archived_by := auth.uid();
    ELSIF NEW.status IS DISTINCT FROM 'archived' THEN
      NEW.archived_at := NULL;
      NEW.archived_by := NULL;
      NEW.archive_reason := NULL;
    END IF;
  END IF;
  IF NEW.period_start IS NOT NULL AND NEW.period_end IS NOT NULL AND NEW.period_start > NEW.period_end THEN
    RAISE EXCEPTION '보고 종료일은 시작일보다 빠를 수 없습니다.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_report_generated_metadata ON public.report_generated;
CREATE TRIGGER trg_sync_report_generated_metadata
BEFORE INSERT OR UPDATE ON public.report_generated
FOR EACH ROW EXECUTE FUNCTION public.sync_report_generated_metadata();

REVOKE ALL ON FUNCTION public.sync_report_generated_metadata() FROM PUBLIC;

UPDATE public.report_templates
SET description = CASE template_code
  WHEN 'RPT-DEMO-MONTHLY' THEN '월간 주차장 운영 현황과 주요 조치사항을 정리하는 업무 보고서'
  WHEN 'RPT-DEMO-QUARTERLY' THEN '분기별 주차수입과 예산 집행 현황을 비교하는 결산 보고서'
  WHEN 'RPT-DEMO-ANNUAL' THEN '연간 운영·시설·수입·민원 실적을 종합하는 기관 보고서'
  WHEN 'RPT-DEMO-SAFETY' THEN '주차장 유형별 안전점검 결과와 시정조치 현황 보고서'
  WHEN 'RPT-DEMO-COMPLAINT' THEN '민원 접수·처리기한·반복민원·만족도를 분석하는 업무 보고서'
  ELSE description
END
WHERE template_code LIKE 'RPT-DEMO-%';

UPDATE public.report_templates
SET is_active = false
WHERE template_code LIKE 'RPT-DEMO-%';

UPDATE public.report_schedules schedule
SET is_active = false
FROM public.report_templates template
WHERE schedule.template_id = template.id
  AND template.is_active = false;

COMMENT ON COLUMN public.report_generated.official_document_number IS '문서대장 및 통합검색에 사용하는 기관 공문 문서번호';
COMMENT ON COLUMN public.report_generated.row_version IS '동시 수정 충돌 감지를 위한 보고서 버전';
