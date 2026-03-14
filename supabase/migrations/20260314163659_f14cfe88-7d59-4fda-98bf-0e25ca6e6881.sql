
-- Fix function search_path warnings
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;

-- Fix permissive profiles_insert: only allow auth trigger or own user
DROP POLICY "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Fix permissive notif_insert: only allow authenticated users
DROP POLICY "notif_insert" ON notifications;
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
