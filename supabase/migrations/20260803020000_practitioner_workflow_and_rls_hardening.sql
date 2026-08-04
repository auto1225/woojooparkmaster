-- Close public metadata exposure and keep complaint-to-facility ownership synchronized.

BEGIN;

-- The application is authenticated. Public configuration and employee metadata are not.
DROP POLICY IF EXISTS "config_select" ON public.system_config;
CREATE POLICY "config_select" ON public.system_config
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin');

DROP POLICY IF EXISTS "codes_select" ON public.code_master;
CREATE POLICY "codes_select" ON public.code_master
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

REVOKE ALL ON public.system_config, public.profiles, public.code_master FROM anon;
GRANT SELECT ON public.system_config, public.profiles, public.code_master TO authenticated;

-- A self-service profile update must never become a role escalation path.
CREATE OR REPLACE FUNCTION public.protect_profile_authorization_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = OLD.id
     AND (
       NEW.role IS DISTINCT FROM OLD.role
       OR NEW.team IS DISTINCT FROM OLD.team
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
     ) THEN
    RAISE EXCEPTION '역할, 소속팀, 활성상태는 관리자 권한관리에서만 변경할 수 있습니다.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_authorization_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_authorization_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authorization_fields();

REVOKE ALL ON FUNCTION public.protect_profile_authorization_fields() FROM PUBLIC;

-- Statistics must execute with the caller's RLS and must not be callable anonymously.
ALTER VIEW IF EXISTS public.complaint_stats_monthly SET (security_invoker = true);
ALTER VIEW IF EXISTS public.complaint_staff_performance SET (security_invoker = true);
REVOKE ALL ON public.complaint_stats_monthly, public.complaint_staff_performance FROM anon;
GRANT SELECT ON public.complaint_stats_monthly, public.complaint_staff_performance TO authenticated;

-- Generated reports can only be attributed to the authenticated actor.
DROP POLICY IF EXISTS "gen_insert" ON public.report_generated;
CREATE POLICY "gen_insert" ON public.report_generated
FOR INSERT TO authenticated
WITH CHECK (generated_by = auth.uid());

DROP POLICY IF EXISTS "reports_update" ON storage.objects;
CREATE POLICY "reports_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'reports'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.get_user_role(auth.uid()) IN ('admin', 'manager')
  )
)
WITH CHECK (
  bucket_id = 'reports'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.get_user_role(auth.uid()) IN ('admin', 'manager')
  )
);

-- Approval definitions are managed by managers. A step can only be acted on by
-- its named approver (or a manager), and record status follows that same rule.
DROP POLICY IF EXISTS "al_insert" ON public.approval_lines;
DROP POLICY IF EXISTS "al_update" ON public.approval_lines;
DROP POLICY IF EXISTS "al_delete" ON public.approval_lines;
CREATE POLICY "al_insert" ON public.approval_lines FOR INSERT TO authenticated
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager'));
CREATE POLICY "al_update" ON public.approval_lines FOR UPDATE TO authenticated
USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'))
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager'));
CREATE POLICY "al_delete" ON public.approval_lines FOR DELETE TO authenticated
USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE OR REPLACE FUNCTION public.can_act_on_approval_record(p_record_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role(auth.uid()) IN ('admin', 'manager')
    OR EXISTS (
      SELECT 1
      FROM public.approval_steps step
      WHERE step.record_id = p_record_id
        AND step.approver_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.can_act_on_approval_record(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_act_on_approval_record(uuid) TO authenticated;

DROP POLICY IF EXISTS "ar_insert" ON public.approval_records;
DROP POLICY IF EXISTS "ar_update" ON public.approval_records;
CREATE POLICY "ar_insert" ON public.approval_records FOR INSERT TO authenticated
WITH CHECK (initiated_by = auth.uid() OR public.get_user_role(auth.uid()) IN ('admin', 'manager'));
CREATE POLICY "ar_update" ON public.approval_records FOR UPDATE TO authenticated
USING (public.can_act_on_approval_record(id))
WITH CHECK (public.can_act_on_approval_record(id));

DROP POLICY IF EXISTS "as_insert" ON public.approval_steps;
DROP POLICY IF EXISTS "as_update" ON public.approval_steps;
CREATE POLICY "as_insert" ON public.approval_steps FOR INSERT TO authenticated
WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin', 'manager')
  OR EXISTS (
    SELECT 1 FROM public.approval_records record
    WHERE record.id = record_id AND record.initiated_by = auth.uid()
  )
);
CREATE POLICY "as_update" ON public.approval_steps FOR UPDATE TO authenticated
USING (approver_id = auth.uid() OR public.get_user_role(auth.uid()) IN ('admin', 'manager'))
WITH CHECK (approver_id = auth.uid() OR public.get_user_role(auth.uid()) IN ('admin', 'manager'));

-- Assignment from the complaint screen must update the linked facility task too.
CREATE OR REPLACE FUNCTION public.sync_complaint_assignment_to_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NULL OR NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  UPDATE public.maintenance_logs
  SET assigned_to = NEW.assigned_to,
      assigned_at = coalesce(assigned_at, NEW.assigned_at, now()),
      status = CASE WHEN status = 'reported' THEN 'assigned' ELSE status END,
      next_action = CASE WHEN status = 'reported' THEN '현장 확인 및 처리 시작' ELSE next_action END,
      updated_at = now()
  WHERE upper(coalesce(source_module, '')) = 'COMPLAINT'
    AND source_record_id = NEW.id
    AND status NOT IN ('verified', 'cancelled')
    AND assigned_to IS DISTINCT FROM NEW.assigned_to;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_complaint_assignment_to_maintenance ON public.complaints;
CREATE TRIGGER trg_sync_complaint_assignment_to_maintenance
AFTER UPDATE OF assigned_to ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.sync_complaint_assignment_to_maintenance();

UPDATE public.maintenance_logs maintenance
SET assigned_to = complaint.assigned_to,
    assigned_at = coalesce(maintenance.assigned_at, complaint.assigned_at, now()),
    status = CASE WHEN maintenance.status = 'reported' THEN 'assigned' ELSE maintenance.status END,
    next_action = CASE WHEN maintenance.status = 'reported' THEN '현장 확인 및 처리 시작' ELSE maintenance.next_action END,
    updated_at = now()
FROM public.complaints complaint
WHERE upper(coalesce(maintenance.source_module, '')) = 'COMPLAINT'
  AND maintenance.source_record_id = complaint.id
  AND complaint.assigned_to IS NOT NULL
  AND maintenance.status NOT IN ('verified', 'cancelled')
  AND maintenance.assigned_to IS DISTINCT FROM complaint.assigned_to;

REVOKE ALL ON FUNCTION public.sync_complaint_assignment_to_maintenance() FROM PUBLIC;

COMMIT;
