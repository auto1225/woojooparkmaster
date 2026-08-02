-- Allow the vehicle-management working roles to maintain operational workflow records.
-- Existing code_master policies remain unchanged for every other code group.
CREATE POLICY "team_registry_editor_insert" ON public.code_master
FOR INSERT TO authenticated
WITH CHECK (
  group_code IN ('TEAM_WORK_RECORD', 'TEAM_DUTY_ASSIGNMENT')
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);

CREATE POLICY "team_registry_editor_update" ON public.code_master
FOR UPDATE TO authenticated
USING (
  group_code IN ('TEAM_WORK_RECORD', 'TEAM_DUTY_ASSIGNMENT')
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
)
WITH CHECK (
  group_code IN ('TEAM_WORK_RECORD', 'TEAM_DUTY_ASSIGNMENT')
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);
