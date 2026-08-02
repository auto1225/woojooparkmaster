ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS vendor_name text,
  ADD COLUMN IF NOT EXISTS vendor_manager text,
  ADD COLUMN IF NOT EXISTS vendor_phone text,
  ADD COLUMN IF NOT EXISTS vendor_email text;

ALTER TABLE public.maintenance_logs
  ADD COLUMN IF NOT EXISTS vendor_manager text,
  ADD COLUMN IF NOT EXISTS vendor_phone text,
  ADD COLUMN IF NOT EXISTS vendor_email text;

UPDATE public.maintenance_logs
SET vendor_phone = vendor_contact
WHERE vendor_phone IS NULL
  AND vendor_contact IS NOT NULL;

ALTER TABLE public.maintenance_schedules
  ADD COLUMN IF NOT EXISTS vendor_manager text,
  ADD COLUMN IF NOT EXISTS vendor_phone text,
  ADD COLUMN IF NOT EXISTS vendor_email text;

COMMENT ON COLUMN public.equipment.vendor_name IS '설치·유지관리 관련 업체명';
COMMENT ON COLUMN public.equipment.vendor_manager IS '업체 업무 담당자명';
COMMENT ON COLUMN public.equipment.vendor_phone IS '업체 담당자 연락처';
COMMENT ON COLUMN public.equipment.vendor_email IS '업체 담당자 이메일';
