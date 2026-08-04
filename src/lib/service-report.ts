import { PRIMARY_DEPARTMENT } from "@/config/organization";
import { supabase } from "@/integrations/supabase/client";
import type {
  OperationsReportModel,
  OperationsReportOrientation,
  OperationsReportTable,
} from "@/lib/operations-report";
import {
  DELIVERABLE_STATUS_LABELS,
  INSPECTION_STATUS_LABELS,
  INSPECTION_TYPE_LABELS,
  ISSUE_STATUS_LABELS,
  ISSUE_TYPE_LABELS,
  MILESTONE_STATUS_LABELS,
  MILESTONE_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  PROJECT_STATUS_LABELS,
  RESULT_LABELS,
  SERVICE_TYPE_LABELS,
  SEVERITY_LABELS,
} from "@/types/service";

export type ServiceReportSectionId =
  | "overview"
  | "projects"
  | "contracts"
  | "contacts"
  | "milestones"
  | "inspections"
  | "payments"
  | "deliverables"
  | "risks"
  | "documents";
export type ServiceReportSort = "attention" | "date_desc" | "project" | "amount_desc" | "progress_desc";
export type ServiceReportOrientation = OperationsReportOrientation;

export interface ServiceReportField {
  key: string;
  label: string;
  protected?: boolean;
  value: (row: any, dataset: ServiceReportDataset) => unknown;
}

export interface ServiceReportSection {
  id: ServiceReportSectionId;
  label: string;
  description: string;
  fields: ServiceReportField[];
  defaultFields: string[];
}

export interface ServiceReportOptions {
  periodStart: string;
  periodEnd: string;
  selectedSections: ServiceReportSectionId[];
  selectedFields: Partial<Record<ServiceReportSectionId, string[]>>;
  lotTypes: string[];
  sort: ServiceReportSort;
  orientation: ServiceReportOrientation;
  includeArchived: boolean;
  includeClosed: boolean;
}

export interface ServiceEvidenceSource {
  expected: number;
  loaded: number;
  complete: boolean;
}

export interface ServiceReportEvidenceMetadata {
  collectedAt: string;
  queryLimit: number;
  truncationPolicy: "fail";
  sources: Record<string, ServiceEvidenceSource>;
}

export interface ServiceReportDataset {
  parkingLots: any[];
  projects: any[];
  milestones: any[];
  inspections: any[];
  payments: any[];
  deliverables: any[];
  issues: any[];
  documentNumbers: Record<string, string[]>;
  evidenceMetadata?: ServiceReportEvidenceMetadata;
}

export interface ServiceReportSummary extends Record<string, number> {
  parkingLots: number;
  projects: number;
  activeProjects: number;
  warrantyProjects: number;
  contractAmount: number;
  paidAmount: number;
  remainingAmount: number;
  averageProgress: number;
  milestones: number;
  delayedMilestones: number;
  inspections: number;
  pendingInspections: number;
  correctionInspections: number;
  payments: number;
  pendingPayments: number;
  pendingPaymentAmount: number;
  acceptedDeliverables: number;
  revisionDeliverables: number;
  openIssues: number;
  criticalIssues: number;
  linkedDocuments: number;
  missingDocuments: number;
}

export interface ServiceReportModel {
  period: { start: string; end: string };
  lotTypeLabels: string[];
  summary: ServiceReportSummary;
  sourceCounts: Record<string, number>;
  evidenceMetadata: ServiceReportEvidenceMetadata;
  tables: OperationsReportTable[];
  selectedFieldCount: number;
  protectedFieldCount: number;
  riskNarrative: string;
}

const SERVICE_QUERY_LIMIT = 5000;
const DOCUMENT_ID_CHUNK_SIZE = 200;
const SERVICE_DOCUMENT_MODULES = [
  "SERVICE",
  "SERVICE_MILESTONE",
  "SERVICE_INSPECTION",
  "SERVICE_PAYMENT",
  "SERVICE_DELIVERABLE",
  "SERVICE_ISSUE",
] as const;

const LOT_TYPE_ALIASES: Record<string, string[]> = {
  offstreet: ["offstreet", "surface"],
  building: ["building", "parking_building", "multilevel", "mechanical"],
  onstreet: ["onstreet"],
};

const LOT_TYPE_LABELS: Record<string, string> = {
  offstreet: "노외주차장",
  surface: "노외주차장",
  building: "주차빌딩",
  parking_building: "주차빌딩",
  multilevel: "주차빌딩",
  mechanical: "주차빌딩",
  onstreet: "노상주차장",
};

export const SERVICE_REPORT_LOT_TYPE_OPTIONS = [
  { value: "offstreet", label: "노외주차장" },
  { value: "building", label: "주차빌딩" },
  { value: "onstreet", label: "노상주차장" },
];

const relation = (row: any, key: string) => (Array.isArray(row?.[key]) ? row[key][0] : row?.[key]);
const projectRelation = (row: any, dataset: ServiceReportDataset) =>
  relation(row, "service_projects") || dataset.projects.find((project) => project.id === row.project_id);
const lot = (row: any) => relation(row, "parking_lots");
const lotName = (row: any) => lot(row)?.name || row.parking_lot_name || "공통";
const lotType = (row: any) => row.lot_type_at_event || lot(row)?.lot_type || row.lot_type || "";
const projectNumber = (row: any, dataset: ServiceReportDataset) =>
  row.project_number || projectRelation(row, dataset)?.project_number || "-";
const projectTitle = (row: any, dataset: ServiceReportDataset) =>
  row.project_title || projectRelation(row, dataset)?.title || "-";
const profileName = (row: any, key: string, fallbackKey: string) => relation(row, key)?.name || row[fallbackKey] || "-";
const number = (value: unknown) => Number(value || 0);
const text = (value: unknown) => (value === null || value === undefined || value === "" ? "-" : String(value));
const dateOnly = (value: unknown) => (value ? String(value).split("T")[0] : "-");
const won = (value: unknown) => `${number(value).toLocaleString("ko-KR")}원`;
const percent = (value: unknown) => `${number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
const yesNo = (value: unknown) => (value ? "예" : "아니오");
const unique = <T>(values: T[]) => Array.from(new Set(values));
const documentKey = (module: string, id: string) => `${module}:${id}`;
const isArchived = (row: any) => Boolean(row.archived_at);

function linkedDocumentList(dataset: ServiceReportDataset, module: string, row: any) {
  return unique([
    row.document_number,
    ...(dataset.documentNumbers[documentKey(module, row.id)] || []),
  ].filter(Boolean).map(String)).join(", ") || "-";
}

const field = (
  key: string,
  label: string,
  value: ServiceReportField["value"],
  protectedField = false,
): ServiceReportField => ({ key, label, value, protected: protectedField });

export const SERVICE_REPORT_SECTIONS: ServiceReportSection[] = [
  { id: "overview", label: "용역 종합현황", description: "계약·공정·검수·대금·성과·리스크 핵심지표", fields: [], defaultFields: [] },
  {
    id: "projects", label: "용역 개요", description: "사업범위·기간·대상 주차장·진척 현황",
    fields: [
      field("project_number", "사업번호", (row) => row.project_number),
      field("title", "용역명", (row) => row.title),
      field("lot", "대상 주차장", (row) => lotName(row)),
      field("lot_type", "주차장 형태", (row) => LOT_TYPE_LABELS[lotType(row)] || lotType(row) || "공통"),
      field("service_type", "용역유형", (row) => SERVICE_TYPE_LABELS[row.service_type] || row.service_type),
      field("scope_of_work", "과업범위", (row) => row.scope_of_work || row.description),
      field("start_date", "계획 착수일", (row) => dateOnly(row.start_date)),
      field("end_date", "계획 완료일", (row) => dateOnly(row.extended_end_date || row.end_date)),
      field("actual_start_date", "실제 착수일", (row) => dateOnly(row.actual_start_date)),
      field("actual_end_date", "실제 완료일", (row) => dateOnly(row.actual_end_date)),
      field("progress_pct", "진척률", (row) => percent(row.progress_pct)),
      field("progress_note", "진도내용", (row) => row.progress_note),
      field("status", "사업상태", (row) => PROJECT_STATUS_LABELS[row.status] || row.status),
      field("document_numbers", "공식 문서번호", (row, dataset) => linkedDocumentList(dataset, "SERVICE", row)),
    ],
    defaultFields: ["project_number", "title", "lot", "lot_type", "service_type", "scope_of_work", "start_date", "end_date", "actual_start_date", "progress_pct", "progress_note", "status", "document_numbers"],
  },
  {
    id: "contracts", label: "계약 현황", description: "계약금액·계약기간·입찰·예산·하자보증 근거",
    fields: [
      field("project_number", "사업번호", (row) => row.project_number),
      field("title", "용역명", (row) => row.title),
      field("contractor_name", "계약업체", (row) => row.contractor_name),
      field("contract_date", "계약일", (row) => dateOnly(row.contract_date)),
      field("contract_amount", "공급가액", (row) => won(row.contract_amount)),
      field("vat_amount", "부가가치세", (row) => won(row.vat_amount)),
      field("total_amount", "계약총액", (row) => won(row.total_amount)),
      field("paid_amount", "지급액", (row) => won(row.paid_amount)),
      field("remaining_amount", "지급잔액", (row) => won(row.remaining_amount ?? number(row.total_amount) - number(row.paid_amount))),
      field("bid_contract_id", "입찰계약 연계", (row) => row.bid_contract_id),
      field("budget_item_id", "예산항목 연계", (row) => row.budget_item_id),
      field("warranty_period", "하자보증기간", (row) => row.warranty_start || row.warranty_end ? `${dateOnly(row.warranty_start)} ~ ${dateOnly(row.warranty_end)}` : "-"),
      field("warranty_bond", "하자보증서", (row) => [row.warranty_bond_company, row.warranty_bond_number, won(row.warranty_bond_amount)].filter((value) => value && value !== "0원").join(" · ")),
      field("document_numbers", "계약 문서번호", (row, dataset) => linkedDocumentList(dataset, "SERVICE", row)),
      field("business_number", "사업자등록번호", (row) => row.contractor_business_number, true),
    ],
    defaultFields: ["project_number", "title", "contractor_name", "contract_date", "contract_amount", "vat_amount", "total_amount", "paid_amount", "remaining_amount", "bid_contract_id", "budget_item_id", "warranty_period", "warranty_bond", "document_numbers"],
  },
  {
    id: "contacts", label: "업체·현장담당 연락처", description: "계약업체와 현장·감독·검수 담당 연락망",
    fields: [
      field("project_number", "사업번호", (row) => row.project_number),
      field("title", "용역명", (row) => row.title),
      field("contractor_name", "업체명", (row) => row.contractor_name),
      field("representative", "대표자", (row) => row.contractor_representative, true),
      field("company_phone", "업체 대표전화", (row) => row.contractor_phone, true),
      field("company_email", "업체 이메일", (row) => row.contractor_email, true),
      field("site_manager", "현장담당자", (row) => row.contractor_manager, true),
      field("site_manager_phone", "현장담당 연락처", (row) => row.contractor_manager_phone, true),
      field("supervisor", "담당 감독관", (row) => profileName(row, "supervisor", "supervisor_name"), true),
      field("sub_supervisor", "부감독관", (row) => profileName(row, "sub_supervisor", "sub_supervisor_name"), true),
      field("inspector", "검수담당", (row) => profileName(row, "inspector", "inspector_name"), true),
      field("address", "업체 주소", (row) => row.contractor_address, true),
    ],
    defaultFields: ["project_number", "title", "contractor_name", "representative", "company_phone", "company_email", "site_manager", "site_manager_phone", "supervisor", "sub_supervisor", "inspector"],
  },
  {
    id: "milestones", label: "착수·진도", description: "착수·중간·기성·최종·하자 단계별 목표와 실적",
    fields: [
      field("project_number", "사업번호", (row, dataset) => projectNumber(row, dataset)),
      field("project_title", "용역명", (row, dataset) => projectTitle(row, dataset)),
      field("milestone_number", "단계", (row) => `제${number(row.milestone_number)}단계`),
      field("milestone_type", "단계구분", (row) => MILESTONE_TYPE_LABELS[row.milestone_type] || row.milestone_type),
      field("title", "단계명", (row) => row.title),
      field("target_date", "목표일", (row) => dateOnly(row.target_date)),
      field("actual_date", "완료일", (row) => dateOnly(row.actual_date)),
      field("delay_days", "지연일수", (row) => `${number(row.delay_days)}일`),
      field("weight_pct", "공정가중치", (row) => percent(row.weight_pct)),
      field("deliverables", "성과물 제출", (row) => `${number(row.deliverables_submitted)}/${number(row.deliverables_count)}건`),
      field("payment_amount", "연계 기성액", (row) => won(row.payment_amount)),
      field("payment_requested", "대금청구", (row) => yesNo(row.payment_requested)),
      field("status", "진도상태", (row) => MILESTONE_STATUS_LABELS[row.status] || row.status),
      field("document_numbers", "공식 문서번호", (row, dataset) => linkedDocumentList(dataset, "SERVICE_MILESTONE", row)),
    ],
    defaultFields: ["project_number", "project_title", "milestone_number", "milestone_type", "title", "target_date", "actual_date", "delay_days", "weight_pct", "deliverables", "payment_amount", "payment_requested", "status", "document_numbers"],
  },
  {
    id: "inspections", label: "검수·시정조치", description: "기성·중간·준공·하자검수와 감액·보완 확인",
    fields: [
      field("inspection_number", "검수번호", (row) => row.inspection_number),
      field("project_number", "사업번호", (row, dataset) => projectNumber(row, dataset)),
      field("inspection_type", "검수구분", (row) => INSPECTION_TYPE_LABELS[row.inspection_type] || row.inspection_type),
      field("inspection_date", "검수일", (row) => dateOnly(row.inspection_date)),
      field("title", "검수명", (row) => row.title),
      field("target_amount", "검수대상액", (row) => won(row.target_amount)),
      field("approved_amount", "인정금액", (row) => won(row.approved_amount)),
      field("deduction_amount", "감액", (row) => won(row.deduction_amount)),
      field("result", "검수결과", (row) => RESULT_LABELS[row.result] || row.result),
      field("check_result", "점검결과", (row) => `적합 ${number(row.pass_items)} · 부적합 ${number(row.fail_items)}`),
      field("deficiency_note", "미비사항", (row) => row.deficiency_note || row.result_note),
      field("correction_deadline", "보완기한", (row) => dateOnly(row.correction_deadline)),
      field("correction_verified", "보완확인", (row) => yesNo(row.correction_verified)),
      field("status", "검수상태", (row) => INSPECTION_STATUS_LABELS[row.status] || row.status),
      field("photo_evidence", "사진증빙", (row) => Array.isArray(row.photos) ? `${row.photos.length}건` : row.photos ? "등록" : "없음"),
      field("document_numbers", "검수 문서번호", (row, dataset) => linkedDocumentList(dataset, "SERVICE_INSPECTION", row)),
      field("inspector_name", "검수자", (row) => row.inspector_name, true),
    ],
    defaultFields: ["inspection_number", "project_number", "inspection_type", "inspection_date", "title", "target_amount", "approved_amount", "deduction_amount", "result", "check_result", "deficiency_note", "correction_deadline", "correction_verified", "status", "photo_evidence", "document_numbers"],
  },
  {
    id: "payments", label: "대금 지급", description: "선급·기성·준공금 청구, 공제, 승인, 지급 현황",
    fields: [
      field("payment_number", "대금번호", (row) => row.payment_number),
      field("project_number", "사업번호", (row, dataset) => projectNumber(row, dataset)),
      field("payment_type", "대금구분", (row) => PAYMENT_TYPE_LABELS[row.payment_type] || row.payment_type),
      field("title", "청구명", (row) => row.title),
      field("request_date", "청구일", (row) => dateOnly(row.request_date)),
      field("due_date", "지급기한", (row) => dateOnly(row.due_date)),
      field("paid_date", "지급일", (row) => dateOnly(row.paid_date)),
      field("gross_amount", "청구금액", (row) => won(row.gross_amount)),
      field("deduction", "공제액", (row) => won(number(row.advance_deduction) + number(row.other_deduction))),
      field("net_amount", "지급결정액", (row) => won(row.net_amount ?? number(row.gross_amount) - number(row.advance_deduction) - number(row.other_deduction))),
      field("paid_amount", "실지급액", (row) => won(row.paid_amount)),
      field("delay", "지급지연", (row) => row.is_delayed ? `${number(row.delay_days)}일 · 이자 ${won(row.delay_interest)}` : "없음"),
      field("budget_execution_id", "예산집행 연계", (row) => row.budget_execution_id),
      field("receipt_number", "지급증빙번호", (row) => row.receipt_number),
      field("status", "지급상태", (row) => PAYMENT_STATUS_LABELS[row.status] || row.status),
      field("document_numbers", "지급 문서번호", (row, dataset) => linkedDocumentList(dataset, "SERVICE_PAYMENT", row)),
      field("bank_account", "지급계좌", (row) => [row.bank_name, row.bank_account].filter(Boolean).join(" "), true),
    ],
    defaultFields: ["payment_number", "project_number", "payment_type", "title", "request_date", "due_date", "paid_date", "gross_amount", "deduction", "net_amount", "paid_amount", "delay", "budget_execution_id", "receipt_number", "status", "document_numbers"],
  },
  {
    id: "deliverables", label: "성과물", description: "착수·중간·최종보고서 등 성과물 제출·검토·보완 현황",
    fields: [
      field("deliverable_number", "성과물번호", (row) => row.deliverable_number),
      field("project_number", "사업번호", (row, dataset) => projectNumber(row, dataset)),
      field("deliverable_type", "성과물구분", (row) => row.deliverable_type),
      field("title", "성과물명", (row) => row.title),
      field("format_required", "요구형식", (row) => row.format_required),
      field("required_copies", "제출부수", (row) => `${number(row.required_copies)}부`),
      field("submitted_at", "제출일", (row) => dateOnly(row.submitted_at)),
      field("status", "검토상태", (row) => DELIVERABLE_STATUS_LABELS[row.status] || row.status),
      field("review_score", "평가점수", (row) => row.review_score === null || row.review_score === undefined ? "-" : `${row.review_score}점`),
      field("review_note", "검토의견", (row) => row.review_note),
      field("revision_count", "보완횟수", (row) => `${number(row.revision_count)}회`),
      field("revision_deadline", "보완기한", (row) => dateOnly(row.revision_deadline)),
      field("document_numbers", "성과 문서번호", (row, dataset) => linkedDocumentList(dataset, "SERVICE_DELIVERABLE", row)),
    ],
    defaultFields: ["deliverable_number", "project_number", "deliverable_type", "title", "format_required", "required_copies", "submitted_at", "status", "review_score", "review_note", "revision_count", "revision_deadline", "document_numbers"],
  },
  {
    id: "risks", label: "하자·리스크", description: "지연·품질·하자·안전·분쟁·미승인·문서누락 조치사항",
    fields: [
      field("risk_level", "위험도", (row) => row.risk_level),
      field("project_number", "사업번호", (row) => row.project_number),
      field("area", "구분", (row) => row.area),
      field("reference", "대상번호", (row) => row.reference),
      field("finding", "확인사항", (row) => row.finding),
      field("impact_amount", "영향금액", (row) => row.impact_amount === null ? "-" : won(row.impact_amount)),
      field("impact_days", "영향일수", (row) => row.impact_days ? `${row.impact_days}일` : "-"),
      field("deadline", "조치기한", (row) => dateOnly(row.deadline)),
      field("status", "처리상태", (row) => row.status),
      field("document_numbers", "공식 문서번호", (row) => row.document_numbers),
    ],
    defaultFields: ["risk_level", "project_number", "area", "reference", "finding", "impact_amount", "impact_days", "deadline", "status", "document_numbers"],
  },
  {
    id: "documents", label: "공식 문서번호", description: "사업·단계·검수·대금·성과·이슈별 공식문서 연계",
    fields: [
      field("source_type", "업무구분", (row) => row.source_type),
      field("project_number", "사업번호", (row) => row.project_number),
      field("record_number", "업무번호", (row) => row.record_number),
      field("title", "문서대상", (row) => row.title),
      field("document_number", "공식 문서번호", (row) => row.document_number),
      field("status", "업무상태", (row) => row.status),
      field("record_date", "기준일", (row) => row.record_date),
    ],
    defaultFields: ["source_type", "project_number", "record_number", "title", "document_number", "status", "record_date"],
  },
];

export const SERVICE_REPORT_PRESETS = {
  summary: { label: "간부 요약", sections: ["overview", "projects", "contracts", "risks"] as ServiceReportSectionId[] },
  standard: { label: "실무 종합", sections: SERVICE_REPORT_SECTIONS.map((section) => section.id) },
  audit: { label: "감사 대응", sections: ["overview", "projects", "contracts", "contacts", "milestones", "inspections", "payments", "deliverables", "risks", "documents"] as ServiceReportSectionId[] },
};

export function defaultServiceReportFields(): Partial<Record<ServiceReportSectionId, string[]>> {
  return Object.fromEntries(SERVICE_REPORT_SECTIONS.map((section) => [section.id, [...section.defaultFields]]));
}

export function parseServiceReportOptions(parameters: Record<string, string>): ServiceReportOptions {
  const knownSections = new Set(SERVICE_REPORT_SECTIONS.map((section) => section.id));
  const selectedSections = (parameters.service_sections || SERVICE_REPORT_PRESETS.summary.sections.join(","))
    .split(",")
    .filter((id): id is ServiceReportSectionId => knownSections.has(id as ServiceReportSectionId));
  let selectedFields = defaultServiceReportFields();
  try {
    const parsed = JSON.parse(parameters.service_fields || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) selectedFields = { ...selectedFields, ...parsed };
  } catch {
    selectedFields = defaultServiceReportFields();
  }
  return {
    periodStart: parameters.period_start,
    periodEnd: parameters.period_end || parameters.period_start,
    selectedSections: selectedSections.length ? selectedSections : ["overview"],
    selectedFields,
    lotTypes: (parameters.service_lot_types || "offstreet,building,onstreet").split(",").filter(Boolean),
    sort: (["attention", "date_desc", "project", "amount_desc", "progress_desc"].includes(parameters.service_sort)
      ? parameters.service_sort
      : "attention") as ServiceReportSort,
    orientation: parameters.service_orientation === "landscape" ? "landscape" : "portrait",
    includeArchived: parameters.service_include_archived === "true",
    includeClosed: parameters.service_include_closed !== "false",
  };
}

export function assertServiceReportTableComplete(
  label: string,
  expected: number,
  loaded: number,
  limit = SERVICE_QUERY_LIMIT,
) {
  if (expected > limit || expected !== loaded) {
    throw new Error(`${label} 자료 ${expected}건 중 ${loaded}건만 조회되어 테이블 절단을 방지하기 위해 보고서 생성을 중단했습니다.`);
  }
}

async function checkedServiceQuery(label: string, promise: PromiseLike<any>, limit = SERVICE_QUERY_LIMIT) {
  const result = await promise;
  if (result.error) throw new Error(`${label} 자료 조회에 실패했습니다: ${result.error.message}`);
  const rows = result.data || [];
  const expected = typeof result.count === "number" ? result.count : rows.length;
  assertServiceReportTableComplete(label, expected, rows.length, limit);
  return { rows, evidence: { expected, loaded: rows.length, complete: true } as ServiceEvidenceSource };
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function collectChildRows(table: "service_milestones" | "service_inspections" | "service_payments" | "service_deliverables" | "service_issues", label: string, projectIds: string[]) {
  if (!projectIds.length) return { rows: [] as any[], evidence: { expected: 0, loaded: 0, complete: true } as ServiceEvidenceSource };
  const rows: any[] = [];
  let expected = 0;
  for (const idChunk of chunks(projectIds, DOCUMENT_ID_CHUNK_SIZE)) {
    const result = await checkedServiceQuery(
      label,
      supabase.from(table).select("*", { count: "exact" }).in("project_id", idChunk).limit(SERVICE_QUERY_LIMIT),
    );
    rows.push(...result.rows);
    expected += result.evidence.expected;
  }
  if (expected > SERVICE_QUERY_LIMIT) assertServiceReportTableComplete(label, expected, rows.length);
  return { rows, evidence: { expected, loaded: rows.length, complete: true } as ServiceEvidenceSource };
}

async function collectServiceDocumentNumbers(references: Array<{ module: string; id: string }>) {
  const referencesByModule = references.reduce<Map<string, Set<string>>>((result, reference) => {
    if (!reference.id || !SERVICE_DOCUMENT_MODULES.includes(reference.module as typeof SERVICE_DOCUMENT_MODULES[number])) return result;
    const ids = result.get(reference.module) || new Set<string>();
    ids.add(reference.id);
    result.set(reference.module, ids);
    return result;
  }, new Map());
  const links: any[] = [];
  let linkExpected = 0;
  for (const [module, ids] of referencesByModule) {
    for (const idChunk of chunks([...ids], DOCUMENT_ID_CHUNK_SIZE)) {
      const result = await checkedServiceQuery(
        `${module} 공식문서 첨부`,
        supabase.from("attachments")
          .select("module, ref_id, file_path", { count: "exact" })
          .eq("ref_type", "official_document_link")
          .eq("module", module)
          .in("ref_id", idChunk)
          .limit(SERVICE_QUERY_LIMIT),
      );
      links.push(...result.rows);
      linkExpected += result.evidence.expected;
    }
  }
  if (linkExpected > SERVICE_QUERY_LIMIT) assertServiceReportTableComplete("용역 공식문서 첨부", linkExpected, links.length);

  const documentIds = unique(links.map((link) => String(link.file_path || "").replace("parkmaster-document://", "")).filter(Boolean));
  const documents: any[] = [];
  let documentExpected = 0;
  for (const idChunk of chunks(documentIds, DOCUMENT_ID_CHUNK_SIZE)) {
    const result = await checkedServiceQuery(
      "공식문서대장",
      supabase.from("official_documents").select("id, document_number", { count: "exact" }).in("id", idChunk).limit(SERVICE_QUERY_LIMIT),
    );
    documents.push(...result.rows);
    documentExpected += result.evidence.expected;
  }
  if (documentExpected > SERVICE_QUERY_LIMIT) assertServiceReportTableComplete("공식문서대장", documentExpected, documents.length);
  const numberById = new Map(documents.map((document) => [document.id, document.document_number]));
  const documentNumbers = links.reduce<Record<string, string[]>>((result, link) => {
    const documentId = String(link.file_path || "").replace("parkmaster-document://", "");
    const documentNumber = numberById.get(documentId);
    if (!documentNumber) return result;
    const key = documentKey(link.module, link.ref_id);
    result[key] = unique([...(result[key] || []), String(documentNumber)]);
    return result;
  }, {});
  return {
    documentNumbers,
    evidence: {
      documentLinks: { expected: linkExpected, loaded: links.length, complete: true },
      officialDocuments: { expected: documentExpected, loaded: documents.length, complete: true },
    },
  };
}

export async function collectServiceReportData(options: ServiceReportOptions): Promise<ServiceReportDataset> {
  const projectResult = await checkedServiceQuery(
    "용역사업",
    supabase.from("service_projects")
      .select("*, parking_lots(id, code, name, lot_type), supervisor:profiles!service_projects_supervisor_id_fkey(name), sub_supervisor:profiles!service_projects_sub_supervisor_id_fkey(name), inspector:profiles!service_projects_inspector_id_fkey(name)", { count: "exact" })
      .lte("start_date", options.periodEnd)
      .order("project_number")
      .limit(SERVICE_QUERY_LIMIT),
  );
  const projects = projectResult.rows.filter((row: any) => {
    const effectiveEnd = row.extended_end_date || row.actual_end_date || row.end_date;
    return (!effectiveEnd || effectiveEnd >= options.periodStart) && (options.includeArchived || !isArchived(row));
  });
  const projectIds = projects.map((row: any) => row.id).filter(Boolean);
  const [milestoneResult, inspectionResult, paymentResult, deliverableResult, issueResult] = await Promise.all([
    collectChildRows("service_milestones", "용역 착수·진도", projectIds),
    collectChildRows("service_inspections", "용역 검수", projectIds),
    collectChildRows("service_payments", "용역 대금", projectIds),
    collectChildRows("service_deliverables", "용역 성과물", projectIds),
    collectChildRows("service_issues", "용역 이슈", projectIds),
  ]);
  const references = [
    ...projects.map((row: any) => ({ module: "SERVICE", id: row.id })),
    ...milestoneResult.rows.map((row: any) => ({ module: "SERVICE_MILESTONE", id: row.id })),
    ...inspectionResult.rows.map((row: any) => ({ module: "SERVICE_INSPECTION", id: row.id })),
    ...paymentResult.rows.map((row: any) => ({ module: "SERVICE_PAYMENT", id: row.id })),
    ...deliverableResult.rows.map((row: any) => ({ module: "SERVICE_DELIVERABLE", id: row.id })),
    ...issueResult.rows.map((row: any) => ({ module: "SERVICE_ISSUE", id: row.id })),
  ];
  const documentResult = await collectServiceDocumentNumbers(references);
  const parkingLots = unique(projects.map((row: any) => lot(row)).filter(Boolean).map((row: any) => JSON.stringify(row))).map((row) => JSON.parse(row));
  return {
    parkingLots,
    projects,
    milestones: milestoneResult.rows,
    inspections: inspectionResult.rows,
    payments: paymentResult.rows,
    deliverables: deliverableResult.rows,
    issues: issueResult.rows,
    documentNumbers: documentResult.documentNumbers,
    evidenceMetadata: {
      collectedAt: new Date().toISOString(),
      queryLimit: SERVICE_QUERY_LIMIT,
      truncationPolicy: "fail",
      sources: {
        projects: projectResult.evidence,
        milestones: milestoneResult.evidence,
        inspections: inspectionResult.evidence,
        payments: paymentResult.evidence,
        deliverables: deliverableResult.evidence,
        issues: issueResult.evidence,
        ...documentResult.evidence,
      },
    },
  };
}

function matchesLotType(row: any, selected: string[]) {
  const actual = lotType(row);
  if (!actual || !selected.length || selected.length === SERVICE_REPORT_LOT_TYPE_OPTIONS.length) return true;
  return selected.some((group) => (LOT_TYPE_ALIASES[group] || [group]).includes(actual));
}

function inPeriod(value: unknown, options: ServiceReportOptions) {
  const date = dateOnly(value);
  return date !== "-" && date >= options.periodStart && date <= options.periodEnd;
}

function sortRows(rows: any[], sort: ServiceReportSort) {
  const rowDate = (row: any) => row.reported_at || row.request_date || row.inspection_date || row.target_date || row.submitted_at || row.start_date || row.record_date || "";
  const rowAmount = (row: any) => number(row.impact_amount ?? row.gross_amount ?? row.target_amount ?? row.total_amount ?? row.contract_amount);
  const project = (row: any) => text(row.project_number || row.reference || row.title);
  const attentionRank: Record<string, number> = { 긴급: 0, 높음: 1, "보완 필요": 2, "조치 필요": 2, 지연: 3, 중지: 4, 해지: 4 };
  return [...rows].sort((a, b) => {
    if (sort === "date_desc") return String(rowDate(b)).localeCompare(String(rowDate(a)));
    if (sort === "project") return project(a).localeCompare(project(b), "ko", { numeric: true });
    if (sort === "amount_desc") return rowAmount(b) - rowAmount(a);
    if (sort === "progress_desc") return number(b.progress_pct ?? b.weight_pct) - number(a.progress_pct ?? a.weight_pct);
    return (attentionRank[a.risk_level || a.status] ?? 20) - (attentionRank[b.risk_level || b.status] ?? 20)
      || String(rowDate(b)).localeCompare(String(rowDate(a)));
  });
}

function buildDocumentRows(dataset: ServiceReportDataset, projects: any[], milestones: any[], inspections: any[], payments: any[], deliverables: any[], issues: any[]) {
  const rows: any[] = [];
  const add = (sourceType: string, module: string, row: any, recordNumber: unknown, title: unknown, status: unknown, recordDate: unknown) => {
    rows.push({
      source_type: sourceType,
      project_number: projectNumber(row, dataset),
      record_number: text(recordNumber),
      title: text(title),
      document_number: linkedDocumentList(dataset, module, row),
      status: text(status),
      record_date: dateOnly(recordDate),
    });
  };
  projects.forEach((row) => add("용역사업·계약", "SERVICE", row, row.project_number, row.title, PROJECT_STATUS_LABELS[row.status] || row.status, row.contract_date || row.start_date));
  milestones.forEach((row) => add("착수·진도", "SERVICE_MILESTONE", row, row.milestone_number, row.title, MILESTONE_STATUS_LABELS[row.status] || row.status, row.actual_date || row.target_date));
  inspections.forEach((row) => add("검수", "SERVICE_INSPECTION", row, row.inspection_number, row.title, INSPECTION_STATUS_LABELS[row.status] || row.status, row.inspection_date));
  payments.forEach((row) => add("대금", "SERVICE_PAYMENT", row, row.payment_number, row.title, PAYMENT_STATUS_LABELS[row.status] || row.status, row.paid_date || row.request_date));
  deliverables.forEach((row) => add("성과물", "SERVICE_DELIVERABLE", row, row.deliverable_number, row.title, DELIVERABLE_STATUS_LABELS[row.status] || row.status, row.submitted_at || row.created_at));
  issues.forEach((row) => add("하자·이슈", "SERVICE_ISSUE", row, row.issue_number, row.title, ISSUE_STATUS_LABELS[row.status] || row.status, row.reported_at));
  return rows.map((row) => ({ ...row, __missing_document: row.document_number === "-" }));
}

function buildRiskRows(dataset: ServiceReportDataset, projects: any[], milestones: any[], inspections: any[], payments: any[], issues: any[], documents: any[]) {
  const rows: any[] = [];
  issues.filter((row) => !["resolved", "closed"].includes(row.status)).forEach((row) => rows.push({
    risk_level: SEVERITY_LABELS[row.severity] || row.severity,
    project_number: projectNumber(row, dataset), area: ISSUE_TYPE_LABELS[row.issue_type] || row.issue_type,
    reference: row.issue_number, finding: row.title, impact_amount: number(row.impact_amount), impact_days: number(row.impact_days),
    deadline: row.revised_end_date, status: ISSUE_STATUS_LABELS[row.status] || row.status,
    document_numbers: linkedDocumentList(dataset, "SERVICE_ISSUE", row),
  }));
  milestones.filter((row) => row.status === "delayed" || number(row.delay_days) > 0).forEach((row) => rows.push({
    risk_level: "높음", project_number: projectNumber(row, dataset), area: "공정지연", reference: `${row.milestone_number}단계`,
    finding: `${row.title} ${number(row.delay_days)}일 지연`, impact_amount: number(row.payment_amount), impact_days: number(row.delay_days),
    deadline: row.target_date, status: MILESTONE_STATUS_LABELS[row.status] || row.status,
    document_numbers: linkedDocumentList(dataset, "SERVICE_MILESTONE", row),
  }));
  inspections.filter((row) => ["correction_required", "rejected"].includes(row.status)).forEach((row) => rows.push({
    risk_level: row.status === "rejected" ? "긴급" : "높음", project_number: projectNumber(row, dataset), area: "검수·시정", reference: row.inspection_number,
    finding: row.deficiency_note || row.result_note || "검수 보완 필요", impact_amount: number(row.deduction_amount), impact_days: 0,
    deadline: row.correction_deadline, status: INSPECTION_STATUS_LABELS[row.status] || row.status,
    document_numbers: linkedDocumentList(dataset, "SERVICE_INSPECTION", row),
  }));
  payments.filter((row) => row.is_delayed || (["requested", "reviewing", "approved"].includes(row.status) && row.due_date && row.due_date < dataset.evidenceMetadata?.collectedAt?.slice(0, 10))).forEach((row) => rows.push({
    risk_level: "주의", project_number: projectNumber(row, dataset), area: "대금지급", reference: row.payment_number,
    finding: row.is_delayed ? `지급 ${number(row.delay_days)}일 지연` : "지급기한 경과 확인", impact_amount: number(row.net_amount ?? row.gross_amount), impact_days: number(row.delay_days),
    deadline: row.due_date, status: PAYMENT_STATUS_LABELS[row.status] || row.status,
    document_numbers: linkedDocumentList(dataset, "SERVICE_PAYMENT", row),
  }));
  projects.filter((row) => ["suspended", "terminated"].includes(row.status)).forEach((row) => rows.push({
    risk_level: row.status === "terminated" ? "긴급" : "높음", project_number: row.project_number, area: "계약상태", reference: row.project_number,
    finding: row.termination_reason || row.suspension_reason || `${PROJECT_STATUS_LABELS[row.status]} 사유 확인 필요`, impact_amount: number(row.remaining_amount), impact_days: number(row.extended_days),
    deadline: row.extended_end_date || row.end_date, status: PROJECT_STATUS_LABELS[row.status] || row.status,
    document_numbers: linkedDocumentList(dataset, "SERVICE", row),
  }));
  const missingByType = documents.filter((row) => row.__missing_document).reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.source_type]: (counts[row.source_type] || 0) + 1 }), {});
  Object.entries(missingByType).forEach(([sourceType, count]) => rows.push({
    risk_level: "확인", project_number: "공통", area: "문서번호", reference: sourceType,
    finding: `공식 문서번호 미등록 ${count}건`, impact_amount: null, impact_days: 0, deadline: null, status: "등록 필요", document_numbers: "-",
  }));
  return rows;
}

const TABLE_IDENTITY_FIELDS: Record<Exclude<ServiceReportSectionId, "overview">, string[]> = {
  projects: ["project_number", "title"], contracts: ["project_number", "title"], contacts: ["project_number", "title"],
  milestones: ["project_number", "milestone_number"], inspections: ["inspection_number", "project_number"],
  payments: ["payment_number", "project_number"], deliverables: ["deliverable_number", "project_number"],
  risks: ["risk_level", "project_number", "area"], documents: ["source_type", "project_number", "record_number"],
};

function splitServiceFields(id: Exclude<ServiceReportSectionId, "overview">, fields: ServiceReportField[], orientation: ServiceReportOrientation) {
  const maximumColumns = orientation === "portrait" ? 10 : 14;
  if (fields.length <= maximumColumns) return [fields];
  const identity = fields.filter((item) => TABLE_IDENTITY_FIELDS[id].includes(item.key));
  const details = fields.filter((item) => !TABLE_IDENTITY_FIELDS[id].includes(item.key));
  const detailLimit = Math.max(1, maximumColumns - identity.length);
  const groups: ServiceReportField[][] = [];
  for (let index = 0; index < details.length; index += detailLimit) groups.push([...identity, ...details.slice(index, index + detailLimit)]);
  return groups;
}

function completeSampleEvidence(dataset: ServiceReportDataset): ServiceReportEvidenceMetadata {
  const counts: Record<string, number> = {
    projects: dataset.projects.length, milestones: dataset.milestones.length, inspections: dataset.inspections.length,
    payments: dataset.payments.length, deliverables: dataset.deliverables.length, issues: dataset.issues.length,
    documentLinks: Object.values(dataset.documentNumbers).flat().length,
    officialDocuments: unique(Object.values(dataset.documentNumbers).flat()).length,
  };
  return {
    collectedAt: "2026-08-31T23:59:59.000Z", queryLimit: SERVICE_QUERY_LIMIT, truncationPolicy: "fail",
    sources: Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { expected: count, loaded: count, complete: true }])),
  };
}

export function buildServiceReportModel(dataset: ServiceReportDataset, options: ServiceReportOptions): ServiceReportModel {
  const projects = dataset.projects.filter((row) => {
    const effectiveEnd = row.extended_end_date || row.actual_end_date || row.end_date;
    return (options.includeArchived || !isArchived(row))
      && (options.includeClosed || !["closed", "terminated"].includes(row.status))
      && row.start_date <= options.periodEnd && (!effectiveEnd || effectiveEnd >= options.periodStart)
      && matchesLotType(row, options.lotTypes);
  });
  const projectIds = new Set(projects.map((row) => row.id));
  const milestones = dataset.milestones.filter((row) => projectIds.has(row.project_id));
  const inspections = dataset.inspections.filter((row) => projectIds.has(row.project_id) && inPeriod(row.inspection_date, options));
  const payments = dataset.payments.filter((row) => projectIds.has(row.project_id) && inPeriod(row.request_date, options));
  const deliverables = dataset.deliverables.filter((row) => projectIds.has(row.project_id));
  const issues = dataset.issues.filter((row) => projectIds.has(row.project_id) && (!["resolved", "closed"].includes(row.status) || inPeriod(row.reported_at, options)));
  const documents = buildDocumentRows(dataset, projects, milestones, inspections, payments, deliverables, issues);
  const evidenceMetadata = dataset.evidenceMetadata || completeSampleEvidence(dataset);
  const datasetWithEvidence = { ...dataset, evidenceMetadata };
  const risks = buildRiskRows(datasetWithEvidence, projects, milestones, inspections, payments, issues, documents);
  const pendingPayments = payments.filter((row) => ["requested", "reviewing", "approved"].includes(row.status));
  const openIssues = issues.filter((row) => !["resolved", "closed"].includes(row.status));
  const linkedDocuments = unique(documents.flatMap((row) => row.document_number === "-" ? [] : row.document_number.split(",").map((value: string) => value.trim()))).length;
  const summary: ServiceReportSummary = {
    parkingLots: new Set(projects.map((row) => row.lot_id).filter(Boolean)).size,
    projects: projects.length,
    activeProjects: projects.filter((row) => ["preparing", "in_progress", "inspection", "suspended"].includes(row.status)).length,
    warrantyProjects: projects.filter((row) => row.status === "warranty").length,
    contractAmount: projects.reduce((sum, row) => sum + number(row.total_amount), 0),
    paidAmount: projects.reduce((sum, row) => sum + number(row.paid_amount), 0),
    remainingAmount: projects.reduce((sum, row) => sum + number(row.remaining_amount ?? number(row.total_amount) - number(row.paid_amount)), 0),
    averageProgress: projects.length ? projects.reduce((sum, row) => sum + number(row.progress_pct), 0) / projects.length : 0,
    milestones: milestones.length,
    delayedMilestones: milestones.filter((row) => row.status === "delayed" || number(row.delay_days) > 0).length,
    inspections: inspections.length,
    pendingInspections: inspections.filter((row) => ["pending", "inspecting", "correction_required", "correction_submitted"].includes(row.status)).length,
    correctionInspections: inspections.filter((row) => ["correction_required", "rejected"].includes(row.status)).length,
    payments: payments.length,
    pendingPayments: pendingPayments.length,
    pendingPaymentAmount: pendingPayments.reduce((sum, row) => sum + number(row.net_amount ?? row.gross_amount), 0),
    acceptedDeliverables: deliverables.filter((row) => ["accepted", "final"].includes(row.status)).length,
    revisionDeliverables: deliverables.filter((row) => ["revision_required", "rejected"].includes(row.status)).length,
    openIssues: openIssues.length,
    criticalIssues: openIssues.filter((row) => ["high", "critical"].includes(row.severity)).length,
    linkedDocuments,
    missingDocuments: documents.filter((row) => row.__missing_document).length,
  };
  const rowsBySection: Record<Exclude<ServiceReportSectionId, "overview">, any[]> = {
    projects, contracts: projects, contacts: projects, milestones, inspections, payments, deliverables, risks, documents,
  };
  const tables = options.selectedSections.filter((id): id is Exclude<ServiceReportSectionId, "overview"> => id !== "overview").flatMap((id) => {
    const section = SERVICE_REPORT_SECTIONS.find((item) => item.id === id)!;
    const requested = options.selectedFields[id] || section.defaultFields;
    const fields = section.fields.filter((item) => requested.includes(item.key));
    const sourceRows = sortRows(rowsBySection[id], options.sort);
    const groups = splitServiceFields(id, fields, options.orientation);
    return groups.map((group, groupIndex) => ({
      id,
      title: section.label,
      subtitle: groups.length > 1 ? `${section.label} 세부정보` : undefined,
      subtitleNumber: groups.length > 1 ? groupIndex + 1 : undefined,
      continuation: groupIndex > 0,
      columns: group.map((item) => ({ key: item.key, label: item.label })),
      rows: sourceRows.map((row) => Object.fromEntries(group.map((item) => [item.key, text(item.value(row, datasetWithEvidence))]))),
    } as OperationsReportTable));
  });
  const selectedFields = options.selectedSections.flatMap((id) => {
    const section = SERVICE_REPORT_SECTIONS.find((item) => item.id === id)!;
    return section.fields.filter((item) => (options.selectedFields[id] || section.defaultFields).includes(item.key));
  });
  const riskNarrative = [
    summary.delayedMilestones ? `지연 단계 ${summary.delayedMilestones}건` : "지연 단계 없음",
    summary.correctionInspections ? `검수 보완·반려 ${summary.correctionInspections}건` : "검수 보완·반려 없음",
    summary.pendingPayments ? `지급 진행 중 ${summary.pendingPayments}건` : "지급 진행 중 없음",
    summary.criticalIssues ? `높음·긴급 미해결 이슈 ${summary.criticalIssues}건` : "높음·긴급 미해결 이슈 없음",
    summary.missingDocuments ? `공식 문서번호 미등록 ${summary.missingDocuments}건` : "공식 문서번호 누락 없음",
  ].join("; ");
  return {
    period: { start: options.periodStart, end: options.periodEnd },
    lotTypeLabels: SERVICE_REPORT_LOT_TYPE_OPTIONS.filter((item) => options.lotTypes.includes(item.value)).map((item) => item.label),
    summary,
    sourceCounts: {
      lots: summary.parkingLots, projects: projects.length, milestones: milestones.length, inspections: inspections.length,
      payments: payments.length, deliverables: deliverables.length, issues: issues.length, risks: risks.length, documents: linkedDocuments,
    },
    evidenceMetadata,
    tables,
    selectedFieldCount: selectedFields.length,
    protectedFieldCount: selectedFields.filter((item) => item.protected).length,
    riskNarrative,
  };
}

export function serviceReportBriefRows(model: ServiceReportModel, documentSummary?: string): string[][] {
  return [
    ["담당부서", PRIMARY_DEPARTMENT],
    ["보고기간", `${model.period.start} ~ ${model.period.end}`],
    ["보고대상", `제주시 ${model.lotTypeLabels.join("·") || "공영주차장 전체"} 용역사업`],
    ["주요내용", unique(model.tables.filter((table) => !table.continuation).map((table) => table.title)).join("·") || "용역사업관리 핵심 현황"],
    ["작성목적", documentSummary || "용역사업의 계약·공정·검수·대금·성과·하자 및 공식 문서 근거를 종합하여 적정 이행과 후속 조치에 활용하기 위함."],
    ["산출기준", `보고기간과 중첩되는 용역 ${model.summary.projects.toLocaleString("ko-KR")}건의 원장을 기준으로 단계·검수·대금·성과·이슈를 연계 집계함. 원천자료는 테이블 절단 없이 완전 조회된 경우에만 생성함. ${model.riskNarrative}`],
  ];
}

export function serviceReportSummaryRows(model: ServiceReportModel): string[][] {
  return [
    ["대상 용역", `${model.summary.projects.toLocaleString("ko-KR")}건`, "진행 용역", `${model.summary.activeProjects.toLocaleString("ko-KR")}건`],
    ["계약총액", won(model.summary.contractAmount), "지급액", won(model.summary.paidAmount)],
    ["지급잔액", won(model.summary.remainingAmount), "평균 진척률", percent(model.summary.averageProgress)],
    ["지연 단계", `${model.summary.delayedMilestones.toLocaleString("ko-KR")}건`, "검수 보완·반려", `${model.summary.correctionInspections.toLocaleString("ko-KR")}건`],
    ["지급 진행 중", `${model.summary.pendingPayments.toLocaleString("ko-KR")}건 · ${won(model.summary.pendingPaymentAmount)}`, "보완 성과물", `${model.summary.revisionDeliverables.toLocaleString("ko-KR")}건`],
    ["미해결 이슈", `${model.summary.openIssues.toLocaleString("ko-KR")}건`, "높음·긴급 이슈", `${model.summary.criticalIssues.toLocaleString("ko-KR")}건`],
    ["하자보증 용역", `${model.summary.warrantyProjects.toLocaleString("ko-KR")}건`, "공식 문서번호 미등록", `${model.summary.missingDocuments.toLocaleString("ko-KR")}건`],
  ];
}

export function toOperationsCompatibleServiceModel(model: ServiceReportModel): OperationsReportModel {
  return {
    period: model.period,
    lotTypeLabels: model.lotTypeLabels,
    summary: {
      parkingLots: model.summary.parkingLots,
      totalSpaces: 0,
      activeContracts: model.summary.activeProjects,
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

export async function getServiceReportEvidence(parameters: Record<string, string>) {
  const options = parseServiceReportOptions(parameters);
  const dataset = await collectServiceReportData(options);
  const model = buildServiceReportModel(dataset, options);
  return {
    period: model.period,
    sourceCounts: model.sourceCounts,
    summary: model.summary,
    selectedFieldCount: model.selectedFieldCount,
    protectedFieldCount: model.protectedFieldCount,
    riskNarrative: model.riskNarrative,
    evidenceMetadata: model.evidenceMetadata,
  };
}

export const SERVICE_REPORT_SAMPLE_DATASET: ServiceReportDataset = {
  parkingLots: [
    { id: "lot-1", code: "JJP-001", name: "동문공설", lot_type: "offstreet" },
    { id: "lot-2", code: "JJP-002", name: "칠성골", lot_type: "multilevel" },
  ],
  projects: [
    {
      id: "project-1", project_number: "SVC-2026-001", title: "주차관제시스템 유지보수 용역", lot_id: "lot-1",
      service_type: "maintenance", scope_of_work: "관제장비 정기점검 및 장애복구", contractor_name: "제주스마트파킹",
      contractor_business_number: "616-00-00001", contractor_representative: "김대표", contractor_phone: "064-700-1000",
      contractor_email: "service@example.com", contractor_manager: "이현장", contractor_manager_phone: "010-1111-2222",
      contract_date: "2026-01-05", start_date: "2026-01-10", end_date: "2026-12-31", actual_start_date: "2026-01-10",
      contract_amount: 120000000, vat_amount: 12000000, total_amount: 132000000, paid_amount: 52800000, remaining_amount: 79200000,
      progress_pct: 65, progress_note: "월간 정기점검 수행 중", status: "in_progress", bid_contract_id: "bid-1", budget_item_id: "budget-1",
      parking_lots: { id: "lot-1", code: "JJP-001", name: "동문공설", lot_type: "offstreet" },
      supervisor: { name: "운영팀 주무관" }, inspector: { name: "검수 담당자" }, sub_supervisor: { name: "시설팀 주무관" },
    },
    {
      id: "project-2", project_number: "SVC-2026-002", title: "주차빌딩 안전진단 용역", lot_id: "lot-2",
      service_type: "consulting", scope_of_work: "건축물 및 소방설비 정밀안전진단", contractor_name: "제주안전기술원",
      contractor_manager: "박현장", contractor_manager_phone: "010-3333-4444", contract_date: "2026-02-01",
      start_date: "2026-02-10", end_date: "2026-07-31", actual_start_date: "2026-02-10", actual_end_date: "2026-07-30",
      contract_amount: 50000000, vat_amount: 5000000, total_amount: 55000000, paid_amount: 55000000, remaining_amount: 0,
      progress_pct: 100, status: "warranty", warranty_start: "2026-08-01", warranty_end: "2027-07-31",
      warranty_bond_company: "제주보증", warranty_bond_number: "WB-2026-01", warranty_bond_amount: 2750000,
      parking_lots: { id: "lot-2", code: "JJP-002", name: "칠성골", lot_type: "multilevel" },
    },
  ],
  milestones: [
    { id: "milestone-1", project_id: "project-1", milestone_number: 1, milestone_type: "kickoff", title: "착수보고", target_date: "2026-01-10", actual_date: "2026-01-10", delay_days: 0, weight_pct: 10, deliverables_count: 1, deliverables_submitted: 1, payment_amount: 13200000, payment_requested: true, status: "completed" },
    { id: "milestone-2", project_id: "project-1", milestone_number: 2, milestone_type: "progress", title: "상반기 기성", target_date: "2026-08-10", delay_days: 8, weight_pct: 40, deliverables_count: 1, deliverables_submitted: 0, payment_amount: 39600000, payment_requested: false, status: "delayed" },
    { id: "milestone-3", project_id: "project-2", milestone_number: 3, milestone_type: "final", title: "최종보고", target_date: "2026-07-25", actual_date: "2026-07-25", delay_days: 0, weight_pct: 100, deliverables_count: 1, deliverables_submitted: 1, payment_amount: 55000000, payment_requested: true, status: "completed" },
  ],
  inspections: [
    { id: "inspection-1", project_id: "project-1", inspection_number: "SINSP-2026-001", inspection_type: "progress", inspection_date: "2026-08-12", title: "상반기 기성검수", target_amount: 39600000, approved_amount: 38600000, deduction_amount: 1000000, result: "conditional", pass_items: 8, fail_items: 2, deficiency_note: "장애복구 기록 보완", correction_deadline: "2026-08-20", correction_verified: false, status: "correction_required", inspector_name: "검수 담당자", photos: ["photo-1"] },
    { id: "inspection-2", project_id: "project-2", inspection_number: "SINSP-2026-002", inspection_type: "final", inspection_date: "2026-07-28", title: "준공검수", target_amount: 55000000, approved_amount: 55000000, deduction_amount: 0, result: "pass", pass_items: 10, fail_items: 0, correction_verified: true, status: "approved" },
  ],
  payments: [
    { id: "payment-1", project_id: "project-1", payment_number: "SPAY-2026-001", payment_type: "progress", title: "상반기 기성금", request_date: "2026-08-15", due_date: "2026-08-25", gross_amount: 39600000, advance_deduction: 0, other_deduction: 1000000, net_amount: 38600000, paid_amount: null, status: "reviewing", budget_execution_id: "budget-exec-1" },
    { id: "payment-2", project_id: "project-2", payment_number: "SPAY-2026-002", payment_type: "final", title: "준공금", request_date: "2026-07-28", due_date: "2026-08-05", paid_date: "2026-08-04", gross_amount: 55000000, net_amount: 55000000, paid_amount: 55000000, status: "paid", receipt_number: "RCPT-2026-002" },
  ],
  deliverables: [
    { id: "deliverable-1", project_id: "project-1", deliverable_number: "DEL-2026-001", deliverable_type: "report", title: "착수보고서", format_required: "HWPX+PDF", required_copies: 3, submitted_at: "2026-01-10", status: "accepted", review_score: 90, revision_count: 0 },
    { id: "deliverable-2", project_id: "project-1", deliverable_number: "DEL-2026-002", deliverable_type: "report", title: "상반기 실적보고서", format_required: "HWPX+PDF", required_copies: 3, submitted_at: "2026-08-12", status: "revision_required", review_note: "장애복구 증빙 보완", revision_count: 1, revision_deadline: "2026-08-20" },
    { id: "deliverable-3", project_id: "project-2", deliverable_number: "DEL-2026-003", deliverable_type: "report", title: "최종 안전진단보고서", format_required: "HWPX+PDF", required_copies: 5, submitted_at: "2026-07-25", status: "final", review_score: 95, revision_count: 0 },
  ],
  issues: [
    { id: "issue-1", project_id: "project-1", issue_number: "ISS-2026-001", issue_type: "defect", severity: "critical", title: "출차 차단기 반복 장애", description: "동문공설 출차 차단기 장애 반복", impact_amount: 3000000, impact_days: 3, reported_at: "2026-08-16", requires_approval: true, status: "in_progress" },
    { id: "issue-2", project_id: "project-2", issue_number: "ISS-2026-002", issue_type: "quality", severity: "medium", title: "보고서 도면 보완", description: "도면 표기 보완", impact_amount: 0, impact_days: 0, reported_at: "2026-07-20", resolved_at: "2026-07-24", status: "resolved" },
  ],
  documentNumbers: {
    "SERVICE:project-1": ["제주시청-차량관리과운영팀-2026-0101"],
    "SERVICE:project-2": ["제주시청-차량관리과운영팀-2026-0102"],
    "SERVICE_MILESTONE:milestone-1": ["제주시청-차량관리과운영팀-2026-0110"],
    "SERVICE_INSPECTION:inspection-1": ["제주시청-차량관리과운영팀-2026-0201"],
    "SERVICE_PAYMENT:payment-1": ["제주시청-차량관리과운영팀-2026-0301"],
    "SERVICE_DELIVERABLE:deliverable-2": ["제주시청-차량관리과운영팀-2026-0401"],
    "SERVICE_ISSUE:issue-1": ["제주시청-차량관리과운영팀-2026-0501"],
  },
};
