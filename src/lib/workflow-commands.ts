import { supabase } from "@/integrations/supabase/client";

type RpcResult<T> = { data: T | null; error: { message: string } | null };

async function runWorkflowCommand<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(name, args) as RpcResult<T[]>;
  if (error) throw new Error(error.message);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error("처리 결과를 확인할 수 없습니다.");
  return result as T;
}

export function assignComplaint(
  complaintId: string,
  assigneeId: string,
  expectedUpdatedAt?: string | null,
) {
  return runWorkflowCommand("assign_complaint", {
    p_complaint_id: complaintId,
    p_assignee_id: assigneeId,
    p_expected_updated_at: expectedUpdatedAt || null,
  });
}

export function submitSurvey(surveyId: string, expectedUpdatedAt?: string | null) {
  return runWorkflowCommand("submit_survey", {
    p_survey_id: surveyId,
    p_expected_updated_at: expectedUpdatedAt || null,
  });
}

export function decideSurvey(
  surveyId: string,
  decision: "review" | "approved" | "rejected",
  options: { reason?: string; syncToLot?: boolean; expectedUpdatedAt?: string | null } = {},
) {
  return runWorkflowCommand("decide_survey", {
    p_survey_id: surveyId,
    p_decision: decision,
    p_reason: options.reason || null,
    p_sync_to_lot: options.syncToLot ?? false,
    p_expected_updated_at: options.expectedUpdatedAt || null,
  });
}

export function advanceMaintenanceWork(
  logId: string,
  action: "assign" | "start" | "wait_parts" | "resume" | "complete" | "verify" | "cancel",
  options: {
    assigneeId?: string;
    resolution?: string;
    evidencePath?: string;
    expectedUpdatedAt?: string | null;
  } = {},
) {
  return runWorkflowCommand("advance_maintenance_work", {
    p_log_id: logId,
    p_action: action,
    p_assignee_id: options.assigneeId || null,
    p_resolution: options.resolution || null,
    p_evidence_path: options.evidencePath || null,
    p_expected_updated_at: options.expectedUpdatedAt || null,
  });
}

export async function generateDueMaintenanceWorkOrders(until?: string) {
  const { data, error } = await (supabase.rpc as any)("generate_due_maintenance_work_orders", {
    p_until: until || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

export function closeRevenuePeriod(lotId: string, periodMonth: string) {
  return runWorkflowCommand("close_revenue_period", {
    p_lot_id: lotId,
    p_period_month: periodMonth,
  });
}

export function reopenRevenuePeriod(lotId: string, periodMonth: string, reason: string) {
  return runWorkflowCommand("reopen_revenue_period", {
    p_lot_id: lotId,
    p_period_month: periodMonth,
    p_reason: reason,
  });
}

export function handoffContractToService(contractId: string, supervisorId?: string) {
  return runWorkflowCommand("handoff_contract_to_service", {
    p_contract_id: contractId,
    p_supervisor_id: supervisorId || null,
  });
}

export function createServiceInspection(projectId: string, input: { type: string; title: string; date: string; targetAmount: number }) {
  return runWorkflowCommand("create_service_inspection", {
    p_project_id: projectId,
    p_inspection_type: input.type,
    p_title: input.title,
    p_inspection_date: input.date,
    p_target_amount: input.targetAmount,
  });
}

export function decideServiceInspection(
  inspectionId: string,
  action: "approve" | "require_correction" | "submit_correction",
  options: { note?: string; correctionDeadline?: string; deductionAmount?: number } = {},
) {
  return runWorkflowCommand("decide_service_inspection", {
    p_inspection_id: inspectionId,
    p_action: action,
    p_note: options.note || null,
    p_correction_deadline: options.correctionDeadline || null,
    p_deduction_amount: options.deductionAmount || 0,
  });
}

export function requestServicePayment(inspectionId: string, paymentType: string, dueDate?: string) {
  return runWorkflowCommand("request_service_payment", {
    p_inspection_id: inspectionId,
    p_payment_type: paymentType,
    p_due_date: dueDate || null,
  });
}

export function advanceServicePayment(paymentId: string, action: "approve" | "pay") {
  return runWorkflowCommand("advance_service_payment", {
    p_payment_id: paymentId,
    p_action: action,
  });
}

export function advanceSensorIncident(
  incidentId: string,
  action: "acknowledge" | "confirm_recovery" | "reopen",
  note?: string,
) {
  return runWorkflowCommand("advance_sensor_incident", {
    p_incident_id: incidentId,
    p_action: action,
    p_note: note || null,
  });
}

export function setConstructionCompletionCheck(
  checkId: string,
  completed: boolean,
  options: { evidencePath?: string; notes?: string } = {},
) {
  return runWorkflowCommand("set_construction_completion_check", {
    p_check_id: checkId,
    p_completed: completed,
    p_evidence_path: options.evidencePath || null,
    p_notes: options.notes || null,
  });
}

export function handoffConstructionToOperations(
  projectId: string,
  input: { lotCode: string; lotName: string; totalSpaces: number; addressRoad?: string },
) {
  return runWorkflowCommand<string>("handoff_construction_to_operations", {
    p_project_id: projectId,
    p_lot_code: input.lotCode,
    p_lot_name: input.lotName,
    p_total_spaces: input.totalSpaces,
    p_address_road: input.addressRoad || null,
  });
}
