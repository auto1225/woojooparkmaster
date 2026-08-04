-- Facility registry integrity for public-sector retention, field work, and mobile sync.

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.maintenance_schedules
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS lot_type_at_event TEXT,
  ADD COLUMN IF NOT EXISTS checklist_template_code TEXT,
  ADD COLUMN IF NOT EXISTS checklist_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.safety_inspections
  ADD COLUMN IF NOT EXISTS lot_type_at_event TEXT,
  ADD COLUMN IF NOT EXISTS checklist_template_code TEXT,
  ADD COLUMN IF NOT EXISTS checklist_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.surface_markings
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

UPDATE public.maintenance_logs log
SET lot_type_at_event = lot.lot_type::TEXT
FROM public.parking_lots lot
WHERE lot.id = log.lot_id AND log.lot_type_at_event IS NULL;

UPDATE public.safety_inspections inspection
SET lot_type_at_event = lot.lot_type::TEXT
FROM public.parking_lots lot
WHERE lot.id = inspection.lot_id AND inspection.lot_type_at_event IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_logs_client_mutation
  ON public.maintenance_logs(client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_lot_type_event
  ON public.maintenance_logs(lot_type_at_event, status, due_date);

CREATE INDEX IF NOT EXISTS idx_safety_inspections_lot_type_event
  ON public.safety_inspections(lot_type_at_event, inspection_date DESC);

DO $$
DECLARE
  v_table TEXT;
  v_constraint TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'equipment',
    'maintenance_schedules',
    'maintenance_logs',
    'safety_inspections',
    'surface_markings'
  ]
  LOOP
    v_constraint := v_table || '_archive_reason_ck';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = format('public.%I', v_table)::regclass
        AND conname = v_constraint
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK ((archived_at IS NULL AND archive_reason IS NULL AND archived_by IS NULL) OR (archived_at IS NOT NULL AND NULLIF(BTRIM(archive_reason), '''') IS NOT NULL AND archived_by IS NOT NULL)) NOT VALID',
        v_table,
        v_constraint
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.equipment'::regclass AND conname = 'equipment_business_values_ck') THEN
    ALTER TABLE public.equipment ADD CONSTRAINT equipment_business_values_ck CHECK (
      COALESCE(quantity, 1) >= 1
      AND (purchase_cost IS NULL OR purchase_cost >= 0)
      AND (current_value IS NULL OR current_value >= 0)
      AND COALESCE(total_maintenance_cost, 0) >= 0
      AND COALESCE(maintenance_count, 0) >= 0
      AND (warranty_end IS NULL OR warranty_start IS NULL OR warranty_end >= warranty_start)
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.maintenance_schedules'::regclass AND conname = 'maintenance_schedules_business_values_ck') THEN
    ALTER TABLE public.maintenance_schedules ADD CONSTRAINT maintenance_schedules_business_values_ck CHECK (
      (estimated_cost IS NULL OR estimated_cost >= 0)
      AND (estimated_hours IS NULL OR estimated_hours >= 0)
      AND COALESCE(advance_notice_days, 0) >= 0
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.maintenance_logs'::regclass AND conname = 'maintenance_logs_business_values_ck') THEN
    ALTER TABLE public.maintenance_logs ADD CONSTRAINT maintenance_logs_business_values_ck CHECK (
      status IN ('reported', 'assigned', 'in_progress', 'pending_parts', 'completed', 'verified', 'cancelled')
      AND COALESCE(parts_cost, 0) >= 0
      AND COALESCE(labor_cost, 0) >= 0
      AND COALESCE(other_cost, 0) >= 0
      AND (labor_hours IS NULL OR labor_hours >= 0)
      AND (downtime_hours IS NULL OR downtime_hours >= 0)
      AND (satisfaction_score IS NULL OR satisfaction_score BETWEEN 1 AND 5)
      AND checklist_version >= 1
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.safety_inspections'::regclass AND conname = 'safety_inspections_business_values_ck') THEN
    ALTER TABLE public.safety_inspections ADD CONSTRAINT safety_inspections_business_values_ck CHECK (
      COALESCE(total_items, 0) >= 0
      AND COALESCE(pass_items, 0) >= 0
      AND COALESCE(fail_items, 0) >= 0
      AND COALESCE(na_items, 0) >= 0
      AND COALESCE(total_items, 0) = COALESCE(pass_items, 0) + COALESCE(fail_items, 0) + COALESCE(na_items, 0)
      AND checklist_version >= 1
      AND (
        COALESCE(fail_items, 0) = 0
        OR (
          follow_up_required = TRUE
          AND NULLIF(BTRIM(COALESCE(issues_found, '')), '') IS NOT NULL
          AND NULLIF(BTRIM(COALESCE(corrective_actions, '')), '') IS NOT NULL
          AND correction_deadline IS NOT NULL
        )
      )
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.surface_markings'::regclass AND conname = 'surface_markings_business_values_ck') THEN
    ALTER TABLE public.surface_markings ADD CONSTRAINT surface_markings_business_values_ck CHECK (
      COALESCE(quantity, 1) >= 1
      AND (repaint_cycle_months IS NULL OR repaint_cycle_months > 0)
      AND (estimated_cost IS NULL OR estimated_cost >= 0)
      AND (NOT COALESCE(is_regulatory, FALSE) OR NULLIF(BTRIM(COALESCE(regulation_ref, '')), '') IS NOT NULL)
    ) NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_facility_event_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lot_type_at_event IS NULL AND NEW.lot_id IS NOT NULL THEN
    SELECT lot_type::TEXT INTO NEW.lot_type_at_event
    FROM public.parking_lots
    WHERE id = NEW.lot_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_logs_event_context ON public.maintenance_logs;
CREATE TRIGGER trg_maintenance_logs_event_context
  BEFORE INSERT ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_facility_event_context();

DROP TRIGGER IF EXISTS trg_safety_inspections_event_context ON public.safety_inspections;
CREATE TRIGGER trg_safety_inspections_event_context
  BEFORE INSERT ON public.safety_inspections
  FOR EACH ROW EXECUTE FUNCTION public.set_facility_event_context();

CREATE OR REPLACE FUNCTION public.guard_maintenance_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'reported' AND NEW.status IN ('assigned', 'cancelled'))
    OR (OLD.status = 'assigned' AND NEW.status IN ('in_progress', 'cancelled'))
    OR (OLD.status = 'in_progress' AND NEW.status IN ('pending_parts', 'completed', 'cancelled'))
    OR (OLD.status = 'pending_parts' AND NEW.status IN ('in_progress', 'cancelled'))
    OR (OLD.status = 'completed' AND NEW.status IN ('verified', 'cancelled'))
  ) THEN
    RAISE EXCEPTION '허용되지 않는 유지보수 상태 전환입니다: % -> %', OLD.status, NEW.status USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'assigned' AND NEW.assigned_to IS NULL THEN
    RAISE EXCEPTION '작업 배정 시 담당자가 필요합니다' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'completed' AND (
    NULLIF(BTRIM(COALESCE(NEW.resolution, '')), '') IS NULL
    OR NULLIF(BTRIM(COALESCE(NEW.after_photo, '')), '') IS NULL
  ) THEN
    RAISE EXCEPTION '작업 완료 시 조치 내용과 완료 사진이 필요합니다' USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'verified' THEN
    v_role := public.get_user_role(auth.uid())::TEXT;
    IF v_role NOT IN ('admin', 'manager') OR NEW.verified_by IS NULL OR NEW.verified_at IS NULL THEN
      RAISE EXCEPTION '관리자 검증 정보가 필요합니다' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_maintenance_transition ON public.maintenance_logs;
CREATE TRIGGER trg_guard_maintenance_transition
  BEFORE UPDATE OF status ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_maintenance_transition();

CREATE OR REPLACE FUNCTION public.prevent_facility_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION '시설관리 기록은 삭제할 수 없습니다. 보존 사유를 입력하여 보관 처리하세요.' USING ERRCODE = '42501';
END;
$$;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'equipment',
    'maintenance_schedules',
    'maintenance_logs',
    'safety_inspections',
    'surface_markings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_facility_hard_delete ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_prevent_facility_hard_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_facility_hard_delete()',
      v_table
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_verified_facility_evidence_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.module = 'FACILITY'
     AND OLD.ref_type = 'maintenance_log'
     AND OLD.category = 'completion_photo'
     AND EXISTS (
       SELECT 1 FROM public.maintenance_logs log
       WHERE log.id = OLD.ref_id AND log.status IN ('completed', 'verified')
     ) THEN
    RAISE EXCEPTION '완료 또는 검증된 작업의 사진 증빙은 삭제할 수 없습니다' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_verified_facility_evidence_delete ON public.attachments;
CREATE TRIGGER trg_prevent_verified_facility_evidence_delete
  BEFORE DELETE ON public.attachments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_verified_facility_evidence_delete();

CREATE TABLE IF NOT EXISTS public.facility_audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id),
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facility_audit_events_entity
  ON public.facility_audit_events(entity_type, entity_id, created_at DESC);

ALTER TABLE public.facility_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS facility_audit_events_select ON public.facility_audit_events;
CREATE POLICY facility_audit_events_select ON public.facility_audit_events
  FOR SELECT TO authenticated
  USING (public.is_module_active('FACILITY'));

CREATE OR REPLACE FUNCTION public.append_facility_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  v_id := CASE WHEN TG_OP = 'INSERT' THEN NEW.id ELSE COALESCE(NEW.id, OLD.id) END;
  INSERT INTO public.facility_audit_events (
    entity_type, entity_id, event_type, actor_id, old_data, new_data
  ) VALUES (
    TG_TABLE_NAME,
    v_id,
    lower(TG_OP),
    auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'equipment',
    'maintenance_schedules',
    'maintenance_logs',
    'safety_inspections',
    'surface_markings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_append_facility_audit_event ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_append_facility_audit_event AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.append_facility_audit_event()',
      v_table
    );
  END LOOP;
END;
$$;

-- Facility editors must be able to maintain vendor contacts without receiving
-- broad permission to modify unrelated code groups.
DROP POLICY IF EXISTS related_company_contact_insert ON public.code_master;
CREATE POLICY related_company_contact_insert ON public.code_master
  FOR INSERT TO authenticated
  WITH CHECK (
    group_code = 'RELATED_COMPANY_CONTACT'
    AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
  );

DROP POLICY IF EXISTS related_company_contact_update ON public.code_master;
CREATE POLICY related_company_contact_update ON public.code_master
  FOR UPDATE TO authenticated
  USING (
    group_code = 'RELATED_COMPANY_CONTACT'
    AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
  )
  WITH CHECK (
    group_code = 'RELATED_COMPANY_CONTACT'
    AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
  );

REVOKE ALL ON public.facility_audit_events FROM anon, authenticated;
GRANT SELECT ON public.facility_audit_events TO authenticated;
