
-- 11-1. gateway_devices
CREATE TABLE gateway_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  device_name VARCHAR(100),
  ip_address VARCHAR(45),
  mac_address VARCHAR(20),
  subnet VARCHAR(20),
  protocol VARCHAR(20) DEFAULT 'mqtt',
  mqtt_topic VARCHAR(200),
  location_detail VARCHAR(200),
  floor INTEGER,
  install_date DATE,
  connected_sensors INTEGER DEFAULT 0,
  max_sensors INTEGER DEFAULT 200,
  firmware_version VARCHAR(30),
  hardware_version VARCHAR(30),
  last_heartbeat TIMESTAMPTZ,
  last_data_received TIMESTAMPTZ,
  uptime_hours DECIMAL(10,1),
  restart_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  status_changed_at TIMESTAMPTZ DEFAULT now(),
  alert_offline_minutes INTEGER DEFAULT 10,
  alert_sent BOOLEAN DEFAULT false,
  config JSONB,
  notes TEXT,
  registered_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 11-2. sensor_devices
CREATE TABLE sensor_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  space_id UUID REFERENCES parking_spaces(id) ON DELETE SET NULL,
  gateway_id UUID REFERENCES gateway_devices(id) ON DELETE SET NULL,
  device_id VARCHAR(50) UNIQUE NOT NULL,
  device_name VARCHAR(100),
  device_type VARCHAR(30) NOT NULL DEFAULT 'radar_60ghz',
  model VARCHAR(50),
  install_date DATE,
  location_detail VARCHAR(200),
  floor INTEGER,
  zone VARCHAR(10),
  mounting_type VARCHAR(30),
  mounting_height_cm INTEGER,
  firmware_version VARCHAR(30),
  hardware_version VARCHAR(30),
  battery_level DECIMAL(5,2),
  battery_voltage DECIMAL(4,2),
  last_battery_change DATE,
  rssi INTEGER,
  snr DECIMAL(5,2),
  last_heartbeat TIMESTAMPTZ,
  last_reading TIMESTAMPTZ,
  total_readings BIGINT DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  status_changed_at TIMESTAMPTZ DEFAULT now(),
  calibration_date DATE,
  calibration_offset JSONB,
  false_positive_rate DECIMAL(5,2),
  false_negative_rate DECIMAL(5,2),
  alert_battery_threshold DECIMAL(5,2) DEFAULT 20,
  alert_offline_minutes INTEGER DEFAULT 30,
  alert_sent BOOLEAN DEFAULT false,
  config JSONB,
  notes TEXT,
  registered_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 11-3. sensor_readings
CREATE TABLE sensor_readings (
  time TIMESTAMPTZ NOT NULL,
  device_id VARCHAR(50) NOT NULL,
  lot_id UUID NOT NULL,
  space_id UUID,
  occupied BOOLEAN NOT NULL,
  confidence DECIMAL(5,2),
  distance_cm DECIMAL(6,1),
  battery_level DECIMAL(5,2),
  rssi INTEGER,
  snr DECIMAL(5,2),
  temperature DECIMAL(4,1),
  raw_data JSONB
);

-- 11-4. lot_realtime_status
CREATE TABLE lot_realtime_status (
  lot_id UUID PRIMARY KEY REFERENCES parking_lots(id) ON DELETE CASCADE,
  total_spaces INTEGER DEFAULT 0,
  occupied_spaces INTEGER DEFAULT 0,
  available_spaces INTEGER GENERATED ALWAYS AS (total_spaces - occupied_spaces) STORED,
  occupancy_rate DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_spaces > 0 THEN ROUND(occupied_spaces::decimal / total_spaces * 100, 2) ELSE 0 END
  ) STORED,
  occupied_disabled INTEGER DEFAULT 0,
  occupied_ev INTEGER DEFAULT 0,
  occupied_compact INTEGER DEFAULT 0,
  available_disabled INTEGER DEFAULT 0,
  available_ev INTEGER DEFAULT 0,
  congestion_level VARCHAR(20) DEFAULT 'normal',
  status VARCHAR(20) DEFAULT 'normal',
  gate_count_in INTEGER DEFAULT 0,
  gate_count_out INTEGER DEFAULT 0,
  gate_calculated_occupied INTEGER DEFAULT 0,
  sensor_vs_gate_diff INTEGER DEFAULT 0,
  last_sensor_update TIMESTAMPTZ,
  last_gate_update TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT now(),
  today_total_in INTEGER DEFAULT 0,
  today_total_out INTEGER DEFAULT 0,
  today_peak_occupied INTEGER DEFAULT 0,
  today_peak_time VARCHAR(5),
  today_avg_duration_min INTEGER
);

-- 11-5. display_boards
CREATE TABLE display_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  board_id VARCHAR(50) UNIQUE NOT NULL,
  board_name VARCHAR(100),
  location VARCHAR(200),
  location_type VARCHAR(30),
  floor INTEGER,
  direction VARCHAR(20),
  protocol VARCHAR(30),
  ip_address VARCHAR(45),
  port INTEGER,
  serial_config JSONB,
  display_type VARCHAR(30),
  display_size VARCHAR(30),
  max_lines INTEGER DEFAULT 2,
  display_template JSONB,
  current_message TEXT,
  last_push TIMESTAMPTZ,
  last_push_success BOOLEAN,
  last_error TEXT,
  push_interval_sec INTEGER DEFAULT 10,
  status VARCHAR(20) DEFAULT 'active',
  manufacturer VARCHAR(100),
  model VARCHAR(100),
  install_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Views
CREATE OR REPLACE VIEW realtime_map_view AS
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

CREATE OR REPLACE VIEW sensor_health_view AS
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

CREATE OR REPLACE VIEW gateway_health_view AS
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

-- Indexes
CREATE INDEX idx_gateway_lot ON gateway_devices(lot_id, status);
CREATE INDEX idx_gateway_heartbeat ON gateway_devices(last_heartbeat);
CREATE INDEX idx_gateway_status ON gateway_devices(status);
CREATE INDEX idx_sensor_lot ON sensor_devices(lot_id, status);
CREATE INDEX idx_sensor_gateway ON sensor_devices(gateway_id);
CREATE INDEX idx_sensor_space ON sensor_devices(space_id);
CREATE INDEX idx_sensor_heartbeat ON sensor_devices(last_heartbeat);
CREATE INDEX idx_sensor_battery ON sensor_devices(battery_level) WHERE battery_level < 20;
CREATE INDEX idx_sensor_status ON sensor_devices(status);
CREATE INDEX idx_readings_time ON sensor_readings(time DESC);
CREATE INDEX idx_readings_device ON sensor_readings(device_id, time DESC);
CREATE INDEX idx_readings_lot ON sensor_readings(lot_id, time DESC);
CREATE INDEX idx_readings_occupied ON sensor_readings(lot_id, time DESC, occupied);
CREATE INDEX idx_realtime_status ON lot_realtime_status(status);
CREATE INDEX idx_realtime_congestion ON lot_realtime_status(congestion_level);
CREATE INDEX idx_display_lot ON display_boards(lot_id, status);
CREATE INDEX idx_display_status ON display_boards(status);

-- Triggers
CREATE TRIGGER trg_gateway_updated BEFORE UPDATE ON gateway_devices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sensor_updated BEFORE UPDATE ON sensor_devices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_display_updated BEFORE UPDATE ON display_boards FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Realtime trigger
CREATE OR REPLACE FUNCTION update_realtime_on_reading()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reading_update_realtime
  AFTER INSERT ON sensor_readings
  FOR EACH ROW EXECUTE FUNCTION update_realtime_on_reading();

-- RLS
ALTER TABLE gateway_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lot_realtime_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE display_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gw_select" ON gateway_devices FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='REALTIME' AND is_active=true)
);
CREATE POLICY "gw_modify" ON gateway_devices FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

CREATE POLICY "sensor_select" ON sensor_devices FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='REALTIME' AND is_active=true)
);
CREATE POLICY "sensor_modify" ON sensor_devices FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

CREATE POLICY "reading_select" ON sensor_readings FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='REALTIME' AND is_active=true)
);
CREATE POLICY "reading_insert" ON sensor_readings FOR INSERT WITH CHECK (true);

CREATE POLICY "rt_status_select" ON lot_realtime_status FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "rt_status_modify" ON lot_realtime_status FOR ALL USING (true);

CREATE POLICY "display_select" ON display_boards FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='REALTIME' AND is_active=true)
);
CREATE POLICY "display_modify" ON display_boards FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('admin','manager'))
);

-- Enable realtime for lot_realtime_status
ALTER PUBLICATION supabase_realtime ADD TABLE public.lot_realtime_status;

-- Activate REALTIME module
UPDATE module_licenses SET is_active = true, activated_at = now() WHERE module_code = 'REALTIME';
