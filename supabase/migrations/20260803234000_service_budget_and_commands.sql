BEGIN;

CREATE TABLE IF NOT EXISTS public.service_budget_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_item_id UUID NOT NULL REFERENCES public.budget_items(id),
  project_id UUID NOT NULL UNIQUE REFERENCES public.service_projects(id),
  committed_amount BIGINT NOT NULL CHECK (committed_amount > 0),
  status TEXT NOT NULL DEFAULT 'committed' CHECK (status IN ('committed','released','settled')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_commitments_budget ON public.service_budget_commitments(budget_item_id,status);
ALTER TABLE public.service_budget_commitments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_commitments_select ON public.service_budget_commitments;
CREATE POLICY service_commitments_select ON public.service_budget_commitments FOR SELECT TO authenticated
USING (public.is_module_active('SERVICE') OR public.is_module_active('BUDGET'));
REVOKE ALL ON public.service_budget_commitments FROM anon,authenticated;
GRANT SELECT ON public.service_budget_commitments TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_service_budget()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item public.budget_items%ROWTYPE; v_reserved BIGINT;
BEGIN
  IF NEW.budget_item_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_item FROM public.budget_items WHERE id=NEW.budget_item_id FOR UPDATE;
  IF v_item.id IS NULL OR v_item.budget_type<>'expenditure' THEN
    RAISE EXCEPTION '승인된 지출 예산항목이 필요합니다' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(SUM(committed_amount),0) INTO v_reserved
  FROM public.service_budget_commitments WHERE budget_item_id=NEW.budget_item_id AND status='committed';
  IF NEW.total_amount > GREATEST(v_item.allocated_amount-v_item.executed_amount-v_item.returned_amount-v_reserved,0) THEN
    RAISE EXCEPTION '다른 용역 약정액을 제외한 예산 잔액을 초과합니다' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_reserve_service_budget ON public.service_projects;
CREATE TRIGGER trg_reserve_service_budget BEFORE INSERT ON public.service_projects
FOR EACH ROW EXECUTE FUNCTION public.reserve_service_budget();

CREATE OR REPLACE FUNCTION public.create_service_commitment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.budget_item_id IS NOT NULL THEN
    INSERT INTO public.service_budget_commitments(budget_item_id,project_id,committed_amount,created_by)
    VALUES(NEW.budget_item_id,NEW.id,NEW.total_amount,COALESCE(NEW.created_by,auth.uid())) ON CONFLICT(project_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_create_service_commitment ON public.service_projects;
CREATE TRIGGER trg_create_service_commitment AFTER INSERT ON public.service_projects
FOR EACH ROW EXECUTE FUNCTION public.create_service_commitment();

INSERT INTO public.service_budget_commitments(budget_item_id,project_id,committed_amount,status,created_by)
SELECT budget_item_id,id,total_amount,CASE WHEN status='terminated' THEN 'released' ELSE 'committed' END,created_by
FROM public.service_projects WHERE budget_item_id IS NOT NULL
ON CONFLICT(project_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.guard_service_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_allowed BOOLEAN:=FALSE;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_allowed := CASE OLD.status
    WHEN 'preparing' THEN NEW.status IN ('in_progress','terminated')
    WHEN 'in_progress' THEN NEW.status IN ('suspended','inspection','terminated')
    WHEN 'suspended' THEN NEW.status IN ('in_progress','terminated')
    WHEN 'inspection' THEN NEW.status IN ('in_progress','completed','terminated')
    WHEN 'completed' THEN NEW.status IN ('warranty','closed')
    WHEN 'warranty' THEN NEW.status='closed'
    ELSE FALSE END;
  IF NOT v_allowed THEN RAISE EXCEPTION '현재 단계에서 요청한 용역 상태로 변경할 수 없습니다' USING ERRCODE='55000'; END IF;
  IF NEW.status='inspection' THEN
    IF EXISTS(SELECT 1 FROM public.service_milestones WHERE project_id=NEW.id AND status<>'completed') THEN
      RAISE EXCEPTION '모든 마일스톤을 완료한 뒤 준공검수를 요청하세요' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.service_deliverables WHERE project_id=NEW.id AND deliverable_type IN ('final','completion') AND status IN ('submitted','approved')) THEN
      RAISE EXCEPTION '최종 성과품을 제출한 뒤 준공검수를 요청하세요' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status='completed' THEN
    IF NOT EXISTS(SELECT 1 FROM public.service_inspections WHERE project_id=NEW.id AND inspection_type IN ('final','completion') AND status='approved') THEN
      RAISE EXCEPTION '승인된 준공검수가 필요합니다' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM public.service_issues WHERE project_id=NEW.id AND severity IN ('critical','high') AND status NOT IN ('resolved','closed')) THEN
      RAISE EXCEPTION '중대 이슈를 모두 해결한 뒤 준공 처리하세요' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.service_deliverables WHERE project_id=NEW.id AND deliverable_type IN ('final','completion') AND status='approved') THEN
      RAISE EXCEPTION '승인된 최종 성과품이 필요합니다' USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.status_changed_at:=now(); NEW.row_version:=OLD.row_version+1;
  IF NEW.status='in_progress' AND OLD.status='preparing' THEN NEW.actual_start_date:=COALESCE(NEW.actual_start_date,CURRENT_DATE); END IF;
  IF NEW.status='completed' THEN NEW.actual_end_date:=COALESCE(NEW.actual_end_date,CURRENT_DATE); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_service_status_transition ON public.service_projects;
CREATE TRIGGER trg_guard_service_status_transition BEFORE UPDATE OF status ON public.service_projects
FOR EACH ROW EXECUTE FUNCTION public.guard_service_status_transition();

CREATE OR REPLACE FUNCTION public.transition_service_project(p_project_id UUID,p_target_status TEXT,p_reason TEXT DEFAULT NULL)
RETURNS SETOF public.service_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.service_projects%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager','editor') OR NOT public.is_module_active('SERVICE') THEN RAISE EXCEPTION '용역 상태 변경 권한이 없습니다' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.service_projects WHERE id=p_project_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION '용역사업을 찾을 수 없습니다' USING ERRCODE='P0002'; END IF;
  IF p_target_status IN ('suspended','terminated') AND BTRIM(COALESCE(p_reason,''))='' THEN RAISE EXCEPTION '중지 또는 해지 사유를 입력하세요' USING ERRCODE='23514'; END IF;
  UPDATE public.service_projects SET status=p_target_status,
    suspension_reason=CASE WHEN p_target_status='suspended' THEN BTRIM(p_reason) ELSE suspension_reason END,
    suspension_start=CASE WHEN p_target_status='suspended' THEN CURRENT_DATE ELSE suspension_start END,
    termination_reason=CASE WHEN p_target_status='terminated' THEN BTRIM(p_reason) ELSE termination_reason END,
    termination_date=CASE WHEN p_target_status='terminated' THEN CURRENT_DATE ELSE termination_date END
  WHERE id=p_project_id RETURNING * INTO v_row;
  IF p_target_status='terminated' THEN UPDATE public.service_budget_commitments SET status='released',updated_at=now() WHERE project_id=p_project_id AND status='committed'; END IF;
  RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.complete_service_milestone(p_milestone_id UUID,p_actual_date DATE DEFAULT CURRENT_DATE,p_note TEXT DEFAULT NULL)
RETURNS SETOF public.service_milestones LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.service_milestones%ROWTYPE; v_project public.service_projects%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  SELECT * INTO v_row FROM public.service_milestones WHERE id=p_milestone_id FOR UPDATE;
  SELECT * INTO v_project FROM public.service_projects WHERE id=v_row.project_id;
  IF v_actor.role NOT IN ('admin','manager','editor') OR v_project.status NOT IN ('in_progress','inspection') THEN RAISE EXCEPTION '진행 중인 용역의 마일스톤만 완료할 수 있습니다' USING ERRCODE='42501'; END IF;
  IF v_row.status='completed' THEN RETURN NEXT v_row; RETURN; END IF;
  UPDATE public.service_milestones SET status='completed',actual_date=COALESCE(p_actual_date,CURRENT_DATE),notes=NULLIF(BTRIM(COALESCE(p_note,'')),'') WHERE id=p_milestone_id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.service_issue_number_seq START 3001;
CREATE OR REPLACE FUNCTION public.create_service_issue(p_project_id UUID,p_issue_type TEXT,p_severity TEXT,p_title TEXT,p_description TEXT,p_impact_amount BIGINT,p_impact_days INTEGER,p_client_mutation_id UUID)
RETURNS SETOF public.service_issues LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.service_issues%ROWTYPE; v_number TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager','editor') OR BTRIM(COALESCE(p_title,''))='' OR BTRIM(COALESCE(p_description,''))='' THEN RAISE EXCEPTION '이슈 등록 권한과 필수 내용을 확인하세요' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.service_issues WHERE client_mutation_id=p_client_mutation_id; IF v_row.id IS NOT NULL THEN RETURN NEXT v_row; RETURN; END IF;
  v_number:='SVC-ISS-'||EXTRACT(YEAR FROM CURRENT_DATE)::INT||'-'||lpad(nextval('public.service_issue_number_seq')::TEXT,6,'0');
  INSERT INTO public.service_issues(project_id,issue_number,issue_type,severity,title,description,impact_amount,impact_days,reported_by,client_mutation_id)
  VALUES(p_project_id,v_number,p_issue_type,p_severity,BTRIM(p_title),BTRIM(p_description),GREATEST(COALESCE(p_impact_amount,0),0),GREATEST(COALESCE(p_impact_days,0),0),v_actor.id,p_client_mutation_id)
  RETURNING * INTO v_row; RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.transition_service_issue(p_issue_id UUID,p_target_status TEXT,p_resolution TEXT DEFAULT NULL)
RETURNS SETOF public.service_issues LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.service_issues%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  SELECT * INTO v_row FROM public.service_issues WHERE id=p_issue_id FOR UPDATE;
  IF v_actor.role NOT IN ('admin','manager','editor') OR v_row.id IS NULL THEN RAISE EXCEPTION '이슈 처리 권한이 없습니다' USING ERRCODE='42501'; END IF;
  IF NOT ((v_row.status='open' AND p_target_status='in_progress') OR (v_row.status='in_progress' AND p_target_status='resolved')) THEN RAISE EXCEPTION '현재 단계에서 이슈 상태를 변경할 수 없습니다' USING ERRCODE='55000'; END IF;
  IF p_target_status='resolved' AND BTRIM(COALESCE(p_resolution,''))='' THEN RAISE EXCEPTION '해결 내용을 입력하세요' USING ERRCODE='23514'; END IF;
  UPDATE public.service_issues SET status=p_target_status,resolution=CASE WHEN p_target_status='resolved' THEN BTRIM(p_resolution) ELSE resolution END,
    resolved_at=CASE WHEN p_target_status='resolved' THEN now() ELSE NULL END,resolved_by=CASE WHEN p_target_status='resolved' THEN v_actor.id ELSE NULL END
  WHERE id=p_issue_id RETURNING * INTO v_row; RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.update_service_contractor_contact(p_project_id UUID,p_name TEXT,p_business_number TEXT,p_representative TEXT,p_address TEXT,p_phone TEXT,p_email TEXT,p_manager TEXT,p_manager_phone TEXT)
RETURNS SETOF public.service_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.service_projects%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager','editor') OR BTRIM(COALESCE(p_name,''))='' OR BTRIM(COALESCE(p_manager,''))='' OR BTRIM(COALESCE(p_manager_phone,''))='' THEN RAISE EXCEPTION '업체명, 현장 담당자와 연락처는 필수입니다' USING ERRCODE='23514'; END IF;
  UPDATE public.service_projects SET contractor_name=BTRIM(p_name),contractor_business_number=NULLIF(BTRIM(COALESCE(p_business_number,'')),''),contractor_representative=NULLIF(BTRIM(COALESCE(p_representative,'')),''),contractor_address=NULLIF(BTRIM(COALESCE(p_address,'')),''),contractor_phone=NULLIF(BTRIM(COALESCE(p_phone,'')),''),contractor_email=NULLIF(BTRIM(COALESCE(p_email,'')),''),contractor_manager=BTRIM(p_manager),contractor_manager_phone=BTRIM(p_manager_phone),row_version=row_version+1 WHERE id=p_project_id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.guard_service_command_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='service_inspections' AND (NEW.status<>'pending' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.inspector_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION '검수는 대기 상태의 검수 생성 명령으로만 등록할 수 있습니다' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='service_payments' AND (NEW.status<>'requested' OR NEW.approved_by IS NOT NULL OR NEW.paid_date IS NOT NULL OR NEW.created_by IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.service_inspections WHERE id=NEW.inspection_id AND project_id=NEW.project_id AND status='approved')) THEN RAISE EXCEPTION '승인된 검수의 지급 요청만 등록할 수 있습니다' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_service_inspection_insert ON public.service_inspections;
CREATE TRIGGER trg_guard_service_inspection_insert BEFORE INSERT ON public.service_inspections FOR EACH ROW EXECUTE FUNCTION public.guard_service_command_insert();
DROP TRIGGER IF EXISTS trg_guard_service_payment_insert ON public.service_payments;
CREATE TRIGGER trg_guard_service_payment_insert BEFORE INSERT ON public.service_payments FOR EACH ROW EXECUTE FUNCTION public.guard_service_command_insert();

CREATE OR REPLACE FUNCTION public.advance_service_payment(p_payment_id UUID,p_action TEXT)
RETURNS SETOF public.service_payments LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_payment public.service_payments%ROWTYPE; v_project public.service_projects%ROWTYPE; v_execution_id UUID; v_execution_number TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  SELECT * INTO v_payment FROM public.service_payments WHERE id=p_payment_id FOR UPDATE;
  IF v_actor.role NOT IN ('admin','manager') OR v_payment.id IS NULL THEN RAISE EXCEPTION '지급 처리 권한이 없습니다' USING ERRCODE='42501'; END IF;
  IF p_action='approve' AND v_payment.status IN ('requested','reviewing') THEN
    IF v_payment.created_by=v_actor.id THEN RAISE EXCEPTION '지급 요청자는 자신의 지급을 승인할 수 없습니다' USING ERRCODE='42501'; END IF;
    UPDATE public.service_payments SET status='approved',approved_by=v_actor.id,approved_at=now() WHERE id=p_payment_id RETURNING * INTO v_payment;
  ELSIF p_action='pay' AND v_payment.status='approved' THEN
    IF v_payment.approved_by=v_actor.id THEN RAISE EXCEPTION '지급 승인자와 지급 처리자는 달라야 합니다' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_project FROM public.service_projects WHERE id=v_payment.project_id FOR UPDATE;
    IF v_payment.net_amount>v_project.remaining_amount THEN RAISE EXCEPTION '용역 계약 잔액을 초과합니다' USING ERRCODE='23514'; END IF;
    v_execution_number:='BE-'||EXTRACT(YEAR FROM CURRENT_DATE)::INT||'-'||lpad(nextval('public.budget_execution_number_seq')::TEXT,6,'0');
    PERFORM set_config('app.budget_execution_create','allowed',TRUE); PERFORM set_config('app.budget_projection_update','allowed',TRUE);
    INSERT INTO public.budget_executions(execution_number,item_id,lot_id,execution_date,amount,execution_type,vendor_name,vendor_business_number,description,document_number,document_date,reference_module,reference_id,reference_number,requested_by,approved_by,approved_at,status,created_by)
    VALUES(v_execution_number,v_project.budget_item_id,v_project.lot_id,CURRENT_DATE,v_payment.net_amount,'expenditure',v_project.contractor_name,v_project.contractor_business_number,v_payment.title,v_project.document_number||'-지급-'||v_payment.payment_seq,CURRENT_DATE,'SERVICE',v_payment.id,v_payment.payment_number,v_payment.created_by,v_actor.id,now(),'executed',v_payment.created_by)
    RETURNING id INTO v_execution_id;
    UPDATE public.service_payments SET status='paid',paid_date=CURRENT_DATE,paid_amount=net_amount,budget_execution_id=v_execution_id WHERE id=p_payment_id RETURNING * INTO v_payment;
  ELSE RAISE EXCEPTION '현재 상태에서 해당 지급 명령을 수행할 수 없습니다' USING ERRCODE='55000'; END IF;
  RETURN NEXT v_payment;
END $$;

REVOKE ALL ON FUNCTION public.transition_service_project(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_service_milestone(UUID,DATE,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_service_issue(UUID,TEXT,TEXT,TEXT,TEXT,BIGINT,INTEGER,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_service_issue(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_service_contractor_contact(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_service_project(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_service_milestone(UUID,DATE,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_service_issue(UUID,TEXT,TEXT,TEXT,TEXT,BIGINT,INTEGER,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_service_issue(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_service_contractor_contact(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

COMMIT;
