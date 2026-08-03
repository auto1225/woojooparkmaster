-- Make team work a real operational registry instead of code-master metadata.
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
  document_id UUID REFERENCES public.code_master(id),
  document_number TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_work_records
  ADD COLUMN IF NOT EXISTS lot_type_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_name TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS source_module TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id UUID,
  ADD COLUMN IF NOT EXISTS source_path TEXT,
  ADD COLUMN IF NOT EXISTS client_mutation_id UUID,
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.team_work_records ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_work_client_mutation
  ON public.team_work_records(client_mutation_id) WHERE client_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_work_type_status ON public.team_work_records(record_type, status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_work_owner_due ON public.team_work_records(owner_id, due_date) WHERE status <> 'completed' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_work_lot ON public.team_work_records(lot_id, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_work_source ON public.team_work_records(source_module, source_record_id) WHERE source_record_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_work_active_source
  ON public.team_work_records(source_module, source_record_id, record_type)
  WHERE source_record_id IS NOT NULL AND archived_at IS NULL;

INSERT INTO public.team_work_records (
  id, record_number, record_type, team, title, category, lot_id, parking_lot_name,
  owner_id, owner_name, priority, status, due_date, amount, document_id, document_number, payload,
  reviewer_name, next_action, hold_reason, source_module, source_record_id, source_path,
  created_at, updated_at
)
SELECT
  cm.id,
  COALESCE(cm.extra->>'record_number', cm.name_en, cm.code),
  cm.extra->>'record_type',
  COALESCE(cm.extra->>'team', 'operations'),
  COALESCE(cm.extra->>'title', cm.name_ko),
  COALESCE(cm.extra->>'category', '기타'),
  CASE WHEN COALESCE(cm.extra->>'parking_lot_id', '') ~* '^[0-9a-f-]{36}$' THEN (cm.extra->>'parking_lot_id')::uuid ELSE NULL END,
  NULLIF(cm.extra->>'parking_lot', ''),
  CASE WHEN COALESCE(cm.extra->>'owner_id', '') ~* '^[0-9a-f-]{36}$' THEN (cm.extra->>'owner_id')::uuid ELSE NULL END,
  NULLIF(cm.extra->>'owner_name', ''),
  COALESCE(cm.extra->>'priority', 'normal'),
  COALESCE(cm.extra->>'status', 'registered'),
  CASE WHEN COALESCE(cm.extra->>'due_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (cm.extra->>'due_date')::date ELSE NULL END,
  COALESCE((cm.extra->>'amount')::bigint, 0),
  doc.id,
  NULLIF(cm.extra->>'document_number', ''),
  COALESCE(cm.extra->'payload', '{}'::jsonb),
  NULLIF(cm.extra->>'reviewer_name', ''),
  NULLIF(cm.extra->>'next_action', ''),
  NULLIF(cm.extra->>'hold_reason', ''),
  NULLIF(cm.extra->>'source_module', ''),
  CASE WHEN COALESCE(cm.extra->>'source_record_id', '') ~* '^[0-9a-f-]{36}$' THEN (cm.extra->>'source_record_id')::uuid ELSE NULL END,
  NULLIF(cm.extra->>'source_path', ''),
  cm.created_at,
  COALESCE((cm.extra->>'updated_at')::timestamptz, cm.created_at)
FROM public.code_master cm
LEFT JOIN public.code_master doc ON doc.group_code = 'OFFICIAL_DOCUMENT' AND doc.is_active = true
  AND COALESCE(doc.extra->>'normalized_number', '') = regexp_replace(upper(cm.extra->>'document_number'), '[^0-9A-Z가-힣]', '', 'g')
WHERE cm.group_code = 'TEAM_WORK_RECORD' AND cm.is_active = true
  AND cm.extra->>'record_type' IN ('work_order','revenue_close','receivable_discount','workforce','capital_project','compliance')
ON CONFLICT (record_number) DO NOTHING;

-- Resolve only unambiguous legacy single-lot labels. Multi-lot and organization-wide
-- records remain unassigned so an operator can select the correct operational scope.
ALTER TABLE public.team_work_records DISABLE TRIGGER USER;
WITH lot_matches AS (
  SELECT
    tw.id AS work_id,
    p.id AS lot_id,
    p.lot_type,
    ROW_NUMBER() OVER (PARTITION BY tw.id ORDER BY length(p.name) DESC) AS match_rank
  FROM public.team_work_records tw
  JOIN public.parking_lots p ON (
    regexp_replace(replace(replace(upper(tw.parking_lot_name), '공영주차장', ''), '제주', ''), '[^0-9A-Z가-힣]', '', 'g')
      LIKE '%' || regexp_replace(replace(replace(upper(p.name), '공영주차장', ''), '제주', ''), '[^0-9A-Z가-힣]', '', 'g') || '%'
    OR regexp_replace(replace(replace(upper(p.name), '공영주차장', ''), '제주', ''), '[^0-9A-Z가-힣]', '', 'g')
      LIKE '%' || regexp_replace(replace(replace(upper(tw.parking_lot_name), '공영주차장', ''), '제주', ''), '[^0-9A-Z가-힣]', '', 'g') || '%'
  )
  WHERE tw.lot_id IS NULL
    AND NULLIF(BTRIM(tw.parking_lot_name), '') IS NOT NULL
    AND tw.parking_lot_name !~ '(·|외\s*[0-9]|[0-9]+개소|통합)'
)
UPDATE public.team_work_records tw
SET lot_id = matches.lot_id,
    lot_type_snapshot = matches.lot_type
FROM lot_matches matches
WHERE tw.id = matches.work_id AND matches.match_rank = 1;

UPDATE public.team_work_records tw
SET lot_type_snapshot = lots.lot_type::text
FROM public.parking_lots lots
WHERE tw.lot_id = lots.id
  AND tw.lot_type_snapshot IS DISTINCT FROM lots.lot_type::text;
ALTER TABLE public.team_work_records ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION public.enforce_team_work_workflow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  allowed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSE
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
    NEW.row_version := OLD.row_version + 1;
    NEW.updated_at := now();
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      allowed := CASE OLD.status
        WHEN 'registered' THEN NEW.status IN ('assigned', 'on_hold')
        WHEN 'assigned' THEN NEW.status IN ('in_progress', 'on_hold')
        WHEN 'in_progress' THEN NEW.status IN ('review', 'on_hold')
        WHEN 'review' THEN NEW.status IN ('completed', 'in_progress', 'on_hold')
        WHEN 'on_hold' THEN NEW.status IN ('assigned', 'in_progress')
        ELSE false
      END;
      IF NOT allowed THEN RAISE EXCEPTION '허용되지 않은 업무 상태 변경입니다: % -> %', OLD.status, NEW.status; END IF;
    END IF;
  END IF;
  IF NEW.status IN ('assigned','in_progress','review','completed') AND NEW.owner_id IS NULL AND NULLIF(BTRIM(NEW.owner_name), '') IS NULL THEN
    RAISE EXCEPTION '담당자를 먼저 지정해 주세요.';
  END IF;
  IF NEW.status IN ('assigned','in_progress','review','completed') AND NEW.due_date IS NULL THEN RAISE EXCEPTION '처리기한을 입력해 주세요.'; END IF;
  IF NEW.status IN ('review','completed') AND NULLIF(BTRIM(NEW.reviewer_name), '') IS NULL THEN RAISE EXCEPTION '검토자를 입력해 주세요.'; END IF;
  IF NEW.status = 'on_hold' AND NULLIF(BTRIM(NEW.hold_reason), '') IS NULL THEN
    RAISE EXCEPTION '보류 사유를 입력해 주세요.';
  END IF;
  IF NEW.status = 'completed' AND (CASE NEW.record_type
       WHEN 'work_order' THEN NULLIF(BTRIM(NEW.payload->>'evidence'), '') IS NULL
       WHEN 'revenue_close' THEN NULLIF(BTRIM(NEW.payload->>'sealNumber'), '') IS NULL
       WHEN 'receivable_discount' THEN COALESCE(NULLIF(BTRIM(NEW.payload->>'evidence'), ''), NULLIF(BTRIM(NEW.payload->>'action'), '')) IS NULL
       WHEN 'workforce' THEN NULLIF(BTRIM(NEW.payload->>'note'), '') IS NULL
       WHEN 'capital_project' THEN NEW.document_id IS NULL OR NULLIF(BTRIM(NEW.payload->>'nextGate'), '') IS NULL
       WHEN 'compliance' THEN COALESCE(NULLIF(BTRIM(NEW.payload->>'result'), ''), NULLIF(BTRIM(NEW.payload->>'evidence'), '')) IS NULL
       ELSE true END) THEN
    RAISE EXCEPTION '완료하려면 문서 또는 완료 근거를 입력해 주세요.';
  END IF;
  NEW.completed_at := CASE WHEN NEW.status = 'completed' THEN COALESCE(NEW.completed_at, now()) ELSE NULL END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_work_updated ON public.team_work_records;
DROP TRIGGER IF EXISTS trg_team_work_workflow ON public.team_work_records;
CREATE TRIGGER trg_team_work_workflow BEFORE INSERT OR UPDATE ON public.team_work_records
FOR EACH ROW EXECUTE FUNCTION public.enforce_team_work_workflow();

ALTER TABLE public.team_work_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_work_select ON public.team_work_records;
DROP POLICY IF EXISTS team_work_insert ON public.team_work_records;
DROP POLICY IF EXISTS team_work_update ON public.team_work_records;
DROP POLICY IF EXISTS team_work_delete ON public.team_work_records;
CREATE POLICY team_work_select ON public.team_work_records FOR SELECT TO authenticated USING (true);
CREATE POLICY team_work_insert ON public.team_work_records FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin','manager') OR (public.get_user_role(auth.uid()) = 'editor' AND team = public.get_user_team(auth.uid())::text)
);
CREATE POLICY team_work_update ON public.team_work_records FOR UPDATE TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin','manager') OR (public.get_user_role(auth.uid()) = 'editor' AND team = public.get_user_team(auth.uid())::text)
) WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin','manager') OR (public.get_user_role(auth.uid()) = 'editor' AND team = public.get_user_team(auth.uid())::text)
);
CREATE POLICY team_work_delete ON public.team_work_records FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) IN ('admin','manager'));

COMMENT ON TABLE public.team_work_records IS '차량관리과 운영팀·시설팀 공통 업무 원장. 문서·주차장·담당자·원본업무 FK 연계 및 모바일 충돌 감지를 포함한다.';
