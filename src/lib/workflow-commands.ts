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

export function advanceComplaint(
  complaintId: string,
  action: "start" | "external_wait" | "respond" | "close" | "reopen",
  options: {
    expectedUpdatedAt?: string | null;
    response?: string;
    responseType?: string;
    responseChannel?: string;
    noVisitReason?: string;
    resolutionType?: string;
    resolutionSummary?: string;
    pendingOrganization?: string;
    pendingReason?: string;
    followUpDate?: string;
    reopenReason?: string;
  } = {},
) {
  return runWorkflowCommand("advance_complaint", {
    p_complaint_id: complaintId,
    p_action: action,
    p_expected_updated_at: options.expectedUpdatedAt || null,
    p_response: options.response || null,
    p_response_type: options.responseType || null,
    p_response_channel: options.responseChannel || null,
    p_no_visit_reason: options.noVisitReason || null,
    p_resolution_type: options.resolutionType || null,
    p_resolution_summary: options.resolutionSummary || null,
    p_pending_organization: options.pendingOrganization || null,
    p_pending_reason: options.pendingReason || null,
    p_follow_up_date: options.followUpDate || null,
    p_reopen_reason: options.reopenReason || null,
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

export function createSiteCandidate(payload: Record<string, unknown>, clientMutationId: string) {
  return runWorkflowCommand("create_site_candidate", {
    p_payload: payload,
    p_client_mutation_id: clientMutationId,
  });
}

export function decideSiteCandidate(
  siteId: string,
  status: "evaluating" | "selected" | "rejected",
  note: string,
  expectedVersion?: number | null,
) {
  return runWorkflowCommand("decide_site_candidate", {
    p_site_id: siteId,
    p_status: status,
    p_note: note,
    p_expected_version: expectedVersion ?? null,
  });
}

export function createConstructionProject(input: {
  siteId: string;
  projectName: string;
  projectType: string;
  description?: string;
  contractor?: string;
  supervisor?: string;
  designer?: string;
  targetCompletion?: string;
  designCost?: number;
  constructionCost?: number;
  supervisionCost?: number;
  otherCost?: number;
  authorName?: string;
  clientMutationId: string;
}) {
  return runWorkflowCommand("create_construction_project", {
    p_site_id: input.siteId,
    p_project_name: input.projectName,
    p_project_type: input.projectType,
    p_description: input.description || null,
    p_contractor: input.contractor || null,
    p_supervisor: input.supervisor || null,
    p_designer: input.designer || null,
    p_target_completion: input.targetCompletion || null,
    p_design_cost: input.designCost || 0,
    p_construction_cost: input.constructionCost || 0,
    p_supervision_cost: input.supervisionCost || 0,
    p_other_cost: input.otherCost || 0,
    p_author_name: input.authorName || null,
    p_client_mutation_id: input.clientMutationId,
  });
}

export function advanceConstructionPhase(projectId: string, phase: string, expectedVersion?: number | null) {
  return runWorkflowCommand("advance_construction_phase", {
    p_project_id: projectId,
    p_target_phase: phase,
    p_expected_version: expectedVersion ?? null,
  });
}

export function linkConstructionProjectSources(
  projectId: string,
  input: { budgetItemId: string; bidContractId: string; serviceProjectId?: string; expectedVersion?: number | null },
) {
  return runWorkflowCommand("link_construction_project_sources", {
    p_project_id: projectId,
    p_budget_item_id: input.budgetItemId,
    p_bid_contract_id: input.bidContractId,
    p_service_project_id: input.serviceProjectId || null,
    p_expected_version: input.expectedVersion ?? null,
  });
}

export function advancePermit(
  permitId: string,
  action: "submit" | "approve" | "conditional_approve" | "reject" | "supplement",
  options: {
    permitNumber?: string;
    documentNumber?: string;
    note?: string;
    expiryDate?: string;
    expectedVersion?: number | null;
  } = {},
) {
  return runWorkflowCommand("advance_permit", {
    p_permit_id: permitId,
    p_action: action,
    p_permit_number: options.permitNumber || null,
    p_document_number: options.documentNumber || null,
    p_note: options.note || null,
    p_expiry_date: options.expiryDate || null,
    p_expected_version: options.expectedVersion ?? null,
  });
}

export function reviewPlanningDocument(documentId: string, status: string, comments: string, expectedVersion?: number | null) {
  return runWorkflowCommand("review_planning_document", {
    p_document_id: documentId,
    p_status: status,
    p_comments: comments || null,
    p_expected_version: expectedVersion ?? null,
  });
}

export function archivePlanningDocument(documentId: string, reason: string) {
  return runWorkflowCommand("archive_design_document", {
    p_document_id: documentId,
    p_reason: reason,
  });
}

export function createRealtimeGateway(payload: Record<string, unknown>, clientMutationId: string) {
  return runWorkflowCommand("create_realtime_gateway", {
    p_payload: payload,
    p_client_mutation_id: clientMutationId,
  });
}

export function createRealtimeSensor(payload: Record<string, unknown>, clientMutationId: string) {
  return runWorkflowCommand("create_realtime_sensor", {
    p_payload: payload,
    p_client_mutation_id: clientMutationId,
  });
}

export function createRealtimeDisplay(payload: Record<string, unknown>, clientMutationId: string) {
  return runWorkflowCommand("create_realtime_display", {
    p_payload: payload,
    p_client_mutation_id: clientMutationId,
  });
}

export function queueDisplayPush(boardId: string, clientMutationId: string) {
  return runWorkflowCommand<{ id: string; status: string; message: string; replayed: boolean }>("queue_display_push", {
    p_board_id: boardId,
    p_client_mutation_id: clientMutationId,
  });
}

export function updateRealtimeDevice(kind: "gateway" | "sensor" | "display", id: string, payload: Record<string, unknown>, expectedVersion: number) {
  return runWorkflowCommand("update_realtime_device", { p_kind: kind, p_id: id, p_payload: payload, p_expected_version: expectedVersion });
}

export function archiveRealtimeDevice(kind: "gateway" | "sensor" | "display", id: string, reason: string, expectedVersion: number) {
  return runWorkflowCommand("archive_realtime_device", { p_kind: kind, p_id: id, p_reason: reason, p_expected_version: expectedVersion });
}
