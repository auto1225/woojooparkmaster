-- Align complaint commands and field evidence access with application roles.

DROP POLICY IF EXISTS "comp_update" ON public.complaints;
CREATE POLICY "comp_update" ON public.complaints
FOR UPDATE TO authenticated
USING (
  public.is_module_active('COMPLAINT')
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
  AND (
    public.get_user_role(auth.uid()) IN ('admin', 'manager')
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR assigned_team = public.get_user_team(auth.uid())
  )
)
WITH CHECK (
  public.is_module_active('COMPLAINT')
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);
DROP POLICY IF EXISTS "cc_insert" ON public.complaint_comments;
CREATE POLICY "cc_insert" ON public.complaint_comments
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
  AND EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_id)
);

CREATE OR REPLACE FUNCTION public.can_access_field_evidence(_path text, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.get_user_role(_user_id) IN ('admin', 'manager')
    OR EXISTS (
      SELECT 1
      FROM public.attachments a
      LEFT JOIN public.maintenance_logs ml
        ON a.module = 'FACILITY'
       AND a.ref_type = 'maintenance_log'
       AND ml.id = a.ref_id
      LEFT JOIN public.complaints c
        ON a.module = 'COMPLAINT'
       AND a.ref_type = 'complaint'
       AND c.id = a.ref_id
      WHERE regexp_replace(a.file_path, '^[a-z0-9-]+://', '') = _path
        AND (
          a.uploaded_by = _user_id
          OR ml.assigned_to = _user_id
          OR c.assigned_to = _user_id
          OR c.created_by = _user_id
          OR c.assigned_team = public.get_user_team(_user_id)
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_field_evidence(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_field_evidence(text, uuid) TO authenticated;

DROP POLICY IF EXISTS "field_evidence_select" ON storage.objects;
CREATE POLICY "field_evidence_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'field-evidence'
  AND public.can_access_field_evidence(name, auth.uid())
);

DROP POLICY IF EXISTS "field_evidence_insert" ON storage.objects;
CREATE POLICY "field_evidence_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'field-evidence'
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "attach_select" ON public.attachments;
CREATE POLICY "attach_select" ON public.attachments
FOR SELECT TO authenticated
USING (
  module NOT IN ('FACILITY', 'COMPLAINT')
  OR public.can_access_field_evidence(regexp_replace(file_path, '^[a-z0-9-]+://', ''), auth.uid())
);

DROP POLICY IF EXISTS "attach_insert" ON public.attachments;
CREATE POLICY "attach_insert" ON public.attachments
FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    module NOT IN ('FACILITY', 'COMPLAINT')
    OR public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
  )
);
