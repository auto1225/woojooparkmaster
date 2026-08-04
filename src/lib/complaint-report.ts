import { PRIMARY_DEPARTMENT } from "@/config/organization";
import { supabase } from "@/integrations/supabase/client";
import {
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  COMMENT_TYPE_LABELS,
  COMPLAINT_STATUS_LABELS,
  PRIORITY_LABELS,
  RESOLUTION_TYPE_LABELS,
  RESPONSE_TYPE_LABELS,
} from "@/types/complaint";
import type {
  OperationsReportModel,
  OperationsReportOrientation,
  OperationsReportTable,
} from "@/lib/operations-report";

export type ComplaintReportSectionId =
  | "overview"
  | "intake"
  | "sla"
  | "assignments"
  | "timeline"
  | "repeats"
  | "prevention"
  | "lot_types"
  | "documents";
export type ComplaintReportSort = "attention" | "date_desc" | "due_asc" | "category" | "lot_type";
export type ComplaintReportOrientation = OperationsReportOrientation;

export interface ComplaintReportField {
  key: string;
  label: string;
  protected?: boolean;
  value: (row: any, dataset: ComplaintReportDataset, options: ComplaintReportOptions) => unknown;
}

export interface ComplaintReportSection {
  id: ComplaintReportSectionId;
  label: string;
  description: string;
  fields: ComplaintReportField[];
  defaultFields: string[];
}

export interface ComplaintReportOptions {
  periodStart: string;
  periodEnd: string;
  asOfDate: string;
  selectedSections: ComplaintReportSectionId[];
  selectedFields: Partial<Record<ComplaintReportSectionId, string[]>>;
  lotTypes: string[];
  statuses: string[];
  sort: ComplaintReportSort;
  orientation: ComplaintReportOrientation;
  includeArchived: boolean;
}

export interface ComplaintEvidenceSource {
  expected: number;
  loaded: number;
  complete: boolean;
}

export interface ComplaintReportEvidenceMetadata {
  complete: boolean;
  collectedAt: string;
  queryLimit: number;
  truncationPolicy: "fail";
  sourceTables: string[];
  filters: {
    periodStart: string;
    periodEnd: string;
    asOfDate: string;
    lotTypes: string[];
    statuses: string[];
    includeArchived: boolean;
  };
  privacy: {
    mode: "minimum";
    excludedFields: string[];
    redactedFreeText: true;
  };
  sources: Record<string, ComplaintEvidenceSource>;
}

export interface ComplaintReportDataset {
  parkingLots: any[];
  complaints: any[];
  relatedComplaints: any[];
  comments: any[];
  facilityWork: any[];
  profiles: any[];
  documentNumbers: Record<string, string[]>;
  evidenceMetadata?: ComplaintReportEvidenceMetadata;
}

export interface ComplaintReportSummary extends Record<string, number> {
  parkingLots: number;
  totalComplaints: number;
  openComplaints: number;
  respondedComplaints: number;
  closedComplaints: number;
  unassignedComplaints: number;
  overdueComplaints: number;
  dueSoonComplaints: number;
  completedWithinSla: number;
  completedLate: number;
  slaComplianceRate: number;
  averageResolutionDays: number;
  repeatComplaints: number;
  reopenedComplaints: number;
  preventionRequired: number;
  preventionCompleted: number;
  timelineEvents: number;
  fieldVisits: number;
  linkedFacilityWork: number;
  officialResponses: number;
  missingOfficialResponses: number;
}

export interface ComplaintReportModel {
  period: { start: string; end: string };
  asOfDate: string;
  lotTypeLabels: string[];
  summary: ComplaintReportSummary;
  sourceCounts: Record<string, number>;
  tables: OperationsReportTable[];
  selectedFieldCount: number;
  protectedFieldCount: number;
  riskNarrative: string;
  evidenceMetadata: ComplaintReportEvidenceMetadata;
}

const QUERY_LIMIT = 5000;
const ID_CHUNK_SIZE = 200;
const OPEN_STATUSES = new Set(["received", "assigned", "in_progress", "pending_external", "reopened"]);
const COMPLETED_STATUSES = new Set(["responded", "closed"]);
const LOT_TYPE_ALIASES: Record<string, string[]> = {
  offstreet: ["offstreet", "off_street", "surface", "vacant_lot"],
  building: ["building", "parking_building", "multilevel", "mechanical", "underground"],
  onstreet: ["onstreet", "on_street"],
};
const LOT_TYPE_LABELS: Record<string, string> = {
  offstreet: "노외주차장", off_street: "노외주차장", surface: "노외주차장", vacant_lot: "노외주차장",
  building: "주차빌딩", parking_building: "주차빌딩", multilevel: "주차빌딩", mechanical: "주차빌딩", underground: "주차빌딩",
  onstreet: "노상주차장", on_street: "노상주차장",
};
const PRIVACY_EXCLUDED_FIELDS = [
  "complainant_name",
  "complainant_phone",
  "complainant_email",
  "complainant_address",
  "vehicle_number",
  "satisfaction_feedback",
];

export const COMPLAINT_LOT_TYPE_OPTIONS = [
  { value: "offstreet", label: "노외주차장" },
  { value: "building", label: "주차빌딩" },
  { value: "onstreet", label: "노상주차장" },
];

const relation = (row: any, key: string) => Array.isArray(row?.[key]) ? row[key][0] : row?.[key];
const text = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);
const dateOnly = (value: unknown) => value ? String(value).split("T")[0] : "-";
const dateTime = (value: unknown) => value ? String(value).replace("T", " ").replace("Z", "").slice(0, 16) : "-";
const unique = (values: unknown[]) => [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
const isArchived = (row: any) => Boolean(row?.archived_at);
const statusLabel = (value: unknown) => COMPLAINT_STATUS_LABELS[String(value || "")] || text(value);
const categoryLabel = (value: unknown) => CATEGORY_LABELS[String(value || "")] || text(value);
const priorityLabel = (value: unknown) => PRIORITY_LABELS[String(value || "")] || text(value);
const lot = (row: any) => relation(row, "parking_lots");
const lotName = (row: any) => lot(row)?.name || row?.parking_lot_name || "주차장 미지정";
const lotType = (row: any) => row?.lot_type_at_event || lot(row)?.lot_type || row?.parking_lot_type || "";
const lotTypeLabel = (row: any) => LOT_TYPE_LABELS[lotType(row)] || lotType(row) || "미지정";
const documentKey = (id: string) => `COMPLAINT:${id}`;

export function redactComplaintFreeText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value)
    .replace(/\b\d{6}\s*-\s*\d{7}\b/g, "[주민번호 비공개]")
    .replace(/\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[전화번호 비공개]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일 비공개]")
    .replace(/\b\d{2,3}\s?[가-힣]\s?\d{4}\b/g, "[차량번호 비공개]");
}

function utcDay(value: unknown) {
  const date = dateOnly(value);
  if (date === "-") return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function daysBetween(start: unknown, end: unknown) {
  const startTime = utcDay(start);
  const endTime = utcDay(end);
  return startTime === null || endTime === null ? null : Math.max(0, Math.round((endTime - startTime) / 86_400_000));
}

function daysUntil(dueDate: unknown, asOfDate: string) {
  const due = utcDay(dueDate);
  const asOf = utcDay(asOfDate);
  return due === null || asOf === null ? null : Math.round((due - asOf) / 86_400_000);
}

function completionDate(row: any) {
  return row.closed_at || row.responded_at || null;
}

function slaState(row: any, asOfDate: string) {
  if (!row.due_date) return "기한 미설정";
  const completedAt = completionDate(row);
  if (completedAt) return dateOnly(completedAt) <= dateOnly(row.due_date) ? "기한 내 완료" : "기한 초과 완료";
  const remaining = daysUntil(row.due_date, asOfDate);
  if (remaining === null) return "기한 확인 필요";
  if (remaining < 0) return "기한 초과";
  if (remaining <= 1) return "기한 임박";
  return "진행 중";
}

function profileName(id: unknown, dataset: ComplaintReportDataset) {
  if (!id) return "-";
  return dataset.profiles.find(profile => profile.id === id)?.name || "담당자 배정됨";
}

function assignedTeamLabel(value: unknown) {
  const labels: Record<string, string> = { operations: "운영팀", facilities: "시설팀", operation: "운영팀", facility: "시설팀" };
  return labels[String(value || "")] || text(value);
}

function officialDocuments(row: any, dataset: ComplaintReportDataset) {
  return unique(dataset.documentNumbers[documentKey(row.id)] || []);
}

function commentsFor(row: any, dataset: ComplaintReportDataset) {
  return dataset.comments.filter(comment => comment.complaint_id === row.id);
}

function facilityWorkFor(row: any, dataset: ComplaintReportDataset) {
  return dataset.facilityWork.filter(work => work.source_record_id === row.id && String(work.source_module || "").toUpperCase() === "COMPLAINT");
}

function relatedComplaintNumber(row: any, dataset: ComplaintReportDataset) {
  if (!row.related_complaint_id) return "-";
  return [...dataset.complaints, ...dataset.relatedComplaints]
    .find(complaint => complaint.id === row.related_complaint_id)?.complaint_number || "연계 민원 확인 필요";
}

function preventionEvidence(row: any, dataset: ComplaintReportDataset) {
  const commentEvidence = commentsFor(row, dataset).filter(comment => (
    String(comment.action_taken || "").trim()
    || ["closure", "field_visit"].includes(comment.comment_type) && String(comment.content || "").trim()
  ));
  const facilityEvidence = facilityWorkFor(row, dataset).filter(work => (
    ["completed", "verified"].includes(work.status) && String(work.resolution || work.next_action || "").trim()
  ));
  const responseEvidence = /재발|예방|개선|점검|교체/.test(String(row.response || ""));
  return { commentEvidence, facilityEvidence, responseEvidence };
}

function preventionStatus(row: any, dataset: ComplaintReportDataset) {
  if (!row.is_repeat && Number(row.repeat_count || 0) <= 0 && !row.related_complaint_id) return "해당없음";
  const evidence = preventionEvidence(row, dataset);
  const hasEvidence = evidence.commentEvidence.length > 0 || evidence.facilityEvidence.length > 0 || evidence.responseEvidence;
  if (hasEvidence && COMPLETED_STATUSES.has(row.status)) return "조치완료";
  if (hasEvidence) return "조치중";
  return "조치필요";
}

function preventionAction(row: any, dataset: ComplaintReportDataset) {
  const evidence = preventionEvidence(row, dataset);
  const actions = [
    ...evidence.commentEvidence.map(comment => comment.action_taken || comment.content),
    ...evidence.facilityEvidence.map(work => work.resolution || work.next_action),
    evidence.responseEvidence ? row.response : null,
  ].filter(Boolean).map(redactComplaintFreeText);
  return unique(actions).join(" / ") || "재발방지 조치 미등록";
}

function latestFieldFinding(row: any, dataset: ComplaintReportDataset) {
  const comments = commentsFor(row, dataset)
    .filter(comment => comment.comment_type === "field_visit")
    .sort((a, b) => String(b.visit_occurred_at || b.created_at).localeCompare(String(a.visit_occurred_at || a.created_at)));
  const latest = comments[0];
  return latest ? redactComplaintFreeText(latest.visit_outcome || latest.content) : "현장확인 기록 없음";
}

function field(key: string, label: string, value: ComplaintReportField["value"], protectedField = false): ComplaintReportField {
  return { key, label, value, protected: protectedField };
}

export const COMPLAINT_REPORT_SECTIONS: ComplaintReportSection[] = [
  { id: "overview", label: "민원관리 현황", description: "접수·처리·SLA·반복민원·공식답변 핵심지표", fields: [], defaultFields: [] },
  {
    id: "intake", label: "접수현황", description: "채널·유형·우선순위·주차장 형태별 접수대장",
    fields: [
      field("complaint_number", "민원번호", row => row.complaint_number),
      field("received_at", "접수일시", row => dateTime(row.received_at)),
      field("channel", "접수경로", row => CHANNEL_LABELS[row.channel] || text(row.channel)),
      field("category", "민원유형", row => categoryLabel(row.category)),
      field("title", "민원제목", row => redactComplaintFreeText(row.title)),
      field("lot", "대상 주차장", row => lotName(row)),
      field("lot_type", "주차장 형태", row => lotTypeLabel(row)),
      field("priority", "중요도", row => priorityLabel(row.priority)),
      field("status", "처리상태", row => statusLabel(row.status)),
      field("due_date", "처리기한", row => dateOnly(row.due_date)),
      field("saeol_ref", "새올 참조번호", row => row.saeol_ref),
    ],
    defaultFields: ["complaint_number", "received_at", "channel", "category", "title", "lot", "lot_type", "priority", "status", "due_date"],
  },
  {
    id: "sla", label: "처리기한·SLA", description: "처리기한 준수·초과·임박과 처리기간",
    fields: [
      field("complaint_number", "민원번호", row => row.complaint_number),
      field("received_at", "접수일", row => dateOnly(row.received_at)),
      field("due_days", "처리기준", row => row.due_days ? `${row.due_days}일` : "미설정"),
      field("due_date", "처리기한", row => dateOnly(row.due_date)),
      field("assigned_at", "배정일", row => dateOnly(row.assigned_at)),
      field("responded_at", "회신일", row => dateOnly(row.responded_at)),
      field("closed_at", "완결일", row => dateOnly(row.closed_at)),
      field("sla_state", "기한상태", (row, _dataset, options) => slaState(row, options.asOfDate)),
      field("resolution_days", "처리일수", row => {
        const days = daysBetween(row.received_at, completionDate(row));
        return days === null ? "처리중" : `${days}일`;
      }),
      field("status", "처리상태", row => statusLabel(row.status)),
      field("assigned_team", "담당부서", row => assignedTeamLabel(row.assigned_team)),
    ],
    defaultFields: ["complaint_number", "received_at", "due_days", "due_date", "assigned_at", "responded_at", "closed_at", "sla_state", "resolution_days", "status"],
  },
  {
    id: "assignments", label: "배정현황", description: "담당부서·배정시점·미배정·다음 처리행위",
    fields: [
      field("complaint_number", "민원번호", row => row.complaint_number),
      field("category", "민원유형", row => categoryLabel(row.category)),
      field("lot", "대상 주차장", row => lotName(row)),
      field("lot_type", "주차장 형태", row => lotTypeLabel(row)),
      field("assigned_team", "담당부서", row => assignedTeamLabel(row.assigned_team)),
      field("assignment_state", "배정상태", row => row.assigned_to ? "담당자 배정" : "미배정"),
      field("assigned_at", "배정일시", row => dateTime(row.assigned_at)),
      field("status", "처리상태", row => statusLabel(row.status)),
      field("next_action", "다음 조치", row => {
        const labels: Record<string, string> = {
          received: "담당부서·담당자 배정", assigned: "처리 시작 또는 현장확인", in_progress: "처리결과·회신 등록",
          pending_external: "외부기관 회신기한 확인", responded: "완결 검토", reopened: "재개 사유 확인 후 재처리", closed: "사후 재발 여부 점검",
        };
        return labels[row.status] || "처리상태 확인";
      }),
      field("assignee_name", "담당자", (row, dataset) => profileName(row.assigned_to, dataset), true),
    ],
    defaultFields: ["complaint_number", "category", "lot", "lot_type", "assigned_team", "assignment_state", "assigned_at", "status", "next_action"],
  },
  {
    id: "timeline", label: "처리 타임라인", description: "접수·배정·상태변경·현장확인·회신·완결 이력",
    fields: [
      field("complaint_number", "민원번호", row => row.complaint_number),
      field("event_at", "처리일시", row => dateTime(row.event_at)),
      field("event_type", "처리구분", row => row.event_type),
      field("status_transition", "상태변경", row => row.status_transition),
      field("action_summary", "처리내용", row => redactComplaintFreeText(row.action_summary)),
      field("evidence", "증빙", row => row.evidence),
      field("actor_scope", "처리주체", row => row.actor_scope),
      field("author_name", "처리자", row => row.author_name, true),
    ],
    defaultFields: ["complaint_number", "event_at", "event_type", "status_transition", "action_summary", "evidence", "actor_scope"],
  },
  {
    id: "repeats", label: "반복민원", description: "원민원 연계·반복횟수·재개·재발방지 상태",
    fields: [
      field("complaint_number", "민원번호", row => row.complaint_number),
      field("related_number", "원민원번호", (row, dataset) => relatedComplaintNumber(row, dataset)),
      field("category", "민원유형", row => categoryLabel(row.category)),
      field("lot", "대상 주차장", row => lotName(row)),
      field("lot_type", "주차장 형태", row => lotTypeLabel(row)),
      field("repeat_count", "반복횟수", row => `${Math.max(1, Number(row.repeat_count || 0))}회`),
      field("status", "처리상태", row => statusLabel(row.status)),
      field("prevention_state", "재발방지", (row, dataset) => preventionStatus(row, dataset)),
      field("document_number", "공식 답변문서", (row, dataset) => officialDocuments(row, dataset).join(", ") || "미등록"),
    ],
    defaultFields: ["complaint_number", "related_number", "category", "lot", "lot_type", "repeat_count", "status", "prevention_state", "document_number"],
  },
  {
    id: "prevention", label: "재발방지", description: "현장원인·시설작업·예방조치·후속점검 근거",
    fields: [
      field("complaint_number", "민원번호", row => row.complaint_number),
      field("lot", "대상 주차장", row => lotName(row)),
      field("lot_type", "주차장 형태", row => lotTypeLabel(row)),
      field("field_finding", "현장확인", (row, dataset) => latestFieldFinding(row, dataset)),
      field("facility_work", "연계 시설작업", (row, dataset) => facilityWorkFor(row, dataset).map(work => work.log_number || work.title).join(", ") || "연계 작업 없음"),
      field("prevention_action", "재발방지 조치", (row, dataset) => preventionAction(row, dataset)),
      field("prevention_state", "조치상태", (row, dataset) => preventionStatus(row, dataset)),
      field("follow_up", "후속점검", (row, dataset) => facilityWorkFor(row, dataset).map(work => work.next_action).filter(Boolean).map(redactComplaintFreeText).join(" / ") || "후속점검 미등록"),
      field("document_number", "근거 문서번호", (row, dataset) => officialDocuments(row, dataset).join(", ") || "미등록"),
    ],
    defaultFields: ["complaint_number", "lot", "lot_type", "field_finding", "facility_work", "prevention_action", "prevention_state", "follow_up", "document_number"],
  },
  {
    id: "lot_types", label: "주차장 형태 분석", description: "노외·주차빌딩·노상 유형별 민원·SLA·반복 현황",
    fields: [
      field("lot_type", "주차장 형태", row => row.lot_type),
      field("total", "접수", row => `${row.total}건`),
      field("open", "처리중", row => `${row.open}건`),
      field("closed", "회신·완결", row => `${row.closed}건`),
      field("overdue", "기한초과", row => `${row.overdue}건`),
      field("repeat", "반복민원", row => `${row.repeat}건`),
      field("sla_rate", "SLA 준수율", row => `${row.sla_rate.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`),
      field("average_days", "평균 처리일", row => `${row.average_days.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}일`),
      field("top_category", "주요 민원유형", row => row.top_category),
    ],
    defaultFields: ["lot_type", "total", "open", "closed", "overdue", "repeat", "sla_rate", "average_days", "top_category"],
  },
  {
    id: "documents", label: "공식 답변문서", description: "민원 회신·완결과 공식문서대장 연계 현황",
    fields: [
      field("complaint_number", "민원번호", row => row.complaint_number),
      field("title", "민원제목", row => redactComplaintFreeText(row.title)),
      field("status", "처리상태", row => statusLabel(row.status)),
      field("response_type", "회신결과", row => RESPONSE_TYPE_LABELS[row.response_type] || text(row.response_type)),
      field("responded_at", "회신일", row => dateOnly(row.responded_at)),
      field("resolution_type", "종결구분", row => RESOLUTION_TYPE_LABELS[row.resolution_type] || text(row.resolution_type)),
      field("document_number", "공식 답변문서", (row, dataset) => officialDocuments(row, dataset).join(", ") || "미등록"),
      field("saeol_ref", "새올 참조번호", row => row.saeol_ref),
      field("external_ref", "외부 참조번호", row => row.external_ref),
    ],
    defaultFields: ["complaint_number", "title", "status", "response_type", "responded_at", "resolution_type", "document_number", "saeol_ref", "external_ref"],
  },
];

export const COMPLAINT_REPORT_PRESETS = {
  summary: { label: "간부 요약", sections: ["overview", "sla", "repeats", "prevention", "lot_types"] as ComplaintReportSectionId[] },
  standard: { label: "실무 종합", sections: COMPLAINT_REPORT_SECTIONS.map(section => section.id) },
  audit: { label: "감사 대응", sections: COMPLAINT_REPORT_SECTIONS.map(section => section.id) },
};

export function defaultComplaintReportFields(): Partial<Record<ComplaintReportSectionId, string[]>> {
  return Object.fromEntries(COMPLAINT_REPORT_SECTIONS.map(section => [section.id, [...section.defaultFields]]));
}

export function parseComplaintReportOptions(parameters: Record<string, string>): ComplaintReportOptions {
  const knownSections = new Set(COMPLAINT_REPORT_SECTIONS.map(section => section.id));
  const selectedSections = (parameters.complaint_sections || COMPLAINT_REPORT_PRESETS.summary.sections.join(","))
    .split(",").filter((id): id is ComplaintReportSectionId => knownSections.has(id as ComplaintReportSectionId));
  let selectedFields = defaultComplaintReportFields();
  try {
    const parsed = JSON.parse(parameters.complaint_fields || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) selectedFields = { ...selectedFields, ...parsed };
  } catch {
    selectedFields = defaultComplaintReportFields();
  }
  const periodStart = parameters.period_start;
  const periodEnd = parameters.period_end || periodStart;
  return {
    periodStart,
    periodEnd,
    asOfDate: parameters.complaint_as_of_date || periodEnd,
    selectedSections: selectedSections.length ? selectedSections : ["overview"],
    selectedFields,
    lotTypes: (parameters.complaint_lot_types || "offstreet,building,onstreet").split(",").filter(Boolean),
    statuses: (parameters.complaint_statuses || "").split(",").filter(Boolean),
    sort: (["attention", "date_desc", "due_asc", "category", "lot_type"].includes(parameters.complaint_sort) ? parameters.complaint_sort : "attention") as ComplaintReportSort,
    orientation: parameters.complaint_orientation === "landscape" ? "landscape" : "portrait",
    includeArchived: parameters.complaint_include_archived === "true",
  };
}

function matchesLotType(row: any, selected: string[]) {
  const actual = lotType(row);
  if (!actual || !selected.length || selected.length === COMPLAINT_LOT_TYPE_OPTIONS.length) return true;
  return selected.some(group => (LOT_TYPE_ALIASES[group] || [group]).includes(actual));
}

function inPeriod(value: unknown, options: ComplaintReportOptions) {
  const date = dateOnly(value);
  return date !== "-" && date >= options.periodStart && date <= options.periodEnd;
}

export function assertCompleteComplaintResult(
  label: string,
  result: { data?: unknown[] | null; error?: { message: string } | null; count?: number | null },
  limit = QUERY_LIMIT,
) {
  if (result.error) throw new Error(`${label} 자료 조회에 실패했습니다: ${result.error.message}`);
  if (typeof result.count !== "number") throw new Error(`${label} 전체 건수를 확인할 수 없어 보고서 생성을 중단했습니다.`);
  const rows = result.data || [];
  if (result.count > limit) throw new Error(`${label} 자료 ${result.count}건이 조회 한도 ${limit}건을 초과하여 보고서 생성을 중단했습니다.`);
  if (rows.length !== result.count) throw new Error(`${label} 자료 ${result.count}건 중 ${rows.length}건만 조회되어 보고서 생성을 중단했습니다.`);
  return rows;
}

async function checkedQuery(label: string, promise: PromiseLike<any>, limit = QUERY_LIMIT) {
  return assertCompleteComplaintResult(label, await promise, limit) as any[];
}

function chunks<T>(values: T[], size = ID_CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function collectChunked(
  label: string,
  ids: string[],
  query: (idChunk: string[], remaining: number) => PromiseLike<any>,
) {
  const rows: any[] = [];
  let expected = 0;
  for (const idChunk of chunks(unique(ids))) {
    const remaining = QUERY_LIMIT - rows.length;
    if (remaining <= 0) throw new Error(`${label} 자료가 ${QUERY_LIMIT}건을 초과하여 보고서 생성을 중단했습니다.`);
    const result = await query(idChunk, remaining);
    const found = assertCompleteComplaintResult(label, result, remaining) as any[];
    expected += Number(result.count || 0);
    rows.push(...found);
  }
  return { rows, evidence: { expected, loaded: rows.length, complete: true } as ComplaintEvidenceSource };
}

async function collectOfficialDocuments(complaintIds: string[]) {
  const linkResult = await collectChunked("민원 공식문서 첨부", complaintIds, (idChunk, remaining) => (
    (supabase as any).from("attachments")
      .select("module, ref_id, file_path", { count: "exact" })
      .eq("module", "COMPLAINT")
      .eq("ref_type", "official_document_link")
      .in("ref_id", idChunk)
      .limit(remaining)
  ));
  const documentIds = unique(linkResult.rows.map(link => String(link.file_path || "").replace("parkmaster-document://", "")));
  const documentResult = await collectChunked("공식문서대장", documentIds, (idChunk, remaining) => (
    (supabase as any).from("official_documents")
      .select("id, document_number", { count: "exact" })
      .in("id", idChunk)
      .limit(remaining)
  ));
  const numberById = new Map(documentResult.rows.map(document => [document.id, document.document_number]));
  const documentNumbers = linkResult.rows.reduce<Record<string, string[]>>((result, link) => {
    const documentId = String(link.file_path || "").replace("parkmaster-document://", "");
    const documentNumber = numberById.get(documentId);
    if (!documentNumber) return result;
    const key = documentKey(link.ref_id);
    result[key] = unique([...(result[key] || []), documentNumber]);
    return result;
  }, {});
  return {
    documentNumbers,
    evidence: {
      documentLinks: linkResult.evidence,
      officialDocuments: documentResult.evidence,
    },
  };
}

export async function collectComplaintReportData(options: ComplaintReportOptions): Promise<ComplaintReportDataset> {
  const [parkingLotResult, complaintResult] = await Promise.all([
    (supabase as any).from("parking_lots")
      .select("id, code, name, lot_type, status", { count: "exact" })
      .limit(QUERY_LIMIT),
    (supabase as any).from("complaints")
      .select("*", { count: "exact" })
      .gte("received_at", `${options.periodStart}T00:00:00`)
      .lte("received_at", `${options.periodEnd}T23:59:59.999`)
      .order("received_at", { ascending: false })
      .limit(QUERY_LIMIT),
  ]);
  const parkingLots = assertCompleteComplaintResult("주차장", parkingLotResult) as any[];
  const complaintRows = assertCompleteComplaintResult("민원", complaintResult) as any[];
  const lotById = new Map(parkingLots.map(row => [row.id, row]));
  const complaints = complaintRows
    .map(row => ({ ...row, parking_lots: lotById.get(row.lot_id) }))
    .filter(row => (options.includeArchived || !isArchived(row)) && matchesLotType(row, options.lotTypes) && (!options.statuses.length || options.statuses.includes(row.status)));
  const complaintIds = complaints.map(row => row.id);
  const relatedIds = unique(complaints.map(row => row.related_complaint_id).filter(id => id && !complaintIds.includes(id)));

  const [relatedResult, commentResult, facilityResult, documentResult] = await Promise.all([
    collectChunked("연계 원민원", relatedIds, (idChunk, remaining) => (
      (supabase as any).from("complaints").select("id, complaint_number, title", { count: "exact" }).in("id", idChunk).limit(remaining)
    )),
    collectChunked("민원 처리 타임라인", complaintIds, (idChunk, remaining) => (
      (supabase as any).from("complaint_comments").select("*", { count: "exact" }).in("complaint_id", idChunk).order("created_at").limit(remaining)
    )),
    collectChunked("민원 연계 시설작업", complaintIds, (idChunk, remaining) => (
      (supabase as any).from("maintenance_logs")
        .select("id, log_number, title, status, cause, resolution, next_action, completed_at, due_date, source_module, source_record_id", { count: "exact" })
        .eq("source_module", "COMPLAINT")
        .in("source_record_id", idChunk)
        .limit(remaining)
    )),
    collectOfficialDocuments(complaintIds),
  ]);

  const profileIds = unique([
    ...complaints.flatMap(row => [row.assigned_to, row.closed_by, row.created_by]),
    ...commentResult.rows.map(row => row.author_id),
  ]);
  const profileResult = await collectChunked("민원 담당자", profileIds, (idChunk, remaining) => (
    (supabase as any).from("profiles").select("id, name, team, role", { count: "exact" }).in("id", idChunk).limit(remaining)
  ));

  return {
    parkingLots,
    complaints,
    relatedComplaints: relatedResult.rows,
    comments: commentResult.rows,
    facilityWork: facilityResult.rows,
    profiles: profileResult.rows,
    documentNumbers: documentResult.documentNumbers,
    evidenceMetadata: {
      complete: true,
      collectedAt: new Date().toISOString(),
      queryLimit: QUERY_LIMIT,
      truncationPolicy: "fail",
      sourceTables: ["parking_lots", "complaints", "complaint_comments", "maintenance_logs", "profiles", "attachments", "official_documents"],
      filters: {
        periodStart: options.periodStart,
        periodEnd: options.periodEnd,
        asOfDate: options.asOfDate,
        lotTypes: [...options.lotTypes],
        statuses: [...options.statuses],
        includeArchived: options.includeArchived,
      },
      privacy: { mode: "minimum", excludedFields: [...PRIVACY_EXCLUDED_FIELDS], redactedFreeText: true },
      sources: {
        parkingLots: { expected: Number(parkingLotResult.count), loaded: parkingLots.length, complete: true },
        complaints: { expected: Number(complaintResult.count), loaded: complaintRows.length, complete: true },
        relatedComplaints: relatedResult.evidence,
        comments: commentResult.evidence,
        facilityWork: facilityResult.evidence,
        profiles: profileResult.evidence,
        ...documentResult.evidence,
      },
    },
  };
}

function assertEvidenceComplete(metadata: ComplaintReportEvidenceMetadata) {
  const incomplete = Object.entries(metadata.sources).filter(([, source]) => !source.complete || source.expected !== source.loaded);
  if (!metadata.complete || metadata.truncationPolicy !== "fail" || incomplete.length) {
    throw new Error(`민원 보고서 증거자료가 불완전합니다: ${incomplete.map(([name]) => name).join(", ") || "수집상태"}`);
  }
}

function buildTimelineRows(complaints: any[], dataset: ComplaintReportDataset) {
  const rows: any[] = [];
  const add = (complaint: any, eventAt: unknown, eventType: string, statusTransition: string, actionSummary: unknown, evidence: string, actorScope: string, authorName = "-") => {
    if (!eventAt) return;
    rows.push({
      complaint_number: complaint.complaint_number,
      event_at: eventAt,
      event_type: eventType,
      status_transition: statusTransition || "-",
      action_summary: redactComplaintFreeText(actionSummary),
      evidence,
      actor_scope: actorScope,
      author_name: authorName,
    });
  };
  for (const complaint of complaints) {
    add(complaint, complaint.received_at, "접수", "- → 접수", "민원이 접수되어 처리기한을 산정함.", "민원대장", "시스템");
    add(complaint, complaint.assigned_at, "배정", "접수 → 배정", `${assignedTeamLabel(complaint.assigned_team)}에 처리업무를 배정함.`, "배정기록", "담당부서", profileName(complaint.assigned_to, dataset));
    for (const comment of commentsFor(complaint, dataset)) {
      add(
        complaint,
        comment.visit_occurred_at || comment.created_at,
        COMMENT_TYPE_LABELS[comment.comment_type] || text(comment.comment_type),
        comment.status_from || comment.status_to ? `${statusLabel(comment.status_from)} → ${statusLabel(comment.status_to)}` : "-",
        comment.action_taken ? `${comment.content} / 조치: ${comment.action_taken}` : comment.content,
        comment.attachment_path ? "첨부 증빙 있음" : comment.comment_type === "field_visit" ? "현장확인 기록" : "처리기록",
        comment.is_system ? "시스템" : "담당자",
        comment.author_name || profileName(comment.author_id, dataset),
      );
    }
    add(complaint, complaint.responded_at, "공식 회신", "처리중 → 회신", complaint.response || "민원 처리결과를 회신함.", officialDocuments(complaint, dataset).length ? "공식 답변문서" : "회신기록", "담당부서");
    add(complaint, complaint.closed_at, "완결", "회신 → 완결", RESOLUTION_TYPE_LABELS[complaint.resolution_type] || "민원 처리를 완결함.", "완결기록", "담당부서");
  }
  return rows.sort((a, b) => String(b.event_at).localeCompare(String(a.event_at)));
}

function buildLotTypeRows(complaints: any[], options: ComplaintReportOptions) {
  return COMPLAINT_LOT_TYPE_OPTIONS.filter(type => options.lotTypes.includes(type.value)).map(type => {
    const aliases = LOT_TYPE_ALIASES[type.value] || [type.value];
    const rows = complaints.filter(row => aliases.includes(lotType(row)));
    const completed = rows.filter(row => completionDate(row));
    const within = completed.filter(row => slaState(row, options.asOfDate) === "기한 내 완료");
    const resolutionDays = completed.map(row => daysBetween(row.received_at, completionDate(row))).filter((value): value is number => value !== null);
    const categoryCounts = rows.reduce<Record<string, number>>((counts, row) => ({ ...counts, [categoryLabel(row.category)]: (counts[categoryLabel(row.category)] || 0) + 1 }), {});
    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))[0]?.[0] || "-";
    return {
      lot_type: type.label,
      total: rows.length,
      open: rows.filter(row => OPEN_STATUSES.has(row.status)).length,
      closed: rows.filter(row => COMPLETED_STATUSES.has(row.status)).length,
      overdue: rows.filter(row => slaState(row, options.asOfDate) === "기한 초과").length,
      repeat: rows.filter(row => row.is_repeat || Number(row.repeat_count || 0) > 0 || row.related_complaint_id).length,
      sla_rate: completed.length ? within.length / completed.length * 100 : 0,
      average_days: resolutionDays.length ? resolutionDays.reduce((sum, value) => sum + value, 0) / resolutionDays.length : 0,
      top_category: topCategory,
    };
  });
}

function sortRows(rows: any[], sort: ComplaintReportSort, options: ComplaintReportOptions) {
  const statusRank: Record<string, number> = { reopened: 0, received: 1, assigned: 2, in_progress: 3, pending_external: 4, responded: 5, closed: 6 };
  const attentionRank = (row: any) => {
    const sla = row.sla_state || slaState(row, options.asOfDate);
    return sla === "기한 초과" ? 0 : sla === "기한 초과 완료" ? 1 : sla === "기한 임박" ? 2 : row.is_repeat ? 3 : statusRank[row.status] ?? 20;
  };
  return [...rows].sort((a, b) => {
    if (sort === "date_desc") return String(b.event_at || b.received_at || b.created_at || "").localeCompare(String(a.event_at || a.received_at || a.created_at || ""));
    if (sort === "due_asc") return String(a.due_date || "9999-12-31").localeCompare(String(b.due_date || "9999-12-31"));
    if (sort === "category") return categoryLabel(a.category).localeCompare(categoryLabel(b.category), "ko", { numeric: true });
    if (sort === "lot_type") return lotTypeLabel(a).localeCompare(lotTypeLabel(b), "ko") || lotName(a).localeCompare(lotName(b), "ko", { numeric: true });
    return attentionRank(a) - attentionRank(b) || String(a.due_date || "9999-12-31").localeCompare(String(b.due_date || "9999-12-31"));
  });
}

const TABLE_IDENTITY_FIELDS: Record<Exclude<ComplaintReportSectionId, "overview">, string[]> = {
  intake: ["complaint_number", "received_at"],
  sla: ["complaint_number", "due_date"],
  assignments: ["complaint_number", "assigned_team"],
  timeline: ["complaint_number", "event_at"],
  repeats: ["complaint_number", "related_number"],
  prevention: ["complaint_number", "lot"],
  lot_types: ["lot_type"],
  documents: ["complaint_number", "document_number"],
};

const TABLE_GROUP_TITLES: Record<Exclude<ComplaintReportSectionId, "overview">, string[]> = {
  intake: ["접수·분류·처리상태", "주차장·기한·외부참조"],
  sla: ["접수·배정·회신·기한", "처리기간·담당부서"],
  assignments: ["담당부서·배정·다음 조치"],
  timeline: ["처리이력·상태변경·증빙"],
  repeats: ["원민원·반복·재발방지"],
  prevention: ["현장확인·시설작업·예방조치"],
  lot_types: ["형태별 접수·SLA·반복 현황"],
  documents: ["회신·완결·공식문서 근거"],
};

function splitFields(id: Exclude<ComplaintReportSectionId, "overview">, fields: ComplaintReportField[], orientation: ComplaintReportOrientation) {
  const maximumColumns = orientation === "portrait" ? 10 : 14;
  if (fields.length <= maximumColumns) return [fields];
  const identity = fields.filter(item => TABLE_IDENTITY_FIELDS[id].includes(item.key));
  const details = fields.filter(item => !TABLE_IDENTITY_FIELDS[id].includes(item.key));
  const detailLimit = Math.max(1, maximumColumns - identity.length);
  const groups: ComplaintReportField[][] = [];
  for (let index = 0; index < details.length; index += detailLimit) groups.push([...identity, ...details.slice(index, index + detailLimit)]);
  return groups;
}

function completeSampleEvidence(dataset: ComplaintReportDataset, options: ComplaintReportOptions): ComplaintReportEvidenceMetadata {
  const counts: Record<string, number> = {
    parkingLots: dataset.parkingLots.length,
    complaints: dataset.complaints.length,
    relatedComplaints: dataset.relatedComplaints.length,
    comments: dataset.comments.length,
    facilityWork: dataset.facilityWork.length,
    profiles: dataset.profiles.length,
    documentLinks: Object.values(dataset.documentNumbers).flat().length,
    officialDocuments: unique(Object.values(dataset.documentNumbers).flat()).length,
  };
  return {
    complete: true,
    collectedAt: "2026-08-31T23:59:59.000Z",
    queryLimit: QUERY_LIMIT,
    truncationPolicy: "fail",
    sourceTables: ["parking_lots", "complaints", "complaint_comments", "maintenance_logs", "profiles", "attachments", "official_documents"],
    filters: { periodStart: options.periodStart, periodEnd: options.periodEnd, asOfDate: options.asOfDate, lotTypes: [...options.lotTypes], statuses: [...options.statuses], includeArchived: options.includeArchived },
    privacy: { mode: "minimum", excludedFields: [...PRIVACY_EXCLUDED_FIELDS], redactedFreeText: true },
    sources: Object.fromEntries(Object.entries(counts).map(([name, count]) => [name, { expected: count, loaded: count, complete: true }])),
  };
}

export function buildComplaintReportModel(dataset: ComplaintReportDataset, options: ComplaintReportOptions): ComplaintReportModel {
  const evidenceMetadata = dataset.evidenceMetadata || completeSampleEvidence(dataset, options);
  assertEvidenceComplete(evidenceMetadata);
  const complaints = dataset.complaints.filter(row => (
    (options.includeArchived || !isArchived(row))
    && inPeriod(row.received_at, options)
    && matchesLotType(row, options.lotTypes)
    && (!options.statuses.length || options.statuses.includes(row.status))
  ));
  const complaintIds = new Set(complaints.map(row => row.id));
  const comments = dataset.comments.filter(row => complaintIds.has(row.complaint_id));
  const facilityWork = dataset.facilityWork.filter(row => complaintIds.has(row.source_record_id));
  const timeline = buildTimelineRows(complaints, { ...dataset, comments, facilityWork });
  const repeats = complaints.filter(row => row.is_repeat || Number(row.repeat_count || 0) > 0 || row.related_complaint_id);
  const prevention = repeats;
  const lotTypes = buildLotTypeRows(complaints, options);
  const completed = complaints.filter(row => completionDate(row));
  const withinSla = completed.filter(row => slaState(row, options.asOfDate) === "기한 내 완료");
  const completedLate = completed.filter(row => slaState(row, options.asOfDate) === "기한 초과 완료");
  const resolutionDays = completed.map(row => daysBetween(row.received_at, completionDate(row))).filter((value): value is number => value !== null);
  const completedForDocument = complaints.filter(row => COMPLETED_STATUSES.has(row.status));
  const summary: ComplaintReportSummary = {
    parkingLots: new Set(complaints.map(row => row.lot_id).filter(Boolean)).size,
    totalComplaints: complaints.length,
    openComplaints: complaints.filter(row => OPEN_STATUSES.has(row.status)).length,
    respondedComplaints: complaints.filter(row => row.status === "responded").length,
    closedComplaints: complaints.filter(row => row.status === "closed").length,
    unassignedComplaints: complaints.filter(row => OPEN_STATUSES.has(row.status) && !row.assigned_to).length,
    overdueComplaints: complaints.filter(row => slaState(row, options.asOfDate) === "기한 초과").length,
    dueSoonComplaints: complaints.filter(row => slaState(row, options.asOfDate) === "기한 임박").length,
    completedWithinSla: withinSla.length,
    completedLate: completedLate.length,
    slaComplianceRate: completed.length ? withinSla.length / completed.length * 100 : 0,
    averageResolutionDays: resolutionDays.length ? resolutionDays.reduce((sum, value) => sum + value, 0) / resolutionDays.length : 0,
    repeatComplaints: repeats.length,
    reopenedComplaints: complaints.filter(row => row.status === "reopened").length,
    preventionRequired: repeats.length,
    preventionCompleted: repeats.filter(row => preventionStatus(row, { ...dataset, comments, facilityWork }) === "조치완료").length,
    timelineEvents: timeline.length,
    fieldVisits: comments.filter(row => row.comment_type === "field_visit").length,
    linkedFacilityWork: facilityWork.length,
    officialResponses: completedForDocument.filter(row => officialDocuments(row, dataset).length > 0).length,
    missingOfficialResponses: completedForDocument.filter(row => officialDocuments(row, dataset).length === 0).length,
  };
  const rowsBySection: Record<Exclude<ComplaintReportSectionId, "overview">, any[]> = {
    intake: complaints,
    sla: complaints.map(row => ({ ...row, sla_state: slaState(row, options.asOfDate) })),
    assignments: complaints,
    timeline,
    repeats,
    prevention,
    lot_types: lotTypes,
    documents: complaints,
  };
  const tables = options.selectedSections.filter((id): id is Exclude<ComplaintReportSectionId, "overview"> => id !== "overview").flatMap(id => {
    const section = COMPLAINT_REPORT_SECTIONS.find(item => item.id === id)!;
    const requested = options.selectedFields[id] || section.defaultFields;
    const fields = section.fields.filter(item => requested.includes(item.key));
    const sourceRows = id === "lot_types" ? rowsBySection[id] : sortRows(rowsBySection[id], options.sort, options);
    const groups = splitFields(id, fields, options.orientation);
    return groups.map((group, groupIndex) => ({
      id,
      title: section.label,
      subtitle: groups.length > 1 ? (TABLE_GROUP_TITLES[id][groupIndex] || `${section.label} 세부정보`) : undefined,
      subtitleNumber: groups.length > 1 ? groupIndex + 1 : undefined,
      continuation: groupIndex > 0,
      columns: group.map(item => ({ key: item.key, label: item.label })),
      rows: sourceRows.map(row => Object.fromEntries(group.map(item => [item.key, text(item.value(row, dataset, options))]))),
    } as OperationsReportTable));
  });
  const selectedFields = options.selectedSections.flatMap(id => {
    const section = COMPLAINT_REPORT_SECTIONS.find(item => item.id === id)!;
    return section.fields.filter(item => (options.selectedFields[id] || section.defaultFields).includes(item.key));
  });
  const riskNarrative = [
    summary.overdueComplaints ? `처리기한 초과 ${summary.overdueComplaints}건` : "처리기한 초과 없음",
    summary.dueSoonComplaints ? `처리기한 임박 ${summary.dueSoonComplaints}건` : "처리기한 임박 없음",
    summary.unassignedComplaints ? `미배정 ${summary.unassignedComplaints}건` : "미배정 없음",
    summary.repeatComplaints ? `반복민원 ${summary.repeatComplaints}건` : "반복민원 없음",
    summary.preventionRequired - summary.preventionCompleted ? `재발방지 미완료 ${summary.preventionRequired - summary.preventionCompleted}건` : "재발방지 미완료 없음",
    summary.missingOfficialResponses ? `공식 답변문서 미연계 ${summary.missingOfficialResponses}건` : "공식 답변문서 누락 없음",
  ].join("; ");
  return {
    period: { start: options.periodStart, end: options.periodEnd },
    asOfDate: options.asOfDate,
    lotTypeLabels: COMPLAINT_LOT_TYPE_OPTIONS.filter(item => options.lotTypes.includes(item.value)).map(item => item.label),
    summary,
    sourceCounts: {
      lots: summary.parkingLots,
      complaints: complaints.length,
      comments: comments.length,
      facilityWork: facilityWork.length,
      timeline: timeline.length,
      repeats: repeats.length,
      prevention: prevention.length,
      lotTypes: lotTypes.length,
      documents: unique(complaints.flatMap(row => officialDocuments(row, dataset))).length,
    },
    tables,
    selectedFieldCount: selectedFields.length,
    protectedFieldCount: selectedFields.filter(item => item.protected).length,
    riskNarrative,
    evidenceMetadata,
  };
}

export function complaintReportBriefRows(model: ComplaintReportModel, documentSummary?: string): string[][] {
  return [
    ["담당부서", PRIMARY_DEPARTMENT],
    ["보고기간", `${model.period.start} ~ ${model.period.end}`],
    ["보고대상", `제주시 공영주차장 민원 ${model.summary.totalComplaints.toLocaleString("ko-KR")}건`],
    ["주요내용", unique(model.tables.filter(table => !table.continuation).map(table => table.title)).join("·") || "민원관리 핵심 현황"],
    ["작성목적", documentSummary || "공영주차장 민원의 접수·배정·처리기한·현장조치·회신·완결 전 과정을 점검하고 반복민원과 재발방지 조치의 적정성을 확인하기 위함."],
    ["산출기준", `민원 접수일을 기준으로 처리기한과 ${model.asOfDate} 현재 SLA 상태를 재계산하고 처리 타임라인·시설작업·공식 답변문서를 대조함. 개인정보는 보고에 필요한 최소 범위만 사용함. ${model.riskNarrative}`],
  ];
}

export function complaintReportSummaryRows(model: ComplaintReportModel): string[][] {
  const percent = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
  return [
    ["접수 민원", `${model.summary.totalComplaints.toLocaleString("ko-KR")}건`, "처리중", `${model.summary.openComplaints.toLocaleString("ko-KR")}건`],
    ["회신·완결", `${(model.summary.respondedComplaints + model.summary.closedComplaints).toLocaleString("ko-KR")}건`, "미배정", `${model.summary.unassignedComplaints.toLocaleString("ko-KR")}건`],
    ["기한초과", `${model.summary.overdueComplaints.toLocaleString("ko-KR")}건`, "기한임박", `${model.summary.dueSoonComplaints.toLocaleString("ko-KR")}건`],
    ["SLA 준수율", percent(model.summary.slaComplianceRate), "평균 처리일", `${model.summary.averageResolutionDays.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}일`],
    ["반복민원", `${model.summary.repeatComplaints.toLocaleString("ko-KR")}건`, "재발방지 완료", `${model.summary.preventionCompleted.toLocaleString("ko-KR")}/${model.summary.preventionRequired.toLocaleString("ko-KR")}건`],
    ["현장확인", `${model.summary.fieldVisits.toLocaleString("ko-KR")}건`, "연계 시설작업", `${model.summary.linkedFacilityWork.toLocaleString("ko-KR")}건`],
    ["공식 답변문서", `${model.summary.officialResponses.toLocaleString("ko-KR")}건`, "답변문서 미연계", `${model.summary.missingOfficialResponses.toLocaleString("ko-KR")}건`],
  ];
}

export function toOperationsCompatibleComplaintModel(model: ComplaintReportModel): OperationsReportModel {
  return {
    period: model.period,
    lotTypeLabels: model.lotTypeLabels,
    summary: {
      parkingLots: model.summary.parkingLots,
      totalSpaces: 0,
      activeContracts: 0,
      activeStaff: 0,
      activePasses: 0,
      enforcementCount: 0,
      totalFine: 0,
      unpaidFine: 0,
      openAbandoned: 0,
      openSecurity: 0,
    },
    sourceCounts: model.sourceCounts,
    tables: model.tables,
    selectedFieldCount: model.selectedFieldCount,
    sensitiveFieldCount: model.protectedFieldCount,
  };
}

export async function getComplaintReportEvidence(parameters: Record<string, string>) {
  const options = parseComplaintReportOptions(parameters);
  const dataset = await collectComplaintReportData(options);
  const model = buildComplaintReportModel(dataset, options);
  return {
    period: model.period,
    asOfDate: model.asOfDate,
    sourceCounts: model.sourceCounts,
    summary: model.summary,
    selectedFieldCount: model.selectedFieldCount,
    protectedFieldCount: model.protectedFieldCount,
    riskNarrative: model.riskNarrative,
    evidenceMetadata: model.evidenceMetadata,
  };
}

export const COMPLAINT_REPORT_SAMPLE_DATASET: ComplaintReportDataset = {
  parkingLots: [
    { id: "lot-offstreet", code: "JJP-001", name: "동문 공영주차장", lot_type: "offstreet" },
    { id: "lot-building", code: "JJP-002", name: "칠성골 주차빌딩", lot_type: "multilevel" },
    { id: "lot-onstreet", code: "JJP-003", name: "중앙로 노상주차장", lot_type: "onstreet" },
  ],
  complaints: [
    {
      id: "complaint-1", complaint_number: "CMP-202608-001", lot_id: "lot-offstreet", channel: "online",
      received_at: "2026-08-01T09:00:00", category: "fee", title: "정기권 이중결제 환불 요청",
      priority: "normal", due_days: 7, due_date: "2026-08-08", assigned_team: "operations", assigned_to: "profile-1",
      assigned_at: "2026-08-01T10:00:00", response: "중복 승인 취소와 환불 처리를 완료함.", response_type: "resolved",
      responded_at: "2026-08-05T15:00:00", closed_at: "2026-08-05T16:00:00", resolution_type: "resolved",
      status: "closed", parking_lots: { id: "lot-offstreet", name: "동문 공영주차장", lot_type: "offstreet" },
    },
    {
      id: "complaint-2", complaint_number: "CMP-202608-002", lot_id: "lot-building", channel: "phone",
      received_at: "2026-08-02T08:30:00", category: "facility", title: "출구 차단기 반복 정지",
      priority: "urgent", due_days: 3, due_date: "2026-08-05", assigned_team: "facilities", assigned_to: "profile-2",
      assigned_at: "2026-08-02T09:00:00", status: "in_progress",
      parking_lots: { id: "lot-building", name: "칠성골 주차빌딩", lot_type: "multilevel" },
    },
    {
      id: "complaint-3", complaint_number: "CMP-202608-003", lot_id: "lot-onstreet", channel: "visit",
      received_at: "2026-08-03T11:00:00", category: "enforcement_appeal", title: "노상주차 안내표지 반복 혼선",
      priority: "high", due_days: 7, due_date: "2026-08-10", assigned_team: "operations", assigned_to: "profile-1",
      assigned_at: "2026-08-03T13:00:00", response: "안내표지 위치를 개선하고 재발 방지를 위해 월 1회 현장점검을 실시함.",
      response_type: "resolved", responded_at: "2026-08-15T14:00:00", closed_at: "2026-08-15T15:00:00",
      resolution_type: "resolved", status: "closed", is_repeat: true, repeat_count: 2, related_complaint_id: "complaint-parent",
      parking_lots: { id: "lot-onstreet", name: "중앙로 노상주차장", lot_type: "onstreet" },
    },
    {
      id: "complaint-4", complaint_number: "CMP-202608-004", lot_id: "lot-offstreet", channel: "onsite",
      received_at: "2026-08-30T14:00:00", category: "guidance", title: "주차장 출입구 안내 문의",
      priority: "normal", due_days: 1, due_date: "2026-08-31", status: "received",
      parking_lots: { id: "lot-offstreet", name: "동문 공영주차장", lot_type: "offstreet" },
    },
    {
      id: "complaint-5", complaint_number: "CMP-202608-005", lot_id: "lot-building", channel: "saeol",
      received_at: "2026-08-20T10:00:00", category: "safety", title: "계단 비상조명 점검 요청",
      priority: "high", due_days: 7, due_date: "2026-08-27", assigned_team: "facilities", assigned_to: "profile-2",
      assigned_at: "2026-08-20T11:00:00", response: "비상조명 점검과 램프 교체 후 결과를 회신함.",
      response_type: "resolved", responded_at: "2026-08-26T16:00:00", resolution_type: "resolved", status: "responded",
      saeol_ref: "SAEOL-2026-0805", parking_lots: { id: "lot-building", name: "칠성골 주차빌딩", lot_type: "multilevel" },
    },
  ],
  relatedComplaints: [
    { id: "complaint-parent", complaint_number: "CMP-202607-019", title: "노상주차 안내표지 위치 문의" },
  ],
  comments: [
    { id: "comment-1", complaint_id: "complaint-1", author_id: "profile-1", author_name: "운영담당자", comment_type: "assignment", content: "운영팀 담당자 배정", is_system: true, created_at: "2026-08-01T10:00:00" },
    { id: "comment-2", complaint_id: "complaint-2", author_id: "profile-2", author_name: "시설담당자", comment_type: "field_visit", content: "민원인 010-1234-5678 연락 후 12가3456 차량 출차상태를 확인함.", action_taken: "차단기 제어부 교체 요청", visit_outcome: "차단기 제어부 간헐 오류 확인", visit_occurred_at: "2026-08-02T11:00:00", attachment_path: "local-photo://complaint/2", is_system: false, created_at: "2026-08-02T11:00:00" },
    { id: "comment-3", complaint_id: "complaint-3", author_id: "profile-1", author_name: "운영담당자", comment_type: "field_visit", content: "표지 위치와 운전자 시야각을 현장에서 확인함.", action_taken: "안내표지 위치 조정 및 월 1회 순찰점검", visit_outcome: "교차로 진입 방향에서 표지 식별이 어려움", visit_occurred_at: "2026-08-04T10:00:00", is_system: false, created_at: "2026-08-04T10:00:00" },
    { id: "comment-4", complaint_id: "complaint-3", author_id: "profile-1", author_name: "운영담당자", comment_type: "closure", content: "안내표지 개선 및 재발방지 점검계획 등록 후 완결함.", is_system: false, created_at: "2026-08-15T15:00:00" },
    { id: "comment-5", complaint_id: "complaint-5", author_id: "profile-2", author_name: "시설담당자", comment_type: "external", content: "공식 답변문서로 점검결과를 회신함.", is_system: false, created_at: "2026-08-26T16:00:00" },
  ],
  facilityWork: [
    { id: "work-1", log_number: "MW-202608-021", title: "주차빌딩 출구 차단기 제어부 교체", status: "in_progress", cause: "제어부 간헐 통신오류", next_action: "부품 교체 후 반복 동작시험", due_date: "2026-09-02", source_module: "COMPLAINT", source_record_id: "complaint-2" },
    { id: "work-2", log_number: "MW-202608-022", title: "노상주차 안내표지 위치 개선", status: "verified", cause: "진입방향 시인성 부족", resolution: "표지 위치를 조정하고 월간 순찰점검에 반영함.", next_action: "다음 월간점검 시 시인성 재확인", completed_at: "2026-08-14", source_module: "COMPLAINT", source_record_id: "complaint-3" },
  ],
  profiles: [
    { id: "profile-1", name: "운영담당자", team: "operations", role: "editor" },
    { id: "profile-2", name: "시설담당자", team: "facilities", role: "editor" },
  ],
  documentNumbers: {
    "COMPLAINT:complaint-1": ["제주시청-차량관리과운영팀-2026-2101"],
    "COMPLAINT:complaint-5": ["제주시청-차량관리과운영팀-2026-2105"],
  },
};
