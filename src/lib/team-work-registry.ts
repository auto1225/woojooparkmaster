import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-logger";
import { findOfficialDocumentByNumber, linkOfficialDocument, listRecordDocuments, unlinkOfficialDocument } from "@/lib/official-document-registry";
import type { TeamRecordType, TeamWorkInput, TeamWorkRecord, TeamWorkStatus } from "@/types/team-work";

const TEAM_WORK_GROUP = "TEAM_WORK_RECORD";
export const TEAM_WORK_DOCUMENT_MODULE = "team-work";
export type TeamWorkSortKey = "dueDate" | "priority" | "status" | "updatedAt" | "documentNumber";
export type TeamWorkSortDirection = "asc" | "desc";

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
const STATUS_ORDER = { registered: 0, assigned: 1, in_progress: 2, review: 3, on_hold: 4, completed: 5 } as const;
const PREFIXES: Record<TeamRecordType, string> = {
  work_order: "WO",
  revenue_close: "RC",
  receivable_discount: "RD",
  workforce: "HR",
  capital_project: "CP",
  compliance: "CI",
};

function createRecordNumber(type: TeamRecordType) {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `${PREFIXES[type]}-${stamp}-${String(Date.now()).slice(-6)}`;
}

export function getTeamWorkRecordPath(record: Pick<TeamWorkRecord, "id" | "recordType">) {
  return `/team-work?tab=${record.recordType}&work=${record.id}`;
}

export function normalizeTeamWorkDueDate(value?: string | null): string | null {
  const normalized = value?.trim() || "";
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("처리기한은 YYYY-MM-DD 형식으로 입력해 주세요.");
  }
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("유효한 처리기한을 입력해 주세요.");
  }
  return normalized;
}

export function sortTeamWorkRecords(records: TeamWorkRecord[], key: TeamWorkSortKey, direction: TeamWorkSortDirection) {
  const value = (record: TeamWorkRecord): string | number | null => {
    if (key === "priority") return PRIORITY_ORDER[record.priority];
    if (key === "status") return STATUS_ORDER[record.status];
    return record[key] || null;
  };
  return [...records].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null && right === null) return a.recordNumber.localeCompare(b.recordNumber, "ko", { numeric: true });
    if (left === null) return 1;
    if (right === null) return -1;
    const comparison = typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), "ko", { numeric: true });
    return direction === "asc" ? comparison : -comparison;
  });
}

async function syncTeamWorkDocumentLink(record: TeamWorkRecord) {
  if (!record.documentNumber) return;
  const document = await findOfficialDocumentByNumber(record.documentNumber);
  if (!document) return;
  const legacyLinks = await listRecordDocuments("TEAM_WORK", record.id);
  for (const legacyLink of legacyLinks) {
    await unlinkOfficialDocument(legacyLink.link.id);
  }
  const recordPath = getTeamWorkRecordPath(record);
  await linkOfficialDocument({
    document,
    module: TEAM_WORK_DOCUMENT_MODULE,
    recordId: record.id,
    relationType: "reference",
    recordPath,
    recordLabel: record.title,
  });
  const links = await listRecordDocuments(TEAM_WORK_DOCUMENT_MODULE, record.id);
  const linked = links.find((item) => item.document.id === document.id);
  if (!linked || (linked.link.recordPath === recordPath && linked.link.recordLabel === record.title)) return;
  const { error } = await supabase.from("attachments").update({
    thumbnail_path: recordPath,
    file_name: record.title.slice(0, 500),
  }).eq("id", linked.link.id);
  if (error) throw error;
}

function mapRecord(row: any): TeamWorkRecord {
  const extra = (row.extra || {}) as Record<string, any>;
  return {
    id: row.id,
    recordNumber: extra.record_number || row.name_en || row.code,
    recordType: extra.record_type,
    team: extra.team || "operations",
    title: extra.title || row.name_ko,
    category: extra.category || "기타",
    parkingLot: extra.parking_lot || null,
    ownerName: extra.owner_name || null,
    priority: extra.priority || "normal",
    status: extra.status || "registered",
    dueDate: extra.due_date || null,
    amount: Number(extra.amount || 0),
    documentNumber: extra.document_number || null,
    payload: extra.payload || {},
    createdAt: row.created_at,
    updatedAt: extra.updated_at || row.created_at,
  };
}

export async function listTeamWorkRecords(type?: TeamRecordType): Promise<TeamWorkRecord[]> {
  const { data, error } = await supabase.from("code_master")
    .select("id, code, name_ko, name_en, extra, created_at")
    .eq("group_code", TEAM_WORK_GROUP).eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const records = (data || []).map(mapRecord);
  return type ? records.filter((record) => record.recordType === type) : records;
}

export async function createTeamWorkRecord(input: TeamWorkInput): Promise<TeamWorkRecord> {
  if (!input.title.trim()) throw new Error("업무 제목을 입력해 주세요.");
  const recordNumber = createRecordNumber(input.recordType);
  const dueDate = normalizeTeamWorkDueDate(input.dueDate);
  const now = new Date().toISOString();
  const extra = {
    registry_version: 1,
    record_number: recordNumber,
    record_type: input.recordType,
    team: input.team,
    title: input.title.trim(),
    category: input.category,
    parking_lot: input.parkingLot || null,
    owner_name: input.ownerName || null,
    priority: input.priority || "normal",
    status: input.status || "registered",
    due_date: dueDate,
    amount: Number(input.amount || 0),
    document_number: input.documentNumber || null,
    payload: input.payload || {},
    updated_at: now,
  };
  const { data, error } = await supabase.from("code_master").insert({
    group_code: TEAM_WORK_GROUP,
    code: recordNumber,
    name_ko: input.title.trim().slice(0, 100),
    name_en: recordNumber,
    sort_order: 0,
    is_active: true,
    extra: extra as any,
  }).select("id, code, name_ko, name_en, extra, created_at").single();
  if (error) throw error;
  const record = mapRecord(data);
  await logActivity({ module: "TEAM_WORK", action: "업무등록", targetType: input.recordType, targetId: record.id, targetName: record.recordNumber, details: { title: record.title, team: record.team } });

  if (record.documentNumber) {
    await syncTeamWorkDocumentLink(record);
  }
  return record;
}

export async function updateTeamWorkStatus(record: TeamWorkRecord, status: TeamWorkStatus) {
  const updatedExtra = {
    record_number: record.recordNumber,
    record_type: record.recordType,
    team: record.team,
    title: record.title,
    category: record.category,
    parking_lot: record.parkingLot,
    owner_name: record.ownerName,
    priority: record.priority,
    status,
    due_date: record.dueDate,
    amount: record.amount,
    document_number: record.documentNumber,
    payload: record.payload,
    updated_at: new Date().toISOString(),
    registry_version: 1,
  };
  const { error } = await supabase.from("code_master").update({ extra: updatedExtra as any }).eq("id", record.id).eq("group_code", TEAM_WORK_GROUP);
  if (error) throw error;
  await logActivity({ module: "TEAM_WORK", action: "상태변경", targetType: record.recordType, targetId: record.id, targetName: record.recordNumber, details: { from: record.status, to: status } });
}

export async function updateTeamWorkRecord(record: TeamWorkRecord, input: TeamWorkInput, options: { linkDocument?: boolean } = {}): Promise<TeamWorkRecord> {
  if (!input.title.trim()) throw new Error("업무 제목을 입력해 주세요.");
  const dueDate = normalizeTeamWorkDueDate(input.dueDate);
  const updatedExtra = {
    registry_version: 1,
    record_number: record.recordNumber,
    record_type: input.recordType,
    team: input.team,
    title: input.title.trim(),
    category: input.category,
    parking_lot: input.parkingLot || null,
    owner_name: input.ownerName || null,
    priority: input.priority || record.priority,
    status: input.status || record.status,
    due_date: dueDate,
    amount: Number(input.amount || 0),
    document_number: input.documentNumber || null,
    payload: input.payload || {},
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("code_master").update({
    name_ko: input.title.trim().slice(0, 100),
    extra: updatedExtra as any,
  }).eq("id", record.id).eq("group_code", TEAM_WORK_GROUP)
    .select("id, code, name_ko, name_en, extra, created_at").single();
  if (error) throw error;
  const updated = mapRecord(data);
  await logActivity({ module: "TEAM_WORK", action: "업무수정", targetType: updated.recordType, targetId: updated.id, targetName: updated.recordNumber, details: { title: updated.title, team: updated.team, category: updated.category } });
  if (options.linkDocument !== false && updated.documentNumber) {
    await syncTeamWorkDocumentLink(updated);
  }
  return updated;
}

export async function archiveTeamWorkRecord(record: TeamWorkRecord) {
  const { error } = await supabase.from("code_master").update({ is_active: false }).eq("id", record.id).eq("group_code", TEAM_WORK_GROUP);
  if (error) throw error;
  await logActivity({ module: "TEAM_WORK", action: "업무보관", targetType: record.recordType, targetId: record.id, targetName: record.recordNumber, details: { title: record.title, team: record.team } });
}

export function isTeamWorkOverdue(record: Pick<TeamWorkRecord, "dueDate" | "status">) {
  return Boolean(record.dueDate && record.status !== "completed" && record.dueDate < new Date().toISOString().slice(0, 10));
}
