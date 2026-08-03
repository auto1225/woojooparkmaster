-- Keep one default approval line per module and document type. Existing demo
-- imports may have inserted the same defaults more than once.
WITH ranked_defaults AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(module), lower(document_type)
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS default_rank
  FROM public.approval_lines
  WHERE is_default = true
)
UPDATE public.approval_lines AS lines
SET is_default = false
FROM ranked_defaults AS ranked
WHERE lines.id = ranked.id
  AND ranked.default_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS approval_lines_one_default_per_document
  ON public.approval_lines (lower(module), lower(document_type))
  WHERE is_default = true;

-- Prevent two active approval records for the same source record. The client
-- already returns the existing request; this constraint also closes races.
WITH ranked_active AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(module), lower(document_type), ref_id
      ORDER BY initiated_at DESC NULLS LAST, id DESC
    ) AS active_rank
  FROM public.approval_records
  WHERE status = 'in_progress'
)
UPDATE public.approval_records AS records
SET status = 'invalid',
    completed_at = COALESCE(records.completed_at, now())
FROM ranked_active AS ranked
WHERE records.id = ranked.id
  AND ranked.active_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS approval_records_one_active_per_source
  ON public.approval_records (lower(module), lower(document_type), ref_id)
  WHERE status = 'in_progress';
