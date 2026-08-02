import { supabase } from "@/integrations/supabase/client";
import type { ParkingLotComplaintRule } from "@/lib/parking-lot-work-profile";

interface ComplaintWorkInput {
  complaintId: string;
  complaintNumber: string;
  lotId: string;
  title: string;
  content: string;
  locationDetail?: string | null;
  dueDate?: string | null;
  reporterId?: string | null;
  rule: ParkingLotComplaintRule;
}

const PRIORITY_MAP: Record<string, "low" | "medium" | "high" | "critical"> = {
  low: "low",
  normal: "medium",
  high: "high",
  urgent: "critical",
};

export async function createComplaintFacilityWork(input: ComplaintWorkInput) {
  if (!input.rule.createsMaintenanceWork) return null;

  const suffix = input.complaintNumber.replace(/[^A-Z0-9]/gi, "").slice(-12);
  const logNumber = `CW-CM-${suffix}`;
  const { data: existing, error: existingError } = await supabase
    .from("maintenance_logs")
    .select("id, log_number")
    .eq("log_number", logNumber)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const basePayload = {
    log_number: logNumber,
    lot_id: input.lotId,
    maintenance_type: "repair",
    priority: PRIORITY_MAP[input.rule.priority] || "medium",
    title: `[민원 연계] ${input.title}`,
    description: `${input.complaintNumber} ${input.rule.label} 민원에서 자동 생성된 시설 작업입니다.`,
    symptom: [input.content, input.locationDetail ? `위치: ${input.locationDetail}` : ""].filter(Boolean).join("\n"),
    reported_by: input.reporterId || null,
    due_date: input.dueDate || null,
    status: "reported",
    parts_cost: 0,
    labor_cost: 0,
    other_cost: 0,
  };
  const linkedPayload = {
    ...basePayload,
    source_module: "COMPLAINT",
    source_record_id: input.complaintId,
    source_item_key: input.rule.value,
    next_action: "현장 확인 및 담당자 배정",
    idempotency_key: `complaint:${input.complaintId}`,
  };

  const result = await (supabase.from("maintenance_logs") as any)
    .insert(linkedPayload)
    .select("id, log_number")
    .single();
  if (result.error?.code === "PGRST204") {
    throw new Error("시설작업 연계 스키마가 적용되지 않았습니다. 관리자에게 데이터베이스 마이그레이션 적용을 요청하세요.");
  }
  if (result.error?.code === "23505") {
    const duplicate = await supabase.from("maintenance_logs").select("id, log_number").eq("log_number", logNumber).single();
    if (duplicate.error) throw duplicate.error;
    return duplicate.data;
  }
  if (result.error) throw result.error;
  return result.data;
}
