-- ParkMaster workflow reliability foundation
-- Atomic commands, server-side transitions, license enforcement, and PII-aware complaint access.

CREATE OR REPLACE FUNCTION public.is_module_active(_module_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.module_licenses
    WHERE module_code = upper(_module_code)
      AND is_active = true
      AND starts_at <= CURRENT_DATE
      AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_team(_user_id uuid)
RETURNS team_type
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team FROM public.profiles WHERE id = _user_id AND is_active = true LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_module_active(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_module_active(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_team(uuid) TO authenticated;

DROP POLICY IF EXISTS "comp_select" ON public.complaints;
CREATE POLICY "comp_select" ON public.complaints FOR SELECT USING (
  public.is_module_active('COMPLAINT')
  AND (
    public.get_user_role(auth.uid()) IN ('admin', 'manager')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR assigned_team = public.get_user_team(auth.uid())
  )
);

DROP POLICY IF EXISTS "cc_select" ON public.complaint_comments;
CREATE POLICY "cc_select" ON public.complaint_comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.complaints c
    WHERE c.id = complaint_id
  )
);

DROP POLICY IF EXISTS "cc_insert" ON public.complaint_comments;
CREATE POLICY "cc_insert" ON public.complaint_comments FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.complaints c
    WHERE c.id = complaint_id
  )
);

CREATE OR REPLACE FUNCTION public.validate_complaint_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (CASE OLD.status
    WHEN 'received' THEN NEW.status IN ('assigned', 'in_progress', 'responded', 'closed')
    WHEN 'assigned' THEN NEW.status IN ('in_progress', 'pending_external', 'responded', 'closed')
    WHEN 'in_progress' THEN NEW.status IN ('pending_external', 'responded', 'closed')
    WHEN 'pending_external' THEN NEW.status IN ('in_progress', 'responded', 'closed')
    WHEN 'responded' THEN NEW.status IN ('closed', 'reopened')
    WHEN 'closed' THEN NEW.status = 'reopened'
    WHEN 'reopened' THEN NEW.status IN ('assigned', 'in_progress', 'pending_external', 'responded', 'closed')
    ELSE false
  END) THEN
    RAISE EXCEPTION '허용되지 않은 민원 상태 변경입니다: % -> %', OLD.status, NEW.status
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_complaint_transition ON public.complaints;
CREATE TRIGGER trg_validate_complaint_transition
  BEFORE UPDATE OF status ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.validate_complaint_status_transition();

CREATE OR REPLACE FUNCTION public.validate_survey_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (CASE OLD.status::text
    WHEN 'draft' THEN NEW.status::text IN ('in_progress', 'submitted')
    WHEN 'in_progress' THEN NEW.status::text = 'submitted'
    WHEN 'submitted' THEN NEW.status::text IN ('review', 'approved', 'rejected')
    WHEN 'review' THEN NEW.status::text IN ('approved', 'rejected')
    WHEN 'rejected' THEN NEW.status::text IN ('in_progress', 'submitted')
    ELSE false
  END) THEN
    RAISE EXCEPTION '허용되지 않은 조사 상태 변경입니다: % -> %', OLD.status, NEW.status
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_survey_transition ON public.surveys;
CREATE TRIGGER trg_validate_survey_transition
  BEFORE UPDATE OF status ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.validate_survey_status_transition();

CREATE OR REPLACE FUNCTION public.assign_complaint(
  p_complaint_id uuid,
  p_assignee_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS SETOF public.complaints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_assignee public.profiles%ROWTYPE;
  v_complaint public.complaints%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_module_active('COMPLAINT') THEN
    RAISE EXCEPTION '민원 모듈에 접근할 수 없습니다' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  SELECT * INTO v_assignee FROM public.profiles WHERE id = p_assignee_id AND is_active = true;
  SELECT * INTO v_complaint FROM public.complaints WHERE id = p_complaint_id FOR UPDATE;

  IF v_actor.id IS NULL OR v_assignee.id IS NULL OR v_complaint.id IS NULL THEN
    RAISE EXCEPTION '사용자 또는 민원을 찾을 수 없습니다' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_complaint.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '다른 사용자가 먼저 민원을 변경했습니다. 새로고침 후 다시 시도해주세요' USING ERRCODE = '40001';
  END IF;
  IF v_actor.role NOT IN ('admin', 'manager', 'editor') THEN
    RAISE EXCEPTION '민원을 배정할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;
  IF v_actor.role = 'editor'
     AND (p_assignee_id <> auth.uid()
       OR NOT (v_complaint.created_by = auth.uid()
         OR v_complaint.assigned_to = auth.uid()
         OR v_complaint.assigned_team = v_actor.team)) THEN
    RAISE EXCEPTION '담당자는 본인으로만 지정할 수 있습니다' USING ERRCODE = '42501';
  END IF;

  UPDATE public.complaints
  SET assigned_to = p_assignee_id,
      assigned_team = v_assignee.team,
      assigned_at = now(),
      status = CASE WHEN status = 'received' THEN 'assigned' ELSE status END
  WHERE id = p_complaint_id
  RETURNING * INTO v_complaint;

  INSERT INTO public.complaint_comments (
    complaint_id, author_id, author_name, content, comment_type, is_system
  ) VALUES (
    v_complaint.id, v_actor.id, v_actor.name,
    '담당자 배정: ' || v_assignee.name, 'assignment', true
  );

  IF p_assignee_id <> auth.uid() THEN
    INSERT INTO public.notifications (user_id, module, type, title, message, link)
    VALUES (
      p_assignee_id, 'COMPLAINT', 'assignment', '민원 담당 배정',
      '[' || v_complaint.complaint_number || '] ' || v_complaint.title,
      '/complaints/' || v_complaint.id
    );
  END IF;

  INSERT INTO public.activity_logs (
    user_id, user_name, module, action, target_type, target_id, target_name, details
  ) VALUES (
    v_actor.id, v_actor.name, 'COMPLAINT', 'assign', 'complaint',
    v_complaint.id, v_complaint.complaint_number,
    jsonb_build_object('assignee_id', v_assignee.id, 'assignee_name', v_assignee.name)
  );

  RETURN NEXT v_complaint;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_survey(
  p_survey_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS SETOF public.surveys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_survey public.surveys%ROWTYPE;
  v_lot_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_module_active('SURVEY') THEN
    RAISE EXCEPTION '현황조사 모듈에 접근할 수 없습니다' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  SELECT * INTO v_survey FROM public.surveys WHERE id = p_survey_id FOR UPDATE;

  IF v_actor.id IS NULL OR v_survey.id IS NULL THEN
    RAISE EXCEPTION '사용자 또는 조사를 찾을 수 없습니다' USING ERRCODE = 'P0002';
  END IF;
  IF v_survey.surveyor_id <> auth.uid() AND v_actor.role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION '조사를 제출할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;
  IF v_survey.status::text NOT IN ('draft', 'in_progress', 'rejected') THEN
    RAISE EXCEPTION '현재 상태에서는 조사를 제출할 수 없습니다' USING ERRCODE = '22023';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_survey.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '다른 사용자가 먼저 조사를 변경했습니다. 새로고침 후 다시 시도해주세요' USING ERRCODE = '40001';
  END IF;

  UPDATE public.surveys
  SET status = 'submitted', submitted_at = now(), reject_reason = NULL
  WHERE id = p_survey_id
  RETURNING * INTO v_survey;

  SELECT name INTO v_lot_name FROM public.parking_lots WHERE id = v_survey.lot_id;

  INSERT INTO public.notifications (user_id, module, type, title, message, link)
  SELECT p.id, 'SURVEY', 'approval', '현황조사 승인 요청',
         COALESCE(v_lot_name, '주차장') || ' 현황조사가 제출되었습니다.',
         '/surveys/' || v_survey.id || '/review'
  FROM public.profiles p
  WHERE p.is_active = true AND p.role IN ('admin', 'manager') AND p.id <> auth.uid();

  INSERT INTO public.activity_logs (
    user_id, user_name, module, action, target_type, target_id, target_name
  ) VALUES (
    v_actor.id, v_actor.name, 'SURVEY', 'submit', 'survey', v_survey.id, v_lot_name
  );

  RETURN NEXT v_survey;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_survey(
  p_survey_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL,
  p_sync_to_lot boolean DEFAULT false,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS SETOF public.surveys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_survey public.surveys%ROWTYPE;
  v_basic public.survey_basic_info%ROWTYPE;
  v_lot_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_module_active('SURVEY') THEN
    RAISE EXCEPTION '현황조사 모듈에 접근할 수 없습니다' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  SELECT * INTO v_survey FROM public.surveys WHERE id = p_survey_id FOR UPDATE;

  IF v_actor.id IS NULL OR v_survey.id IS NULL THEN
    RAISE EXCEPTION '사용자 또는 조사를 찾을 수 없습니다' USING ERRCODE = 'P0002';
  END IF;
  IF v_actor.role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION '조사를 검토할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('review', 'approved', 'rejected') THEN
    RAISE EXCEPTION '지원하지 않는 검토 결과입니다' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'review' AND v_survey.status::text <> 'submitted' THEN
    RAISE EXCEPTION '제출된 조사만 검토를 시작할 수 있습니다' USING ERRCODE = '22023';
  END IF;
  IF p_decision IN ('approved', 'rejected') AND v_survey.status::text NOT IN ('submitted', 'review') THEN
    RAISE EXCEPTION '제출 또는 검토 중인 조사만 처리할 수 있습니다' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'rejected' AND length(trim(COALESCE(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION '반려 사유를 입력해주세요' USING ERRCODE = '22023';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_survey.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '다른 사용자가 먼저 조사를 변경했습니다. 새로고침 후 다시 시도해주세요' USING ERRCODE = '40001';
  END IF;

  UPDATE public.surveys
  SET status = p_decision::survey_status_enum,
      reviewer_id = CASE WHEN p_decision = 'review' THEN v_actor.id ELSE reviewer_id END,
      reviewed_at = CASE WHEN p_decision = 'review' THEN now() ELSE reviewed_at END,
      approver_id = CASE WHEN p_decision IN ('approved', 'rejected') THEN v_actor.id ELSE approver_id END,
      approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
      reject_reason = CASE WHEN p_decision = 'rejected' THEN trim(p_reason) ELSE NULL END
  WHERE id = p_survey_id
  RETURNING * INTO v_survey;

  SELECT name INTO v_lot_name FROM public.parking_lots WHERE id = v_survey.lot_id;

  IF p_decision = 'approved' AND p_sync_to_lot THEN
    SELECT * INTO v_basic FROM public.survey_basic_info WHERE survey_id = v_survey.id;
    IF v_basic.id IS NULL THEN
      RAISE EXCEPTION '동기화할 기본현황 데이터가 없습니다' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.parking_lots
    SET total_spaces = COALESCE(v_basic.total_spaces, total_spaces),
        disabled_spaces = COALESCE(v_basic.disabled_spaces, disabled_spaces),
        ev_spaces = COALESCE(v_basic.ev_spaces, ev_spaces),
        compact_spaces = COALESCE(v_basic.compact_spaces, compact_spaces),
        pregnant_spaces = COALESCE(v_basic.pregnant_spaces, pregnant_spaces),
        other_spaces = COALESCE(v_basic.other_spaces, other_spaces),
        lot_type = COALESCE(v_basic.lot_type::lot_type_enum, lot_type),
        surface_type = COALESCE(v_basic.surface_type::surface_enum, surface_type),
        latitude = COALESCE(v_basic.gps_lat, latitude),
        longitude = COALESCE(v_basic.gps_lng, longitude)
    WHERE id = v_survey.lot_id;
  END IF;

  IF p_decision <> 'review' AND v_survey.surveyor_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, module, type, title, message, link)
    VALUES (
      v_survey.surveyor_id, 'SURVEY', 'approval',
      CASE WHEN p_decision = 'approved' THEN '현황조사 승인' ELSE '현황조사 반려' END,
      COALESCE(v_lot_name, '주차장') || ' 현황조사가 ' ||
        CASE WHEN p_decision = 'approved' THEN '승인되었습니다.' ELSE '반려되었습니다: ' || trim(p_reason) END,
      '/surveys/' || v_survey.id
    );
  END IF;

  INSERT INTO public.activity_logs (
    user_id, user_name, module, action, target_type, target_id, target_name, details
  ) VALUES (
    v_actor.id, v_actor.name, 'SURVEY', p_decision, 'survey', v_survey.id, v_lot_name,
    jsonb_build_object('sync_to_lot', p_sync_to_lot, 'reason', p_reason)
  );

  RETURN NEXT v_survey;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_complaint(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_survey(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_survey(uuid, text, text, boolean, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_complaint(uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_survey(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_survey(uuid, text, text, boolean, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_complaint_overdue()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_overdue := NEW.due_date IS NOT NULL
    AND CURRENT_DATE > NEW.due_date
    AND NEW.status NOT IN ('closed', 'responded');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE VIEW public.complaint_stats_monthly AS
SELECT
  DATE_TRUNC('month', received_at)::date AS month,
  category,
  COUNT(*) AS total_count,
  COUNT(CASE WHEN status = 'closed' THEN 1 END) AS closed_count,
  COUNT(CASE WHEN status NOT IN ('closed','responded') THEN 1 END) AS open_count,
  COUNT(CASE WHEN due_date < CURRENT_DATE AND status NOT IN ('closed','responded') THEN 1 END) AS overdue_count,
  ROUND(AVG(CASE WHEN closed_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (closed_at - received_at)) / 86400 END)::numeric, 1
  ) AS avg_resolution_days,
  ROUND(AVG(satisfaction_score)::numeric, 1) AS avg_satisfaction
FROM public.complaints
GROUP BY DATE_TRUNC('month', received_at), category;

CREATE OR REPLACE VIEW public.complaint_staff_performance AS
SELECT
  p.id AS staff_id,
  p.name AS staff_name,
  p.team,
  COUNT(c.id) AS assigned_count,
  COUNT(CASE WHEN c.status = 'closed' THEN 1 END) AS closed_count,
  COUNT(CASE WHEN c.status NOT IN ('closed','responded') THEN 1 END) AS open_count,
  COUNT(CASE WHEN c.due_date < CURRENT_DATE AND c.status NOT IN ('closed','responded') THEN 1 END) AS overdue_count,
  ROUND(AVG(CASE WHEN c.closed_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (c.closed_at - c.received_at)) / 86400 END)::numeric, 1
  ) AS avg_resolution_days,
  ROUND(AVG(c.satisfaction_score)::numeric, 1) AS avg_satisfaction
FROM public.profiles p
LEFT JOIN public.complaints c ON c.assigned_to = p.id
WHERE p.is_active = true
GROUP BY p.id, p.name, p.team;
