
-- Fix security definer views by adding security_invoker = true
CREATE OR REPLACE VIEW realtime_map_view WITH (security_invoker = true) AS
SELECT
  pl.id, pl.code, pl.name, pl.address_road, pl.address_jibun,
  pl.latitude, pl.longitude, pl.lot_type, pl.total_spaces,
  COALESCE(rs.occupied_spaces, 0) AS occupied_spaces,
  COALESCE(rs.available_spaces, pl.total_spaces) AS available_spaces,
  COALESCE(rs.occupancy_rate, 0) AS occupancy_rate,
  COALESCE(rs.congestion_level, 'normal') AS congestion_level,
  COALESCE(rs.status, 'normal') AS realtime_status,
  rs.last_updated,
  rs.today_total_in, rs.today_peak_occupied, rs.today_peak_time
FROM parking_lots pl
LEFT JOIN lot_realtime_status rs ON rs.lot_id = pl.id
WHERE pl.status = 'active';

CREATE OR REPLACE VIEW sensor_health_view WITH (security_invoker = true) AS
SELECT
  sd.id, sd.device_id, sd.device_name, sd.device_type,
  sd.lot_id, pl.name AS lot_name, pl.code AS lot_code,
  sd.gateway_id, gd.device_id AS gateway_device_id,
  sd.battery_level, sd.rssi, sd.status,
  sd.last_heartbeat, sd.last_reading,
  EXTRACT(EPOCH FROM (now() - sd.last_heartbeat)) / 60 AS minutes_since_heartbeat,
  CASE
    WHEN sd.status = 'active' AND sd.last_heartbeat > now() - INTERVAL '10 minutes' THEN 'online'
    WHEN sd.battery_level IS NOT NULL AND sd.battery_level < 20 THEN 'low_battery'
    WHEN sd.last_heartbeat < now() - INTERVAL '30 minutes' THEN 'offline'
    ELSE sd.status
  END AS health_status
FROM sensor_devices sd
JOIN parking_lots pl ON pl.id = sd.lot_id
LEFT JOIN gateway_devices gd ON gd.id = sd.gateway_id;

CREATE OR REPLACE VIEW gateway_health_view WITH (security_invoker = true) AS
SELECT
  gd.id, gd.device_id, gd.device_name,
  gd.lot_id, pl.name AS lot_name, pl.code AS lot_code,
  gd.ip_address, gd.connected_sensors, gd.max_sensors,
  gd.last_heartbeat, gd.status, gd.firmware_version,
  EXTRACT(EPOCH FROM (now() - gd.last_heartbeat)) / 60 AS minutes_since_heartbeat,
  CASE
    WHEN gd.status = 'active' AND gd.last_heartbeat > now() - INTERVAL '5 minutes' THEN 'online'
    WHEN gd.last_heartbeat < now() - INTERVAL '10 minutes' THEN 'offline'
    ELSE gd.status
  END AS health_status,
  (SELECT COUNT(*) FROM sensor_devices sd WHERE sd.gateway_id = gd.id AND sd.status = 'active') AS active_sensors,
  (SELECT COUNT(*) FROM sensor_devices sd WHERE sd.gateway_id = gd.id AND sd.status != 'active') AS problem_sensors
FROM gateway_devices gd
JOIN parking_lots pl ON pl.id = gd.lot_id;

-- Fix function search path
CREATE OR REPLACE FUNCTION update_realtime_on_reading()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  occ_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) FILTER (WHERE occupied = true)
  INTO occ_count
  FROM (
    SELECT DISTINCT ON (device_id) occupied
    FROM sensor_readings
    WHERE lot_id = NEW.lot_id AND time > now() - INTERVAL '5 minutes'
    ORDER BY device_id, time DESC
  ) latest;

  SELECT COUNT(*) INTO total_count
  FROM sensor_devices WHERE lot_id = NEW.lot_id AND status = 'active';

  INSERT INTO lot_realtime_status (lot_id, total_spaces, occupied_spaces, last_sensor_update, last_updated)
  VALUES (NEW.lot_id, total_count, occ_count, now(), now())
  ON CONFLICT (lot_id) DO UPDATE SET
    occupied_spaces = occ_count,
    total_spaces = GREATEST(lot_realtime_status.total_spaces, total_count),
    congestion_level = CASE
      WHEN total_count > 0 THEN
        CASE
          WHEN occ_count::decimal / total_count < 0.3 THEN 'empty'
          WHEN occ_count::decimal / total_count < 0.7 THEN 'normal'
          WHEN occ_count::decimal / total_count < 0.9 THEN 'crowded'
          ELSE 'full'
        END
      ELSE 'normal'
    END,
    status = CASE WHEN total_count > 0 AND occ_count >= total_count THEN 'full' ELSE 'normal' END,
    last_sensor_update = now(),
    last_updated = now(),
    today_total_in = CASE WHEN NEW.occupied = true THEN lot_realtime_status.today_total_in + 1 ELSE lot_realtime_status.today_total_in END,
    today_total_out = CASE WHEN NEW.occupied = false THEN lot_realtime_status.today_total_out + 1 ELSE lot_realtime_status.today_total_out END,
    today_peak_occupied = GREATEST(lot_realtime_status.today_peak_occupied, occ_count),
    today_peak_time = CASE WHEN occ_count > lot_realtime_status.today_peak_occupied THEN TO_CHAR(now(), 'HH24:MI') ELSE lot_realtime_status.today_peak_time END;

  UPDATE sensor_devices SET
    last_reading = NEW.time,
    battery_level = COALESCE(NEW.battery_level, battery_level),
    rssi = COALESCE(NEW.rssi, rssi),
    total_readings = total_readings + 1
  WHERE device_id = NEW.device_id;

  RETURN NEW;
END;
$$;
