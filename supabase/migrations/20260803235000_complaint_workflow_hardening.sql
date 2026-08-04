-- Complaint workflow commands, evidence integrity, and mobile event context.

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS lot_type_at_event text,
  ADD COLUMN IF NOT EXISTS client_mutation_id uuid,
  ADD COLUMN IF NOT EXISTS external_pending_organization text,
  ADD COLUMN IF NOT EXISTS external_pending_reason text,
  ADD COLUMN IF NOT EXISTS external_follow_up_date date,
  ADD COLUMN IF NOT EXISTS reopen_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS archive_reason text;

UPDATE public.complaints complaint
SET lot_type_at_event = lot.lot_type::text
FROM public.parking_lots lot
WHERE lot.id = complaint.lot_id
  AND complaint.lot_type_at_event IS NULL;

UPDATE public.complaints SET saeol_ref = NULL WHERE nullif(btrim(saeol_ref), '') IS NULL;
UPDATE public.complaints SET external_ref = NULL WHERE nullif(btrim(external_ref), '') IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_complaints_client_mutation
  ON public.complaints(client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_complaints_saeol_ref
  ON public.complaints(saeol_ref)
  WHERE saeol_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_complaints_external_ref
  ON public.complaints(external_ref)
  WHERE external_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_complaints_event_context
  ON public.complaints(lot_type_at_event, status, due_date);
CREATE INDEX IF NOT EXISTS idx_complaints_external_follow_up
  ON public.complaints(external_follow_up_date, status)
  WHERE status = 'pending_external';

CREATE TABLE IF NOT EXISTS public.complaint_number_counters (
  work_date date PRIMARY KEY,
  last_value integer NOT NULL CHECK (last_value > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.complaint_number_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_complaint_number(p_work_date date DEFAULT current_date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value integer;
  v_existing integer;
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role(auth.uid())::text NOT IN ('admin', 'manager', 'editor') THEN
    RAISE EXCEPTION '민원번호를 발급할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(max((regexp_match(complaint_number, '-([0-9]+)$'))[1]::integer), 0)
  INTO v_existing
  FROM public.complaints
  WHERE complaint_number LIKE 'CM-' || to_char(p_work_date, 'YYYYMMDD') || '-%';

  INSERT INTO public.complaint_number_counters(work_date, last_value)
  VALUES (p_work_date, v_existing + 1)
  ON CONFLICT (work_date) DO UPDATE
    SET last_value = greatest(public.complaint_number_counters.last_value, v_existing) + 1,
        updated_at = now()
  RETURNING last_value INTO v_value;

  RETURN 'CM-' || to_char(p_work_date, 'YYYYMMDD') || '-' || lpad(v_value::text, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_complaint_event_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lot_type_at_event IS NULL AND NEW.lot_id IS NOT NULL THEN
    SELECT lot_type::text INTO NEW.lot_type_at_event
    FROM public.parking_lots WHERE id = NEW.lot_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_complaint_event_context ON public.complaints;
CREATE TRIGGER trg_capture_complaint_event_context
  BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.capture_complaint_event_context();

CREATE OR REPLACE FUNCTION public.validate_complaint_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed boolean := false;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  v_allowed := CASE OLD.status
    WHEN 'received' THEN NEW.status IN ('assigned', 'in_progress')
    WHEN 'assigned' THEN NEW.status IN ('in_progress', 'pending_external')
      OR (NEW.status = 'responded' AND OLD.category NOT IN ('facility', 'safety', 'cleanliness'))
    WHEN 'in_progress' THEN NEW.status IN ('pending_external', 'responded')
    WHEN 'pending_external' THEN NEW.status IN ('in_progress', 'responded')
    WHEN 'responded' THEN NEW.status IN ('closed', 'reopened')
    WHEN 'closed' THEN NEW.status = 'reopened'
    WHEN 'reopened' THEN NEW.status IN ('in_progress', 'pending_external', 'responded')
    ELSE false
  END;

  IF NOT v_allowed THEN
    RAISE EXCEPTION '허용되지 않은 민원 상태 변경입니다: % -> %', OLD.status, NEW.status
      USING ERRCODE = '22023';
  END IF;
  IF NEW.status IN ('assigned', 'in_progress', 'pending_external', 'responded', 'closed')
     AND NEW.assigned_to IS NULL THEN
    RAISE EXCEPTION '민원 처리 상태 변경 전에 담당자를 배정하세요' USING ERRCODE = '22023';
  END IF;
  IF NEW.status = 'responded' AND (
    nullif(btrim(coalesce(NEW.response, '')), '') IS NULL
    OR nullif(btrim(coalesce(NEW.response_type, '')), '') IS NULL
    OR NEW.responded_at IS NULL
  ) THEN
    RAISE EXCEPTION '회신 내용, 유형, 시각이 필요합니다' USING ERRCODE = '22023';
  END IF;
  IF NEW.status = 'closed' AND (
    OLD.status <> 'responded'
    OR NEW.closed_at IS NULL
    OR NEW.closed_by IS NULL
    OR nullif(btrim(coalesce(NEW.resolution_type, '')), '') IS NULL
  ) THEN
    RAISE EXCEPTION '회신 완료 후 종결 정보와 함께 완결하세요' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_complaint(
  p_complaint_id uuid,
  p_action text,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_response text DEFAULT NULL,
  p_response_type text DEFAULT NULL,
  p_response_channel text DEFAULT NULL,
  p_no_visit_reason text DEFAULT NULL,
  p_resolution_type text DEFAULT NULL,
  p_resolution_summary text DEFAULT NULL,
  p_pending_organization text DEFAULT NULL,
  p_pending_reason text DEFAULT NULL,
  p_follow_up_date date DEFAULT NULL,
  p_reopen_reason text DEFAULT NULL
)
RETURNS SETOF public.complaints
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_complaint public.complaints%ROWTYPE;
  v_field_required boolean;
  v_field_count integer;
  v_has_linked_work boolean;
  v_unverified_work boolean;
  v_has_reply_document boolean;
  v_action_label text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_module_active('COMPLAINT') THEN
    RAISE EXCEPTION '민원 모듈에 접근할 수 없습니다' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  SELECT * INTO v_complaint FROM public.complaints WHERE id = p_complaint_id FOR UPDATE;
  IF v_actor.id IS NULL OR v_complaint.id IS NULL THEN
    RAISE EXCEPTION '사용자 또는 민원을 찾을 수 없습니다' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_complaint.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '다른 사용자가 먼저 민원을 변경했습니다. 새로고침 후 다시 시도해주세요' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    v_actor.role::text IN ('admin', 'manager')
    OR v_complaint.assigned_to = v_actor.id
    OR (v_actor.role::text = 'editor' AND v_complaint.assigned_team = v_actor.team)
  ) THEN
    RAISE EXCEPTION '이 민원을 처리할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_field_count FROM public.complaint_comments
  WHERE complaint_id = p_complaint_id AND comment_type = 'field_visit';
  SELECT EXISTS (
    SELECT 1 FROM public.maintenance_logs
    WHERE upper(coalesce(source_module, '')) = 'COMPLAINT' AND source_record_id = p_complaint_id
  ) INTO v_has_linked_work;
  SELECT EXISTS (
    SELECT 1 FROM public.maintenance_logs
    WHERE upper(coalesce(source_module, '')) = 'COMPLAINT' AND source_record_id = p_complaint_id
      AND status <> 'verified'
  ) INTO v_unverified_work;
  SELECT EXISTS (
    SELECT 1 FROM public.attachments
    WHERE upper(module) = 'COMPLAINT' AND ref_id = p_complaint_id
      AND ref_type = 'official_document_link' AND category IN ('primary', 'reply')
  ) INTO v_has_reply_document;
  v_field_required := v_has_linked_work OR v_complaint.category IN ('facility', 'safety', 'cleanliness');

  CASE p_action
    WHEN 'start' THEN
      IF v_complaint.status NOT IN ('assigned', 'pending_external', 'reopened') THEN
        RAISE EXCEPTION '현재 상태에서는 처리를 시작할 수 없습니다' USING ERRCODE = '22023';
      END IF;
      UPDATE public.complaints SET
        status = 'in_progress',
        external_pending_organization = NULL,
        external_pending_reason = NULL,
        external_follow_up_date = NULL
      WHERE id = p_complaint_id RETURNING * INTO v_complaint;
      v_action_label := '처리 시작';

    WHEN 'external_wait' THEN
      IF v_complaint.status NOT IN ('assigned', 'in_progress', 'reopened') THEN
        RAISE EXCEPTION '현재 상태에서는 외부대기로 변경할 수 없습니다' USING ERRCODE = '22023';
      END IF;
      IF length(btrim(coalesce(p_pending_organization, ''))) < 2
         OR length(btrim(coalesce(p_pending_reason, ''))) < 5
         OR p_follow_up_date IS NULL OR p_follow_up_date < current_date THEN
        RAISE EXCEPTION '기관·업체, 대기 사유, 오늘 이후 재확인일을 입력하세요' USING ERRCODE = '22023';
      END IF;
      UPDATE public.complaints SET
        status = 'pending_external',
        external_pending_organization = btrim(p_pending_organization),
        external_pending_reason = btrim(p_pending_reason),
        external_follow_up_date = p_follow_up_date
      WHERE id = p_complaint_id RETURNING * INTO v_complaint;
      INSERT INTO public.complaint_comments(complaint_id, author_id, author_name, content, comment_type, is_system)
      VALUES (p_complaint_id, v_actor.id, v_actor.name,
        '기관·업체: ' || btrim(p_pending_organization) || E'\n대기 사유: ' || btrim(p_pending_reason) || E'\n재확인 예정일: ' || p_follow_up_date,
        'external_wait', true);
      v_action_label := '외부대기 등록';

    WHEN 'respond' THEN
      IF v_complaint.status NOT IN ('assigned', 'in_progress', 'pending_external', 'reopened') THEN
        RAISE EXCEPTION '현재 상태에서는 회신할 수 없습니다' USING ERRCODE = '22023';
      END IF;
      IF length(btrim(coalesce(p_response, ''))) < 10 OR nullif(btrim(coalesce(p_response_type, '')), '') IS NULL
         OR nullif(btrim(coalesce(p_response_channel, '')), '') IS NULL THEN
        RAISE EXCEPTION '회신 내용은 10자 이상이며 유형과 채널이 필요합니다' USING ERRCODE = '22023';
      END IF;
      IF v_field_required AND v_field_count = 0 AND length(btrim(coalesce(p_no_visit_reason, ''))) < 10 THEN
        RAISE EXCEPTION '현장 확인을 등록하거나 미실시 사유를 10자 이상 입력하세요' USING ERRCODE = '22023';
      END IF;
      IF p_response_type = 'resolved' AND v_unverified_work THEN
        RAISE EXCEPTION '연계 시설작업의 완료 검증 후 해결 회신을 등록하세요' USING ERRCODE = '22023';
      END IF;
      UPDATE public.complaints SET
        status = 'responded', response = btrim(p_response), response_type = p_response_type,
        response_channel = p_response_channel, responded_at = now(),
        external_pending_organization = NULL, external_pending_reason = NULL, external_follow_up_date = NULL
      WHERE id = p_complaint_id RETURNING * INTO v_complaint;
      INSERT INTO public.complaint_comments(complaint_id, author_id, author_name, content, comment_type)
      VALUES (p_complaint_id, v_actor.id, v_actor.name, btrim(p_response), 'external');
      IF v_field_required AND v_field_count = 0 THEN
        INSERT INTO public.complaint_comments(complaint_id, author_id, author_name, content, comment_type)
        VALUES (p_complaint_id, v_actor.id, v_actor.name,
          '현장확인 미실시 사유: ' || btrim(p_no_visit_reason), 'internal');
      END IF;
      v_action_label := '민원인 회신';

    WHEN 'close' THEN
      IF v_complaint.status <> 'responded' THEN
        RAISE EXCEPTION '민원인 회신을 완료한 뒤 완결하세요' USING ERRCODE = '22023';
      END IF;
      IF length(btrim(coalesce(p_resolution_summary, ''))) < 10
         OR nullif(btrim(coalesce(p_resolution_type, '')), '') IS NULL THEN
        RAISE EXCEPTION '해결 유형과 10자 이상의 종결 근거가 필요합니다' USING ERRCODE = '22023';
      END IF;
      IF p_resolution_type = 'resolved' AND v_unverified_work THEN
        RAISE EXCEPTION '연계 시설작업이 검증되지 않아 해결 종결할 수 없습니다' USING ERRCODE = '22023';
      END IF;
      IF (v_complaint.channel IN ('saeol', 'mail', 'councilman')
          OR v_complaint.saeol_ref IS NOT NULL OR v_complaint.external_ref IS NOT NULL)
         AND NOT v_has_reply_document THEN
        RAISE EXCEPTION '외부 연계 민원은 회신 또는 주 문서를 연결해야 합니다' USING ERRCODE = '22023';
      END IF;
      UPDATE public.complaints SET
        status = 'closed', closed_at = now(), closed_by = v_actor.id,
        resolution_type = p_resolution_type,
        notes = concat_ws(E'\n', nullif(notes, ''), '[종결 근거] ' || btrim(p_resolution_summary))
      WHERE id = p_complaint_id RETURNING * INTO v_complaint;
      INSERT INTO public.complaint_comments(complaint_id, author_id, author_name, content, comment_type)
      VALUES (p_complaint_id, v_actor.id, v_actor.name, btrim(p_resolution_summary), 'closure');
      v_action_label := '민원 완결';

    WHEN 'reopen' THEN
      IF v_complaint.status NOT IN ('responded', 'closed') THEN
        RAISE EXCEPTION '회신 또는 완결 민원만 재개할 수 있습니다' USING ERRCODE = '22023';
      END IF;
      IF length(btrim(coalesce(p_reopen_reason, ''))) < 5 THEN
        RAISE EXCEPTION '재개 사유를 5자 이상 입력하세요' USING ERRCODE = '22023';
      END IF;
      UPDATE public.complaints SET
        status = 'reopened', closed_at = NULL, closed_by = NULL, resolution_type = NULL,
        response = NULL, response_type = NULL, response_channel = NULL, responded_at = NULL,
        satisfaction_score = NULL, satisfaction_feedback = NULL, satisfaction_date = NULL,
        reopen_count = reopen_count + 1
      WHERE id = p_complaint_id RETURNING * INTO v_complaint;
      INSERT INTO public.complaint_comments(complaint_id, author_id, author_name, content, comment_type)
      VALUES (p_complaint_id, v_actor.id, v_actor.name, btrim(p_reopen_reason), 'reopen');
      v_action_label := '민원 재개';

    ELSE
      RAISE EXCEPTION '지원하지 않는 민원 처리 명령입니다: %', p_action USING ERRCODE = '22023';
  END CASE;

  INSERT INTO public.activity_logs(user_id, user_name, module, action, target_type, target_id, target_name, details)
  VALUES (v_actor.id, v_actor.name, 'COMPLAINT', p_action, 'complaint', p_complaint_id,
    v_complaint.complaint_number, jsonb_build_object('status', v_complaint.status, 'label', v_action_label));
  RETURN NEXT v_complaint;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_complaint_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION '민원 기록은 삭제할 수 없습니다. 감사 이력 보존을 위해 보관 처리하세요.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_complaint_hard_delete ON public.complaints;
CREATE TRIGGER trg_prevent_complaint_hard_delete
  BEFORE DELETE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.prevent_complaint_hard_delete();

DROP POLICY IF EXISTS "comp_delete" ON public.complaints;

REVOKE ALL ON FUNCTION public.next_complaint_number(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_complaint(uuid, text, timestamptz, text, text, text, text, text, text, text, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_complaint_number(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_complaint(uuid, text, timestamptz, text, text, text, text, text, text, text, text, date, text) TO authenticated;

DROP VIEW IF EXISTS public.mobile_complaint_work_v1;
CREATE VIEW public.mobile_complaint_work_v1
WITH (security_invoker = true)
AS
SELECT
  c.id, c.complaint_number, c.title, c.category, c.sub_category, c.priority, c.status,
  c.due_date, c.location_detail, c.vehicle_number, c.assigned_to, c.assigned_team, c.lot_id,
  pl.code AS parking_lot_code, pl.name AS parking_lot_name,
  coalesce(c.lot_type_at_event::public.lot_type_enum, pl.lot_type) AS parking_lot_type,
  c.external_pending_organization, c.external_pending_reason, c.external_follow_up_date,
  CASE
    WHEN c.status = 'assigned' THEN '현장 확인 또는 처리 시작'
    WHEN c.status = 'in_progress' THEN '처리 결과와 회신 등록'
    WHEN c.status = 'pending_external' THEN '외부기관 회신 예정일 확인'
    WHEN c.status = 'reopened' THEN '재개 사유 확인 후 재처리'
    ELSE '상태 확인'
  END AS next_action,
  (SELECT count(*) FROM public.complaint_comments cc WHERE cc.complaint_id = c.id AND cc.comment_type = 'field_visit') AS field_visit_count,
  (SELECT count(*) FROM public.attachments a WHERE a.module = 'COMPLAINT' AND a.ref_type = 'complaint' AND a.ref_id = c.id) AS evidence_count,
  c.row_version, c.updated_at
FROM public.complaints c
LEFT JOIN public.parking_lots pl ON pl.id = c.lot_id
WHERE c.archived_at IS NULL
  AND (c.assigned_to = auth.uid() OR c.assigned_team = public.get_user_team(auth.uid()))
  AND c.status IN ('assigned', 'in_progress', 'pending_external', 'reopened');

GRANT SELECT ON public.mobile_complaint_work_v1 TO authenticated;

COMMENT ON FUNCTION public.advance_complaint(uuid, text, timestamptz, text, text, text, text, text, text, text, text, date, text) IS
  'Atomic complaint lifecycle command used by web and future mobile clients.';
