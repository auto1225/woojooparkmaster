-- Harden official-document access and keep complaint document links usable.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_official_document_normalized_number
  ON public.code_master ((extra->>'normalized_number'))
  WHERE group_code = 'OFFICIAL_DOCUMENT' AND is_active = true;

CREATE OR REPLACE FUNCTION public.can_read_official_document(document_id text, user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.code_master document
    LEFT JOIN public.profiles profile ON profile.id = user_id
    WHERE document.id::text = document_id
      AND document.group_code = 'OFFICIAL_DOCUMENT'
      AND document.is_active = true
      AND (
        COALESCE(document.extra->>'security_level', '일반') <> '비공개'
        OR public.get_user_role(user_id) IN ('admin', 'manager')
        OR NULLIF(document.extra->>'department', '') = NULLIF(profile.department, '')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_official_document(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_official_document(text, uuid) TO authenticated;

DROP POLICY IF EXISTS "codes_select" ON public.code_master;
CREATE POLICY "codes_select" ON public.code_master
FOR SELECT TO authenticated
USING (
  group_code <> 'OFFICIAL_DOCUMENT'
  OR public.can_read_official_document(id::text, auth.uid())
);

DROP POLICY IF EXISTS "official_document_files_select" ON storage.objects;
CREATE POLICY "official_document_files_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'official-documents'
  AND public.can_read_official_document((storage.foldername(name))[2], auth.uid())
);

DROP POLICY IF EXISTS "attach_select" ON public.attachments;
CREATE POLICY "attach_select" ON public.attachments
FOR SELECT TO authenticated
USING (
  (
    module = 'OFFICIAL_DOCUMENT'
    AND ref_type = 'official_document_file'
    AND public.can_read_official_document(ref_id::text, auth.uid())
  )
  OR (
    ref_type = 'official_document_link'
    AND public.can_read_official_document(regexp_replace(file_path, '^parkmaster-document://', ''), auth.uid())
    AND (
      module <> 'COMPLAINT'
      OR EXISTS (
        SELECT 1 FROM public.complaints complaint
        WHERE complaint.id = ref_id
          AND (
            public.get_user_role(auth.uid()) IN ('admin', 'manager')
            OR complaint.assigned_to = auth.uid()
            OR complaint.created_by = auth.uid()
            OR complaint.assigned_team = public.get_user_team(auth.uid())
          )
      )
    )
  )
  OR (
    ref_type NOT IN ('official_document_file', 'official_document_link')
    AND (
      module NOT IN ('FACILITY', 'COMPLAINT')
      OR public.can_access_field_evidence(regexp_replace(file_path, '^[a-z0-9-]+://', ''), auth.uid())
    )
  )
);

DROP POLICY IF EXISTS "attach_insert" ON public.attachments;
CREATE POLICY "attach_insert" ON public.attachments
FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
  AND (
    module NOT IN ('FACILITY', 'COMPLAINT')
    OR (
      module = 'COMPLAINT'
      AND ref_type IN ('complaint', 'official_document_link')
      AND EXISTS (
        SELECT 1 FROM public.complaints complaint
        WHERE complaint.id = ref_id
          AND (
            public.get_user_role(auth.uid()) IN ('admin', 'manager')
            OR complaint.assigned_to = auth.uid()
            OR complaint.created_by = auth.uid()
            OR complaint.assigned_team = public.get_user_team(auth.uid())
          )
      )
    )
    OR (
      module = 'FACILITY'
      AND ref_type = 'maintenance_log'
      AND EXISTS (
        SELECT 1 FROM public.maintenance_logs maintenance
        WHERE maintenance.id = ref_id
          AND (
            public.get_user_role(auth.uid()) IN ('admin', 'manager')
            OR maintenance.assigned_to = auth.uid()
            OR maintenance.reported_by = auth.uid()
          )
      )
    )
  )
);

COMMENT ON FUNCTION public.can_read_official_document(text, uuid) IS
  'Allows ordinary official documents to authenticated staff and limits private documents to managers or the owning department.';

COMMIT;
