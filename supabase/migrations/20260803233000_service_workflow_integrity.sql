-- Service-project registration, traceability, and separation-of-duties controls.

ALTER TABLE public.service_projects
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS lot_type_at_event TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.service_payments
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.service_inspections
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.service_issues
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;

UPDATE public.service_projects
SET document_number='이관-용역-'||project_number
WHERE BTRIM(COALESCE(document_number,''))='';
UPDATE public.service_projects project
SET lot_type_at_event=lot.lot_type::TEXT
FROM public.parking_lots lot
WHERE lot.id=project.lot_id AND project.lot_type_at_event IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_project_document_number ON public.service_projects(document_number) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_project_client_mutation ON public.service_projects(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_payment_client_mutation ON public.service_payments(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_inspection_client_mutation ON public.service_inspections(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_issue_client_mutation ON public.service_issues(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_project_document_number ON public.service_projects(document_number);

CREATE SEQUENCE IF NOT EXISTS public.service_project_number_seq START 3001;
CREATE SEQUENCE IF NOT EXISTS public.service_issue_number_seq START 3001;

CREATE OR REPLACE FUNCTION public.normalize_service_project_context()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_text TEXT;
BEGIN
  v_text:=COALESCE(NEW.title,'')||' '||COALESCE(NEW.service_category,'');
  IF NEW.service_type NOT IN ('facility_maintenance','cleaning','landscaping','security','consulting','it_service','survey','construction_supervision','other') THEN
    NEW.service_type:=CASE
      WHEN v_text ~ '청소|미화' THEN 'cleaning'
      WHEN v_text ~ '조경|수목' THEN 'landscaping'
      WHEN v_text ~ '경비|보안' THEN 'security'
      WHEN v_text ~ 'CCTV|시스템|전산|관제' THEN 'it_service'
      WHEN v_text ~ '조사|진단|연구' THEN 'survey'
      WHEN v_text ~ '감리' THEN 'construction_supervision'
      WHEN v_text ~ '유지|보수|시설|공사' THEN 'facility_maintenance'
      ELSE 'other' END;
  END IF;
  IF NEW.lot_id IS NOT NULL AND NEW.lot_type_at_event IS NULL THEN
    SELECT lot_type::TEXT INTO NEW.lot_type_at_event FROM public.parking_lots WHERE id=NEW.lot_id;
  END IF;
  IF NEW.bid_contract_id IS NOT NULL AND BTRIM(COALESCE(NEW.document_number,''))='' THEN
    SELECT COALESCE(contract.document_number,project.document_number)
    INTO NEW.document_number
    FROM public.bid_contracts contract
    JOIN public.bid_projects project ON project.id=contract.bid_project_id
    WHERE contract.id=NEW.bid_contract_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_normalize_service_project_context ON public.service_projects;
CREATE TRIGGER trg_normalize_service_project_context BEFORE INSERT ON public.service_projects
FOR EACH ROW EXECUTE FUNCTION public.normalize_service_project_context();

CREATE OR REPLACE FUNCTION public.enforce_service_separation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='service_inspections' AND NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved'
     AND NEW.approved_by=OLD.inspector_id THEN
    RAISE EXCEPTION '검수 작성자는 자신의 검수를 승인할 수 없습니다' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='service_payments' THEN
    IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' AND NEW.approved_by=OLD.created_by THEN
      RAISE EXCEPTION '지급 요청자는 자신의 지급을 승인할 수 없습니다' USING ERRCODE='42501';
    END IF;
    IF NEW.status='paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
      NEW.paid_by:=COALESCE(NEW.paid_by,auth.uid());
    END IF;
    IF NEW.status='paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.paid_by=OLD.approved_by THEN
      RAISE EXCEPTION '지급 승인자와 지급 처리자는 달라야 합니다' USING ERRCODE='42501';
    END IF;
  END IF;
  NEW.row_version:=OLD.row_version+1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_service_inspection_separation ON public.service_inspections;
CREATE TRIGGER trg_service_inspection_separation BEFORE UPDATE ON public.service_inspections FOR EACH ROW EXECUTE FUNCTION public.enforce_service_separation();
DROP TRIGGER IF EXISTS trg_service_payment_separation ON public.service_payments;
CREATE TRIGGER trg_service_payment_separation BEFORE UPDATE ON public.service_payments FOR EACH ROW EXECUTE FUNCTION public.enforce_service_separation();

CREATE TABLE IF NOT EXISTS public.service_audit_events(
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id),
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_audit_entity ON public.service_audit_events(entity_type,entity_id,created_at DESC);
ALTER TABLE public.service_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_audit_select ON public.service_audit_events;
CREATE POLICY service_audit_select ON public.service_audit_events FOR SELECT TO authenticated USING(public.is_module_active('SERVICE'));
REVOKE ALL ON public.service_audit_events FROM anon,authenticated;
GRANT SELECT ON public.service_audit_events TO authenticated;

CREATE OR REPLACE FUNCTION public.append_service_audit_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.service_audit_events(entity_type,entity_id,event_type,actor_id,old_data,new_data)
  VALUES(TG_TABLE_NAME,COALESCE(NEW.id,OLD.id),lower(TG_OP),auth.uid(),CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW,OLD);
END $$;
DO $$ DECLARE v_table TEXT; BEGIN
  FOREACH v_table IN ARRAY ARRAY['service_projects','service_milestones','service_deliverables','service_inspections','service_payments','service_issues'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_append_service_audit ON public.%I',v_table);
    EXECUTE format('CREATE TRIGGER trg_append_service_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.append_service_audit_event()',v_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_service_hard_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '용역 업무 기록은 삭제할 수 없습니다. 보관 또는 상태변경 절차를 사용하세요' USING ERRCODE='42501'; END $$;
DO $$ DECLARE v_table TEXT; BEGIN
  FOREACH v_table IN ARRAY ARRAY['service_projects','service_milestones','service_deliverables','service_inspections','service_payments','service_issues'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_service_delete ON public.%I',v_table);
    EXECUTE format('CREATE TRIGGER trg_prevent_service_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_service_hard_delete()',v_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_service_project(
  p_title TEXT,p_document_number TEXT,p_service_type TEXT,p_service_category TEXT,p_lot_id UUID,p_budget_item_id UUID,
  p_description TEXT,p_scope_of_work TEXT,p_contractor_name TEXT,p_business_number TEXT,p_representative TEXT,p_address TEXT,
  p_phone TEXT,p_email TEXT,p_manager TEXT,p_manager_phone TEXT,p_supervisor_id UUID,p_inspector_id UUID,p_sub_supervisor_id UUID,
  p_contract_amount BIGINT,p_vat_amount BIGINT,p_contract_date DATE,p_start_date DATE,p_end_date DATE,p_warranty_months INTEGER,
  p_author_name TEXT,p_milestones JSONB,p_client_mutation_id UUID
) RETURNS SETOF public.service_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_actor public.profiles%ROWTYPE; v_row public.service_projects%ROWTYPE; v_item public.budget_items%ROWTYPE;
  v_plan public.budget_plans%ROWTYPE; v_number TEXT; v_milestone JSONB; v_weight NUMERIC; v_target DATE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager','editor') OR NOT public.is_module_active('SERVICE') THEN RAISE EXCEPTION '용역사업 등록 권한이 없습니다' USING ERRCODE='42501'; END IF;
  IF BTRIM(COALESCE(p_title,''))='' OR BTRIM(COALESCE(p_document_number,''))='' OR p_lot_id IS NULL OR p_budget_item_id IS NULL THEN RAISE EXCEPTION '사업명, 문서번호, 주차장, 승인 예산항목은 필수입니다' USING ERRCODE='23514'; END IF;
  IF BTRIM(COALESCE(p_contractor_name,''))='' OR BTRIM(COALESCE(p_business_number,''))='' OR BTRIM(COALESCE(p_manager,''))='' OR BTRIM(COALESCE(p_manager_phone,''))='' THEN RAISE EXCEPTION '업체명, 사업자번호, 현장 담당자와 연락처는 필수입니다' USING ERRCODE='23514'; END IF;
  IF p_supervisor_id IS NULL OR p_inspector_id IS NULL OR p_supervisor_id=p_inspector_id THEN RAISE EXCEPTION '감독관과 검수관은 서로 다른 담당자로 지정해야 합니다' USING ERRCODE='23514'; END IF;
  IF p_contract_amount IS NULL OR p_contract_amount<=0 OR COALESCE(p_vat_amount,0)<0 THEN RAISE EXCEPTION '계약금액과 부가세를 확인하세요' USING ERRCODE='23514'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date>p_end_date OR (p_contract_date IS NOT NULL AND p_contract_date>p_start_date) THEN RAISE EXCEPTION '계약·착수·완료 일정을 확인하세요' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_item FROM public.budget_items WHERE id=p_budget_item_id AND archived_at IS NULL;
  SELECT * INTO v_plan FROM public.budget_plans WHERE id=v_item.plan_id AND status IN ('approved','executed') AND archived_at IS NULL;
  IF v_item.id IS NULL OR v_plan.id IS NULL OR v_item.budget_type<>'expenditure' THEN RAISE EXCEPTION '승인 또는 집행 중인 지출 예산만 연결할 수 있습니다' USING ERRCODE='23514'; END IF;
  IF p_contract_amount+COALESCE(p_vat_amount,0)>GREATEST(v_item.allocated_amount-v_item.executed_amount-v_item.returned_amount,0) THEN RAISE EXCEPTION '계약 총액이 예산 잔액을 초과합니다' USING ERRCODE='23514'; END IF;
  IF v_item.lot_id IS NOT NULL AND v_item.lot_id<>p_lot_id THEN RAISE EXCEPTION '예산항목과 용역사업의 주차장이 다릅니다' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(p_milestones)<>'array' OR jsonb_array_length(p_milestones)<1 OR jsonb_array_length(p_milestones)>10 THEN RAISE EXCEPTION '마일스톤은 1~10개로 입력하세요' USING ERRCODE='23514'; END IF;
  SELECT COALESCE(SUM((value->>'weight_pct')::NUMERIC),0) INTO v_weight FROM jsonb_array_elements(p_milestones);
  IF v_weight<>100 THEN RAISE EXCEPTION '마일스톤 비중 합계는 100%%여야 합니다' USING ERRCODE='23514'; END IF;
  FOR v_milestone IN SELECT value FROM jsonb_array_elements(p_milestones) LOOP
    v_target:=(v_milestone->>'target_date')::DATE;
    IF BTRIM(COALESCE(v_milestone->>'title',''))='' OR v_target<p_start_date OR v_target>p_end_date THEN RAISE EXCEPTION '마일스톤 제목과 목표일은 수행기간 안에 있어야 합니다' USING ERRCODE='23514'; END IF;
  END LOOP;
  SELECT * INTO v_row FROM public.service_projects WHERE client_mutation_id=p_client_mutation_id;
  IF v_row.id IS NOT NULL THEN RETURN NEXT v_row; RETURN; END IF;
  v_number:='JJC-SVC-'||EXTRACT(YEAR FROM CURRENT_DATE)::INT||'-'||LPAD(nextval('public.service_project_number_seq')::TEXT,4,'0');
  INSERT INTO public.service_projects(title,project_number,document_number,lot_id,budget_item_id,service_type,service_category,description,scope_of_work,contractor_name,contractor_business_number,contractor_representative,contractor_address,contractor_phone,contractor_email,contractor_manager,contractor_manager_phone,supervisor_id,inspector_id,sub_supervisor_id,contract_amount,vat_amount,total_amount,contract_date,start_date,end_date,work_days,warranty_months,warranty_end,status,created_by,author_name,client_mutation_id)
  VALUES(BTRIM(p_title),v_number,BTRIM(p_document_number),p_lot_id,p_budget_item_id,p_service_type,NULLIF(BTRIM(COALESCE(p_service_category,'')),''),NULLIF(BTRIM(COALESCE(p_description,'')),''),NULLIF(BTRIM(COALESCE(p_scope_of_work,'')),''),BTRIM(p_contractor_name),BTRIM(p_business_number),NULLIF(BTRIM(COALESCE(p_representative,'')),''),NULLIF(BTRIM(COALESCE(p_address,'')),''),NULLIF(BTRIM(COALESCE(p_phone,'')),''),NULLIF(BTRIM(COALESCE(p_email,'')),''),BTRIM(p_manager),BTRIM(p_manager_phone),p_supervisor_id,p_inspector_id,p_sub_supervisor_id,p_contract_amount,COALESCE(p_vat_amount,0),p_contract_amount+COALESCE(p_vat_amount,0),p_contract_date,p_start_date,p_end_date,p_end_date-p_start_date,p_warranty_months,CASE WHEN COALESCE(p_warranty_months,0)>0 THEN (p_end_date+(p_warranty_months||' months')::INTERVAL)::DATE END,'preparing',v_actor.id,NULLIF(BTRIM(COALESCE(p_author_name,'')),''),p_client_mutation_id)
  RETURNING * INTO v_row;
  INSERT INTO public.service_milestones(project_id,milestone_number,milestone_type,title,target_date,weight_pct,deliverables_expected)
  SELECT v_row.id,ordinality::INTEGER,COALESCE(NULLIF(value->>'milestone_type',''),'progress'),BTRIM(value->>'title'),(value->>'target_date')::DATE,(value->>'weight_pct')::NUMERIC,NULLIF(BTRIM(COALESCE(value->>'deliverables_expected','')),'')
  FROM jsonb_array_elements(p_milestones) WITH ORDINALITY;
  RETURN NEXT v_row;
END $$;

REVOKE ALL ON FUNCTION public.create_service_project(TEXT,TEXT,TEXT,TEXT,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,UUID,UUID,BIGINT,BIGINT,DATE,DATE,DATE,INTEGER,TEXT,JSONB,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_service_project(TEXT,TEXT,TEXT,TEXT,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,UUID,UUID,BIGINT,BIGINT,DATE,DATE,DATE,INTEGER,TEXT,JSONB,UUID) TO authenticated;
