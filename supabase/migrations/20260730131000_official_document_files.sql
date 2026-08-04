-- Private original files for registered official documents.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'official-documents',
  'official-documents',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/haansofthwp',
    'application/x-hwp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "official_document_files_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'official-documents');

CREATE POLICY "official_document_files_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'official-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "official_document_files_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'official-documents'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.get_user_role(auth.uid()) IN ('admin', 'manager')
  )
);

CREATE POLICY "official_document_registry_insert" ON public.code_master
FOR INSERT TO authenticated
WITH CHECK (
  group_code = 'OFFICIAL_DOCUMENT'
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);

CREATE POLICY "official_document_registry_update" ON public.code_master
FOR UPDATE TO authenticated
USING (
  group_code = 'OFFICIAL_DOCUMENT'
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
)
WITH CHECK (
  group_code = 'OFFICIAL_DOCUMENT'
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);
