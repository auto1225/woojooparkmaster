-- Revenue ledger integrity, approval separation, reconciliation completeness,
-- and mobile-safe idempotency.

ALTER TABLE public.revenue_daily
  ADD COLUMN IF NOT EXISTS lot_type_at_event TEXT,
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.revenue_period_closes
  ADD COLUMN IF NOT EXISTS lot_type_at_event TEXT,
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.revenue_reconciliation
  ADD COLUMN IF NOT EXISTS reported_monthly_pass BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_monthly_pass BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lot_type_at_event TEXT,
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id);

UPDATE public.revenue_daily daily
SET lot_type_at_event = lot.lot_type::TEXT
FROM public.parking_lots lot
WHERE lot.id = daily.lot_id AND daily.lot_type_at_event IS NULL;

UPDATE public.revenue_period_closes close_row
SET lot_type_at_event = lot.lot_type::TEXT
FROM public.parking_lots lot
WHERE lot.id = close_row.lot_id AND close_row.lot_type_at_event IS NULL;

UPDATE public.revenue_reconciliation recon
SET lot_type_at_event = lot.lot_type::TEXT
FROM public.parking_lots lot
WHERE lot.id = recon.lot_id AND recon.lot_type_at_event IS NULL;

UPDATE public.revenue_daily SET
  cash_amount = COALESCE(cash_amount, 0),
  card_amount = COALESCE(card_amount, 0),
  mobile_amount = COALESCE(mobile_amount, 0),
  monthly_pass_amount = COALESCE(monthly_pass_amount, 0),
  other_amount = COALESCE(other_amount, 0),
  total_vehicles = COALESCE(total_vehicles, 0),
  exemption_count = COALESCE(exemption_count, 0),
  exemption_amount = COALESCE(exemption_amount, 0),
  verified = COALESCE(verified, FALSE);

ALTER TABLE public.revenue_daily
  ALTER COLUMN cash_amount SET NOT NULL,
  ALTER COLUMN card_amount SET NOT NULL,
  ALTER COLUMN mobile_amount SET NOT NULL,
  ALTER COLUMN monthly_pass_amount SET NOT NULL,
  ALTER COLUMN other_amount SET NOT NULL,
  ALTER COLUMN total_vehicles SET NOT NULL,
  ALTER COLUMN exemption_count SET NOT NULL,
  ALTER COLUMN exemption_amount SET NOT NULL,
  ALTER COLUMN verified SET NOT NULL;

ALTER TABLE public.revenue_reconciliation
  DROP COLUMN IF EXISTS diff_amount,
  DROP COLUMN IF EXISTS reported_total,
  DROP COLUMN IF EXISTS system_total;

ALTER TABLE public.revenue_reconciliation
  ADD COLUMN reported_total BIGINT GENERATED ALWAYS AS (
    COALESCE(reported_cash, 0) + COALESCE(reported_card, 0) + COALESCE(reported_mobile, 0)
    + COALESCE(reported_monthly_pass, 0) + COALESCE(reported_other, 0)
  ) STORED,
  ADD COLUMN system_total BIGINT GENERATED ALWAYS AS (
    COALESCE(system_cash, 0) + COALESCE(system_card, 0) + COALESCE(system_mobile, 0)
    + COALESCE(system_monthly_pass, 0) + COALESCE(system_other, 0)
  ) STORED,
  ADD COLUMN diff_amount BIGINT GENERATED ALWAYS AS (
    (COALESCE(reported_cash, 0) + COALESCE(reported_card, 0) + COALESCE(reported_mobile, 0) + COALESCE(reported_monthly_pass, 0) + COALESCE(reported_other, 0))
    - (COALESCE(system_cash, 0) + COALESCE(system_card, 0) + COALESCE(system_mobile, 0) + COALESCE(system_monthly_pass, 0) + COALESCE(system_other, 0))
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_daily_client_mutation
  ON public.revenue_daily(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_close_client_mutation
  ON public.revenue_period_closes(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_recon_client_mutation
  ON public.revenue_reconciliation(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_recon_lot_period
  ON public.revenue_reconciliation(lot_id, period_start, period_end) WHERE archived_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.revenue_daily'::regclass AND conname = 'revenue_daily_values_ck') THEN
    ALTER TABLE public.revenue_daily ADD CONSTRAINT revenue_daily_values_ck CHECK (
      cash_amount >= 0 AND card_amount >= 0 AND mobile_amount >= 0 AND monthly_pass_amount >= 0 AND other_amount >= 0
      AND total_vehicles >= 0 AND COALESCE(peak_hour_vehicles, 0) >= 0 AND COALESCE(avg_parking_minutes, 0) >= 0
      AND exemption_count >= 0 AND exemption_amount >= 0
      AND NOT (exemption_count = 0 AND exemption_amount > 0)
      AND row_version >= 1
      AND ((verified = FALSE AND verified_by IS NULL AND verified_at IS NULL) OR (verified = TRUE AND verified_by IS NOT NULL AND verified_at IS NOT NULL))
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.revenue_period_closes'::regclass AND conname = 'revenue_period_closes_month_ck') THEN
    ALTER TABLE public.revenue_period_closes ADD CONSTRAINT revenue_period_closes_month_ck CHECK (
      period_month = date_trunc('month', period_month)::DATE AND record_count >= 0 AND total_amount >= 0
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.revenue_reconciliation'::regclass AND conname = 'revenue_reconciliation_values_ck') THEN
    ALTER TABLE public.revenue_reconciliation ADD CONSTRAINT revenue_reconciliation_values_ck CHECK (
      period_end >= period_start
      AND COALESCE(reported_cash, 0) >= 0 AND COALESCE(reported_card, 0) >= 0 AND COALESCE(reported_mobile, 0) >= 0
      AND COALESCE(reported_monthly_pass, 0) >= 0 AND COALESCE(reported_other, 0) >= 0
      AND COALESCE(system_cash, 0) >= 0 AND COALESCE(system_card, 0) >= 0 AND COALESCE(system_mobile, 0) >= 0
      AND COALESCE(system_monthly_pass, 0) >= 0 AND COALESCE(system_other, 0) >= 0
      AND COALESCE(reported_vehicles, 0) >= 0 AND COALESCE(system_vehicles, 0) >= 0
      AND status IN ('pending', 'reviewing', 'matched', 'discrepancy', 'resolved', 'disputed')
    ) NOT VALID;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_revenue_event_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lot_type_at_event IS NULL AND NEW.lot_id IS NOT NULL THEN
    SELECT lot_type::TEXT INTO NEW.lot_type_at_event FROM public.parking_lots WHERE id = NEW.lot_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revenue_daily_event_context ON public.revenue_daily;
CREATE TRIGGER trg_revenue_daily_event_context BEFORE INSERT ON public.revenue_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_revenue_event_context();
DROP TRIGGER IF EXISTS trg_revenue_close_event_context ON public.revenue_period_closes;
CREATE TRIGGER trg_revenue_close_event_context BEFORE INSERT ON public.revenue_period_closes
  FOR EACH ROW EXECUTE FUNCTION public.set_revenue_event_context();
DROP TRIGGER IF EXISTS trg_revenue_recon_event_context ON public.revenue_reconciliation;
CREATE TRIGGER trg_revenue_recon_event_context BEFORE INSERT ON public.revenue_reconciliation
  FOR EACH ROW EXECUTE FUNCTION public.set_revenue_event_context();

CREATE OR REPLACE FUNCTION public.guard_revenue_daily_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_financial_changed BOOLEAN;
BEGIN
  v_financial_changed := ROW(
    NEW.lot_id, NEW.revenue_date, NEW.cash_amount, NEW.card_amount, NEW.mobile_amount,
    NEW.monthly_pass_amount, NEW.other_amount, NEW.total_vehicles, NEW.peak_hour,
    NEW.avg_parking_minutes, NEW.exemption_count, NEW.exemption_amount, NEW.data_source
  ) IS DISTINCT FROM ROW(
    OLD.lot_id, OLD.revenue_date, OLD.cash_amount, OLD.card_amount, OLD.mobile_amount,
    OLD.monthly_pass_amount, OLD.other_amount, OLD.total_vehicles, OLD.peak_hour,
    OLD.avg_parking_minutes, OLD.exemption_count, OLD.exemption_amount, OLD.data_source
  );

  IF OLD.verified AND v_financial_changed THEN
    RAISE EXCEPTION '검증 완료된 수입 원장은 수정할 수 없습니다. 정정 절차를 사용하세요.' USING ERRCODE = '55000';
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified
     AND COALESCE(current_setting('app.revenue_verification', TRUE), '') <> 'allowed' THEN
    RAISE EXCEPTION '수입 검증은 승인 명령을 통해서만 처리할 수 있습니다' USING ERRCODE = '42501';
  END IF;

  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_revenue_daily_integrity ON public.revenue_daily;
CREATE TRIGGER trg_guard_revenue_daily_integrity BEFORE UPDATE ON public.revenue_daily
  FOR EACH ROW EXECUTE FUNCTION public.guard_revenue_daily_integrity();

CREATE OR REPLACE FUNCTION public.prevent_revenue_hard_delete()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '수입·마감·대사 원장은 삭제할 수 없습니다. 보관 또는 정정 절차를 사용하세요.' USING ERRCODE = '42501';
END;
$$;

DO $$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['revenue_daily', 'revenue_period_closes', 'revenue_reconciliation'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_prevent_revenue_hard_delete ON public.%I', v_table);
    EXECUTE format('CREATE TRIGGER trg_prevent_revenue_hard_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_revenue_hard_delete()', v_table);
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.revenue_audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id),
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revenue_audit_events_entity ON public.revenue_audit_events(entity_type, entity_id, created_at DESC);
ALTER TABLE public.revenue_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS revenue_audit_events_select ON public.revenue_audit_events;
CREATE POLICY revenue_audit_events_select ON public.revenue_audit_events FOR SELECT TO authenticated USING (public.is_module_active('REVENUE'));
REVOKE ALL ON public.revenue_audit_events FROM anon, authenticated;
GRANT SELECT ON public.revenue_audit_events TO authenticated;

CREATE OR REPLACE FUNCTION public.append_revenue_audit_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.revenue_audit_events(entity_type, entity_id, event_type, actor_id, old_data, new_data)
  VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), lower(TG_OP), auth.uid(), CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END, CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['revenue_daily', 'revenue_period_closes', 'revenue_reconciliation'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_append_revenue_audit_event ON public.%I', v_table);
    EXECUTE format('CREATE TRIGGER trg_append_revenue_audit_event AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.append_revenue_audit_event()', v_table);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_revenue_missing_days(p_lot_id UUID, p_period_month DATE)
RETURNS TABLE(lot_id UUID, lot_code TEXT, lot_name TEXT, revenue_date DATE)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH bounds AS (
    SELECT date_trunc('month', p_period_month)::DATE AS start_date,
           LEAST((date_trunc('month', p_period_month) + INTERVAL '1 month - 1 day')::DATE, CURRENT_DATE - 1) AS end_date
  )
  SELECT lot.id, lot.code::TEXT, lot.name::TEXT, day_value::DATE
  FROM public.parking_lots lot
  CROSS JOIN bounds
  CROSS JOIN LATERAL generate_series(bounds.start_date, bounds.end_date, INTERVAL '1 day') day_value
  LEFT JOIN public.revenue_daily daily ON daily.lot_id = lot.id AND daily.revenue_date = day_value::DATE
  WHERE lot.status = 'active' AND (p_lot_id IS NULL OR lot.id = p_lot_id) AND daily.id IS NULL
  ORDER BY day_value, lot.code;
$$;

CREATE OR REPLACE FUNCTION public.save_revenue_daily(
  p_record_id UUID, p_lot_id UUID, p_revenue_date DATE, p_data_source TEXT,
  p_cash_amount BIGINT, p_card_amount BIGINT, p_mobile_amount BIGINT, p_monthly_pass_amount BIGINT, p_other_amount BIGINT,
  p_total_vehicles INTEGER, p_peak_hour TEXT, p_avg_parking_minutes INTEGER,
  p_exemption_count INTEGER, p_exemption_amount BIGINT, p_discrepancy_note TEXT,
  p_client_mutation_id UUID, p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.revenue_daily
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_record public.revenue_daily%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
  IF v_actor.role NOT IN ('admin', 'manager', 'editor') OR NOT public.is_module_active('REVENUE') THEN
    RAISE EXCEPTION '일별 수입을 저장할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;
  IF p_lot_id IS NULL OR p_revenue_date IS NULL OR p_data_source IS NULL
     OR p_cash_amount IS NULL OR p_card_amount IS NULL OR p_mobile_amount IS NULL
     OR p_monthly_pass_amount IS NULL OR p_other_amount IS NULL OR p_total_vehicles IS NULL
     OR p_exemption_count IS NULL OR p_exemption_amount IS NULL THEN
    RAISE EXCEPTION '주차장, 일자, 입력경로, 금액과 건수는 필수입니다' USING ERRCODE = '22023';
  END IF;
  IF LEAST(p_cash_amount, p_card_amount, p_mobile_amount, p_monthly_pass_amount, p_other_amount, p_total_vehicles, COALESCE(p_avg_parking_minutes, 0), p_exemption_count, p_exemption_amount) < 0 THEN
    RAISE EXCEPTION '금액과 건수는 0 이상이어야 합니다' USING ERRCODE = '22023';
  END IF;
  IF p_exemption_count = 0 AND p_exemption_amount > 0 THEN
    RAISE EXCEPTION '감면 금액이 있으면 감면 건수가 필요합니다' USING ERRCODE = '22023';
  END IF;

  IF p_record_id IS NULL THEN
    SELECT * INTO v_record FROM public.revenue_daily WHERE client_mutation_id = p_client_mutation_id;
    IF v_record.id IS NOT NULL THEN RETURN NEXT v_record; RETURN; END IF;
    INSERT INTO public.revenue_daily(
      lot_id, revenue_date, data_source, cash_amount, card_amount, mobile_amount, monthly_pass_amount, other_amount,
      total_vehicles, peak_hour, avg_parking_minutes, exemption_count, exemption_amount, discrepancy_note,
      input_by, client_mutation_id
    ) VALUES (
      p_lot_id, p_revenue_date, p_data_source, p_cash_amount, p_card_amount, p_mobile_amount, p_monthly_pass_amount, p_other_amount,
      p_total_vehicles, NULLIF(p_peak_hour, ''), NULLIF(p_avg_parking_minutes, 0), p_exemption_count, p_exemption_amount,
      NULLIF(BTRIM(COALESCE(p_discrepancy_note, '')), ''), v_actor.id, p_client_mutation_id
    ) RETURNING * INTO v_record;
  ELSE
    SELECT * INTO v_record FROM public.revenue_daily WHERE id = p_record_id FOR UPDATE;
    IF v_record.id IS NULL THEN RAISE EXCEPTION '수입 원장을 찾을 수 없습니다' USING ERRCODE = 'P0002'; END IF;
    IF v_record.verified THEN RAISE EXCEPTION '검증 완료된 수입 원장은 수정할 수 없습니다' USING ERRCODE = '55000'; END IF;
    IF p_expected_updated_at IS NOT NULL AND v_record.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해주세요' USING ERRCODE = '40001';
    END IF;
    UPDATE public.revenue_daily SET
      data_source = p_data_source, cash_amount = p_cash_amount, card_amount = p_card_amount,
      mobile_amount = p_mobile_amount, monthly_pass_amount = p_monthly_pass_amount, other_amount = p_other_amount,
      total_vehicles = p_total_vehicles, peak_hour = NULLIF(p_peak_hour, ''), avg_parking_minutes = NULLIF(p_avg_parking_minutes, 0),
      exemption_count = p_exemption_count, exemption_amount = p_exemption_amount,
      discrepancy_note = NULLIF(BTRIM(COALESCE(p_discrepancy_note, '')), '')
    WHERE id = p_record_id RETURNING * INTO v_record;
  END IF;
  RETURN NEXT v_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_revenue_daily(p_record_id UUID, p_expected_updated_at TIMESTAMPTZ)
RETURNS SETOF public.revenue_daily
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor public.profiles%ROWTYPE; v_record public.revenue_daily%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
  IF v_actor.role NOT IN ('admin', 'manager') OR NOT public.is_module_active('REVENUE') THEN
    RAISE EXCEPTION '수입 검증 권한이 없습니다' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_record FROM public.revenue_daily WHERE id = p_record_id FOR UPDATE;
  IF v_record.id IS NULL THEN RAISE EXCEPTION '수입 원장을 찾을 수 없습니다' USING ERRCODE = 'P0002'; END IF;
  IF v_record.verified THEN RETURN NEXT v_record; RETURN; END IF;
  IF p_expected_updated_at IS NOT NULL AND v_record.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해주세요' USING ERRCODE = '40001';
  END IF;
  IF v_actor.role = 'manager' AND v_record.input_by = v_actor.id THEN
    RAISE EXCEPTION '본인이 입력한 수입은 다른 팀장 또는 관리자가 검증해야 합니다' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.revenue_verification', 'allowed', TRUE);
  UPDATE public.revenue_daily SET verified = TRUE, verified_by = v_actor.id, verified_at = now()
  WHERE id = p_record_id RETURNING * INTO v_record;
  RETURN NEXT v_record;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS public.revenue_reconciliation_number_seq START 1001;

CREATE OR REPLACE FUNCTION public.create_revenue_reconciliation(p_lot_id UUID, p_period_month DATE, p_client_mutation_id UUID)
RETURNS SETOF public.revenue_reconciliation
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor public.profiles%ROWTYPE; v_recon public.revenue_reconciliation%ROWTYPE;
  v_start DATE := date_trunc('month', p_period_month)::DATE;
  v_end DATE := (date_trunc('month', p_period_month) + INTERVAL '1 month - 1 day')::DATE;
  v_company TEXT; v_number TEXT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
  IF v_actor.role NOT IN ('admin', 'manager', 'editor') OR NOT public.is_module_active('REVENUE') THEN
    RAISE EXCEPTION '위탁 대사를 생성할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_lot_id::TEXT || ':' || v_start::TEXT, 0));
  SELECT * INTO v_recon FROM public.revenue_reconciliation
  WHERE (client_mutation_id = p_client_mutation_id OR (lot_id = p_lot_id AND period_start = v_start AND period_end = v_end))
    AND archived_at IS NULL LIMIT 1;
  IF v_recon.id IS NOT NULL THEN RETURN NEXT v_recon; RETURN; END IF;
  SELECT company_name INTO v_company FROM public.outsourcing_contracts
  WHERE lot_id = p_lot_id AND status = 'active' ORDER BY contract_start DESC LIMIT 1;
  v_number := 'RC-' || to_char(v_start, 'YYYYMM') || '-' || lpad(nextval('public.revenue_reconciliation_number_seq')::TEXT, 5, '0');
  INSERT INTO public.revenue_reconciliation(
    lot_id, recon_number, period_type, period_start, period_end,
    system_cash, system_card, system_mobile, system_monthly_pass, system_other,
    system_vehicles, system_exemptions, company_name, created_by, client_mutation_id
  ) SELECT
    p_lot_id, v_number, 'monthly', v_start, v_end,
    COALESCE(SUM(cash_amount), 0), COALESCE(SUM(card_amount), 0), COALESCE(SUM(mobile_amount), 0),
    COALESCE(SUM(monthly_pass_amount), 0), COALESCE(SUM(other_amount), 0),
    COALESCE(SUM(total_vehicles), 0), COALESCE(SUM(exemption_amount), 0), v_company, v_actor.id, p_client_mutation_id
  FROM public.revenue_daily
  WHERE lot_id = p_lot_id AND revenue_date BETWEEN v_start AND v_end AND verified = TRUE
  RETURNING * INTO v_recon;
  RETURN NEXT v_recon;
END;
$$;

CREATE OR REPLACE FUNCTION public.calc_recon_diff_rate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_reported BIGINT; v_system BIGINT;
BEGIN
  v_reported := COALESCE(NEW.reported_cash, 0) + COALESCE(NEW.reported_card, 0) + COALESCE(NEW.reported_mobile, 0) + COALESCE(NEW.reported_monthly_pass, 0) + COALESCE(NEW.reported_other, 0);
  v_system := COALESCE(NEW.system_cash, 0) + COALESCE(NEW.system_card, 0) + COALESCE(NEW.system_mobile, 0) + COALESCE(NEW.system_monthly_pass, 0) + COALESCE(NEW.system_other, 0);
  NEW.diff_rate := CASE WHEN v_system > 0 THEN ROUND((v_reported - v_system)::DECIMAL / v_system * 100, 2) WHEN v_reported = 0 THEN 0 ELSE 100 END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_revenue_reconciliation_integrity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF ROW(
    NEW.reported_cash, NEW.reported_card, NEW.reported_mobile, NEW.reported_monthly_pass,
    NEW.reported_other, NEW.reported_vehicles, NEW.reported_exemptions, NEW.diff_analysis,
    NEW.resolution_type, NEW.resolution_note, NEW.status
  ) IS DISTINCT FROM ROW(
    OLD.reported_cash, OLD.reported_card, OLD.reported_mobile, OLD.reported_monthly_pass,
    OLD.reported_other, OLD.reported_vehicles, OLD.reported_exemptions, OLD.diff_analysis,
    OLD.resolution_type, OLD.resolution_note, OLD.status
  ) AND COALESCE(current_setting('app.revenue_reconciliation_update', TRUE), '') <> 'allowed' THEN
    RAISE EXCEPTION '수입 대사는 승인된 처리 명령으로만 변경할 수 있습니다' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_revenue_reconciliation_integrity ON public.revenue_reconciliation;
CREATE TRIGGER trg_guard_revenue_reconciliation_integrity BEFORE UPDATE ON public.revenue_reconciliation
  FOR EACH ROW EXECUTE FUNCTION public.guard_revenue_reconciliation_integrity();

CREATE OR REPLACE FUNCTION public.save_revenue_reconciliation(
  p_reconciliation_id UUID,
  p_reported_cash BIGINT, p_reported_card BIGINT, p_reported_mobile BIGINT,
  p_reported_monthly_pass BIGINT, p_reported_other BIGINT,
  p_reported_vehicles INTEGER, p_reported_exemptions BIGINT,
  p_diff_analysis TEXT, p_resolution_type TEXT, p_resolution_note TEXT,
  p_target_status TEXT, p_expected_updated_at TIMESTAMPTZ
)
RETURNS SETOF public.revenue_reconciliation
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_record public.revenue_reconciliation%ROWTYPE;
  v_reported_total BIGINT;
  v_system_total BIGINT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
  IF v_actor.role NOT IN ('admin', 'manager', 'editor') OR NOT public.is_module_active('REVENUE') THEN
    RAISE EXCEPTION '수입 대사를 처리할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;
  IF p_target_status NOT IN ('pending', 'reviewing', 'matched', 'discrepancy', 'resolved', 'disputed') THEN
    RAISE EXCEPTION '허용되지 않은 대사 상태입니다' USING ERRCODE = '22023';
  END IF;
  IF p_reported_cash IS NULL OR p_reported_card IS NULL OR p_reported_mobile IS NULL
     OR p_reported_monthly_pass IS NULL OR p_reported_other IS NULL
     OR p_reported_vehicles IS NULL OR p_reported_exemptions IS NULL
     OR LEAST(p_reported_cash, p_reported_card, p_reported_mobile, p_reported_monthly_pass,
              p_reported_other, p_reported_vehicles, p_reported_exemptions) < 0 THEN
    RAISE EXCEPTION '업체 보고 금액과 건수는 0 이상이어야 합니다' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_record FROM public.revenue_reconciliation WHERE id = p_reconciliation_id FOR UPDATE;
  IF v_record.id IS NULL THEN RAISE EXCEPTION '수입 대사를 찾을 수 없습니다' USING ERRCODE = 'P0002'; END IF;
  IF v_record.status IN ('matched', 'resolved') THEN
    RAISE EXCEPTION '완료된 대사는 변경할 수 없습니다. 정정 대사를 생성하세요.' USING ERRCODE = '55000';
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_record.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해주세요' USING ERRCODE = '40001';
  END IF;
  IF NOT (
    p_target_status = v_record.status
    OR (v_record.status = 'pending' AND p_target_status IN ('reviewing', 'matched', 'discrepancy'))
    OR (v_record.status = 'reviewing' AND p_target_status IN ('matched', 'discrepancy', 'disputed'))
    OR (v_record.status = 'discrepancy' AND p_target_status IN ('reviewing', 'resolved', 'disputed'))
    OR (v_record.status = 'disputed' AND p_target_status IN ('reviewing', 'resolved'))
  ) THEN
    RAISE EXCEPTION '현재 상태(%)에서 %(으)로 변경할 수 없습니다', v_record.status, p_target_status USING ERRCODE = '22023';
  END IF;

  v_reported_total := p_reported_cash + p_reported_card + p_reported_mobile + p_reported_monthly_pass + p_reported_other;
  v_system_total := COALESCE(v_record.system_cash, 0) + COALESCE(v_record.system_card, 0)
    + COALESCE(v_record.system_mobile, 0) + COALESCE(v_record.system_monthly_pass, 0) + COALESCE(v_record.system_other, 0);
  IF p_target_status = 'matched' AND (v_reported_total <> v_system_total OR p_reported_vehicles <> COALESCE(v_record.system_vehicles, 0)) THEN
    RAISE EXCEPTION '금액과 이용차량 차이가 0일 때만 일치 처리할 수 있습니다' USING ERRCODE = '23514';
  END IF;
  IF p_target_status IN ('discrepancy', 'disputed', 'resolved') AND BTRIM(COALESCE(p_diff_analysis, '')) = '' THEN
    RAISE EXCEPTION '불일치 원인 분석을 입력해주세요' USING ERRCODE = '23514';
  END IF;
  IF p_target_status = 'resolved' THEN
    IF v_actor.role NOT IN ('admin', 'manager') THEN RAISE EXCEPTION '대사 완료는 팀장 이상만 처리할 수 있습니다' USING ERRCODE = '42501'; END IF;
    IF BTRIM(COALESCE(p_resolution_type, '')) = '' OR BTRIM(COALESCE(p_resolution_note, '')) = '' THEN
      RAISE EXCEPTION '처리 방법과 처리 소견을 입력해주세요' USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM set_config('app.revenue_reconciliation_update', 'allowed', TRUE);
  UPDATE public.revenue_reconciliation SET
    reported_cash = p_reported_cash, reported_card = p_reported_card,
    reported_mobile = p_reported_mobile, reported_monthly_pass = p_reported_monthly_pass,
    reported_other = p_reported_other, reported_vehicles = p_reported_vehicles,
    reported_exemptions = p_reported_exemptions,
    diff_analysis = NULLIF(BTRIM(COALESCE(p_diff_analysis, '')), ''),
    resolution_type = NULLIF(BTRIM(COALESCE(p_resolution_type, '')), ''),
    resolution_note = NULLIF(BTRIM(COALESCE(p_resolution_note, '')), ''),
    status = p_target_status,
    resolved_by = CASE WHEN p_target_status IN ('matched', 'resolved') THEN v_actor.id ELSE NULL END,
    resolved_at = CASE WHEN p_target_status IN ('matched', 'resolved') THEN now() ELSE NULL END
  WHERE id = p_reconciliation_id RETURNING * INTO v_record;
  RETURN NEXT v_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_revenue_period(p_lot_id UUID, p_period_month DATE)
RETURNS SETOF public.revenue_period_closes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor public.profiles%ROWTYPE; v_start DATE := date_trunc('month', p_period_month)::DATE;
  v_end DATE := (date_trunc('month', p_period_month) + INTERVAL '1 month - 1 day')::DATE;
  v_close public.revenue_period_closes%ROWTYPE; v_expected INTEGER; v_count INTEGER; v_unverified INTEGER; v_total BIGINT;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE;
  IF v_actor.role NOT IN ('admin', 'manager') OR NOT public.is_module_active('REVENUE') THEN RAISE EXCEPTION '월 마감 권한이 없습니다' USING ERRCODE = '42501'; END IF;
  IF v_start >= date_trunc('month', CURRENT_DATE)::DATE THEN RAISE EXCEPTION '완료된 과거 월만 마감할 수 있습니다' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_lot_id::TEXT || ':' || v_start::TEXT, 0));
  SELECT * INTO v_close FROM public.revenue_period_closes WHERE lot_id = p_lot_id AND period_month = v_start FOR UPDATE;
  IF v_close.id IS NOT NULL AND v_close.is_closed THEN RETURN NEXT v_close; RETURN; END IF;
  v_expected := v_end - v_start + 1;
  SELECT COUNT(*), COUNT(*) FILTER (WHERE verified = FALSE), COALESCE(SUM(total_amount), 0)
  INTO v_count, v_unverified, v_total FROM public.revenue_daily WHERE lot_id = p_lot_id AND revenue_date BETWEEN v_start AND v_end;
  IF v_count <> v_expected THEN RAISE EXCEPTION '누락된 일별 수입이 있습니다: 예상 %일, 입력 %일', v_expected, v_count USING ERRCODE = '23514'; END IF;
  IF v_unverified > 0 THEN RAISE EXCEPTION '검증되지 않은 일별 수입이 %건 있습니다', v_unverified USING ERRCODE = '23514'; END IF;
  INSERT INTO public.revenue_period_closes(lot_id, period_month, record_count, total_amount, closed_by, closed_at, is_closed)
  VALUES (p_lot_id, v_start, v_count, v_total, v_actor.id, now(), TRUE)
  ON CONFLICT(lot_id, period_month) DO UPDATE SET record_count = EXCLUDED.record_count, total_amount = EXCLUDED.total_amount,
    closed_by = EXCLUDED.closed_by, closed_at = now(), is_closed = TRUE
  RETURNING * INTO v_close;
  RETURN NEXT v_close;
END;
$$;

CREATE OR REPLACE VIEW public.revenue_certified WITH (security_invoker = TRUE) AS
SELECT daily.* FROM public.revenue_daily daily
JOIN public.revenue_period_closes close_row
  ON close_row.lot_id = daily.lot_id
 AND close_row.period_month = date_trunc('month', daily.revenue_date)::DATE
 AND close_row.is_closed = TRUE
WHERE daily.verified = TRUE AND daily.archived_at IS NULL;

REVOKE ALL ON FUNCTION public.get_revenue_missing_days(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_revenue_daily(UUID, UUID, DATE, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, INTEGER, TEXT, INTEGER, INTEGER, BIGINT, TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_revenue_daily(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_revenue_reconciliation(UUID, DATE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_revenue_reconciliation(UUID, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, INTEGER, BIGINT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_missing_days(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_revenue_daily(UUID, UUID, DATE, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, INTEGER, TEXT, INTEGER, INTEGER, BIGINT, TEXT, UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_revenue_daily(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_revenue_reconciliation(UUID, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_revenue_reconciliation(UUID, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, INTEGER, BIGINT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT SELECT ON public.revenue_certified TO authenticated;
