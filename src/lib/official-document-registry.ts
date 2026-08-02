import { supabase } from "@/integrations/supabase/client";
import type {
  DocumentLink,
  DocumentActivity,
  DocumentRelationType,
  OfficialDocument,
  OfficialDocumentInput,
  OfficialDocumentFile,
} from "@/types/official-document";
import { logActivity } from "@/lib/activity-logger";
import { getSecureUploadPath, validateUploadFile } from "@/lib/file-security";

const DOCUMENT_GROUP = "OFFICIAL_DOCUMENT";
const LINK_REF_TYPE = "official_document_link";
const LINK_MIME_TYPE = "application/vnd.parkmaster.document-link";
const DOCUMENT_URI_PREFIX = "parkmaster-document://";
const DOCUMENT_FILE_REF_TYPE = "official_document_file";
const DOCUMENT_FILE_BUCKET = "official-documents";

export function normalizeDocumentNumber(value: string) {
  return value.normalize("NFKC").toUpperCase().replace(/[^0-9A-Z가-힣]/g, "");
}

function documentCode(normalizedNumber: string) {
  let hash = 2166136261;
  for (let i = 0; i < normalizedNumber.length; i += 1) {
    hash ^= normalizedNumber.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `DOC-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function mapDocument(row: any): OfficialDocument {
  const extra = (row.extra || {}) as Record<string, any>;
  return {
    id: row.id,
    documentNumber: extra.document_number || row.name_en || row.code,
    normalizedNumber: extra.normalized_number || normalizeDocumentNumber(row.name_en || row.code),
    title: extra.title || row.name_ko,
    direction: extra.direction || "internal",
    documentType: extra.document_type || "기타",
    documentDate: extra.document_date || null,
    senderOrganization: extra.sender_organization || null,
    receiverOrganization: extra.receiver_organization || null,
    department: extra.department || null,
    securityLevel: extra.security_level || "일반",
    retentionPeriod: extra.retention_period || null,
    status: extra.status || "registered",
    notes: extra.notes || null,
    createdAt: row.created_at,
  };
}

export async function listOfficialDocuments(search = ""): Promise<OfficialDocument[]> {
  const { data, error } = await supabase
    .from("code_master")
    .select("id, code, name_ko, name_en, extra, created_at")
    .eq("group_code", DOCUMENT_GROUP)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const term = normalizeDocumentNumber(search);
  const lowered = search.trim().toLocaleLowerCase("ko");
  const documents = (data || []).map(mapDocument).filter((document) => {
    if (!search.trim()) return true;
    return document.normalizedNumber.includes(term)
      || document.title.toLocaleLowerCase("ko").includes(lowered)
      || (document.department || "").toLocaleLowerCase("ko").includes(lowered);
  });

  if (!documents.length) return documents;
  const { data: links } = await supabase
    .from("attachments")
    .select("file_path")
    .eq("ref_type", LINK_REF_TYPE);
  const counts = new Map<string, number>();
  links?.forEach((link) => {
    const documentId = link.file_path.replace(DOCUMENT_URI_PREFIX, "");
    counts.set(documentId, (counts.get(documentId) || 0) + 1);
  });
  return documents.map((document) => ({ ...document, linkCount: counts.get(document.id) || 0 }));
}

export async function getOfficialDocument(id: string): Promise<OfficialDocument> {
  const { data, error } = await supabase
    .from("code_master")
    .select("id, code, name_ko, name_en, extra, created_at")
    .eq("group_code", DOCUMENT_GROUP)
    .eq("id", id)
    .single();
  if (error) throw error;
  return mapDocument(data);
}

export async function findOfficialDocumentByNumber(documentNumber: string) {
  const normalized = normalizeDocumentNumber(documentNumber);
  if (!normalized) return null;
  const documents = await listOfficialDocuments(documentNumber);
  return documents.find((document) => document.normalizedNumber === normalized) || null;
}

export async function createOfficialDocument(input: OfficialDocumentInput): Promise<OfficialDocument> {
  const documentNumber = input.documentNumber.trim();
  const title = input.title.trim();
  const normalizedNumber = normalizeDocumentNumber(documentNumber);
  if (!normalizedNumber) throw new Error("문서번호를 입력해 주세요.");
  if (!title) throw new Error("문서 제목을 입력해 주세요.");

  const existing = await findOfficialDocumentByNumber(documentNumber);
  if (existing) return existing;

  const extra = {
    registry_version: 1,
    document_number: documentNumber,
    normalized_number: normalizedNumber,
    title,
    direction: input.direction || "internal",
    document_type: input.documentType || "기타",
    document_date: input.documentDate || null,
    sender_organization: input.senderOrganization || null,
    receiver_organization: input.receiverOrganization || null,
    department: input.department || null,
    security_level: input.securityLevel || "일반",
    retention_period: input.retentionPeriod || null,
    status: input.status || "registered",
    notes: input.notes || null,
  };
  const { data, error } = await supabase
    .from("code_master")
    .insert({
      group_code: DOCUMENT_GROUP,
      code: documentCode(normalizedNumber),
      name_ko: title.slice(0, 100),
      name_en: documentNumber.slice(0, 100),
      sort_order: 0,
      is_active: true,
      extra: extra as any,
    })
    .select("id, code, name_ko, name_en, extra, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      const duplicate = await findOfficialDocumentByNumber(documentNumber);
      if (duplicate) return duplicate;
    }
    throw error;
  }
  const document = mapDocument(data);
  await logActivity({
    module: "OFFICIAL_DOCUMENT",
    action: "문서등록",
    targetType: "official_document",
    targetId: document.id,
    targetName: document.documentNumber,
    details: { title: document.title, direction: document.direction, department: document.department },
  });
  return document;
}

export async function updateOfficialDocument(id: string, input: OfficialDocumentInput): Promise<OfficialDocument> {
  const current = await getOfficialDocument(id);
  const documentNumber = input.documentNumber.trim();
  const normalizedNumber = normalizeDocumentNumber(documentNumber);
  if (!normalizedNumber) throw new Error("문서번호를 입력해 주세요.");
  if (!input.title.trim()) throw new Error("문서 제목을 입력해 주세요.");
  const duplicate = await findOfficialDocumentByNumber(documentNumber);
  if (duplicate && duplicate.id !== id) throw new Error("같은 문서번호가 이미 등록되어 있습니다.");

  const extra = {
    registry_version: 1,
    document_number: documentNumber,
    normalized_number: normalizedNumber,
    title: input.title.trim(),
    direction: input.direction || current.direction,
    document_type: input.documentType || current.documentType,
    document_date: input.documentDate || null,
    sender_organization: input.senderOrganization || null,
    receiver_organization: input.receiverOrganization || null,
    department: input.department || null,
    security_level: input.securityLevel || current.securityLevel,
    retention_period: input.retentionPeriod || null,
    status: input.status || current.status,
    notes: input.notes || null,
  };
  const { data, error } = await supabase.from("code_master").update({
    code: documentCode(normalizedNumber),
    name_ko: input.title.trim().slice(0, 100),
    name_en: documentNumber.slice(0, 100),
    extra: extra as any,
  }).eq("id", id).eq("group_code", DOCUMENT_GROUP)
    .select("id, code, name_ko, name_en, extra, created_at").single();
  if (error) throw error;
  const updated = mapDocument(data);
  const changedFields = [
    ["document_number", current.documentNumber, updated.documentNumber],
    ["title", current.title, updated.title],
    ["direction", current.direction, updated.direction],
    ["document_type", current.documentType, updated.documentType],
    ["document_date", current.documentDate, updated.documentDate],
    ["sender_organization", current.senderOrganization, updated.senderOrganization],
    ["receiver_organization", current.receiverOrganization, updated.receiverOrganization],
    ["department", current.department, updated.department],
    ["security_level", current.securityLevel, updated.securityLevel],
    ["retention_period", current.retentionPeriod, updated.retentionPeriod],
    ["status", current.status, updated.status],
    ["notes", current.notes, updated.notes],
  ].filter(([, before, after]) => before !== after).map(([field]) => field);
  await logActivity({
    module: "OFFICIAL_DOCUMENT",
    action: "문서수정",
    targetType: "official_document",
    targetId: id,
    targetName: updated.documentNumber,
    details: {
      previous_number: current.documentNumber,
      changed_fields: changedFields,
    },
  });
  return updated;
}

function mapLink(row: any): DocumentLink {
  return {
    id: row.id,
    documentId: row.file_path.replace(DOCUMENT_URI_PREFIX, ""),
    module: row.module,
    recordId: row.ref_id,
    relationType: row.category || "reference",
    recordPath: row.thumbnail_path || null,
    recordLabel: row.file_name || null,
    createdAt: row.created_at,
  };
}

export async function listDocumentLinks(documentId: string): Promise<DocumentLink[]> {
  const { data, error } = await supabase
    .from("attachments")
    .select("id, module, ref_id, category, file_name, file_path, thumbnail_path, created_at")
    .eq("ref_type", LINK_REF_TYPE)
    .eq("file_path", `${DOCUMENT_URI_PREFIX}${documentId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapLink);
}

export async function listRecordDocuments(module: string, recordId: string): Promise<Array<{ document: OfficialDocument; link: DocumentLink }>> {
  const { data, error } = await supabase
    .from("attachments")
    .select("id, module, ref_id, category, file_name, file_path, thumbnail_path, created_at")
    .eq("module", module)
    .eq("ref_id", recordId)
    .eq("ref_type", LINK_REF_TYPE)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const links = (data || []).map(mapLink);
  const documents = await Promise.all(links.map((link) => getOfficialDocument(link.documentId)));
  return links.map((link, index) => ({ link, document: documents[index] }));
}

export async function linkOfficialDocument(args: {
  document: OfficialDocument;
  module: string;
  recordId: string;
  relationType: DocumentRelationType;
  recordPath?: string;
  recordLabel?: string;
}) {
  const existing = await listRecordDocuments(args.module, args.recordId);
  if (existing.some(({ document }) => document.id === args.document.id)) return;
  const { data: authData } = await supabase.auth.getUser();
  const { error } = await supabase.from("attachments").insert({
    module: args.module,
    ref_id: args.recordId,
    ref_type: LINK_REF_TYPE,
    category: args.relationType,
    file_name: (args.recordLabel || args.document.documentNumber).slice(0, 500),
    file_path: `${DOCUMENT_URI_PREFIX}${args.document.id}`,
    mime_type: LINK_MIME_TYPE,
    thumbnail_path: args.recordPath || null,
    uploaded_by: authData.user?.id || null,
  });
  if (error) throw error;
  await logActivity({
    module: "OFFICIAL_DOCUMENT",
    action: "업무자료연결",
    targetType: "official_document",
    targetId: args.document.id,
    targetName: args.document.documentNumber,
    details: { module: args.module, record_id: args.recordId, record_label: args.recordLabel, relation_type: args.relationType },
  });
}

export async function unlinkOfficialDocument(linkId: string) {
  const { data: link } = await supabase.from("attachments")
    .select("file_path, module, ref_id, file_name, category")
    .eq("id", linkId).eq("ref_type", LINK_REF_TYPE).single();
  const { error } = await supabase.from("attachments").delete().eq("id", linkId);
  if (error) throw error;
  if (link) {
    const documentId = link.file_path.replace(DOCUMENT_URI_PREFIX, "");
    await logActivity({
      module: "OFFICIAL_DOCUMENT",
      action: "업무자료연결해제",
      targetType: "official_document",
      targetId: documentId,
      details: { module: link.module, record_id: link.ref_id, record_label: link.file_name, relation_type: link.category },
    });
  }
}

export async function uploadOfficialDocumentFiles(document: OfficialDocument, files: File[]) {
  if (!files.length) return [];
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("파일을 등록하려면 로그인이 필요합니다.");
  const uploaded: OfficialDocumentFile[] = [];
  for (const file of files) {
    const validation = await validateUploadFile(file, "document");
    if (!validation.isValid) throw new Error(`${file.name}: ${validation.errors.join(" ")}`);
    const path = `${authData.user.id}/${document.id}/${getSecureUploadPath("document", file.name)}`;
    let bucket = DOCUMENT_FILE_BUCKET;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
    if (uploadError) {
      const canUsePrivateDevFallback = import.meta.env.DEV
        && /bucket not found/i.test(uploadError.message)
        && ["application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(file.type);
      if (!canUsePrivateDevFallback) throw uploadError;
      bucket = "reports";
      const { error: fallbackError } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
      if (fallbackError) throw fallbackError;
    }
    const storedPath = bucket === DOCUMENT_FILE_BUCKET ? path : `${bucket}://${path}`;
    const { data, error: metadataError } = await supabase.from("attachments").insert({
      module: "OFFICIAL_DOCUMENT",
      ref_id: document.id,
      ref_type: DOCUMENT_FILE_REF_TYPE,
      category: "original",
      file_name: file.name,
      file_path: storedPath,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: authData.user.id,
    }).select("id, ref_id, file_name, file_path, file_size, mime_type, created_at").single();
    if (metadataError) {
      await supabase.storage.from(bucket).remove([path]);
      throw metadataError;
    }
    uploaded.push({ id: data.id, documentId: data.ref_id, fileName: data.file_name, filePath: data.file_path, fileSize: Number(data.file_size || 0), mimeType: data.mime_type, createdAt: data.created_at || new Date().toISOString() });
  }
  await logActivity({ module: "OFFICIAL_DOCUMENT", action: "원문파일등록", targetType: "official_document", targetId: document.id, targetName: document.documentNumber, details: { file_count: uploaded.length, file_names: uploaded.map((file) => file.fileName) } });
  return uploaded;
}

export async function listOfficialDocumentFiles(documentId: string): Promise<OfficialDocumentFile[]> {
  const { data, error } = await supabase.from("attachments")
    .select("id, ref_id, file_name, file_path, file_size, mime_type, created_at")
    .eq("module", "OFFICIAL_DOCUMENT").eq("ref_id", documentId).eq("ref_type", DOCUMENT_FILE_REF_TYPE)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({ id: row.id, documentId: row.ref_id, fileName: row.file_name, filePath: row.file_path, fileSize: Number(row.file_size || 0), mimeType: row.mime_type, createdAt: row.created_at || "" }));
}

export async function getOfficialDocumentFileUrl(filePath: string) {
  const fallbackMatch = filePath.match(/^([a-z0-9-]+):\/\/(.+)$/i);
  const bucket = fallbackMatch?.[1] || DOCUMENT_FILE_BUCKET;
  const path = fallbackMatch?.[2] || filePath;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteOfficialDocumentFile(file: OfficialDocumentFile) {
  const fallbackMatch = file.filePath.match(/^([a-z0-9-]+):\/\/(.+)$/i);
  const bucket = fallbackMatch?.[1] || DOCUMENT_FILE_BUCKET;
  const path = fallbackMatch?.[2] || file.filePath;
  const { error: storageError } = await supabase.storage.from(bucket).remove([path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("attachments").delete().eq("id", file.id).eq("ref_type", DOCUMENT_FILE_REF_TYPE);
  if (error) throw error;
  await logActivity({ module: "OFFICIAL_DOCUMENT", action: "원문파일삭제", targetType: "official_document", targetId: file.documentId, targetName: file.fileName });
}

export async function changeDocumentLinkRelation(link: DocumentLink, relationType: DocumentRelationType) {
  if (link.relationType === relationType) return;
  const { data: authData } = await supabase.auth.getUser();
  const { data: inserted, error: insertError } = await supabase.from("attachments").insert({
    module: link.module,
    ref_id: link.recordId,
    ref_type: LINK_REF_TYPE,
    category: relationType,
    file_name: link.recordLabel || link.recordId,
    file_path: `${DOCUMENT_URI_PREFIX}${link.documentId}`,
    mime_type: LINK_MIME_TYPE,
    thumbnail_path: link.recordPath,
    uploaded_by: authData.user?.id || null,
  }).select("id").single();
  if (insertError) throw insertError;
  const { error: deleteError } = await supabase.from("attachments").delete().eq("id", link.id);
  if (deleteError) {
    await supabase.from("attachments").delete().eq("id", inserted.id);
    throw deleteError;
  }
  await logActivity({
    module: "OFFICIAL_DOCUMENT",
    action: "연결관계변경",
    targetType: "official_document",
    targetId: link.documentId,
    details: { module: link.module, record_id: link.recordId, from: link.relationType, to: relationType },
  });
}

export async function listDocumentActivity(documentId: string): Promise<DocumentActivity[]> {
  const { data, error } = await supabase.from("activity_logs")
    .select("id, action, user_name, details, created_at")
    .eq("module", "OFFICIAL_DOCUMENT")
    .eq("target_type", "official_document")
    .eq("target_id", documentId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    action: row.action,
    userName: row.user_name,
    details: row.details as Record<string, unknown> | null,
    createdAt: row.created_at,
  }));
}

export const DOCUMENT_MODULE_LABELS: Record<string, string> = {
  ABANDONED_VEHICLE: "방치차량 처리",
  SECURITY_INSPECTION: "관제·보안 점검",
  CAPITAL_PROCEDURE: "사업 행정절차",
  FACILITY_EQUIPMENT: "시설 장비관리",
  TEAM_WORK: "차량관리과 팀 업무",
  COMPLAINT: "민원",
  LOT: "주차장",
  SURVEY: "현황조사",
  OPS_CONTRACT: "위탁계약",
  FACILITY: "시설관리",
  BUDGET: "예산·지출",
  PROCUREMENT: "입찰·계약",
  SERVICE: "용역관리",
  PLANNING: "주차계획",
};

export const DOCUMENT_RELATION_LABELS: Record<DocumentRelationType, string> = {
  primary: "주문서",
  reference: "참고문서",
  evidence: "근거문서",
  reply: "회신문서",
};
