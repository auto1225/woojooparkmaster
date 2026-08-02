-- Idempotent complaint SLA monitoring. Safe to call from the app or an external scheduler.

CREATE TABLE IF NOT EXISTS public.workflow_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  escalation_level text NOT NULL,
  period_key date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, escalation_level, period_key)
);

ALTER TABLE public.workflow_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_escalation_manager_select" ON public.workflow_escalations
  FOR SELECT USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE OR REPLACE FUNCTION public.monitor_complaint_sla()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_complaint public.complaints%ROWTYPE;
  v_level text;
  v_inserted integer;
  v_total integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_module_active('COMPLAINT') THEN
    RAISE EXCEPTION '민원 모듈에 접근할 수 없습니다' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  IF v_actor.role NOT IN ('admin', 'manager') THEN
    RETURN 0;
  END IF;

  UPDATE public.complaints
  SET is_overdue = due_date < CURRENT_DATE AND status NOT IN ('closed', 'responded')
  WHERE due_date IS NOT NULL
    AND is_overdue IS DISTINCT FROM (due_date < CURRENT_DATE AND status NOT IN ('closed', 'responded'));

  FOR v_complaint IN
    SELECT * FROM public.complaints
    WHERE due_date IS NOT NULL
      AND due_date <= CURRENT_DATE + 1
      AND status NOT IN ('closed', 'responded')
    ORDER BY due_date, priority DESC
  LOOP
    v_level := CASE
      WHEN v_complaint.due_date <= CURRENT_DATE - 2 THEN 'critical'
      WHEN v_complaint.due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'due_soon'
    END;

    INSERT INTO public.workflow_escalations (entity_type, entity_id, escalation_level, period_key)
    VALUES ('complaint', v_complaint.id, v_level, CURRENT_DATE)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted > 0 THEN
      v_total := v_total + 1;

      IF v_complaint.assigned_to IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, module, type, title, message, link)
        VALUES (
          v_complaint.assigned_to,
          'COMPLAINT',
          'sla',
          CASE v_level WHEN 'critical' THEN '민원 처리 심각 지연' WHEN 'overdue' THEN '민원 처리기한 경과' ELSE '민원 처리기한 임박' END,
          '[' || v_complaint.complaint_number || '] ' || v_complaint.title || ' · 기한 ' || v_complaint.due_date,
          '/complaints/' || v_complaint.id
        );
      END IF;

      IF v_level IN ('overdue', 'critical') THEN
        INSERT INTO public.notifications (user_id, module, type, title, message, link)
        SELECT p.id, 'COMPLAINT', 'escalation',
               CASE WHEN v_level = 'critical' THEN '민원 심각 지연 보고' ELSE '민원 기한 경과 보고' END,
               '[' || v_complaint.complaint_number || '] ' || v_complaint.title,
               '/complaints/' || v_complaint.id
        FROM public.profiles p
        WHERE p.is_active = true
          AND p.role IN ('admin', 'manager')
          AND p.id IS DISTINCT FROM v_complaint.assigned_to;
      END IF;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.monitor_complaint_sla() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monitor_complaint_sla() TO authenticated;
