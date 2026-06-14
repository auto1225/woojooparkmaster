-- ============================================================
-- 0003_parking_lots.sql
-- 주차장 도메인 핵심 테이블: parking_lots, parking_spaces
--
-- 원본 supabase/migrations/20260314163643 + 후속 ALTER 통합.
-- 변경점:
--  - auth.users(id) 참조 → 자체 users(id)
--  - RLS / CREATE POLICY 모두 제거 (앱 레벨 권한으로 대체)
--  - layout_data, author_name 컬럼 (후속 마이그레이션 통합)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE lot_type_enum AS ENUM ('offstreet', 'onstreet', 'multilevel', 'vacant_lot', 'underground');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE operator_enum AS ENUM ('direct', 'outsourced', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE surface_enum AS ENUM ('ascon', 'block', 'concrete', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE power_enum AS ENUM ('supplied', 'available', 'unavailable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lot_status_enum AS ENUM ('active', 'inactive', 'construction', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE space_type_enum AS ENUM ('general', 'disabled', 'ev', 'compact', 'pregnant', 'motorcycle', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ──────────────────────────────────────────────
-- parking_lots
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parking_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  address_jibun VARCHAR(300),
  address_road VARCHAR(300),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  lot_type lot_type_enum NOT NULL DEFAULT 'offstreet',
  total_spaces INTEGER DEFAULT 0,
  disabled_spaces INTEGER DEFAULT 0,
  ev_spaces INTEGER DEFAULT 0,
  compact_spaces INTEGER DEFAULT 0,
  pregnant_spaces INTEGER DEFAULT 0,
  other_spaces INTEGER DEFAULT 0,
  floors INTEGER DEFAULT 1,
  floor_detail JSONB,
  area_sqm DECIMAL(10,2),
  operator_type operator_enum NOT NULL DEFAULT 'direct',
  operator_name VARCHAR(200),
  surface_type surface_enum,
  operating_hours JSONB,
  fee_policy JSONB,
  has_gate BOOLEAN DEFAULT false,
  has_lpr BOOLEAN DEFAULT false,
  has_kiosk BOOLEAN DEFAULT false,
  has_cctv BOOLEAN DEFAULT false,
  has_display_board BOOLEAN DEFAULT false,
  has_sensor BOOLEAN DEFAULT false,
  control_system_linked BOOLEAN DEFAULT false,
  portal_linked BOOLEAN DEFAULT false,
  power_status power_enum,
  network_type VARCHAR(50),
  status lot_status_enum DEFAULT 'active',
  notes TEXT,
  layout_data JSONB,           -- 후속 ALTER 통합
  author_name TEXT,            -- 후속 ALTER 통합
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parking_lots_status_idx ON parking_lots(status);
CREATE INDEX IF NOT EXISTS parking_lots_lot_type_idx ON parking_lots(lot_type);

-- ──────────────────────────────────────────────
-- parking_spaces
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parking_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  floor INTEGER DEFAULT 1,
  zone VARCHAR(10),
  space_number VARCHAR(20),
  space_type space_type_enum DEFAULT 'general',
  has_sensor BOOLEAN DEFAULT false,
  sensor_id VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parking_spaces_lot_id_idx ON parking_spaces(lot_id);

-- updated_at 자동 갱신
DROP TRIGGER IF EXISTS parking_lots_set_updated_at ON parking_lots;
CREATE TRIGGER parking_lots_set_updated_at
BEFORE UPDATE ON parking_lots
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
