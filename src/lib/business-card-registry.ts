import { supabase } from "@/integrations/supabase/client";
import { businessCardCompleteness, normalizePhone, type BusinessCardFields } from "@/lib/business-card-ocr";
import { logActivity } from "@/lib/activity-logger";
import { listOfficialDocuments } from "@/lib/official-document-registry";
import { listRelatedCompanyContacts } from "@/lib/related-company-registry";
import type { LotType } from "@/types/database";

const IMAGE_BUCKET = "business-cards";
const FALLBACK_IMAGE_BUCKET = "survey-photos";
const table = () => (supabase as any).from("business_card_records");
const linksTable = () => (supabase as any).from("business_card_links");
const LOT_TYPES: LotType[] = ["offstreet", "multilevel", "onstreet"];

export type BusinessCategory = "facility" | "service" | "operations" | "procurement" | "complaint" | "public" | "other";
export type PreferredContactChannel = "mobile" | "office" | "email";
export type BusinessCardRelationType = "company_contact" | "project_manager" | "emergency" | "reference";

export interface BusinessCardLink {
  id?: string;
  module: string;
  recordId: string;
  recordLabel: string;
  recordPath: string;
  companyName: string;
  relationType: BusinessCardRelationType;
  lotId: string | null;
  lotName?: string | null;
  lotType?: LotType | null;
}

export interface BusinessCardLinkOption extends BusinessCardLink {
  key: string;
  managerName: string;
  phone: string;
  email: string;
}

export interface BusinessCard extends BusinessCardFields {
  id: string;
  cardNumber: string;
  memo: string;
  tags: string[];
  imagePath: string;
  imageName: string;
  businessCategory: BusinessCategory;
  lotTypes: LotType[];
  preferredChannel: PreferredContactChannel;
  emergencyContact: boolean;
  collectionSource: "business_card" | "manual" | "email_signature" | "official_document" | "other";
  businessPurpose: string;
  lastVerifiedAt: string | null;
  retentionReviewDate: string | null;
  ocrCompleteness: number;
  retainOcrText: boolean;
  owningTeam: string | null;
  rowVersion: number;
  archivedAt: string | null;
  archiveReason: string | null;
  links: BusinessCardLink[];
  createdAt: string;
  updatedAt: string;
}

export type BusinessCardInput = Omit<
  BusinessCard,
  "cardNumber" | "createdAt" | "updatedAt" | "archivedAt" | "archiveReason" | "owningTeam"
> & { clientRequestId?: string };

export class DuplicateBusinessCardError extends Error {
  readonly duplicate: BusinessCard;

  constructor(duplicate: BusinessCard) {
    super(`이미 등록된 연락처입니다: ${duplicate.company || "회사 미등록"} ${duplicate.name || "이름 미등록"}`);
    this.name = "DuplicateBusinessCardError";
    this.duplicate = duplicate;
  }
}

function mapLink(row: any): BusinessCardLink {
  return {
    id: row.id,
    module: row.module,
    recordId: row.record_id,
    recordLabel: row.record_label,
    recordPath: row.record_path,
    companyName: row.company_name || "",
    relationType: row.relation_type || "company_contact",
    lotId: row.lot_id || null,
  };
}

function mapCard(row: any, links: BusinessCardLink[] = []): BusinessCard {
  return {
    id: row.id,
    cardNumber: row.card_number,
    name: row.name || "",
    company: row.company || "",
    department: row.department || "",
    position: row.position || "",
    mobile: row.mobile || "",
    phone: row.phone || "",
    fax: row.fax || "",
    email: row.email || "",
    website: row.website || "",
    address: row.address || "",
    rawText: row.raw_text || "",
    memo: row.memo || "",
    tags: row.tags || [],
    imagePath: row.image_path || "",
    imageName: row.image_name || "",
    businessCategory: row.business_category || "other",
    lotTypes: (row.lot_types || LOT_TYPES) as LotType[],
    preferredChannel: row.preferred_channel || "mobile",
    emergencyContact: Boolean(row.emergency_contact),
    collectionSource: row.collection_source || "business_card",
    businessPurpose: row.business_purpose || "공영주차장 업무 연락",
    lastVerifiedAt: row.last_verified_at || null,
    retentionReviewDate: row.retention_review_date || null,
    ocrCompleteness: Number(row.ocr_completeness || 0),
    retainOcrText: Boolean(row.retain_ocr_text),
    owningTeam: row.owning_team || null,
    rowVersion: Number(row.row_version || 1),
    archivedAt: row.archived_at || null,
    archiveReason: row.archive_reason || null,
    links,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || "",
  };
}

export function normalizeBusinessCardCompany(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/주식회사|\(주\)|㈜|\s|[.,·-]/g, "");
}

export function businessCardLinkKey(link: Pick<BusinessCardLink, "module" | "recordId">) {
  return `${link.module}:${link.recordId}`;
}

export function validateBusinessCardInput(card: BusinessCardInput) {
  if (!card.name.trim() && !card.company.trim()) throw new Error("이름 또는 회사명을 입력해 주세요.");
  if (!card.mobile.trim() && !card.phone.trim() && !card.email.trim()) throw new Error("휴대전화, 사무실 전화 또는 이메일 중 하나를 입력해 주세요.");
  for (const [label, value] of [["휴대전화", card.mobile], ["사무실 전화", card.phone], ["팩스", card.fax]] as const) {
    if (value && !/^0\d{1,2}-\d{3,4}-\d{4}$/.test(normalizePhone(value))) throw new Error(`${label} 형식을 확인해 주세요.`);
  }
  if (card.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(card.email)) throw new Error("이메일 형식을 확인해 주세요.");
  if (!card.lotTypes.length || card.lotTypes.some((item) => !LOT_TYPES.includes(item))) throw new Error("적용 주차장 형태를 하나 이상 선택해 주세요.");
  if (!card.businessPurpose.trim()) throw new Error("업무상 이용 목적을 입력해 주세요.");
}

export function matchesBusinessCard(card: BusinessCard, query: string) {
  const term = query.trim().toLocaleLowerCase("ko-KR");
  if (!term) return true;
  return [
    card.cardNumber,
    card.name,
    card.company,
    card.department,
    card.position,
    card.mobile,
    card.phone,
    card.fax,
    card.email,
    card.website,
    card.address,
    card.memo,
    ...card.tags,
    ...card.links.flatMap((link) => [link.recordLabel, link.companyName]),
  ].some((value) => value.toLocaleLowerCase("ko-KR").includes(term));
}

export function suggestBusinessCardLinks(card: Pick<BusinessCardFields, "company" | "name" | "mobile" | "phone" | "email">, options: BusinessCardLinkOption[]) {
  const company = normalizeBusinessCardCompany(card.company);
  const contactNumbers = new Set([card.mobile, card.phone].map((value) => value.replace(/\D/g, "")).filter(Boolean));
  const email = card.email.trim().toLowerCase();
  return options.filter((option) => {
    const sameCompany = company && normalizeBusinessCardCompany(option.companyName) === company;
    const samePhone = [option.phone].map((value) => value.replace(/\D/g, "")).some((value) => value && contactNumbers.has(value));
    const sameEmail = email && option.email.trim().toLowerCase() === email;
    return Boolean(sameCompany || samePhone || sameEmail);
  });
}

export async function listBusinessCards(includeArchived = false): Promise<BusinessCard[]> {
  let query = table().select("*").order("created_at", { ascending: false });
  query = includeArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return [];
  const { data: linkRows, error: linkError } = await linksTable().select("*").in("card_id", rows.map((row: any) => row.id));
  if (linkError) throw linkError;
  const grouped = new Map<string, BusinessCardLink[]>();
  for (const row of linkRows || []) grouped.set(row.card_id, [...(grouped.get(row.card_id) || []), mapLink(row)]);
  return rows.map((row: any) => mapCard(row, grouped.get(row.id) || []));
}

function relatedOption(contact: Awaited<ReturnType<typeof listRelatedCompanyContacts>>[number]): BusinessCardLinkOption {
  const link = {
    module: contact.module,
    recordId: contact.recordId,
    recordLabel: contact.recordLabel,
    recordPath: contact.recordPath,
    companyName: contact.companyName,
    relationType: "company_contact" as const,
    lotId: null,
  };
  return { ...link, key: businessCardLinkKey(link), managerName: contact.managerName, phone: contact.phone, email: contact.email };
}

export async function listBusinessCardLinkOptions(): Promise<BusinessCardLinkOption[]> {
  const [related, documents, serviceResult, contractResult] = await Promise.all([
    listRelatedCompanyContacts(),
    listOfficialDocuments(),
    (supabase as any).from("service_projects").select("id, project_number, title, contractor_name, contractor_manager, contractor_manager_phone, contractor_phone, contractor_email, lot_id, parking_lots(name,lot_type)").neq("status", "cancelled").limit(200),
    (supabase as any).from("outsourcing_contracts").select("id, company_name, contact_person, contact_phone, contact_email, lot_id, parking_lots(name,lot_type)").eq("status", "active").limit(200),
  ]);
  if (serviceResult.error) throw serviceResult.error;
  if (contractResult.error) throw contractResult.error;
  const options: BusinessCardLinkOption[] = related.map(relatedOption);
  for (const document of documents) {
    const companyName = document.senderOrganization || document.receiverOrganization || "";
    const link = { module: "OFFICIAL_DOCUMENT", recordId: document.id, recordLabel: `${document.documentNumber} ${document.title}`, recordPath: `/documents/${document.id}`, companyName, relationType: "reference" as const, lotId: null };
    options.push({ ...link, key: businessCardLinkKey(link), managerName: "", phone: "", email: "" });
  }
  for (const row of serviceResult.data || []) {
    const link = { module: "SERVICE_PROJECT", recordId: row.id, recordLabel: `${row.project_number} ${row.title}`, recordPath: `/service/projects/${row.id}`, companyName: row.contractor_name || "", relationType: "project_manager" as const, lotId: row.lot_id || null };
    options.push({ ...link, key: businessCardLinkKey(link), managerName: row.contractor_manager || "", phone: row.contractor_manager_phone || row.contractor_phone || "", email: row.contractor_email || "", lotName: row.parking_lots?.name || null, lotType: row.parking_lots?.lot_type || null });
  }
  for (const row of contractResult.data || []) {
    const link = { module: "OPS_CONTRACT", recordId: row.id, recordLabel: `${row.parking_lots?.name || "주차장"} 위탁운영 계약`, recordPath: "/ops/contracts", companyName: row.company_name || "", relationType: "company_contact" as const, lotId: row.lot_id || null };
    options.push({ ...link, key: businessCardLinkKey(link), managerName: row.contact_person || "", phone: row.contact_phone || "", email: row.contact_email || "", lotName: row.parking_lots?.name || null, lotType: row.parking_lots?.lot_type || null });
  }
  return [...new Map(options.map((option) => [option.key, option])).values()].sort((a, b) => `${a.companyName}${a.recordLabel}`.localeCompare(`${b.companyName}${b.recordLabel}`, "ko"));
}

async function uploadCardImage(cardId: string, file: File) {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("JPG, PNG, WEBP 명함 이미지만 등록할 수 있습니다.");
  if (file.size > 10 * 1024 * 1024) throw new Error("명함 이미지는 10MB 이하여야 합니다.");
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("명함 이미지를 저장하려면 로그인이 필요합니다.");
  const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const path = `${authData.user.id}/business-cards/${cardId}/${crypto.randomUUID()}.${extension}`;
  let bucket = IMAGE_BUCKET;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
  if (error) {
    if (!/bucket not found/i.test(error.message)) throw error;
    bucket = FALLBACK_IMAGE_BUCKET;
    const { error: fallbackError } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
    if (fallbackError) throw fallbackError;
  }
  return bucket === IMAGE_BUCKET ? path : `${bucket}://${path}`;
}

function storageLocation(storedPath: string) {
  const match = storedPath.match(/^([a-z0-9-]+):\/\/(.+)$/i);
  return { bucket: match?.[1] || IMAGE_BUCKET, path: match?.[2] || storedPath };
}

export async function getBusinessCardImageUrl(path: string, cardId?: string) {
  if (!path) return "";
  const location = storageLocation(path);
  const { data, error } = await supabase.storage.from(location.bucket).createSignedUrl(location.path, 300);
  if (error) throw error;
  if (cardId) await logActivity({ module: "BUSINESS_CARD", action: "명함원본열람", targetType: "business_card", targetId: cardId });
  return data.signedUrl;
}

async function findDuplicate(input: BusinessCardInput) {
  const mobile = input.mobile.replace(/\D/g, "");
  const email = input.email.trim().toLowerCase();
  if (!mobile && !email) return null;
  const filters = [mobile ? `normalized_mobile.eq.${mobile}` : "", email ? `normalized_email.eq.${email}` : ""].filter(Boolean).join(",");
  let query = table().select("*").is("archived_at", null).or(filters).limit(1);
  if (input.id) query = query.neq("id", input.id);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? mapCard(data) : null;
}

function inputRow(input: BusinessCardInput, imagePath: string, imageName: string) {
  return {
    name: input.name.trim() || null,
    company: input.company.trim() || null,
    department: input.department.trim() || null,
    position: input.position.trim() || null,
    mobile: input.mobile ? normalizePhone(input.mobile) : null,
    phone: input.phone ? normalizePhone(input.phone) : null,
    fax: input.fax ? normalizePhone(input.fax) : null,
    email: input.email.trim().toLowerCase() || null,
    website: input.website.trim() || null,
    address: input.address.trim() || null,
    raw_text: input.retainOcrText ? input.rawText.trim() || null : null,
    retain_ocr_text: input.retainOcrText,
    memo: input.memo.trim() || null,
    tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))],
    image_path: imagePath || null,
    image_name: imageName || null,
    business_category: input.businessCategory,
    lot_types: input.lotTypes,
    preferred_channel: input.preferredChannel,
    emergency_contact: input.emergencyContact,
    collection_source: input.collectionSource,
    business_purpose: input.businessPurpose.trim(),
    last_verified_at: input.lastVerifiedAt || null,
    retention_review_date: input.retentionReviewDate || null,
    ocr_completeness: input.ocrCompleteness || businessCardCompleteness(input),
    client_request_id: input.clientRequestId || null,
  };
}

async function syncLinks(cardId: string, links: BusinessCardLink[]) {
  const { data: current, error: readError } = await linksTable().select("id,module,record_id").eq("card_id", cardId);
  if (readError) throw readError;
  const wanted = new Set(links.map(businessCardLinkKey));
  for (const link of current || []) {
    if (!wanted.has(businessCardLinkKey({ module: link.module, recordId: link.record_id }))) {
      const { error } = await linksTable().delete().eq("id", link.id);
      if (error) throw error;
    }
  }
  if (!links.length) return;
  const { error } = await linksTable().upsert(links.map((link) => ({ card_id: cardId, module: link.module, record_id: link.recordId, record_label: link.recordLabel, record_path: link.recordPath, company_name: link.companyName || null, relation_type: link.relationType, lot_id: link.lotId || null })), { onConflict: "card_id,module,record_id" });
  if (error) throw error;
}

export async function saveBusinessCard(input: BusinessCardInput, image?: File | null) {
  validateBusinessCardInput(input);
  const duplicate = await findDuplicate(input);
  if (duplicate) throw new DuplicateBusinessCardError(duplicate);
  const id = input.id || crypto.randomUUID();
  let imagePath = input.imagePath;
  if (image) imagePath = await uploadCardImage(id, image);
  const row = inputRow(input, imagePath, image?.name || input.imageName);
  const result = input.id
    ? await table().update(row).eq("id", id).eq("row_version", input.rowVersion || 1).select("*").single()
    : await table().insert({ id, card_number: `BC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-6)}`, ...row }).select("*").single();
  if (result.error) {
    if (image && imagePath !== input.imagePath) {
      const location = storageLocation(imagePath);
      await supabase.storage.from(location.bucket).remove([location.path]);
    }
    if (result.error.code === "23505") throw new Error("동일한 휴대전화 또는 이메일의 활성 연락처가 이미 있습니다.");
    if (result.error.code === "PGRST116") throw new Error("다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.");
    throw result.error;
  }
  await syncLinks(id, input.links);
  if (image && input.imagePath && input.imagePath !== imagePath) {
    const previous = storageLocation(input.imagePath);
    await supabase.storage.from(previous.bucket).remove([previous.path]);
  }
  const saved = mapCard(result.data, input.links);
  await logActivity({ module: "BUSINESS_CARD", action: input.id ? "명함수정" : "명함등록", targetType: "business_card", targetId: id, targetName: saved.name || saved.company, details: { company: saved.company, category: saved.businessCategory, lot_types: saved.lotTypes, linked_records: saved.links.map(businessCardLinkKey), has_image: Boolean(imagePath) } });
  return saved;
}

export async function archiveBusinessCard(card: BusinessCard, reason: string) {
  if (!reason.trim()) throw new Error("보관 사유를 입력해 주세요.");
  const { error } = await table().update({ archived_at: new Date().toISOString(), archive_reason: reason.trim() }).eq("id", card.id).eq("row_version", card.rowVersion).select("id").single();
  if (error) throw error;
  await logActivity({ module: "BUSINESS_CARD", action: "명함보관", targetType: "business_card", targetId: card.id, targetName: card.name, details: { reason } });
}

export async function restoreBusinessCard(card: BusinessCard) {
  const duplicate = await findDuplicate({ ...card, clientRequestId: undefined });
  if (duplicate) throw new DuplicateBusinessCardError(duplicate);
  const { error } = await table().update({ archived_at: null, archive_reason: null, last_verified_at: new Date().toISOString().slice(0, 10) }).eq("id", card.id).eq("row_version", card.rowVersion).select("id").single();
  if (error) {
    if (error.code === "23505") throw new Error("같은 휴대전화 또는 이메일의 활성 연락처가 있어 복구할 수 없습니다.");
    throw error;
  }
  await logActivity({ module: "BUSINESS_CARD", action: "명함복구", targetType: "business_card", targetId: card.id, targetName: card.name });
}

export async function listBusinessCardsForRecord(module: string, recordId: string) {
  const { data: rows, error } = await linksTable().select("card_id").eq("module", module).eq("record_id", recordId);
  if (error) throw error;
  const ids = (rows || []).map((row: any) => row.card_id);
  if (!ids.length) return [];
  const cards = await listBusinessCards();
  return cards.filter((card) => ids.includes(card.id));
}
