-- Budget workflow integrity, separation of duties, immutable accounting records,
-- and mobile-safe idempotency.

ALTER TABLE public.budget_plans
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS lot_type_at_event TEXT,
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.budget_executions
  ADD COLUMN IF NOT EXISTS lot_type_at_event TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.budget_transfers
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

-- 이관 자료도 문서번호 검색과 승인 검증에서 제외되지 않도록 추적 가능한 번호를 부여한다.
UPDATE public.budget_plans
SET document_number='이관-예산-'||fiscal_year||'-'||upper(plan_type)||'-'||lpad(plan_number::TEXT,2,'0')
WHERE BTRIM(COALESCE(document_number,''))='';

UPDATE public.budget_items item SET lot_type_at_event = lot.lot_type::TEXT
FROM public.parking_lots lot WHERE lot.id = item.lot_id AND item.lot_type_at_event IS NULL;
UPDATE public.budget_executions execution SET lot_type_at_event = lot.lot_type::TEXT
FROM public.parking_lots lot WHERE lot.id = execution.lot_id AND execution.lot_type_at_event IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_plan_client_mutation ON public.budget_plans(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_execution_client_mutation ON public.budget_executions(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_transfer_client_mutation ON public.budget_transfers(client_mutation_id) WHERE client_mutation_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.budget_plans'::regclass AND conname='budget_plan_integrity_ck') THEN
    ALTER TABLE public.budget_plans ADD CONSTRAINT budget_plan_integrity_ck CHECK (
      fiscal_year BETWEEN 2000 AND 2200 AND plan_number > 0 AND total_revenue >= 0 AND total_expenditure >= 0 AND row_version >= 1
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.budget_items'::regclass AND conname='budget_item_integrity_ck') THEN
    ALTER TABLE public.budget_items ADD CONSTRAINT budget_item_integrity_ck CHECK (
      previous_year_amount >= 0 AND requested_amount >= 0 AND planned_amount >= 0 AND allocated_amount >= 0
      AND executed_amount >= 0 AND returned_amount >= 0 AND row_version >= 1
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.budget_executions'::regclass AND conname='budget_execution_integrity_ck') THEN
    ALTER TABLE public.budget_executions ADD CONSTRAINT budget_execution_integrity_ck CHECK (
      amount > 0 AND status IN ('pending','approved','executed','rejected','cancelled') AND row_version >= 1
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.budget_transfers'::regclass AND conname='budget_transfer_integrity_ck') THEN
    ALTER TABLE public.budget_transfers ADD CONSTRAINT budget_transfer_integrity_ck CHECK (
      amount > 0 AND from_item_id <> to_item_id AND status IN ('pending','approved','executed','rejected','cancelled') AND row_version >= 1
    ) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_budget_lot_context()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.lot_type_at_event IS NULL AND NEW.lot_id IS NOT NULL THEN
    SELECT lot_type::TEXT INTO NEW.lot_type_at_event FROM public.parking_lots WHERE id=NEW.lot_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_budget_item_lot_context ON public.budget_items;
CREATE TRIGGER trg_budget_item_lot_context BEFORE INSERT ON public.budget_items FOR EACH ROW EXECUTE FUNCTION public.set_budget_lot_context();
DROP TRIGGER IF EXISTS trg_budget_execution_lot_context ON public.budget_executions;
CREATE TRIGGER trg_budget_execution_lot_context BEFORE INSERT ON public.budget_executions FOR EACH ROW EXECUTE FUNCTION public.set_budget_lot_context();

CREATE OR REPLACE FUNCTION public.guard_budget_plan_integrity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND COALESCE(current_setting('app.budget_plan_create', TRUE),'') <> 'allowed' THEN
    RAISE EXCEPTION '예산안은 생성 명령으로만 등록할 수 있습니다' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF OLD.status NOT IN ('draft','rejected')
     AND ROW(NEW.fiscal_year,NEW.plan_type,NEW.plan_number,NEW.title,NEW.document_number)
         IS DISTINCT FROM ROW(OLD.fiscal_year,OLD.plan_type,OLD.plan_number,OLD.title,OLD.document_number) THEN
    RAISE EXCEPTION '제출 후 예산안 기본정보는 수정할 수 없습니다' USING ERRCODE='55000';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND COALESCE(current_setting('app.budget_plan_transition', TRUE),'') <> 'allowed' THEN
    RAISE EXCEPTION '예산안 상태는 제출·승인 명령으로만 변경할 수 있습니다' USING ERRCODE='42501';
  END IF;
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_budget_plan_integrity ON public.budget_plans;
CREATE TRIGGER trg_guard_budget_plan_integrity BEFORE INSERT OR UPDATE ON public.budget_plans FOR EACH ROW EXECUTE FUNCTION public.guard_budget_plan_integrity();

CREATE OR REPLACE FUNCTION public.guard_budget_item_integrity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM public.budget_plans
  WHERE id=CASE WHEN TG_OP='INSERT' THEN NEW.plan_id ELSE COALESCE(NEW.plan_id,OLD.plan_id) END;
  IF TG_OP='INSERT' AND v_status NOT IN ('draft','rejected') THEN RAISE EXCEPTION '작성중 또는 반려된 예산안에만 항목을 추가할 수 있습니다' USING ERRCODE='55000'; END IF;
  IF TG_OP='INSERT' AND (COALESCE(NEW.allocated_amount,0)<>0 OR COALESCE(NEW.executed_amount,0)<>0 OR COALESCE(NEW.returned_amount,0)<>0)
     AND COALESCE(current_setting('app.budget_projection_update', TRUE),'') <> 'allowed' THEN
    RAISE EXCEPTION '신규 항목의 배정·집행·반납 누계는 0이어야 합니다' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.allocated_amount,NEW.executed_amount,NEW.returned_amount) IS DISTINCT FROM ROW(OLD.allocated_amount,OLD.executed_amount,OLD.returned_amount)
       AND COALESCE(current_setting('app.budget_projection_update', TRUE),'') <> 'allowed' THEN
      RAISE EXCEPTION '배정·집행·반납 누계는 예산 명령으로만 변경할 수 있습니다' USING ERRCODE='42501';
    END IF;
    IF NEW.planned_amount IS DISTINCT FROM OLD.planned_amount AND v_status NOT IN ('draft','rejected') THEN
      RAISE EXCEPTION '제출 후 편성액은 수정할 수 없습니다' USING ERRCODE='55000';
    END IF;
    IF v_status NOT IN ('draft','rejected')
       AND ROW(NEW.plan_id,NEW.lot_id,NEW.parent_item_id,NEW.item_code,NEW.budget_type,NEW.category_l1,NEW.category_l2,NEW.category_l3,NEW.category_l4,NEW.item_name)
           IS DISTINCT FROM ROW(OLD.plan_id,OLD.lot_id,OLD.parent_item_id,OLD.item_code,OLD.budget_type,OLD.category_l1,OLD.category_l2,OLD.category_l3,OLD.category_l4,OLD.item_name) THEN
      RAISE EXCEPTION '제출 후 예산항목 기본정보는 수정할 수 없습니다' USING ERRCODE='55000';
    END IF;
    NEW.row_version := OLD.row_version + 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_budget_item_integrity ON public.budget_items;
CREATE TRIGGER trg_guard_budget_item_integrity BEFORE INSERT OR UPDATE ON public.budget_items FOR EACH ROW EXECUTE FUNCTION public.guard_budget_item_integrity();

CREATE OR REPLACE FUNCTION public.guard_budget_execution_integrity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND COALESCE(current_setting('app.budget_execution_create', TRUE),'') <> 'allowed' THEN
    RAISE EXCEPTION '예산 집행은 등록 명령으로만 생성할 수 있습니다' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF ROW(NEW.item_id,NEW.lot_id,NEW.execution_date,NEW.amount,NEW.execution_type,NEW.document_number,NEW.status)
     IS DISTINCT FROM ROW(OLD.item_id,OLD.lot_id,OLD.execution_date,OLD.amount,OLD.execution_type,OLD.document_number,OLD.status)
     AND COALESCE(current_setting('app.budget_execution_update', TRUE),'') <> 'allowed' THEN
    RAISE EXCEPTION '예산 집행 원장은 승인 명령으로만 변경할 수 있습니다' USING ERRCODE='42501';
  END IF;
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_budget_execution_integrity ON public.budget_executions;
CREATE TRIGGER trg_guard_budget_execution_integrity BEFORE INSERT OR UPDATE ON public.budget_executions FOR EACH ROW EXECUTE FUNCTION public.guard_budget_execution_integrity();

CREATE OR REPLACE FUNCTION public.guard_budget_transfer_integrity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND COALESCE(current_setting('app.budget_transfer_create', TRUE),'') <> 'allowed' THEN
    RAISE EXCEPTION '예산 전용·이체는 등록 명령으로만 생성할 수 있습니다' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF ROW(NEW.from_item_id,NEW.to_item_id,NEW.amount,NEW.transfer_type,NEW.status)
     IS DISTINCT FROM ROW(OLD.from_item_id,OLD.to_item_id,OLD.amount,OLD.transfer_type,OLD.status)
     AND COALESCE(current_setting('app.budget_transfer_update', TRUE),'') <> 'allowed' THEN
    RAISE EXCEPTION '예산 전용·이체는 승인 명령으로만 변경할 수 있습니다' USING ERRCODE='42501';
  END IF;
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_budget_transfer_integrity ON public.budget_transfers;
CREATE TRIGGER trg_guard_budget_transfer_integrity BEFORE INSERT OR UPDATE ON public.budget_transfers FOR EACH ROW EXECUTE FUNCTION public.guard_budget_transfer_integrity();

CREATE OR REPLACE FUNCTION public.prevent_budget_hard_delete()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION '예산 원장은 삭제할 수 없습니다. 반려·취소·보관 절차를 사용하세요.' USING ERRCODE='42501'; END $$;
DO $$ DECLARE v_table TEXT; BEGIN
  FOREACH v_table IN ARRAY ARRAY['budget_plans','budget_items','budget_executions','budget_transfers'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_budget_hard_delete ON public.%I',v_table);
    EXECUTE format('CREATE TRIGGER trg_prevent_budget_hard_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_budget_hard_delete()',v_table);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.budget_audit_events(
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL, entity_id UUID NOT NULL, event_type TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id), old_data JSONB, new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_budget_audit_entity ON public.budget_audit_events(entity_type,entity_id,created_at DESC);
ALTER TABLE public.budget_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_audit_select ON public.budget_audit_events;
CREATE POLICY budget_audit_select ON public.budget_audit_events FOR SELECT TO authenticated USING(public.is_module_active('BUDGET'));
REVOKE ALL ON public.budget_audit_events FROM anon,authenticated;
GRANT SELECT ON public.budget_audit_events TO authenticated;
CREATE OR REPLACE FUNCTION public.append_budget_audit_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.budget_audit_events(entity_type,entity_id,event_type,actor_id,old_data,new_data)
  VALUES(TG_TABLE_NAME,COALESCE(NEW.id,OLD.id),lower(TG_OP),auth.uid(),CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW,OLD);
END $$;
DO $$ DECLARE v_table TEXT; BEGIN
  FOREACH v_table IN ARRAY ARRAY['budget_plans','budget_items','budget_executions','budget_transfers'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_append_budget_audit ON public.%I',v_table);
    EXECUTE format('CREATE TRIGGER trg_append_budget_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.append_budget_audit_event()',v_table);
  END LOOP;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.budget_execution_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.budget_transfer_number_seq START 1001;

CREATE OR REPLACE FUNCTION public.create_budget_plan(p_fiscal_year INTEGER,p_plan_type TEXT,p_title TEXT,p_document_number TEXT,p_author_name TEXT,p_client_mutation_id UUID)
RETURNS SETOF public.budget_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.budget_plans%ROWTYPE; v_number INTEGER;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager') OR NOT public.is_module_active('BUDGET') THEN RAISE EXCEPTION '예산안을 생성할 권한이 없습니다' USING ERRCODE='42501'; END IF;
  IF p_fiscal_year NOT BETWEEN 2000 AND 2200 OR BTRIM(COALESCE(p_title,''))='' OR BTRIM(COALESCE(p_document_number,''))='' THEN RAISE EXCEPTION '회계연도, 제목, 근거 문서번호는 필수입니다' USING ERRCODE='22023'; END IF;
  IF p_plan_type NOT IN ('original','supplementary','revised') THEN RAISE EXCEPTION '허용되지 않은 예산안 유형입니다' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_fiscal_year::TEXT||':'||p_plan_type,0));
  SELECT * INTO v_row FROM public.budget_plans WHERE client_mutation_id=p_client_mutation_id;
  IF v_row.id IS NOT NULL THEN RETURN NEXT v_row; RETURN; END IF;
  SELECT COALESCE(MAX(plan_number),0)+1 INTO v_number FROM public.budget_plans WHERE fiscal_year=p_fiscal_year AND plan_type=p_plan_type;
  PERFORM set_config('app.budget_plan_create','allowed',TRUE);
  INSERT INTO public.budget_plans(fiscal_year,plan_type,plan_number,title,document_number,created_by,author_name,client_mutation_id)
  VALUES(p_fiscal_year,p_plan_type,v_number,BTRIM(p_title),BTRIM(p_document_number),v_actor.id,NULLIF(BTRIM(COALESCE(p_author_name,'')),''),p_client_mutation_id)
  RETURNING * INTO v_row; RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.transition_budget_plan(p_plan_id UUID,p_target_status TEXT,p_reason TEXT)
RETURNS SETOF public.budget_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.budget_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager') OR NOT public.is_module_active('BUDGET') THEN RAISE EXCEPTION '예산안 처리 권한이 없습니다' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.budget_plans WHERE id=p_plan_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION '예산안을 찾을 수 없습니다' USING ERRCODE='P0002'; END IF;
  IF p_target_status='submitted' THEN
    IF v_row.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION '작성중 또는 반려 예산안만 제출할 수 있습니다' USING ERRCODE='22023'; END IF;
    IF BTRIM(COALESCE(v_row.document_number,''))='' THEN RAISE EXCEPTION '근거 문서번호가 필요합니다' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.budget_items WHERE plan_id=v_row.id AND archived_at IS NULL) THEN RAISE EXCEPTION '예산 항목을 한 건 이상 입력해주세요' USING ERRCODE='23514'; END IF;
  ELSIF p_target_status IN ('approved','rejected') THEN
    IF v_row.status<>'submitted' THEN RAISE EXCEPTION '제출된 예산안만 승인 또는 반려할 수 있습니다' USING ERRCODE='22023'; END IF;
    IF v_row.submitted_by=v_actor.id THEN RAISE EXCEPTION '본인이 제출한 예산안은 승인할 수 없습니다' USING ERRCODE='42501'; END IF;
    IF p_target_status='approved' AND BTRIM(COALESCE(v_row.document_number,''))='' THEN RAISE EXCEPTION '근거 문서번호가 없는 예산안은 승인할 수 없습니다' USING ERRCODE='23514'; END IF;
    IF p_target_status='rejected' AND BTRIM(COALESCE(p_reason,''))='' THEN RAISE EXCEPTION '반려 사유를 입력해주세요' USING ERRCODE='23514'; END IF;
  ELSE RAISE EXCEPTION '허용되지 않은 예산안 상태입니다' USING ERRCODE='22023'; END IF;
  PERFORM set_config('app.budget_plan_transition','allowed',TRUE);
  IF p_target_status='approved' THEN
    PERFORM set_config('app.budget_projection_update','allowed',TRUE);
    UPDATE public.budget_items SET allocated_amount=planned_amount WHERE plan_id=v_row.id AND archived_at IS NULL;
  END IF;
  UPDATE public.budget_plans SET status=p_target_status,
    submitted_by=CASE WHEN p_target_status='submitted' THEN v_actor.id ELSE submitted_by END,
    submitted_at=CASE WHEN p_target_status='submitted' THEN now() ELSE submitted_at END,
    approved_by=CASE WHEN p_target_status='approved' THEN v_actor.id ELSE NULL END,
    approved_at=CASE WHEN p_target_status='approved' THEN now() ELSE NULL END,
    reject_reason=CASE WHEN p_target_status='rejected' THEN BTRIM(p_reason) ELSE NULL END
  WHERE id=v_row.id RETURNING * INTO v_row; RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.create_budget_execution(
  p_item_id UUID,p_lot_id UUID,p_execution_date DATE,p_amount BIGINT,p_execution_type TEXT,p_vendor_name TEXT,
  p_description TEXT,p_document_number TEXT,p_payment_method TEXT,p_notes TEXT,p_author_name TEXT,p_client_mutation_id UUID
)
RETURNS SETOF public.budget_executions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_item public.budget_items%ROWTYPE; v_plan public.budget_plans%ROWTYPE; v_row public.budget_executions%ROWTYPE; v_number TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager','editor') OR NOT public.is_module_active('BUDGET') THEN RAISE EXCEPTION '예산 집행을 신청할 권한이 없습니다' USING ERRCODE='42501'; END IF;
  IF p_amount IS NULL OR p_amount<=0 OR p_execution_date IS NULL OR BTRIM(COALESCE(p_description,''))='' OR BTRIM(COALESCE(p_document_number,''))='' THEN RAISE EXCEPTION '집행일, 양수 금액, 내용, 지출결의서 문서번호는 필수입니다' USING ERRCODE='22023'; END IF;
  IF p_execution_type NOT IN ('expenditure','revenue_collection','transfer_in','transfer_out','return','carry_forward') THEN RAISE EXCEPTION '허용되지 않은 집행 유형입니다' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_row FROM public.budget_executions WHERE client_mutation_id=p_client_mutation_id;
  IF v_row.id IS NOT NULL THEN RETURN NEXT v_row; RETURN; END IF;
  SELECT * INTO v_item FROM public.budget_items WHERE id=p_item_id FOR UPDATE;
  SELECT * INTO v_plan FROM public.budget_plans WHERE id=v_item.plan_id;
  IF v_item.id IS NULL OR v_plan.status NOT IN ('approved','executed') OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION '집행 가능한 승인 예산항목이 아닙니다' USING ERRCODE='55000'; END IF;
  IF (p_execution_type='expenditure' AND v_item.budget_type<>'expenditure') OR (p_execution_type='revenue_collection' AND v_item.budget_type<>'revenue') THEN
    RAISE EXCEPTION '집행 유형과 예산항목의 세입·세출 구분이 일치하지 않습니다' USING ERRCODE='23514';
  END IF;
  IF p_execution_type='expenditure' AND p_amount>v_item.remaining_amount THEN RAISE EXCEPTION '집행 가능 잔액을 초과합니다: 잔액 %원',v_item.remaining_amount USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.budget_executions WHERE document_number=BTRIM(p_document_number) AND status NOT IN ('rejected','cancelled')) THEN RAISE EXCEPTION '이미 사용된 지출결의서 문서번호입니다' USING ERRCODE='23505'; END IF;
  v_number:='BE-'||v_plan.fiscal_year||'-'||lpad(nextval('public.budget_execution_number_seq')::TEXT,6,'0');
  PERFORM set_config('app.budget_execution_create','allowed',TRUE);
  INSERT INTO public.budget_executions(execution_number,item_id,lot_id,execution_date,amount,execution_type,vendor_name,description,document_number,payment_method,notes,requested_by,created_by,author_name,client_mutation_id)
  VALUES(v_number,p_item_id,p_lot_id,p_execution_date,p_amount,p_execution_type,NULLIF(BTRIM(COALESCE(p_vendor_name,'')),''),BTRIM(p_description),BTRIM(p_document_number),p_payment_method,NULLIF(BTRIM(COALESCE(p_notes,'')),''),v_actor.id,v_actor.id,NULLIF(BTRIM(COALESCE(p_author_name,'')),''),p_client_mutation_id)
  RETURNING * INTO v_row; RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.decide_budget_execution(p_execution_id UUID,p_decision TEXT,p_reason TEXT)
RETURNS SETOF public.budget_executions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.budget_executions%ROWTYPE; v_item public.budget_items%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager') OR NOT public.is_module_active('BUDGET') THEN RAISE EXCEPTION '예산 집행 승인 권한이 없습니다' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.budget_executions WHERE id=p_execution_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status<>'pending' THEN RAISE EXCEPTION '대기중인 집행만 처리할 수 있습니다' USING ERRCODE='55000'; END IF;
  IF v_row.requested_by=v_actor.id THEN RAISE EXCEPTION '본인이 신청한 집행은 승인할 수 없습니다' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('executed','rejected') THEN RAISE EXCEPTION '허용되지 않은 처리입니다' USING ERRCODE='22023'; END IF;
  IF p_decision='rejected' AND BTRIM(COALESCE(p_reason,''))='' THEN RAISE EXCEPTION '반려 사유를 입력해주세요' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_item FROM public.budget_items WHERE id=v_row.item_id FOR UPDATE;
  IF p_decision='executed' AND v_row.execution_type='expenditure' AND v_row.amount>v_item.remaining_amount THEN RAISE EXCEPTION '승인 시점의 집행 가능 잔액을 초과합니다' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.budget_execution_update','allowed',TRUE); PERFORM set_config('app.budget_projection_update','allowed',TRUE);
  UPDATE public.budget_executions SET status=p_decision,approved_by=CASE WHEN p_decision='executed' THEN v_actor.id ELSE NULL END,
    approved_at=CASE WHEN p_decision='executed' THEN now() ELSE NULL END,reject_reason=CASE WHEN p_decision='rejected' THEN BTRIM(p_reason) ELSE NULL END
  WHERE id=v_row.id RETURNING * INTO v_row; RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.create_budget_transfer(
  p_fiscal_year INTEGER,p_transfer_type TEXT,p_from_item_id UUID,p_to_item_id UUID,p_amount BIGINT,p_reason TEXT,
  p_legal_basis TEXT,p_document_number TEXT,p_author_name TEXT,p_client_mutation_id UUID
)
RETURNS SETOF public.budget_transfers LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_from public.budget_items%ROWTYPE; v_to public.budget_items%ROWTYPE; v_from_plan public.budget_plans%ROWTYPE; v_to_plan public.budget_plans%ROWTYPE; v_row public.budget_transfers%ROWTYPE; v_number TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager','editor') OR NOT public.is_module_active('BUDGET') THEN RAISE EXCEPTION '예산 전용·이체를 신청할 권한이 없습니다' USING ERRCODE='42501'; END IF;
  IF p_from_item_id=p_to_item_id OR p_amount IS NULL OR p_amount<=0 OR BTRIM(COALESCE(p_reason,''))='' OR BTRIM(COALESCE(p_document_number,''))='' THEN RAISE EXCEPTION '서로 다른 항목, 양수 금액, 사유, 근거 문서번호가 필요합니다' USING ERRCODE='22023'; END IF;
  IF p_transfer_type NOT IN ('appropriation','use','transfer','reserve') THEN RAISE EXCEPTION '허용되지 않은 전용·이체 유형입니다' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_row FROM public.budget_transfers WHERE client_mutation_id=p_client_mutation_id; IF v_row.id IS NOT NULL THEN RETURN NEXT v_row; RETURN; END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(LEAST(p_from_item_id::TEXT,p_to_item_id::TEXT)||':'||GREATEST(p_from_item_id::TEXT,p_to_item_id::TEXT),0)
  );
  SELECT * INTO v_from FROM public.budget_items WHERE id=p_from_item_id FOR UPDATE; SELECT * INTO v_to FROM public.budget_items WHERE id=p_to_item_id FOR UPDATE;
  SELECT * INTO v_from_plan FROM public.budget_plans WHERE id=v_from.plan_id; SELECT * INTO v_to_plan FROM public.budget_plans WHERE id=v_to.plan_id;
  IF v_from.id IS NULL OR v_to.id IS NULL OR v_from.archived_at IS NOT NULL OR v_to.archived_at IS NOT NULL
     OR v_from_plan.fiscal_year<>p_fiscal_year OR v_to_plan.fiscal_year<>p_fiscal_year
     OR v_from_plan.status NOT IN ('approved','executed') OR v_to_plan.status NOT IN ('approved','executed') THEN
    RAISE EXCEPTION '같은 회계연도의 승인된 예산항목만 이동할 수 있습니다' USING ERRCODE='23514';
  END IF;
  IF p_transfer_type IN ('appropriation','use') AND v_from.plan_id<>v_to.plan_id THEN RAISE EXCEPTION '전용·이용은 동일 예산안 항목 사이에서만 가능합니다' USING ERRCODE='23514'; END IF;
  IF p_amount>v_from.remaining_amount THEN RAISE EXCEPTION '감액 항목 잔액을 초과합니다' USING ERRCODE='23514'; END IF;
  IF p_transfer_type='appropriation' AND v_from.category_l2 IS DISTINCT FROM v_to.category_l2 THEN RAISE EXCEPTION '전용은 동일 관 내에서만 가능합니다' USING ERRCODE='23514'; END IF;
  v_number:='BT-'||p_fiscal_year||'-'||lpad(nextval('public.budget_transfer_number_seq')::TEXT,6,'0');
  PERFORM set_config('app.budget_transfer_create','allowed',TRUE);
  INSERT INTO public.budget_transfers(transfer_number,fiscal_year,transfer_type,from_item_id,to_item_id,amount,reason,legal_basis,document_number,requested_by,created_by,author_name,client_mutation_id)
  VALUES(v_number,p_fiscal_year,p_transfer_type,p_from_item_id,p_to_item_id,p_amount,BTRIM(p_reason),NULLIF(BTRIM(COALESCE(p_legal_basis,'')),''),BTRIM(p_document_number),v_actor.id,v_actor.id,NULLIF(BTRIM(COALESCE(p_author_name,'')),''),p_client_mutation_id)
  RETURNING * INTO v_row; RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.decide_budget_transfer(p_transfer_id UUID,p_decision TEXT,p_reason TEXT)
RETURNS SETOF public.budget_transfers LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.budget_transfers%ROWTYPE; v_from public.budget_items%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager') OR NOT public.is_module_active('BUDGET') THEN RAISE EXCEPTION '예산 전용·이체 승인 권한이 없습니다' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.budget_transfers WHERE id=p_transfer_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status<>'pending' THEN RAISE EXCEPTION '대기중인 전용·이체만 처리할 수 있습니다' USING ERRCODE='55000'; END IF;
  IF v_row.requested_by=v_actor.id THEN RAISE EXCEPTION '본인이 신청한 전용·이체는 승인할 수 없습니다' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('executed','rejected') THEN RAISE EXCEPTION '허용되지 않은 처리입니다' USING ERRCODE='22023'; END IF;
  IF p_decision='rejected' AND BTRIM(COALESCE(p_reason,''))='' THEN RAISE EXCEPTION '반려 사유를 입력해주세요' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_from FROM public.budget_items WHERE id=v_row.from_item_id FOR UPDATE;
  IF p_decision='executed' AND v_row.amount>v_from.remaining_amount THEN RAISE EXCEPTION '승인 시점의 감액 가능 잔액을 초과합니다' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.budget_transfer_update','allowed',TRUE); PERFORM set_config('app.budget_projection_update','allowed',TRUE);
  UPDATE public.budget_transfers SET status=p_decision,approved_by=CASE WHEN p_decision='executed' THEN v_actor.id ELSE NULL END,
    approved_at=CASE WHEN p_decision='executed' THEN now() ELSE NULL END,reject_reason=CASE WHEN p_decision='rejected' THEN BTRIM(p_reason) ELSE NULL END
  WHERE id=v_row.id RETURNING * INTO v_row; RETURN NEXT v_row;
END $$;

ALTER VIEW public.budget_plan_summary SET (security_invoker=TRUE);
ALTER VIEW public.budget_execution_monthly SET (security_invoker=TRUE);

REVOKE ALL ON FUNCTION public.create_budget_plan(INTEGER,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_budget_plan(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_budget_execution(UUID,UUID,DATE,BIGINT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_budget_execution(UUID,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_budget_transfer(INTEGER,TEXT,UUID,UUID,BIGINT,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_budget_transfer(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_budget_plan(INTEGER,TEXT,TEXT,TEXT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_budget_plan(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_budget_execution(UUID,UUID,DATE,BIGINT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_budget_execution(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_budget_transfer(INTEGER,TEXT,UUID,UUID,BIGINT,TEXT,TEXT,TEXT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_budget_transfer(UUID,TEXT,TEXT) TO authenticated;
