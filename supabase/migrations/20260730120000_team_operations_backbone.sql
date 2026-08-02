-- Shared workflow envelope for Jeju City Hall vehicle management operations and facilities teams.
CREATE TABLE IF NOT EXISTS public.team_work_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_number VARCHAR(40) NOT NULL UNIQUE,
  record_type VARCHAR(30) NOT NULL CHECK (record_type IN ('work_order','revenue_close','receivable_discount','workforce','capital_project','compliance')),
  team VARCHAR(20) NOT NULL CHECK (team IN ('operations','facilities')),
  title VARCHAR(300) NOT NULL,
  category VARCHAR(100) NOT NULL,
  lot_id UUID REFERENCES public.parking_lots(id),
  parking_lot_name VARCHAR(200),
  owner_id UUID REFERENCES public.profiles(id),
  owner_name VARCHAR(100),
  priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','high','normal','low')),
  status VARCHAR(20) NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','assigned','in_progress','review','completed','on_hold')),
  due_date DATE,
  amount BIGINT NOT NULL DEFAULT 0,
  document_id UUID REFERENCES public.official_documents(id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_work_type_status ON public.team_work_records(record_type, status);
CREATE INDEX IF NOT EXISTS idx_team_work_owner_due ON public.team_work_records(owner_id, due_date) WHERE status <> 'completed';
CREATE INDEX IF NOT EXISTS idx_team_work_lot ON public.team_work_records(lot_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_team_work_updated ON public.team_work_records;
CREATE TRIGGER trg_team_work_updated BEFORE UPDATE ON public.team_work_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.team_work_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_work_select" ON public.team_work_records FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "team_work_insert" ON public.team_work_records FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','manager','editor') AND created_by = auth.uid());
CREATE POLICY "team_work_update" ON public.team_work_records FOR UPDATE USING (public.get_user_role(auth.uid()) IN ('admin','manager','editor')) WITH CHECK (public.get_user_role(auth.uid()) IN ('admin','manager','editor'));
CREATE POLICY "team_work_delete" ON public.team_work_records FOR DELETE USING (public.get_user_role(auth.uid()) IN ('admin','manager'));

COMMENT ON TABLE public.team_work_records IS '차량관리과 운영팀·시설팀 공통 업무 흐름과 유형별 상세 payload';
