-- Central official document register and links to every business record.
CREATE TABLE IF NOT EXISTS public.official_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number VARCHAR(200) NOT NULL,
  normalized_number VARCHAR(200) NOT NULL UNIQUE,
  title VARCHAR(500) NOT NULL,
  direction VARCHAR(20) NOT NULL DEFAULT 'internal'
    CHECK (direction IN ('outgoing', 'incoming', 'internal')),
  document_type VARCHAR(100) NOT NULL DEFAULT '기타',
  document_date DATE,
  sender_organization VARCHAR(300),
  receiver_organization VARCHAR(300),
  department VARCHAR(200),
  security_level VARCHAR(50) NOT NULL DEFAULT '일반',
  retention_period VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'registered'
    CHECK (status IN ('draft', 'registered', 'sent', 'received', 'archived')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.document_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.official_documents(id) ON DELETE CASCADE,
  module VARCHAR(50) NOT NULL,
  record_id UUID NOT NULL,
  relation_type VARCHAR(20) NOT NULL DEFAULT 'reference'
    CHECK (relation_type IN ('primary', 'reference', 'evidence', 'reply')),
  record_path TEXT,
  record_label VARCHAR(500),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, module, record_id)
);

CREATE INDEX IF NOT EXISTS idx_official_documents_number
  ON public.official_documents(normalized_number);
CREATE INDEX IF NOT EXISTS idx_official_documents_date
  ON public.official_documents(document_date DESC);
CREATE INDEX IF NOT EXISTS idx_document_links_record
  ON public.document_links(module, record_id);
CREATE INDEX IF NOT EXISTS idx_document_links_document
  ON public.document_links(document_id);

DROP TRIGGER IF EXISTS trg_official_documents_updated ON public.official_documents;
CREATE TRIGGER trg_official_documents_updated
  BEFORE UPDATE ON public.official_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.official_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "official_documents_select" ON public.official_documents
  FOR SELECT USING (auth.uid() IS NOT NULL AND deleted_at IS NULL);
CREATE POLICY "official_documents_insert" ON public.official_documents
  FOR INSERT WITH CHECK (
    public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor')
    AND created_by = auth.uid()
  );
CREATE POLICY "official_documents_update" ON public.official_documents
  FOR UPDATE USING (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'manager', 'editor'));
CREATE POLICY "official_documents_delete" ON public.official_documents
  FOR DELETE USING (public.get_user_role(auth.uid()) IN ('admin', 'manager'));

CREATE POLICY "document_links_select" ON public.document_links
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "document_links_insert" ON public.document_links
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());
CREATE POLICY "document_links_delete" ON public.document_links
  FOR DELETE USING (
    created_by = auth.uid() OR public.get_user_role(auth.uid()) IN ('admin', 'manager')
  );

COMMENT ON TABLE public.official_documents IS '공식 문서번호를 기준으로 관리하는 중앙 문서대장';
COMMENT ON TABLE public.document_links IS '공식 문서와 업무 레코드 간 다대다 연결';
