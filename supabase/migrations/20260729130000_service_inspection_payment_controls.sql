-- Inspection, correction, reinspection, and payment controls.

CREATE OR REPLACE FUNCTION public.create_service_inspection(
  p_project_id uuid,
  p_inspection_type text,
  p_title text,
  p_inspection_date date,
  p_target_amount bigint
)
RETURNS SETOF public.service_inspections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_project public.service_projects%ROWTYPE;
  v_seq integer;
  v_inspection public.service_inspections%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  SELECT * INTO v_project FROM public.service_projects WHERE id = p_project_id FOR UPDATE;
  IF v_actor.role NOT IN ('admin', 'manager', 'editor') OR v_project.id IS NULL THEN
    RAISE EXCEPTION '검수를 생성할 권한이 없거나 사업을 찾을 수 없습니다' USING ERRCODE = '42501';
  END IF;
  IF p_target_amount <= 0 OR length(trim(COALESCE(p_title, ''))) = 0 THEN
    RAISE EXCEPTION '검수명과 대상금액을 입력해주세요' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(inspection_seq), 0) + 1 INTO v_seq
  FROM public.service_inspections WHERE project_id = p_project_id;

  INSERT INTO public.service_inspections (
    project_id, inspection_number, inspection_type, inspection_seq, title,
    inspection_date, inspector_id, inspector_name, target_amount, status
  ) VALUES (
    p_project_id,
    left('IN-' || replace(v_project.project_number, ' ', '') || '-' || lpad(v_seq::text, 2, '0'), 30),
    p_inspection_type, v_seq, trim(p_title), p_inspection_date,
    v_actor.id, v_actor.name, p_target_amount, 'pending'
  ) RETURNING * INTO v_inspection;

  RETURN NEXT v_inspection;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_service_inspection(
  p_inspection_id uuid,
  p_action text,
  p_note text DEFAULT NULL,
  p_correction_deadline date DEFAULT NULL,
  p_deduction_amount bigint DEFAULT 0
)
RETURNS SETOF public.service_inspections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_inspection public.service_inspections%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  SELECT * INTO v_inspection FROM public.service_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF v_actor.id IS NULL OR v_inspection.id IS NULL THEN
    RAISE EXCEPTION '사용자 또는 검수를 찾을 수 없습니다' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'submit_correction' THEN
    IF v_actor.role NOT IN ('admin', 'manager', 'editor') OR v_inspection.status <> 'correction_required' THEN
      RAISE EXCEPTION '보완자료를 제출할 수 없습니다' USING ERRCODE = '42501';
    END IF;
    IF length(trim(COALESCE(p_note, ''))) = 0 THEN
      RAISE EXCEPTION '보완 내용을 입력해주세요' USING ERRCODE = '22023';
    END IF;
    UPDATE public.service_inspections
    SET status = 'correction_submitted',
        correction_submitted_at = now(),
        result_note = trim(p_note)
    WHERE id = p_inspection_id RETURNING * INTO v_inspection;
  ELSE
    IF v_actor.role NOT IN ('admin', 'manager') OR v_inspection.status NOT IN ('pending', 'correction_submitted') THEN
      RAISE EXCEPTION '검수 결과를 처리할 권한이 없습니다' USING ERRCODE = '42501';
    END IF;

    IF p_action = 'approve' THEN
      IF p_deduction_amount < 0 OR p_deduction_amount > v_inspection.target_amount THEN
        RAISE EXCEPTION '공제금액이 올바르지 않습니다' USING ERRCODE = '22023';
      END IF;
      UPDATE public.service_inspections
      SET status = 'approved', result = 'pass', result_note = NULLIF(trim(COALESCE(p_note, '')), ''),
          deduction_amount = p_deduction_amount,
          approved_amount = target_amount - p_deduction_amount,
          approved_by = v_actor.id, approved_at = now(),
          correction_verified = CASE WHEN status = 'correction_submitted' THEN true ELSE correction_verified END,
          correction_verified_by = CASE WHEN status = 'correction_submitted' THEN v_actor.id ELSE correction_verified_by END,
          correction_verified_at = CASE WHEN status = 'correction_submitted' THEN now() ELSE correction_verified_at END
      WHERE id = p_inspection_id RETURNING * INTO v_inspection;
    ELSIF p_action = 'require_correction' THEN
      IF length(trim(COALESCE(p_note, ''))) = 0 OR p_correction_deadline IS NULL THEN
        RAISE EXCEPTION '보완 사유와 기한을 입력해주세요' USING ERRCODE = '22023';
      END IF;
      UPDATE public.service_inspections
      SET status = 'correction_required', result = 'conditional', deficiency_note = trim(p_note),
          correction_deadline = p_correction_deadline
      WHERE id = p_inspection_id RETURNING * INTO v_inspection;
    ELSE
      RAISE EXCEPTION '지원하지 않는 검수 명령입니다' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.activity_logs (user_id, user_name, module, action, target_type, target_id, target_name, details)
  VALUES (v_actor.id, v_actor.name, 'SERVICE', 'inspection_' || p_action, 'service_inspection',
          v_inspection.id, v_inspection.inspection_number, jsonb_build_object('note', p_note, 'deadline', p_correction_deadline));
  RETURN NEXT v_inspection;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_service_payment(
  p_inspection_id uuid,
  p_payment_type text,
  p_due_date date DEFAULT NULL
)
RETURNS SETOF public.service_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_inspection public.service_inspections%ROWTYPE;
  v_project public.service_projects%ROWTYPE;
  v_seq integer;
  v_payment public.service_payments%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  SELECT * INTO v_inspection FROM public.service_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF v_actor.role NOT IN ('admin', 'manager') OR v_inspection.status <> 'approved' THEN
    RAISE EXCEPTION '승인된 검수만 지급 요청할 수 있습니다' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_payments WHERE inspection_id = p_inspection_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION '이미 지급 요청이 생성된 검수입니다' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_project FROM public.service_projects WHERE id = v_inspection.project_id FOR UPDATE;
  SELECT COALESCE(MAX(payment_seq), 0) + 1 INTO v_seq
  FROM public.service_payments WHERE project_id = v_project.id;

  INSERT INTO public.service_payments (
    project_id, inspection_id, payment_number, payment_type, payment_seq, title,
    gross_amount, request_date, due_date, status, created_by
  ) VALUES (
    v_project.id, v_inspection.id,
    left('PAY-' || replace(v_project.project_number, ' ', '') || '-' || lpad(v_seq::text, 2, '0'), 30),
    p_payment_type, v_seq, v_inspection.title,
    COALESCE(v_inspection.approved_amount, v_inspection.target_amount),
    CURRENT_DATE, COALESCE(p_due_date, CURRENT_DATE + 14), 'requested', v_actor.id
  ) RETURNING * INTO v_payment;

  RETURN NEXT v_payment;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_service_payment(p_payment_id uuid, p_action text)
RETURNS SETOF public.service_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%ROWTYPE;
  v_payment public.service_payments%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid() AND is_active = true;
  SELECT * INTO v_payment FROM public.service_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_actor.role NOT IN ('admin', 'manager') OR v_payment.id IS NULL THEN
    RAISE EXCEPTION '지급을 처리할 권한이 없습니다' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'approve' AND v_payment.status IN ('requested', 'reviewing') THEN
    UPDATE public.service_payments SET status = 'approved', approved_by = v_actor.id, approved_at = now()
    WHERE id = p_payment_id RETURNING * INTO v_payment;
  ELSIF p_action = 'pay' AND v_payment.status = 'approved' THEN
    UPDATE public.service_payments SET status = 'paid', paid_date = CURRENT_DATE, paid_amount = net_amount
    WHERE id = p_payment_id RETURNING * INTO v_payment;
  ELSE
    RAISE EXCEPTION '현재 상태에서는 지급 명령을 수행할 수 없습니다' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.activity_logs (user_id, user_name, module, action, target_type, target_id, target_name)
  VALUES (v_actor.id, v_actor.name, 'SERVICE', 'payment_' || p_action, 'service_payment', v_payment.id, v_payment.payment_number);
  RETURN NEXT v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.create_service_inspection(uuid, text, text, date, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_service_inspection(uuid, text, text, date, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_service_payment(uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_service_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_service_inspection(uuid, text, text, date, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_service_inspection(uuid, text, text, date, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_service_payment(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_service_payment(uuid, text) TO authenticated;
