ALTER TABLE public.bid_projects
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.bid_contracts
  ADD COLUMN IF NOT EXISTS signed_by UUID REFERENCES public.profiles(id);

CREATE OR REPLACE FUNCTION public.transition_bid_project(p_project_id UUID,p_target_status TEXT,p_reason TEXT DEFAULT NULL)
RETURNS SETOF public.bid_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.bid_projects%ROWTYPE; v_allowed BOOLEAN:=FALSE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager') OR NOT public.is_module_active('PROCUREMENT') THEN RAISE EXCEPTION '입찰 상태 변경 권한이 없습니다' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.bid_projects WHERE id=p_project_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION '입찰사업을 찾을 수 없습니다' USING ERRCODE='P0002'; END IF;
  v_allowed := (v_row.status IN ('draft','rejected') AND p_target_status='review')
    OR (v_row.status='review' AND p_target_status IN ('announced','rejected'))
    OR (v_row.status='announced' AND p_target_status='bidding')
    OR (v_row.status='bidding' AND p_target_status='closed')
    OR (v_row.status='closed' AND p_target_status='evaluation')
    OR (v_row.status='evaluation' AND p_target_status='awarded')
    OR (v_row.status IN ('draft','rejected','review','announced','bidding','closed','evaluation') AND p_target_status IN ('cancelled','failed'));
  IF NOT v_allowed THEN RAISE EXCEPTION '현재 단계에서 요청한 상태로 변경할 수 없습니다' USING ERRCODE='22023'; END IF;
  IF p_target_status IN ('rejected','cancelled','failed') AND BTRIM(COALESCE(p_reason,''))='' THEN RAISE EXCEPTION '반려·취소·유찰 사유가 필요합니다' USING ERRCODE='23514'; END IF;
  IF p_target_status='review' AND (BTRIM(COALESCE(v_row.document_number,''))='' OR v_row.budget_item_id IS NULL OR v_row.bid_deadline IS NULL) THEN RAISE EXCEPTION '문서번호, 승인 예산, 입찰일정을 모두 입력해야 검토 요청할 수 있습니다' USING ERRCODE='23514'; END IF;
  IF p_target_status='announced' THEN
    IF v_row.submitted_by IS NULL THEN RAISE EXCEPTION '먼저 검토 요청을 접수해야 합니다' USING ERRCODE='23514'; END IF;
    IF v_row.submitted_by=v_actor.id THEN RAISE EXCEPTION '작성·검토 요청자는 자신의 입찰을 승인할 수 없습니다' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_target_status='awarded' AND NOT EXISTS(SELECT 1 FROM public.bid_evaluations WHERE bid_project_id=v_row.id AND rank=1 AND is_qualified) THEN RAISE EXCEPTION '적격 1순위 평가 결과가 필요합니다' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.procurement_project_write','allowed',TRUE);
  UPDATE public.bid_projects SET
    status=p_target_status,
    submitted_by=CASE WHEN p_target_status='review' THEN v_actor.id ELSE submitted_by END,
    submitted_at=CASE WHEN p_target_status='review' THEN now() ELSE submitted_at END,
    approved_by=CASE WHEN p_target_status='announced' THEN v_actor.id ELSE approved_by END,
    approved_at=CASE WHEN p_target_status='announced' THEN now() ELSE approved_at END,
    rejection_reason=CASE WHEN p_target_status='rejected' THEN BTRIM(p_reason) WHEN p_target_status='review' THEN NULL ELSE rejection_reason END,
    cancel_reason=CASE WHEN p_target_status IN ('cancelled','failed') THEN BTRIM(p_reason) ELSE cancel_reason END
  WHERE id=v_row.id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.sign_bid_contract(p_contract_id UUID,p_document_number TEXT)
RETURNS SETOF public.bid_contracts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.bid_contracts%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager') OR NOT public.is_module_active('PROCUREMENT') THEN RAISE EXCEPTION '계약 서명 권한이 없습니다' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.bid_contracts WHERE id=p_contract_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.archived_at IS NOT NULL THEN RAISE EXCEPTION '유효한 계약을 찾을 수 없습니다' USING ERRCODE='P0002'; END IF;
  IF v_row.signed_at IS NOT NULL THEN RETURN NEXT v_row; RETURN; END IF;
  IF v_row.created_by=v_actor.id THEN RAISE EXCEPTION '계약 등록자는 자신의 계약을 서명 확정할 수 없습니다' USING ERRCODE='42501'; END IF;
  IF BTRIM(COALESCE(p_document_number,v_row.document_number,''))='' THEN RAISE EXCEPTION '계약 문서번호가 필요합니다' USING ERRCODE='23514'; END IF;
  PERFORM set_config('app.procurement_contract_write','allowed',TRUE);
  UPDATE public.bid_contracts SET document_number=BTRIM(COALESCE(p_document_number,document_number)),signed_at=now(),signed_by=v_actor.id WHERE id=p_contract_id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END $$;

REVOKE ALL ON FUNCTION public.sign_bid_contract(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_bid_contract(UUID,TEXT) TO authenticated;
