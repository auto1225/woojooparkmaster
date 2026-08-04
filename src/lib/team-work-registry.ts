import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-logger";
import {
  findOfficialDocumentByNumber,
  linkOfficialDocument,
  listRecordDocuments,
  unlinkOfficialDocument,
} from "@/lib/official-document-registry";
import type {
  TeamRecordType,
  TeamWorkAssigneeOption,
  TeamWorkInput,
  TeamWorkParkingLotOption,
  TeamWorkRecord,
  TeamWorkStatus,
} from "@/types/team-work";

export const TEAM_WORK_DOCUMENT_MODULE = "team-work";
export type TeamWorkSortKey =
  | "dueDate"
  | "priority"
  | "status"
  | "updatedAt"
  | "documentNumber"
  | "recordNumber"
  | "title"
  | "parkingLot"
  | "ownerName"
  | "amount";
export type TeamWorkSortDirection = "asc" | "desc";

const table = () => (supabase as any).from("team_work_records");
const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
const STATUS_ORDER = {
  registered: 0,
  assigned: 1,
  in_progress: 2,
  review: 3,
  on_hold: 4,
  completed: 5,
} as const;
const PREFIXES: Record<TeamRecordType, string> = {
  work_order: "WO",
  revenue_close: "RC",
  receivable_discount: "RD",
  workforce: "HR",
  capital_project: "CP",
  compliance: "CI",
};

const STATUS_NOTIFICATION_LABELS: Partial<Record<TeamWorkStatus, string>> = {
  assigned: "업무가 배정되었습니다",
  in_progress: "업무 처리가 시작되었습니다",
  review: "업무 검토가 요청되었습니다",
  on_hold: "업무가 보류되었습니다",
  completed: "업무가 완료되었습니다",
};

async function notifyTeamWorkOwner(
  record: TeamWorkRecord,
  title: string,
  message: string,
  type = "info",
) {
  if (!record.ownerId) return;
  await supabase.from("notifications").insert({
    user_id: record.ownerId,
    module: "TEAM_WORK",
    type,
    title,
    message,
    link: getTeamWorkRecordPath(record),
  });
}

function createRecordNumber(type: TeamRecordType) {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `${PREFIXES[type]}-${stamp}-${String(Date.now()).slice(-6)}`;
}

export function getTeamWorkRecordPath(
  record: Pick<TeamWorkRecord, "id" | "recordType">,
) {
  return `/team-work?tab=${record.recordType}&work=${record.id}`;
}

export function normalizeTeamWorkDueDate(value?: string | null): string | null {
  const normalized = value?.trim() || "";
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized))
    throw new Error("처리기한은 YYYY-MM-DD 형식으로 입력해 주세요.");
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new Error("유효한 처리기한을 입력해 주세요.");
  return normalized;
}

export function sortTeamWorkRecords(
  records: TeamWorkRecord[],
  key: TeamWorkSortKey,
  direction: TeamWorkSortDirection,
) {
  const value = (record: TeamWorkRecord): string | number | null => {
    if (key === "priority") return PRIORITY_ORDER[record.priority];
    if (key === "status") return STATUS_ORDER[record.status];
    return record[key] || null;
  };
  return [...records].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null && right === null)
      return a.recordNumber.localeCompare(b.recordNumber, "ko", {
        numeric: true,
      });
    if (left === null) return 1;
    if (right === null) return -1;
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "ko", { numeric: true });
    return direction === "asc" ? comparison : -comparison;
  });
}

function mapRecord(row: any): TeamWorkRecord {
  return {
    id: row.id,
    recordNumber: row.record_number,
    recordType: row.record_type,
    team: row.team,
    title: row.title,
    category: row.category,
    parkingLotId: row.lot_id || null,
    parkingLot: row.parking_lots?.name || row.parking_lot_name || null,
    parkingLotType: row.parking_lots?.lot_type || row.lot_type_snapshot || null,
    ownerId: row.owner_id || null,
    ownerName: row.profiles?.name || row.owner_name || null,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date || null,
    amount: Number(row.amount || 0),
    documentNumber: row.document_number || null,
    reviewerName: row.reviewer_name || null,
    nextAction: row.next_action || null,
    holdReason: row.hold_reason || null,
    sourceModule: row.source_module || null,
    sourceRecordId: row.source_record_id || null,
    sourcePath: row.source_path || null,
    rowVersion: Number(row.row_version || 1),
    archivedAt: row.archived_at || null,
    archiveReason: row.archive_reason || null,
    payload: row.payload || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TEAM_WORK_SELECT =
  "*, parking_lots(name, lot_type), profiles!team_work_records_owner_id_fkey(name)";

export async function listTeamWorkRecords(
  type?: TeamRecordType,
  archived = false,
): Promise<TeamWorkRecord[]> {
  let query = table()
    .select(TEAM_WORK_SELECT)
    .order("created_at", { ascending: false });
  query = archived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);
  if (type) query = query.eq("record_type", type);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapRecord);
}

export async function listTeamWorkOptions(): Promise<{
  parkingLots: TeamWorkParkingLotOption[];
  assignees: TeamWorkAssigneeOption[];
}> {
  const [lotsResult, profilesResult] = await Promise.all([
    supabase
      .from("parking_lots")
      .select("id, code, name, lot_type")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("profiles")
      .select("id, name, team")
      .eq("is_active", true)
      .order("name"),
  ]);
  if (lotsResult.error) throw lotsResult.error;
  if (profilesResult.error) throw profilesResult.error;
  return {
    parkingLots: (lotsResult.data || []).map((lot) => ({
      id: lot.id,
      code: lot.code,
      name: lot.name,
      lotType: lot.lot_type,
    })),
    assignees: (profilesResult.data || []).map((profile) => ({
      id: profile.id,
      name: profile.name || "이름 미등록",
      team: profile.team,
    })),
  };
}

async function resolveDocument(documentNumber?: string | null) {
  const normalized = documentNumber?.trim() || "";
  if (!normalized) return null;
  const document = await findOfficialDocumentByNumber(normalized);
  if (!document)
    throw new Error(
      "문서대장에 등록되지 않은 문서번호입니다. 문서를 먼저 등록하거나 기존 문서를 연결해 주세요.",
    );
  return document;
}

export function validateTeamWorkTransition(
  record: TeamWorkRecord,
  status: TeamWorkStatus,
) {
  if (
    ["assigned", "in_progress", "review", "completed"].includes(status) &&
    !record.ownerId &&
    !record.ownerName
  )
    throw new Error("담당자를 먼저 지정해 주세요.");
  if (
    ["assigned", "in_progress", "review", "completed"].includes(status) &&
    !record.dueDate
  )
    throw new Error("처리기한을 먼저 지정해 주세요.");
  if (["review", "completed"].includes(status) && !record.reviewerName?.trim())
    throw new Error("검토자를 먼저 지정해 주세요.");
  if (status === "on_hold" && !record.holdReason?.trim())
    throw new Error("보류 사유를 먼저 입력해 주세요.");
  if (status === "completed") {
    const evidenceByType: Record<TeamRecordType, string[]> = {
      work_order: ["evidence"],
      revenue_close: ["sealNumber"],
      receivable_discount: ["evidence", "action"],
      workforce: ["note"],
      capital_project: ["nextGate"],
      compliance: ["result", "evidence"],
    };
    const hasEvidence =
      evidenceByType[record.recordType].some((key) =>
        String(record.payload[key] || "").trim(),
      ) &&
      (record.recordType !== "capital_project" ||
        Boolean(record.documentNumber));
    if (!hasEvidence)
      throw new Error(
        "완료하려면 관련 문서번호 또는 완료 근거·처리 결과를 입력해 주세요.",
      );
  }
}

function inputRow(
  input: TeamWorkInput,
  documentId: string | null,
  fallback?: TeamWorkRecord,
) {
  const lotType = input.parkingLotType || fallback?.parkingLotType || null;
  return {
    record_type: input.recordType,
    team: input.team,
    title: input.title.trim(),
    category: input.category,
    lot_id: input.parkingLotId || null,
    parking_lot_name: input.parkingLot || null,
    lot_type_snapshot: lotType,
    owner_id: input.ownerId || null,
    owner_name: input.ownerName || null,
    priority: input.priority || fallback?.priority || "normal",
    status: input.status || fallback?.status || "registered",
    due_date: normalizeTeamWorkDueDate(input.dueDate),
    amount: Number(input.amount || 0),
    document_id: documentId,
    document_number: input.documentNumber?.trim() || null,
    reviewer_name: input.reviewerName || null,
    next_action: input.nextAction || null,
    hold_reason: input.holdReason || null,
    source_module: input.sourceModule || fallback?.sourceModule || null,
    source_record_id: input.sourceRecordId || fallback?.sourceRecordId || null,
    source_path: input.sourcePath || fallback?.sourcePath || null,
    client_mutation_id: input.clientMutationId || null,
    payload: input.payload || {},
  };
}

async function syncTeamWorkDocumentLink(record: TeamWorkRecord) {
  const legacyLinks = await listRecordDocuments("TEAM_WORK", record.id);
  const canonicalLinks = await listRecordDocuments(
    TEAM_WORK_DOCUMENT_MODULE,
    record.id,
  );
  const document = await resolveDocument(record.documentNumber);
  for (const item of legacyLinks) await unlinkOfficialDocument(item.link.id);
  for (const item of canonicalLinks)
    if (!document || item.document.id !== document.id)
      await unlinkOfficialDocument(item.link.id);
  if (!document) return;
  await linkOfficialDocument({
    document,
    module: TEAM_WORK_DOCUMENT_MODULE,
    recordId: record.id,
    relationType: "reference",
    recordPath: getTeamWorkRecordPath(record),
    recordLabel: record.title,
  });
}

export async function createTeamWorkRecord(
  input: TeamWorkInput,
): Promise<TeamWorkRecord> {
  if (!input.title.trim()) throw new Error("업무 제목을 입력해 주세요.");
  const document = await resolveDocument(input.documentNumber);
  const { data, error } = await table()
    .insert({
      record_number: createRecordNumber(input.recordType),
      ...inputRow(input, document?.id || null),
    })
    .select(TEAM_WORK_SELECT)
    .single();
  if (error) {
    if (error.code === "23505" && input.sourceRecordId)
      throw new Error(
        "이 원본 업무에는 이미 활성 팀 업무가 연결되어 있습니다.",
      );
    throw error;
  }
  const record = mapRecord(data);
  await syncTeamWorkDocumentLink(record);
  await logActivity({
    module: "TEAM_WORK",
    action: "업무등록",
    targetType: input.recordType,
    targetId: record.id,
    targetName: record.recordNumber,
    details: { title: record.title, team: record.team },
  });
  await notifyTeamWorkOwner(
    record,
    "새 팀 업무가 등록되었습니다",
    `${record.recordNumber} · ${record.title}${record.dueDate ? ` · 기한 ${record.dueDate}` : ""}`,
  );
  return record;
}

export async function updateTeamWorkStatus(
  record: TeamWorkRecord,
  status: TeamWorkStatus,
) {
  validateTeamWorkTransition(record, status);
  const { error } = await table()
    .update({ status })
    .eq("id", record.id)
    .eq("row_version", record.rowVersion)
    .select("id")
    .single();
  if (error) {
    if (error.code === "PGRST116")
      throw new Error(
        "다른 사용자가 먼저 수정했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.",
      );
    throw error;
  }
  await logActivity({
    module: "TEAM_WORK",
    action: "상태변경",
    targetType: record.recordType,
    targetId: record.id,
    targetName: record.recordNumber,
    details: { from: record.status, to: status },
  });
  const notificationTitle = STATUS_NOTIFICATION_LABELS[status];
  if (notificationTitle) {
    await notifyTeamWorkOwner(
      record,
      notificationTitle,
      `${record.recordNumber} · ${record.title}`,
      status === "on_hold" ? "warning" : "info",
    );
  }
}

export async function updateTeamWorkRecord(
  record: TeamWorkRecord,
  input: TeamWorkInput,
  options: { linkDocument?: boolean } = {},
): Promise<TeamWorkRecord> {
  if (!input.title.trim()) throw new Error("업무 제목을 입력해 주세요.");
  const document = await resolveDocument(input.documentNumber);
  const { data, error } = await table()
    .update(inputRow(input, document?.id || null, record))
    .eq("id", record.id)
    .eq("row_version", record.rowVersion)
    .select(TEAM_WORK_SELECT)
    .single();
  if (error) {
    if (error.code === "PGRST116")
      throw new Error(
        "다른 사용자가 먼저 수정했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.",
      );
    throw error;
  }
  const updated = mapRecord(data);
  if (options.linkDocument !== false) await syncTeamWorkDocumentLink(updated);
  await logActivity({
    module: "TEAM_WORK",
    action: "업무수정",
    targetType: updated.recordType,
    targetId: updated.id,
    targetName: updated.recordNumber,
    details: {
      title: updated.title,
      team: updated.team,
      category: updated.category,
    },
  });
  if (
    updated.ownerId &&
    (updated.ownerId !== record.ownerId || updated.dueDate !== record.dueDate)
  ) {
    await notifyTeamWorkOwner(
      updated,
      updated.ownerId !== record.ownerId
        ? "팀 업무 담당자로 지정되었습니다"
        : "팀 업무 처리기한이 변경되었습니다",
      `${updated.recordNumber} · ${updated.title}${updated.dueDate ? ` · 기한 ${updated.dueDate}` : ""}`,
    );
  }
  return updated;
}

export async function archiveTeamWorkRecord(
  record: TeamWorkRecord,
  reason: string,
) {
  if (!reason.trim()) throw new Error("보관 사유를 입력해 주세요.");
  const { error } = await table()
    .update({
      archived_at: new Date().toISOString(),
      archive_reason: reason.trim(),
    })
    .eq("id", record.id)
    .eq("row_version", record.rowVersion)
    .select("id")
    .single();
  if (error) throw error;
  await logActivity({
    module: "TEAM_WORK",
    action: "업무보관",
    targetType: record.recordType,
    targetId: record.id,
    targetName: record.recordNumber,
    details: { title: record.title, team: record.team },
  });
}

export async function restoreTeamWorkRecord(record: TeamWorkRecord) {
  const { error } = await table()
    .update({ archived_at: null, archive_reason: null })
    .eq("id", record.id)
    .eq("row_version", record.rowVersion)
    .select("id")
    .single();
  if (error) throw error;
  await logActivity({
    module: "TEAM_WORK",
    action: "업무복구",
    targetType: record.recordType,
    targetId: record.id,
    targetName: record.recordNumber,
    details: { title: record.title },
  });
}

export function isTeamWorkOverdue(
  record: Pick<TeamWorkRecord, "dueDate" | "status">,
) {
  return Boolean(
    record.dueDate &&
    record.status !== "completed" &&
    record.dueDate < new Date().toISOString().slice(0, 10),
  );
}
