
ALTER TABLE public.approval_lines ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.budget_items ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.design_documents ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.maintenance_schedules ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.report_schedules ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.sensor_devices ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.dashboard_widgets ADD COLUMN IF NOT EXISTS author_name text;
