import { supabase } from "@/integrations/supabase/client";
import { TEAM_DUTIES, type TeamDuty } from "@/config/team-duty-catalog";
import { logActivity } from "@/lib/activity-logger";

const DUTY_GROUP = "TEAM_DUTY_ASSIGNMENT";
const WORKFLOW_DESTINATIONS: Record<string, { destination: string; label: string }> = {
  "ops-3822": { destination: "/ops/abandoned-vehicles", label: "방치차량 처리" },
  "ops-3827": { destination: "/ops/security-inspections", label: "관제·보안 점검" },
  "fac-lead": { destination: "/planning/procedures", label: "사업 행정절차" },
  "fac-3242": { destination: "/planning/procedures", label: "사업 행정절차" },
};

export type TeamDutyInput = Omit<TeamDuty, "id">;

function mapDuty(row: any): TeamDuty {
  const extra = (row.extra || {}) as Record<string, any>;
  return {
    id: row.id,
    team: extra.team,
    area: extra.area || row.name_ko,
    role: extra.role || "주무관",
    phone: extra.phone || row.name_en || "",
    duties: Array.isArray(extra.duties) ? extra.duties : [],
    recordType: extra.record_type || "work_order",
    category: extra.category || "기타",
    destination: extra.destination || "/team-work",
    destinationLabel: extra.destination_label || "팀 업무관리",
  };
}

function toExtra(input: TeamDutyInput, sourceId?: string) {
  const workflowDestination = sourceId ? WORKFLOW_DESTINATIONS[sourceId] : undefined;
  return {
    registry_version: 1,
    source_id: sourceId || null,
    team: input.team,
    area: input.area.trim(),
    role: input.role.trim(),
    phone: input.phone.trim(),
    duties: input.duties.map((item) => item.trim()).filter(Boolean),
    record_type: input.recordType,
    category: input.category.trim(),
    destination: workflowDestination?.destination || input.destination.trim(),
    destination_label: workflowDestination?.label || input.destinationLabel.trim(),
    updated_at: new Date().toISOString(),
  };
}

export async function listTeamDuties(includeArchived = false): Promise<{ duties: TeamDuty[]; persisted: boolean }> {
  const query = supabase.from("code_master")
    .select("id, code, name_ko, name_en, extra, is_active, created_at")
    .eq("group_code", DUTY_GROUP)
    .order("sort_order", { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) return { duties: includeArchived ? [] : TEAM_DUTIES, persisted: false };
  const rows = includeArchived ? data : data.filter((row) => row.is_active);
  return { duties: rows.map(mapDuty), persisted: true };
}

export async function seedTeamDuties() {
  const { data: existing, error: readError } = await supabase.from("code_master")
    .select("code").eq("group_code", DUTY_GROUP);
  if (readError) throw readError;
  const codes = new Set((existing || []).map((row) => row.code));
  const rows = TEAM_DUTIES.map((duty, index) => ({
    group_code: DUTY_GROUP,
    code: `DUTY-${duty.id.toUpperCase()}`,
    name_ko: duty.area,
    name_en: duty.phone,
    sort_order: index + 1,
    is_active: true,
    extra: toExtra(duty, duty.id) as any,
  })).filter((row) => !codes.has(row.code));
  if (rows.length) {
    const { error } = await supabase.from("code_master").insert(rows);
    if (error) throw error;
  }
  await logActivity({ module: "TEAM_DUTY", action: "기준업무적재", targetType: "team_duty", details: { inserted_count: rows.length } });
  return rows.length;
}

export async function createTeamDuty(input: TeamDutyInput) {
  if (!input.area.trim() || !input.duties.length) throw new Error("업무영역과 세부업무를 입력해 주세요.");
  const code = `DUTY-${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await supabase.from("code_master").insert({
    group_code: DUTY_GROUP,
    code,
    name_ko: input.area.trim(),
    name_en: input.phone.trim(),
    sort_order: 999,
    is_active: true,
    extra: toExtra(input) as any,
  }).select("id, code, name_ko, name_en, extra, is_active, created_at").single();
  if (error) throw error;
  const duty = mapDuty(data);
  await logActivity({ module: "TEAM_DUTY", action: "업무분장추가", targetType: "team_duty", targetId: duty.id, targetName: duty.area, details: { team: duty.team, phone: duty.phone } });
  return duty;
}

export async function updateTeamDuty(id: string, input: TeamDutyInput) {
  if (!input.area.trim() || !input.duties.length) throw new Error("업무영역과 세부업무를 입력해 주세요.");
  const { data, error } = await supabase.from("code_master").update({
    name_ko: input.area.trim(),
    name_en: input.phone.trim(),
    extra: toExtra(input) as any,
  }).eq("id", id).eq("group_code", DUTY_GROUP)
    .select("id, code, name_ko, name_en, extra, is_active, created_at").single();
  if (error) throw error;
  const duty = mapDuty(data);
  await logActivity({ module: "TEAM_DUTY", action: "업무분장수정", targetType: "team_duty", targetId: duty.id, targetName: duty.area, details: { team: duty.team, phone: duty.phone, duty_count: duty.duties.length } });
  return duty;
}

export async function archiveTeamDuty(duty: TeamDuty) {
  const { error } = await supabase.from("code_master").update({ is_active: false }).eq("id", duty.id).eq("group_code", DUTY_GROUP);
  if (error) throw error;
  await logActivity({ module: "TEAM_DUTY", action: "업무분장보관", targetType: "team_duty", targetId: duty.id, targetName: duty.area, details: { team: duty.team, phone: duty.phone } });
}
