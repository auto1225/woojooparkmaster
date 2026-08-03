-- Promote scanned business cards to a governed operational contact registry.
CREATE TABLE IF NOT EXISTS public.business_card_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number TEXT NOT NULL UNIQUE,
  name TEXT,
  company TEXT,
  department TEXT,
  position TEXT,
  mobile TEXT,
  phone TEXT,
  fax TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  raw_text TEXT,
  retain_ocr_text BOOLEAN NOT NULL DEFAULT false,
  memo TEXT,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  image_path TEXT,
  image_name TEXT,
  business_category TEXT NOT NULL DEFAULT 'other'
    CHECK (business_category IN ('facility','service','operations','procurement','complaint','public','other')),
  lot_types TEXT[] NOT NULL DEFAULT ARRAY['offstreet','multilevel','onstreet']::TEXT[],
  preferred_channel TEXT NOT NULL DEFAULT 'mobile'
    CHECK (preferred_channel IN ('mobile','office','email')),
  emergency_contact BOOLEAN NOT NULL DEFAULT false,
  collection_source TEXT NOT NULL DEFAULT 'business_card'
    CHECK (collection_source IN ('business_card','manual','email_signature','official_document','other')),
  business_purpose TEXT NOT NULL DEFAULT '공영주차장 업무 연락',
  last_verified_at DATE,
  retention_review_date DATE,
  ocr_completeness INTEGER NOT NULL DEFAULT 0 CHECK (ocr_completeness BETWEEN 0 AND 100),
  owning_team TEXT,
  client_request_id UUID UNIQUE,
  normalized_mobile TEXT,
  normalized_email TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  archived_at TIMESTAMPTZ,
  archive_reason TEXT,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NULLIF(BTRIM(COALESCE(name, '')), '') IS NOT NULL OR NULLIF(BTRIM(COALESCE(company, '')), '') IS NOT NULL),
  CHECK (NULLIF(BTRIM(COALESCE(mobile, '')), '') IS NOT NULL OR NULLIF(BTRIM(COALESCE(phone, '')), '') IS NOT NULL OR NULLIF(BTRIM(COALESCE(email, '')), '') IS NOT NULL),
  CHECK (cardinality(lot_types) > 0),
  CHECK (lot_types <@ ARRAY['offstreet','multilevel','onstreet']::TEXT[])
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_card_active_mobile
  ON public.business_card_records(normalized_mobile)
  WHERE archived_at IS NULL AND normalized_mobile IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_card_active_email
  ON public.business_card_records(normalized_email)
  WHERE archived_at IS NULL AND normalized_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_business_card_company
  ON public.business_card_records(lower(company)) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_business_card_category
  ON public.business_card_records(business_category, last_verified_at) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_business_card_lot_types
  ON public.business_card_records USING gin(lot_types);

CREATE TABLE IF NOT EXISTS public.business_card_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.business_card_records(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_label TEXT NOT NULL,
  record_path TEXT NOT NULL,
  company_name TEXT,
  relation_type TEXT NOT NULL DEFAULT 'company_contact'
    CHECK (relation_type IN ('company_contact','project_manager','emergency','reference')),
  lot_id UUID REFERENCES public.parking_lots(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(card_id, module, record_id)
);

CREATE INDEX IF NOT EXISTS idx_business_card_links_card
  ON public.business_card_links(card_id);
CREATE INDEX IF NOT EXISTS idx_business_card_links_record
  ON public.business_card_links(module, record_id);
CREATE INDEX IF NOT EXISTS idx_business_card_links_lot
  ON public.business_card_links(lot_id) WHERE lot_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_business_card_record()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  NEW.normalized_mobile := NULLIF(regexp_replace(COALESCE(NEW.mobile, ''), '[^0-9]', '', 'g'), '');
  NEW.normalized_email := NULLIF(lower(BTRIM(COALESCE(NEW.email, ''))), '');
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    NEW.last_verified_at := COALESCE(NEW.last_verified_at, CURRENT_DATE);
    NEW.retention_review_date := COALESCE(NEW.retention_review_date, CURRENT_DATE + 1095);
    NEW.owning_team := COALESCE(NEW.owning_team, public.get_user_team(auth.uid())::text);
  ELSE
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
    NEW.row_version := OLD.row_version + 1;
    NEW.updated_at := now();
  END IF;
  IF NOT NEW.retain_ocr_text THEN
    NEW.raw_text := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_card_record ON public.business_card_records;
CREATE TRIGGER trg_business_card_record BEFORE INSERT OR UPDATE ON public.business_card_records
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_card_record();

INSERT INTO public.business_card_records (
  id, card_number, name, company, department, position, mobile, phone, fax,
  email, website, address, raw_text, retain_ocr_text, memo, tags, image_path, image_name,
  business_category, lot_types, preferred_channel, collection_source,
  business_purpose, last_verified_at, retention_review_date, ocr_completeness,
  normalized_mobile, normalized_email, archived_at, archive_reason,
  created_at, updated_at
)
SELECT
  cm.id,
  COALESCE(NULLIF(cm.code, ''), 'BC-' || replace(cm.id::text, '-', '')),
  NULLIF(cm.extra->>'name', ''),
  COALESCE(NULLIF(cm.extra->>'company', ''), NULLIF(cm.name_en, '')),
  NULLIF(cm.extra->>'department', ''),
  NULLIF(cm.extra->>'position', ''),
  NULLIF(cm.extra->>'mobile', ''),
  NULLIF(cm.extra->>'phone', ''),
  NULLIF(cm.extra->>'fax', ''),
  NULLIF(lower(cm.extra->>'email'), ''),
  NULLIF(cm.extra->>'website', ''),
  NULLIF(cm.extra->>'address', ''),
  NULL,
  false,
  NULLIF(cm.extra->>'memo', ''),
  CASE WHEN jsonb_typeof(cm.extra->'tags') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(cm.extra->'tags'))
    ELSE ARRAY[]::TEXT[] END,
  NULLIF(cm.extra->>'imagePath', ''),
  NULLIF(cm.extra->>'imageName', ''),
  CASE
    WHEN (cm.extra->'tags') ?| ARRAY['시설','유지보수','주차관제'] THEN 'facility'
    WHEN (cm.extra->'tags') ?| ARRAY['용역','계약'] THEN 'service'
    ELSE 'other'
  END,
  ARRAY['offstreet','multilevel','onstreet']::TEXT[],
  CASE WHEN NULLIF(cm.extra->>'mobile', '') IS NOT NULL THEN 'mobile'
       WHEN NULLIF(cm.extra->>'email', '') IS NOT NULL THEN 'email' ELSE 'office' END,
  CASE WHEN NULLIF(cm.extra->>'imagePath', '') IS NOT NULL THEN 'business_card' ELSE 'manual' END,
  '공영주차장 업무 연락',
  cm.created_at::date,
  (cm.created_at::date + INTERVAL '3 years')::date,
  0,
  NULLIF(regexp_replace(COALESCE(cm.extra->>'mobile', ''), '[^0-9]', '', 'g'), ''),
  NULLIF(lower(BTRIM(COALESCE(cm.extra->>'email', ''))), ''),
  CASE WHEN cm.is_active THEN NULL ELSE COALESCE(NULLIF(cm.extra->>'updatedAt', '')::timestamptz, cm.created_at) END,
  CASE WHEN cm.is_active THEN NULL ELSE '기존 명함 보관 자료 이관' END,
  cm.created_at,
  COALESCE(NULLIF(cm.extra->>'updatedAt', '')::timestamptz, cm.created_at)
FROM public.code_master cm
WHERE cm.group_code = 'BUSINESS_CARD'
ON CONFLICT (card_number) DO NOTHING;

ALTER TABLE public.business_card_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_card_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_card_select ON public.business_card_records;
DROP POLICY IF EXISTS business_card_insert ON public.business_card_records;
DROP POLICY IF EXISTS business_card_update ON public.business_card_records;
DROP POLICY IF EXISTS business_card_delete ON public.business_card_records;
CREATE POLICY business_card_select ON public.business_card_records FOR SELECT TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY business_card_insert ON public.business_card_records FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY business_card_update ON public.business_card_records FOR UPDATE TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin','manager','editor')
) WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY business_card_delete ON public.business_card_records FOR DELETE TO authenticated USING (
  public.get_user_role(auth.uid()) = 'admin'
);

DROP POLICY IF EXISTS business_card_link_select ON public.business_card_links;
DROP POLICY IF EXISTS business_card_link_insert ON public.business_card_links;
DROP POLICY IF EXISTS business_card_link_update ON public.business_card_links;
DROP POLICY IF EXISTS business_card_link_delete ON public.business_card_links;
CREATE POLICY business_card_link_select ON public.business_card_links FOR SELECT TO authenticated USING (true);
CREATE POLICY business_card_link_insert ON public.business_card_links FOR INSERT TO authenticated WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY business_card_link_update ON public.business_card_links FOR UPDATE TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin','manager','editor')
) WITH CHECK (
  public.get_user_role(auth.uid()) IN ('admin','manager','editor')
);
CREATE POLICY business_card_link_delete ON public.business_card_links FOR DELETE TO authenticated USING (
  public.get_user_role(auth.uid()) IN ('admin','manager','editor')
);

DROP POLICY IF EXISTS "Authenticated users can read business cards" ON storage.objects;
DROP POLICY IF EXISTS "Authorized staff can read business cards" ON storage.objects;
CREATE POLICY "Authorized staff can read business cards"
ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'business-cards'
  AND public.get_user_role(auth.uid()) IN ('admin','manager','editor')
);

COMMENT ON TABLE public.business_card_records IS '공영주차장 시설·운영·용역 업무 관계자의 명함과 개인정보 보유 상태를 관리하는 연락망 원장';
COMMENT ON TABLE public.business_card_links IS '명함을 시설, 용역, 계약, 민원 등 실제 업무 레코드와 연결하는 역추적 링크';
