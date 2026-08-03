-- Restore authenticated DML privileges after the public-access hardening migration.
-- Row-level policies continue to restrict each registry group by application role.

GRANT INSERT, UPDATE, DELETE ON public.code_master TO authenticated;

DROP POLICY IF EXISTS official_document_registry_insert ON public.code_master;
CREATE POLICY official_document_registry_insert ON public.code_master
FOR INSERT TO authenticated
WITH CHECK (
  group_code = 'OFFICIAL_DOCUMENT'
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);

DROP POLICY IF EXISTS official_document_registry_update ON public.code_master;
CREATE POLICY official_document_registry_update ON public.code_master
FOR UPDATE TO authenticated
USING (
  group_code = 'OFFICIAL_DOCUMENT'
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
)
WITH CHECK (
  group_code = 'OFFICIAL_DOCUMENT'
  AND public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
);

COMMENT ON TABLE public.code_master IS
  '통합 기준정보 저장소. authenticated의 쓰기는 그룹별 RLS 정책과 사용자 역할로 제한한다.';

CREATE OR REPLACE FUNCTION public.save_official_document_record(
  p_id uuid,
  p_code text,
  p_name_ko text,
  p_name_en text,
  p_extra jsonb
)
RETURNS TABLE (
  id uuid,
  code text,
  name_ko text,
  name_en text,
  extra jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.get_user_role(auth.uid()) NOT IN ('admin', 'manager', 'editor') THEN
    RAISE EXCEPTION '공식 문서를 등록하거나 수정할 권한이 없습니다.' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_name_en), '') IS NULL OR NULLIF(btrim(p_name_ko), '') IS NULL THEN
    RAISE EXCEPTION '문서번호와 제목은 필수입니다.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    RETURN QUERY
    INSERT INTO public.code_master (group_code, code, name_ko, name_en, sort_order, is_active, extra)
    VALUES ('OFFICIAL_DOCUMENT', p_code, left(p_name_ko, 100), left(p_name_en, 100), 0, true, p_extra)
    RETURNING code_master.id, code_master.code::text, code_master.name_ko::text, code_master.name_en::text,
      code_master.extra, code_master.created_at;
  ELSE
    RETURN QUERY
    UPDATE public.code_master document
    SET code = p_code,
        name_ko = left(p_name_ko, 100),
        name_en = left(p_name_en, 100),
        extra = p_extra,
        is_active = true
    WHERE document.id = p_id
      AND document.group_code = 'OFFICIAL_DOCUMENT'
    RETURNING document.id, document.code::text, document.name_ko::text, document.name_en::text,
      document.extra, document.created_at;

    IF NOT FOUND THEN
      RAISE EXCEPTION '수정할 공식 문서를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_official_document_record(uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_official_document_record(uuid, text, text, text, jsonb) TO authenticated;
