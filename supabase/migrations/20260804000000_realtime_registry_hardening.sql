-- Realtime device registry, mobile idempotency, and API-key disclosure hardening.

ALTER TABLE public.sensor_devices
  ADD COLUMN IF NOT EXISTS lot_type_snapshot varchar(30),
  ADD COLUMN IF NOT EXISTS client_mutation_id uuid,
  ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE public.gateway_devices
  ADD COLUMN IF NOT EXISTS lot_type_snapshot varchar(30),
  ADD COLUMN IF NOT EXISTS client_mutation_id uuid,
  ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE public.display_boards
  ADD COLUMN IF NOT EXISTS lot_type_snapshot varchar(30),
  ADD COLUMN IF NOT EXISTS client_mutation_id uuid,
  ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS client_mutation_id uuid,
  ADD COLUMN IF NOT EXISTS api_key_hash text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES public.profiles(id);

UPDATE public.api_keys
SET api_key_hash = encode(digest(api_key, 'sha256'), 'hex'),
    api_key = 'hash:' || encode(digest(api_key, 'sha256'), 'hex')
WHERE api_key_hash IS NULL OR api_key NOT LIKE 'hash:%';

ALTER TABLE public.sensor_readings
  ADD COLUMN IF NOT EXISTS event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_reading_event
  ON public.sensor_readings(device_id, event_id);

UPDATE public.sensor_devices d SET lot_type_snapshot = p.lot_type
FROM public.parking_lots p WHERE p.id = d.lot_id AND d.lot_type_snapshot IS NULL;
UPDATE public.gateway_devices d SET lot_type_snapshot = p.lot_type
FROM public.parking_lots p WHERE p.id = d.lot_id AND d.lot_type_snapshot IS NULL;
UPDATE public.display_boards d SET lot_type_snapshot = p.lot_type
FROM public.parking_lots p WHERE p.id = d.lot_id AND d.lot_type_snapshot IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_client_mutation
  ON public.sensor_devices(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_gateway_client_mutation
  ON public.gateway_devices(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_display_client_mutation
  ON public.display_boards(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_key_client_mutation
  ON public.api_keys(client_mutation_id) WHERE client_mutation_id IS NOT NULL;

ALTER TABLE public.sensor_devices DROP CONSTRAINT IF EXISTS sensor_device_numeric_guard;
ALTER TABLE public.sensor_devices ADD CONSTRAINT sensor_device_numeric_guard CHECK (
  (battery_level IS NULL OR battery_level BETWEEN 0 AND 100)
  AND (alert_battery_threshold IS NULL OR alert_battery_threshold BETWEEN 1 AND 100)
  AND (alert_offline_minutes IS NULL OR alert_offline_minutes BETWEEN 1 AND 1440)
  AND (mounting_height_cm IS NULL OR mounting_height_cm BETWEEN 0 AND 2000)
) NOT VALID;

ALTER TABLE public.gateway_devices DROP CONSTRAINT IF EXISTS gateway_device_numeric_guard;
ALTER TABLE public.gateway_devices ADD CONSTRAINT gateway_device_numeric_guard CHECK (
  max_sensors BETWEEN 1 AND 5000
  AND alert_offline_minutes BETWEEN 1 AND 1440
  AND connected_sensors BETWEEN 0 AND max_sensors
) NOT VALID;

ALTER TABLE public.display_boards DROP CONSTRAINT IF EXISTS display_board_numeric_guard;
ALTER TABLE public.display_boards ADD CONSTRAINT display_board_numeric_guard CHECK (
  (port IS NULL OR port BETWEEN 1 AND 65535)
  AND push_interval_sec BETWEEN 1 AND 3600
) NOT VALID;

CREATE OR REPLACE FUNCTION public.assert_realtime_manager()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_active AND role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION '실시간 장치 관리 권한이 없습니다.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_realtime_gateway(p_payload jsonb, p_client_mutation_id uuid)
RETURNS public.gateway_devices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.gateway_devices%ROWTYPE; v_type varchar(30);
BEGIN
  PERFORM public.assert_realtime_manager();
  IF p_client_mutation_id IS NULL THEN RAISE EXCEPTION '재전송 방지 ID가 필요합니다.'; END IF;
  SELECT * INTO v_row FROM public.gateway_devices WHERE client_mutation_id = p_client_mutation_id;
  IF FOUND THEN RETURN v_row; END IF;
  SELECT lot_type INTO v_type FROM public.parking_lots
  WHERE id = (p_payload->>'lot_id')::uuid AND status = 'active';
  IF v_type IS NULL THEN RAISE EXCEPTION '운영 중인 주차장을 선택해 주세요.'; END IF;
  IF NULLIF(trim(p_payload->>'device_id'), '') IS NULL THEN RAISE EXCEPTION '장치 ID는 필수입니다.'; END IF;
  INSERT INTO public.gateway_devices (
    lot_id, device_id, device_name, ip_address, mac_address, protocol, mqtt_topic,
    location_detail, floor, max_sensors, alert_offline_minutes, lot_type_snapshot,
    registered_by, client_mutation_id
  ) VALUES (
    (p_payload->>'lot_id')::uuid, trim(p_payload->>'device_id'), NULLIF(trim(p_payload->>'device_name'), ''),
    NULLIF(trim(p_payload->>'ip_address'), ''), NULLIF(trim(p_payload->>'mac_address'), ''),
    COALESCE(NULLIF(p_payload->>'protocol', ''), 'mqtt'), NULLIF(trim(p_payload->>'mqtt_topic'), ''),
    NULLIF(trim(p_payload->>'location_detail'), ''),
    CASE WHEN v_type = 'onstreet' THEN NULL ELSE NULLIF(p_payload->>'floor', '')::integer END,
    COALESCE(NULLIF(p_payload->>'max_sensors', '')::integer, 200),
    COALESCE(NULLIF(p_payload->>'alert_offline_minutes', '')::integer, 10),
    v_type, auth.uid(), p_client_mutation_id
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_realtime_sensor(p_payload jsonb, p_client_mutation_id uuid)
RETURNS public.sensor_devices LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.sensor_devices%ROWTYPE; v_type varchar(30); v_gateway_lot uuid;
BEGIN
  PERFORM public.assert_realtime_manager();
  IF p_client_mutation_id IS NULL THEN RAISE EXCEPTION '재전송 방지 ID가 필요합니다.'; END IF;
  SELECT * INTO v_row FROM public.sensor_devices WHERE client_mutation_id = p_client_mutation_id;
  IF FOUND THEN RETURN v_row; END IF;
  SELECT lot_type INTO v_type FROM public.parking_lots
  WHERE id = (p_payload->>'lot_id')::uuid AND status = 'active';
  IF v_type IS NULL THEN RAISE EXCEPTION '운영 중인 주차장을 선택해 주세요.'; END IF;
  IF NULLIF(trim(p_payload->>'device_id'), '') IS NULL THEN RAISE EXCEPTION '장치 ID는 필수입니다.'; END IF;
  IF NULLIF(p_payload->>'gateway_id', '') IS NOT NULL THEN
    SELECT lot_id INTO v_gateway_lot FROM public.gateway_devices
    WHERE id = (p_payload->>'gateway_id')::uuid AND archived_at IS NULL;
    IF v_gateway_lot IS DISTINCT FROM (p_payload->>'lot_id')::uuid THEN
      RAISE EXCEPTION '센서와 게이트웨이의 주차장이 일치하지 않습니다.';
    END IF;
  END IF;
  INSERT INTO public.sensor_devices (
    lot_id, device_id, device_name, device_type, gateway_id, floor, zone,
    location_detail, mounting_type, mounting_height_cm, install_date,
    lot_type_snapshot, registered_by, client_mutation_id
  ) VALUES (
    (p_payload->>'lot_id')::uuid, trim(p_payload->>'device_id'), NULLIF(trim(p_payload->>'device_name'), ''),
    COALESCE(NULLIF(p_payload->>'device_type', ''), 'radar_60ghz'), NULLIF(p_payload->>'gateway_id', '')::uuid,
    CASE WHEN v_type = 'onstreet' THEN NULL ELSE NULLIF(p_payload->>'floor', '')::integer END,
    NULLIF(trim(p_payload->>'zone'), ''), NULLIF(trim(p_payload->>'location_detail'), ''),
    NULLIF(p_payload->>'mounting_type', ''), NULLIF(p_payload->>'mounting_height_cm', '')::integer,
    NULLIF(p_payload->>'install_date', '')::date, v_type, auth.uid(), p_client_mutation_id
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_realtime_display(p_payload jsonb, p_client_mutation_id uuid)
RETURNS public.display_boards LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.display_boards%ROWTYPE; v_type varchar(30);
BEGIN
  PERFORM public.assert_realtime_manager();
  IF p_client_mutation_id IS NULL THEN RAISE EXCEPTION '재전송 방지 ID가 필요합니다.'; END IF;
  SELECT * INTO v_row FROM public.display_boards WHERE client_mutation_id = p_client_mutation_id;
  IF FOUND THEN RETURN v_row; END IF;
  SELECT lot_type INTO v_type FROM public.parking_lots
  WHERE id = (p_payload->>'lot_id')::uuid AND status = 'active';
  IF v_type IS NULL THEN RAISE EXCEPTION '운영 중인 주차장을 선택해 주세요.'; END IF;
  IF NULLIF(trim(p_payload->>'board_id'), '') IS NULL THEN RAISE EXCEPTION '전광판 ID는 필수입니다.'; END IF;
  INSERT INTO public.display_boards (
    lot_id, board_id, board_name, location, location_type, floor, direction, protocol,
    ip_address, port, display_type, display_template, push_interval_sec,
    manufacturer, model, install_date, lot_type_snapshot, client_mutation_id
  ) VALUES (
    (p_payload->>'lot_id')::uuid, trim(p_payload->>'board_id'), NULLIF(trim(p_payload->>'board_name'), ''),
    NULLIF(trim(p_payload->>'location'), ''), NULLIF(p_payload->>'location_type', ''),
    CASE WHEN v_type = 'onstreet' THEN NULL ELSE NULLIF(p_payload->>'floor', '')::integer END,
    NULLIF(trim(p_payload->>'direction'), ''), NULLIF(p_payload->>'protocol', ''),
    NULLIF(trim(p_payload->>'ip_address'), ''), NULLIF(p_payload->>'port', '')::integer,
    NULLIF(p_payload->>'display_type', ''), COALESCE(p_payload->'display_template', '{}'::jsonb),
    COALESCE(NULLIF(p_payload->>'push_interval_sec', '')::integer, 10),
    NULLIF(trim(p_payload->>'manufacturer'), ''), NULLIF(trim(p_payload->>'model'), ''),
    NULLIF(p_payload->>'install_date', '')::date, v_type, p_client_mutation_id
  ) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_api_keys_safe()
RETURNS TABLE (
  id uuid, key_name varchar, key_prefix varchar, description text, status varchar,
  expires_at timestamptz, rate_limit_per_minute integer, allowed_endpoints text[],
  allowed_ips text[], total_calls bigint, monthly_calls integer, last_used_at timestamptz,
  created_by uuid, created_at timestamptz, updated_at timestamptz, notes text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_realtime_manager();
  RETURN QUERY SELECT k.id, k.key_name, k.key_prefix, k.description, k.status,
    k.expires_at, k.rate_limit_per_minute, k.allowed_endpoints, k.allowed_ips,
    k.total_calls, k.monthly_calls, k.last_used_at, k.created_by, k.created_at, k.updated_at, k.notes
  FROM public.api_keys k ORDER BY k.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_realtime_api_key(
  p_key_name text, p_description text, p_expires_at timestamptz,
  p_rate_limit integer, p_client_mutation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text; v_row public.api_keys%ROWTYPE;
BEGIN
  PERFORM public.assert_realtime_manager();
  SELECT * INTO v_row FROM public.api_keys WHERE client_mutation_id = p_client_mutation_id;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_row.id, 'key', NULL, 'key_prefix', v_row.key_prefix, 'replayed', true);
  END IF;
  IF NULLIF(trim(p_key_name), '') IS NULL THEN RAISE EXCEPTION '키 이름은 필수입니다.'; END IF;
  IF p_rate_limit NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION '분당 호출 한도는 1~10000이어야 합니다.'; END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN RAISE EXCEPTION '만료일은 현재 이후여야 합니다.'; END IF;
  v_key := 'pk_live_' || encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.api_keys (
    key_name, api_key, api_key_hash, key_prefix, description, expires_at, rate_limit_per_minute,
    created_by, client_mutation_id
  ) VALUES (
    trim(p_key_name), 'hash:' || encode(extensions.digest(v_key, 'sha256'), 'hex'), encode(extensions.digest(v_key, 'sha256'), 'hex'),
    left(v_key, 12) || '...', NULLIF(trim(p_description), ''),
    p_expires_at, p_rate_limit, auth.uid(), p_client_mutation_id
  ) RETURNING * INTO v_row;
  RETURN jsonb_build_object('id', v_row.id, 'key', v_key, 'key_prefix', v_row.key_prefix, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_realtime_row_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sensor_row_version ON public.sensor_devices;
CREATE TRIGGER trg_sensor_row_version BEFORE UPDATE ON public.sensor_devices
FOR EACH ROW EXECUTE FUNCTION public.bump_realtime_row_version();
DROP TRIGGER IF EXISTS trg_gateway_row_version ON public.gateway_devices;
CREATE TRIGGER trg_gateway_row_version BEFORE UPDATE ON public.gateway_devices
FOR EACH ROW EXECUTE FUNCTION public.bump_realtime_row_version();
DROP TRIGGER IF EXISTS trg_display_row_version ON public.display_boards;
CREATE TRIGGER trg_display_row_version BEFORE UPDATE ON public.display_boards
FOR EACH ROW EXECUTE FUNCTION public.bump_realtime_row_version();

CREATE OR REPLACE FUNCTION public.validate_sensor_reading_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lot uuid;
BEGIN
  SELECT lot_id INTO v_lot FROM public.sensor_devices
  WHERE device_id = NEW.device_id AND archived_at IS NULL AND status <> 'decommissioned';
  IF v_lot IS NULL THEN RAISE EXCEPTION '등록된 활성 센서가 아닙니다.'; END IF;
  IF v_lot IS DISTINCT FROM NEW.lot_id THEN RAISE EXCEPTION '센서와 수신 주차장이 일치하지 않습니다.'; END IF;
  IF NEW.time > now() + interval '5 minutes' THEN RAISE EXCEPTION '미래 시각의 센서 데이터는 저장할 수 없습니다.'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_sensor_reading_source ON public.sensor_readings;
CREATE TRIGGER trg_validate_sensor_reading_source BEFORE INSERT ON public.sensor_readings
FOR EACH ROW EXECUTE FUNCTION public.validate_sensor_reading_source();

CREATE OR REPLACE FUNCTION public.update_realtime_on_reading()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_occupied integer;
  v_total integer;
  v_previous boolean;
BEGIN
  SELECT occupied INTO v_previous
  FROM public.sensor_readings
  WHERE device_id = NEW.device_id AND time < NEW.time
  ORDER BY time DESC LIMIT 1;

  SELECT count(*) FILTER (WHERE occupied) INTO v_occupied
  FROM (
    SELECT DISTINCT ON (device_id) device_id, occupied
    FROM public.sensor_readings
    WHERE lot_id = NEW.lot_id AND time > now() - interval '5 minutes'
    ORDER BY device_id, time DESC
  ) latest;

  SELECT greatest(total_spaces, COALESCE(v_occupied, 0)) INTO v_total
  FROM public.parking_lots WHERE id = NEW.lot_id;

  INSERT INTO public.lot_realtime_status (
    lot_id, total_spaces, occupied_spaces, congestion_level, status,
    last_sensor_update, last_updated, today_total_in, today_total_out,
    today_peak_occupied, today_peak_time
  ) VALUES (
    NEW.lot_id, v_total, COALESCE(v_occupied, 0),
    CASE WHEN v_total = 0 THEN 'normal'
      WHEN COALESCE(v_occupied, 0)::numeric / v_total < .3 THEN 'empty'
      WHEN COALESCE(v_occupied, 0)::numeric / v_total < .7 THEN 'normal'
      WHEN COALESCE(v_occupied, 0)::numeric / v_total < .9 THEN 'crowded' ELSE 'full' END,
    CASE WHEN v_total > 0 AND COALESCE(v_occupied, 0) >= v_total THEN 'full' ELSE 'normal' END,
    now(), now(), CASE WHEN v_previous = false AND NEW.occupied THEN 1 ELSE 0 END,
    CASE WHEN v_previous = true AND NOT NEW.occupied THEN 1 ELSE 0 END,
    COALESCE(v_occupied, 0), CASE WHEN COALESCE(v_occupied, 0) > 0 THEN to_char(now(), 'HH24:MI') END
  ) ON CONFLICT (lot_id) DO UPDATE SET
    total_spaces = EXCLUDED.total_spaces,
    occupied_spaces = EXCLUDED.occupied_spaces,
    congestion_level = EXCLUDED.congestion_level,
    status = EXCLUDED.status,
    last_sensor_update = now(), last_updated = now(),
    today_total_in = public.lot_realtime_status.today_total_in + CASE WHEN v_previous = false AND NEW.occupied THEN 1 ELSE 0 END,
    today_total_out = public.lot_realtime_status.today_total_out + CASE WHEN v_previous = true AND NOT NEW.occupied THEN 1 ELSE 0 END,
    today_peak_occupied = greatest(public.lot_realtime_status.today_peak_occupied, EXCLUDED.occupied_spaces),
    today_peak_time = CASE WHEN EXCLUDED.occupied_spaces > public.lot_realtime_status.today_peak_occupied THEN to_char(now(), 'HH24:MI') ELSE public.lot_realtime_status.today_peak_time END;

  UPDATE public.sensor_devices SET last_reading = NEW.time,
    battery_level = COALESCE(NEW.battery_level, battery_level),
    rssi = COALESCE(NEW.rssi, rssi), total_readings = total_readings + 1
  WHERE device_id = NEW.device_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_sensor_incident(
  p_incident_id uuid, p_action text, p_note text DEFAULT NULL
) RETURNS public.sensor_incidents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_incident public.sensor_incidents%ROWTYPE; v_sensor public.sensor_devices%ROWTYPE; v_work public.maintenance_logs%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND (role IN ('admin','manager') OR team = 'facilities')) THEN
    RAISE EXCEPTION '센서 사건 처리 권한이 없습니다.';
  END IF;
  SELECT * INTO v_incident FROM public.sensor_incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '센서 사건을 찾을 수 없습니다.'; END IF;
  IF p_action = 'acknowledge' THEN
    IF v_incident.status <> 'open' THEN RAISE EXCEPTION '접수 가능한 상태가 아닙니다.'; END IF;
    UPDATE public.sensor_incidents SET status='acknowledged', acknowledged_by=auth.uid(), acknowledged_at=now(), updated_at=now() WHERE id=p_incident_id;
  ELSIF p_action = 'confirm_recovery' THEN
    SELECT * INTO v_sensor FROM public.sensor_devices WHERE id=v_incident.sensor_id;
    SELECT * INTO v_work FROM public.maintenance_logs WHERE id=v_incident.maintenance_log_id;
    IF v_incident.status <> 'recovery_detected' THEN RAISE EXCEPTION '정상 신호가 감지된 사건만 복구 확인할 수 있습니다.'; END IF;
    IF v_work.id IS NULL OR v_work.status NOT IN ('completed','verified') THEN RAISE EXCEPTION '연결된 시설 작업지시를 먼저 완료해 주세요.'; END IF;
    IF COALESCE(length(trim(v_work.after_photo)),0) < 3 THEN RAISE EXCEPTION '시설 작업 완료 사진이 필요합니다.'; END IF;
    IF COALESCE(length(trim(p_note)),0) < 3 THEN RAISE EXCEPTION '복구 확인 내용을 입력하세요.'; END IF;
    UPDATE public.sensor_incidents SET status='resolved', recovery_confirmed_by=auth.uid(), recovery_confirmed_at=now(), resolution_note=p_note, updated_at=now() WHERE id=p_incident_id;
    UPDATE public.sensor_devices SET alert_sent=false WHERE id=v_incident.sensor_id;
  ELSIF p_action = 'reopen' THEN
    IF v_incident.status <> 'resolved' THEN RAISE EXCEPTION '종결된 사건만 재개할 수 있습니다.'; END IF;
    UPDATE public.sensor_incidents SET status='open', recovery_confirmed_by=NULL, recovery_confirmed_at=NULL, updated_at=now() WHERE id=p_incident_id;
  ELSE RAISE EXCEPTION '지원하지 않는 사건 처리입니다.'; END IF;
  INSERT INTO public.activity_logs(user_id,module,action,target_type,target_id,target_name,details)
  VALUES(auth.uid(),'REALTIME','sensor_incident_'||p_action,'sensor_incident',p_incident_id,v_incident.incident_number,jsonb_build_object('note',p_note));
  SELECT * INTO v_incident FROM public.sensor_incidents WHERE id=p_incident_id;
  RETURN v_incident;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_realtime_api_key(p_key_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_realtime_manager();
  UPDATE public.api_keys SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
  WHERE id = p_key_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION '활성 API 키를 찾을 수 없습니다.'; END IF;
END;
$$;

DROP POLICY IF EXISTS "admin_manager_api_keys_select" ON public.api_keys;
DROP POLICY IF EXISTS "reading_insert" ON public.sensor_readings;
DROP POLICY IF EXISTS "reading_insert_service" ON public.sensor_readings;
CREATE POLICY "reading_insert_service" ON public.sensor_readings FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS "rt_status_modify" ON public.lot_realtime_status;
DROP POLICY IF EXISTS "rt_status_modify_service" ON public.lot_realtime_status;
CREATE POLICY "rt_status_modify_service" ON public.lot_realtime_status FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gw_modify" ON public.gateway_devices;
CREATE POLICY "gw_modify" ON public.gateway_devices FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','manager')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','manager')));
DROP POLICY IF EXISTS "sensor_modify" ON public.sensor_devices;
CREATE POLICY "sensor_modify" ON public.sensor_devices FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','manager')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','manager')));
DROP POLICY IF EXISTS "display_modify" ON public.display_boards;
CREATE POLICY "display_modify" ON public.display_boards FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','manager')))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active AND role IN ('admin','manager')));

GRANT EXECUTE ON FUNCTION public.create_realtime_gateway(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_realtime_sensor(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_realtime_display(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_api_keys_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_realtime_api_key(text, text, timestamptz, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_realtime_api_key(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.display_push_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.display_boards(id),
  lot_id uuid NOT NULL REFERENCES public.parking_lots(id),
  lot_type_snapshot varchar(30),
  requested_message text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'acknowledged', 'failed')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  responded_at timestamptz,
  device_response jsonb,
  error_message text,
  client_mutation_id uuid NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_display_push_commands_board
  ON public.display_push_commands(board_id, requested_at DESC);
ALTER TABLE public.display_push_commands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "display_push_select" ON public.display_push_commands;
CREATE POLICY "display_push_select" ON public.display_push_commands FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE id = auth.uid() AND is_active
));

CREATE OR REPLACE FUNCTION public.queue_display_push(p_board_id uuid, p_client_mutation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_board public.display_boards%ROWTYPE;
  v_status public.lot_realtime_status%ROWTYPE;
  v_command public.display_push_commands%ROWTYPE;
  v_message text;
  v_template jsonb;
BEGIN
  PERFORM public.assert_realtime_manager();
  IF p_client_mutation_id IS NULL THEN RAISE EXCEPTION '재전송 방지 ID가 필요합니다.'; END IF;
  SELECT * INTO v_command FROM public.display_push_commands
  WHERE client_mutation_id = p_client_mutation_id;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_command.id, 'status', v_command.status, 'message', v_command.requested_message, 'replayed', true);
  END IF;

  SELECT * INTO v_board FROM public.display_boards
  WHERE id = p_board_id AND archived_at IS NULL AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '가동 중인 전광판을 찾을 수 없습니다.'; END IF;
  SELECT * INTO v_status FROM public.lot_realtime_status WHERE lot_id = v_board.lot_id;
  v_template := COALESCE(v_board.display_template, '{}'::jsonb);
  IF v_status.lot_id IS NULL OR v_status.last_updated IS NULL OR v_status.last_updated < now() - interval '30 minutes' THEN
    v_message := COALESCE(NULLIF(v_template->>'stale_message', ''), '데이터 점검 중');
  ELSIF v_status.congestion_level = 'full' THEN
    v_message := COALESCE(NULLIF(v_template->>'full_message', ''), '만 차');
  ELSE
    v_message := replace(COALESCE(NULLIF(v_template->>'format', ''), '잔여 {available}대'), '{available}', v_status.available_spaces::text);
  END IF;

  INSERT INTO public.display_push_commands (
    board_id, lot_id, lot_type_snapshot, requested_message, requested_by, client_mutation_id
  ) VALUES (
    v_board.id, v_board.lot_id, v_board.lot_type_snapshot, v_message, auth.uid(), p_client_mutation_id
  ) RETURNING * INTO v_command;
  UPDATE public.display_boards SET current_message = v_message, last_push = now(),
    last_push_success = NULL, last_error = NULL WHERE id = v_board.id;
  RETURN jsonb_build_object('id', v_command.id, 'status', v_command.status, 'message', v_message, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_display_push(
  p_command_id uuid, p_success boolean, p_device_response jsonb DEFAULT NULL, p_error_message text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_command public.display_push_commands%ROWTYPE;
BEGIN
  SELECT * INTO v_command FROM public.display_push_commands WHERE id = p_command_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '전광판 전송 요청을 찾을 수 없습니다.'; END IF;
  IF v_command.status IN ('acknowledged', 'failed') THEN RETURN; END IF;
  UPDATE public.display_push_commands SET
    status = CASE WHEN p_success THEN 'acknowledged' ELSE 'failed' END,
    sent_at = COALESCE(sent_at, now()), responded_at = now(),
    device_response = p_device_response, error_message = CASE WHEN p_success THEN NULL ELSE p_error_message END
  WHERE id = p_command_id;
  UPDATE public.display_boards SET last_push_success = p_success,
    last_error = CASE WHEN p_success THEN NULL ELSE COALESCE(p_error_message, '장비 응답 실패') END
  WHERE id = v_command.board_id;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_display_push(uuid, boolean, jsonb, text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_display_push(uuid, boolean, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_display_push(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_realtime_device(
  p_kind text, p_id uuid, p_payload jsonb, p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.assert_realtime_manager();
  IF p_expected_version IS NULL THEN RAISE EXCEPTION '수정 버전이 필요합니다.'; END IF;
  IF p_kind = 'gateway' THEN
    UPDATE public.gateway_devices SET
      device_name = CASE WHEN p_payload ? 'device_name' THEN NULLIF(trim(p_payload->>'device_name'), '') ELSE device_name END,
      ip_address = CASE WHEN p_payload ? 'ip_address' THEN NULLIF(trim(p_payload->>'ip_address'), '') ELSE ip_address END,
      mac_address = CASE WHEN p_payload ? 'mac_address' THEN NULLIF(trim(p_payload->>'mac_address'), '') ELSE mac_address END,
      protocol = COALESCE(NULLIF(p_payload->>'protocol', ''), protocol),
      mqtt_topic = CASE WHEN p_payload ? 'mqtt_topic' THEN NULLIF(trim(p_payload->>'mqtt_topic'), '') ELSE mqtt_topic END,
      location_detail = CASE WHEN p_payload ? 'location_detail' THEN NULLIF(trim(p_payload->>'location_detail'), '') ELSE location_detail END,
      max_sensors = COALESCE(NULLIF(p_payload->>'max_sensors', '')::integer, max_sensors),
      alert_offline_minutes = COALESCE(NULLIF(p_payload->>'alert_offline_minutes', '')::integer, alert_offline_minutes),
      status = COALESCE(NULLIF(p_payload->>'status', ''), status),
      status_changed_at = CASE WHEN p_payload ? 'status' AND status IS DISTINCT FROM p_payload->>'status' THEN now() ELSE status_changed_at END,
      notes = CASE WHEN p_payload ? 'notes' THEN NULLIF(trim(p_payload->>'notes'), '') ELSE notes END
    WHERE id = p_id AND row_version = p_expected_version AND archived_at IS NULL RETURNING to_jsonb(gateway_devices.*) INTO v_result;
  ELSIF p_kind = 'sensor' THEN
    UPDATE public.sensor_devices SET
      device_name = CASE WHEN p_payload ? 'device_name' THEN NULLIF(trim(p_payload->>'device_name'), '') ELSE device_name END,
      gateway_id = CASE WHEN p_payload ? 'gateway_id' THEN NULLIF(p_payload->>'gateway_id', '')::uuid ELSE gateway_id END,
      zone = CASE WHEN p_payload ? 'zone' THEN NULLIF(trim(p_payload->>'zone'), '') ELSE zone END,
      location_detail = CASE WHEN p_payload ? 'location_detail' THEN NULLIF(trim(p_payload->>'location_detail'), '') ELSE location_detail END,
      mounting_type = CASE WHEN p_payload ? 'mounting_type' THEN NULLIF(p_payload->>'mounting_type', '') ELSE mounting_type END,
      mounting_height_cm = COALESCE(NULLIF(p_payload->>'mounting_height_cm', '')::integer, mounting_height_cm),
      alert_battery_threshold = COALESCE(NULLIF(p_payload->>'alert_battery_threshold', '')::numeric, alert_battery_threshold),
      alert_offline_minutes = COALESCE(NULLIF(p_payload->>'alert_offline_minutes', '')::integer, alert_offline_minutes),
      status = COALESCE(NULLIF(p_payload->>'status', ''), status),
      status_changed_at = CASE WHEN p_payload ? 'status' AND status IS DISTINCT FROM p_payload->>'status' THEN now() ELSE status_changed_at END,
      notes = CASE WHEN p_payload ? 'notes' THEN NULLIF(trim(p_payload->>'notes'), '') ELSE notes END
    WHERE id = p_id AND row_version = p_expected_version AND archived_at IS NULL
      AND (NULLIF(p_payload->>'gateway_id', '') IS NULL OR EXISTS (
        SELECT 1 FROM public.gateway_devices g WHERE g.id = (p_payload->>'gateway_id')::uuid AND g.lot_id = sensor_devices.lot_id AND g.archived_at IS NULL
      )) RETURNING to_jsonb(sensor_devices.*) INTO v_result;
  ELSIF p_kind = 'display' THEN
    UPDATE public.display_boards SET
      board_name = CASE WHEN p_payload ? 'board_name' THEN NULLIF(trim(p_payload->>'board_name'), '') ELSE board_name END,
      location = CASE WHEN p_payload ? 'location' THEN NULLIF(trim(p_payload->>'location'), '') ELSE location END,
      location_type = CASE WHEN p_payload ? 'location_type' THEN NULLIF(p_payload->>'location_type', '') ELSE location_type END,
      direction = CASE WHEN p_payload ? 'direction' THEN NULLIF(trim(p_payload->>'direction'), '') ELSE direction END,
      protocol = CASE WHEN p_payload ? 'protocol' THEN NULLIF(p_payload->>'protocol', '') ELSE protocol END,
      ip_address = CASE WHEN p_payload ? 'ip_address' THEN NULLIF(trim(p_payload->>'ip_address'), '') ELSE ip_address END,
      port = COALESCE(NULLIF(p_payload->>'port', '')::integer, port),
      display_type = CASE WHEN p_payload ? 'display_type' THEN NULLIF(p_payload->>'display_type', '') ELSE display_type END,
      display_template = COALESCE(p_payload->'display_template', display_template),
      push_interval_sec = COALESCE(NULLIF(p_payload->>'push_interval_sec', '')::integer, push_interval_sec),
      manufacturer = CASE WHEN p_payload ? 'manufacturer' THEN NULLIF(trim(p_payload->>'manufacturer'), '') ELSE manufacturer END,
      model = CASE WHEN p_payload ? 'model' THEN NULLIF(trim(p_payload->>'model'), '') ELSE model END,
      status = COALESCE(NULLIF(p_payload->>'status', ''), status),
      notes = CASE WHEN p_payload ? 'notes' THEN NULLIF(trim(p_payload->>'notes'), '') ELSE notes END
    WHERE id = p_id AND row_version = p_expected_version AND archived_at IS NULL RETURNING to_jsonb(display_boards.*) INTO v_result;
  ELSE RAISE EXCEPTION '지원하지 않는 장치 유형입니다.'; END IF;
  IF v_result IS NULL THEN RAISE EXCEPTION '다른 사용자가 먼저 수정했거나 장치를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.'; END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_realtime_device(
  p_kind text, p_id uuid, p_reason text, p_expected_version integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_realtime_manager();
  IF length(trim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION '보관 사유를 3자 이상 입력해 주세요.'; END IF;
  IF p_kind = 'gateway' THEN
    IF EXISTS (SELECT 1 FROM public.sensor_devices WHERE gateway_id = p_id AND archived_at IS NULL AND status <> 'decommissioned') THEN RAISE EXCEPTION '연결된 센서를 먼저 이전하거나 보관해 주세요.'; END IF;
    UPDATE public.gateway_devices SET archived_at=now(), archive_reason=trim(p_reason), status='decommissioned', status_changed_at=now()
    WHERE id=p_id AND row_version=p_expected_version AND archived_at IS NULL;
  ELSIF p_kind = 'sensor' THEN
    IF EXISTS (SELECT 1 FROM public.sensor_incidents WHERE sensor_id=p_id AND status <> 'resolved') THEN RAISE EXCEPTION '미종결 센서 사건을 먼저 처리해 주세요.'; END IF;
    UPDATE public.sensor_devices SET archived_at=now(), archive_reason=trim(p_reason), status='decommissioned', status_changed_at=now()
    WHERE id=p_id AND row_version=p_expected_version AND archived_at IS NULL;
  ELSIF p_kind = 'display' THEN
    IF EXISTS (SELECT 1 FROM public.display_push_commands WHERE board_id=p_id AND status IN ('queued','sent')) THEN RAISE EXCEPTION '전송 대기 또는 전송 중 요청을 먼저 처리해 주세요.'; END IF;
    UPDATE public.display_boards SET archived_at=now(), archive_reason=trim(p_reason), status='decommissioned'
    WHERE id=p_id AND row_version=p_expected_version AND archived_at IS NULL;
  ELSE RAISE EXCEPTION '지원하지 않는 장치 유형입니다.'; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION '다른 사용자가 먼저 수정했거나 장치를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_realtime_device(text, uuid, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_realtime_device(text, uuid, text, integer) TO authenticated;
