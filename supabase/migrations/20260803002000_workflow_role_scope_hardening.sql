-- Enforce write roles and team ownership across complaint and facility field work.

CREATE OR REPLACE FUNCTION public.enforce_operational_writer_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND public.get_user_role(auth.uid()) NOT IN ('admin', 'manager', 'editor') THEN
    RAISE EXCEPTION '조회 전용 사용자는 업무 데이터를 변경할 수 없습니다' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_writer_role ON public.maintenance_logs;
CREATE TRIGGER trg_maintenance_writer_role
  BEFORE UPDATE ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_operational_writer_role();

REVOKE ALL ON FUNCTION public.enforce_operational_writer_role() FROM PUBLIC;

DROP POLICY IF EXISTS "cc_insert" ON public.complaint_comments;
CREATE POLICY "cc_insert" ON public.complaint_comments
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
  AND EXISTS (
    SELECT 1
    FROM public.complaints c
    WHERE c.id = complaint_id
      AND (
        public.get_user_role(auth.uid()) IN ('admin', 'manager')
        OR c.assigned_to = auth.uid()
        OR c.created_by = auth.uid()
        OR c.assigned_team = public.get_user_team(auth.uid())
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
      AND ref_type = 'complaint'
      AND EXISTS (
        SELECT 1
        FROM public.complaints c
        WHERE c.id = ref_id
          AND (
            public.get_user_role(auth.uid()) IN ('admin', 'manager')
            OR c.assigned_to = auth.uid()
            OR c.created_by = auth.uid()
            OR c.assigned_team = public.get_user_team(auth.uid())
          )
      )
    )
    OR (
      module = 'FACILITY'
      AND ref_type = 'maintenance_log'
      AND EXISTS (
        SELECT 1
        FROM public.maintenance_logs ml
        WHERE ml.id = ref_id
          AND (
            public.get_user_role(auth.uid()) IN ('admin', 'manager')
            OR ml.assigned_to = auth.uid()
            OR ml.reported_by = auth.uid()
          )
      )
    )
  )
);

DROP POLICY IF EXISTS "field_evidence_insert" ON storage.objects;
CREATE POLICY "field_evidence_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'field-evidence'
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (
    (
      (storage.foldername(name))[2] = 'complaint'
      AND EXISTS (
        SELECT 1
        FROM public.complaints c
        WHERE c.id::text = (storage.foldername(name))[3]
          AND (
            public.get_user_role(auth.uid()) IN ('admin', 'manager')
            OR c.assigned_to = auth.uid()
            OR c.created_by = auth.uid()
            OR c.assigned_team = public.get_user_team(auth.uid())
          )
      )
    )
    OR (
      (storage.foldername(name))[2] = 'maintenance'
      AND EXISTS (
        SELECT 1
        FROM public.maintenance_logs ml
        WHERE ml.id::text = (storage.foldername(name))[3]
          AND (
            public.get_user_role(auth.uid()) IN ('admin', 'manager')
            OR ml.assigned_to = auth.uid()
            OR ml.reported_by = auth.uid()
          )
      )
    )
  )
);

COMMENT ON FUNCTION public.enforce_operational_writer_role() IS
  'Rejects facility workflow updates from viewer and other non-writing roles, including SECURITY DEFINER RPC calls.';
