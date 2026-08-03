-- Procurement workflow integrity and public-sector traceability.

ALTER TABLE public.bid_projects
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS lot_type_at_event TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.bid_submissions
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.bid_evaluations
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.bid_contracts
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS contractor_contact_person TEXT,
  ADD COLUMN IF NOT EXISTS lot_type_at_event TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.bid_documents
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE public.bid_projects
SET document_number = '이관-입찰-' || bid_number
WHERE BTRIM(COALESCE(document_number, '')) = '';

UPDATE public.bid_projects project
SET lot_type_at_event = lot.lot_type::TEXT
FROM public.parking_lots lot
WHERE lot.id = project.lot_id AND project.lot_type_at_event IS NULL;

UPDATE public.bid_contracts contract
SET document_number = '이관-계약-' || contract_number,
    lot_type_at_event = project.lot_type_at_event
FROM public.bid_projects project
WHERE project.id = contract.bid_project_id
  AND (BTRIM(COALESCE(contract.document_number, '')) = '' OR contract.lot_type_at_event IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_project_document_number ON public.bid_projects(document_number) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_project_client_mutation ON public.bid_projects(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_submission_client_mutation ON public.bid_submissions(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_contract_document_number ON public.bid_contracts(document_number) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_contract_client_mutation ON public.bid_contracts(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bid_project_document_search ON public.bid_projects(document_number, nara_ref);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bid_project_integrity_ck') THEN
    ALTER TABLE public.bid_projects ADD CONSTRAINT bid_project_integrity_ck CHECK (
      estimated_amount IS NULL OR estimated_amount > 0
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bid_submission_integrity_ck') THEN
    ALTER TABLE public.bid_submissions ADD CONSTRAINT bid_submission_integrity_ck CHECK (
      bid_amount IS NULL OR bid_amount > 0
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bid_evaluation_score_ck') THEN
    ALTER TABLE public.bid_evaluations ADD CONSTRAINT bid_evaluation_score_ck CHECK (
      price_score BETWEEN 0 AND 100 AND technical_score BETWEEN 0 AND 100 AND business_score BETWEEN 0 AND 100
      AND performance_score BETWEEN 0 AND 100 AND total_score BETWEEN 0 AND 300
    ) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_procurement_lot_context()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='bid_projects' AND NEW.lot_type_at_event IS NULL AND NEW.lot_id IS NOT NULL THEN
    SELECT lot_type::TEXT INTO NEW.lot_type_at_event FROM public.parking_lots WHERE id=NEW.lot_id;
  ELSIF TG_TABLE_NAME='bid_contracts' AND NEW.lot_type_at_event IS NULL THEN
    SELECT lot_type_at_event INTO NEW.lot_type_at_event FROM public.bid_projects WHERE id=NEW.bid_project_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bid_project_lot_context ON public.bid_projects;
CREATE TRIGGER trg_bid_project_lot_context BEFORE INSERT ON public.bid_projects FOR EACH ROW EXECUTE FUNCTION public.set_procurement_lot_context();
DROP TRIGGER IF EXISTS trg_bid_contract_lot_context ON public.bid_contracts;
CREATE TRIGGER trg_bid_contract_lot_context BEFORE INSERT ON public.bid_contracts FOR EACH ROW EXECUTE FUNCTION public.set_procurement_lot_context();

CREATE OR REPLACE FUNCTION public.guard_procurement_integrity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_flag TEXT;
BEGIN
  v_flag := CASE TG_TABLE_NAME
    WHEN 'bid_projects' THEN current_setting('app.procurement_project_write', TRUE)
    WHEN 'bid_submissions' THEN current_setting('app.procurement_submission_write', TRUE)
    WHEN 'bid_evaluations' THEN current_setting('app.procurement_evaluation_write', TRUE)
    WHEN 'bid_contracts' THEN current_setting('app.procurement_contract_write', TRUE)
    ELSE 'allowed' END;
  IF COALESCE(v_flag,'') <> 'allowed' THEN
    RAISE EXCEPTION '입찰 데이터는 검증된 업무 명령으로만 등록·변경할 수 있습니다' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN NEW.row_version := OLD.row_version + 1; END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE v_table TEXT; BEGIN
  FOREACH v_table IN ARRAY ARRAY['bid_projects','bid_submissions','bid_evaluations','bid_contracts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_procurement_integrity ON public.%I',v_table);
    EXECUTE format('CREATE TRIGGER trg_guard_procurement_integrity BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_procurement_integrity()',v_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_procurement_hard_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '입찰·계약 기록은 삭제할 수 없습니다. 취소 또는 보관 절차를 사용하세요' USING ERRCODE='42501'; END $$;
DO $$ DECLARE v_table TEXT; BEGIN
  FOREACH v_table IN ARRAY ARRAY['bid_projects','bid_submissions','bid_evaluations','bid_contracts','bid_documents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_procurement_delete ON public.%I',v_table);
    EXECUTE format('CREATE TRIGGER trg_prevent_procurement_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_procurement_hard_delete()',v_table);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.procurement_audit_events(
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id),
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_procurement_audit_entity ON public.procurement_audit_events(entity_type,entity_id,created_at DESC);
ALTER TABLE public.procurement_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS procurement_audit_select ON public.procurement_audit_events;
CREATE POLICY procurement_audit_select ON public.procurement_audit_events FOR SELECT TO authenticated USING(public.is_module_active('PROCUREMENT'));
REVOKE ALL ON public.procurement_audit_events FROM anon, authenticated;
GRANT SELECT ON public.procurement_audit_events TO authenticated;

CREATE OR REPLACE FUNCTION public.append_procurement_audit_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.procurement_audit_events(entity_type,entity_id,event_type,actor_id,old_data,new_data)
  VALUES(TG_TABLE_NAME,COALESCE(NEW.id,OLD.id),lower(TG_OP),auth.uid(),CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW,OLD);
END $$;
DO $$ DECLARE v_table TEXT; BEGIN
  FOREACH v_table IN ARRAY ARRAY['bid_projects','bid_submissions','bid_evaluations','bid_contracts','bid_documents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_append_procurement_audit ON public.%I',v_table);
    EXECUTE format('CREATE TRIGGER trg_append_procurement_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.append_procurement_audit_event()',v_table);
  END LOOP;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.bid_project_number_seq START 3001;
CREATE SEQUENCE IF NOT EXISTS public.bid_submission_number_seq START 3001;
CREATE SEQUENCE IF NOT EXISTS public.bid_contract_number_seq START 3001;

CREATE OR REPLACE FUNCTION public.create_bid_project(
  p_title TEXT,p_document_number TEXT,p_bid_type TEXT,p_contract_type TEXT,p_category TEXT,p_lot_id UUID,p_budget_item_id UUID,
  p_estimated_amount BIGINT,p_design_amount BIGINT,p_vat_included BOOLEAN,p_description TEXT,p_scope_of_work TEXT,p_location TEXT,
  p_work_period_days INTEGER,p_work_start_date DATE,p_work_end_date DATE,p_qualification TEXT,p_evaluation_method TEXT,p_lowest_price_rate NUMERIC,
  p_nara_ref TEXT,p_announce_date DATE,p_bid_start_date DATE,p_bid_deadline TIMESTAMPTZ,p_bid_open_date DATE,p_bid_open_location TEXT,
  p_assigned_to UUID,p_author_name TEXT,p_client_mutation_id UUID
) RETURNS SETOF public.bid_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.bid_projects%ROWTYPE; v_item public.budget_items%ROWTYPE; v_plan public.budget_plans%ROWTYPE; v_number TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager','editor') OR NOT public.is_module_active('PROCUREMENT') THEN RAISE EXCEPTION '입찰사업 등록 권한이 없습니다' USING ERRCODE='42501'; END IF;
  IF BTRIM(COALESCE(p_title,''))='' OR BTRIM(COALESCE(p_document_number,''))='' OR p_lot_id IS NULL OR p_budget_item_id IS NULL THEN
    RAISE EXCEPTION '사업명, 근거 문서번호, 주차장, 승인 예산항목은 필수입니다' USING ERRCODE='23514';
  END IF;
  IF p_estimated_amount IS NULL OR p_estimated_amount<=0 OR p_design_amount IS NULL OR p_design_amount<p_estimated_amount THEN RAISE EXCEPTION '설계금액은 추정가격 이상이어야 합니다' USING ERRCODE='23514'; END IF;
  IF p_work_start_date IS NULL OR p_work_end_date IS NULL OR p_work_start_date>p_work_end_date THEN RAISE EXCEPTION '수행 시작일과 종료일을 확인하세요' USING ERRCODE='23514'; END IF;
  IF p_announce_date IS NULL OR p_bid_start_date IS NULL OR p_bid_deadline IS NULL OR p_bid_open_date IS NULL OR p_announce_date>p_bid_start_date OR p_bid_start_date>p_bid_deadline::DATE OR p_bid_deadline::DATE>p_bid_open_date THEN RAISE EXCEPTION '공고·입찰·마감·개찰 일정을 순서대로 입력하세요' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_item FROM public.budget_items WHERE id=p_budget_item_id AND archived_at IS NULL;
  SELECT * INTO v_plan FROM public.budget_plans WHERE id=v_item.plan_id AND status='approved' AND archived_at IS NULL;
  IF v_item.id IS NULL OR v_plan.id IS NULL OR v_item.budget_type<>'expenditure' THEN RAISE EXCEPTION '승인된 지출 예산항목만 연결할 수 있습니다' USING ERRCODE='23514'; END IF;
  IF p_estimated_amount > GREATEST(v_item.allocated_amount-v_item.executed_amount-v_item.returned_amount,0) THEN RAISE EXCEPTION '추정가격이 예산 잔액을 초과합니다' USING ERRCODE='23514'; END IF;
  IF v_item.lot_id IS NOT NULL AND v_item.lot_id<>p_lot_id THEN RAISE EXCEPTION '예산항목과 입찰사업의 주차장이 일치하지 않습니다' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_row FROM public.bid_projects WHERE client_mutation_id=p_client_mutation_id;
  IF v_row.id IS NOT NULL THEN RETURN NEXT v_row; RETURN; END IF;
  v_number := 'JJC-BID-'||EXTRACT(YEAR FROM CURRENT_DATE)::INT||'-'||LPAD(nextval('public.bid_project_number_seq')::TEXT,4,'0');
  PERFORM set_config('app.procurement_project_write','allowed',TRUE);
  INSERT INTO public.bid_projects(title,bid_number,document_number,bid_type,contract_type,category,lot_id,budget_item_id,budget_available_amount,estimated_amount,design_amount,vat_included,description,scope_of_work,location,work_period_days,work_start_date,work_end_date,qualification,evaluation_method,lowest_price_rate,nara_ref,announce_date,bid_start_date,bid_deadline,bid_open_date,bid_open_location,assigned_to,created_by,author_name,client_mutation_id)
  VALUES(BTRIM(p_title),v_number,BTRIM(p_document_number),p_bid_type,p_contract_type,NULLIF(BTRIM(COALESCE(p_category,'')),''),p_lot_id,p_budget_item_id,v_item.allocated_amount-v_item.executed_amount-v_item.returned_amount,p_estimated_amount,p_design_amount,COALESCE(p_vat_included,TRUE),NULLIF(BTRIM(COALESCE(p_description,'')),''),NULLIF(BTRIM(COALESCE(p_scope_of_work,'')),''),NULLIF(BTRIM(COALESCE(p_location,'')),''),p_work_period_days,p_work_start_date,p_work_end_date,NULLIF(BTRIM(COALESCE(p_qualification,'')),''),p_evaluation_method,p_lowest_price_rate,NULLIF(BTRIM(COALESCE(p_nara_ref,'')),''),p_announce_date,p_bid_start_date,p_bid_deadline,p_bid_open_date,NULLIF(BTRIM(COALESCE(p_bid_open_location,'')),''),p_assigned_to,v_actor.id,NULLIF(BTRIM(COALESCE(p_author_name,'')),''),p_client_mutation_id)
  RETURNING * INTO v_row; RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.transition_bid_project(p_project_id UUID,p_target_status TEXT,p_reason TEXT DEFAULT NULL)
RETURNS SETOF public.bid_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.bid_projects%ROWTYPE; v_allowed BOOLEAN:=FALSE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager') OR NOT public.is_module_active('PROCUREMENT') THEN RAISE EXCEPTION '입찰 상태 변경 권한이 없습니다' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.bid_projects WHERE id=p_project_id FOR UPDATE;
  v_allowed := (v_row.status='draft' AND p_target_status='review') OR (v_row.status='review' AND p_target_status='announced') OR (v_row.status='announced' AND p_target_status='bidding') OR (v_row.status='bidding' AND p_target_status='closed') OR (v_row.status='closed' AND p_target_status='evaluation') OR (v_row.status='evaluation' AND p_target_status='awarded') OR (v_row.status IN ('draft','review','announced','bidding','closed','evaluation') AND p_target_status IN ('cancelled','failed'));
  IF NOT v_allowed THEN RAISE EXCEPTION '현재 단계에서 요청한 상태로 변경할 수 없습니다' USING ERRCODE='22023'; END IF;
  IF p_target_status IN ('cancelled','failed') AND BTRIM(COALESCE(p_reason,''))='' THEN RAISE EXCEPTION '취소 또는 유찰 사유가 필요합니다' USING ERRCODE='23514'; END IF;
  IF p_target_status='review' AND (BTRIM(COALESCE(v_row.document_number,''))='' OR v_row.budget_item_id IS NULL OR v_row.bid_deadline IS NULL) THEN RAISE EXCEPTION '문서번호, 승인 예산, 입찰일정을 모두 입력해야 검토 요청할 수 있습니다' USING ERRCODE='23514'; END IF;
  IF p_target_status='awarded' AND NOT EXISTS(SELECT 1 FROM public.bid_evaluations WHERE bid_project_id=v_row.id AND rank=1 AND is_qualified) THEN RAISE EXCEPTION '적격 1순위 평가 결과가 필요합니다' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.procurement_project_write','allowed',TRUE);
  UPDATE public.bid_projects SET status=p_target_status,cancel_reason=CASE WHEN p_target_status IN ('cancelled','failed') THEN BTRIM(p_reason) ELSE cancel_reason END WHERE id=v_row.id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.add_bid_submission(p_project_id UUID,p_company_name TEXT,p_business_number TEXT,p_representative TEXT,p_contact_person TEXT,p_contact_phone TEXT,p_contact_email TEXT,p_bid_amount BIGINT,p_submitted_at TIMESTAMPTZ,p_client_mutation_id UUID)
RETURNS SETOF public.bid_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_project public.bid_projects%ROWTYPE; v_row public.bid_submissions%ROWTYPE; v_number TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager','editor') THEN RAISE EXCEPTION '참여업체 등록 권한이 없습니다' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_project FROM public.bid_projects WHERE id=p_project_id FOR UPDATE;
  IF v_project.status NOT IN ('announced','bidding','closed','evaluation') THEN RAISE EXCEPTION '공고 이후 평가 전 단계에서만 접수할 수 있습니다' USING ERRCODE='22023'; END IF;
  IF BTRIM(COALESCE(p_company_name,''))='' OR BTRIM(COALESCE(p_business_number,''))='' OR BTRIM(COALESCE(p_contact_person,''))='' OR BTRIM(COALESCE(p_contact_phone,''))='' OR p_bid_amount IS NULL OR p_bid_amount<=0 THEN RAISE EXCEPTION '업체명, 사업자번호, 담당자, 연락처, 입찰금액은 필수입니다' USING ERRCODE='23514'; END IF;
  IF p_bid_amount>v_project.design_amount THEN RAISE EXCEPTION '입찰금액이 설계금액을 초과합니다' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_row FROM public.bid_submissions WHERE client_mutation_id=p_client_mutation_id;
  IF v_row.id IS NOT NULL THEN RETURN NEXT v_row; RETURN; END IF;
  v_number := 'JJC-SUB-'||EXTRACT(YEAR FROM CURRENT_DATE)::INT||'-'||LPAD(nextval('public.bid_submission_number_seq')::TEXT,4,'0');
  PERFORM set_config('app.procurement_submission_write','allowed',TRUE);
  INSERT INTO public.bid_submissions(bid_project_id,submission_number,company_name,business_number,representative,contact_person,contact_phone,contact_email,bid_amount,submitted_at,client_mutation_id)
  VALUES(p_project_id,v_number,BTRIM(p_company_name),BTRIM(p_business_number),NULLIF(BTRIM(COALESCE(p_representative,'')),''),BTRIM(p_contact_person),BTRIM(p_contact_phone),NULLIF(BTRIM(COALESCE(p_contact_email,'')),''),p_bid_amount,COALESCE(p_submitted_at,now()),p_client_mutation_id) RETURNING * INTO v_row;
  RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.save_bid_evaluation(p_project_id UUID,p_submission_id UUID,p_price_score NUMERIC,p_technical_score NUMERIC,p_business_score NUMERIC,p_is_qualified BOOLEAN,p_comments TEXT)
RETURNS SETOF public.bid_evaluations LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.bid_evaluations%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager') THEN RAISE EXCEPTION '평가 권한이 없습니다' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bid_projects WHERE id=p_project_id AND status='evaluation') THEN RAISE EXCEPTION '평가 단계에서만 점수를 저장할 수 있습니다' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bid_submissions WHERE id=p_submission_id AND bid_project_id=p_project_id AND is_valid) THEN RAISE EXCEPTION '유효한 참여업체만 평가할 수 있습니다' USING ERRCODE='23514'; END IF;
  IF p_price_score NOT BETWEEN 0 AND 30 OR p_technical_score NOT BETWEEN 0 AND 50 OR p_business_score NOT BETWEEN 0 AND 20 THEN RAISE EXCEPTION '가격 30점, 기술 50점, 경영 20점 범위로 입력하세요' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.procurement_evaluation_write','allowed',TRUE);
  INSERT INTO public.bid_evaluations(bid_project_id,submission_id,evaluator_id,evaluator_name,evaluation_date,price_score,technical_score,business_score,total_score,is_qualified,comments)
  VALUES(p_project_id,p_submission_id,v_actor.id,v_actor.name,CURRENT_DATE,p_price_score,p_technical_score,p_business_score,p_price_score+p_technical_score+p_business_score,COALESCE(p_is_qualified,TRUE),NULLIF(BTRIM(COALESCE(p_comments,'')),''))
  ON CONFLICT (bid_project_id,submission_id) DO UPDATE SET evaluator_id=EXCLUDED.evaluator_id,evaluator_name=EXCLUDED.evaluator_name,evaluation_date=EXCLUDED.evaluation_date,price_score=EXCLUDED.price_score,technical_score=EXCLUDED.technical_score,business_score=EXCLUDED.business_score,total_score=EXCLUDED.total_score,is_qualified=EXCLUDED.is_qualified,comments=EXCLUDED.comments
  RETURNING * INTO v_row;
  WITH ranked AS (SELECT id,ROW_NUMBER() OVER(ORDER BY total_score DESC,created_at) AS new_rank FROM public.bid_evaluations WHERE bid_project_id=p_project_id AND is_qualified)
  UPDATE public.bid_evaluations evaluation SET rank=ranked.new_rank FROM ranked WHERE evaluation.id=ranked.id;
  SELECT * INTO v_row FROM public.bid_evaluations WHERE bid_project_id=p_project_id AND submission_id=p_submission_id;
  RETURN NEXT v_row;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_evaluation_submission ON public.bid_evaluations(bid_project_id,submission_id);

CREATE OR REPLACE FUNCTION public.create_bid_contract(p_project_id UUID,p_submission_id UUID,p_document_number TEXT,p_contractor_name TEXT,p_business_number TEXT,p_representative TEXT,p_contact_person TEXT,p_phone TEXT,p_email TEXT,p_address TEXT,p_contract_amount BIGINT,p_vat_amount BIGINT,p_total_amount BIGINT,p_contract_date DATE,p_contract_start DATE,p_contract_end DATE,p_warranty_months INTEGER,p_penalty_rate NUMERIC,p_client_mutation_id UUID)
RETURNS SETOF public.bid_contracts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_project public.bid_projects%ROWTYPE; v_eval public.bid_evaluations%ROWTYPE; v_row public.bid_contracts%ROWTYPE; v_number TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager') THEN RAISE EXCEPTION '계약 체결 권한이 없습니다' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_project FROM public.bid_projects WHERE id=p_project_id FOR UPDATE;
  SELECT * INTO v_eval FROM public.bid_evaluations WHERE bid_project_id=p_project_id AND submission_id=p_submission_id AND rank=1 AND is_qualified;
  IF v_project.status<>'awarded' OR v_eval.id IS NULL THEN RAISE EXCEPTION '낙찰 처리된 적격 1순위 업체와만 계약할 수 있습니다' USING ERRCODE='23514'; END IF;
  IF BTRIM(COALESCE(p_document_number,''))='' OR BTRIM(COALESCE(p_contractor_name,''))='' OR BTRIM(COALESCE(p_business_number,''))='' OR BTRIM(COALESCE(p_contact_person,''))='' OR BTRIM(COALESCE(p_phone,''))='' THEN RAISE EXCEPTION '계약 문서번호와 업체·사업자·담당자·연락처는 필수입니다' USING ERRCODE='23514'; END IF;
  IF p_contract_amount<=0 OR p_total_amount<>p_contract_amount+COALESCE(p_vat_amount,0) OR p_total_amount>v_project.design_amount THEN RAISE EXCEPTION '계약금액·부가세·총액을 확인하세요' USING ERRCODE='23514'; END IF;
  IF p_contract_date IS NULL OR p_contract_start IS NULL OR p_contract_end IS NULL OR p_contract_date>p_contract_start OR p_contract_start>p_contract_end THEN RAISE EXCEPTION '계약·착수·종료일을 순서대로 입력하세요' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_row FROM public.bid_contracts WHERE client_mutation_id=p_client_mutation_id;
  IF v_row.id IS NOT NULL THEN RETURN NEXT v_row; RETURN; END IF;
  v_number := 'JJC-CON-'||EXTRACT(YEAR FROM CURRENT_DATE)::INT||'-'||LPAD(nextval('public.bid_contract_number_seq')::TEXT,4,'0');
  PERFORM set_config('app.procurement_contract_write','allowed',TRUE);
  PERFORM set_config('app.procurement_project_write','allowed',TRUE);
  INSERT INTO public.bid_contracts(bid_project_id,submission_id,contract_number,document_number,contractor_name,contractor_business_number,contractor_representative,contractor_contact_person,contractor_phone,contractor_email,contractor_address,contract_amount,vat_amount,total_amount,contract_date,contract_start,contract_end,work_days,warranty_months,warranty_end,penalty_rate,created_by,client_mutation_id)
  VALUES(p_project_id,p_submission_id,v_number,BTRIM(p_document_number),BTRIM(p_contractor_name),BTRIM(p_business_number),NULLIF(BTRIM(COALESCE(p_representative,'')),''),BTRIM(p_contact_person),BTRIM(p_phone),NULLIF(BTRIM(COALESCE(p_email,'')),''),NULLIF(BTRIM(COALESCE(p_address,'')),''),p_contract_amount,COALESCE(p_vat_amount,0),p_total_amount,p_contract_date,p_contract_start,p_contract_end,p_contract_end-p_contract_start,p_warranty_months,p_contract_end+(COALESCE(p_warranty_months,0)||' months')::INTERVAL,p_penalty_rate,v_actor.id,p_client_mutation_id)
  RETURNING * INTO v_row;
  UPDATE public.bid_projects SET successful_bidder=v_row.contractor_name,contract_amount=v_row.total_amount,savings_rate=ROUND((estimated_amount-v_row.total_amount)::NUMERIC/estimated_amount*100,2),status='contracted' WHERE id=p_project_id;
  RETURN NEXT v_row;
END $$;

REVOKE ALL ON FUNCTION public.create_bid_project(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,UUID,BIGINT,BIGINT,BOOLEAN,TEXT,TEXT,TEXT,INTEGER,DATE,DATE,TEXT,TEXT,NUMERIC,TEXT,DATE,DATE,TIMESTAMPTZ,DATE,TEXT,UUID,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_bid_project(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,UUID,BIGINT,BIGINT,BOOLEAN,TEXT,TEXT,TEXT,INTEGER,DATE,DATE,TEXT,TEXT,NUMERIC,TEXT,DATE,DATE,TIMESTAMPTZ,DATE,TEXT,UUID,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_bid_project(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_bid_submission(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT,TIMESTAMPTZ,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_bid_evaluation(UUID,UUID,NUMERIC,NUMERIC,NUMERIC,BOOLEAN,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_bid_contract(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT,BIGINT,BIGINT,DATE,DATE,DATE,INTEGER,NUMERIC,UUID) TO authenticated;
