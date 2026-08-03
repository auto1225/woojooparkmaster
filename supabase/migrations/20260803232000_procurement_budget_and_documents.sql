-- Keep procurement budget eligibility aligned with the budget lifecycle and
-- route evidence-document writes through audited server commands.

DO $migration$
DECLARE
  v_oid OID;
  v_definition TEXT;
  v_original TEXT;
BEGIN
  SELECT p.oid
  INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_bid_project'
  ORDER BY p.oid DESC
  LIMIT 1;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'create_bid_project function is missing';
  END IF;

  v_definition := pg_get_functiondef(v_oid);
  v_original := v_definition;
  v_definition := replace(v_definition, 'status = ''approved''::text', 'status = ANY (ARRAY[''approved''::text, ''executed''::text])');
  v_definition := replace(v_definition, 'status=''approved''', 'status IN (''approved'',''executed'')');
  v_definition := replace(v_definition, 'status = ''approved''', 'status IN (''approved'',''executed'')');

  IF v_definition = v_original THEN
    RAISE EXCEPTION 'create_bid_project budget lifecycle predicate was not found';
  END IF;

  EXECUTE v_definition;
END
$migration$;

ALTER TABLE public.bid_documents
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bid_document_client_mutation
  ON public.bid_documents(client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bid_document_number
  ON public.bid_documents(document_number)
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.guard_procurement_integrity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_flag TEXT;
BEGIN
  v_flag := CASE TG_TABLE_NAME
    WHEN 'bid_projects' THEN current_setting('app.procurement_project_write', TRUE)
    WHEN 'bid_submissions' THEN current_setting('app.procurement_submission_write', TRUE)
    WHEN 'bid_evaluations' THEN current_setting('app.procurement_evaluation_write', TRUE)
    WHEN 'bid_contracts' THEN current_setting('app.procurement_contract_write', TRUE)
    WHEN 'bid_documents' THEN current_setting('app.procurement_document_write', TRUE)
    ELSE 'allowed' END;
  IF COALESCE(v_flag,'') <> 'allowed' THEN
    RAISE EXCEPTION '입찰 데이터는 검증된 업무 명령으로만 등록·변경할 수 있습니다' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' THEN NEW.row_version := OLD.row_version + 1; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_procurement_integrity ON public.bid_documents;
CREATE TRIGGER trg_guard_procurement_integrity
BEFORE INSERT OR UPDATE ON public.bid_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_procurement_integrity();

CREATE OR REPLACE FUNCTION public.register_bid_document(
  p_project_id UUID,
  p_document_number TEXT,
  p_doc_category TEXT,
  p_doc_type TEXT,
  p_title TEXT,
  p_description TEXT,
  p_version TEXT,
  p_file_path TEXT,
  p_file_format TEXT,
  p_file_size BIGINT,
  p_client_mutation_id UUID
) RETURNS SETOF public.bid_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_row public.bid_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager','editor') OR NOT public.is_module_active('PROCUREMENT') THEN
    RAISE EXCEPTION '입찰문서 등록 권한이 없습니다' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bid_projects WHERE id=p_project_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION '유효한 입찰사업을 선택하세요' USING ERRCODE='23503';
  END IF;
  IF BTRIM(COALESCE(p_document_number,''))='' OR BTRIM(COALESCE(p_title,''))=''
     OR BTRIM(COALESCE(p_doc_category,''))='' OR BTRIM(COALESCE(p_doc_type,''))=''
     OR BTRIM(COALESCE(p_file_path,''))='' THEN
    RAISE EXCEPTION '문서번호, 분류, 유형, 제목, 원문 파일은 필수입니다' USING ERRCODE='23514';
  END IF;
  IF p_file_size IS NULL OR p_file_size<=0 THEN
    RAISE EXCEPTION '빈 문서는 등록할 수 없습니다' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_row FROM public.bid_documents WHERE client_mutation_id=p_client_mutation_id;
  IF v_row.id IS NOT NULL THEN RETURN NEXT v_row; RETURN; END IF;

  PERFORM set_config('app.procurement_document_write','allowed',TRUE);
  UPDATE public.bid_documents
  SET is_current=FALSE
  WHERE bid_project_id=p_project_id AND doc_type=p_doc_type
    AND is_current=TRUE AND archived_at IS NULL;

  INSERT INTO public.bid_documents(
    bid_project_id,document_number,doc_category,doc_type,title,description,
    version,file_path,file_format,file_size,uploaded_by,is_current,client_mutation_id
  ) VALUES(
    p_project_id,BTRIM(p_document_number),p_doc_category,p_doc_type,BTRIM(p_title),
    NULLIF(BTRIM(COALESCE(p_description,'')),''),COALESCE(NULLIF(BTRIM(p_version),''),'1.0'),
    BTRIM(p_file_path),NULLIF(BTRIM(COALESCE(p_file_format,'')),''),p_file_size,
    v_actor.id,TRUE,p_client_mutation_id
  ) RETURNING * INTO v_row;
  RETURN NEXT v_row;
END $$;

CREATE OR REPLACE FUNCTION public.archive_bid_document(p_document_id UUID,p_reason TEXT)
RETURNS SETOF public.bid_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_row public.bid_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id=auth.uid() AND is_active=TRUE;
  IF v_actor.role NOT IN ('admin','manager') OR NOT public.is_module_active('PROCUREMENT') THEN
    RAISE EXCEPTION '입찰문서 보관 권한이 없습니다' USING ERRCODE='42501';
  END IF;
  IF BTRIM(COALESCE(p_reason,''))='' THEN
    RAISE EXCEPTION '보관 사유를 입력하세요' USING ERRCODE='23514';
  END IF;
  PERFORM set_config('app.procurement_document_write','allowed',TRUE);
  UPDATE public.bid_documents
  SET archived_at=now(),archived_by=v_actor.id,archive_reason=BTRIM(p_reason),is_current=FALSE
  WHERE id=p_document_id AND archived_at IS NULL
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION '보관할 문서를 찾을 수 없습니다' USING ERRCODE='P0002'; END IF;
  RETURN NEXT v_row;
END $$;

REVOKE ALL ON FUNCTION public.register_bid_document(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_bid_document(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_bid_document(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_bid_document(UUID,TEXT) TO authenticated;
