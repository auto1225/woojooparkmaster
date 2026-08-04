import { supabase } from "@/integrations/supabase/client";
import { TEAM_DUTIES, type TeamDuty } from "@/config/team-duty-catalog";
import { logActivity } from "@/lib/activity-logger";
import {
  findOfficialDocumentByNumber,
  linkOfficialDocument,
  listOfficialDocuments,
  listRecordDocuments,
  unlinkOfficialDocument,
} from "@/lib/official-document-registry";
import type { LotType } from "@/types/database";

const table = () => (supabase as any).from("team_duty_records");
const DUTY_SELECT =
  "*, primary_assignee:profiles!team_duty_records_primary_assignee_id_fkey(id,name,team), deputy_assignee:profiles!team_duty_records_deputy_assignee_id_fkey(id,name,team)";
const ALLOWED_LOT_TYPES: LotType[] = ["offstreet", "multilevel", "onstreet"];

export type TeamDutyInput = Omit<
  TeamDuty,
  "id" | "rowVersion" | "archivedAt" | "archiveReason"
>;

export interface TeamDutyAssigneeOption {
  id: string;
  name: string;
  team: string;
}

export interface TeamDutyDocumentOption {
  id: string;
  documentNumber: string;
  title: string;
}

function mapDuty(row: any): TeamDuty {
  return {
    id: row.id,
    team: row.team,
    area: row.area,
    role: row.role_name,
    phone: row.phone || "",
    duties: Array.isArray(row.duties) ? row.duties : [],
    recordType: row.record_type,
    category: row.category,
    destination: row.destination,
    destinationLabel: row.destination_label,
    primaryAssigneeId: row.primary_assignee_id || null,
    primaryAssigneeName: row.primary_assignee?.name || null,
    deputyAssigneeId: row.deputy_assignee_id || null,
    deputyAssigneeName: row.deputy_assignee?.name || null,
    effectiveFrom: row.effective_from || null,
    effectiveTo: row.effective_to || null,
    lotTypes: (row.lot_types || ALLOWED_LOT_TYPES) as LotType[],
    documentId: row.document_id || null,
    documentNumber: row.document_number || null,
    assignmentStatus: row.assignment_status || "active",
    handoverDueDate: row.handover_due_date || null,
    handoverNote: row.handover_note || null,
    changeReason: row.change_reason || null,
    rowVersion: Number(row.row_version || 1),
    archivedAt: row.archived_at || null,
    archiveReason: row.archive_reason || null,
  };
}

export function validateTeamDutyInput(input: TeamDutyInput) {
  if (!input.area.trim() || !input.duties.length)
    throw new Error("업무영역과 세부업무를 입력해 주세요.");
  if (!input.category.trim()) throw new Error("업무 분류를 입력해 주세요.");
  if (!input.primaryAssigneeId) throw new Error("실제 담당자를 지정해 주세요.");
  if (
    input.deputyAssigneeId &&
    input.deputyAssigneeId === input.primaryAssigneeId
  )
    throw new Error("실제 담당자와 대체·인수 담당자는 서로 달라야 합니다.");
  if (input.phone && !/^0\d{1,2}-\d{3,4}-\d{4}$/.test(input.phone))
    throw new Error(
      "전화번호를 지역번호 또는 휴대전화 형식으로 입력해 주세요.",
    );
  if (
    !input.lotTypes?.length ||
    input.lotTypes.some((type) => !ALLOWED_LOT_TYPES.includes(type))
  )
    throw new Error("적용할 주차장 형태를 하나 이상 선택해 주세요.");
  if (
    input.effectiveFrom &&
    input.effectiveTo &&
    input.effectiveTo < input.effectiveFrom
  )
    throw new Error("종료일은 시행일보다 빠를 수 없습니다.");
  if (
    input.assignmentStatus === "handover_pending" &&
    (!input.deputyAssigneeId ||
      !input.handoverDueDate ||
      !input.handoverNote?.trim())
  )
    throw new Error("인수인계 대상자, 기한, 인계 내용을 입력해 주세요.");
  if (
    input.assignmentStatus === "temporary" &&
    (!input.deputyAssigneeId || !input.effectiveTo)
  )
    throw new Error("대체 담당자와 종료일을 입력해 주세요.");
}

async function syncDutyDocumentLink(duty: TeamDuty) {
  const links = await listRecordDocuments("TEAM_DUTY", duty.id);
  const document = await resolveDocument(duty.documentNumber);
  for (const item of links) {
    if (!document || item.document.id !== document.id) {
      await unlinkOfficialDocument(item.link.id);
    }
  }
  if (!document || links.some((item) => item.document.id === document.id))
    return;
  await linkOfficialDocument({
    document,
    module: "TEAM_DUTY",
    recordId: duty.id,
    relationType: "evidence",
    recordPath: `/team-work/duties?duty=${duty.id}`,
    recordLabel: duty.area,
  });
}

async function resolveDocument(documentNumber?: string | null) {
  const value = documentNumber?.trim() || "";
  if (!value) return null;
  const document = await findOfficialDocumentByNumber(value);
  if (!document)
    throw new Error("문서대장에 등록된 근거 문서번호를 선택해 주세요.");
  return document;
}

function inputRow(input: TeamDutyInput, documentId: string | null) {
  return {
    team: input.team,
    area: input.area.trim(),
    role_name: input.role.trim() || "주무관",
    phone: input.phone.trim() || null,
    duties: input.duties.map((item) => item.trim()).filter(Boolean),
    record_type: input.recordType,
    category: input.category.trim(),
    destination: input.destination,
    destination_label: input.destinationLabel,
    primary_assignee_id: input.primaryAssigneeId || null,
    deputy_assignee_id: input.deputyAssigneeId || null,
    effective_from:
      input.effectiveFrom || new Date().toISOString().slice(0, 10),
    effective_to: input.effectiveTo || null,
    lot_types: input.lotTypes,
    document_id: documentId,
    document_number: input.documentNumber?.trim() || null,
    assignment_status: input.assignmentStatus || "active",
    handover_due_date: input.handoverDueDate || null,
    handover_note: input.handoverNote?.trim() || null,
    change_reason: input.changeReason?.trim() || null,
  };
}

async function notifyAssignee(duty: TeamDuty, title: string) {
  if (!duty.primaryAssigneeId) return;
  await supabase.from("notifications").insert({
    user_id: duty.primaryAssigneeId,
    module: "TEAM_DUTY",
    type: duty.assignmentStatus === "handover_pending" ? "warning" : "info",
    title,
    message: `${duty.area} · ${duty.role}`,
    link: `/team-work/duties?duty=${duty.id}`,
  });
}

export async function listTeamDuties(
  includeArchived = false,
): Promise<{ duties: TeamDuty[]; persisted: boolean }> {
  let query = table().select(DUTY_SELECT).order("team").order("area");
  query = includeArchived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return { duties: (data || []).map(mapDuty), persisted: true };
}

export async function listTeamDutyOptions(): Promise<{
  assignees: TeamDutyAssigneeOption[];
  documents: TeamDutyDocumentOption[];
}> {
  const [profilesResult, documents] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, team")
      .eq("is_active", true)
      .order("name"),
    listOfficialDocuments(),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  return {
    assignees: (profilesResult.data || []).map((profile) => ({
      id: profile.id,
      name: profile.name || "이름 미등록",
      team: profile.team,
    })),
    documents: documents.map((document) => ({
      id: document.id,
      documentNumber: document.documentNumber,
      title: document.title,
    })),
  };
}

export async function seedTeamDuties() {
  const rows = TEAM_DUTIES.map((duty) => ({
    duty_code: `DUTY-${duty.id.toUpperCase()}`,
    team: duty.team,
    area: duty.area,
    role_name: duty.role,
    phone: duty.phone,
    duties: duty.duties,
    record_type: duty.recordType,
    category: duty.category,
    destination: duty.destination,
    destination_label: duty.destinationLabel,
    effective_from: new Date().toISOString().slice(0, 10),
    lot_types: ALLOWED_LOT_TYPES,
    assignment_status: "active",
    row_version: 1,
  }));
  const { error } = await table().upsert(rows, {
    onConflict: "duty_code",
    ignoreDuplicates: true,
  });
  if (error) throw error;
  await logActivity({
    module: "TEAM_DUTY",
    action: "기준업무적재",
    targetType: "team_duty",
    details: { inserted_count: rows.length },
  });
  return rows.length;
}

export async function createTeamDuty(input: TeamDutyInput) {
  validateTeamDutyInput(input);
  const document = await resolveDocument(input.documentNumber);
  const dutyCode = `DUTY-${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await table()
    .insert({ duty_code: dutyCode, ...inputRow(input, document?.id || null) })
    .select(DUTY_SELECT)
    .single();
  if (error) {
    if (error.code === "23505")
      throw new Error("같은 팀에 동일한 업무영역이 이미 등록되어 있습니다.");
    throw error;
  }
  const duty = mapDuty(data);
  await syncDutyDocumentLink(duty);
  await notifyAssignee(duty, "새 업무분장이 지정되었습니다");
  await logActivity({
    module: "TEAM_DUTY",
    action: "업무분장추가",
    targetType: "team_duty",
    targetId: duty.id,
    targetName: duty.area,
    details: {
      team: duty.team,
      assignee_id: duty.primaryAssigneeId,
      lot_types: duty.lotTypes,
      document_number: duty.documentNumber,
    },
  });
  return duty;
}

export async function updateTeamDuty(duty: TeamDuty, input: TeamDutyInput) {
  validateTeamDutyInput(input);
  if (!input.changeReason?.trim())
    throw new Error("변경 사유를 입력해 주세요.");
  const document = await resolveDocument(input.documentNumber);
  const { data, error } = await table()
    .update(inputRow(input, document?.id || null))
    .eq("id", duty.id)
    .eq("row_version", duty.rowVersion || 1)
    .select(DUTY_SELECT)
    .single();
  if (error) {
    if (error.code === "PGRST116")
      throw new Error(
        "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.",
      );
    if (error.code === "23505")
      throw new Error("같은 팀에 동일한 업무영역이 이미 등록되어 있습니다.");
    throw error;
  }
  const updated = mapDuty(data);
  await syncDutyDocumentLink(updated);
  if (
    updated.primaryAssigneeId !== duty.primaryAssigneeId ||
    updated.assignmentStatus !== duty.assignmentStatus
  )
    await notifyAssignee(
      updated,
      updated.assignmentStatus === "handover_pending"
        ? "업무 인수인계가 요청되었습니다"
        : "업무분장이 변경되었습니다",
    );
  await logActivity({
    module: "TEAM_DUTY",
    action: "업무분장수정",
    targetType: "team_duty",
    targetId: updated.id,
    targetName: updated.area,
    details: {
      before: {
        assignee_id: duty.primaryAssigneeId,
        status: duty.assignmentStatus,
        lot_types: duty.lotTypes,
      },
      after: {
        assignee_id: updated.primaryAssigneeId,
        status: updated.assignmentStatus,
        lot_types: updated.lotTypes,
      },
      reason: updated.changeReason,
      document_number: updated.documentNumber,
    },
  });
  return updated;
}

export async function archiveTeamDuty(duty: TeamDuty, reason: string) {
  if (!reason.trim()) throw new Error("보관 사유를 입력해 주세요.");
  const { error } = await table()
    .update({
      archived_at: new Date().toISOString(),
      archive_reason: reason.trim(),
    })
    .eq("id", duty.id)
    .eq("row_version", duty.rowVersion || 1)
    .select("id")
    .single();
  if (error) throw error;
  await logActivity({
    module: "TEAM_DUTY",
    action: "업무분장보관",
    targetType: "team_duty",
    targetId: duty.id,
    targetName: duty.area,
    details: { reason },
  });
}

export async function restoreTeamDuty(duty: TeamDuty) {
  const { error } = await table()
    .update({ archived_at: null, archive_reason: null })
    .eq("id", duty.id)
    .eq("row_version", duty.rowVersion || 1)
    .select("id")
    .single();
  if (error) throw error;
  await logActivity({
    module: "TEAM_DUTY",
    action: "업무분장복구",
    targetType: "team_duty",
    targetId: duty.id,
    targetName: duty.area,
  });
}
