BEGIN;

ALTER TABLE public.service_deliverables
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS file_hash TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_deliverable_mutation ON public.service_deliverables(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_deliverable_document ON public.service_deliverables(document_number);
CREATE SEQUENCE IF NOT EXISTS public.service_deliverable_number_seq START 3001;

CREATE OR REPLACE FUNCTION public.register_service_deliverable(
  p_project_id UUID,p_milestone_id UUID,p_document_number TEXT,p_title TEXT,p_deliverable_type TEXT,
  p_description TEXT,p_file_path TEXT,p_file_format TEXT,p_file_size BIGINT,p_file_hash TEXT,p_client_mutation_id UUID
)
RETURNS SETOF public.service_deliverables LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.service_deliverables%ROWTYPE; v_number TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager','editor') OR NOT public.is_module_active('SERVICE') THEN RAISE EXCEPTION '성과물 제출 권한이 없습니다' USING ERRCODE='42501'; END IF;
  IF BTRIM(COALESCE(p_document_number,''))='' OR BTRIM(COALESCE(p_title,''))='' OR BTRIM(COALESCE(p_file_path,''))='' THEN RAISE EXCEPTION '문서번호, 제목과 원문 파일은 필수입니다' USING ERRCODE='23514'; END IF;
  IF p_deliverable_type NOT IN ('initial','progress','interim','final','completion','report','data','manual','other') THEN RAISE EXCEPTION '허용되지 않은 성과물 유형입니다' USING ERRCODE='23514'; END IF;
  IF p_milestone_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.service_milestones WHERE id=p_milestone_id AND project_id=p_project_id) THEN RAISE EXCEPTION '다른 사업의 마일스톤은 연결할 수 없습니다' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_row FROM public.service_deliverables WHERE client_mutation_id=p_client_mutation_id; IF v_row.id IS NOT NULL THEN RETURN NEXT v_row; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM public.service_deliverables WHERE project_id=p_project_id AND document_number=BTRIM(p_document_number) AND status<>'archived') THEN RAISE EXCEPTION '이미 사용 중인 성과물 문서번호입니다' USING ERRCODE='23505'; END IF;
  v_number:='SVC-DEL-'||EXTRACT(YEAR FROM CURRENT_DATE)::INT||'-'||lpad(nextval('public.service_deliverable_number_seq')::TEXT,6,'0');
  INSERT INTO public.service_deliverables(project_id,milestone_id,deliverable_number,document_number,title,deliverable_type,description,file_path,file_format,file_size,submitted_at,submitted_by,submitted_by_id,status,file_hash,client_mutation_id)
  VALUES(p_project_id,p_milestone_id,v_number,BTRIM(p_document_number),BTRIM(p_title),p_deliverable_type,NULLIF(BTRIM(COALESCE(p_description,'')),''),BTRIM(p_file_path),NULLIF(BTRIM(COALESCE(p_file_format,'')),''),p_file_size,now(),v_actor.name,v_actor.id,'submitted',NULLIF(BTRIM(COALESCE(p_file_hash,'')),''),p_client_mutation_id)
  RETURNING * INTO v_row; RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.review_service_deliverable(p_deliverable_id UUID,p_decision TEXT,p_note TEXT DEFAULT NULL)
RETURNS SETOF public.service_deliverables LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_row public.service_deliverables%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  SELECT * INTO v_row FROM public.service_deliverables WHERE id=p_deliverable_id FOR UPDATE;
  IF v_actor.role NOT IN ('admin','manager') OR v_row.status NOT IN ('submitted','revision_submitted') THEN RAISE EXCEPTION '제출된 성과물의 검토 권한이 없습니다' USING ERRCODE='42501'; END IF;
  IF v_row.submitted_by_id=v_actor.id THEN RAISE EXCEPTION '성과물 제출자는 자신의 성과물을 승인할 수 없습니다' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('approved','revision_required') THEN RAISE EXCEPTION '허용되지 않은 검토 결과입니다' USING ERRCODE='23514'; END IF;
  IF p_decision='revision_required' AND BTRIM(COALESCE(p_note,''))='' THEN RAISE EXCEPTION '보완 사유를 입력하세요' USING ERRCODE='23514'; END IF;
  UPDATE public.service_deliverables SET status=p_decision,review_note=NULLIF(BTRIM(COALESCE(p_note,'')),''),reviewed_by=v_actor.id,reviewed_at=now(),revision_count=revision_count+CASE WHEN p_decision='revision_required' THEN 1 ELSE 0 END
  WHERE id=p_deliverable_id RETURNING * INTO v_row; RETURN NEXT v_row;
END $$;

REVOKE ALL ON FUNCTION public.register_service_deliverable(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_service_deliverable(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_service_deliverable(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_service_deliverable(UUID,TEXT,TEXT) TO authenticated;

COMMIT;
