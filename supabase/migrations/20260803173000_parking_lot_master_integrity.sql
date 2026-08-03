-- Preserve parking-lot master history. Public-sector operational records must
-- be closed or transferred, never physically deleted with their child data.

ALTER TABLE public.parking_lots
  ADD COLUMN IF NOT EXISTS normalized_code TEXT
    GENERATED ALWAYS AS (regexp_replace(upper(code), '[^0-9A-Z가-힣]', '', 'g')) STORED,
  ADD COLUMN IF NOT EXISTS row_version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS owner_team TEXT NOT NULL DEFAULT '제주시청 차량관리과 운영팀',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS parking_lots_normalized_code_unique
  ON public.parking_lots(normalized_code);

CREATE OR REPLACE FUNCTION public.protect_parking_lot_master()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION '주차장 코드는 연계 기준값이므로 변경할 수 없습니다.';
  END IF;
  NEW.row_version := OLD.row_version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parking_lots_master_guard ON public.parking_lots;
CREATE TRIGGER parking_lots_master_guard
BEFORE UPDATE ON public.parking_lots
FOR EACH ROW EXECUTE FUNCTION public.protect_parking_lot_master();

DROP POLICY IF EXISTS "lots_delete" ON public.parking_lots;
DROP POLICY IF EXISTS "parking_lots_delete" ON public.parking_lots;

CREATE TABLE IF NOT EXISTS public.parking_lot_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id UUID NOT NULL REFERENCES public.parking_lots(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('opened','suspended','reopened','closed','transferred','merged')),
  effective_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) >= 5),
  official_document_id UUID NOT NULL REFERENCES public.code_master(id),
  successor_lot_id UUID REFERENCES public.parking_lots(id),
  previous_status public.lot_status_enum,
  next_status public.lot_status_enum NOT NULL,
  performed_by UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (successor_lot_id IS NULL OR successor_lot_id <> lot_id)
);

CREATE INDEX IF NOT EXISTS parking_lot_lifecycle_lot_date_idx
  ON public.parking_lot_lifecycle_events(lot_id, effective_date DESC, created_at DESC);

ALTER TABLE public.parking_lot_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parking_lot_lifecycle_select ON public.parking_lot_lifecycle_events;
CREATE POLICY parking_lot_lifecycle_select ON public.parking_lot_lifecycle_events
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS parking_lot_lifecycle_insert ON public.parking_lot_lifecycle_events;
CREATE POLICY parking_lot_lifecycle_insert ON public.parking_lot_lifecycle_events
FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin', 'manager')
  AND performed_by = auth.uid()
);

COMMENT ON COLUMN public.parking_lots.row_version IS 'Optimistic concurrency version for mobile and offline updates.';
COMMENT ON TABLE public.parking_lot_lifecycle_events IS 'Document-backed opening, suspension, closure, transfer, and merge history.';
