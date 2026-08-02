-- Facility field-work contract for web and future mobile clients.

ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_record_id uuid,
  ADD COLUMN IF NOT EXISTS source_item_key text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_source_item
  ON public.maintenance_logs(source_module, source_record_id, source_item_key)
  WHERE source_module IS NOT NULL AND source_record_id IS NOT NULL AND source_item_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_idempotency_key
  ON public.maintenance_logs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bump_maintenance_row_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_maintenance_row_version ON public.maintenance_logs;
CREATE TRIGGER trg_bump_maintenance_row_version
  BEFORE UPDATE ON public.maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION public.bump_maintenance_row_version();

ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS client_mutation_id uuid,
  ADD COLUMN IF NOT EXISTS device_platform text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced';

CREATE UNIQUE INDEX IF NOT EXISTS uq_attachments_client_mutation
  ON public.attachments(client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'field-evidence',
  'field-evidence',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "field_evidence_select" ON storage.objects;
CREATE POLICY "field_evidence_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'field-evidence');

DROP POLICY IF EXISTS "field_evidence_insert" ON storage.objects;
CREATE POLICY "field_evidence_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'field-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "field_evidence_delete" ON storage.objects;
CREATE POLICY "field_evidence_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'field-evidence'
  AND (
    owner_id = auth.uid()::text
    OR public.get_user_role(auth.uid()) IN ('admin', 'manager')
  )
);

DROP POLICY IF EXISTS "maint_log_insert" ON public.maintenance_logs;
CREATE POLICY "maint_log_insert" ON public.maintenance_logs
FOR INSERT TO authenticated
WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor'));

CREATE OR REPLACE VIEW public.mobile_field_work_v1
WITH (security_invoker = true)
AS
SELECT
  ml.id,
  ml.log_number,
  ml.title,
  ml.description,
  ml.symptom,
  ml.priority,
  ml.status,
  ml.next_action,
  ml.due_date,
  ml.assigned_to,
  ml.lot_id,
  pl.code AS parking_lot_code,
  pl.name AS parking_lot_name,
  pl.lot_type AS parking_lot_type,
  ml.equipment_id,
  e.equipment_code,
  e.name AS equipment_name,
  ml.source_module,
  ml.source_record_id,
  ml.source_item_key,
  ml.row_version,
  ml.updated_at
FROM public.maintenance_logs ml
JOIN public.parking_lots pl ON pl.id = ml.lot_id
LEFT JOIN public.equipment e ON e.id = ml.equipment_id
WHERE ml.assigned_to = auth.uid()
  AND ml.status IN ('assigned', 'in_progress', 'pending_parts', 'completed');

GRANT SELECT ON public.mobile_field_work_v1 TO authenticated;

COMMENT ON VIEW public.mobile_field_work_v1 IS
  'Versioned read contract for the assigned facility field-work queue. Mobile clients must use commands/RPCs for writes.';
