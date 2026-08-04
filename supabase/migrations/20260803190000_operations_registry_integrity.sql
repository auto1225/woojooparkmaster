-- Harden the operations registry for public-sector traceability, atomic payments,
-- and duplicate-safe monthly-pass renewal.

ALTER TABLE public.operations_staff
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE public.outsourcing_contracts
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE public.fee_policies
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE public.fee_exemptions
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE public.monthly_passes
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID;

ALTER TABLE public.enforcement_records
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS location_zone TEXT,
  ADD COLUMN IF NOT EXISTS location_floor TEXT,
  ADD COLUMN IF NOT EXISTS road_segment TEXT,
  ADD COLUMN IF NOT EXISTS road_direction TEXT,
  ADD COLUMN IF NOT EXISTS complaint_id UUID,
  ADD COLUMN IF NOT EXISTS payment_receipt_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_document_number TEXT,
  ADD COLUMN IF NOT EXISTS paid_amount INTEGER,
  ADD COLUMN IF NOT EXISTS payment_client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

ALTER TABLE public.free_hours_settings
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

DO $$
BEGIN
  IF to_regclass('public.complaints') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.enforcement_records'::regclass
         AND conname = 'enforcement_records_complaint_id_fkey'
     ) THEN
    ALTER TABLE public.enforcement_records
      ADD CONSTRAINT enforcement_records_complaint_id_fkey
      FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

DO $$
DECLARE
  v_table TEXT;
  v_constraint TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'operations_staff',
    'outsourcing_contracts',
    'fee_policies',
    'fee_exemptions',
    'monthly_passes',
    'enforcement_records',
    'free_hours_settings'
  ]
  LOOP
    v_constraint := v_table || '_archive_reason_ck';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = format('public.%I', v_table)::regclass
        AND conname = v_constraint
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK ((archived_at IS NULL AND archive_reason IS NULL) OR (archived_at IS NOT NULL AND NULLIF(BTRIM(archive_reason), '''') IS NOT NULL)) NOT VALID',
        v_table,
        v_constraint
      );
    END IF;
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', v_table, v_constraint);
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.enforcement_records'::regclass
      AND conname = 'enforcement_records_complaint_id_fkey'
      AND NOT convalidated
  ) THEN
    ALTER TABLE public.enforcement_records
      VALIDATE CONSTRAINT enforcement_records_complaint_id_fkey;
  END IF;
END;
$$;

-- Add business checks as NOT VALID first so the migration has an explicit review
-- point for legacy rows, then validate each constraint against existing data.
-- Existing operational evaluations use a public-sector 100-point scale.
ALTER TABLE public.outsourcing_contracts
  DROP CONSTRAINT IF EXISTS outsourcing_contracts_business_values_ck;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.operations_staff'::regclass AND conname = 'operations_staff_employment_dates_ck') THEN
    ALTER TABLE public.operations_staff ADD CONSTRAINT operations_staff_employment_dates_ck
      CHECK (resign_date IS NULL OR hire_date IS NULL OR resign_date >= hire_date) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.outsourcing_contracts'::regclass AND conname = 'outsourcing_contracts_business_values_ck') THEN
    ALTER TABLE public.outsourcing_contracts ADD CONSTRAINT outsourcing_contracts_business_values_ck
      CHECK (
        contract_end >= contract_start
        AND (contract_amount IS NULL OR contract_amount >= 0)
        AND (monthly_fee IS NULL OR monthly_fee >= 0)
        AND (revenue_share_rate IS NULL OR revenue_share_rate BETWEEN 0 AND 100)
        AND (performance_score IS NULL OR performance_score BETWEEN 0 AND 100)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fee_policies'::regclass AND conname = 'fee_policies_business_values_ck') THEN
    ALTER TABLE public.fee_policies ADD CONSTRAINT fee_policies_business_values_ck
      CHECK (
        (base_minutes IS NULL OR base_minutes > 0)
        AND (base_fee IS NULL OR base_fee >= 0)
        AND (add_minutes IS NULL OR add_minutes > 0)
        AND (add_fee IS NULL OR add_fee >= 0)
        AND (daily_max IS NULL OR daily_max >= 0)
        AND (monthly_pass_fee IS NULL OR monthly_pass_fee >= 0)
        AND (effective_to IS NULL OR effective_to >= effective_from)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fee_exemptions'::regclass AND conname = 'fee_exemptions_business_values_ck') THEN
    ALTER TABLE public.fee_exemptions ADD CONSTRAINT fee_exemptions_business_values_ck
      CHECK (
        (discount_rate IS NULL OR discount_rate BETWEEN 0 AND 100)
        AND (discount_amount IS NULL OR discount_amount >= 0)
        AND (max_hours IS NULL OR max_hours >= 0)
        AND (max_discount_amount IS NULL OR max_discount_amount >= 0)
        AND (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.monthly_passes'::regclass AND conname = 'monthly_passes_business_values_ck') THEN
    ALTER TABLE public.monthly_passes ADD CONSTRAINT monthly_passes_business_values_ck
      CHECK (
        pass_end >= pass_start
        AND fee_amount >= 0
        AND (fee_paid IS NULL OR fee_paid >= 0)
        AND (renewal_count IS NULL OR renewal_count >= 0)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.enforcement_records'::regclass AND conname = 'enforcement_records_business_values_ck') THEN
    ALTER TABLE public.enforcement_records ADD CONSTRAINT enforcement_records_business_values_ck
      CHECK (
        (fine_amount IS NULL OR fine_amount >= 0)
        AND (paid_amount IS NULL OR paid_amount >= 0)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.free_hours_settings'::regclass AND conname = 'free_hours_settings_business_values_ck') THEN
    ALTER TABLE public.free_hours_settings ADD CONSTRAINT free_hours_settings_business_values_ck
      CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.operations_staff VALIDATE CONSTRAINT operations_staff_employment_dates_ck;
ALTER TABLE public.outsourcing_contracts VALIDATE CONSTRAINT outsourcing_contracts_business_values_ck;
ALTER TABLE public.fee_policies VALIDATE CONSTRAINT fee_policies_business_values_ck;
ALTER TABLE public.fee_exemptions VALIDATE CONSTRAINT fee_exemptions_business_values_ck;
ALTER TABLE public.monthly_passes VALIDATE CONSTRAINT monthly_passes_business_values_ck;
ALTER TABLE public.enforcement_records VALIDATE CONSTRAINT enforcement_records_business_values_ck;
ALTER TABLE public.free_hours_settings VALIDATE CONSTRAINT free_hours_settings_business_values_ck;

-- Retain the most recently created active pass and expire older duplicates before
-- enforcing one active pass per parking lot and normalized vehicle number.
WITH ranked_active_passes AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lot_id, upper(regexp_replace(vehicle_number, '[[:space:]-]', '', 'g'))
      ORDER BY pass_end DESC, created_at DESC, id DESC
    ) AS duplicate_rank
  FROM public.monthly_passes
  WHERE status = 'active' AND archived_at IS NULL
)
UPDATE public.monthly_passes pass
SET status = 'expired',
    notes = concat_ws(E'\n', NULLIF(pass.notes, ''), '[SYSTEM] Duplicate active pass expired by operations registry integrity migration.'),
    updated_at = now()
FROM ranked_active_passes ranked
WHERE pass.id = ranked.id AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_passes_active_lot_vehicle
  ON public.monthly_passes (
    lot_id,
    upper(regexp_replace(vehicle_number, '[[:space:]-]', '', 'g'))
  )
  WHERE status = 'active' AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_passes_client_mutation
  ON public.monthly_passes(client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_enforcement_payment_client_mutation
  ON public.enforcement_records(payment_client_mutation_id)
  WHERE payment_client_mutation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operations_staff_document_number ON public.operations_staff(document_number) WHERE document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outsourcing_document_number ON public.outsourcing_contracts(document_number) WHERE document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fee_policies_document_number ON public.fee_policies(document_number) WHERE document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fee_exemptions_document_number ON public.fee_exemptions(document_number) WHERE document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_monthly_passes_document_number ON public.monthly_passes(document_number) WHERE document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enforcement_document_number ON public.enforcement_records(document_number) WHERE document_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enforcement_complaint ON public.enforcement_records(complaint_id) WHERE complaint_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_free_hours_document_number ON public.free_hours_settings(document_number) WHERE document_number IS NOT NULL;

-- Promote evidence written by the compatibility UI into dedicated searchable
-- columns before the strict RPC becomes the only payment path.
WITH legacy_payment AS (
  SELECT
    id,
    NULLIF(BTRIM(substring(notes FROM E'(?m)^\\[공식문서번호\\]\\s*(.+)$')), '') AS legacy_document_number,
    NULLIF(BTRIM(substring(notes FROM E'(?m)^\\[영수증번호\\]\\s*(.+)$')), '') AS legacy_receipt_number,
    NULLIF(BTRIM(substring(notes FROM E'(?m)^\\[납부액\\]\\s*([0-9]+)$')), '') AS legacy_paid_amount
  FROM public.enforcement_records
  WHERE notes IS NOT NULL
)
UPDATE public.enforcement_records record
SET document_number = COALESCE(NULLIF(record.document_number, ''), legacy.legacy_document_number),
    payment_document_number = CASE WHEN record.payment_status = 'paid' THEN COALESCE(NULLIF(record.payment_document_number, ''), legacy.legacy_document_number) ELSE record.payment_document_number END,
    payment_receipt_number = CASE WHEN record.payment_status = 'paid' THEN COALESCE(NULLIF(record.payment_receipt_number, ''), legacy.legacy_receipt_number) ELSE record.payment_receipt_number END,
    paid_amount = CASE WHEN record.payment_status = 'paid' THEN COALESCE(record.paid_amount, legacy.legacy_paid_amount::INTEGER) ELSE record.paid_amount END
FROM legacy_payment legacy
WHERE record.id = legacy.id
  AND (legacy.legacy_document_number IS NOT NULL OR legacy.legacy_receipt_number IS NOT NULL OR legacy.legacy_paid_amount IS NOT NULL);

CREATE OR REPLACE FUNCTION public.is_operations_registry_reader(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_user_id
      AND COALESCE(profile.is_active, true)
      AND (
        profile.role::text IN ('admin', 'manager', 'editor')
        OR profile.team::text = 'operations'
        OR COALESCE(profile.department, '') ILIKE ANY (
          ARRAY['%차량관리과%', '%공영주차장%운영%', '%주차%운영팀%']
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_operations_registry_writer(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.get_user_role(p_user_id)::text IN ('admin', 'manager', 'editor'), false);
$$;

REVOKE ALL ON FUNCTION public.is_operations_registry_reader(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_operations_registry_writer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_operations_registry_reader(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_operations_registry_writer(UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS public.operations_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  event_type TEXT NOT NULL,
  actor_id UUID,
  actor_role TEXT,
  old_data JSONB,
  new_data JSONB,
  event_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_operations_audit_record
  ON public.operations_audit_events(table_name, record_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_audit_actor
  ON public.operations_audit_events(actor_id, occurred_at DESC)
  WHERE actor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.capture_operations_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_record_id UUID;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_record_id := COALESCE((v_new ->> 'id')::UUID, (v_old ->> 'id')::UUID);

  INSERT INTO public.operations_audit_events (
    table_name, record_id, event_type, actor_id, actor_role, old_data, new_data
  ) VALUES (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    auth.uid(),
    public.get_user_role(auth.uid())::text,
    v_old,
    v_new
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_operations_audit_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'operations_audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_operations_audit_immutable ON public.operations_audit_events;
CREATE TRIGGER trg_operations_audit_immutable
BEFORE UPDATE OR DELETE ON public.operations_audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_operations_audit_event_mutation();

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'operations_staff',
    'outsourcing_contracts',
    'fee_policies',
    'fee_exemptions',
    'monthly_passes',
    'enforcement_records',
    'free_hours_settings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_operations_audit ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_operations_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_operations_audit_event()',
      v_table,
      v_table
    );
  END LOOP;
END;
$$;

ALTER TABLE public.operations_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operations_audit_events_select ON public.operations_audit_events;
CREATE POLICY operations_audit_events_select
ON public.operations_audit_events FOR SELECT TO authenticated
USING (public.is_operations_registry_reader(auth.uid()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.operations_audit_events FROM authenticated, anon;
GRANT SELECT ON public.operations_audit_events TO authenticated;

CREATE SEQUENCE IF NOT EXISTS public.monthly_pass_number_seq AS BIGINT START WITH 100000;

CREATE OR REPLACE FUNCTION public.renew_monthly_pass(
  p_existing_pass_id UUID,
  p_pass_start DATE,
  p_pass_end DATE,
  p_fee_amount INTEGER,
  p_payment_method TEXT DEFAULT NULL,
  p_payment_date DATE DEFAULT NULL,
  p_receipt_number TEXT DEFAULT NULL,
  p_document_number TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS public.monthly_passes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.monthly_passes%ROWTYPE;
  v_created public.monthly_passes%ROWTYPE;
  v_pass_number TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_operations_registry_writer(auth.uid()) THEN
    RAISE EXCEPTION '월정기권 갱신 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_created
    FROM public.monthly_passes
    WHERE client_mutation_id = p_idempotency_key;
    IF FOUND THEN
      RETURN v_created;
    END IF;
  END IF;

  IF p_pass_start IS NULL OR p_pass_end IS NULL OR p_pass_end < p_pass_start THEN
    RAISE EXCEPTION '유효한 정기권 시작일과 종료일을 입력해 주세요.';
  END IF;
  IF p_fee_amount IS NULL OR p_fee_amount < 0 THEN
    RAISE EXCEPTION '정기권 금액은 0원 이상이어야 합니다.';
  END IF;

  SELECT * INTO v_existing
  FROM public.monthly_passes
  WHERE id = p_existing_pass_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '갱신할 월정기권을 찾을 수 없습니다.';
  END IF;

  -- A concurrent retry may have completed while this transaction waited for
  -- the source-pass row lock. Return that result instead of reporting expiry.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_created
    FROM public.monthly_passes
    WHERE client_mutation_id = p_idempotency_key;
    IF FOUND THEN
      RETURN v_created;
    END IF;
  END IF;

  IF v_existing.archived_at IS NOT NULL OR v_existing.status <> 'active' THEN
    RAISE EXCEPTION '활성 상태의 월정기권만 갱신할 수 있습니다.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_existing.lot_id::text || ':' || upper(regexp_replace(v_existing.vehicle_number, '[[:space:]-]', '', 'g')), 0)
  );

  UPDATE public.monthly_passes
  SET status = 'expired', updated_at = now()
  WHERE id = v_existing.id;

  v_pass_number := 'MP-' || to_char(current_date, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.monthly_pass_number_seq')::text, 8, '0');

  INSERT INTO public.monthly_passes (
    lot_id, pass_number, vehicle_number, vehicle_type, holder_name, holder_phone,
    holder_address, pass_start, pass_end, fee_amount, fee_paid, payment_method,
    payment_date, receipt_number, status, auto_renew, renewal_count,
    previous_pass_id, issued_by, notes, document_number, client_mutation_id
  ) VALUES (
    v_existing.lot_id,
    v_pass_number,
    v_existing.vehicle_number,
    v_existing.vehicle_type,
    v_existing.holder_name,
    v_existing.holder_phone,
    v_existing.holder_address,
    p_pass_start,
    p_pass_end,
    p_fee_amount,
    CASE WHEN p_payment_date IS NULL THEN 0 ELSE p_fee_amount END,
    p_payment_method,
    p_payment_date,
    NULLIF(BTRIM(p_receipt_number), ''),
    'active',
    v_existing.auto_renew,
    COALESCE(v_existing.renewal_count, 0) + 1,
    v_existing.id,
    auth.uid(),
    v_existing.notes,
    COALESCE(NULLIF(BTRIM(p_document_number), ''), v_existing.document_number),
    p_idempotency_key
  )
  RETURNING * INTO v_created;

  RETURN v_created;
EXCEPTION
  WHEN unique_violation THEN
    IF p_idempotency_key IS NOT NULL THEN
      SELECT * INTO v_created
      FROM public.monthly_passes
      WHERE client_mutation_id = p_idempotency_key;
      IF FOUND THEN RETURN v_created; END IF;
    END IF;
    RAISE;
END;
$$;

DROP FUNCTION IF EXISTS public.mark_enforcement_paid(UUID, TEXT, TEXT, INTEGER, UUID);

CREATE OR REPLACE FUNCTION public.mark_enforcement_paid(
  p_enforcement_id UUID,
  p_payment_receipt_number TEXT,
  p_payment_document_number TEXT,
  p_paid_amount INTEGER DEFAULT NULL,
  p_paid_date DATE DEFAULT current_date,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS public.enforcement_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_record public.enforcement_records%ROWTYPE;
  v_paid_amount INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_operations_registry_writer(auth.uid()) THEN
    RAISE EXCEPTION '단속 과태료 납부 처리 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(BTRIM(p_payment_receipt_number), '') IS NULL THEN
    RAISE EXCEPTION '납부 영수증 번호는 필수입니다.';
  END IF;
  IF NULLIF(BTRIM(p_payment_document_number), '') IS NULL THEN
    RAISE EXCEPTION '납부 처리 공식 문서번호는 필수입니다.';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_record
    FROM public.enforcement_records
    WHERE payment_client_mutation_id = p_idempotency_key;
    IF FOUND THEN RETURN v_record; END IF;
  END IF;

  SELECT * INTO v_record
  FROM public.enforcement_records
  WHERE id = p_enforcement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '납부 처리할 단속기록을 찾을 수 없습니다.';
  END IF;
  IF v_record.archived_at IS NOT NULL THEN
    RAISE EXCEPTION '보관된 단속기록은 납부 처리할 수 없습니다.';
  END IF;
  IF v_record.payment_status = 'paid' THEN
    IF v_record.payment_receipt_number = BTRIM(p_payment_receipt_number)
       AND v_record.payment_document_number = BTRIM(p_payment_document_number) THEN
      RETURN v_record;
    END IF;
    RAISE EXCEPTION '이미 다른 납부 근거로 처리된 단속기록입니다.';
  END IF;
  IF v_record.payment_status NOT IN ('unpaid', 'overdue') THEN
    RAISE EXCEPTION '미납 또는 체납 상태의 단속기록만 납부 처리할 수 있습니다.';
  END IF;
  IF v_record.fine_amount IS NULL OR v_record.fine_amount < 0 THEN
    RAISE EXCEPTION '확정된 과태료 금액이 필요합니다.';
  END IF;

  v_paid_amount := COALESCE(p_paid_amount, v_record.fine_amount);
  IF v_paid_amount <> v_record.fine_amount THEN
    RAISE EXCEPTION '완납 처리 금액은 확정 과태료 금액과 같아야 합니다.';
  END IF;

  UPDATE public.enforcement_records
  SET payment_status = 'paid',
      fine_paid_date = COALESCE(p_paid_date, current_date),
      paid_amount = v_paid_amount,
      payment_receipt_number = BTRIM(p_payment_receipt_number),
      payment_document_number = BTRIM(p_payment_document_number),
      document_number = COALESCE(NULLIF(document_number, ''), BTRIM(p_payment_document_number)),
      payment_client_mutation_id = p_idempotency_key,
      updated_at = now()
  WHERE id = v_record.id
  RETURNING * INTO v_record;

  INSERT INTO public.operations_audit_events (
    table_name, record_id, event_type, actor_id, actor_role, new_data, event_metadata
  ) VALUES (
    'enforcement_records',
    v_record.id,
    'PAYMENT_MARKED',
    auth.uid(),
    public.get_user_role(auth.uid())::text,
    to_jsonb(v_record),
    jsonb_build_object(
      'receipt_number', v_record.payment_receipt_number,
      'payment_document_number', v_record.payment_document_number,
      'paid_amount', v_record.paid_amount,
      'idempotency_key', p_idempotency_key
    )
  );

  RETURN v_record;
EXCEPTION
  WHEN unique_violation THEN
    IF p_idempotency_key IS NOT NULL THEN
      SELECT * INTO v_record
      FROM public.enforcement_records
      WHERE payment_client_mutation_id = p_idempotency_key;
      IF FOUND THEN RETURN v_record; END IF;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.renew_monthly_pass(UUID, DATE, DATE, INTEGER, TEXT, DATE, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_enforcement_paid(UUID, TEXT, TEXT, INTEGER, DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renew_monthly_pass(UUID, DATE, DATE, INTEGER, TEXT, DATE, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_enforcement_paid(UUID, TEXT, TEXT, INTEGER, DATE, UUID) TO authenticated;

-- Replace broad module-wide read access with role/team/department-aware access.
DO $$
DECLARE
  v_table TEXT;
  v_select_policy TEXT;
  v_modify_policy TEXT;
  v_writer_roles TEXT;
BEGIN
  FOR v_table, v_select_policy, v_modify_policy, v_writer_roles IN
    SELECT * FROM (VALUES
      ('operations_staff',       'ops_staff_select',  'ops_staff_modify',  'admin,manager,editor'),
      ('outsourcing_contracts',  'outsourcing_select','outsourcing_modify','admin,manager,editor'),
      ('fee_policies',           'fee_select',        'fee_modify',        'admin,manager'),
      ('fee_exemptions',         'exemption_select',  'exemption_modify',  'admin,manager'),
      ('monthly_passes',         'pass_select',       'pass_modify',       'admin,manager,editor'),
      ('enforcement_records',    'enforce_select',    'enforce_modify',    'admin,manager,editor'),
      ('free_hours_settings',    'free_hours_select', 'free_hours_modify', 'admin,manager')
    ) AS policy_map(table_name, select_policy, modify_policy, writer_roles)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_select_policy, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_modify_policy, v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_operations_select', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_operations_insert', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_operations_update', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_operations_delete', v_table);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_operations_registry_reader(auth.uid()))',
      v_table || '_operations_select', v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.get_user_role(auth.uid())::text = ANY (string_to_array(%L, '','')))',
      v_table || '_operations_insert', v_table, v_writer_roles
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid())::text = ANY (string_to_array(%L, '',''))) WITH CHECK (public.get_user_role(auth.uid())::text = ANY (string_to_array(%L, '','')))',
      v_table || '_operations_update', v_table, v_writer_roles, v_writer_roles
    );
  END LOOP;
END;
$$;

COMMENT ON TABLE public.operations_audit_events IS
  'Append-only audit trail for operations registries. UPDATE and DELETE are blocked.';
COMMENT ON FUNCTION public.renew_monthly_pass(UUID, DATE, DATE, INTEGER, TEXT, DATE, TEXT, TEXT, UUID) IS
  'Atomically expires one active monthly pass and creates its idempotent server-numbered renewal.';
COMMENT ON FUNCTION public.mark_enforcement_paid(UUID, TEXT, TEXT, INTEGER, DATE, UUID) IS
  'Marks an enforcement fine paid only with a receipt and official document number, and emits a semantic audit event.';
