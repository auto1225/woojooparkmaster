-- Revenue completeness/month close and procurement-to-service handoff.

CREATE TABLE IF NOT EXISTS public.revenue_period_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.parking_lots(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  record_count integer NOT NULL,
  total_amount bigint NOT NULL,
  closed_by uuid NOT NULL REFERENCES public.profiles(id),
  closed_at timestamptz NOT NULL DEFAULT now(),
  reopened_by uuid REFERENCES public.profiles(id),
  reopened_at timestamptz,
  reopen_reason text,
  is_closed boolean NOT NULL DEFAULT true,
  UNIQUE(lot_id, period_month)
);

ALTER TABLE public.revenue_period_closes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revenue_close_select" ON public.revenue_period_closes FOR SELECT USING (
  auth.uid() IS NOT NULL AND public.is_module_active('REVENUE')
);
CREATE POLICY "revenue_close_manager" ON public.revenue_period_closes FOR ALL USING (
  public.get_user_role(auth.uid()) IN ('admin', 'manager')
);

CREATE OR REPLACE VIEW public.revenue_missing_days AS
SELECT
  pl.id AS lot_id,
  pl.code AS lot_code,
  pl.name AS lot_name,
  d.revenue_date
FROM public.parking_lots pl
CROSS JOIN LATERAL generate_series(
  GREATEST(CURRENT_DATE - 90, date_trunc('month', CURRENT_DATE)::date),
  CURRENT_DATE - 1,
  INTERVAL '1 day'
) AS d(revenue_date)
LEFT JOIN public.revenue_daily rd
  ON rd.lot_id = pl.id AND rd.revenue_date = d.revenue_date::date
WHERE pl.status = 'active'
  AND rd.id IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_closed_revenue_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_lot_id uuid := COALESCE(NEW.lot_id, OLD.lot_id);
  v_revenue_date date := COALESCE(NEW.revenue_date, OLD.revenue_date);
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.revenue_period_closes c
    WHERE c.lot_id = v_lot_id
      AND c.period_month = date_trunc('month', v_revenue_date)::date
      AND c.is_closed = true
  ) THEN
    RAISE EXCEPTION '마감된 수입 기간은 변경할 수 없습니다' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_closed_revenue_change ON public.revenue_daily;
CREATE TRIGGER trg_prevent_closed_revenue_change
  BEFORE INSERT OR UPDATE OR DELETE ON public.revenue_daily
  FOR EACH ROW EXECUTE FUNCTION public.prevent_closed_revenue_change();

CREATE OR REPLACE FUNCTION public.close_revenue_period(p_lot_id uuid, p_period_month date)
RETURNS SETOF public.revenue_period_closes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_start date := date_trunc('month', p_period_month)::date;
  v_end date := (date_trunc('month', p_period_month) + INTERVAL '1 month - 1 day')::date;
  v_close public.revenue_period_closes%ROWTYPE;
  v_expected_days integer;
  v_count integer;
  v_unverified integer;
  v_total bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_module_active('REVENUE') THEN
    RAISE EXCEPTION '수입관리 모듈에 접근할 수 없습니다' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  IF v_actor.role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION '월 마감 권한이 없습니다' USING ERRCODE = '42501';
  END IF;
  IF v_start > date_trunc('month', CURRENT_DATE)::date THEN
    RAISE EXCEPTION '미래 기간은 마감할 수 없습니다' USING ERRCODE = '22023';
  END IF;

  v_end := LEAST(v_end, CURRENT_DATE - 1);
  v_expected_days := GREATEST(v_end - v_start + 1, 0);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE verified = false), COALESCE(SUM(total_amount), 0)
  INTO v_count, v_unverified, v_total
  FROM public.revenue_daily
  WHERE lot_id = p_lot_id AND revenue_date BETWEEN v_start AND v_end;

  IF v_count <> v_expected_days THEN
    RAISE EXCEPTION '누락된 일별 수입이 있습니다: 예상 %일, 입력 %일', v_expected_days, v_count USING ERRCODE = '23514';
  END IF;
  IF v_unverified > 0 THEN
    RAISE EXCEPTION '검증되지 않은 일별 수입이 %건 있습니다', v_unverified USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.revenue_period_closes (
    lot_id, period_month, record_count, total_amount, closed_by, closed_at, is_closed,
    reopened_by, reopened_at, reopen_reason
  ) VALUES (
    p_lot_id, v_start, v_count, v_total, v_actor.id, now(), true, NULL, NULL, NULL
  )
  ON CONFLICT (lot_id, period_month) DO UPDATE SET
    record_count = EXCLUDED.record_count,
    total_amount = EXCLUDED.total_amount,
    closed_by = EXCLUDED.closed_by,
    closed_at = now(),
    is_closed = true,
    reopened_by = NULL,
    reopened_at = NULL,
    reopen_reason = NULL
  RETURNING * INTO v_close;

  INSERT INTO public.activity_logs (user_id, user_name, module, action, target_type, target_id, target_name, details)
  VALUES (v_actor.id, v_actor.name, 'REVENUE', 'period_close', 'parking_lot', p_lot_id, v_start::text,
          jsonb_build_object('record_count', v_count, 'total_amount', v_total));

  RETURN NEXT v_close;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_revenue_period(p_lot_id uuid, p_period_month date, p_reason text)
RETURNS SETOF public.revenue_period_closes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_close public.revenue_period_closes%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  IF v_actor.role <> 'admin' THEN
    RAISE EXCEPTION '마감 해제는 관리자만 할 수 있습니다' USING ERRCODE = '42501';
  END IF;
  IF length(trim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION '마감 해제 사유를 구체적으로 입력해주세요' USING ERRCODE = '22023';
  END IF;

  UPDATE public.revenue_period_closes
  SET is_closed = false, reopened_by = v_actor.id, reopened_at = now(), reopen_reason = trim(p_reason)
  WHERE lot_id = p_lot_id AND period_month = date_trunc('month', p_period_month)::date AND is_closed = true
  RETURNING * INTO v_close;

  IF v_close.id IS NULL THEN
    RAISE EXCEPTION '마감된 기간을 찾을 수 없습니다' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.activity_logs (user_id, user_name, module, action, target_type, target_id, target_name, details)
  VALUES (v_actor.id, v_actor.name, 'REVENUE', 'period_reopen', 'parking_lot', p_lot_id,
          v_close.period_month::text, jsonb_build_object('reason', trim(p_reason)));

  RETURN NEXT v_close;
END;
$$;

CREATE OR REPLACE FUNCTION public.handoff_contract_to_service(p_contract_id uuid, p_supervisor_id uuid DEFAULT NULL)
RETURNS SETOF public.service_projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_contract public.bid_contracts%ROWTYPE;
  v_bid public.bid_projects%ROWTYPE;
  v_service public.service_projects%ROWTYPE;
  v_project_number text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_module_active('PROCUREMENT') OR NOT public.is_module_active('SERVICE') THEN
    RAISE EXCEPTION '입찰관리와 용역관리 모듈이 모두 활성화되어야 합니다' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  IF v_actor.role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION '계약 인계 권한이 없습니다' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_contract FROM public.bid_contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_contract.id IS NULL OR v_contract.status <> 'active' OR v_contract.signed_at IS NULL THEN
    RAISE EXCEPTION '서명 완료된 유효 계약만 인계할 수 있습니다' USING ERRCODE = '22023';
  END IF;

  IF v_contract.service_project_id IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.service_projects WHERE id = v_contract.service_project_id;
    RETURN;
  END IF;

  SELECT * INTO v_bid FROM public.bid_projects WHERE id = v_contract.bid_project_id;
  v_project_number := left('SV-' || v_contract.contract_number, 50);

  INSERT INTO public.service_projects (
    title, project_number, lot_id, bid_contract_id, budget_item_id, service_type, service_category,
    description, scope_of_work, contractor_name, contractor_business_number,
    contractor_representative, contractor_address, contractor_phone, contractor_email,
    supervisor_id, contract_amount, vat_amount, total_amount, contract_date,
    start_date, end_date, work_days, warranty_months, warranty_end, status, created_by
  ) VALUES (
    v_bid.title, v_project_number, v_bid.lot_id, v_contract.id, v_bid.budget_item_id,
    COALESCE(v_bid.bid_type, 'other'), v_bid.category, v_bid.description, v_bid.scope_of_work,
    v_contract.contractor_name, v_contract.contractor_business_number,
    v_contract.contractor_representative, v_contract.contractor_address,
    v_contract.contractor_phone, v_contract.contractor_email, p_supervisor_id,
    v_contract.contract_amount, v_contract.vat_amount, v_contract.total_amount,
    v_contract.contract_date, v_contract.contract_start, v_contract.contract_end,
    v_contract.work_days, v_contract.warranty_months, v_contract.warranty_end, 'preparing', v_actor.id
  ) RETURNING * INTO v_service;

  UPDATE public.bid_contracts SET service_project_id = v_service.id WHERE id = v_contract.id;
  UPDATE public.bid_projects SET status = 'contracted' WHERE id = v_bid.id;

  INSERT INTO public.activity_logs (user_id, user_name, module, action, target_type, target_id, target_name, details)
  VALUES (v_actor.id, v_actor.name, 'PROCUREMENT', 'handoff_to_service', 'bid_contract', v_contract.id,
          v_contract.contract_number, jsonb_build_object('service_project_id', v_service.id));

  RETURN NEXT v_service;
END;
$$;

REVOKE ALL ON FUNCTION public.close_revenue_period(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_revenue_period(uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handoff_contract_to_service(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_revenue_period(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_revenue_period(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handoff_contract_to_service(uuid, uuid) TO authenticated;
