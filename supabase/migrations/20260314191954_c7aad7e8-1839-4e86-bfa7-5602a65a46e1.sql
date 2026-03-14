
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) DEFAULT 'light';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employee_number TEXT;
