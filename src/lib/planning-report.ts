import { PRIMARY_DEPARTMENT } from "@/config/organization";
import { supabase } from "@/integrations/supabase/client";
import type {
  OperationsReportModel,
  OperationsReportOrientation,
  OperationsReportTable,
} from "@/lib/operations-report";
import {
  ACQUISITION_LABELS,
  CONSTRUCTION_STATUS_LABELS,
  DOC_TYPE_LABELS,
  OWNERSHIP_LABELS,
  PERMIT_STATUS_LABELS,
  PHASE_LABELS,
  PROJECT_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  SITE_STATUS_LABELS,
  getPermitTypeLabel,
  normalizeSiteScore,
} from "@/types/planning";

export type PlanningReportSectionId =
  | "overview"
  | "candidates"
  | "feasibility"
  | "acquisition"
  | "property"
  | "procedures"
  | "projects"
  | "budget"
  | "progress"
  | "risks"
  | "documents";

export type PlanningReportSort =
  | "attention"
  | "date_desc"
  | "candidate"
  | "score_desc"
  | "budget_desc"
  | "progress_desc"
  | "deadline_asc"
  | "lot_type";

export type PlanningReportOrientation = OperationsReportOrientation;

export interface PlanningReportField {
  key: string;
  label: string;
  protected?: boolean;
  value: (row: any, dataset: PlanningReportDataset) => unknown;
}

export interface PlanningReportSection {
  id: PlanningReportSectionId;
  label: string;
  description: string;
  fields: PlanningReportField[];
  defaultFields: string[];
}

export interface PlanningReportOptions {
  periodStart: string;
  periodEnd: string;
  selectedSections: PlanningReportSectionId[];
  selectedFields: Partial<Record<PlanningReportSectionId, string[]>>;
  lotTypes: string[];
  sort: PlanningReportSort;
  orientation: PlanningReportOrientation;
  includeArchived: boolean;
  includeCompleted: boolean;
}

export interface PlanningEvidenceSource {
  expected: number;
  loaded: number;
  complete: boolean;
}

export interface PlanningReportEvidenceMetadata {
  collectedAt: string;
  queryLimit: number;
  truncationPolicy: "fail";
  sources: Record<string, PlanningEvidenceSource>;
}

export interface PlanningReportDataset {
  sites: any[];
  projects: any[];
  permits: any[];
  designDocuments: any[];
  procedures: any[];
  completionChecks: any[];
  budgetItems: any[];
  documentNumbers: Record<string, string[]>;
  evidenceMetadata?: PlanningReportEvidenceMetadata;
}

export interface PlanningReportSummary extends Record<string, number> {
  sites: number;
  selectedSites: number;
  acquisitionSites: number;
  expectedSpaces: number;
  averageScore: number;
  estimatedLandCost: number;
  estimatedConstructionCost: number;
  projects: number;
  activeProjects: number;
  completedProjects: number;
  totalBudget: number;
  spent: number;
  remaining: number;
  budgetExecutionRate: number;
  procedures: number;
  propertyProcedures: number;
  completedProcedures: number;
  overdueProcedures: number;
  permits: number;
  approvedPermits: number;
  pendingPermits: number;
  currentDocuments: number;
  approvedDocuments: number;
  completionChecks: number;
  completedChecks: number;
  riskCount: number;
  highRisks: number;
  linkedDocuments: number;
  missingDocuments: number;
}

export interface PlanningReportModel {
  period: { start: string; end: string };
  lotTypeLabels: string[];
  summary: PlanningReportSummary;
  sourceCounts: Record<string, number>;
  evidenceMetadata: PlanningReportEvidenceMetadata;
  tables: OperationsReportTable[];
  selectedFieldCount: number;
  protectedFieldCount: number;
  riskNarrative: string;
}

const QUERY_LIMIT = 5000;
const ID_CHUNK_SIZE = 200;
const DOCUMENT_MODULE = "PLANNING";

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

const PROCEDURE_STATUS_LABELS: Record<string, string> = {
  registered: "계획수립",
  assigned: "사전검토",
  in_progress: "절차이행",
  review: "준공검토",
  completed: "완료",
  cancelled: "취소",
};

export const PLANNING_REPORT_LOT_TYPE_OPTIONS = [
  { value: "offstreet", label: "노외주차장" },
  { value: "building", label: "주차빌딩" },
  { value: "onstreet", label: "노상주차장" },
];

const relation = (row: any, key: string) => (Array.isArray(row?.[key]) ? row[key][0] : row?.[key]);
const number = (value: unknown) => Number(value || 0);
const text = (value: unknown) => (value === null || value === undefined || value === "" ? "-" : String(value));
const dateOnly = (value: unknown) => (value ? String(value).split("T")[0] : "-");
const won = (value: unknown) => `${number(value).toLocaleString("ko-KR")}원`;
const percent = (value: unknown) => `${number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
const yesNo = (value: unknown) => (value ? "예" : "아니오");
const unique = <T>(values: T[]) => Array.from(new Set(values));
const isArchived = (row: any) => Boolean(row?.archived_at);
const documentKey = (id: string) => `${DOCUMENT_MODULE}:${id}`;
const payload = (row: any) => row?.payload && typeof row.payload === "object" ? row.payload : {};
const projectSite = (project: any, dataset: PlanningReportDataset) =>
  relation(project, "site") || relation(project, "site_candidates") || dataset.sites.find((site) => site.id === project.site_id);
const projectOf = (row: any, dataset: PlanningReportDataset) =>
  relation(row, "construction_projects") || dataset.projects.find((project) => project.id === (row.project_id || row.source_record_id));
const siteOf = (row: any, dataset: PlanningReportDataset) => {
  if (row.site_number) return row;
  const project = projectOf(row, dataset) || row;
  return projectSite(project, dataset);
};
const lotType = (row: any, dataset: PlanningReportDataset) =>
  row.lot_type_snapshot || row.planned_lot_type || siteOf(row, dataset)?.planned_lot_type || relation(row, "parking_lot")?.lot_type || "";
const projectNumber = (row: any, dataset: PlanningReportDataset) =>
  row.project_number || projectOf(row, dataset)?.project_number || "-";
const projectName = (row: any, dataset: PlanningReportDataset) =>
  row.project_name || projectOf(row, dataset)?.project_name || "-";
const budgetItem = (project: any, dataset: PlanningReportDataset) =>
  relation(project, "budget_items") || dataset.budgetItems.find((item) => item.id === project.budget_item_id);

function linkedDocumentList(dataset: PlanningReportDataset, row: any) {
  return unique([
    row?.official_document_number,
    row?.document_number,
    ...(dataset.documentNumbers[documentKey(row?.id)] || []),
  ].filter(Boolean).map(String)).join(", ") || "-";
}

function siteScore(site: any) {
  return normalizeSiteScore(site?.total_score);
}

function siteReadiness(site: any) {
  const checks = [
    Boolean(site?.address_road || site?.address_jibun),
    Boolean(site?.area_sqm),
    Boolean(site?.ownership),
    Boolean(site?.estimated_spaces),
    Boolean(site?.total_score),
    Boolean(site?.estimated_construction_cost),
    Boolean(site?.bc_ratio),
    Boolean(site?.evaluation_date),
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

const field = (
  key: string,
  label: string,
  value: PlanningReportField["value"],
  protectedField = false,
): PlanningReportField => ({ key, label, value, protected: protectedField });

export const PLANNING_REPORT_SECTIONS: PlanningReportSection[] = [
  { id: "overview", label: "신설기획 종합현황", description: "후보지·사전절차·사업·예산·공정·위험 핵심지표", fields: [], defaultFields: [] },
  {
    id: "candidates", label: "후보지 현황", description: "후보지 위치·계획형태·규모·평가·선정 결과",
    fields: [
      field("site_number", "후보지번호", (row) => row.site_number),
      field("name", "후보지명", (row) => row.name),
      field("address", "소재지", (row) => row.address_road || row.address_jibun),
      field("administrative_dong", "행정동", (row) => row.administrative_dong),
      field("lot_type", "계획 주차장형태", (row, dataset) => LOT_TYPE_LABELS[lotType(row, dataset)] || lotType(row, dataset)),
      field("area_sqm", "부지면적", (row) => `${number(row.area_sqm).toLocaleString("ko-KR")}㎡`),
      field("estimated_spaces", "계획 주차면", (row) => `${number(row.estimated_spaces).toLocaleString("ko-KR")}면`),
      field("estimated_floors", "계획 층수", (row) => `${number(row.estimated_floors || 1)}층`),
      field("score", "종합점수", (row) => `${siteScore(row).toFixed(1)}점`),
      field("ranking", "우선순위", (row) => row.ranking ? `${row.ranking}위` : "-"),
      field("readiness", "추진준비도", (row) => `${siteReadiness(row)}%`),
      field("status", "선정상태", (row) => SITE_STATUS_LABELS[row.status] || row.status),
      field("decision", "결정일·사유", (row) => [dateOnly(row.decision_date), row.decision_note].filter((value) => value && value !== "-").join(" · ")),
      field("document_numbers", "공식 문서번호", (row, dataset) => linkedDocumentList(dataset, row)),
    ],
    defaultFields: ["site_number", "name", "address", "lot_type", "area_sqm", "estimated_spaces", "score", "ranking", "readiness", "status", "decision", "document_numbers"],
  },
  {
    id: "feasibility", label: "타당성 검토", description: "입지·수요·경제성·법적 제약과 사업성 지표",
    fields: [
      field("site_number", "후보지번호", (row) => row.site_number),
      field("name", "후보지명", (row) => row.name),
      field("location_score", "입지", (row) => `${number(row.location_score).toFixed(1)}점`),
      field("accessibility_score", "접근성", (row) => `${number(row.accessibility_score).toFixed(1)}점`),
      field("demand_score", "수요", (row) => `${number(row.demand_score).toFixed(1)}점`),
      field("feasibility_score", "경제성", (row) => `${number(row.feasibility_score).toFixed(1)}점`),
      field("legal_score", "법규", (row) => `${number(row.legal_score).toFixed(1)}점`),
      field("total_score", "종합점수", (row) => `${siteScore(row).toFixed(1)}점`),
      field("bc_ratio", "B/C", (row) => row.bc_ratio == null ? "-" : number(row.bc_ratio).toFixed(2)),
      field("npv", "NPV", (row) => won(row.npv)),
      field("irr", "IRR", (row) => percent(row.irr)),
      field("payback_years", "투자회수", (row) => row.payback_years == null ? "-" : `${number(row.payback_years).toFixed(1)}년`),
      field("annual_finance", "연간 수입·비용", (row) => `${won(row.estimated_annual_revenue)} · ${won(row.estimated_annual_expense)}`),
      field("legal_restrictions", "법적 제한", (row) => row.legal_restrictions),
      field("statutory_reviews", "법정 검토", (row) => [row.environmental_review && "환경", row.traffic_impact_review && "교통", row.cultural_heritage_review && "문화재"].filter(Boolean).join("·") || "해당 없음"),
      field("evaluation", "평가일·담당", (row) => [dateOnly(row.evaluation_date), row.evaluator_name].filter((value) => value && value !== "-").join(" · ")),
    ],
    defaultFields: ["site_number", "name", "location_score", "accessibility_score", "demand_score", "feasibility_score", "legal_score", "total_score", "bc_ratio", "payback_years", "annual_finance", "legal_restrictions", "statutory_reviews", "evaluation"],
  },
  {
    id: "acquisition", label: "부지매입·취득", description: "소유권·취득방식·추정 토지비·협의 및 결정 근거",
    fields: [
      field("site_number", "후보지번호", (row) => row.site_number),
      field("name", "후보지명", (row) => row.name),
      field("ownership", "소유구분", (row) => OWNERSHIP_LABELS[row.ownership] || row.ownership),
      field("owner_name", "소유자", (row) => row.owner_name, true),
      field("acquisition_method", "취득방식", (row) => ACQUISITION_LABELS[row.acquisition_method] || row.acquisition_method),
      field("land_category", "지목", (row) => row.land_category),
      field("area_sqm", "대상면적", (row) => `${number(row.area_sqm).toLocaleString("ko-KR")}㎡`),
      field("estimated_land_cost", "추정 토지비", (row) => won(row.estimated_land_cost)),
      field("decision_date", "결정일", (row) => dateOnly(row.decision_date)),
      field("decision_note", "협의·결정내용", (row) => row.decision_note),
      field("document_numbers", "공식 문서번호", (row, dataset) => linkedDocumentList(dataset, row)),
    ],
    defaultFields: ["site_number", "name", "ownership", "owner_name", "acquisition_method", "land_category", "area_sqm", "estimated_land_cost", "decision_date", "decision_note", "document_numbers"],
  },
  {
    id: "property", label: "공유재산 절차", description: "공유재산 심의·관리계획·취득 처분 관련 진행 근거",
    fields: [
      field("project_number", "사업번호", (row, dataset) => projectNumber(row, dataset)),
      field("site", "대상부지", (row, dataset) => siteOf(row, dataset)?.name),
      field("ownership", "소유구분", (row, dataset) => OWNERSHIP_LABELS[siteOf(row, dataset)?.ownership] || siteOf(row, dataset)?.ownership),
      field("procedure_gate", "공유재산 절차", (row) => payload(row).procedureGate),
      field("consultation", "협의부서·기관", (row) => payload(row).consultation),
      field("owner", "담당자", (row) => row.owner_name),
      field("due_date", "처리기한", (row) => dateOnly(row.due_date)),
      field("status", "진행상태", (row) => PROCEDURE_STATUS_LABELS[row.status] || row.status),
      field("next_action", "다음 조치", (row) => payload(row).nextGate),
      field("completion_evidence", "완료 근거", (row) => payload(row).completionEvidence),
      field("document_numbers", "공식 문서번호", (row, dataset) => linkedDocumentList(dataset, row)),
    ],
    defaultFields: ["project_number", "site", "ownership", "procedure_gate", "consultation", "owner", "due_date", "status", "next_action", "completion_evidence", "document_numbers"],
  },
  {
    id: "procedures", label: "사전절차·인허가", description: "타당성·투자심사·도시계획·인허가 절차와 조건",
    fields: [
      field("source_type", "절차구분", (row) => row.__source_type),
      field("project_number", "사업번호", (row, dataset) => projectNumber(row, dataset)),
      field("procedure", "절차명", (row) => row.__source_type === "행정절차" ? payload(row).procedureGate : getPermitTypeLabel(row.permit_type)),
      field("authority", "소관기관·부서", (row) => row.__source_type === "행정절차" ? payload(row).consultation : [row.authority, row.authority_department].filter(Boolean).join(" · ")),
      field("application_date", "신청·착수일", (row) => dateOnly(row.application_date || row.created_at)),
      field("due_date", "목표·처리기한", (row) => dateOnly(row.target_approval_date || row.due_date)),
      field("approval_date", "승인·완료일", (row) => dateOnly(row.actual_approval_date || row.completed_at)),
      field("permit_number", "허가·업무번호", (row) => row.permit_number || row.record_number),
      field("status", "진행상태", (row) => row.__source_type === "행정절차" ? PROCEDURE_STATUS_LABELS[row.status] || row.status : PERMIT_STATUS_LABELS[row.status] || row.status),
      field("conditions", "조건·보완사항", (row) => row.conditions || row.rejection_reason || payload(row).nextGate),
      field("fee", "수수료", (row) => row.__source_type === "인허가" ? `${won(row.fee_amount)} · ${row.fee_paid ? "납부" : "미납"}` : "-"),
      field("document_numbers", "공식 문서번호", (row, dataset) => linkedDocumentList(dataset, row)),
    ],
    defaultFields: ["source_type", "project_number", "procedure", "authority", "application_date", "due_date", "approval_date", "permit_number", "status", "conditions", "fee", "document_numbers"],
  },
  {
    id: "projects", label: "사업계획", description: "사업 유형·단계·사업비·기간·연계 원장",
    fields: [
      field("project_number", "사업번호", (row) => row.project_number),
      field("project_name", "사업명", (row) => row.project_name),
      field("site", "후보지", (row, dataset) => siteOf(row, dataset)?.name),
      field("lot_type", "주차장형태", (row, dataset) => LOT_TYPE_LABELS[lotType(row, dataset)] || lotType(row, dataset)),
      field("project_type", "사업유형", (row) => PROJECT_TYPE_LABELS[row.project_type] || row.project_type),
      field("description", "사업내용", (row) => row.description),
      field("phase", "현재단계", (row) => PHASE_LABELS[row.phase] || row.phase),
      field("planning_period", "기획기간", (row) => `${dateOnly(row.planning_start)} ~ ${dateOnly(row.planning_end)}`),
      field("target_completion", "준공목표", (row) => dateOnly(row.target_completion)),
      field("estimated_spaces", "계획면수", (row, dataset) => `${number(siteOf(row, dataset)?.estimated_spaces).toLocaleString("ko-KR")}면`),
      field("source_links", "예산·입찰·용역 연계", (row) => [row.budget_item_id && "예산", row.bid_contract_id && "계약", row.service_project_id && "용역"].filter(Boolean).join("·") || "미연계"),
      field("status", "사업상태", (row) => CONSTRUCTION_STATUS_LABELS[row.status] || row.status),
      field("document_numbers", "공식 문서번호", (row, dataset) => linkedDocumentList(dataset, row)),
    ],
    defaultFields: ["project_number", "project_name", "site", "lot_type", "project_type", "description", "phase", "planning_period", "target_completion", "estimated_spaces", "source_links", "status", "document_numbers"],
  },
  {
    id: "budget", label: "예산·사업비", description: "총사업비·세부비용·집행·잔액·승인 예산 연계",
    fields: [
      field("project_number", "사업번호", (row) => row.project_number),
      field("project_name", "사업명", (row) => row.project_name),
      field("budget_item", "승인 예산항목", (row, dataset) => {
        const item = budgetItem(row, dataset);
        return item ? `${item.item_code || "-"} ${item.item_name || ""}`.trim() : "미연계";
      }),
      field("fiscal_year", "회계연도", (row, dataset) => budgetItem(row, dataset)?.fiscal_year),
      field("total_budget", "총사업비", (row) => won(row.total_budget)),
      field("design_cost", "설계비", (row) => won(row.design_cost)),
      field("construction_cost", "공사비", (row) => won(row.construction_cost)),
      field("supervision_cost", "감리비", (row) => won(row.supervision_cost)),
      field("other_cost", "기타비", (row) => won(row.other_cost)),
      field("spent", "집행액", (row) => won(row.spent)),
      field("remaining", "잔액", (row) => won(row.remaining ?? number(row.total_budget) - number(row.spent))),
      field("execution_rate", "집행률", (row) => percent(row.budget_execution_rate ?? (number(row.total_budget) ? number(row.spent) / number(row.total_budget) * 100 : 0))),
      field("budget_status", "예산상태", (row, dataset) => budgetItem(row, dataset)?.plan_status || budgetItem(row, dataset)?.status),
      field("document_numbers", "공식 문서번호", (row, dataset) => linkedDocumentList(dataset, row)),
    ],
    defaultFields: ["project_number", "project_name", "budget_item", "fiscal_year", "total_budget", "design_cost", "construction_cost", "supervision_cost", "other_cost", "spent", "remaining", "execution_rate", "budget_status", "document_numbers"],
  },
  {
    id: "progress", label: "공정·단계게이트", description: "진척·지연·인허가·승인도면·준공 체크 이행",
    fields: [
      field("project_number", "사업번호", (row) => row.project_number),
      field("project_name", "사업명", (row) => row.project_name),
      field("phase", "현재단계", (row) => PHASE_LABELS[row.phase] || row.phase),
      field("progress_pct", "진척률", (row) => percent(row.progress_pct)),
      field("progress_detail", "진척내용", (row) => typeof row.progress_detail === "object" ? JSON.stringify(row.progress_detail) : row.progress_detail),
      field("schedule", "공사기간", (row) => `${dateOnly(row.construction_start)} ~ ${dateOnly(row.construction_end || row.target_completion)}`),
      field("delay", "지연", (row) => number(row.delay_days) ? `${number(row.delay_days)}일 · ${text(row.delay_reason)}` : "없음"),
      field("permits", "인허가", (row, dataset) => {
        const permits = dataset.permits.filter((item) => item.project_id === row.id && !isArchived(item));
        const approved = permits.filter((item) => ["approved", "conditional_approved"].includes(item.status)).length;
        return `${approved}/${permits.length}건 승인`;
      }),
      field("documents", "승인 도면", (row, dataset) => {
        const docs = dataset.designDocuments.filter((item) => item.project_id === row.id && item.is_current && !isArchived(item));
        return `${docs.filter((item) => ["approved", "final"].includes(item.review_status)).length}/${docs.length}건`;
      }),
      field("completion", "준공 체크", (row, dataset) => {
        const checks = dataset.completionChecks.filter((item) => item.project_id === row.id);
        return `${checks.filter((item) => item.is_completed).length}/${checks.length}건`;
      }),
      field("next_action", "다음 조치", (row, dataset) => nextProjectAction(row, dataset)),
      field("status", "사업상태", (row) => CONSTRUCTION_STATUS_LABELS[row.status] || row.status),
    ],
    defaultFields: ["project_number", "project_name", "phase", "progress_pct", "progress_detail", "schedule", "delay", "permits", "documents", "completion", "next_action", "status"],
  },
  {
    id: "risks", label: "위험·보완사항", description: "경제성·취득·법정절차·예산·공정·문서 누락 위험",
    fields: [
      field("risk_level", "위험도", (row) => row.risk_level),
      field("source_type", "업무구분", (row) => row.source_type),
      field("reference", "대상번호", (row) => row.reference),
      field("title", "대상명", (row) => row.title),
      field("finding", "확인사항", (row) => row.finding),
      field("impact_amount", "영향금액", (row) => row.impact_amount == null ? "-" : won(row.impact_amount)),
      field("deadline", "조치기한", (row) => dateOnly(row.deadline)),
      field("next_action", "필요조치", (row) => row.next_action),
      field("status", "처리상태", (row) => row.status),
      field("document_numbers", "공식 문서번호", (row) => row.document_numbers),
    ],
    defaultFields: ["risk_level", "source_type", "reference", "title", "finding", "impact_amount", "deadline", "next_action", "status", "document_numbers"],
  },
  {
    id: "documents", label: "공식 문서번호", description: "후보지·사업·절차·인허가·설계도서별 문서 근거",
    fields: [
      field("source_type", "업무구분", (row) => row.source_type),
      field("project_number", "사업번호", (row) => row.project_number),
      field("record_number", "업무번호", (row) => row.record_number),
      field("title", "문서대상", (row) => row.title),
      field("document_number", "공식 문서번호", (row) => row.document_number),
      field("record_status", "업무상태", (row) => row.record_status),
      field("record_date", "기준일", (row) => row.record_date),
    ],
    defaultFields: ["source_type", "project_number", "record_number", "title", "document_number", "record_status", "record_date"],
  },
];

export const PLANNING_REPORT_PRESETS = {
  summary: { label: "간부 요약", sections: ["overview", "candidates", "feasibility", "projects", "risks"] as PlanningReportSectionId[] },
  standard: { label: "실무 종합", sections: PLANNING_REPORT_SECTIONS.map((section) => section.id) },
  audit: { label: "감사 대응", sections: ["overview", "candidates", "feasibility", "acquisition", "property", "procedures", "projects", "budget", "progress", "risks", "documents"] as PlanningReportSectionId[] },
};

export function defaultPlanningReportFields(): Partial<Record<PlanningReportSectionId, string[]>> {
  return Object.fromEntries(PLANNING_REPORT_SECTIONS.map((section) => [section.id, [...section.defaultFields]]));
}

export function parsePlanningReportOptions(parameters: Record<string, string>): PlanningReportOptions {
  const knownSections = new Set(PLANNING_REPORT_SECTIONS.map((section) => section.id));
  const selectedSections = (parameters.planning_sections || PLANNING_REPORT_PRESETS.summary.sections.join(","))
    .split(",")
    .filter((id): id is PlanningReportSectionId => knownSections.has(id as PlanningReportSectionId));
  let selectedFields = defaultPlanningReportFields();
  try {
    const parsed = JSON.parse(parameters.planning_fields || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) selectedFields = { ...selectedFields, ...parsed };
  } catch {
    selectedFields = defaultPlanningReportFields();
  }
  const knownSorts: PlanningReportSort[] = ["attention", "date_desc", "candidate", "score_desc", "budget_desc", "progress_desc", "deadline_asc", "lot_type"];
  return {
    periodStart: parameters.period_start,
    periodEnd: parameters.period_end || parameters.period_start,
    selectedSections: selectedSections.length ? selectedSections : ["overview"],
    selectedFields,
    lotTypes: (parameters.planning_lot_types || "offstreet,building,onstreet").split(",").filter(Boolean),
    sort: knownSorts.includes(parameters.planning_sort as PlanningReportSort) ? parameters.planning_sort as PlanningReportSort : "attention",
    orientation: parameters.planning_orientation === "landscape" ? "landscape" : "portrait",
    includeArchived: parameters.planning_include_archived === "true",
    includeCompleted: parameters.planning_include_completed !== "false",
  };
}

export function assertPlanningReportTableComplete(label: string, expected: number, loaded: number, limit = QUERY_LIMIT) {
  if (expected > limit || expected !== loaded) {
    throw new Error(`${label} 자료 ${expected}건 중 ${loaded}건만 조회되어 테이블 절단을 방지하기 위해 보고서 생성을 중단했습니다.`);
  }
}

export function assertCompletePlanningResult(
  label: string,
  result: { data?: unknown[] | null; error?: { message: string } | null; count?: number | null },
  limit = QUERY_LIMIT,
) {
  if (result.error) throw new Error(`${label} 자료 조회에 실패했습니다: ${result.error.message}`);
  const rows = result.data || [];
  const expected = typeof result.count === "number" ? result.count : rows.length;
  assertPlanningReportTableComplete(label, expected, rows.length, limit);
  return { rows, evidence: { expected, loaded: rows.length, complete: true } as PlanningEvidenceSource };
}

async function checkedQuery(label: string, promise: PromiseLike<any>, limit = QUERY_LIMIT) {
  return assertCompletePlanningResult(label, await promise, limit);
}

function chunks<T>(values: T[], size = ID_CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function collectByProject(table: string, label: string, projectIds: string[]) {
  if (!projectIds.length) return { rows: [] as any[], evidence: { expected: 0, loaded: 0, complete: true } as PlanningEvidenceSource };
  const rows: any[] = [];
  let expected = 0;
  for (const idChunk of chunks(projectIds)) {
    const result = await checkedQuery(label, (supabase as any).from(table).select("*", { count: "exact" }).in("project_id", idChunk).limit(QUERY_LIMIT));
    rows.push(...result.rows);
    expected += result.evidence.expected;
  }
  assertPlanningReportTableComplete(label, expected, rows.length);
  return { rows, evidence: { expected, loaded: rows.length, complete: true } as PlanningEvidenceSource };
}

async function collectProcedures(projectIds: string[]) {
  if (!projectIds.length) return { rows: [] as any[], evidence: { expected: 0, loaded: 0, complete: true } as PlanningEvidenceSource };
  const rows: any[] = [];
  let expected = 0;
  for (const idChunk of chunks(projectIds)) {
    const result = await checkedQuery(
      "신설사업 행정절차",
      (supabase as any).from("team_work_records").select("*", { count: "exact" })
        .eq("record_type", "capital_project").eq("payload->>workflow_key", "capital_procedure")
        .in("source_record_id", idChunk).limit(QUERY_LIMIT),
    );
    rows.push(...result.rows);
    expected += result.evidence.expected;
  }
  assertPlanningReportTableComplete("신설사업 행정절차", expected, rows.length);
  return { rows, evidence: { expected, loaded: rows.length, complete: true } as PlanningEvidenceSource };
}

async function collectBudgetItems(ids: string[]) {
  const rows: any[] = [];
  let expected = 0;
  for (const idChunk of chunks(unique(ids.filter(Boolean)))) {
    const result = await checkedQuery(
      "신설사업 승인 예산",
      (supabase as any).from("budget_items").select("*, budget_plans(fiscal_year,status)", { count: "exact" }).in("id", idChunk).limit(QUERY_LIMIT),
    );
    rows.push(...result.rows.map((row: any) => ({
      ...row,
      fiscal_year: relation(row, "budget_plans")?.fiscal_year,
      plan_status: relation(row, "budget_plans")?.status,
    })));
    expected += result.evidence.expected;
  }
  assertPlanningReportTableComplete("신설사업 승인 예산", expected, rows.length);
  return { rows, evidence: { expected, loaded: rows.length, complete: true } as PlanningEvidenceSource };
}

async function collectOfficialDocumentNumbers(ids: string[]) {
  const links: any[] = [];
  let linkExpected = 0;
  for (const idChunk of chunks(unique(ids.filter(Boolean)))) {
    const result = await checkedQuery(
      "신설기획 공식문서 첨부",
      supabase.from("attachments").select("module, ref_id, file_path", { count: "exact" })
        .eq("module", DOCUMENT_MODULE).eq("ref_type", "official_document_link").in("ref_id", idChunk).limit(QUERY_LIMIT),
    );
    links.push(...result.rows);
    linkExpected += result.evidence.expected;
  }
  assertPlanningReportTableComplete("신설기획 공식문서 첨부", linkExpected, links.length);
  const documentIds = unique(links.map((link) => String(link.file_path || "").replace("parkmaster-document://", "")).filter(Boolean));
  const documents: any[] = [];
  let documentExpected = 0;
  for (const idChunk of chunks(documentIds)) {
    const result = await checkedQuery(
      "공식문서대장",
      supabase.from("official_documents").select("id, document_number", { count: "exact" }).in("id", idChunk).limit(QUERY_LIMIT),
    );
    documents.push(...result.rows);
    documentExpected += result.evidence.expected;
  }
  assertPlanningReportTableComplete("공식문서대장", documentExpected, documents.length);
  const numberById = new Map(documents.map((document) => [document.id, document.document_number]));
  const documentNumbers = links.reduce<Record<string, string[]>>((result, link) => {
    const documentId = String(link.file_path || "").replace("parkmaster-document://", "");
    const documentNumber = numberById.get(documentId);
    if (!documentNumber) return result;
    const key = documentKey(link.ref_id);
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

function projectInPeriod(row: any, options: PlanningReportOptions) {
  const start = row.planning_start || row.created_at || "0000-01-01";
  const end = row.actual_completion || row.construction_end || row.target_completion || row.planning_end || "9999-12-31";
  return dateOnly(start) <= options.periodEnd && dateOnly(end) >= options.periodStart;
}

function matchesLotType(row: any, dataset: PlanningReportDataset, selected: string[]) {
  const actual = lotType(row, dataset);
  if (!actual || !selected.length || selected.length === PLANNING_REPORT_LOT_TYPE_OPTIONS.length) return true;
  return selected.some((group) => (LOT_TYPE_ALIASES[group] || [group]).includes(actual));
}

export async function collectPlanningReportData(options: PlanningReportOptions): Promise<PlanningReportDataset> {
  const [siteResult, projectResult] = await Promise.all([
    checkedQuery("후보지", supabase.from("site_candidates").select("*", { count: "exact" }).limit(QUERY_LIMIT)),
    checkedQuery(
      "신설사업",
      (supabase as any).from("construction_projects")
        .select("*, site:site_candidates(*), parking_lot:parking_lots(id,code,name,lot_type)", { count: "exact" })
        .limit(QUERY_LIMIT),
    ),
  ]);
  const provisional: PlanningReportDataset = {
    sites: siteResult.rows as any[], projects: projectResult.rows as any[], permits: [], designDocuments: [], procedures: [],
    completionChecks: [], budgetItems: [], documentNumbers: {},
  };
  const projects = provisional.projects.filter((row) =>
    (options.includeArchived || !isArchived(row))
    && (options.includeCompleted || !["completed", "cancelled"].includes(row.status))
    && projectInPeriod(row, options)
    && matchesLotType(row, provisional, options.lotTypes));
  const projectIds = projects.map((row) => row.id).filter(Boolean);
  const linkedSiteIds = new Set(projects.map((row) => row.site_id).filter(Boolean));
  const sites = provisional.sites.filter((row) =>
    (options.includeArchived || !isArchived(row))
    && matchesLotType(row, provisional, options.lotTypes)
    && (linkedSiteIds.has(row.id) || dateOnly(row.created_at) <= options.periodEnd));
  const [permitResult, designResult, procedureResult, completionResult, budgetResult] = await Promise.all([
    collectByProject("permits", "신설사업 인허가", projectIds),
    collectByProject("design_documents", "신설사업 설계도서", projectIds),
    collectProcedures(projectIds),
    collectByProject("construction_completion_checks", "신설사업 준공체크", projectIds),
    collectBudgetItems(projects.map((row) => row.budget_item_id)),
  ]);
  const permits = permitResult.rows.filter((row) => options.includeArchived || !isArchived(row));
  const designDocuments = designResult.rows.filter((row) => options.includeArchived || !isArchived(row));
  const procedures = procedureResult.rows.filter((row) => options.includeArchived || !isArchived(row));
  const references = [
    ...sites,
    ...projects,
    ...permits,
    ...designDocuments,
    ...procedures,
  ].map((row) => row.id).filter(Boolean);
  const documentResult = await collectOfficialDocumentNumbers(references);
  return {
    sites,
    projects,
    permits,
    designDocuments,
    procedures,
    completionChecks: completionResult.rows,
    budgetItems: budgetResult.rows,
    documentNumbers: documentResult.documentNumbers,
    evidenceMetadata: {
      collectedAt: new Date().toISOString(),
      queryLimit: QUERY_LIMIT,
      truncationPolicy: "fail",
      sources: {
        sites: siteResult.evidence,
        projects: projectResult.evidence,
        permits: permitResult.evidence,
        designDocuments: designResult.evidence,
        procedures: procedureResult.evidence,
        completionChecks: completionResult.evidence,
        budgetItems: budgetResult.evidence,
        ...documentResult.evidence,
      },
    },
  };
}

function completeSampleEvidence(dataset: PlanningReportDataset): PlanningReportEvidenceMetadata {
  const counts: Record<string, number> = {
    sites: dataset.sites.length,
    projects: dataset.projects.length,
    permits: dataset.permits.length,
    designDocuments: dataset.designDocuments.length,
    procedures: dataset.procedures.length,
    completionChecks: dataset.completionChecks.length,
    budgetItems: dataset.budgetItems.length,
    documentLinks: Object.values(dataset.documentNumbers).flat().length,
    officialDocuments: unique(Object.values(dataset.documentNumbers).flat()).length,
  };
  return {
    collectedAt: "2026-08-31T23:59:59.000Z",
    queryLimit: QUERY_LIMIT,
    truncationPolicy: "fail",
    sources: Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { expected: count, loaded: count, complete: true }])),
  };
}

function assertEvidenceComplete(metadata: PlanningReportEvidenceMetadata) {
  for (const [source, evidence] of Object.entries(metadata.sources)) {
    assertPlanningReportTableComplete(source, evidence.expected, evidence.loaded, metadata.queryLimit);
    if (!evidence.complete) throw new Error(`${source} 원천자료 완전성 확인에 실패했습니다.`);
  }
}

function combinedProcedureRows(dataset: PlanningReportDataset, projects: any[]) {
  const ids = new Set(projects.map((project) => project.id));
  return [
    ...dataset.procedures.filter((row) => ids.has(row.source_record_id)).map((row) => ({ ...row, __source_type: "행정절차" })),
    ...dataset.permits.filter((row) => ids.has(row.project_id)).map((row) => ({ ...row, __source_type: "인허가" })),
  ];
}

function propertyRows(dataset: PlanningReportDataset, projects: any[]) {
  const ids = new Set(projects.map((project) => project.id));
  return dataset.procedures.filter((row) => {
    if (!ids.has(row.source_record_id)) return false;
    const values = [row.title, row.category, payload(row).procedureGate, payload(row).consultation].map((value) => String(value || ""));
    return values.some((value) => value.includes("공유재산"));
  });
}

function nextProjectAction(project: any, dataset: PlanningReportDataset) {
  if (!project.budget_item_id) return "승인 예산항목 연결";
  const permits = dataset.permits.filter((row) => row.project_id === project.id && !isArchived(row));
  if (permits.some((row) => !["approved", "conditional_approved"].includes(row.status))) return "미승인 인허가 보완";
  const documents = dataset.designDocuments.filter((row) => row.project_id === project.id && row.is_current && !isArchived(row));
  if (documents.some((row) => !["approved", "final"].includes(row.review_status))) return "설계도서 검토·승인";
  if (number(project.delay_days) > 0) return "지연사유 해소 및 일정 재수립";
  if (["inspection", "completion"].includes(project.phase)) {
    const checks = dataset.completionChecks.filter((row) => row.project_id === project.id && row.is_required);
    if (checks.some((row) => !row.is_completed)) return "필수 준공 체크 완료";
  }
  return "다음 단계 게이트 검토";
}

function buildDocumentRows(dataset: PlanningReportDataset, sites: any[], projects: any[], procedures: any[], permits: any[], designDocuments: any[]) {
  const rows: any[] = [];
  const add = (sourceType: string, row: any, projectNo: unknown, recordNo: unknown, title: unknown, status: unknown, recordDate: unknown) => {
    rows.push({
      source_type: sourceType,
      project_number: text(projectNo),
      record_number: text(recordNo),
      title: text(title),
      document_number: linkedDocumentList(dataset, row),
      record_status: text(status),
      record_date: dateOnly(recordDate),
    });
  };
  sites.forEach((row) => add("후보지", row, "-", row.site_number, row.name, SITE_STATUS_LABELS[row.status] || row.status, row.decision_date || row.evaluation_date || row.created_at));
  projects.forEach((row) => add("사업계획", row, row.project_number, row.project_number, row.project_name, CONSTRUCTION_STATUS_LABELS[row.status] || row.status, row.planning_start || row.created_at));
  procedures.forEach((row) => add("행정절차", row, projectNumber(row, dataset), row.record_number || row.id, row.title || payload(row).procedureGate, PROCEDURE_STATUS_LABELS[row.status] || row.status, row.completed_at || row.due_date || row.created_at));
  permits.forEach((row) => add("인허가", row, projectNumber(row, dataset), row.permit_number || row.id, getPermitTypeLabel(row.permit_type), PERMIT_STATUS_LABELS[row.status] || row.status, row.actual_approval_date || row.application_date || row.created_at));
  designDocuments.forEach((row) => add("설계도서", row, projectNumber(row, dataset), row.doc_number, row.title, REVIEW_STATUS_LABELS[row.review_status] || row.review_status, row.approved_at || row.reviewed_at || row.created_at));
  return rows.map((row) => ({ ...row, __missing_document: row.document_number === "-" }));
}

function buildRiskRows(dataset: PlanningReportDataset, sites: any[], projects: any[], procedureRows: any[], documents: any[], options: PlanningReportOptions) {
  const rows: any[] = [];
  const add = (riskLevel: string, sourceType: string, reference: unknown, title: unknown, finding: string, impactAmount: unknown, deadline: unknown, nextAction: string, status: string, documentNumbers: string) => rows.push({
    risk_level: riskLevel, source_type: sourceType, reference: text(reference), title: text(title), finding,
    impact_amount: impactAmount == null ? null : number(impactAmount), deadline, next_action: nextAction, status, document_numbers: documentNumbers,
  });
  sites.forEach((site) => {
    if (!site.total_score) add("높음", "후보지", site.site_number, site.name, "후보지 종합평가 미완료", null, null, "평가항목과 선정근거 확정", "확인 필요", linkedDocumentList(dataset, site));
    if (site.bc_ratio != null && number(site.bc_ratio) < 1) add("높음", "타당성", site.site_number, site.name, `B/C ${number(site.bc_ratio).toFixed(2)}로 경제성 기준 미달`, number(site.estimated_land_cost) + number(site.estimated_construction_cost), null, "대안 규모·수요·사업비 재검토", "보완 필요", linkedDocumentList(dataset, site));
    if (site.ownership === "private" && !site.acquisition_method) add("긴급", "부지매입", site.site_number, site.name, "사유지 취득방식 미정", site.estimated_land_cost, null, "매입·수용·임차 방식 및 협의계획 확정", "미정", linkedDocumentList(dataset, site));
    if (site.legal_restrictions) add("주의", "법정검토", site.site_number, site.name, String(site.legal_restrictions), null, null, "관계부서 법률·도시계획 검토", "검토 필요", linkedDocumentList(dataset, site));
  });
  projects.forEach((project) => {
    if (!project.budget_item_id) add("높음", "예산", project.project_number, project.project_name, "승인 예산항목 미연계", project.total_budget, project.target_completion, "승인 예산 원장 연결", "미연계", linkedDocumentList(dataset, project));
    if (number(project.delay_days) > 0) add("높음", "공정", project.project_number, project.project_name, `${number(project.delay_days)}일 지연 · ${text(project.delay_reason)}`, project.remaining, project.target_completion, "일정 재수립 및 지연조치 보고", "지연", linkedDocumentList(dataset, project));
    const permits = dataset.permits.filter((row) => row.project_id === project.id && !isArchived(row));
    const pending = permits.filter((row) => !["approved", "conditional_approved"].includes(row.status));
    if (pending.length) add("높음", "사전절차", project.project_number, project.project_name, `미승인 인허가 ${pending.length}건`, null, project.target_completion, "보완·승인 일정 확정", "진행 중", linkedDocumentList(dataset, project));
  });
  procedureRows.filter((row) => !["completed", "approved", "conditional_approved"].includes(row.status) && dateOnly(row.target_approval_date || row.due_date) !== "-" && dateOnly(row.target_approval_date || row.due_date) < options.periodEnd).forEach((row) => {
    add("높음", row.__source_type, row.permit_number || row.record_number || row.id, row.__source_type === "인허가" ? getPermitTypeLabel(row.permit_type) : payload(row).procedureGate, "처리기한 경과", row.fee_amount, row.target_approval_date || row.due_date, "담당자·소관기관 확인 후 처리계획 갱신", "기한초과", linkedDocumentList(dataset, row));
  });
  const missingByType = documents.filter((row) => row.__missing_document).reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.source_type]: (counts[row.source_type] || 0) + 1 }), {});
  Object.entries(missingByType).forEach(([sourceType, count]) => add("확인", "문서번호", sourceType, sourceType, `공식 문서번호 미등록 ${count}건`, null, null, "문서대장 연결", "등록 필요", "-"));
  return rows;
}

const TABLE_IDENTITY_FIELDS: Record<Exclude<PlanningReportSectionId, "overview">, string[]> = {
  candidates: ["site_number", "name"], feasibility: ["site_number", "name"], acquisition: ["site_number", "name"],
  property: ["project_number", "site"], procedures: ["source_type", "project_number"], projects: ["project_number", "project_name"],
  budget: ["project_number", "project_name"], progress: ["project_number", "project_name"], risks: ["risk_level", "source_type", "reference"],
  documents: ["source_type", "project_number", "record_number"],
};

function splitPlanningFields(id: Exclude<PlanningReportSectionId, "overview">, fields: PlanningReportField[], orientation: PlanningReportOrientation) {
  const maximumColumns = orientation === "portrait" ? 10 : 14;
  if (fields.length <= maximumColumns) return [fields];
  const identity = fields.filter((item) => TABLE_IDENTITY_FIELDS[id].includes(item.key));
  const details = fields.filter((item) => !TABLE_IDENTITY_FIELDS[id].includes(item.key));
  const detailLimit = Math.max(1, maximumColumns - identity.length);
  const groups: PlanningReportField[][] = [];
  for (let index = 0; index < details.length; index += detailLimit) groups.push([...identity, ...details.slice(index, index + detailLimit)]);
  return groups;
}

function sortRows(rows: any[], sort: PlanningReportSort, dataset: PlanningReportDataset) {
  const rowDate = (row: any) => row.target_approval_date || row.due_date || row.decision_date || row.evaluation_date || row.planning_start || row.created_at || "";
  const reference = (row: any) => text(row.site_number || row.project_number || row.reference || row.record_number || row.name || row.title);
  const attention: Record<string, number> = { 긴급: 0, 높음: 1, 기한초과: 2, 중단: 3, 반려: 4, "보완 필요": 5 };
  return [...rows].sort((a, b) => {
    if (sort === "date_desc") return String(rowDate(b)).localeCompare(String(rowDate(a)));
    if (sort === "candidate") return reference(a).localeCompare(reference(b), "ko", { numeric: true });
    if (sort === "score_desc") return siteScore(siteOf(b, dataset) || b) - siteScore(siteOf(a, dataset) || a);
    if (sort === "budget_desc") return number(b.total_budget ?? b.estimated_construction_cost ?? b.impact_amount) - number(a.total_budget ?? a.estimated_construction_cost ?? a.impact_amount);
    if (sort === "progress_desc") return number(b.progress_pct) - number(a.progress_pct);
    if (sort === "deadline_asc") return String(rowDate(a) || "9999-12-31").localeCompare(String(rowDate(b) || "9999-12-31"));
    if (sort === "lot_type") return text(LOT_TYPE_LABELS[lotType(a, dataset)] || lotType(a, dataset)).localeCompare(text(LOT_TYPE_LABELS[lotType(b, dataset)] || lotType(b, dataset)), "ko") || reference(a).localeCompare(reference(b), "ko", { numeric: true });
    return (attention[a.risk_level || a.status] ?? 20) - (attention[b.risk_level || b.status] ?? 20)
      || String(rowDate(b)).localeCompare(String(rowDate(a)));
  });
}

export function buildPlanningReportModel(dataset: PlanningReportDataset, options: PlanningReportOptions): PlanningReportModel {
  const evidenceMetadata = dataset.evidenceMetadata || completeSampleEvidence(dataset);
  assertEvidenceComplete(evidenceMetadata);
  const datasetWithEvidence = { ...dataset, evidenceMetadata };
  const projects = dataset.projects.filter((row) =>
    (options.includeArchived || !isArchived(row))
    && (options.includeCompleted || !["completed", "cancelled"].includes(row.status))
    && projectInPeriod(row, options)
    && matchesLotType(row, datasetWithEvidence, options.lotTypes));
  const projectIds = new Set(projects.map((row) => row.id));
  const linkedSiteIds = new Set(projects.map((row) => row.site_id).filter(Boolean));
  const sites = dataset.sites.filter((row) =>
    (options.includeArchived || !isArchived(row))
    && matchesLotType(row, datasetWithEvidence, options.lotTypes)
    && (linkedSiteIds.has(row.id) || dateOnly(row.created_at) <= options.periodEnd));
  const permits = dataset.permits.filter((row) => projectIds.has(row.project_id) && (options.includeArchived || !isArchived(row)));
  const designDocuments = dataset.designDocuments.filter((row) => projectIds.has(row.project_id) && (options.includeArchived || !isArchived(row)));
  const procedures = dataset.procedures.filter((row) => projectIds.has(row.source_record_id) && (options.includeArchived || !isArchived(row)));
  const completionChecks = dataset.completionChecks.filter((row) => projectIds.has(row.project_id));
  const procedureRows = combinedProcedureRows({ ...datasetWithEvidence, permits, procedures }, projects);
  const sharedPropertyRows = propertyRows({ ...datasetWithEvidence, procedures }, projects);
  const documentRows = buildDocumentRows(datasetWithEvidence, sites, projects, procedures, permits, designDocuments);
  const risks = buildRiskRows(datasetWithEvidence, sites, projects, procedureRows, documentRows, options);
  const linkedDocuments = unique(documentRows.flatMap((row) => row.document_number === "-" ? [] : row.document_number.split(",").map((value: string) => value.trim()))).length;
  const approvedPermits = permits.filter((row) => ["approved", "conditional_approved"].includes(row.status));
  const currentDocuments = designDocuments.filter((row) => row.is_current);
  const totalBudget = projects.reduce((sum, row) => sum + number(row.total_budget), 0);
  const spent = projects.reduce((sum, row) => sum + number(row.spent), 0);
  const summary: PlanningReportSummary = {
    sites: sites.length,
    selectedSites: sites.filter((row) => ["selected", "construction", "completed"].includes(row.status)).length,
    acquisitionSites: sites.filter((row) => row.acquisition_method && row.acquisition_method !== "owned").length,
    expectedSpaces: sites.reduce((sum, row) => sum + number(row.estimated_spaces), 0),
    averageScore: sites.length ? sites.reduce((sum, row) => sum + siteScore(row), 0) / sites.length : 0,
    estimatedLandCost: sites.reduce((sum, row) => sum + number(row.estimated_land_cost), 0),
    estimatedConstructionCost: sites.reduce((sum, row) => sum + number(row.estimated_construction_cost), 0),
    projects: projects.length,
    activeProjects: projects.filter((row) => !["completed", "cancelled"].includes(row.status)).length,
    completedProjects: projects.filter((row) => row.status === "completed").length,
    totalBudget,
    spent,
    remaining: projects.reduce((sum, row) => sum + number(row.remaining ?? number(row.total_budget) - number(row.spent)), 0),
    budgetExecutionRate: totalBudget ? spent / totalBudget * 100 : 0,
    procedures: procedureRows.length,
    propertyProcedures: sharedPropertyRows.length,
    completedProcedures: procedureRows.filter((row) => ["completed", "approved", "conditional_approved"].includes(row.status)).length,
    overdueProcedures: procedureRows.filter((row) => !["completed", "approved", "conditional_approved"].includes(row.status) && dateOnly(row.target_approval_date || row.due_date) !== "-" && dateOnly(row.target_approval_date || row.due_date) < options.periodEnd).length,
    permits: permits.length,
    approvedPermits: approvedPermits.length,
    pendingPermits: permits.length - approvedPermits.length,
    currentDocuments: currentDocuments.length,
    approvedDocuments: currentDocuments.filter((row) => ["approved", "final"].includes(row.review_status)).length,
    completionChecks: completionChecks.length,
    completedChecks: completionChecks.filter((row) => row.is_completed).length,
    riskCount: risks.length,
    highRisks: risks.filter((row) => ["높음", "긴급"].includes(row.risk_level)).length,
    linkedDocuments,
    missingDocuments: documentRows.filter((row) => row.__missing_document).length,
  };
  const rowsBySection: Record<Exclude<PlanningReportSectionId, "overview">, any[]> = {
    candidates: sites,
    feasibility: sites,
    acquisition: sites,
    property: sharedPropertyRows,
    procedures: procedureRows,
    projects,
    budget: projects,
    progress: projects,
    risks,
    documents: documentRows,
  };
  const tables = options.selectedSections.filter((id): id is Exclude<PlanningReportSectionId, "overview"> => id !== "overview").flatMap((id) => {
    const section = PLANNING_REPORT_SECTIONS.find((item) => item.id === id)!;
    const requested = options.selectedFields[id] || section.defaultFields;
    const fields = section.fields.filter((item) => requested.includes(item.key));
    const rows = sortRows(rowsBySection[id], options.sort, datasetWithEvidence);
    const groups = splitPlanningFields(id, fields, options.orientation);
    return groups.map((group, groupIndex) => ({
      id,
      title: section.label,
      subtitle: groups.length > 1 ? `${section.label} 세부정보` : undefined,
      subtitleNumber: groups.length > 1 ? groupIndex + 1 : undefined,
      continuation: groupIndex > 0,
      columns: group.map((item) => ({ key: item.key, label: item.label })),
      rows: rows.map((row) => Object.fromEntries(group.map((item) => [item.key, text(item.value(row, datasetWithEvidence))]))),
    } as OperationsReportTable));
  });
  const selectedFields = options.selectedSections.flatMap((id) => {
    const section = PLANNING_REPORT_SECTIONS.find((item) => item.id === id)!;
    return section.fields.filter((item) => (options.selectedFields[id] || section.defaultFields).includes(item.key));
  });
  const riskNarrative = [
    summary.overdueProcedures ? `기한초과 절차 ${summary.overdueProcedures}건` : "기한초과 절차 없음",
    summary.pendingPermits ? `미승인 인허가 ${summary.pendingPermits}건` : "미승인 인허가 없음",
    summary.highRisks ? `높음·긴급 위험 ${summary.highRisks}건` : "높음·긴급 위험 없음",
    summary.missingDocuments ? `공식 문서번호 미등록 ${summary.missingDocuments}건` : "공식 문서번호 누락 없음",
  ].join("; ");
  return {
    period: { start: options.periodStart, end: options.periodEnd },
    lotTypeLabels: PLANNING_REPORT_LOT_TYPE_OPTIONS.filter((item) => options.lotTypes.includes(item.value)).map((item) => item.label),
    summary,
    sourceCounts: {
      sites: sites.length,
      projects: projects.length,
      permits: permits.length,
      designDocuments: designDocuments.length,
      procedures: procedures.length,
      propertyProcedures: sharedPropertyRows.length,
      completionChecks: completionChecks.length,
      budgetItems: dataset.budgetItems.length,
      risks: risks.length,
      documents: documentRows.length,
    },
    evidenceMetadata,
    tables,
    selectedFieldCount: selectedFields.length,
    protectedFieldCount: selectedFields.filter((item) => item.protected).length,
    riskNarrative,
  };
}

export function planningReportBriefRows(model: PlanningReportModel, documentSummary?: string): string[][] {
  return [
    ["담당부서", PRIMARY_DEPARTMENT],
    ["보고기간", `${model.period.start} ~ ${model.period.end}`],
    ["보고대상", `제주시 ${model.lotTypeLabels.join("·") || "공영주차장 전체"} 신설·확충 기획사업`],
    ["주요내용", "후보지·타당성·부지취득·공유재산·사전절차·사업계획·예산·공정·위험·공식 문서번호"],
    ["작성목적", documentSummary || "공영주차장 신설·확충 후보지의 타당성과 행정절차, 재정·공정 위험 및 문서 근거를 종합하여 투자 우선순위와 후속조치를 결정하기 위함."],
    ["산출기준", `보고기간과 주차장 형태 조건에 해당하는 후보지 ${model.summary.sites.toLocaleString("ko-KR")}곳과 사업 ${model.summary.projects.toLocaleString("ko-KR")}건의 원장을 기준으로 산출함. 원천자료는 테이블 절단 없이 완전 조회된 경우에만 생성함. ${model.riskNarrative}`],
  ];
}

export function planningReportSummaryRows(model: PlanningReportModel): string[][] {
  return [
    ["후보지", `${model.summary.sites.toLocaleString("ko-KR")}곳`, "선정 후보지", `${model.summary.selectedSites.toLocaleString("ko-KR")}곳`],
    ["계획 주차면", `${model.summary.expectedSpaces.toLocaleString("ko-KR")}면`, "평균 종합점수", `${model.summary.averageScore.toFixed(1)}점`],
    ["추정 토지비", won(model.summary.estimatedLandCost), "추정 건설비", won(model.summary.estimatedConstructionCost)],
    ["신설·확충 사업", `${model.summary.projects.toLocaleString("ko-KR")}건`, "진행 사업", `${model.summary.activeProjects.toLocaleString("ko-KR")}건`],
    ["총사업비", won(model.summary.totalBudget), "집행액·집행률", `${won(model.summary.spent)} · ${percent(model.summary.budgetExecutionRate)}`],
    ["행정·인허가 절차", `${model.summary.procedures.toLocaleString("ko-KR")}건`, "기한초과", `${model.summary.overdueProcedures.toLocaleString("ko-KR")}건`],
    ["공유재산 절차", `${model.summary.propertyProcedures.toLocaleString("ko-KR")}건`, "미승인 인허가", `${model.summary.pendingPermits.toLocaleString("ko-KR")}건`],
    ["위험·보완", `${model.summary.riskCount.toLocaleString("ko-KR")}건`, "높음·긴급", `${model.summary.highRisks.toLocaleString("ko-KR")}건`],
    ["연계 문서번호", `${model.summary.linkedDocuments.toLocaleString("ko-KR")}건`, "문서번호 미등록", `${model.summary.missingDocuments.toLocaleString("ko-KR")}건`],
  ];
}

export function toOperationsCompatiblePlanningModel(model: PlanningReportModel): OperationsReportModel {
  return {
    period: model.period,
    lotTypeLabels: model.lotTypeLabels,
    summary: {
      parkingLots: model.summary.sites,
      totalSpaces: model.summary.expectedSpaces,
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

export async function getPlanningReportEvidence(parameters: Record<string, string>) {
  const options = parsePlanningReportOptions(parameters);
  const dataset = await collectPlanningReportData(options);
  const model = buildPlanningReportModel(dataset, options);
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

export const PLANNING_REPORT_SAMPLE_DATASET: PlanningReportDataset = {
  sites: [
    {
      id: "site-1", site_number: "SC-2026-001", name: "동문시장 인근 후보지", address_road: "제주시 관덕로 14길", administrative_dong: "일도1동",
      area_sqm: 2400, ownership: "private", owner_name: "김소유", acquisition_method: "purchase", estimated_land_cost: 3_200_000_000,
      planned_lot_type: "offstreet", estimated_spaces: 95, estimated_floors: 1, location_score: 88, accessibility_score: 84,
      demand_score: 92, feasibility_score: 81, legal_score: 76, total_score: 84.2, ranking: 1,
      estimated_construction_cost: 2_800_000_000, estimated_annual_revenue: 420_000_000, estimated_annual_expense: 160_000_000,
      estimated_annual_profit: 260_000_000, bc_ratio: 1.18, payback_years: 11.5, npv: 420_000_000, irr: 6.8,
      status: "selected", evaluation_date: "2026-02-20", decision_date: "2026-03-05", decision_note: "시장권 주차수요와 사업성을 고려하여 우선 추진",
      created_at: "2026-01-10", updated_at: "2026-03-05",
    },
    {
      id: "site-2", site_number: "SC-2026-002", name: "칠성로 복층화 후보지", address_road: "제주시 중앙로 40", administrative_dong: "이도1동",
      area_sqm: 1800, ownership: "municipal", acquisition_method: "owned", estimated_land_cost: 0,
      planned_lot_type: "multilevel", estimated_spaces: 180, estimated_floors: 4, location_score: 82, accessibility_score: 80,
      demand_score: 86, feasibility_score: 74, legal_score: 72, total_score: 78.8, ranking: 2,
      estimated_construction_cost: 7_200_000_000, estimated_annual_revenue: 680_000_000, estimated_annual_expense: 310_000_000,
      estimated_annual_profit: 370_000_000, bc_ratio: 1.06, payback_years: 19.5, npv: 180_000_000, irr: 5.2,
      traffic_impact_review: true, status: "construction", evaluation_date: "2026-01-25", decision_date: "2026-02-10",
      decision_note: "공유재산 관리계획 반영 후 복층화 추진", created_at: "2026-01-05", updated_at: "2026-06-01",
    },
    {
      id: "site-3", site_number: "SC-2026-003", name: "중앙로 노상구획 정비 후보", address_road: "제주시 중앙로 120", administrative_dong: "이도2동",
      area_sqm: 950, ownership: "public", acquisition_method: "owned", estimated_land_cost: 0,
      planned_lot_type: "onstreet", estimated_spaces: 42, estimated_floors: 1, location_score: 76, accessibility_score: 91,
      demand_score: 70, feasibility_score: 52, legal_score: 60, total_score: 69.8, ranking: 3,
      estimated_construction_cost: 900_000_000, estimated_annual_revenue: 80_000_000, estimated_annual_expense: 55_000_000,
      estimated_annual_profit: 25_000_000, bc_ratio: 0.82, payback_years: 36, npv: -120_000_000, irr: 2.1,
      legal_restrictions: "버스정류장 및 소방시설 주변 주정차 금지구역 재검토 필요", status: "evaluating", evaluation_date: "2026-07-15",
      created_at: "2026-06-10", updated_at: "2026-08-01",
    },
  ],
  projects: [
    {
      id: "project-1", project_number: "CP-2026-001", project_name: "동문시장 인근 공영주차장 조성사업", site_id: "site-1",
      project_type: "new_construction", description: "사유지 매입 후 노외 공영주차장 95면 조성", phase: "permitting",
      total_budget: 6_000_000_000, design_cost: 250_000_000, construction_cost: 2_500_000_000, supervision_cost: 180_000_000,
      other_cost: 3_070_000_000, spent: 620_000_000, remaining: 5_380_000_000, budget_execution_rate: 10.33,
      budget_item_id: "budget-1", bid_contract_id: "contract-1", planning_start: "2026-03-10", planning_end: "2026-05-31",
      design_start: "2026-06-01", target_completion: "2027-12-31", progress_pct: 28, progress_detail: "건축허가 보완 중",
      permits_completed: 1, permits_total: 2, status: "in_progress", delay_days: 12, delay_reason: "교통영향 검토 보완",
      lot_type_snapshot: "offstreet", created_at: "2026-03-10", site: null,
    },
    {
      id: "project-2", project_number: "CP-2026-002", project_name: "칠성로 공영주차장 복층화사업", site_id: "site-2",
      project_type: "multilevel", description: "기존 시유지 주차장을 4층 주차빌딩으로 복층화", phase: "construction",
      total_budget: 7_200_000_000, design_cost: 320_000_000, construction_cost: 6_300_000_000, supervision_cost: 380_000_000,
      other_cost: 200_000_000, spent: 3_240_000_000, remaining: 3_960_000_000, budget_execution_rate: 45,
      budget_item_id: "budget-2", bid_contract_id: "contract-2", service_project_id: "service-2", planning_start: "2026-02-15",
      construction_start: "2026-06-01", construction_end: "2027-05-31", target_completion: "2027-06-30", progress_pct: 46,
      progress_detail: "골조 2층 시공", permits_completed: 2, permits_total: 2, status: "in_progress", delay_days: 0,
      lot_type_snapshot: "multilevel", created_at: "2026-02-15",
    },
    {
      id: "project-3", project_number: "CP-2026-003", project_name: "중앙로 노상주차구획 정비사업", site_id: "site-3",
      project_type: "renovation", description: "노상주차구획 재배치와 안전표지 정비", phase: "planning",
      total_budget: 900_000_000, design_cost: 80_000_000, construction_cost: 720_000_000, supervision_cost: 50_000_000,
      other_cost: 50_000_000, spent: 0, remaining: 900_000_000, budget_execution_rate: 0,
      budget_item_id: null, planning_start: "2026-07-20", planning_end: "2026-10-31", target_completion: "2027-06-30",
      progress_pct: 8, progress_detail: "타당성 보완 및 경찰 협의 준비", permits_completed: 0, permits_total: 1,
      status: "planning", delay_days: 0, lot_type_snapshot: "onstreet", created_at: "2026-07-20",
    },
  ],
  permits: [
    { id: "permit-1", project_id: "project-1", permit_number: "JJP-BLD-2026-101", permit_type: "building_permit", authority: "제주시청", authority_department: "건축과", application_date: "2026-07-01", target_approval_date: "2026-08-10", actual_approval_date: "2026-08-08", status: "approved", official_document_number: "제주시청-건축과-2026-2101", fee_amount: 450000, fee_paid: true, created_at: "2026-07-01" },
    { id: "permit-2", project_id: "project-1", permit_type: "traffic_impact", authority: "제주특별자치도", authority_department: "교통정책과", application_date: "2026-07-15", target_approval_date: "2026-08-20", status: "reviewing", conditions: "진출입 동선 보완", fee_amount: 0, fee_paid: true, created_at: "2026-07-15" },
    { id: "permit-3", project_id: "project-2", permit_number: "JJP-FIRE-2026-055", permit_type: "fire_safety", authority: "제주소방서", application_date: "2026-04-01", target_approval_date: "2026-05-10", actual_approval_date: "2026-05-08", status: "conditional_approved", official_document_number: "제주소방서-예방안전과-2026-0550", conditions: "준공 전 완강기 성능시험", fee_amount: 0, fee_paid: true, created_at: "2026-04-01" },
    { id: "permit-4", project_id: "project-3", permit_type: "traffic_impact", authority: "제주동부경찰서", authority_department: "교통과", application_date: "2026-08-01", target_approval_date: "2026-08-25", status: "submitted", conditions: "노상구획 안전성 검토", fee_amount: 0, fee_paid: true, created_at: "2026-08-01" },
  ],
  designDocuments: [
    { id: "design-1", project_id: "project-1", doc_number: "DWG-CP001-01", doc_type: "basic_design", title: "동문시장 기본설계도", version: "v1.0", is_current: true, review_status: "approved", approved_at: "2026-06-15", created_at: "2026-06-01" },
    { id: "design-2", project_id: "project-1", doc_number: "DWG-CP001-02", doc_type: "detailed_design", title: "동문시장 실시설계도", version: "v1.1", is_current: true, review_status: "revision_required", review_comments: "진출입 동선 보완", created_at: "2026-07-10" },
    { id: "design-3", project_id: "project-2", doc_number: "DWG-CP002-01", doc_type: "detailed_design", title: "칠성로 주차빌딩 실시설계도", version: "v2.0", is_current: true, review_status: "final", approved_at: "2026-05-20", created_at: "2026-04-10" },
  ],
  procedures: [
    { id: "procedure-1", source_record_id: "project-1", record_number: "CAP-2026-001", title: "동문시장 부지매입 및 공유재산 심의", category: "확충사업행정절차", owner_name: "시설팀 주무관", status: "completed", due_date: "2026-05-30", completed_at: "2026-05-28", document_number: "제주시청-차량관리과시설팀-2026-1101", payload: { workflow_key: "capital_procedure", projectType: "부지매입", estimatedSpaces: 95, budget: 6000000000, procedureGate: "공유재산 심의", consultation: "회계과·재산관리팀", nextGate: "토지매매 협의", completionEvidence: "공유재산심의 의결서" }, created_at: "2026-03-15" },
    { id: "procedure-2", source_record_id: "project-1", record_number: "CAP-2026-002", title: "동문시장 토지 보상·매입", category: "확충사업행정절차", owner_name: "시설팀 주무관", status: "in_progress", due_date: "2026-08-15", payload: { workflow_key: "capital_procedure", projectType: "부지매입", procedureGate: "토지 보상·매입", consultation: "토지소유자·법무팀", nextGate: "감정평가액 기준 협의계약", completionEvidence: "" }, created_at: "2026-06-01" },
    { id: "procedure-3", source_record_id: "project-2", record_number: "CAP-2026-003", title: "칠성로 공유재산 관리계획", category: "확충사업행정절차", owner_name: "시설팀 주무관", status: "completed", due_date: "2026-03-31", completed_at: "2026-03-25", document_number: "제주시청-차량관리과시설팀-2026-1201", payload: { workflow_key: "capital_procedure", projectType: "복층화", procedureGate: "공유재산 심의", consultation: "회계과·시의회", nextGate: "지방재정 투자심사", completionEvidence: "관리계획 의결서" }, created_at: "2026-02-20" },
    { id: "procedure-4", source_record_id: "project-3", record_number: "CAP-2026-004", title: "중앙로 노상구획 도시관리계획 협의", category: "확충사업행정절차", owner_name: "시설팀 주무관", status: "assigned", due_date: "2026-08-20", payload: { workflow_key: "capital_procedure", projectType: "환경개선", procedureGate: "도시관리계획", consultation: "도시계획과·경찰서", nextGate: "교통안전 심의자료 보완", completionEvidence: "" }, created_at: "2026-07-20" },
  ],
  completionChecks: [
    { id: "check-1", project_id: "project-2", check_code: "completion_inspection", label: "준공검사 합격", is_required: true, requires_evidence: true, is_completed: false, sort_order: 10 },
    { id: "check-2", project_id: "project-2", check_code: "as_built_docs", label: "준공도면 및 시설물 인수자료", is_required: true, requires_evidence: true, is_completed: false, sort_order: 20 },
  ],
  budgetItems: [
    { id: "budget-1", item_code: "PLN-2026-01", item_name: "동문시장 공영주차장 조성", fiscal_year: 2026, allocated_amount: 6_000_000_000, executed_amount: 620_000_000, remaining_amount: 5_380_000_000, plan_status: "approved" },
    { id: "budget-2", item_code: "PLN-2026-02", item_name: "칠성로 주차빌딩 복층화", fiscal_year: 2026, allocated_amount: 7_200_000_000, executed_amount: 3_240_000_000, remaining_amount: 3_960_000_000, plan_status: "executed" },
  ],
  documentNumbers: {
    "PLANNING:site-1": ["제주시청-차량관리과시설팀-2026-1001"],
    "PLANNING:site-2": ["제주시청-차량관리과시설팀-2026-1002"],
    "PLANNING:project-1": ["제주시청-차량관리과시설팀-2026-1301"],
    "PLANNING:project-2": ["제주시청-차량관리과시설팀-2026-1302"],
    "PLANNING:procedure-1": ["제주시청-차량관리과시설팀-2026-1101"],
    "PLANNING:procedure-3": ["제주시청-차량관리과시설팀-2026-1201"],
    "PLANNING:permit-1": ["제주시청-건축과-2026-2101"],
    "PLANNING:permit-3": ["제주소방서-예방안전과-2026-0550"],
    "PLANNING:design-1": ["제주시청-차량관리과시설팀-2026-1401"],
    "PLANNING:design-3": ["제주시청-차량관리과시설팀-2026-1403"],
  },
};
