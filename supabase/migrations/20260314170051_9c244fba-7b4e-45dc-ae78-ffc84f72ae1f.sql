
-- 3-1. operations_staff (관리인력 배치)
CREATE TABLE operations_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  staff_name VARCHAR(100) NOT NULL,
  staff_type VARCHAR(20) NOT NULL DEFAULT 'resident',
  phone VARCHAR(20),
  position VARCHAR(50),
  schedule JSONB,
  hire_date DATE,
  resign_date DATE,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3-2. outsourcing_contracts (위탁운영 계약)
CREATE TABLE outsourcing_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  company_name VARCHAR(200) NOT NULL,
  business_number VARCHAR(20),
  representative VARCHAR(100),
  contract_number VARCHAR(50),
  contract_start DATE NOT NULL,
  contract_end DATE NOT NULL,
  contract_amount BIGINT,
  monthly_fee BIGINT,
  revenue_share_rate DECIMAL(5,2),
  contact_person VARCHAR(100),
  contact_phone VARCHAR(20),
  contact_email VARCHAR(255),
  performance_score DECIMAL(3,1),
  evaluation_date DATE,
  evaluation_note TEXT,
  auto_renew BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3-3. fee_policies (요금정책)
CREATE TABLE fee_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  policy_name VARCHAR(100) NOT NULL,
  day_type VARCHAR(20) NOT NULL DEFAULT 'weekday',
  time_start TIME,
  time_end TIME,
  base_minutes INTEGER,
  base_fee INTEGER,
  add_minutes INTEGER,
  add_fee INTEGER,
  daily_max INTEGER,
  monthly_pass_fee INTEGER,
  is_active BOOLEAN DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  approved_by UUID REFERENCES profiles(id),
  legal_basis VARCHAR(200),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3-4. fee_exemptions (감면/면제 기준)
CREATE TABLE fee_exemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES parking_lots(id) ON DELETE CASCADE,
  exemption_type VARCHAR(50) NOT NULL,
  exemption_name VARCHAR(100) NOT NULL,
  discount_type VARCHAR(20) NOT NULL DEFAULT 'rate',
  discount_rate DECIMAL(5,2),
  discount_amount INTEGER,
  max_hours DECIMAL(4,1),
  max_discount_amount INTEGER,
  required_documents VARCHAR(300),
  description VARCHAR(300),
  legal_basis VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3-5. monthly_passes (월정기권)
CREATE TABLE monthly_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  pass_number VARCHAR(30) UNIQUE NOT NULL,
  vehicle_number VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(30),
  holder_name VARCHAR(100),
  holder_phone VARCHAR(20),
  holder_address VARCHAR(300),
  pass_start DATE NOT NULL,
  pass_end DATE NOT NULL,
  fee_amount INTEGER NOT NULL,
  fee_paid INTEGER DEFAULT 0,
  payment_method VARCHAR(20),
  payment_date DATE,
  receipt_number VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active',
  auto_renew BOOLEAN DEFAULT false,
  renewal_count INTEGER DEFAULT 0,
  previous_pass_id UUID REFERENCES monthly_passes(id),
  issued_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3-6. enforcement_records (불법주차 단속)
CREATE TABLE enforcement_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID REFERENCES parking_lots(id),
  enforcement_number VARCHAR(30) UNIQUE NOT NULL,
  vehicle_number VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(30),
  violation_type VARCHAR(50) NOT NULL,
  violation_date TIMESTAMPTZ NOT NULL,
  violation_location VARCHAR(200),
  location_detail VARCHAR(200),
  photo_paths JSONB,
  fine_amount INTEGER,
  fine_due_date DATE,
  fine_paid_date DATE,
  payment_status VARCHAR(20) DEFAULT 'unpaid',
  appeal_status VARCHAR(20),
  appeal_date DATE,
  appeal_reason TEXT,
  appeal_result VARCHAR(20),
  officer_id UUID REFERENCES profiles(id),
  officer_name VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3-7. free_hours_settings (무료개방 시간대)
CREATE TABLE free_hours_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  setting_name VARCHAR(100),
  day_type VARCHAR(20) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  reason VARCHAR(200),
  approved_by UUID REFERENCES profiles(id),
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ops_staff_lot ON operations_staff(lot_id, is_active);
CREATE INDEX idx_outsourcing_lot ON outsourcing_contracts(lot_id, status);
CREATE INDEX idx_outsourcing_end ON outsourcing_contracts(contract_end);
CREATE INDEX idx_fee_policies_lot ON fee_policies(lot_id, is_active);
CREATE INDEX idx_fee_exemptions_type ON fee_exemptions(exemption_type, is_active);
CREATE INDEX idx_monthly_passes_vehicle ON monthly_passes(vehicle_number);
CREATE INDEX idx_monthly_passes_lot ON monthly_passes(lot_id, status);
CREATE INDEX idx_monthly_passes_end ON monthly_passes(pass_end);
CREATE INDEX idx_enforcement_vehicle ON enforcement_records(vehicle_number);
CREATE INDEX idx_enforcement_date ON enforcement_records(violation_date DESC);
CREATE INDEX idx_enforcement_status ON enforcement_records(payment_status);
CREATE INDEX idx_free_hours_lot ON free_hours_settings(lot_id, is_active);

-- Triggers
CREATE TRIGGER trg_ops_staff_updated BEFORE UPDATE ON operations_staff FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_outsourcing_updated BEFORE UPDATE ON outsourcing_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_fee_policies_updated BEFORE UPDATE ON fee_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_monthly_passes_updated BEFORE UPDATE ON monthly_passes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_enforcement_updated BEFORE UPDATE ON enforcement_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE operations_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE outsourcing_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_exemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE enforcement_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_hours_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies using get_user_role function
CREATE POLICY "ops_staff_select" ON operations_staff FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='OPS' AND is_active=true)
);
CREATE POLICY "ops_staff_modify" ON operations_staff FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);

CREATE POLICY "outsourcing_select" ON outsourcing_contracts FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='OPS' AND is_active=true)
);
CREATE POLICY "outsourcing_modify" ON outsourcing_contracts FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);

CREATE POLICY "fee_select" ON fee_policies FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='OPS' AND is_active=true)
);
CREATE POLICY "fee_modify" ON fee_policies FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager')
);

CREATE POLICY "exemption_select" ON fee_exemptions FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='OPS' AND is_active=true)
);
CREATE POLICY "exemption_modify" ON fee_exemptions FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager')
);

CREATE POLICY "pass_select" ON monthly_passes FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='OPS' AND is_active=true)
);
CREATE POLICY "pass_modify" ON monthly_passes FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);

CREATE POLICY "enforce_select" ON enforcement_records FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='OPS' AND is_active=true)
);
CREATE POLICY "enforce_modify" ON enforcement_records FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager','editor')
);

CREATE POLICY "free_hours_select" ON free_hours_settings FOR SELECT USING (
  auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM module_licenses WHERE module_code='OPS' AND is_active=true)
);
CREATE POLICY "free_hours_modify" ON free_hours_settings FOR ALL USING (
  get_user_role(auth.uid()) IN ('admin','manager')
);
