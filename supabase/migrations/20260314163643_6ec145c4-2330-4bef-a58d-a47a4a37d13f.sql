
-- ─── 1. Enum Types ───
CREATE TYPE team_type AS ENUM ('operations', 'facilities', 'planning', 'admin');
CREATE TYPE role_type AS ENUM ('admin', 'manager', 'editor', 'viewer');
CREATE TYPE lot_type_enum AS ENUM ('offstreet', 'onstreet', 'multilevel', 'vacant_lot', 'underground');
CREATE TYPE operator_enum AS ENUM ('direct', 'outsourced', 'other');
CREATE TYPE surface_enum AS ENUM ('ascon', 'block', 'concrete', 'other');
CREATE TYPE power_enum AS ENUM ('supplied', 'available', 'unavailable');
CREATE TYPE lot_status_enum AS ENUM ('active', 'inactive', 'construction', 'closed');
CREATE TYPE space_type_enum AS ENUM ('general', 'disabled', 'ev', 'compact', 'pregnant', 'motorcycle', 'other');
CREATE TYPE survey_status_enum AS ENUM ('draft', 'in_progress', 'submitted', 'review', 'approved', 'rejected');

-- ─── 2. system_config ───
CREATE TABLE system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(100) UNIQUE NOT NULL,
  config_value TEXT NOT NULL,
  description VARCHAR(300),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 3. CORE Tables ───

-- 3-1. profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  employee_number VARCHAR(30),
  department VARCHAR(100),
  team team_type NOT NULL DEFAULT 'operations',
  role role_type NOT NULL DEFAULT 'viewer',
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3-2. parking_lots
CREATE TABLE parking_lots (
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
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3-3. parking_spaces
CREATE TABLE parking_spaces (
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

-- 3-4. code_master
CREATE TABLE code_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code VARCHAR(50) NOT NULL,
  code VARCHAR(50) NOT NULL,
  name_ko VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  parent_code VARCHAR(50),
  extra JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_code, code)
);

-- 3-5. attachments
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(50) NOT NULL,
  ref_id UUID NOT NULL,
  ref_type VARCHAR(50) NOT NULL,
  category VARCHAR(50),
  file_name VARCHAR(500) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  thumbnail_path TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3-6. activity_logs
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  user_name VARCHAR(100),
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id UUID,
  target_name VARCHAR(200),
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3-7. notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'info',
  title VARCHAR(200) NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3-8. module_licenses
CREATE TABLE module_licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code VARCHAR(30) UNIQUE NOT NULL,
  module_name VARCHAR(100) NOT NULL,
  license_type VARCHAR(20) NOT NULL DEFAULT 'standard',
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE,
  max_users INTEGER,
  is_active BOOLEAN DEFAULT true,
  license_key VARCHAR(100),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 4. Indexes ───
CREATE INDEX idx_parking_lots_status ON parking_lots(status);
CREATE INDEX idx_parking_lots_lot_type ON parking_lots(lot_type);
CREATE INDEX idx_parking_lots_coords ON parking_lots(latitude, longitude);
CREATE INDEX idx_parking_lots_name ON parking_lots(name);
CREATE INDEX idx_parking_spaces_lot_id ON parking_spaces(lot_id);
CREATE INDEX idx_parking_spaces_type ON parking_spaces(lot_id, space_type);
CREATE INDEX idx_attachments_ref ON attachments(module, ref_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_module ON activity_logs(module, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_module_licenses_code ON module_licenses(module_code, is_active);
CREATE INDEX idx_system_config_key ON system_config(config_key);

-- ─── 5. Auth Trigger ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, team, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'team')::team_type, 'operations'),
    COALESCE((NEW.raw_user_meta_data->>'role')::role_type, 'viewer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 6. updated_at 자동 갱신 ───
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_lots_updated BEFORE UPDATE ON parking_lots FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 7. RLS ───
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_licenses ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS role_type
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = _user_id LIMIT 1;
$$;

-- system_config: all read, admin write
CREATE POLICY "config_select" ON system_config FOR SELECT USING (true);
CREATE POLICY "config_admin_insert" ON system_config FOR INSERT WITH CHECK (
  public.get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "config_admin_update" ON system_config FOR UPDATE USING (
  public.get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "config_admin_delete" ON system_config FOR DELETE USING (
  public.get_user_role(auth.uid()) = 'admin'
);

-- profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_update_admin" ON profiles FOR UPDATE USING (
  public.get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);

-- parking_lots
CREATE POLICY "lots_select" ON parking_lots FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "lots_insert" ON parking_lots FOR INSERT WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);
CREATE POLICY "lots_update" ON parking_lots FOR UPDATE USING (
  public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);
CREATE POLICY "lots_delete" ON parking_lots FOR DELETE USING (
  public.get_user_role(auth.uid()) = 'admin'
);

-- parking_spaces
CREATE POLICY "spaces_select" ON parking_spaces FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "spaces_insert" ON parking_spaces FOR INSERT WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);
CREATE POLICY "spaces_update" ON parking_spaces FOR UPDATE USING (
  public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);
CREATE POLICY "spaces_delete" ON parking_spaces FOR DELETE USING (
  public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);

-- code_master
CREATE POLICY "codes_select" ON code_master FOR SELECT USING (true);
CREATE POLICY "codes_admin_insert" ON code_master FOR INSERT WITH CHECK (
  public.get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "codes_admin_update" ON code_master FOR UPDATE USING (
  public.get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "codes_admin_delete" ON code_master FOR DELETE USING (
  public.get_user_role(auth.uid()) = 'admin'
);

-- attachments
CREATE POLICY "attach_select" ON attachments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "attach_insert" ON attachments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "attach_delete" ON attachments FOR DELETE USING (
  uploaded_by = auth.uid()
  OR public.get_user_role(auth.uid()) IN ('admin', 'manager')
);

-- activity_logs
CREATE POLICY "logs_select" ON activity_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "logs_insert" ON activity_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- notifications
CREATE POLICY "notif_select" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (true);

-- module_licenses
CREATE POLICY "lic_select" ON module_licenses FOR SELECT USING (true);
CREATE POLICY "lic_admin_insert" ON module_licenses FOR INSERT WITH CHECK (
  public.get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "lic_admin_update" ON module_licenses FOR UPDATE USING (
  public.get_user_role(auth.uid()) = 'admin'
);
CREATE POLICY "lic_admin_delete" ON module_licenses FOR DELETE USING (
  public.get_user_role(auth.uid()) = 'admin'
);
