-- Allow standards-based HWPX report artifacts in the private reports bucket.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/hwp+zip'
]
WHERE id = 'reports';

COMMENT ON COLUMN public.report_generated.hwp_path IS
  'KS X 6101 OWPML 기반 HWPX 편집본 저장 경로';
