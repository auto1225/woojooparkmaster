BEGIN;

CREATE OR REPLACE FUNCTION public.guard_service_inspection_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status<>'pending' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.inspector_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION '검수는 대기 상태의 검수 생성 명령으로만 등록할 수 있습니다' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_service_payment_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status<>'requested' OR NEW.approved_by IS NOT NULL OR NEW.paid_date IS NOT NULL OR NEW.created_by IS DISTINCT FROM auth.uid()
     OR NOT EXISTS(SELECT 1 FROM public.service_inspections WHERE id=NEW.inspection_id AND project_id=NEW.project_id AND status='approved') THEN
    RAISE EXCEPTION '승인된 검수의 지급 요청만 등록할 수 있습니다' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_service_inspection_insert ON public.service_inspections;
CREATE TRIGGER trg_guard_service_inspection_insert BEFORE INSERT ON public.service_inspections
FOR EACH ROW EXECUTE FUNCTION public.guard_service_inspection_insert();
DROP TRIGGER IF EXISTS trg_guard_service_payment_insert ON public.service_payments;
CREATE TRIGGER trg_guard_service_payment_insert BEFORE INSERT ON public.service_payments
FOR EACH ROW EXECUTE FUNCTION public.guard_service_payment_insert();

DROP FUNCTION IF EXISTS public.guard_service_command_insert();

COMMIT;
