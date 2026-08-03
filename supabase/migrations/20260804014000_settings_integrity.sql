WITH ranked_defaults AS (
  SELECT id, row_number() OVER (
    PARTITION BY module, document_type
    ORDER BY created_at DESC NULLS LAST, id
  ) AS default_rank
  FROM public.approval_lines
  WHERE is_default = true
)
UPDATE public.approval_lines AS line
SET is_default = false
FROM ranked_defaults AS ranked
WHERE line.id = ranked.id AND ranked.default_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS approval_lines_one_default_per_document
  ON public.approval_lines(module, document_type)
  WHERE is_default = true;

COMMENT ON INDEX public.approval_lines_one_default_per_document IS
  'Only one default approval line can be active for each module and document type.';

DROP POLICY IF EXISTS msg_select ON public.message_logs;
DROP POLICY IF EXISTS msg_insert ON public.message_logs;
CREATE POLICY msg_select ON public.message_logs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));
CREATE POLICY msg_insert ON public.message_logs FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
);

DROP POLICY IF EXISTS al_insert ON public.approval_lines;
DROP POLICY IF EXISTS al_update ON public.approval_lines;
DROP POLICY IF EXISTS al_delete ON public.approval_lines;
CREATE POLICY al_insert ON public.approval_lines FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY al_update ON public.approval_lines FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY al_delete ON public.approval_lines FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE OR REPLACE FUNCTION public.check_login_lock_status(p_email text)
RETURNS TABLE(locked boolean, remaining_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_until timestamptz;
BEGIN
  SELECT locked_until INTO v_locked_until FROM public.profiles WHERE lower(email) = lower(trim(p_email));
  RETURN QUERY SELECT
    COALESCE(v_locked_until > now(), false),
    CASE WHEN v_locked_until > now() THEN GREATEST(ceil(EXTRACT(EPOCH FROM (v_locked_until - now())))::integer, 0) ELSE 0 END;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_login_security_state()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET login_fail_count = 0, locked_until = NULL, last_login_at = now()
  WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.write_security_audit_event(
  p_event_type text,
  p_severity text,
  p_detail jsonb DEFAULT NULL,
  p_success boolean DEFAULT true,
  p_failure_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  INSERT INTO public.security_audit_logs(event_type, severity, user_id, user_name, action_detail, success, failure_reason)
  SELECT p_event_type, p_severity, auth.uid(), name, p_detail, p_success, left(p_failure_reason, 500)
  FROM public.profiles WHERE id = auth.uid();
END;
$$;

DROP POLICY IF EXISTS audit_insert_all ON public.security_audit_logs;
REVOKE INSERT, UPDATE, DELETE ON public.security_audit_logs FROM authenticated, anon;

-- Existing users must not be logged out only because session enforcement was deployed.
UPDATE public.active_sessions
SET expires_at = now() + interval '30 minutes'
WHERE is_active = true AND expires_at <= now();

CREATE OR REPLACE FUNCTION public.write_activity_event(
  p_module text,
  p_action text,
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_target_name text DEFAULT NULL,
  p_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  INSERT INTO public.activity_logs(user_id, user_name, module, action, target_type, target_id, target_name, details)
  SELECT auth.uid(), name, left(p_module, 50), left(p_action, 50), left(p_target_type, 50),
         p_target_id, left(p_target_name, 200), p_details
  FROM public.profiles
  WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_system_config(p_changes jsonb, p_source_log_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_change jsonb;
  v_reverse_changes jsonb := '[]'::jsonb;
  v_key text;
  v_old_value text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION '관리자만 설정을 복원할 수 있습니다';
  END IF;
  IF jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) = 0 THEN
    RAISE EXCEPTION '복원할 변경 항목이 없습니다';
  END IF;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    v_key := nullif(trim(v_change->>'key'), '');
    IF v_key IS NULL OR length(v_key) > 100 THEN RAISE EXCEPTION '올바르지 않은 설정 키입니다'; END IF;

    IF jsonb_typeof(v_change->'oldValue') = 'null' OR NOT (v_change ? 'oldValue') THEN
      DELETE FROM public.system_config WHERE config_key = v_key;
      v_old_value := NULL;
    ELSE
      v_old_value := v_change->>'oldValue';
      INSERT INTO public.system_config(config_key, config_value, description, updated_at)
      VALUES (v_key, COALESCE(v_old_value, ''), NULL, now())
      ON CONFLICT (config_key) DO UPDATE
      SET config_value = excluded.config_value, updated_at = now();
    END IF;

    v_reverse_changes := v_reverse_changes || jsonb_build_array(jsonb_build_object(
      'key', v_key,
      'label', COALESCE(v_change->>'label', v_key),
      'oldValue', v_change->>'newValue',
      'newValue', v_old_value
    ));
  END LOOP;

  INSERT INTO public.activity_logs(user_id, user_name, module, action, target_type, target_name, details)
  SELECT auth.uid(), name, 'SYSTEM_SETTINGS', '기관 설정 복원', 'system_config',
         jsonb_array_length(p_changes)::text || '개 항목',
         jsonb_build_object('changes', v_reverse_changes, 'sourceLogId', p_source_log_id)
  FROM public.profiles WHERE id = auth.uid();
END;
$$;

DROP POLICY IF EXISTS "logs_insert" ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_admin_insert ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_admin_delete ON public.activity_logs;
CREATE POLICY activity_logs_admin_insert ON public.activity_logs FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY activity_logs_admin_delete ON public.activity_logs FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
REVOKE UPDATE ON public.activity_logs FROM authenticated, anon;
REVOKE INSERT, DELETE ON public.activity_logs FROM anon;
GRANT INSERT, DELETE ON public.activity_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_lock_status(text) TO anon, authenticated;
DROP FUNCTION IF EXISTS public.register_login_failure(text, text);
GRANT EXECUTE ON FUNCTION public.reset_login_security_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_security_audit_event(text, text, jsonb, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_activity_event(text, text, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_system_config(jsonb, uuid) TO authenticated;
