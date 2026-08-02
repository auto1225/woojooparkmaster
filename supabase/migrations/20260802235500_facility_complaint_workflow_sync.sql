-- Keep complaint ownership, progress, and field evidence aligned with linked facility work.

CREATE OR REPLACE FUNCTION public.sync_linked_maintenance_to_complaint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_complaint public.complaints%ROWTYPE;
  v_actor_id uuid;
  v_actor_name text;
  v_target_status text;
  v_message text;
  v_comment_type text := 'internal';
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     OR upper(coalesce(NEW.source_module, '')) <> 'COMPLAINT'
     OR NEW.source_record_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_complaint
  FROM public.complaints
  WHERE id = NEW.source_record_id
  FOR UPDATE;

  IF v_complaint.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_actor_id := coalesce(
    auth.uid(), NEW.closed_by, NEW.assigned_to, NEW.reported_by,
    v_complaint.assigned_to, v_complaint.created_by
  );
  SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;
  IF v_actor_id IS NULL OR v_actor_name IS NULL THEN
    RETURN NEW;
  END IF;

  v_target_status := CASE
    WHEN NEW.status = 'assigned' AND v_complaint.status = 'received' THEN 'assigned'
    WHEN NEW.status IN ('in_progress', 'pending_parts', 'completed', 'verified')
         AND v_complaint.status IN ('received', 'assigned', 'reopened') THEN 'in_progress'
    ELSE v_complaint.status
  END;

  UPDATE public.complaints
  SET assigned_to = CASE
        WHEN assigned_to IS NULL AND NEW.assigned_to IS NOT NULL THEN NEW.assigned_to
        ELSE assigned_to
      END,
      assigned_at = CASE
        WHEN assigned_to IS NULL AND NEW.assigned_to IS NOT NULL THEN coalesce(NEW.assigned_at, now())
        ELSE assigned_at
      END,
      status = v_target_status
  WHERE id = v_complaint.id;

  v_message := CASE NEW.status
    WHEN 'assigned' THEN NEW.log_number || ' 시설작업 담당자가 배정되었습니다.'
    WHEN 'in_progress' THEN NEW.log_number || ' 시설작업이 시작되었습니다.'
    WHEN 'pending_parts' THEN NEW.log_number || ' 시설작업이 부품 대기 상태로 변경되었습니다.'
    WHEN 'completed' THEN NEW.log_number || ' 시설작업 완료가 제출되었습니다. 현장 결과를 확인하세요.'
    WHEN 'verified' THEN NEW.log_number || ' 시설작업과 완료 사진이 검증되었습니다. 민원 회신 및 종결을 진행하세요.'
    WHEN 'cancelled' THEN NEW.log_number || ' 시설작업이 취소되었습니다. 민원 처리계획을 다시 확인하세요.'
    ELSE NEW.log_number || ' 시설작업 상태가 ' || NEW.status || '(으)로 변경되었습니다.'
  END;

  IF NEW.status = 'verified' THEN
    v_comment_type := 'field_visit';
  END IF;

  INSERT INTO public.complaint_comments (
    complaint_id, author_id, author_name, content, comment_type,
    attachment_path, is_system, visit_occurred_at, visit_outcome,
    checklist_result, action_taken, device_platform, sync_status
  ) VALUES (
    v_complaint.id, v_actor_id, v_actor_name, v_message, v_comment_type,
    CASE WHEN NEW.status = 'verified' THEN NEW.after_photo ELSE NULL END,
    true,
    CASE WHEN NEW.status = 'verified' THEN coalesce(NEW.completed_at, now()) ELSE NULL END,
    CASE WHEN NEW.status = 'verified' THEN '시설작업 검증완료' ELSE NULL END,
    CASE WHEN NEW.status = 'verified' THEN jsonb_build_array(jsonb_build_object(
      'source', 'maintenance_log', 'log_number', NEW.log_number, 'status', NEW.status
    )) ELSE NULL END,
    CASE WHEN NEW.status = 'verified' THEN NEW.resolution ELSE NULL END,
    'facility_work_sync', 'synced'
  );

  INSERT INTO public.activity_logs (
    user_id, user_name, module, action, target_type, target_id, target_name, details
  ) VALUES (
    v_actor_id, v_actor_name, 'COMPLAINT', 'facility_work_sync',
    'complaint', v_complaint.id, v_complaint.complaint_number,
    jsonb_build_object(
      'maintenance_log_id', NEW.id,
      'maintenance_log_number', NEW.log_number,
      'maintenance_status', NEW.status,
      'complaint_status', v_target_status
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_linked_maintenance_to_complaint ON public.maintenance_logs;
CREATE TRIGGER trg_sync_linked_maintenance_to_complaint
  AFTER UPDATE OF status ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_linked_maintenance_to_complaint();

-- Align linked records created before this trigger was installed.
UPDATE public.complaints c
SET assigned_to = coalesce(c.assigned_to, ml.assigned_to),
    assigned_at = CASE
      WHEN c.assigned_to IS NULL AND ml.assigned_to IS NOT NULL THEN coalesce(ml.assigned_at, now())
      ELSE c.assigned_at
    END,
    status = CASE
      WHEN ml.status = 'assigned' AND c.status = 'received' THEN 'assigned'
      WHEN ml.status IN ('in_progress', 'pending_parts', 'completed', 'verified')
           AND c.status IN ('received', 'assigned', 'reopened') THEN 'in_progress'
      ELSE c.status
    END
FROM public.maintenance_logs ml
WHERE upper(coalesce(ml.source_module, '')) = 'COMPLAINT'
  AND ml.source_record_id = c.id;

INSERT INTO public.complaint_comments (
  complaint_id, author_id, author_name, content, comment_type,
  attachment_path, is_system, visit_occurred_at, visit_outcome,
  checklist_result, action_taken, device_platform, sync_status
)
SELECT
  c.id, actor.id, actor.name,
  ml.log_number || ' 시설작업과 완료 사진이 검증되었습니다. 민원 회신 및 종결을 진행하세요.',
  'field_visit', ml.after_photo, true, coalesce(ml.completed_at, ml.verified_at, now()),
  '시설작업 검증완료',
  jsonb_build_array(jsonb_build_object(
    'source', 'maintenance_log', 'log_number', ml.log_number, 'status', ml.status
  )),
  ml.resolution, 'facility_work_sync', 'synced'
FROM public.maintenance_logs ml
JOIN public.complaints c ON c.id = ml.source_record_id
JOIN public.profiles actor ON actor.id = coalesce(ml.verified_by, ml.closed_by, ml.assigned_to, ml.reported_by, c.assigned_to, c.created_by)
WHERE upper(coalesce(ml.source_module, '')) = 'COMPLAINT'
  AND ml.status = 'verified'
  AND nullif(trim(coalesce(ml.after_photo, '')), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.complaint_comments cc
    WHERE cc.complaint_id = c.id
      AND cc.comment_type = 'field_visit'
      AND cc.device_platform = 'facility_work_sync'
      AND cc.attachment_path = ml.after_photo
  );

REVOKE ALL ON FUNCTION public.sync_linked_maintenance_to_complaint() FROM PUBLIC;

COMMENT ON FUNCTION public.sync_linked_maintenance_to_complaint() IS
  'Synchronizes linked facility work ownership and progress to the originating complaint without auto-closing it.';
