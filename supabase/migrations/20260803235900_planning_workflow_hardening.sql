-- Keep candidate decisions, construction phases, permits and planning records auditable.
ALTER TABLE public.site_candidates
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.construction_projects
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lot_type_snapshot public.lot_type_enum,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.permits
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS official_document_number TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.design_documents
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

UPDATE public.construction_projects project
SET lot_type_snapshot=site.planned_lot_type
FROM public.site_candidates site
WHERE site.id=project.site_id AND project.lot_type_snapshot IS NULL AND site.planned_lot_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_candidate_mutation
  ON public.site_candidates(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_construction_project_mutation
  ON public.construction_projects(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_permit_mutation
  ON public.permits(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
WITH ranked_documents AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, doc_type ORDER BY created_at DESC, id DESC) AS row_rank
  FROM public.design_documents WHERE is_current AND archived_at IS NULL
)
UPDATE public.design_documents SET is_current=FALSE
WHERE id IN (SELECT id FROM ranked_documents WHERE row_rank>1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_current_design_document
  ON public.design_documents(project_id, doc_type)
  WHERE is_current AND archived_at IS NULL;

ALTER TABLE public.site_candidates DROP CONSTRAINT IF EXISTS site_candidate_score_range;
ALTER TABLE public.site_candidates ADD CONSTRAINT site_candidate_score_range CHECK (
  COALESCE(location_score, 0) BETWEEN 0 AND 100 AND
  COALESCE(accessibility_score, 0) BETWEEN 0 AND 100 AND
  COALESCE(demand_score, 0) BETWEEN 0 AND 100 AND
  COALESCE(feasibility_score, 0) BETWEEN 0 AND 100 AND
  COALESCE(legal_score, 0) BETWEEN 0 AND 100
);
ALTER TABLE public.construction_projects DROP CONSTRAINT IF EXISTS construction_progress_range;
ALTER TABLE public.construction_projects ADD CONSTRAINT construction_progress_range CHECK (progress_pct BETWEEN 0 AND 100);
ALTER TABLE public.permits DROP CONSTRAINT IF EXISTS permit_date_order;
ALTER TABLE public.permits ADD CONSTRAINT permit_date_order CHECK (
  expiry_date IS NULL OR actual_approval_date IS NULL OR expiry_date >= actual_approval_date
);

CREATE TABLE IF NOT EXISTS public.planning_number_counters (
  record_kind TEXT NOT NULL,
  record_year INTEGER NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(record_kind, record_year)
);
ALTER TABLE public.planning_number_counters ENABLE ROW LEVEL SECURITY;

INSERT INTO public.planning_number_counters(record_kind,record_year,last_value)
SELECT 'site',EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,COALESCE(MAX(split_part(site_number,'-',3)::INTEGER),0)
FROM public.site_candidates WHERE site_number ~ ('^SC-'||EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER||'-[0-9]+$')
ON CONFLICT(record_kind,record_year) DO UPDATE SET last_value=GREATEST(public.planning_number_counters.last_value,EXCLUDED.last_value);
INSERT INTO public.planning_number_counters(record_kind,record_year,last_value)
SELECT 'project',EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,COALESCE(MAX(split_part(project_number,'-',3)::INTEGER),0)
FROM public.construction_projects WHERE project_number ~ ('^CP-'||EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER||'-[0-9]+$')
ON CONFLICT(record_kind,record_year) DO UPDATE SET last_value=GREATEST(public.planning_number_counters.last_value,EXCLUDED.last_value);

CREATE OR REPLACE FUNCTION public.next_planning_number(p_kind TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER; v_value INTEGER; v_prefix TEXT;
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin','manager','editor') THEN RAISE EXCEPTION '신설기획 편집 권한이 없습니다.'; END IF;
  v_prefix := CASE p_kind WHEN 'site' THEN 'SC' WHEN 'project' THEN 'CP' ELSE NULL END;
  IF v_prefix IS NULL THEN RAISE EXCEPTION '지원하지 않는 발번 유형입니다.'; END IF;
  INSERT INTO public.planning_number_counters(record_kind, record_year, last_value)
  VALUES (p_kind, v_year, 1)
  ON CONFLICT(record_kind, record_year) DO UPDATE SET last_value=public.planning_number_counters.last_value+1
  RETURNING last_value INTO v_value;
  RETURN v_prefix||'-'||v_year||'-'||LPAD(v_value::TEXT, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_site_candidate(p_payload JSONB, p_client_mutation_id UUID)
RETURNS SETOF public.site_candidates LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.site_candidates%ROWTYPE; v_number TEXT;
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin','manager','editor') THEN RAISE EXCEPTION '후보부지 등록 권한이 없습니다.'; END IF;
  IF NULLIF(BTRIM(p_payload->>'name'),'') IS NULL THEN RAISE EXCEPTION '부지명을 입력해 주세요.'; END IF;
  IF p_client_mutation_id IS NULL THEN RAISE EXCEPTION '모바일 중복 방지 식별자가 필요합니다.'; END IF;
  SELECT * INTO v_row FROM public.site_candidates WHERE client_mutation_id=p_client_mutation_id;
  IF FOUND THEN RETURN NEXT v_row; RETURN; END IF;
  v_number := public.next_planning_number('site');
  INSERT INTO public.site_candidates(
    site_number,name,address_jibun,address_road,latitude,longitude,administrative_dong,area_sqm,shape,frontage_m,depth_m,slope_pct,ground_condition,
    zoning,land_use,land_category,ownership,owner_name,acquisition_method,estimated_land_cost,planned_lot_type,estimated_spaces,estimated_floors,
    building_coverage_ratio,floor_area_ratio,height_limit_m,setback_m,nearest_road,road_width_m,traffic_volume,public_transport_access,pedestrian_access,
    nearby_facilities,surrounding_population,surrounding_commercial_area,legal_restrictions,environmental_review,traffic_impact_review,cultural_heritage_review,
    created_by,author_name,client_mutation_id,status
  ) VALUES (
    v_number,BTRIM(p_payload->>'name'),NULLIF(BTRIM(p_payload->>'address_jibun'),''),NULLIF(BTRIM(p_payload->>'address_road'),''),
    NULLIF(p_payload->>'latitude','')::NUMERIC,NULLIF(p_payload->>'longitude','')::NUMERIC,NULLIF(BTRIM(p_payload->>'administrative_dong'),''),NULLIF(p_payload->>'area_sqm','')::NUMERIC,
    NULLIF(p_payload->>'shape',''),NULLIF(p_payload->>'frontage_m','')::NUMERIC,NULLIF(p_payload->>'depth_m','')::NUMERIC,NULLIF(p_payload->>'slope_pct','')::NUMERIC,NULLIF(BTRIM(p_payload->>'ground_condition'),''),
    NULLIF(BTRIM(p_payload->>'zoning'),''),NULLIF(BTRIM(p_payload->>'land_use'),''),NULLIF(BTRIM(p_payload->>'land_category'),''),NULLIF(p_payload->>'ownership',''),NULLIF(BTRIM(p_payload->>'owner_name'),''),
    NULLIF(p_payload->>'acquisition_method',''),NULLIF(p_payload->>'estimated_land_cost','')::BIGINT,NULLIF(p_payload->>'planned_lot_type','')::public.lot_type_enum,NULLIF(p_payload->>'estimated_spaces','')::INTEGER,
    COALESCE(NULLIF(p_payload->>'estimated_floors','')::INTEGER,1),NULLIF(p_payload->>'building_coverage_ratio','')::NUMERIC,NULLIF(p_payload->>'floor_area_ratio','')::NUMERIC,
    NULLIF(p_payload->>'height_limit_m','')::NUMERIC,NULLIF(p_payload->>'setback_m','')::NUMERIC,NULLIF(BTRIM(p_payload->>'nearest_road'),''),NULLIF(p_payload->>'road_width_m','')::NUMERIC,
    NULLIF(BTRIM(p_payload->>'traffic_volume'),''),NULLIF(BTRIM(p_payload->>'public_transport_access'),''),NULLIF(BTRIM(p_payload->>'pedestrian_access'),''),NULLIF(BTRIM(p_payload->>'nearby_facilities'),''),
    NULLIF(p_payload->>'surrounding_population','')::INTEGER,NULLIF(p_payload->>'surrounding_commercial_area','')::NUMERIC,NULLIF(BTRIM(p_payload->>'legal_restrictions'),''),
    COALESCE((p_payload->>'environmental_review')::BOOLEAN,FALSE),COALESCE((p_payload->>'traffic_impact_review')::BOOLEAN,FALSE),COALESCE((p_payload->>'cultural_heritage_review')::BOOLEAN,FALSE),
    auth.uid(),NULLIF(BTRIM(p_payload->>'author_name'),''),p_client_mutation_id,'candidate'
  ) RETURNING * INTO v_row;
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_site_candidate(p_site_id UUID, p_status TEXT, p_note TEXT, p_expected_version INTEGER DEFAULT NULL)
RETURNS SETOF public.site_candidates LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.site_candidates%ROWTYPE;
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin','manager') THEN RAISE EXCEPTION '후보지 결정은 관리자 또는 팀장만 할 수 있습니다.'; END IF;
  SELECT * INTO v_row FROM public.site_candidates WHERE id=p_site_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '후보부지를 찾을 수 없습니다.'; END IF;
  IF p_expected_version IS NOT NULL AND v_row.row_version<>p_expected_version THEN RAISE EXCEPTION '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.'; END IF;
  IF p_status NOT IN ('evaluating','selected','rejected') THEN RAISE EXCEPTION '지원하지 않는 결정입니다.'; END IF;
  IF LENGTH(BTRIM(COALESCE(p_note,'')))<10 THEN RAISE EXCEPTION '결정 사유와 보완조건을 10자 이상 입력해 주세요.'; END IF;
  IF p_status IN ('selected','rejected') AND NOT EXISTS (
    SELECT 1 FROM public.attachments a WHERE a.module='PLANNING' AND a.ref_id=p_site_id AND a.ref_type='official_document_link'
  ) THEN RAISE EXCEPTION '선정 또는 탈락 전 공식 검토문서를 연결해 주세요.'; END IF;
  IF p_status='selected' AND (COALESCE(v_row.total_score,0)<60 OR v_row.bc_ratio IS NULL OR v_row.estimated_spaces IS NULL OR v_row.planned_lot_type IS NULL) THEN
    RAISE EXCEPTION '평가점수, B/C, 계획면수와 주차장 유형을 먼저 확정해 주세요.';
  END IF;
  PERFORM set_config('app.planning_command','allowed',TRUE);
  UPDATE public.site_candidates SET status=p_status,decision_date=CURRENT_DATE,decision_note=BTRIM(p_note),row_version=row_version+1
  WHERE id=p_site_id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_construction_project(
  p_site_id UUID,p_project_name TEXT,p_project_type TEXT,p_description TEXT,p_contractor TEXT,p_supervisor TEXT,p_designer TEXT,
  p_target_completion DATE,p_design_cost BIGINT,p_construction_cost BIGINT,p_supervision_cost BIGINT,p_other_cost BIGINT,p_author_name TEXT,p_client_mutation_id UUID
) RETURNS SETOF public.construction_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_site public.site_candidates%ROWTYPE; v_row public.construction_projects%ROWTYPE; v_number TEXT; v_total BIGINT;
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin','manager','editor') THEN RAISE EXCEPTION '공사사업 등록 권한이 없습니다.'; END IF;
  IF p_client_mutation_id IS NULL THEN RAISE EXCEPTION '모바일 중복 방지 식별자가 필요합니다.'; END IF;
  SELECT * INTO v_row FROM public.construction_projects WHERE client_mutation_id=p_client_mutation_id;
  IF FOUND THEN RETURN NEXT v_row; RETURN; END IF;
  SELECT * INTO v_site FROM public.site_candidates WHERE id=p_site_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_site.status<>'selected' THEN RAISE EXCEPTION '공식 결정이 완료된 선정 후보지만 사업으로 전환할 수 있습니다.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.attachments a WHERE a.module='PLANNING' AND a.ref_id=p_site_id AND a.ref_type='official_document_link') THEN
    RAISE EXCEPTION '후보지 선정 공식문서를 먼저 연결해 주세요.';
  END IF;
  IF NULLIF(BTRIM(p_project_name),'') IS NULL THEN RAISE EXCEPTION '사업명을 입력해 주세요.'; END IF;
  v_number:=public.next_planning_number('project');
  v_total:=COALESCE(p_design_cost,0)+COALESCE(p_construction_cost,0)+COALESCE(p_supervision_cost,0)+COALESCE(p_other_cost,0);
  INSERT INTO public.construction_projects(project_number,project_name,site_id,project_type,description,contractor,supervisor,designer,total_budget,design_cost,construction_cost,supervision_cost,other_cost,target_completion,planning_start,status,phase,lot_type_snapshot,created_by,author_name,client_mutation_id)
  VALUES(v_number,BTRIM(p_project_name),p_site_id,COALESCE(NULLIF(p_project_type,''),'new_construction'),NULLIF(BTRIM(p_description),''),NULLIF(BTRIM(p_contractor),''),NULLIF(BTRIM(p_supervisor),''),NULLIF(BTRIM(p_designer),''),NULLIF(v_total,0),COALESCE(p_design_cost,0),COALESCE(p_construction_cost,0),COALESCE(p_supervision_cost,0),COALESCE(p_other_cost,0),p_target_completion,CURRENT_DATE,'planning','planning',v_site.planned_lot_type,auth.uid(),NULLIF(BTRIM(p_author_name),''),p_client_mutation_id)
  RETURNING * INTO v_row;
  PERFORM set_config('app.planning_command','allowed',TRUE);
  UPDATE public.site_candidates SET status='construction',row_version=row_version+1 WHERE id=p_site_id;
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_construction_phase(p_project_id UUID,p_target_phase TEXT,p_expected_version INTEGER DEFAULT NULL)
RETURNS SETOF public.construction_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.construction_projects%ROWTYPE; v_current INTEGER; v_target INTEGER; v_required TEXT[]; v_missing INTEGER;
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin','manager','editor') THEN RAISE EXCEPTION '사업 단계 변경 권한이 없습니다.'; END IF;
  SELECT * INTO v_row FROM public.construction_projects WHERE id=p_project_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '공사사업을 찾을 수 없습니다.'; END IF;
  IF p_expected_version IS NOT NULL AND v_row.row_version<>p_expected_version THEN RAISE EXCEPTION '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.'; END IF;
  v_current:=array_position(ARRAY['planning','basic_design','detail_design','permitting','bidding','construction','inspection','completion'],v_row.phase);
  v_target:=array_position(ARRAY['planning','basic_design','detail_design','permitting','bidding','construction','inspection','completion'],p_target_phase);
  IF v_target IS NULL OR v_target<>v_current+1 THEN RAISE EXCEPTION '사업 단계는 현재 단계의 다음 단계로만 진행할 수 있습니다.'; END IF;
  IF p_target_phase='basic_design' AND NOT EXISTS (SELECT 1 FROM public.attachments a WHERE a.module='PLANNING' AND a.ref_id=v_row.site_id AND a.ref_type='official_document_link') THEN RAISE EXCEPTION '후보지 선정 공식문서가 필요합니다.'; END IF;
  IF p_target_phase='detail_design' AND NOT EXISTS (SELECT 1 FROM public.design_documents d WHERE d.project_id=p_project_id AND d.doc_type='basic_design' AND d.is_current AND d.archived_at IS NULL AND d.review_status IN ('approved','final')) THEN RAISE EXCEPTION '승인된 기본설계도가 필요합니다.'; END IF;
  IF p_target_phase='permitting' AND NOT EXISTS (SELECT 1 FROM public.design_documents d WHERE d.project_id=p_project_id AND d.doc_type='detailed_design' AND d.is_current AND d.archived_at IS NULL AND d.review_status IN ('approved','final')) THEN RAISE EXCEPTION '승인된 실시설계도가 필요합니다.'; END IF;
  IF p_target_phase='bidding' THEN
    v_required:=CASE v_row.lot_type_snapshot WHEN 'multilevel' THEN ARRAY['건축허가','교통영향평가','소방동의'] WHEN 'onstreet' THEN ARRAY['도로점용허가','교통영향평가'] ELSE ARRAY['개발행위허가','교통영향평가','배수시설허가'] END;
    SELECT COUNT(*) INTO v_missing FROM unnest(v_required) r(t) WHERE NOT EXISTS (SELECT 1 FROM public.permits p WHERE p.project_id=p_project_id AND p.permit_type=r.t AND p.archived_at IS NULL AND p.status IN ('approved','conditional_approved') AND NULLIF(BTRIM(p.permit_number),'') IS NOT NULL AND NULLIF(BTRIM(p.official_document_number),'') IS NOT NULL AND (p.expiry_date IS NULL OR p.expiry_date>=CURRENT_DATE));
    IF v_missing>0 THEN RAISE EXCEPTION '주차장 유형별 필수 인허가 승인과 허가문서를 모두 등록해 주세요.'; END IF;
  END IF;
  IF p_target_phase='construction' AND (v_row.budget_item_id IS NULL OR v_row.bid_contract_id IS NULL) THEN RAISE EXCEPTION '승인 예산과 체결 계약을 먼저 연결해 주세요.'; END IF;
  IF p_target_phase='inspection' AND COALESCE(v_row.progress_pct,0)<100 THEN RAISE EXCEPTION '공정률 100%% 확인 후 준공검수로 이동할 수 있습니다.'; END IF;
  IF p_target_phase='completion' THEN RAISE EXCEPTION '준공·운영 전환 탭에서 인수인계 명령을 사용해 주세요.'; END IF;
  PERFORM set_config('app.planning_command','allowed',TRUE);
  UPDATE public.construction_projects SET phase=p_target_phase,status=CASE WHEN p_target_phase='planning' THEN 'planning' ELSE 'in_progress' END,row_version=row_version+1,
    design_start=CASE WHEN p_target_phase='basic_design' THEN COALESCE(design_start,CURRENT_DATE) ELSE design_start END,
    construction_start=CASE WHEN p_target_phase='construction' THEN COALESCE(construction_start,CURRENT_DATE) ELSE construction_start END
  WHERE id=p_project_id RETURNING * INTO v_row;
  INSERT INTO public.activity_logs(user_id,module,action,target_type,target_id,target_name,details) VALUES(auth.uid(),'PLANNING','사업단계변경','construction_project',v_row.id,v_row.project_number,jsonb_build_object('phase',p_target_phase));
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_construction_project_sources(
  p_project_id UUID,p_budget_item_id UUID,p_bid_contract_id UUID,p_service_project_id UUID DEFAULT NULL,p_expected_version INTEGER DEFAULT NULL
) RETURNS SETOF public.construction_projects LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.construction_projects%ROWTYPE; v_budget_plan_status TEXT; v_contract public.bid_contracts%ROWTYPE; v_contract_budget UUID;
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin','manager','editor') THEN RAISE EXCEPTION '사업 연계 변경 권한이 없습니다.'; END IF;
  SELECT * INTO v_row FROM public.construction_projects WHERE id=p_project_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '공사사업을 찾을 수 없습니다.'; END IF;
  IF p_expected_version IS NOT NULL AND v_row.row_version<>p_expected_version THEN RAISE EXCEPTION '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.'; END IF;
  SELECT plan.status INTO v_budget_plan_status FROM public.budget_items item JOIN public.budget_plans plan ON plan.id=item.plan_id
  WHERE item.id=p_budget_item_id AND item.archived_at IS NULL AND plan.archived_at IS NULL;
  IF v_budget_plan_status NOT IN ('approved','executed') THEN RAISE EXCEPTION '승인 또는 집행중인 예산항목만 연결할 수 있습니다.'; END IF;
  SELECT * INTO v_contract FROM public.bid_contracts WHERE id=p_bid_contract_id AND archived_at IS NULL;
  IF NOT FOUND OR v_contract.signed_at IS NULL OR v_contract.status<>'active' THEN RAISE EXCEPTION '서명 완료된 유효 계약만 연결할 수 있습니다.'; END IF;
  SELECT budget_item_id INTO v_contract_budget FROM public.bid_projects WHERE id=v_contract.bid_project_id AND archived_at IS NULL;
  IF v_contract_budget IS DISTINCT FROM p_budget_item_id THEN RAISE EXCEPTION '계약의 승인 예산항목이 선택한 예산과 일치하지 않습니다.'; END IF;
  IF p_service_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.service_projects WHERE id=p_service_project_id AND bid_contract_id=p_bid_contract_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION '선택한 용역사업이 해당 계약과 연결되어 있지 않습니다.';
  END IF;
  PERFORM set_config('app.planning_command','allowed',TRUE);
  UPDATE public.construction_projects SET budget_item_id=p_budget_item_id,bid_contract_id=p_bid_contract_id,service_project_id=p_service_project_id,row_version=row_version+1
  WHERE id=p_project_id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_permit(p_permit_id UUID,p_action TEXT,p_permit_number TEXT DEFAULT NULL,p_document_number TEXT DEFAULT NULL,p_note TEXT DEFAULT NULL,p_expiry_date DATE DEFAULT NULL,p_expected_version INTEGER DEFAULT NULL)
RETURNS SETOF public.permits LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.permits%ROWTYPE; v_doc_id UUID; v_status TEXT;
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin','manager','editor') THEN RAISE EXCEPTION '인허가 처리 권한이 없습니다.'; END IF;
  SELECT * INTO v_row FROM public.permits WHERE id=p_permit_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '인허가 기록을 찾을 수 없습니다.'; END IF;
  IF p_expected_version IS NOT NULL AND v_row.row_version<>p_expected_version THEN RAISE EXCEPTION '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.'; END IF;
  IF p_action='submit' THEN
    IF v_row.status NOT IN ('not_started','preparing','resubmitting') THEN RAISE EXCEPTION '현재 상태에서는 제출할 수 없습니다.'; END IF;
    v_status:='submitted';
  ELSIF p_action IN ('approve','conditional_approve','supplement') THEN
    IF p_action<>'supplement' AND v_row.status NOT IN ('submitted','reviewing') THEN RAISE EXCEPTION '제출 또는 심사중 인허가만 승인할 수 있습니다.'; END IF;
    IF p_action='supplement' AND v_row.status NOT IN ('approved','conditional_approved') THEN RAISE EXCEPTION '승인된 인허가의 근거만 보완할 수 있습니다.'; END IF;
    IF NULLIF(BTRIM(p_permit_number),'') IS NULL OR NULLIF(BTRIM(p_document_number),'') IS NULL THEN RAISE EXCEPTION '허가번호와 승인 공식문서 번호를 입력해 주세요.'; END IF;
    SELECT id INTO v_doc_id FROM public.code_master WHERE group_code='OFFICIAL_DOCUMENT' AND is_active AND (extra->>'document_number'=BTRIM(p_document_number) OR name_en=BTRIM(p_document_number)) LIMIT 1;
    IF v_doc_id IS NULL THEN RAISE EXCEPTION '문서대장에서 승인 공식문서를 찾을 수 없습니다.'; END IF;
    IF p_action='conditional_approve' AND LENGTH(BTRIM(COALESCE(p_note,'')))<5 THEN RAISE EXCEPTION '조건부 승인 조건을 입력해 주세요.'; END IF;
    v_status:=CASE WHEN p_action='conditional_approve' THEN 'conditional_approved' ELSE v_row.status END;
    IF p_action='approve' THEN v_status:='approved'; END IF;
  ELSIF p_action='reject' THEN
    IF v_row.status NOT IN ('submitted','reviewing') OR LENGTH(BTRIM(COALESCE(p_note,'')))<5 THEN RAISE EXCEPTION '반려 사유를 5자 이상 입력해 주세요.'; END IF;
    v_status:='rejected';
  ELSE RAISE EXCEPTION '지원하지 않는 인허가 처리입니다.'; END IF;
  PERFORM set_config('app.planning_command','allowed',TRUE);
  UPDATE public.permits SET status=v_status,application_date=CASE WHEN p_action='submit' THEN COALESCE(application_date,CURRENT_DATE) ELSE application_date END,
    permit_number=CASE WHEN p_action IN ('approve','conditional_approve','supplement') THEN BTRIM(p_permit_number) ELSE permit_number END,
    official_document_number=CASE WHEN p_action IN ('approve','conditional_approve','supplement') THEN BTRIM(p_document_number) ELSE official_document_number END,
    approval_doc_path=CASE WHEN p_action IN ('approve','conditional_approve','supplement') THEN 'parkmaster-document://'||v_doc_id ELSE approval_doc_path END,
    actual_approval_date=CASE WHEN p_action IN ('approve','conditional_approve') THEN CURRENT_DATE ELSE actual_approval_date END,
    expiry_date=COALESCE(p_expiry_date,expiry_date),conditions=CASE WHEN p_action='conditional_approve' THEN BTRIM(p_note) ELSE conditions END,
    rejection_reason=CASE WHEN p_action='reject' THEN BTRIM(p_note) ELSE rejection_reason END,row_version=row_version+1
  WHERE id=p_permit_id RETURNING * INTO v_row;
  IF v_doc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.attachments WHERE module='PLANNING' AND ref_id=p_permit_id AND ref_type='official_document_link' AND file_path='parkmaster-document://'||v_doc_id) THEN
    INSERT INTO public.attachments(module,ref_id,ref_type,category,file_name,file_path,mime_type,thumbnail_path,uploaded_by)
    VALUES('PLANNING',p_permit_id,'official_document_link','approval',v_row.permit_number,'parkmaster-document://'||v_doc_id,'application/vnd.parkmaster.document-link','/planning/permits',auth.uid());
  END IF;
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_planning_document(p_document_id UUID,p_status TEXT,p_comments TEXT,p_expected_version INTEGER DEFAULT NULL)
RETURNS SETOF public.design_documents LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.design_documents%ROWTYPE; v_role TEXT;
BEGIN
  v_role:=public.get_user_role(auth.uid());
  IF v_role NOT IN ('admin','manager','editor') THEN RAISE EXCEPTION '도면 검토 권한이 없습니다.'; END IF;
  SELECT * INTO v_row FROM public.design_documents WHERE id=p_document_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '도면을 찾을 수 없습니다.'; END IF;
  IF p_expected_version IS NOT NULL AND v_row.row_version<>p_expected_version THEN RAISE EXCEPTION '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.'; END IF;
  IF p_status NOT IN ('submitted','reviewing','approved','revision_required','final') THEN RAISE EXCEPTION '지원하지 않는 검토 상태입니다.'; END IF;
  IF p_status IN ('approved','final') AND v_role NOT IN ('admin','manager') THEN RAISE EXCEPTION '도면 승인은 관리자 또는 팀장만 할 수 있습니다.'; END IF;
  IF p_status IN ('approved','revision_required','final') AND LENGTH(BTRIM(COALESCE(p_comments,'')))<5 THEN RAISE EXCEPTION '검토 의견을 5자 이상 입력해 주세요.'; END IF;
  PERFORM set_config('app.planning_command','allowed',TRUE);
  UPDATE public.design_documents SET review_status=p_status,review_comments=NULLIF(BTRIM(p_comments),''),row_version=row_version+1,
    reviewed_by=auth.uid(),reviewed_at=now(),approved_by=CASE WHEN p_status IN ('approved','final') THEN auth.uid() ELSE approved_by END,
    approved_at=CASE WHEN p_status IN ('approved','final') THEN now() ELSE approved_at END
  WHERE id=p_document_id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_design_document(p_document_id UUID,p_reason TEXT)
RETURNS SETOF public.design_documents LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.design_documents%ROWTYPE;
BEGIN
  IF public.get_user_role(auth.uid()) NOT IN ('admin','manager') THEN RAISE EXCEPTION '도면 보관 권한이 없습니다.'; END IF;
  IF LENGTH(BTRIM(COALESCE(p_reason,'')))<5 THEN RAISE EXCEPTION '보관 사유를 5자 이상 입력해 주세요.'; END IF;
  SELECT * INTO v_row FROM public.design_documents WHERE id=p_document_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '도면을 찾을 수 없습니다.'; END IF;
  IF v_row.review_status IN ('approved','final') THEN RAISE EXCEPTION '승인·최종 도면은 기록관리 검토 없이 보관할 수 없습니다.'; END IF;
  PERFORM set_config('app.planning_command','allowed',TRUE);
  UPDATE public.design_documents SET archived_at=now(),archive_reason=BTRIM(p_reason),archived_by=auth.uid(),is_current=FALSE,row_version=row_version+1 WHERE id=p_document_id RETURNING * INTO v_row;
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_planning_workflow_write()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    CASE TG_TABLE_NAME
      WHEN 'site_candidates' THEN IF NEW.status<>'candidate' THEN RAISE EXCEPTION '후보부지는 후보 상태로 등록해야 합니다.'; END IF;
      WHEN 'construction_projects' THEN IF NEW.phase<>'planning' OR NEW.status<>'planning' THEN RAISE EXCEPTION '공사사업은 기획 상태로 등록해야 합니다.'; END IF;
      WHEN 'permits' THEN IF NEW.status<>'not_started' THEN RAISE EXCEPTION '인허가는 미착수 상태로 등록해야 합니다.'; END IF;
      ELSE NULL;
    END CASE;
    RETURN NEW;
  END IF;
  IF COALESCE(current_setting('app.planning_command',TRUE),'')<>'allowed' THEN
    CASE TG_TABLE_NAME
      WHEN 'site_candidates' THEN IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('selected','rejected','construction','completed') THEN RAISE EXCEPTION '후보지 상태는 의사결정 명령으로 변경해 주세요.'; END IF;
      WHEN 'construction_projects' THEN IF NEW.phase IS DISTINCT FROM OLD.phase OR NEW.status IS DISTINCT FROM OLD.status OR NEW.budget_item_id IS DISTINCT FROM OLD.budget_item_id OR NEW.bid_contract_id IS DISTINCT FROM OLD.bid_contract_id THEN RAISE EXCEPTION '사업 단계와 연계는 전용 명령으로 변경해 주세요.'; END IF;
      WHEN 'permits' THEN IF NEW.status IS DISTINCT FROM OLD.status OR NEW.permit_number IS DISTINCT FROM OLD.permit_number OR NEW.official_document_number IS DISTINCT FROM OLD.official_document_number THEN RAISE EXCEPTION '인허가 상태와 승인 근거는 전용 명령으로 변경해 주세요.'; END IF;
      WHEN 'design_documents' THEN IF NEW.review_status IS DISTINCT FROM OLD.review_status THEN RAISE EXCEPTION '도면 검토 상태는 전용 명령으로 변경해 주세요.'; END IF;
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_planning_guard ON public.site_candidates;
CREATE TRIGGER trg_site_planning_guard BEFORE INSERT OR UPDATE ON public.site_candidates FOR EACH ROW EXECUTE FUNCTION public.guard_planning_workflow_write();
DROP TRIGGER IF EXISTS trg_project_planning_guard ON public.construction_projects;
CREATE TRIGGER trg_project_planning_guard BEFORE INSERT OR UPDATE ON public.construction_projects FOR EACH ROW EXECUTE FUNCTION public.guard_planning_workflow_write();
DROP TRIGGER IF EXISTS trg_permit_planning_guard ON public.permits;
CREATE TRIGGER trg_permit_planning_guard BEFORE INSERT OR UPDATE ON public.permits FOR EACH ROW EXECUTE FUNCTION public.guard_planning_workflow_write();
DROP TRIGGER IF EXISTS trg_design_planning_guard ON public.design_documents;
CREATE TRIGGER trg_design_planning_guard BEFORE INSERT OR UPDATE ON public.design_documents FOR EACH ROW EXECUTE FUNCTION public.guard_planning_workflow_write();

CREATE OR REPLACE FUNCTION public.prevent_planning_hard_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '신설기획 기록은 삭제할 수 없습니다. 보관 처리를 사용해 주세요.'; END; $$;
DO $$ DECLARE v_table TEXT; BEGIN
  FOREACH v_table IN ARRAY ARRAY['site_candidates','construction_projects','permits','design_documents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_planning_delete ON public.%I',v_table);
    EXECUTE format('CREATE TRIGGER trg_prevent_planning_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_planning_hard_delete()',v_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guard_capital_procedure_source()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_project public.construction_projects%ROWTYPE;
BEGIN
  IF NEW.record_type='capital_project' AND NEW.payload->>'workflow_key'='capital_procedure' THEN
    IF NEW.source_module<>'PLANNING' OR NEW.source_record_id IS NULL THEN RAISE EXCEPTION '행정절차는 신설기획 공사사업에 연결해야 합니다.'; END IF;
    SELECT * INTO v_project FROM public.construction_projects WHERE id=NEW.source_record_id AND archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION '연계 공사사업을 찾을 수 없습니다.'; END IF;
    IF NEW.document_id IS NULL AND NEW.status<>'registered' THEN RAISE EXCEPTION '행정절차 진행 전 공식문서를 연결해 주세요.'; END IF;
    IF NEW.status='review' AND v_project.phase NOT IN ('inspection','completion') THEN RAISE EXCEPTION '공사사업이 준공검수 단계에 도달하지 않았습니다.'; END IF;
    IF NEW.status='completed' AND v_project.status<>'completed' THEN RAISE EXCEPTION '주차장 운영 인수인계가 끝난 뒤 행정절차를 완료할 수 있습니다.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_capital_procedure_source ON public.team_work_records;
CREATE TRIGGER trg_capital_procedure_source BEFORE INSERT OR UPDATE ON public.team_work_records FOR EACH ROW EXECUTE FUNCTION public.guard_capital_procedure_source();

UPDATE public.team_work_records work
SET parking_lot_name=project.project_name, lot_type_snapshot=project.lot_type_snapshot::TEXT
FROM public.construction_projects project
WHERE work.source_module='PLANNING' AND work.source_record_id=project.id
  AND work.record_type='capital_project' AND work.payload->>'workflow_key'='capital_procedure';

DROP POLICY IF EXISTS planning_document_read ON storage.objects;
CREATE POLICY planning_document_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id IN ('official-documents','reports') AND (storage.foldername(name))[2]='planning' AND
  (owner_id=auth.uid()::TEXT OR public.get_user_role(auth.uid()) IN ('admin','manager','editor'))
);

REVOKE ALL ON FUNCTION public.next_planning_number(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_site_candidate(JSONB,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_site_candidate(UUID,TEXT,TEXT,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_construction_project(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,BIGINT,BIGINT,BIGINT,BIGINT,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_construction_phase(UUID,TEXT,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_construction_project_sources(UUID,UUID,UUID,UUID,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_permit(UUID,TEXT,TEXT,TEXT,TEXT,DATE,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_planning_document(UUID,TEXT,TEXT,INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_design_document(UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_planning_number(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_site_candidate(JSONB,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_site_candidate(UUID,TEXT,TEXT,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_construction_project(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,BIGINT,BIGINT,BIGINT,BIGINT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_construction_phase(UUID,TEXT,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_construction_project_sources(UUID,UUID,UUID,UUID,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_permit(UUID,TEXT,TEXT,TEXT,TEXT,DATE,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_planning_document(UUID,TEXT,TEXT,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_design_document(UUID,TEXT) TO authenticated;
