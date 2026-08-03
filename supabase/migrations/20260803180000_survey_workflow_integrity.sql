-- Field survey integrity: one active survey, type-specific facts, immutable approvals, and audit evidence.
ALTER TABLE public.survey_basic_info
  ADD COLUMN IF NOT EXISTS site_area_sqm numeric,
  ADD COLUMN IF NOT EXISTS drainage_condition text,
  ADD COLUMN IF NOT EXISTS pedestrian_route_condition text,
  ADD COLUMN IF NOT EXISTS road_segment text,
  ADD COLUMN IF NOT EXISTS road_side text,
  ADD COLUMN IF NOT EXISTS traffic_direction text,
  ADD COLUMN IF NOT EXISTS space_start_no integer,
  ADD COLUMN IF NOT EXISTS space_end_no integer,
  ADD COLUMN IF NOT EXISTS sign_condition text,
  ADD COLUMN IF NOT EXISTS fire_safety_condition text,
  ADD COLUMN IF NOT EXISTS ventilation_condition text,
  ADD COLUMN IF NOT EXISTS elevator_condition text,
  ADD COLUMN IF NOT EXISTS ramp_condition text,
  ADD COLUMN IF NOT EXISTS height_limit_m numeric;

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidation_reason text;

ALTER TABLE public.survey_operation ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.survey_infra ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.survey_usage ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.survey_sensor_plan ADD COLUMN IF NOT EXISTS author_name text;

ALTER TABLE public.survey_basic_info
  DROP CONSTRAINT IF EXISTS survey_basic_info_nonnegative_counts,
  ADD CONSTRAINT survey_basic_info_nonnegative_counts CHECK (
    COALESCE(total_spaces, 0) >= 0
    AND COALESCE(disabled_spaces, 0) >= 0
    AND COALESCE(ev_spaces, 0) >= 0
    AND COALESCE(compact_spaces, 0) >= 0
    AND COALESCE(pregnant_spaces, 0) >= 0
    AND COALESCE(other_spaces, 0) >= 0
    AND COALESCE(entry_count, 0) >= 0
    AND COALESCE(exit_count, 0) >= 0
    AND COALESCE(lot_type_floor, 0) >= 0
  ) NOT VALID;

ALTER TABLE public.survey_basic_info
  DROP CONSTRAINT IF EXISTS survey_basic_info_gps_range,
  ADD CONSTRAINT survey_basic_info_gps_range CHECK (
    (gps_lat IS NULL OR gps_lat BETWEEN -90 AND 90)
    AND (gps_lng IS NULL OR gps_lng BETWEEN -180 AND 180)
  ) NOT VALID;

-- Preserve the newest/highest-progress record and invalidate older demo duplicates.
ALTER TABLE public.surveys DISABLE TRIGGER trg_validate_survey_transition;
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY lot_id
      ORDER BY CASE status::text WHEN 'review' THEN 0 WHEN 'submitted' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END,
        created_at DESC
    ) AS row_rank
  FROM public.surveys
  WHERE invalidated_at IS NULL AND status IN ('draft', 'in_progress', 'submitted', 'review', 'rejected')
)
UPDATE public.surveys s
SET status = 'rejected',
    invalidated_at = now(),
    invalidation_reason = '중복 활성 조사 정리: 더 최신이거나 진행 단계가 높은 조사로 대체',
    reject_reason = COALESCE(s.reject_reason, '중복 활성 조사 정리')
FROM ranked r
WHERE s.id = r.id AND r.row_rank > 1;
ALTER TABLE public.surveys ENABLE TRIGGER trg_validate_survey_transition;

CREATE UNIQUE INDEX IF NOT EXISTS uq_surveys_one_active_per_lot
  ON public.surveys(lot_id)
  WHERE invalidated_at IS NULL AND status IN ('draft', 'in_progress', 'submitted', 'review', 'rejected');

CREATE OR REPLACE FUNCTION public.create_survey_draft(
  p_lot_id uuid,
  p_survey_type text,
  p_survey_date date
)
RETURNS SETOF public.surveys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot public.parking_lots%ROWTYPE;
  v_survey public.surveys%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_module_active('SURVEY') THEN
    RAISE EXCEPTION '현황조사 모듈에 접근할 수 없습니다' USING ERRCODE = '42501';
  END IF;
  IF p_survey_type NOT IN ('initial', 'regular', 'special') THEN
    RAISE EXCEPTION '지원하지 않는 조사 유형입니다' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_lot FROM public.parking_lots WHERE id = p_lot_id AND status = 'active' FOR SHARE;
  IF v_lot.id IS NULL THEN
    RAISE EXCEPTION '운영 중인 주차장을 찾을 수 없습니다' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.surveys(lot_id, survey_type, status, surveyor_id, survey_date)
  VALUES (p_lot_id, p_survey_type, 'draft', auth.uid(), p_survey_date)
  RETURNING * INTO v_survey;

  INSERT INTO public.survey_basic_info(
    survey_id, lot_name, address, lot_type, operator_type, surface_type,
    total_spaces, disabled_spaces, ev_spaces, compact_spaces, pregnant_spaces,
    gps_lat, gps_lng
  ) VALUES (
    v_survey.id, v_lot.name, COALESCE(v_lot.address_jibun, v_lot.address_road),
    v_lot.lot_type::text, v_lot.operator_type::text, v_lot.surface_type::text,
    COALESCE(v_lot.total_spaces, 0), COALESCE(v_lot.disabled_spaces, 0),
    COALESCE(v_lot.ev_spaces, 0), COALESCE(v_lot.compact_spaces, 0),
    COALESCE(v_lot.pregnant_spaces, 0), v_lot.latitude, v_lot.longitude
  );
  INSERT INTO public.survey_operation(survey_id) VALUES (v_survey.id);
  INSERT INTO public.survey_infra(survey_id) VALUES (v_survey.id);
  INSERT INTO public.survey_usage(survey_id) VALUES (v_survey.id);
  INSERT INTO public.survey_sensor_plan(survey_id) VALUES (v_survey.id);

  RETURN NEXT v_survey;
END;
$$;

REVOKE ALL ON FUNCTION public.create_survey_draft(uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_survey_draft(uuid, text, date) TO authenticated;

CREATE TABLE IF NOT EXISTS public.survey_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id),
  from_status text,
  to_status text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id),
  reason text,
  approved_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_workflow_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "survey_workflow_events_select" ON public.survey_workflow_events;
CREATE POLICY "survey_workflow_events_select" ON public.survey_workflow_events
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.survey_validation_errors(p_survey_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_basic public.survey_basic_info%ROWTYPE;
  v_operation public.survey_operation%ROWTYPE;
  v_infra public.survey_infra%ROWTYPE;
  v_usage public.survey_usage%ROWTYPE;
  v_errors text[] := ARRAY[]::text[];
  v_special_spaces integer;
BEGIN
  SELECT * INTO v_basic FROM public.survey_basic_info WHERE survey_id = p_survey_id;
  SELECT * INTO v_operation FROM public.survey_operation WHERE survey_id = p_survey_id;
  SELECT * INTO v_infra FROM public.survey_infra WHERE survey_id = p_survey_id;
  SELECT * INTO v_usage FROM public.survey_usage WHERE survey_id = p_survey_id;

  IF v_basic.id IS NULL OR length(trim(COALESCE(v_basic.lot_name, ''))) = 0
     OR length(trim(COALESCE(v_basic.address, ''))) = 0 OR COALESCE(v_basic.total_spaces, 0) <= 0 THEN
    v_errors := array_append(v_errors, '기본현황의 주차장명·주소·총 주차면수');
  END IF;
  IF v_basic.gps_lat IS NULL OR v_basic.gps_lng IS NULL THEN
    v_errors := array_append(v_errors, '현장 GPS 좌표');
  END IF;
  v_special_spaces := COALESCE(v_basic.disabled_spaces, 0) + COALESCE(v_basic.ev_spaces, 0)
    + COALESCE(v_basic.compact_spaces, 0) + COALESCE(v_basic.pregnant_spaces, 0) + COALESCE(v_basic.other_spaces, 0);
  IF v_special_spaces > COALESCE(v_basic.total_spaces, 0) THEN
    v_errors := array_append(v_errors, '특수 주차면수 합계');
  END IF;
  IF v_basic.lot_type = 'multilevel' AND (
    COALESCE(v_basic.lot_type_floor, 0) <= 0
    OR length(trim(COALESCE(v_basic.fire_safety_condition, ''))) = 0
    OR length(trim(COALESCE(v_basic.ventilation_condition, ''))) = 0
    OR length(trim(COALESCE(v_basic.ramp_condition, ''))) = 0
  ) THEN
    v_errors := array_append(v_errors, '주차빌딩 층수·소방·환기·램프 상태');
  END IF;
  IF v_basic.lot_type = 'onstreet' AND (
    length(trim(COALESCE(v_basic.road_segment, ''))) = 0
    OR length(trim(COALESCE(v_basic.road_side, ''))) = 0
    OR length(trim(COALESCE(v_basic.sign_condition, ''))) = 0
  ) THEN
    v_errors := array_append(v_errors, '노상주차장 도로구간·측면·표지 상태');
  END IF;
  IF v_basic.lot_type = 'offstreet' AND (
    length(trim(COALESCE(v_basic.drainage_condition, ''))) = 0
    OR length(trim(COALESCE(v_basic.pedestrian_route_condition, ''))) = 0
  ) THEN
    v_errors := array_append(v_errors, '노외주차장 배수·보행동선 상태');
  END IF;
  IF v_operation.id IS NULL OR length(trim(COALESCE(v_operation.operating_hours, ''))) = 0
     OR length(trim(COALESCE(v_operation.management_type, ''))) = 0 THEN
    v_errors := array_append(v_errors, '운영시간·관리방식');
  END IF;
  IF v_infra.id IS NULL OR length(trim(COALESCE(v_infra.power_status, ''))) = 0 THEN
    v_errors := array_append(v_errors, '전기 인프라 상태');
  END IF;
  IF v_usage.id IS NULL OR length(trim(COALESCE(v_usage.avg_usage_rate, ''))) = 0 THEN
    v_errors := array_append(v_errors, '평균 이용률');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.survey_photos WHERE survey_id = p_survey_id AND category = 'panorama') THEN
    v_errors := array_append(v_errors, '전경 사진');
  END IF;
  IF v_basic.lot_type = 'multilevel' AND NOT EXISTS (
    SELECT 1 FROM public.survey_photos WHERE survey_id = p_survey_id AND category = 'ramp'
  ) THEN
    v_errors := array_append(v_errors, '주차빌딩 램프·높이제한 사진');
  END IF;
  IF v_basic.lot_type = 'onstreet' AND NOT EXISTS (
    SELECT 1 FROM public.survey_photos WHERE survey_id = p_survey_id AND category IN ('street_segment', 'road_sign')
  ) THEN
    v_errors := array_append(v_errors, '노상 구간·표지 사진');
  END IF;
  IF v_basic.lot_type = 'offstreet' AND NOT EXISTS (
    SELECT 1 FROM public.survey_photos WHERE survey_id = p_survey_id AND category IN ('drainage', 'pedestrian_route')
  ) THEN
    v_errors := array_append(v_errors, '노외 배수·보행동선 사진');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.attachments
    WHERE module = 'SURVEY'
      AND ref_type = 'official_document_link'
      AND ref_id = p_survey_id
  ) THEN
    v_errors := array_append(v_errors, '공식 문서번호 연결');
  END IF;
  RETURN v_errors;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_survey_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_errors text[];
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NOT (CASE OLD.status::text
    WHEN 'draft' THEN NEW.status::text IN ('in_progress', 'submitted')
    WHEN 'in_progress' THEN NEW.status::text = 'submitted'
    WHEN 'submitted' THEN NEW.status::text IN ('review', 'approved', 'rejected')
    WHEN 'review' THEN NEW.status::text IN ('approved', 'rejected')
    WHEN 'rejected' THEN NEW.status::text IN ('in_progress', 'submitted')
    ELSE false
  END) THEN
    RAISE EXCEPTION '허용되지 않은 조사 상태 변경입니다: % -> %', OLD.status, NEW.status USING ERRCODE = '22023';
  END IF;
  IF NEW.status::text IN ('submitted', 'approved') THEN
    v_errors := public.survey_validation_errors(NEW.id);
    IF COALESCE(array_length(v_errors, 1), 0) > 0 THEN
      RAISE EXCEPTION '조사 제출 전 확인: %', array_to_string(v_errors, ', ') USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_editable_survey_child()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_survey_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.survey_id ELSE NEW.survey_id END;
  v_status text;
  v_invalidated_at timestamptz;
BEGIN
  SELECT status::text, invalidated_at INTO v_status, v_invalidated_at FROM public.surveys WHERE id = v_survey_id;
  IF v_invalidated_at IS NOT NULL OR v_status NOT IN ('draft', 'in_progress', 'rejected') THEN
    RAISE EXCEPTION '제출·검토·승인된 조사 내용은 수정하거나 삭제할 수 없습니다' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['survey_basic_info','survey_operation','survey_infra','survey_usage','survey_sensor_plan','survey_photos']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_editable ON public.%I', v_table, v_table);
    EXECUTE format('CREATE TRIGGER trg_%I_editable BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_editable_survey_child()', v_table, v_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.log_survey_workflow_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_snapshot jsonb;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status::text = 'approved' THEN
    SELECT jsonb_build_object(
      'survey', to_jsonb(NEW),
      'basic', (SELECT to_jsonb(b) FROM public.survey_basic_info b WHERE b.survey_id = NEW.id),
      'operation', (SELECT to_jsonb(o) FROM public.survey_operation o WHERE o.survey_id = NEW.id),
      'infra', (SELECT to_jsonb(i) FROM public.survey_infra i WHERE i.survey_id = NEW.id),
      'usage', (SELECT to_jsonb(u) FROM public.survey_usage u WHERE u.survey_id = NEW.id),
      'sensor_plan', (SELECT to_jsonb(s) FROM public.survey_sensor_plan s WHERE s.survey_id = NEW.id)
    ) INTO v_snapshot;
  END IF;
  INSERT INTO public.survey_workflow_events(survey_id, from_status, to_status, actor_id, reason, approved_snapshot)
  VALUES (NEW.id, OLD.status::text, NEW.status::text, auth.uid(), NEW.reject_reason, v_snapshot);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_survey_workflow_event ON public.surveys;
CREATE TRIGGER trg_log_survey_workflow_event
  AFTER UPDATE OF status ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.log_survey_workflow_event();

DROP POLICY IF EXISTS "survey_delete" ON public.surveys;

DROP POLICY IF EXISTS "survey_photos_delete" ON storage.objects;
CREATE POLICY "survey_photos_delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'survey-photos'
  AND EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.id::text = split_part(storage.objects.name, '/', 1)
      AND s.invalidated_at IS NULL
      AND s.status IN ('draft', 'in_progress', 'rejected')
      AND (s.surveyor_id = auth.uid() OR public.get_user_role(auth.uid()) IN ('admin', 'manager'))
  )
);

COMMENT ON TABLE public.survey_workflow_events IS '현황조사 상태변경 이력 및 승인 시점 불변 스냅샷';
COMMENT ON FUNCTION public.survey_validation_errors(uuid) IS '현황조사 제출·승인 전 누락 항목의 한글 목록';
