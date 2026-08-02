-- Sensor incident response and construction-to-operation lifecycle handoff.

CREATE TABLE IF NOT EXISTS public.sensor_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_number varchar(30) NOT NULL UNIQUE,
  sensor_id uuid NOT NULL REFERENCES public.sensor_devices(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.parking_lots(id) ON DELETE CASCADE,
  anomaly_type varchar(30) NOT NULL,
  severity varchar(10) NOT NULL DEFAULT 'high',
  status varchar(30) NOT NULL DEFAULT 'open',
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  detection_count integer NOT NULL DEFAULT 1,
  acknowledged_by uuid REFERENCES public.profiles(id),
  acknowledged_at timestamptz,
  maintenance_log_id uuid REFERENCES public.maintenance_logs(id),
  recovery_detected_at timestamptz,
  recovery_confirmed_by uuid REFERENCES public.profiles(id),
  recovery_confirmed_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_incident_open_unique
ON public.sensor_incidents(sensor_id, anomaly_type)
WHERE status IN ('open', 'acknowledged', 'recovery_detected');

CREATE INDEX IF NOT EXISTS idx_sensor_incident_status
ON public.sensor_incidents(status, severity, first_detected_at DESC);

ALTER TABLE public.sensor_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sensor_incident_select" ON public.sensor_incidents;
CREATE POLICY "sensor_incident_select"
ON public.sensor_incidents FOR SELECT TO authenticated
USING (public.is_module_active('REALTIME'));

DROP POLICY IF EXISTS "sensor_incident_modify" ON public.sensor_incidents;
CREATE POLICY "sensor_incident_modify"
ON public.sensor_incidents FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_active
      AND (role IN ('admin', 'manager') OR team = 'facilities')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_active
      AND (role IN ('admin', 'manager') OR team = 'facilities')
  )
);

CREATE OR REPLACE FUNCTION public.monitor_sensor_anomalies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sensor record;
  v_incident_id uuid;
  v_work_id uuid;
  v_assignee uuid;
  v_created integer := 0;
  v_updated integer := 0;
  v_recovery integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_active AND role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION '센서 이상 감시 권한이 없습니다.';
  END IF;

  SELECT id INTO v_assignee
  FROM public.profiles
  WHERE is_active AND team = 'facilities'
  ORDER BY CASE role WHEN 'manager' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, created_at
  LIMIT 1;

  FOR v_sensor IN
    SELECT
      sd.*,
      CASE
        WHEN sd.status = 'error' THEN 'device_error'
        WHEN sd.status = 'offline'
          OR (sd.last_heartbeat IS NOT NULL AND sd.last_heartbeat < now() - make_interval(mins => sd.alert_offline_minutes))
          THEN 'offline'
        WHEN sd.battery_level IS NOT NULL AND sd.battery_level < sd.alert_battery_threshold THEN 'low_battery'
        ELSE NULL
      END AS anomaly_type
    FROM public.sensor_devices sd
  LOOP
    CONTINUE WHEN v_sensor.anomaly_type IS NULL;

    SELECT id INTO v_incident_id
    FROM public.sensor_incidents
    WHERE sensor_id = v_sensor.id
      AND anomaly_type = v_sensor.anomaly_type
      AND status IN ('open', 'acknowledged', 'recovery_detected')
    FOR UPDATE;

    IF v_incident_id IS NOT NULL THEN
      UPDATE public.sensor_incidents
      SET last_detected_at = now(),
          detection_count = detection_count + 1,
          status = CASE WHEN status = 'recovery_detected' THEN 'open' ELSE status END,
          recovery_detected_at = CASE WHEN status = 'recovery_detected' THEN NULL ELSE recovery_detected_at END,
          updated_at = now()
      WHERE id = v_incident_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.sensor_incidents (
        incident_number, sensor_id, lot_id, anomaly_type, severity
      ) VALUES (
        'SEN-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)),
        v_sensor.id,
        v_sensor.lot_id,
        v_sensor.anomaly_type,
        CASE WHEN v_sensor.anomaly_type IN ('device_error', 'offline') THEN 'urgent' ELSE 'high' END
      )
      RETURNING id INTO v_incident_id;

      INSERT INTO public.maintenance_logs (
        log_number,
        lot_id,
        maintenance_type,
        priority,
        title,
        description,
        reported_by,
        assigned_to,
        assigned_at,
        due_date,
        status
      ) VALUES (
        'MNT-SEN-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 3)),
        v_sensor.lot_id,
        'sensor_fault',
        CASE WHEN v_sensor.anomaly_type IN ('device_error', 'offline') THEN 'urgent' ELSE 'high' END,
        '[센서] ' || v_sensor.device_id || ' ' || CASE v_sensor.anomaly_type
          WHEN 'device_error' THEN '장치 오류'
          WHEN 'offline' THEN '통신 두절'
          WHEN 'low_battery' THEN '배터리 부족'
          ELSE v_sensor.anomaly_type
        END,
        '센서 자동 감시에서 생성된 작업지시입니다. 사건번호: ' || (
          SELECT incident_number FROM public.sensor_incidents WHERE id = v_incident_id
        ),
        auth.uid(),
        v_assignee,
        CASE WHEN v_assignee IS NOT NULL THEN now() ELSE NULL END,
        current_date + CASE WHEN v_sensor.anomaly_type = 'low_battery' THEN 3 ELSE 1 END,
        CASE WHEN v_assignee IS NOT NULL THEN 'assigned' ELSE 'reported' END
      )
      RETURNING id INTO v_work_id;

      UPDATE public.sensor_incidents
      SET maintenance_log_id = v_work_id
      WHERE id = v_incident_id;

      UPDATE public.sensor_devices SET alert_sent = true WHERE id = v_sensor.id;

      IF v_assignee IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, module, type, title, message, link)
        VALUES (
          v_assignee,
          'REALTIME',
          'warning',
          '센서 이상 작업 배정',
          v_sensor.device_id || ' 센서 이상이 감지되어 작업지시가 생성되었습니다.',
          '/realtime/sensors'
        );
      END IF;
      v_created := v_created + 1;
    END IF;
  END LOOP;

  UPDATE public.sensor_incidents si
  SET status = 'recovery_detected',
      recovery_detected_at = now(),
      updated_at = now()
  FROM public.sensor_devices sd
  WHERE si.sensor_id = sd.id
    AND si.status IN ('open', 'acknowledged')
    AND NOT (
      (si.anomaly_type = 'device_error' AND sd.status = 'error')
      OR (
        si.anomaly_type = 'offline'
        AND (
          sd.status = 'offline'
          OR (sd.last_heartbeat IS NOT NULL AND sd.last_heartbeat < now() - make_interval(mins => sd.alert_offline_minutes))
        )
      )
      OR (
        si.anomaly_type = 'low_battery'
        AND sd.battery_level IS NOT NULL
        AND sd.battery_level < sd.alert_battery_threshold
      )
    );
  GET DIAGNOSTICS v_recovery = ROW_COUNT;

  RETURN jsonb_build_object('created', v_created, 'updated', v_updated, 'recovery_detected', v_recovery);
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_sensor_incident(
  p_incident_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS public.sensor_incidents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incident public.sensor_incidents%ROWTYPE;
  v_sensor public.sensor_devices%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND is_active
      AND (role IN ('admin', 'manager') OR team = 'facilities')
  ) THEN
    RAISE EXCEPTION '센서 사건 처리 권한이 없습니다.';
  END IF;

  SELECT * INTO v_incident FROM public.sensor_incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '센서 사건을 찾을 수 없습니다.'; END IF;

  IF p_action = 'acknowledge' THEN
    IF v_incident.status <> 'open' THEN RAISE EXCEPTION '접수 가능한 상태가 아닙니다.'; END IF;
    UPDATE public.sensor_incidents
    SET status = 'acknowledged', acknowledged_by = auth.uid(), acknowledged_at = now(), updated_at = now()
    WHERE id = p_incident_id;
  ELSIF p_action = 'confirm_recovery' THEN
    SELECT * INTO v_sensor FROM public.sensor_devices WHERE id = v_incident.sensor_id;
    IF v_incident.status <> 'recovery_detected' THEN RAISE EXCEPTION '정상 신호가 감지된 사건만 복구 확인할 수 있습니다.'; END IF;
    IF COALESCE(length(trim(p_note)), 0) < 3 THEN RAISE EXCEPTION '복구 확인 내용을 입력하세요.'; END IF;
    UPDATE public.sensor_incidents
    SET status = 'resolved',
        recovery_confirmed_by = auth.uid(),
        recovery_confirmed_at = now(),
        resolution_note = p_note,
        updated_at = now()
    WHERE id = p_incident_id;
    UPDATE public.sensor_devices SET alert_sent = false WHERE id = v_incident.sensor_id;
  ELSIF p_action = 'reopen' THEN
    IF v_incident.status <> 'resolved' THEN RAISE EXCEPTION '종결된 사건만 재개할 수 있습니다.'; END IF;
    UPDATE public.sensor_incidents
    SET status = 'open', recovery_confirmed_by = NULL, recovery_confirmed_at = NULL, updated_at = now()
    WHERE id = p_incident_id;
  ELSE
    RAISE EXCEPTION '지원하지 않는 사건 처리입니다.';
  END IF;

  INSERT INTO public.activity_logs (user_id, module, action, target_type, target_id, target_name, details)
  VALUES (
    auth.uid(), 'REALTIME', 'sensor_incident_' || p_action, 'sensor_incident',
    p_incident_id, v_incident.incident_number, jsonb_build_object('note', p_note)
  );

  SELECT * INTO v_incident FROM public.sensor_incidents WHERE id = p_incident_id;
  RETURN v_incident;
END;
$$;

CREATE TABLE IF NOT EXISTS public.construction_completion_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.construction_projects(id) ON DELETE CASCADE,
  check_code varchar(40) NOT NULL,
  label varchar(200) NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  requires_evidence boolean NOT NULL DEFAULT false,
  is_completed boolean NOT NULL DEFAULT false,
  evidence_path text,
  notes text,
  completed_by uuid REFERENCES public.profiles(id),
  completed_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, check_code)
);

ALTER TABLE public.construction_completion_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "completion_check_select" ON public.construction_completion_checks;
CREATE POLICY "completion_check_select"
ON public.construction_completion_checks FOR SELECT TO authenticated USING (public.is_module_active('PLANNING'));

DROP POLICY IF EXISTS "completion_check_modify" ON public.construction_completion_checks;
CREATE POLICY "completion_check_modify"
ON public.construction_completion_checks FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'editor')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'editor')));

CREATE OR REPLACE FUNCTION public.ensure_construction_completion_checklist(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.construction_projects WHERE id = p_project_id) THEN
    RAISE EXCEPTION '공사 프로젝트를 찾을 수 없습니다.';
  END IF;

  INSERT INTO public.construction_completion_checks (
    project_id, check_code, label, is_required, requires_evidence, sort_order
  ) VALUES
    (p_project_id, 'completion_inspection', '준공검사 합격', true, true, 10),
    (p_project_id, 'as_built_docs', '준공도면 및 시설물 인수자료', true, true, 20),
    (p_project_id, 'permits_closed', '인허가 조건 이행 확인', true, false, 30),
    (p_project_id, 'safety_confirmed', '안전·소방·전기 점검 완료', true, true, 40),
    (p_project_id, 'operations_handover', '운영부서 인수인계 완료', true, false, 50),
    (p_project_id, 'warranty_registered', '하자보증 및 연락망 등록', true, false, 60)
  ON CONFLICT (project_id, check_code) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_construction_completion_check(
  p_check_id uuid,
  p_completed boolean,
  p_evidence_path text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.construction_completion_checks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check public.construction_completion_checks%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin', 'manager', 'editor')
  ) THEN RAISE EXCEPTION '준공 체크리스트 수정 권한이 없습니다.'; END IF;

  SELECT * INTO v_check FROM public.construction_completion_checks WHERE id = p_check_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '준공 체크 항목을 찾을 수 없습니다.'; END IF;
  IF p_completed AND v_check.requires_evidence AND COALESCE(length(trim(p_evidence_path)), 0) < 3 THEN
    RAISE EXCEPTION '이 항목은 증빙 경로가 필요합니다.';
  END IF;

  UPDATE public.construction_completion_checks
  SET is_completed = p_completed,
      evidence_path = NULLIF(trim(p_evidence_path), ''),
      notes = NULLIF(trim(p_notes), ''),
      completed_by = CASE WHEN p_completed THEN auth.uid() ELSE NULL END,
      completed_at = CASE WHEN p_completed THEN now() ELSE NULL END
  WHERE id = p_check_id
  RETURNING * INTO v_check;
  RETURN v_check;
END;
$$;

CREATE OR REPLACE FUNCTION public.handoff_construction_to_operations(
  p_project_id uuid,
  p_lot_code text,
  p_lot_name text,
  p_total_spaces integer,
  p_address_road text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.construction_projects%ROWTYPE;
  v_site public.site_candidates%ROWTYPE;
  v_lot_id uuid;
  v_missing integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin', 'manager')
  ) THEN RAISE EXCEPTION '운영 전환 승인 권한이 없습니다.'; END IF;

  SELECT * INTO v_project FROM public.construction_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '공사 프로젝트를 찾을 수 없습니다.'; END IF;
  IF v_project.status = 'completed' AND v_project.lot_id IS NOT NULL THEN RETURN v_project.lot_id; END IF;
  IF v_project.phase NOT IN ('inspection', 'completion') THEN RAISE EXCEPTION '준공검수 단계에서만 운영 전환할 수 있습니다.'; END IF;

  PERFORM public.ensure_construction_completion_checklist(p_project_id);
  SELECT count(*) INTO v_missing
  FROM public.construction_completion_checks
  WHERE project_id = p_project_id AND is_required AND NOT is_completed;
  IF v_missing > 0 THEN RAISE EXCEPTION '필수 준공 체크 %건이 완료되지 않았습니다.', v_missing; END IF;

  IF EXISTS (
    SELECT 1 FROM public.permits
    WHERE project_id = p_project_id AND status NOT IN ('approved', 'conditional_approved')
  ) THEN RAISE EXCEPTION '미승인 인허가가 남아 있습니다.'; END IF;

  IF v_project.site_id IS NOT NULL THEN
    SELECT * INTO v_site FROM public.site_candidates WHERE id = v_project.site_id;
  END IF;

  IF v_project.lot_id IS NOT NULL THEN
    UPDATE public.parking_lots
    SET status = 'active',
        total_spaces = COALESCE(NULLIF(p_total_spaces, 0), total_spaces),
        updated_at = now()
    WHERE id = v_project.lot_id
    RETURNING id INTO v_lot_id;
  ELSE
    IF COALESCE(length(trim(p_lot_code)), 0) < 2 OR COALESCE(length(trim(p_lot_name)), 0) < 2 THEN
      RAISE EXCEPTION '주차장 코드와 명칭을 입력하세요.';
    END IF;
    IF COALESCE(p_total_spaces, 0) <= 0 THEN RAISE EXCEPTION '주차면 수를 입력하세요.'; END IF;

    INSERT INTO public.parking_lots (
      code, name, address_jibun, address_road, latitude, longitude, lot_type,
      total_spaces, floors, area_sqm, operator_type, status, notes, created_by
    ) VALUES (
      upper(trim(p_lot_code)), trim(p_lot_name), v_site.address_jibun,
      COALESCE(NULLIF(trim(p_address_road), ''), v_site.address_road),
      v_site.latitude, v_site.longitude, COALESCE(v_site.planned_lot_type, 'offstreet'),
      p_total_spaces, COALESCE(v_site.estimated_floors, 1), v_site.area_sqm,
      'direct', 'active', '공사 프로젝트 ' || v_project.project_number || '에서 운영 전환', auth.uid()
    ) RETURNING id INTO v_lot_id;
  END IF;

  UPDATE public.construction_projects
  SET lot_id = v_lot_id,
      phase = 'completion',
      status = 'completed',
      progress_pct = 100,
      actual_completion = COALESCE(actual_completion, current_date),
      updated_at = now()
  WHERE id = p_project_id;

  IF v_project.site_id IS NOT NULL THEN
    UPDATE public.site_candidates SET status = 'completed', updated_at = now() WHERE id = v_project.site_id;
  END IF;

  INSERT INTO public.activity_logs (user_id, module, action, target_type, target_id, target_name, details)
  VALUES (
    auth.uid(), 'PLANNING', 'construction_handoff', 'construction_project', p_project_id,
    v_project.project_name, jsonb_build_object('parking_lot_id', v_lot_id)
  );

  RETURN v_lot_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_construction_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF NEW.lot_id IS NULL OR EXISTS (
      SELECT 1 FROM public.construction_completion_checks
      WHERE project_id = NEW.id AND is_required AND NOT is_completed
    ) THEN
      RAISE EXCEPTION '준공 체크리스트와 주차장 운영 전환을 먼저 완료하세요.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_construction_completion ON public.construction_projects;
CREATE TRIGGER trg_guard_construction_completion
BEFORE UPDATE OF status ON public.construction_projects
FOR EACH ROW EXECUTE FUNCTION public.guard_construction_completion();

GRANT EXECUTE ON FUNCTION public.monitor_sensor_anomalies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_sensor_incident(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_construction_completion_checklist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_construction_completion_check(uuid, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handoff_construction_to_operations(uuid, text, text, integer, text) TO authenticated;

INSERT INTO public.construction_completion_checks (
  project_id, check_code, label, is_required, requires_evidence, sort_order
)
SELECT cp.id, item.check_code, item.label, true, item.requires_evidence, item.sort_order
FROM public.construction_projects cp
CROSS JOIN (VALUES
  ('completion_inspection', '준공검사 합격', true, 10),
  ('as_built_docs', '준공도면 및 시설물 인수자료', true, 20),
  ('permits_closed', '인허가 조건 이행 확인', false, 30),
  ('safety_confirmed', '안전·소방·전기 점검 완료', true, 40),
  ('operations_handover', '운영부서 인수인계 완료', false, 50),
  ('warranty_registered', '하자보증 및 연락망 등록', false, 60)
) AS item(check_code, label, requires_evidence, sort_order)
WHERE cp.status <> 'completed'
ON CONFLICT (project_id, check_code) DO NOTHING;
