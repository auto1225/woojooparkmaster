-- Practical maintenance work orders generated from preventive schedules.

ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_maint_logs_assignee_due
  ON public.maintenance_logs(assigned_to, due_date, status);

CREATE OR REPLACE FUNCTION public.next_maintenance_due(p_schedule_type text, p_from date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_schedule_type
    WHEN 'daily' THEN p_from + 1
    WHEN 'weekly' THEN p_from + 7
    WHEN 'monthly' THEN (p_from + INTERVAL '1 month')::date
    WHEN 'quarterly' THEN (p_from + INTERVAL '3 months')::date
    WHEN 'semi_annual' THEN (p_from + INTERVAL '6 months')::date
    WHEN 'yearly' THEN (p_from + INTERVAL '1 year')::date
    ELSE (p_from + INTERVAL '1 month')::date
  END;
$$;

CREATE OR REPLACE FUNCTION public.generate_due_maintenance_work_orders(p_until date DEFAULT CURRENT_DATE + 14)
RETURNS SETOF public.maintenance_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_schedule public.maintenance_schedules%ROWTYPE;
  v_log public.maintenance_logs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_module_active('FACILITY') THEN
    RAISE EXCEPTION '시설관리 모듈에 접근할 수 없습니다' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  IF v_actor.role NOT IN ('admin', 'manager', 'editor') THEN
    RAISE EXCEPTION '작업지시를 생성할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;

  FOR v_schedule IN
    SELECT s.*
    FROM public.maintenance_schedules s
    WHERE s.is_active = true
      AND s.next_due_date <= p_until
      AND NOT EXISTS (
        SELECT 1 FROM public.maintenance_logs ml
        WHERE ml.schedule_id = s.id
          AND ml.status NOT IN ('verified', 'cancelled')
      )
    ORDER BY s.next_due_date
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.maintenance_logs (
      log_number, lot_id, equipment_id, schedule_id, maintenance_type, priority,
      title, description, reported_by, assigned_to, assigned_at, due_date, status
    ) VALUES (
      'MW-' || to_char(v_schedule.next_due_date, 'YYYYMMDD') || '-' || upper(substr(replace(v_schedule.id::text, '-', ''), 1, 6)),
      v_schedule.lot_id,
      v_schedule.equipment_id,
      v_schedule.id,
      'scheduled',
      'medium',
      v_schedule.schedule_name,
      v_schedule.description,
      v_actor.id,
      v_schedule.assigned_to,
      CASE WHEN v_schedule.assigned_to IS NOT NULL THEN now() ELSE NULL END,
      v_schedule.next_due_date,
      CASE WHEN v_schedule.assigned_to IS NOT NULL THEN 'assigned' ELSE 'reported' END
    )
    ON CONFLICT (log_number) DO NOTHING
    RETURNING * INTO v_log;

    IF v_log.id IS NOT NULL THEN
      IF v_log.assigned_to IS NOT NULL AND v_log.assigned_to <> auth.uid() THEN
        INSERT INTO public.notifications (user_id, module, type, title, message, link)
        VALUES (
          v_log.assigned_to, 'FACILITY', 'assignment', '정기점검 작업 배정',
          v_log.title || ' · 기한 ' || v_log.due_date,
          '/facility/maintenance?work=' || v_log.id
        );
      END IF;
      RETURN NEXT v_log;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_maintenance_work(
  p_log_id uuid,
  p_action text,
  p_assignee_id uuid DEFAULT NULL,
  p_resolution text DEFAULT NULL,
  p_evidence_path text DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS SETOF public.maintenance_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_assignee public.profiles%ROWTYPE;
  v_log public.maintenance_logs%ROWTYPE;
  v_next_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_module_active('FACILITY') THEN
    RAISE EXCEPTION '시설관리 모듈에 접근할 수 없습니다' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  SELECT * INTO v_log FROM public.maintenance_logs WHERE id = p_log_id FOR UPDATE;

  IF v_actor.id IS NULL OR v_log.id IS NULL THEN
    RAISE EXCEPTION '사용자 또는 작업지시를 찾을 수 없습니다' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_log.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '다른 사용자가 먼저 작업지시를 변경했습니다. 새로고침 후 다시 시도해주세요' USING ERRCODE = '40001';
  END IF;

  v_next_status := CASE p_action
    WHEN 'assign' THEN 'assigned'
    WHEN 'start' THEN 'in_progress'
    WHEN 'wait_parts' THEN 'pending_parts'
    WHEN 'resume' THEN 'in_progress'
    WHEN 'complete' THEN 'completed'
    WHEN 'verify' THEN 'verified'
    WHEN 'cancel' THEN 'cancelled'
    ELSE NULL
  END;

  IF v_next_status IS NULL THEN
    RAISE EXCEPTION '지원하지 않는 작업 명령입니다' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'assign' THEN
    IF v_log.status <> 'reported' OR p_assignee_id IS NULL OR v_actor.role NOT IN ('admin', 'manager', 'editor') THEN
      RAISE EXCEPTION '현재 작업을 배정할 수 없습니다' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_assignee FROM public.profiles WHERE id = p_assignee_id AND is_active = true;
    IF v_assignee.id IS NULL THEN
      RAISE EXCEPTION '활성 담당자를 찾을 수 없습니다' USING ERRCODE = 'P0002';
    END IF;
    IF v_actor.role = 'editor' AND p_assignee_id <> auth.uid() THEN
      RAISE EXCEPTION '담당자는 본인으로만 지정할 수 있습니다' USING ERRCODE = '42501';
    END IF;
  ELSIF p_action = 'verify' THEN
    IF v_log.status <> 'completed' OR v_actor.role NOT IN ('admin', 'manager') THEN
      RAISE EXCEPTION '완료된 작업을 검증할 권한이 없습니다' USING ERRCODE = '42501';
    END IF;
  ELSIF p_action = 'cancel' THEN
    IF v_log.status IN ('verified', 'cancelled') OR v_actor.role NOT IN ('admin', 'manager') THEN
      RAISE EXCEPTION '현재 작업을 취소할 권한이 없습니다' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF v_log.assigned_to <> auth.uid() AND v_actor.role NOT IN ('admin', 'manager') THEN
      RAISE EXCEPTION '담당자만 작업을 처리할 수 있습니다' USING ERRCODE = '42501';
    END IF;
    IF (p_action = 'start' AND v_log.status <> 'assigned')
       OR (p_action = 'wait_parts' AND v_log.status <> 'in_progress')
       OR (p_action = 'resume' AND v_log.status <> 'pending_parts')
       OR (p_action = 'complete' AND v_log.status <> 'in_progress') THEN
      RAISE EXCEPTION '현재 상태에서는 이 작업을 수행할 수 없습니다' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_action = 'complete'
     AND (length(trim(COALESCE(p_resolution, ''))) = 0 OR length(trim(COALESCE(p_evidence_path, ''))) = 0) THEN
    RAISE EXCEPTION '완료하려면 조치 내용과 완료 사진 증빙이 필요합니다' USING ERRCODE = '22023';
  END IF;

  UPDATE public.maintenance_logs
  SET status = v_next_status,
      assigned_to = CASE WHEN p_action = 'assign' THEN p_assignee_id ELSE assigned_to END,
      assigned_at = CASE WHEN p_action = 'assign' THEN now() ELSE assigned_at END,
      started_at = CASE WHEN p_action = 'start' THEN now() ELSE started_at END,
      resolution = CASE WHEN p_action = 'complete' THEN trim(p_resolution) ELSE resolution END,
      after_photo = CASE WHEN p_action = 'complete' THEN trim(p_evidence_path) ELSE after_photo END,
      completed_at = CASE WHEN p_action = 'complete' THEN now() ELSE completed_at END,
      verified_by = CASE WHEN p_action = 'verify' THEN v_actor.id ELSE verified_by END,
      verified_at = CASE WHEN p_action = 'verify' THEN now() ELSE verified_at END,
      closed_by = CASE WHEN p_action IN ('verify', 'cancel') THEN v_actor.id ELSE closed_by END,
      closed_at = CASE WHEN p_action IN ('verify', 'cancel') THEN now() ELSE closed_at END
  WHERE id = p_log_id
  RETURNING * INTO v_log;

  IF p_action = 'assign' AND p_assignee_id <> auth.uid() THEN
    INSERT INTO public.notifications (user_id, module, type, title, message, link)
    VALUES (
      p_assignee_id, 'FACILITY', 'assignment', '유지보수 작업 배정',
      v_log.log_number || ' · ' || v_log.title,
      '/facility/maintenance?work=' || v_log.id
    );
  END IF;

  INSERT INTO public.activity_logs (
    user_id, user_name, module, action, target_type, target_id, target_name, details
  ) VALUES (
    v_actor.id, v_actor.name, 'FACILITY', p_action, 'maintenance_log', v_log.id, v_log.log_number,
    jsonb_build_object('status', v_next_status, 'assignee_id', v_log.assigned_to, 'evidence_path', p_evidence_path)
  );

  RETURN NEXT v_log;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_maintenance_schedule_after_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'verified' AND OLD.status IS DISTINCT FROM 'verified' AND NEW.schedule_id IS NOT NULL THEN
    UPDATE public.maintenance_schedules
    SET last_completed = COALESCE(NEW.completed_at::date, CURRENT_DATE),
        next_due_date = public.next_maintenance_due(schedule_type, COALESCE(NEW.due_date, CURRENT_DATE))
    WHERE id = NEW.schedule_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_schedule_after_verification ON public.maintenance_logs;
CREATE TRIGGER trg_advance_schedule_after_verification
  AFTER UPDATE OF status ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.advance_maintenance_schedule_after_verification();

REVOKE ALL ON FUNCTION public.generate_due_maintenance_work_orders(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_maintenance_work(uuid, text, uuid, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_due_maintenance_work_orders(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_maintenance_work(uuid, text, uuid, text, text, timestamptz) TO authenticated;
