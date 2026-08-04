-- Promote the duty catalog to an accountable assignment registry.
CREATE TABLE IF NOT EXISTS public.team_duty_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_code TEXT NOT NULL UNIQUE,
  team TEXT NOT NULL CHECK (team IN ('operations', 'facilities')),
  area TEXT NOT NULL,
  role_name TEXT NOT NULL DEFAULT '주무관',
  phone TEXT,
  duties JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(duties) = 'array'),
  record_type TEXT NOT NULL CHECK (record_type IN ('work_order','revenue_close','receivable_discount','workforce','capital_project','compliance')),
  category TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT '/team-work',
  destination_label TEXT NOT NULL DEFAULT '팀 업무관리',
  primary_assignee_id UUID REFERENCES public.profiles(id),
  deputy_assignee_id UUID REFERENCES public.profiles(id),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  lot_types TEXT[] NOT NULL DEFAULT ARRAY['offstreet','multilevel','onstreet']::TEXT[],
  document_id UUID REFERENCES public.code_master(id),
  document_number TEXT,
  assignment_status TEXT NOT NULL DEFAULT 'active' CHECK (assignment_status IN ('active','handover_pending','temporary')),
  handover_due_date DATE,
  handover_note TEXT,
  change_reason TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  archived_at TIMESTAMPTZ,
  archive_reason TEXT,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (cardinality(lot_types) > 0),
  CHECK (lot_types <@ ARRAY['offstreet','multilevel','onstreet']::TEXT[])
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_team_duty_active_area
  ON public.team_duty_records(team, lower(area)) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_duty_team_status
  ON public.team_duty_records(team, assignment_status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_duty_assignee
  ON public.team_duty_records(primary_assignee_id, effective_to) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_team_duty_lot_types
  ON public.team_duty_records USING gin(lot_types);

INSERT INTO public.team_duty_records (
  id, duty_code, team, area, role_name, phone, duties, record_type, category,
  destination, destination_label, primary_assignee_id, deputy_assignee_id,
  effective_from, effective_to, lot_types, document_id, document_number,
  assignment_status, handover_due_date, handover_note, change_reason,
  archived_at, archive_reason, created_at, updated_at
)
SELECT
  cm.id,
  cm.code,
  COALESCE(cm.extra->>'team', 'operations'),
  COALESCE(NULLIF(cm.extra->>'area', ''), cm.name_ko),
  COALESCE(NULLIF(cm.extra->>'role', ''), '주무관'),
  COALESCE(NULLIF(cm.extra->>'phone', ''), NULLIF(cm.name_en, '')),
  COALESCE(cm.extra->'duties', '[]'::jsonb),
  COALESCE(NULLIF(cm.extra->>'record_type', ''), 'work_order'),
  COALESCE(NULLIF(cm.extra->>'category', ''), '기타'),
  COALESCE(NULLIF(cm.extra->>'destination', ''), '/team-work'),
  COALESCE(NULLIF(cm.extra->>'destination_label', ''), '팀 업무관리'),
  CASE WHEN COALESCE(cm.extra->>'primary_assignee_id', '') ~* '^[0-9a-f-]{36}$' THEN (cm.extra->>'primary_assignee_id')::uuid END,
  CASE WHEN COALESCE(cm.extra->>'deputy_assignee_id', '') ~* '^[0-9a-f-]{36}$' THEN (cm.extra->>'deputy_assignee_id')::uuid END,
  CASE WHEN COALESCE(cm.extra->>'effective_from', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (cm.extra->>'effective_from')::date ELSE cm.created_at::date END,
  CASE WHEN COALESCE(cm.extra->>'effective_to', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (cm.extra->>'effective_to')::date END,
  CASE
    WHEN jsonb_typeof(cm.extra->'lot_types') = 'array' AND jsonb_array_length(cm.extra->'lot_types') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(cm.extra->'lot_types'))
    ELSE ARRAY['offstreet','multilevel','onstreet']::TEXT[]
  END,
  doc.id,
  NULLIF(cm.extra->>'document_number', ''),
  COALESCE(NULLIF(cm.extra->>'assignment_status', ''), 'active'),
  CASE WHEN COALESCE(cm.extra->>'handover_due_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (cm.extra->>'handover_due_date')::date END,
  NULLIF(cm.extra->>'handover_note', ''),
  NULLIF(cm.extra->>'change_reason', ''),
  CASE WHEN cm.is_active THEN NULL ELSE COALESCE(NULLIF(cm.extra->>'updated_at', '')::timestamptz, cm.created_at) END,
  CASE WHEN cm.is_active THEN NULL ELSE '기존 업무분장 보관 자료 이관' END,
  cm.created_at,
  COALESCE(NULLIF(cm.extra->>'updated_at', '')::timestamptz, cm.created_at)
FROM public.code_master cm
LEFT JOIN public.code_master doc ON doc.group_code = 'OFFICIAL_DOCUMENT'
  AND doc.is_active = true
  AND COALESCE(doc.extra->>'normalized_number', '') = regexp_replace(upper(cm.extra->>'document_number'), '[^0-9A-Z가-힣]', '', 'g')
WHERE cm.group_code = 'TEAM_DUTY_ASSIGNMENT'
ON CONFLICT (duty_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_team_duty_record()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSE
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
    NEW.row_version := OLD.row_version + 1;
    NEW.updated_at := now();
  END IF;
  IF NEW.assignment_status = 'handover_pending' AND (NEW.deputy_assignee_id IS NULL OR NEW.handover_due_date IS NULL OR NULLIF(BTRIM(NEW.handover_note), '') IS NULL) THEN
    RAISE EXCEPTION '인수인계 대상자, 기한, 인계 내용을 입력해 주세요.';
  END IF;
  IF NEW.deputy_assignee_id IS NOT NULL AND NEW.deputy_assignee_id = NEW.primary_assignee_id THEN
    RAISE EXCEPTION '실제 담당자와 대체·인수 담당자는 서로 달라야 합니다.';
  END IF;
  IF NEW.assignment_status = 'temporary' AND (NEW.deputy_assignee_id IS NULL OR NEW.effective_to IS NULL) THEN
    RAISE EXCEPTION '대체 담당자와 종료일을 입력해 주세요.';
  END IF;
  IF NEW.document_id IS NOT NULL AND NULLIF(BTRIM(NEW.document_number), '') IS NULL THEN
    RAISE EXCEPTION '근거 문서번호를 입력해 주세요.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_duty_record ON public.team_duty_records;
CREATE TRIGGER trg_team_duty_record BEFORE INSERT OR UPDATE ON public.team_duty_records
FOR EACH ROW EXECUTE FUNCTION public.enforce_team_duty_record();

ALTER TABLE public.team_duty_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_duty_select ON public.team_duty_records;
DROP POLICY IF EXISTS team_duty_insert ON public.team_duty_records;
DROP POLICY IF EXISTS team_duty_update ON public.team_duty_records;
DROP POLICY IF EXISTS team_duty_delete ON public.team_duty_records;
CREATE POLICY team_duty_select ON public.team_duty_records FOR SELECT TO authenticated USING (true);
CREATE POLICY team_duty_insert ON public.team_duty_records FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin','manager')
  OR (public.get_user_role(auth.uid()) = 'editor' AND team = public.get_user_team(auth.uid())::text)
);
CREATE POLICY team_duty_update ON public.team_duty_records FOR UPDATE TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin','manager')
  OR (public.get_user_role(auth.uid()) = 'editor' AND team = public.get_user_team(auth.uid())::text)
) WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin','manager')
  OR (public.get_user_role(auth.uid()) = 'editor' AND team = public.get_user_team(auth.uid())::text)
);
CREATE POLICY team_duty_delete ON public.team_duty_records FOR DELETE TO authenticated USING (public.get_user_role(auth.uid()) = 'admin');

COMMENT ON TABLE public.team_duty_records IS '차량관리과 업무분장 책임 원장. 실제 담당자·대체자·효력기간·문서·주차장 유형·인수인계를 관리한다.';
