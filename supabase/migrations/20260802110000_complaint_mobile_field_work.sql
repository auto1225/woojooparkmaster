-- Complaint field-work contract shared by web and future mobile clients.

ALTER TABLE public.complaint_comments
  ADD COLUMN IF NOT EXISTS client_mutation_id uuid,
  ADD COLUMN IF NOT EXISTS visit_occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS visit_outcome text,
  ADD COLUMN IF NOT EXISTS checklist_result jsonb,
  ADD COLUMN IF NOT EXISTS action_taken text,
  ADD COLUMN IF NOT EXISTS device_platform text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced';

CREATE UNIQUE INDEX IF NOT EXISTS uq_complaint_comments_client_mutation
  ON public.complaint_comments(client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_complaint_row_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_complaint_row_version ON public.complaints;
CREATE TRIGGER trg_bump_complaint_row_version
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.bump_complaint_row_version();

CREATE OR REPLACE FUNCTION public.record_complaint_field_visit(
  p_complaint_id uuid,
  p_client_mutation_id uuid,
  p_visit_occurred_at timestamptz,
  p_visit_outcome text,
  p_checklist_result jsonb,
  p_observation text,
  p_action_taken text DEFAULT NULL,
  p_device_platform text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_complaint public.complaints%ROWTYPE;
  v_comment_id uuid;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  IF v_actor.id IS NULL THEN RAISE EXCEPTION 'active profile required'; END IF;

  SELECT * INTO v_complaint FROM public.complaints WHERE id = p_complaint_id FOR UPDATE;
  IF v_complaint.id IS NULL THEN RAISE EXCEPTION 'complaint not found'; END IF;
  IF NOT (
    v_actor.role IN ('admin', 'manager')
    OR v_complaint.assigned_to = v_actor.id
    OR v_complaint.assigned_team = v_actor.team
  ) THEN
    RAISE EXCEPTION 'not authorized for this complaint';
  END IF;
  IF v_complaint.status IN ('received', 'closed') THEN
    RAISE EXCEPTION 'field visit is not allowed in current status';
  END IF;
  IF nullif(trim(p_observation), '') IS NULL THEN RAISE EXCEPTION 'observation required'; END IF;

  SELECT id INTO v_comment_id
  FROM public.complaint_comments
  WHERE client_mutation_id = p_client_mutation_id;
  IF v_comment_id IS NOT NULL THEN RETURN v_comment_id; END IF;

  INSERT INTO public.complaint_comments (
    complaint_id, author_id, author_name, content, comment_type,
    client_mutation_id, visit_occurred_at, visit_outcome, checklist_result,
    action_taken, device_platform, sync_status
  ) VALUES (
    p_complaint_id, v_actor.id, v_actor.name,
    '[현장확인]' || E'\n확인시각: ' || to_char(p_visit_occurred_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') ||
      E'\n확인결과: ' || p_visit_outcome || E'\n현장관찰: ' || trim(p_observation) ||
      E'\n조치내용: ' || coalesce(nullif(trim(p_action_taken), ''), '현장 조치 없음'),
    'field_visit', p_client_mutation_id, p_visit_occurred_at, p_visit_outcome,
    coalesce(p_checklist_result, '[]'::jsonb), nullif(trim(p_action_taken), ''),
    p_device_platform, 'synced'
  ) RETURNING id INTO v_comment_id;

  IF v_complaint.status IN ('assigned', 'reopened') THEN
    UPDATE public.complaints SET status = 'in_progress' WHERE id = p_complaint_id;
  END IF;

  INSERT INTO public.activity_logs (user_id, user_name, module, action, target_type, target_id, target_name, details)
  VALUES (v_actor.id, v_actor.name, 'COMPLAINT', 'field_visit', 'complaint', p_complaint_id,
    v_complaint.complaint_number, jsonb_build_object('outcome', p_visit_outcome, 'client_mutation_id', p_client_mutation_id));
  RETURN v_comment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_complaint_field_visit(uuid, uuid, timestamptz, text, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_complaint_field_visit(uuid, uuid, timestamptz, text, jsonb, text, text, text) TO authenticated;

CREATE OR REPLACE VIEW public.mobile_complaint_work_v1
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.complaint_number,
  c.title,
  c.category,
  c.sub_category,
  c.priority,
  c.status,
  c.due_date,
  c.location_detail,
  c.vehicle_number,
  c.assigned_to,
  c.assigned_team,
  c.lot_id,
  pl.code AS parking_lot_code,
  pl.name AS parking_lot_name,
  pl.lot_type AS parking_lot_type,
  CASE
    WHEN c.status = 'assigned' THEN '현장 확인 또는 처리 시작'
    WHEN c.status = 'in_progress' THEN '처리 결과와 회신 등록'
    WHEN c.status = 'pending_external' THEN '외부기관 회신 예정일 확인'
    WHEN c.status = 'reopened' THEN '재개 사유 확인 후 재처리'
    ELSE '상태 확인'
  END AS next_action,
  (SELECT count(*) FROM public.complaint_comments cc WHERE cc.complaint_id = c.id AND cc.comment_type = 'field_visit') AS field_visit_count,
  (SELECT count(*) FROM public.attachments a WHERE a.module = 'COMPLAINT' AND a.ref_type = 'complaint' AND a.ref_id = c.id) AS evidence_count,
  c.row_version,
  c.updated_at
FROM public.complaints c
LEFT JOIN public.parking_lots pl ON pl.id = c.lot_id
WHERE (c.assigned_to = auth.uid() OR c.assigned_team = public.get_user_team(auth.uid()))
  AND c.status IN ('assigned', 'in_progress', 'pending_external', 'reopened');

GRANT SELECT ON public.mobile_complaint_work_v1 TO authenticated;

COMMENT ON VIEW public.mobile_complaint_work_v1 IS
  'Versioned read contract for assigned complaint field work. Mobile writes use record_complaint_field_visit and existing workflow commands.';
