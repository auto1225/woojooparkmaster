import { PRIMARY_DEPARTMENT } from "@/config/organization";
import { supabase } from "@/integrations/supabase/client";
import type {
  OperationsReportModel,
  OperationsReportOrientation,
  OperationsReportTable,
} from "@/lib/operations-report";
import {
  BID_STATUS_LABELS,
  BID_TYPE_LABELS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  DOC_CATEGORY_LABELS,
  DOC_TYPE_LABELS,
  EVAL_METHOD_LABELS,
} from "@/types/procurement";

export type ProcurementReportSectionId =
  | "overview"
  | "announcements"
  | "openings"
  | "submissions"
  | "evaluations"
  | "contracts"
  | "bonds"
  | "deadlines"
  | "documents"
  | "risks";
export type ProcurementReportSort = "attention" | "date_desc" | "deadline_asc" | "amount_desc" | "status" | "vendor";
export type ProcurementReportOrientation = OperationsReportOrientation;

export interface ProcurementReportField {
  key: string;
  label: string;
  protected?: boolean;
  value: (row: any, dataset: ProcurementReportDataset) => unknown;
}

export interface ProcurementReportSection {
  id: ProcurementReportSectionId;
  label: string;
  description: string;
  fields: ProcurementReportField[];
  defaultFields: string[];
}

export interface ProcurementReportOptions {
  periodStart: string;
  periodEnd: string;
  selectedSections: ProcurementReportSectionId[];
  selectedFields: Partial<Record<ProcurementReportSectionId, string[]>>;
  lotTypes: string[];
  statuses: string[];
  sort: ProcurementReportSort;
  orientation: ProcurementReportOrientation;
  includeArchived: boolean;
  includeInvalidSubmissions: boolean;
}

export interface ProcurementReportDataset {
  parkingLots: any[];
  projects: any[];
  submissions: any[];
  evaluations: any[];
  contracts: any[];
  documents: any[];
  budgetItems: any[];
  profiles: any[];
  documentNumbers: Record<string, string[]>;
}

export interface ProcurementReportSummary extends Record<string, number> {
  parkingLots: number;
  projects: number;
  activeProjects: number;
  announcedProjects: number;
  awardedProjects: number;
  failedProjects: number;
  estimatedAmount: number;
  designAmount: number;
  budgetAvailableAmount: number;
  awardedAmount: number;
  averageAwardRate: number;
  submissions: number;
  validSubmissions: number;
  invalidSubmissions: number;
  contracts: number;
  activeContracts: number;
  unsignedContracts: number;
  contractAmount: number;
  savingsAmount: number;
  bondsRequired: number;
  bondsRegistered: number;
  missingBonds: number;
  overdueDeadlines: number;
  upcomingDeadlines: number;
  currentDocuments: number;
  linkedDocuments: number;
  missingDocuments: number;
  riskCount: number;
}

export interface ProcurementEvidenceMetadata {
  complete: true;
  queryLimit: number;
  generatedAt: string;
  sourceTables: string[];
  filters: {
    periodStart: string;
    periodEnd: string;
    lotTypes: string[];
    statuses: string[];
    includeArchived: boolean;
  };
}

export interface ProcurementReportModel {
  period: { start: string; end: string };
  lotTypeLabels: string[];
  summary: ProcurementReportSummary;
  sourceCounts: Record<string, number>;
  tables: OperationsReportTable[];
  selectedFieldCount: number;
  protectedFieldCount: number;
  riskNarrative: string;
  evidenceMetadata: ProcurementEvidenceMetadata;
}

const QUERY_LIMIT = 5000;
const ID_CHUNK_SIZE = 200;
const DOCUMENT_MODULES = ["BID_PROJECT", "BID_CONTRACT", "BID_DOCUMENT"] as const;
const ACTIVE_PROJECT_STATUSES = ["draft", "rejected", "review", "announced", "bidding", "closed", "evaluation", "awarded"];
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

export const PROCUREMENT_LOT_TYPE_OPTIONS = [
  { value: "offstreet", label: "노외주차장" },
  { value: "building", label: "주차빌딩" },
  { value: "onstreet", label: "노상주차장" },
];

const relation = (row: any, key: string) => Array.isArray(row?.[key]) ? row[key][0] : row?.[key];
const number = (value: unknown) => Number(value || 0);
const text = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);
const dateOnly = (value: unknown) => value ? String(value).split("T")[0] : "-";
const won = (value: unknown) => `${number(value).toLocaleString("ko-KR")}원`;
const percent = (value: unknown) => `${number(value).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
const yesNo = (value: unknown) => value ? "예" : "아니오";
const unique = (values: unknown[]) => [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
const isArchived = (row: any) => Boolean(row?.archived_at);
const documentKey = (module: string, id: string) => `${module}:${id}`;
const bidStatus = (value: unknown) => BID_STATUS_LABELS[String(value || "")] || text(value);
const contractStatus = (value: unknown) => CONTRACT_STATUS_LABELS[String(value || "")] || text(value);
const bidType = (value: unknown) => BID_TYPE_LABELS[String(value || "")] || text(value);
const contractType = (value: unknown) => CONTRACT_TYPE_LABELS[String(value || "")] || text(value);

function projectFor(row: any, dataset: ProcurementReportDataset) {
  return relation(row, "bid_projects") || dataset.projects.find(project => project.id === row.bid_project_id);
}

function submissionFor(row: any, dataset: ProcurementReportDataset) {
  return relation(row, "bid_submissions") || dataset.submissions.find(submission => submission.id === row.submission_id);
}

function budgetItemFor(row: any, dataset: ProcurementReportDataset) {
  const project = row.bid_number ? row : projectFor(row, dataset);
  return relation(project, "budget_items") || dataset.budgetItems.find(item => item.id === project?.budget_item_id);
}

function lotFor(row: any, dataset: ProcurementReportDataset) {
  const project = row.bid_number ? row : projectFor(row, dataset);
  return relation(project, "parking_lots") || dataset.parkingLots.find(item => item.id === project?.lot_id);
}

function lotName(row: any, dataset: ProcurementReportDataset) {
  return lotFor(row, dataset)?.name || row.parking_lot_name || "공통";
}

function lotType(row: any, dataset: ProcurementReportDataset) {
  const project = row.bid_number ? row : projectFor(row, dataset);
  return project?.lot_type_at_event || lotFor(row, dataset)?.lot_type || "";
}

function profileName(row: any, key: string, dataset: ProcurementReportDataset) {
  const profile = relation(row, `${key}_profile`) || dataset.profiles.find(item => item.id === row[key]);
  return profile?.name || row[`${key}_name`] || row.author_name || "-";
}

function rowDocuments(dataset: ProcurementReportDataset, module: string, row: any) {
  return unique([row.document_number, ...(dataset.documentNumbers[documentKey(module, row.id)] || [])]);
}

const documentList = (dataset: ProcurementReportDataset, module: string, row: any) => rowDocuments(dataset, module, row).join(", ") || "-";
const field = (key: string, label: string, value: ProcurementReportField["value"], protectedField = false): ProcurementReportField => ({ key, label, value, protected: protectedField });

export const PROCUREMENT_REPORT_SECTIONS: ProcurementReportSection[] = [
  { id: "overview", label: "입찰관리 현황", description: "공고·개찰·계약·보증·기한·문서·리스크 통합 현황", fields: [], defaultFields: [] },
  {
    id: "announcements", label: "입찰 공고", description: "공고 기본정보, 일정, 승인 예산 및 문서번호",
    fields: [
      field("bid_number", "입찰번호", row => row.bid_number), field("document_number", "근거 문서번호", (row, dataset) => documentList(dataset, "BID_PROJECT", row)),
      field("title", "사업명", row => row.title), field("lot", "주차장", (row, dataset) => lotName(row, dataset)),
      field("lot_type", "주차장 형태", (row, dataset) => LOT_TYPE_LABELS[lotType(row, dataset)] || lotType(row, dataset) || "공통"),
      field("bid_type", "입찰방식", row => bidType(row.bid_type)), field("contract_type", "계약유형", row => contractType(row.contract_type)),
      field("evaluation_method", "낙찰방법", row => EVAL_METHOD_LABELS[row.evaluation_method] || row.evaluation_method), field("status", "진행상태", row => bidStatus(row.status)),
      field("nara_ref", "나라장터 번호", row => row.nara_ref), field("announce_date", "공고일", row => dateOnly(row.announce_date)),
      field("bid_start_date", "입찰개시일", row => dateOnly(row.bid_start_date)), field("bid_deadline", "입찰마감", row => dateOnly(row.bid_deadline)),
      field("bid_open_date", "개찰일", row => dateOnly(row.bid_open_date)), field("budget_item", "승인 예산항목", (row, dataset) => { const item = budgetItemFor(row, dataset); return item ? `${item.item_code} ${item.item_name}` : "-"; }),
      field("budget_available_amount", "가용예산", row => won(row.budget_available_amount)), field("estimated_amount", "추정가격", row => won(row.estimated_amount)),
      field("design_amount", "설계금액", row => won(row.design_amount)), field("lowest_price_rate", "낙찰하한율", row => percent(row.lowest_price_rate)),
      field("assigned_to", "담당자", (row, dataset) => profileName(row, "assigned_to", dataset), true), field("author_name", "작성자", row => row.author_name, true),
    ],
    defaultFields: ["bid_number", "document_number", "title", "lot", "lot_type", "bid_type", "contract_type", "evaluation_method", "status", "nara_ref", "announce_date", "bid_start_date", "bid_deadline", "bid_open_date", "budget_item", "budget_available_amount", "estimated_amount", "design_amount", "lowest_price_rate"],
  },
  {
    id: "openings", label: "개찰·낙찰", description: "개찰 결과, 참여·유효 업체, 낙찰업체·금액·낙찰률",
    fields: [
      field("bid_number", "입찰번호", row => row.bid_number), field("title", "사업명", row => row.title), field("bid_open_date", "개찰일", row => dateOnly(row.bid_open_date)),
      field("bid_open_location", "개찰장소", row => row.bid_open_location), field("submission_count", "참여업체", row => `${number(row.submission_count)}개사`),
      field("valid_count", "유효업체", row => `${number(row.valid_count)}개사`), field("invalid_count", "무효업체", row => `${number(row.invalid_count)}개사`),
      field("lowest_bid_amount", "최저투찰금액", row => won(row.lowest_bid_amount)), field("successful_bidder", "낙찰업체", row => row.successful_bidder),
      field("award_amount", "낙찰금액", row => won(row.award_amount)), field("award_rate", "낙찰률", row => percent(row.award_rate)),
      field("savings_amount", "절감액", row => won(row.savings_amount)), field("status", "진행상태", row => bidStatus(row.status)),
      field("document_number", "근거 문서번호", row => row.document_number),
    ],
    defaultFields: ["bid_number", "title", "bid_open_date", "bid_open_location", "submission_count", "valid_count", "invalid_count", "lowest_bid_amount", "successful_bidder", "award_amount", "award_rate", "savings_amount", "status", "document_number"],
  },
  {
    id: "submissions", label: "참여업체", description: "투찰업체, 담당자, 투찰금액·투찰률 및 유효성",
    fields: [
      field("submission_number", "접수번호", row => row.submission_number), field("bid_number", "입찰번호", (row, dataset) => projectFor(row, dataset)?.bid_number),
      field("company_name", "업체명", row => row.company_name), field("representative", "대표자", row => row.representative),
      field("bid_amount", "투찰금액", row => won(row.bid_amount)), field("bid_rate", "투찰률", row => percent(row.bid_rate)),
      field("submitted_at", "제출일시", row => dateOnly(row.submitted_at)), field("is_valid", "유효여부", row => yesNo(row.is_valid)),
      field("invalid_reason", "무효사유", row => row.invalid_reason), field("business_number", "사업자등록번호", row => row.business_number, true),
      field("contact_person", "업체 담당자", row => row.contact_person, true), field("contact_phone", "연락처", row => row.contact_phone, true),
      field("contact_email", "전자우편", row => row.contact_email, true),
    ],
    defaultFields: ["submission_number", "bid_number", "company_name", "representative", "bid_amount", "bid_rate", "submitted_at", "is_valid", "invalid_reason"],
  },
  {
    id: "evaluations", label: "평가 결과", description: "가격·기술·경영·실적 평가와 적격·순위",
    fields: [
      field("bid_number", "입찰번호", (row, dataset) => projectFor(row, dataset)?.bid_number), field("company_name", "업체명", (row, dataset) => submissionFor(row, dataset)?.company_name),
      field("price_score", "가격점수", row => row.price_score), field("technical_score", "기술점수", row => row.technical_score),
      field("business_score", "경영점수", row => row.business_score), field("performance_score", "실적점수", row => row.performance_score),
      field("total_score", "종합점수", row => row.total_score), field("rank", "순위", row => row.rank ? `${row.rank}위` : "-"),
      field("is_qualified", "적격여부", row => yesNo(row.is_qualified)), field("evaluation_date", "평가일", row => dateOnly(row.evaluation_date)),
      field("disqualification_reason", "부적격사유", row => row.disqualification_reason), field("evaluator_name", "평가자", row => row.evaluator_name, true),
    ],
    defaultFields: ["bid_number", "company_name", "price_score", "technical_score", "business_score", "performance_score", "total_score", "rank", "is_qualified", "evaluation_date", "disqualification_reason"],
  },
  {
    id: "contracts", label: "계약 현황", description: "낙찰업체 계약, 금액, 기간, 서명 및 문서번호",
    fields: [
      field("contract_number", "계약번호", row => row.contract_number), field("document_number", "계약 문서번호", (row, dataset) => documentList(dataset, "BID_CONTRACT", row)),
      field("bid_number", "입찰번호", (row, dataset) => projectFor(row, dataset)?.bid_number), field("title", "사업명", (row, dataset) => projectFor(row, dataset)?.title),
      field("contractor_name", "계약업체", row => row.contractor_name), field("contract_amount", "공급가액", row => won(row.contract_amount)),
      field("vat_amount", "부가가치세", row => won(row.vat_amount)), field("total_amount", "계약금액", row => won(row.total_amount)),
      field("award_rate", "낙찰률", (row, dataset) => percent(contractAwardRate(row, dataset))), field("contract_date", "계약일", row => dateOnly(row.contract_date)),
      field("contract_start", "착수일", row => dateOnly(row.contract_start)), field("contract_end", "완료기한", row => dateOnly(row.contract_end)),
      field("status", "계약상태", row => contractStatus(row.status)), field("signed_at", "서명확정일", row => dateOnly(row.signed_at)),
      field("contractor_business_number", "사업자등록번호", row => row.contractor_business_number, true),
      field("contractor_contact_person", "업체 담당자", row => row.contractor_contact_person, true), field("contractor_phone", "연락처", row => row.contractor_phone, true),
    ],
    defaultFields: ["contract_number", "document_number", "bid_number", "title", "contractor_name", "contract_amount", "vat_amount", "total_amount", "award_rate", "contract_date", "contract_start", "contract_end", "status", "signed_at"],
  },
  {
    id: "bonds", label: "보증 현황", description: "계약이행·선금·하자보증과 보증기한",
    fields: [
      field("contract_number", "계약번호", row => row.contract_number), field("contractor_name", "계약업체", row => row.contractor_name),
      field("performance_bond_number", "이행보증번호", row => row.performance_bond_number), field("performance_bond_company", "보증기관", row => row.performance_bond_company),
      field("performance_bond_rate", "이행보증률", row => percent(row.performance_bond_rate)), field("performance_bond_amount", "이행보증금", row => won(row.performance_bond_amount)),
      field("performance_bond_end", "이행보증기한", row => dateOnly(row.performance_bond_end)), field("advance_payment_amount", "선금", row => won(row.advance_payment_amount)),
      field("advance_bond_amount", "선금보증금", row => won(row.advance_bond_amount)), field("defect_bond_rate", "하자보증률", row => percent(row.defect_bond_rate)),
      field("defect_bond_amount", "하자보증금", row => won(row.defect_bond_amount)), field("warranty_end", "하자보증기한", row => dateOnly(row.warranty_end)),
      field("bond_status", "보증상태", row => row.bond_status), field("document_number", "계약 문서번호", row => row.document_number),
    ],
    defaultFields: ["contract_number", "contractor_name", "performance_bond_number", "performance_bond_company", "performance_bond_rate", "performance_bond_amount", "performance_bond_end", "advance_payment_amount", "advance_bond_amount", "defect_bond_rate", "defect_bond_amount", "warranty_end", "bond_status", "document_number"],
  },
  {
    id: "deadlines", label: "기한 관리", description: "입찰마감·개찰·계약완료·보증기한의 임박·초과 현황",
    fields: [
      field("deadline_type", "기한구분", row => row.deadline_type), field("reference", "관리번호", row => row.reference), field("title", "대상", row => row.title),
      field("due_date", "기한", row => row.due_date), field("days_remaining", "잔여일", row => `${row.days_remaining}일`),
      field("deadline_status", "기한상태", row => row.deadline_status), field("owner", "담당", row => row.owner, true), field("document_number", "문서번호", row => row.document_number),
    ],
    defaultFields: ["deadline_type", "reference", "title", "due_date", "days_remaining", "deadline_status", "document_number"],
  },
  {
    id: "documents", label: "문서·증빙", description: "입찰·계약 문서번호와 현재 원문 증빙",
    fields: [
      field("source_type", "업무구분", row => row.source_type), field("record_number", "관리번호", row => row.record_number), field("title", "문서명", row => row.title),
      field("doc_category", "문서분류", row => row.doc_category), field("doc_type", "문서유형", row => row.doc_type), field("document_number", "문서번호", row => row.document_number),
      field("version", "버전", row => row.version), field("is_current", "현재본", row => yesNo(row.is_current)), field("has_file", "원문파일", row => yesNo(row.has_file)),
      field("record_date", "등록일", row => row.record_date),
    ],
    defaultFields: ["source_type", "record_number", "title", "doc_category", "doc_type", "document_number", "version", "is_current", "has_file", "record_date"],
  },
  {
    id: "risks", label: "리스크·조치사항", description: "예산, 일정, 개찰, 계약, 보증, 문서의 예외사항",
    fields: [
      field("risk_level", "위험도", row => row.risk_level), field("area", "업무구분", row => row.area), field("reference", "관리번호", row => row.reference),
      field("finding", "확인사항", row => row.finding), field("amount", "관련금액", row => row.amount === null ? "-" : won(row.amount)),
      field("due_date", "조치기한", row => row.due_date), field("status", "조치상태", row => row.status), field("document_number", "문서번호", row => row.document_number),
    ],
    defaultFields: ["risk_level", "area", "reference", "finding", "amount", "due_date", "status", "document_number"],
  },
];

export const PROCUREMENT_REPORT_PRESETS = {
  summary: { label: "간부 요약", sections: ["overview", "announcements", "openings", "contracts", "deadlines", "risks"] as ProcurementReportSectionId[] },
  standard: { label: "실무 종합", sections: PROCUREMENT_REPORT_SECTIONS.map(section => section.id) },
  audit: { label: "감사 대응", sections: ["overview", "announcements", "openings", "submissions", "evaluations", "contracts", "bonds", "deadlines", "documents", "risks"] as ProcurementReportSectionId[] },
};

export function defaultProcurementReportFields(): Partial<Record<ProcurementReportSectionId, string[]>> {
  return Object.fromEntries(PROCUREMENT_REPORT_SECTIONS.map(section => [section.id, [...section.defaultFields]]));
}

export function parseProcurementReportOptions(parameters: Record<string, string>): ProcurementReportOptions {
  const today = new Date().toISOString().slice(0, 10);
  const periodStart = parameters.period_start || `${today.slice(0, 4)}-01-01`;
  const periodEnd = parameters.period_end || periodStart;
  const knownSections = new Set(PROCUREMENT_REPORT_SECTIONS.map(section => section.id));
  const selectedSections = (parameters.procurement_sections || PROCUREMENT_REPORT_PRESETS.summary.sections.join(","))
    .split(",").filter((id): id is ProcurementReportSectionId => knownSections.has(id as ProcurementReportSectionId));
  let selectedFields = defaultProcurementReportFields();
  try {
    const parsed = JSON.parse(parameters.procurement_fields || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) selectedFields = { ...selectedFields, ...parsed };
  } catch {
    selectedFields = defaultProcurementReportFields();
  }
  return {
    periodStart,
    periodEnd,
    selectedSections: selectedSections.length ? selectedSections : ["overview"],
    selectedFields,
    lotTypes: (parameters.procurement_lot_types || "offstreet,building,onstreet").split(",").filter(Boolean),
    statuses: (parameters.procurement_statuses || "").split(",").filter(Boolean),
    sort: (["attention", "date_desc", "deadline_asc", "amount_desc", "status", "vendor"].includes(parameters.procurement_sort) ? parameters.procurement_sort : "attention") as ProcurementReportSort,
    orientation: parameters.procurement_orientation === "landscape" ? "landscape" : "portrait",
    includeArchived: parameters.procurement_include_archived === "true",
    includeInvalidSubmissions: parameters.procurement_include_invalid_submissions !== "false",
  };
}

function matchesLotType(row: any, dataset: ProcurementReportDataset, selected: string[]) {
  if (!selected.length || selected.length === PROCUREMENT_LOT_TYPE_OPTIONS.length) return true;
  const actual = lotType(row, dataset);
  if (!actual) return true;
  return selected.some(group => (LOT_TYPE_ALIASES[group] || [group]).includes(actual));
}

function inPeriod(value: unknown, options: ProcurementReportOptions) {
  const date = dateOnly(value);
  return date !== "-" && date >= options.periodStart && date <= options.periodEnd;
}

function overlaps(start: unknown, end: unknown, options: ProcurementReportOptions) {
  const first = dateOnly(start);
  const last = dateOnly(end || start);
  return first !== "-" && last !== "-" && first <= options.periodEnd && last >= options.periodStart;
}

function projectInPeriod(row: any, options: ProcurementReportOptions) {
  return [row.announce_date, row.bid_start_date, row.bid_deadline, row.bid_open_date, row.created_at, row.approved_at]
    .some(value => inPeriod(value, options))
    || overlaps(row.bid_start_date, row.bid_open_date || row.bid_deadline, options)
    || overlaps(row.work_start_date, row.work_end_date, options);
}

function contractAwardRate(row: any, dataset: ProcurementReportDataset) {
  const project = projectFor(row, dataset);
  const denominator = number(project?.design_amount || project?.estimated_amount);
  return denominator ? number(row.total_amount || row.contract_amount) / denominator * 100 : 0;
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000);
}

function openingRows(dataset: ProcurementReportDataset, projects: any[], submissions: any[], evaluations: any[], contracts: any[]) {
  return projects.map(project => {
    const projectSubmissions = submissions.filter(row => row.bid_project_id === project.id);
    const valid = projectSubmissions.filter(row => row.is_valid !== false);
    const winnerEvaluation = evaluations.find(row => row.bid_project_id === project.id && row.rank === 1 && row.is_qualified !== false);
    const winnerSubmission = winnerEvaluation ? projectSubmissions.find(row => row.id === winnerEvaluation.submission_id) : undefined;
    const contract = contracts.find(row => row.bid_project_id === project.id);
    const awardAmount = number(contract?.total_amount || project.contract_amount || winnerSubmission?.bid_amount);
    const denominator = number(project.design_amount || project.estimated_amount);
    return {
      ...project,
      submission_count: projectSubmissions.length,
      valid_count: valid.length,
      invalid_count: projectSubmissions.length - valid.length,
      lowest_bid_amount: valid.length ? Math.min(...valid.map(row => number(row.bid_amount)).filter(Boolean)) : 0,
      successful_bidder: contract?.contractor_name || project.successful_bidder || winnerSubmission?.company_name || "-",
      award_amount: awardAmount,
      award_rate: denominator ? awardAmount / denominator * 100 : 0,
      savings_amount: awardAmount ? Math.max(denominator - awardAmount, 0) : 0,
      document_number: documentList(dataset, "BID_PROJECT", project),
    };
  });
}

function bondRows(dataset: ProcurementReportDataset, contracts: any[]) {
  return contracts.map(row => ({
    ...row,
    bond_status: row.performance_bond_number && number(row.performance_bond_amount) > 0 ? "등록" : "미등록",
    document_number: documentList(dataset, "BID_CONTRACT", row),
  }));
}

function deadlineRows(dataset: ProcurementReportDataset, projects: any[], contracts: any[], options: ProcurementReportOptions) {
  const rows: any[] = [];
  const add = (deadlineType: string, reference: string, title: string, due: unknown, completed: boolean, owner: string, documentNumber: string) => {
    const dueDate = dateOnly(due);
    if (dueDate === "-") return;
    const remaining = daysBetween(options.periodEnd, dueDate);
    rows.push({ deadline_type: deadlineType, reference, title, due_date: dueDate, days_remaining: remaining, deadline_status: completed ? "완료" : remaining < 0 ? "기한초과" : remaining <= 30 ? "임박" : "정상", owner, document_number: documentNumber });
  };
  projects.forEach(row => {
    const completed = ["closed", "evaluation", "awarded", "contracted", "cancelled", "failed"].includes(row.status);
    add("입찰마감", row.bid_number, row.title, row.bid_deadline, completed, profileName(row, "assigned_to", dataset), documentList(dataset, "BID_PROJECT", row));
    add("개찰", row.bid_number, row.title, row.bid_open_date, ["evaluation", "awarded", "contracted", "cancelled", "failed"].includes(row.status), profileName(row, "assigned_to", dataset), documentList(dataset, "BID_PROJECT", row));
  });
  contracts.forEach(row => {
    add("계약완료", row.contract_number, row.contractor_name, row.contract_end, row.status === "completed", row.contractor_contact_person || "-", documentList(dataset, "BID_CONTRACT", row));
    add("이행보증", row.contract_number, row.contractor_name, row.performance_bond_end, false, row.contractor_contact_person || "-", documentList(dataset, "BID_CONTRACT", row));
    add("하자보증", row.contract_number, row.contractor_name, row.warranty_end, false, row.contractor_contact_person || "-", documentList(dataset, "BID_CONTRACT", row));
  });
  return rows;
}

function documentRows(dataset: ProcurementReportDataset, projects: any[], contracts: any[], documents: any[]) {
  const rows: any[] = [];
  projects.forEach(row => rows.push({ source_type: "입찰공고", record_number: row.bid_number, title: row.title, doc_category: "공고", doc_type: "근거문서", document_number: documentList(dataset, "BID_PROJECT", row), version: "-", is_current: true, has_file: false, record_date: dateOnly(row.announce_date || row.created_at) }));
  contracts.forEach(row => rows.push({ source_type: "계약", record_number: row.contract_number, title: `${row.contractor_name} 계약`, doc_category: "계약", doc_type: "계약서", document_number: documentList(dataset, "BID_CONTRACT", row), version: "-", is_current: true, has_file: false, record_date: dateOnly(row.contract_date) }));
  documents.forEach(row => {
    const project = projectFor(row, dataset);
    rows.push({ source_type: "입찰첨부", record_number: project?.bid_number || "-", title: row.title, doc_category: DOC_CATEGORY_LABELS[row.doc_category] || row.doc_category, doc_type: DOC_TYPE_LABELS[row.doc_type] || row.doc_type, document_number: documentList(dataset, "BID_DOCUMENT", row), version: row.version, is_current: row.is_current, has_file: Boolean(row.file_path), record_date: dateOnly(row.created_at) });
  });
  return rows;
}

function riskRows(dataset: ProcurementReportDataset, projects: any[], submissions: any[], evaluations: any[], contracts: any[], documents: any[], options: ProcurementReportOptions) {
  const rows: any[] = [];
  const add = (riskLevel: string, area: string, reference: string, finding: string, amount: number | null, dueDate: unknown, status: string, documentNumber: string) => rows.push({ risk_level: riskLevel, area, reference, finding, amount, due_date: dateOnly(dueDate), status, document_number: documentNumber });
  projects.forEach(row => {
    const documentNumber = documentList(dataset, "BID_PROJECT", row);
    if (documentNumber === "-") add("높음", "공고문서", row.bid_number, "근거 문서번호가 등록되지 않음", null, row.bid_deadline, "등록 필요", "-");
    if (number(row.estimated_amount) > number(row.budget_available_amount)) add("높음", "예산", row.bid_number, "추정가격이 가용예산을 초과함", number(row.estimated_amount) - number(row.budget_available_amount), row.bid_deadline, "예산 검토", documentNumber);
    if (row.announce_date && row.bid_start_date && dateOnly(row.announce_date) > dateOnly(row.bid_start_date)) add("높음", "공고일정", row.bid_number, "공고일이 입찰개시일보다 늦음", null, row.bid_start_date, "일정 정정", documentNumber);
    if (row.bid_deadline && row.bid_open_date && dateOnly(row.bid_deadline) > dateOnly(row.bid_open_date)) add("높음", "개찰일정", row.bid_number, "입찰마감일이 개찰일보다 늦음", null, row.bid_open_date, "일정 정정", documentNumber);
    const validCount = submissions.filter(item => item.bid_project_id === row.id && item.is_valid !== false).length;
    if (["closed", "evaluation", "awarded"].includes(row.status) && validCount === 0) add("높음", "개찰", row.bid_number, "유효 참여업체가 없음", null, row.bid_open_date, "유찰·재공고 검토", documentNumber);
    if (row.status === "awarded" && !contracts.some(item => item.bid_project_id === row.id)) add("주의", "계약", row.bid_number, "낙찰 후 계약이 체결되지 않음", number(row.contract_amount), row.work_start_date, "계약 추진", documentNumber);
    if (["failed", "cancelled", "rebid"].includes(row.status)) add("주의", "공고상태", row.bid_number, `${bidStatus(row.status)} 사유 및 후속조치 확인`, null, row.bid_deadline, "후속조치", documentNumber);
    if (row.status === "awarded" && !evaluations.some(item => item.bid_project_id === row.id && item.rank === 1 && item.is_qualified !== false)) add("높음", "평가", row.bid_number, "적격 1순위 평가근거가 없음", null, row.bid_open_date, "평가근거 확인", documentNumber);
  });
  submissions.filter(row => row.is_valid === false).forEach(row => add("주의", "참여업체", row.submission_number, `무효 투찰: ${text(row.invalid_reason)}`, number(row.bid_amount), row.submitted_at, "무효근거 확인", documentList(dataset, "BID_PROJECT", projectFor(row, dataset) || {})));
  contracts.forEach(row => {
    const project = projectFor(row, dataset);
    const documentNumber = documentList(dataset, "BID_CONTRACT", row);
    if (documentNumber === "-") add("높음", "계약문서", row.contract_number, "계약 문서번호가 등록되지 않음", number(row.total_amount), row.contract_start, "등록 필요", "-");
    if (!row.signed_at) add("높음", "계약승인", row.contract_number, "계약 서명확정이 완료되지 않음", number(row.total_amount), row.contract_start, "서명 필요", documentNumber);
    if (["active", null, undefined].includes(row.status) && (!row.performance_bond_number || number(row.performance_bond_amount) <= 0)) add("높음", "이행보증", row.contract_number, "계약이행보증이 등록되지 않음", number(row.total_amount), row.contract_start, "보증 등록", documentNumber);
    if (row.performance_bond_end && row.contract_end && dateOnly(row.performance_bond_end) < dateOnly(row.contract_end)) add("높음", "이행보증", row.contract_number, "이행보증기한이 계약완료일보다 빠름", number(row.performance_bond_amount), row.contract_end, "보증 연장", documentNumber);
    if (row.status !== "completed" && row.contract_end && dateOnly(row.contract_end) < options.periodEnd) add("높음", "계약기한", row.contract_number, "계약 완료기한이 경과함", number(row.total_amount), row.contract_end, "이행 확인", documentNumber);
    if (project && number(row.total_amount) > number(project.design_amount || project.estimated_amount)) add("높음", "계약금액", row.contract_number, "계약금액이 설계금액을 초과함", number(row.total_amount) - number(project.design_amount || project.estimated_amount), row.contract_date, "금액 검토", documentNumber);
  });
  documents.filter(row => row.is_current !== false && (!row.document_number || !row.file_path)).forEach(row => add("주의", "문서증빙", row.id, "현재 문서의 문서번호 또는 원문파일이 누락됨", null, row.created_at, "문서 보완", row.document_number || "-"));
  return rows;
}

function filteredDataset(dataset: ProcurementReportDataset, options: ProcurementReportOptions) {
  const active = (row: any) => options.includeArchived || !isArchived(row);
  const projects = dataset.projects.filter(row => active(row) && projectInPeriod(row, options) && matchesLotType(row, dataset, options.lotTypes) && (!options.statuses.length || options.statuses.includes(row.status)));
  const projectIds = new Set(projects.map(row => row.id));
  const submissions = dataset.submissions.filter(row => projectIds.has(row.bid_project_id) && (options.includeInvalidSubmissions || row.is_valid !== false));
  const evaluations = dataset.evaluations.filter(row => projectIds.has(row.bid_project_id));
  const contracts = dataset.contracts.filter(row => active(row) && projectIds.has(row.bid_project_id));
  const contractIds = new Set(contracts.map(row => row.id));
  const documents = dataset.documents.filter(row => active(row) && projectIds.has(row.bid_project_id) && (!row.contract_id || contractIds.has(row.contract_id)) && (options.includeArchived || row.is_current !== false));
  const budgetItemIds = new Set(projects.map(row => row.budget_item_id).filter(Boolean));
  const budgetItems = dataset.budgetItems.filter(row => budgetItemIds.has(row.id));
  return { projects, submissions, evaluations, contracts, documents, budgetItems };
}

function sortRows(rows: any[], sort: ProcurementReportSort) {
  const statusRank: Record<string, number> = { failed: 0, cancelled: 1, rejected: 2, review: 3, announced: 4, bidding: 5, closed: 6, evaluation: 7, awarded: 8, contracted: 9, completed: 10 };
  const rowDate = (row: any) => row.due_date || row.bid_deadline || row.bid_open_date || row.contract_end || row.evaluation_date || row.submitted_at || row.created_at || "";
  const rowAmount = (row: any) => number(row.amount ?? row.total_amount ?? row.award_amount ?? row.bid_amount ?? row.estimated_amount);
  return [...rows].sort((a, b) => {
    if (sort === "date_desc") return String(rowDate(b)).localeCompare(String(rowDate(a)));
    if (sort === "deadline_asc") return String(rowDate(a)).localeCompare(String(rowDate(b)));
    if (sort === "amount_desc") return rowAmount(b) - rowAmount(a);
    if (sort === "status") return (statusRank[a.status] ?? 50) - (statusRank[b.status] ?? 50);
    if (sort === "vendor") return text(a.company_name || a.contractor_name || a.successful_bidder).localeCompare(text(b.company_name || b.contractor_name || b.successful_bidder), "ko", { numeric: true });
    const riskRank: Record<string, number> = { 높음: 0, 주의: 1, 확인: 2 };
    return (riskRank[a.risk_level] ?? (a.deadline_status === "기한초과" ? 0 : a.deadline_status === "임박" ? 1 : statusRank[a.status] ?? 20))
      - (riskRank[b.risk_level] ?? (b.deadline_status === "기한초과" ? 0 : b.deadline_status === "임박" ? 1 : statusRank[b.status] ?? 20))
      || String(rowDate(a)).localeCompare(String(rowDate(b)));
  });
}

const IDENTITY_FIELDS: Record<Exclude<ProcurementReportSectionId, "overview">, string[]> = {
  announcements: ["bid_number", "title"], openings: ["bid_number", "title"], submissions: ["submission_number", "company_name"],
  evaluations: ["bid_number", "company_name"], contracts: ["contract_number", "contractor_name"], bonds: ["contract_number", "contractor_name"],
  deadlines: ["deadline_type", "reference"], documents: ["source_type", "record_number"], risks: ["risk_level", "area", "reference"],
};

function splitFields(id: Exclude<ProcurementReportSectionId, "overview">, fields: ProcurementReportField[], orientation: ProcurementReportOrientation) {
  const maximum = orientation === "portrait" ? 10 : 14;
  if (fields.length <= maximum) return [fields];
  const identity = fields.filter(item => IDENTITY_FIELDS[id].includes(item.key));
  const details = fields.filter(item => !IDENTITY_FIELDS[id].includes(item.key));
  const groups: ProcurementReportField[][] = [];
  const limit = Math.max(1, maximum - identity.length);
  for (let index = 0; index < details.length; index += limit) groups.push([...identity, ...details.slice(index, index + limit)]);
  return groups;
}

export function buildProcurementReportModel(dataset: ProcurementReportDataset, options: ProcurementReportOptions): ProcurementReportModel {
  const { projects, submissions, evaluations, contracts, documents, budgetItems } = filteredDataset(dataset, options);
  const openings = openingRows(dataset, projects, submissions, evaluations, contracts);
  const bonds = bondRows(dataset, contracts);
  const deadlines = deadlineRows(dataset, projects, contracts, options);
  const documentEvidence = documentRows(dataset, projects, contracts, documents);
  const risks = riskRows(dataset, projects, submissions, evaluations, contracts, documents, options);
  const awardRates = openings.map(row => number(row.award_rate)).filter(value => value > 0);
  const awardedAmount = openings.reduce((sum, row) => sum + number(row.award_amount), 0);
  const designAmount = projects.reduce((sum, row) => sum + number(row.design_amount), 0);
  const contractAmount = contracts.reduce((sum, row) => sum + number(row.total_amount), 0);
  const savingsAmount = openings.reduce((sum, row) => sum + number(row.savings_amount), 0);
  const linkedDocuments = unique(documentEvidence.flatMap(row => row.document_number === "-" ? [] : String(row.document_number).split(","))).length;
  const summary: ProcurementReportSummary = {
    parkingLots: new Set(projects.map(row => row.lot_id).filter(Boolean)).size,
    projects: projects.length,
    activeProjects: projects.filter(row => ACTIVE_PROJECT_STATUSES.includes(row.status)).length,
    announcedProjects: projects.filter(row => ["announced", "bidding", "closed", "evaluation"].includes(row.status)).length,
    awardedProjects: projects.filter(row => ["awarded", "contracted"].includes(row.status)).length,
    failedProjects: projects.filter(row => ["failed", "cancelled", "rebid"].includes(row.status)).length,
    estimatedAmount: projects.reduce((sum, row) => sum + number(row.estimated_amount), 0),
    designAmount,
    budgetAvailableAmount: projects.reduce((sum, row) => sum + number(row.budget_available_amount), 0),
    awardedAmount,
    averageAwardRate: awardRates.length ? awardRates.reduce((sum, value) => sum + value, 0) / awardRates.length : 0,
    submissions: submissions.length,
    validSubmissions: submissions.filter(row => row.is_valid !== false).length,
    invalidSubmissions: submissions.filter(row => row.is_valid === false).length,
    contracts: contracts.length,
    activeContracts: contracts.filter(row => !["completed", "terminated"].includes(row.status)).length,
    unsignedContracts: contracts.filter(row => !row.signed_at).length,
    contractAmount,
    savingsAmount,
    bondsRequired: contracts.length,
    bondsRegistered: bonds.filter(row => row.bond_status === "등록").length,
    missingBonds: bonds.filter(row => row.bond_status !== "등록").length,
    overdueDeadlines: deadlines.filter(row => row.deadline_status === "기한초과").length,
    upcomingDeadlines: deadlines.filter(row => row.deadline_status === "임박").length,
    currentDocuments: documents.filter(row => row.is_current !== false).length,
    linkedDocuments,
    missingDocuments: documentEvidence.filter(row => row.document_number === "-" || !row.has_file && row.source_type === "입찰첨부").length,
    riskCount: risks.length,
  };
  const rowsBySection: Record<Exclude<ProcurementReportSectionId, "overview">, any[]> = { announcements: projects, openings, submissions, evaluations, contracts, bonds, deadlines, documents: documentEvidence, risks };
  const tables = options.selectedSections.filter((id): id is Exclude<ProcurementReportSectionId, "overview"> => id !== "overview").flatMap(id => {
    const section = PROCUREMENT_REPORT_SECTIONS.find(item => item.id === id)!;
    const requested = options.selectedFields[id] || section.defaultFields;
    const fields = section.fields.filter(item => requested.includes(item.key));
    const groups = splitFields(id, fields, options.orientation);
    const sourceRows = sortRows(rowsBySection[id], options.sort);
    return groups.map((group, groupIndex) => ({
      id,
      title: section.label,
      subtitle: groups.length > 1 ? `${section.label} 세부정보 ${groupIndex + 1}` : undefined,
      subtitleNumber: groups.length > 1 ? groupIndex + 1 : undefined,
      continuation: groupIndex > 0,
      columns: group.map(item => ({ key: item.key, label: item.label })),
      rows: sourceRows.map(row => Object.fromEntries(group.map(item => [item.key, text(item.value(row, dataset))]))),
    } as OperationsReportTable));
  });
  const selectedFields = options.selectedSections.flatMap(id => {
    const section = PROCUREMENT_REPORT_SECTIONS.find(item => item.id === id)!;
    return section.fields.filter(item => (options.selectedFields[id] || section.defaultFields).includes(item.key));
  });
  const riskNarrative = [
    summary.overdueDeadlines ? `기한초과 ${summary.overdueDeadlines}건` : "기한초과 없음",
    summary.unsignedContracts ? `서명 미확정 계약 ${summary.unsignedContracts}건` : "서명 미확정 계약 없음",
    summary.missingBonds ? `이행보증 미등록 ${summary.missingBonds}건` : "이행보증 미등록 없음",
    summary.missingDocuments ? `문서·원문 누락 ${summary.missingDocuments}건` : "문서·원문 누락 없음",
    summary.failedProjects ? `유찰·취소·재공고 ${summary.failedProjects}건` : "유찰·취소·재공고 없음",
  ].join("; ");
  return {
    period: { start: options.periodStart, end: options.periodEnd },
    lotTypeLabels: PROCUREMENT_LOT_TYPE_OPTIONS.filter(item => options.lotTypes.includes(item.value)).map(item => item.label),
    summary,
    sourceCounts: { lots: summary.parkingLots, projects: projects.length, submissions: submissions.length, evaluations: evaluations.length, contracts: contracts.length, bonds: bonds.length, deadlines: deadlines.length, documents: documentEvidence.length, budgetItems: budgetItems.length, risks: risks.length },
    tables,
    selectedFieldCount: selectedFields.length,
    protectedFieldCount: selectedFields.filter(item => item.protected).length,
    riskNarrative,
    evidenceMetadata: {
      complete: true,
      queryLimit: QUERY_LIMIT,
      generatedAt: new Date().toISOString(),
      sourceTables: ["parking_lots", "bid_projects", "bid_submissions", "bid_evaluations", "bid_contracts", "bid_documents", "budget_items", "profiles", "attachments", "official_documents"],
      filters: { periodStart: options.periodStart, periodEnd: options.periodEnd, lotTypes: [...options.lotTypes], statuses: [...options.statuses], includeArchived: options.includeArchived },
    },
  };
}

export function procurementReportBriefRows(model: ProcurementReportModel, documentSummary?: string): string[][] {
  return [
    ["담당부서", PRIMARY_DEPARTMENT],
    ["보고기간", `${model.period.start} ~ ${model.period.end}`],
    ["보고대상", `${model.lotTypeLabels.join("·") || "전체 주차장"} 입찰·계약 업무`],
    ["주요내용", "공고·개찰·업체평가·계약·보증·기한·문서번호 및 예산·낙찰률"],
    ["작성목적", documentSummary || "공공조달 절차의 진행상태와 재정·계약 리스크를 확인하고 후속조치의 책임과 근거를 명확히 하기 위함."],
    ["산출기준", `보고기간과 주차장 형태 조건에 해당하는 입찰 ${model.summary.projects}건을 기준으로 원천자료를 완전 조회함. ${model.riskNarrative}`],
  ];
}

export function procurementReportSummaryRows(model: ProcurementReportModel): string[][] {
  return [
    ["입찰사업", `${model.summary.projects.toLocaleString("ko-KR")}건`, "진행사업", `${model.summary.activeProjects.toLocaleString("ko-KR")}건`],
    ["추정가격", won(model.summary.estimatedAmount), "설계금액", won(model.summary.designAmount)],
    ["가용예산", won(model.summary.budgetAvailableAmount), "낙찰·계약금액", won(model.summary.awardedAmount)],
    ["평균 낙찰률", percent(model.summary.averageAwardRate), "절감액", won(model.summary.savingsAmount)],
    ["참여업체", `${model.summary.submissions.toLocaleString("ko-KR")}개사`, "무효업체", `${model.summary.invalidSubmissions.toLocaleString("ko-KR")}개사`],
    ["계약", `${model.summary.contracts.toLocaleString("ko-KR")}건`, "서명 미확정", `${model.summary.unsignedContracts.toLocaleString("ko-KR")}건`],
    ["이행보증 등록", `${model.summary.bondsRegistered.toLocaleString("ko-KR")}건`, "이행보증 미등록", `${model.summary.missingBonds.toLocaleString("ko-KR")}건`],
    ["기한초과", `${model.summary.overdueDeadlines.toLocaleString("ko-KR")}건`, "30일 이내", `${model.summary.upcomingDeadlines.toLocaleString("ko-KR")}건`],
    ["연계 문서번호", `${model.summary.linkedDocuments.toLocaleString("ko-KR")}건`, "리스크", `${model.summary.riskCount.toLocaleString("ko-KR")}건`],
  ];
}

export function toOperationsCompatibleProcurementModel(model: ProcurementReportModel): OperationsReportModel {
  return {
    period: model.period,
    lotTypeLabels: model.lotTypeLabels,
    summary: { parkingLots: model.summary.parkingLots, totalSpaces: 0, activeContracts: model.summary.activeContracts, activeStaff: 0, activePasses: 0, enforcementCount: 0, totalFine: 0, unpaidFine: 0, openAbandoned: 0, openSecurity: 0 },
    sourceCounts: model.sourceCounts,
    tables: model.tables,
    selectedFieldCount: model.selectedFieldCount,
    sensitiveFieldCount: model.protectedFieldCount,
  };
}

export function assertCompleteProcurementResult(label: string, result: { data?: unknown[] | null; error?: { message: string } | null; count?: number | null }, limit = QUERY_LIMIT) {
  if (result.error) throw new Error(`${label} 자료 조회에 실패했습니다: ${result.error.message}`);
  const rows = result.data || [];
  if (typeof result.count === "number" && (result.count > limit || result.count > rows.length)) {
    throw new Error(`${label} 자료 ${result.count}건 중 ${rows.length}건만 조회되어 보고서 생성을 중단했습니다.`);
  }
  return rows;
}

async function checkedQuery(label: string, promise: PromiseLike<any>, limit = QUERY_LIMIT) {
  return assertCompleteProcurementResult(label, await promise, limit) as any[];
}

function chunks<T>(values: T[], size = ID_CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function collectByProject(table: "bid_submissions" | "bid_evaluations" | "bid_contracts" | "bid_documents", label: string, projectIds: string[]) {
  const rows: any[] = [];
  for (const ids of chunks(projectIds)) {
    const found = await checkedQuery(label, (supabase as any).from(table).select("*", { count: "exact" }).in("bid_project_id", ids).limit(QUERY_LIMIT));
    rows.push(...found);
    if (rows.length > QUERY_LIMIT) throw new Error(`${label} 자료가 ${QUERY_LIMIT}건을 초과하여 보고서 생성을 중단했습니다.`);
  }
  return rows;
}

async function collectByIds(table: "budget_items" | "profiles", label: string, ids: string[]) {
  const rows: any[] = [];
  for (const idChunk of chunks(unique(ids))) {
    const found = await checkedQuery(label, (supabase as any).from(table).select("*", { count: "exact" }).in("id", idChunk).limit(QUERY_LIMIT));
    rows.push(...found);
    if (rows.length > QUERY_LIMIT) throw new Error(`${label} 자료가 ${QUERY_LIMIT}건을 초과하여 보고서 생성을 중단했습니다.`);
  }
  return rows;
}

async function collectOfficialDocumentNumbers(references: Array<{ module: string; id: string }>) {
  const links: any[] = [];
  for (const module of DOCUMENT_MODULES) {
    const ids = unique(references.filter(reference => reference.module === module).map(reference => reference.id));
    for (const idChunk of chunks(ids)) {
      const found = await checkedQuery(`${module} 공식문서 첨부`, supabase.from("attachments").select("module, ref_id, file_path", { count: "exact" }).eq("ref_type", "official_document_link").eq("module", module).in("ref_id", idChunk).limit(QUERY_LIMIT));
      links.push(...found);
      if (links.length > QUERY_LIMIT) throw new Error(`공식문서 첨부가 ${QUERY_LIMIT}건을 초과하여 보고서 생성을 중단했습니다.`);
    }
  }
  const documentIds = unique(links.map(link => String(link.file_path || "").replace("parkmaster-document://", "")));
  const documents: any[] = [];
  for (const idChunk of chunks(documentIds)) {
    const found = await checkedQuery("공식문서대장", supabase.from("official_documents").select("id, document_number", { count: "exact" }).in("id", idChunk).limit(QUERY_LIMIT));
    documents.push(...found);
    if (documents.length > QUERY_LIMIT) throw new Error(`공식문서가 ${QUERY_LIMIT}건을 초과하여 보고서 생성을 중단했습니다.`);
  }
  const numberById = new Map(documents.map(document => [document.id, document.document_number]));
  return links.reduce<Record<string, string[]>>((result, link) => {
    const id = String(link.file_path || "").replace("parkmaster-document://", "");
    const documentNumber = numberById.get(id);
    if (!documentNumber) return result;
    const key = documentKey(link.module, link.ref_id);
    result[key] = unique([...(result[key] || []), documentNumber]);
    return result;
  }, {});
}

export async function collectProcurementReportData(options: ProcurementReportOptions): Promise<ProcurementReportDataset> {
  const [parkingLots, projectRows] = await Promise.all([
    checkedQuery("주차장", supabase.from("parking_lots").select("id, code, name, lot_type, status", { count: "exact" }).limit(QUERY_LIMIT)),
    checkedQuery("입찰사업", supabase.from("bid_projects").select("*", { count: "exact" }).limit(QUERY_LIMIT)),
  ]);
  const provisional: ProcurementReportDataset = { parkingLots, projects: projectRows, submissions: [], evaluations: [], contracts: [], documents: [], budgetItems: [], profiles: [], documentNumbers: {} };
  const active = (row: any) => options.includeArchived || !isArchived(row);
  const projects = projectRows.filter(row => active(row) && projectInPeriod(row, options) && matchesLotType(row, provisional, options.lotTypes) && (!options.statuses.length || options.statuses.includes(row.status)));
  const projectIds = projects.map(row => row.id);
  const [submissions, evaluations, contracts, documents] = projectIds.length ? await Promise.all([
    collectByProject("bid_submissions", "참여업체", projectIds),
    collectByProject("bid_evaluations", "평가결과", projectIds),
    collectByProject("bid_contracts", "계약", projectIds),
    collectByProject("bid_documents", "입찰문서", projectIds),
  ]) : [[], [], [], []];
  const budgetItems = await collectByIds("budget_items", "예산항목", projects.map(row => row.budget_item_id).filter(Boolean));
  const profileIds = unique([
    ...projects.flatMap(row => [row.assigned_to, row.created_by, row.submitted_by, row.approved_by]),
    ...evaluations.map(row => row.evaluator_id),
    ...contracts.flatMap(row => [row.created_by, row.signed_by]),
  ]);
  const profiles = await collectByIds("profiles", "담당자", profileIds);
  const references = [
    ...projects.map(row => ({ module: "BID_PROJECT", id: row.id })),
    ...contracts.map(row => ({ module: "BID_CONTRACT", id: row.id })),
    ...documents.map(row => ({ module: "BID_DOCUMENT", id: row.id })),
  ];
  const documentNumbers = await collectOfficialDocumentNumbers(references);
  return { parkingLots, projects, submissions, evaluations, contracts, documents, budgetItems, profiles, documentNumbers };
}

export async function getProcurementReportEvidence(parameters: Record<string, string>) {
  const options = parseProcurementReportOptions(parameters);
  const dataset = await collectProcurementReportData(options);
  const model = buildProcurementReportModel(dataset, options);
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

export const PROCUREMENT_REPORT_SAMPLE_DATASET: ProcurementReportDataset = {
  parkingLots: [
    { id: "lot-1", code: "JJP-001", name: "공항입구", lot_type: "offstreet" },
    { id: "lot-2", code: "JJP-002", name: "칠성골", lot_type: "multilevel" },
  ],
  projects: [
    { id: "project-1", bid_number: "JJC-BID-2026-3001", document_number: "제주시청-차량관리과운영팀-2026-0401", title: "공항입구 주차관제장비 교체", lot_id: "lot-1", lot_type_at_event: "offstreet", bid_type: "open", contract_type: "goods", evaluation_method: "lowest_price", status: "contracted", nara_ref: "20260800123-00", announce_date: "2026-07-20", bid_start_date: "2026-08-01", bid_deadline: "2026-08-10", bid_open_date: "2026-08-11", bid_open_location: "나라장터", budget_item_id: "budget-1", budget_available_amount: 150000000, estimated_amount: 120000000, design_amount: 132000000, lowest_price_rate: 87.745, contract_amount: 110000000, successful_bidder: "제주주차시스템", savings_rate: 16.67, work_start_date: "2026-08-20", work_end_date: "2026-10-31", assigned_to: "profile-1", created_at: "2026-07-15", parking_lots: { id: "lot-1", name: "공항입구", lot_type: "offstreet" } },
    { id: "project-2", bid_number: "JJC-BID-2026-3002", title: "칠성골 주차빌딩 소방시설 보강", lot_id: "lot-2", lot_type_at_event: "multilevel", bid_type: "limited", contract_type: "construction", evaluation_method: "qualification", status: "bidding", announce_date: "2026-08-05", bid_start_date: "2026-08-08", bid_deadline: "2026-08-25", bid_open_date: "2026-08-26", budget_item_id: "budget-2", budget_available_amount: 70000000, estimated_amount: 80000000, design_amount: 85000000, assigned_to: "profile-2", created_at: "2026-08-01", parking_lots: { id: "lot-2", name: "칠성골", lot_type: "multilevel" } },
    { id: "project-3", bid_number: "JJC-BID-2026-3003", document_number: "제주시청-차량관리과운영팀-2026-0403", title: "공항입구 정기점검 용역", lot_id: "lot-1", lot_type_at_event: "offstreet", bid_type: "open", contract_type: "service", evaluation_method: "technical", status: "awarded", announce_date: "2026-07-25", bid_start_date: "2026-08-01", bid_deadline: "2026-08-12", bid_open_date: "2026-08-13", budget_item_id: "budget-1", budget_available_amount: 50000000, estimated_amount: 40000000, design_amount: 44000000, work_start_date: "2026-08-20", assigned_to: "profile-1", created_at: "2026-07-20", parking_lots: { id: "lot-1", name: "공항입구", lot_type: "offstreet" } },
  ],
  submissions: [
    { id: "sub-1", bid_project_id: "project-1", submission_number: "JJC-SUB-2026-3001", company_name: "제주주차시스템", business_number: "616-00-00001", representative: "김대표", contact_person: "박담당", contact_phone: "064-700-0001", contact_email: "bid@example.kr", bid_amount: 110000000, bid_rate: 83.33, submitted_at: "2026-08-09", is_valid: true },
    { id: "sub-2", bid_project_id: "project-1", submission_number: "JJC-SUB-2026-3002", company_name: "한라정보기술", bid_amount: 115000000, bid_rate: 87.12, submitted_at: "2026-08-09", is_valid: false, invalid_reason: "필수 증빙서류 누락" },
    { id: "sub-3", bid_project_id: "project-3", submission_number: "JJC-SUB-2026-3003", company_name: "제주안전관리", bid_amount: 39000000, bid_rate: 88.64, submitted_at: "2026-08-11", is_valid: true },
  ],
  evaluations: [
    { id: "eval-1", bid_project_id: "project-1", submission_id: "sub-1", evaluator_name: "운영팀장", evaluation_date: "2026-08-11", price_score: 30, technical_score: 45, business_score: 18, performance_score: 0, total_score: 93, rank: 1, is_qualified: true },
    { id: "eval-2", bid_project_id: "project-3", submission_id: "sub-3", evaluator_name: "운영팀장", evaluation_date: "2026-08-13", price_score: 28, technical_score: 47, business_score: 19, performance_score: 0, total_score: 94, rank: 1, is_qualified: true },
  ],
  contracts: [
    { id: "contract-1", bid_project_id: "project-1", submission_id: "sub-1", contract_number: "JJC-CON-2026-3001", document_number: "제주시청-차량관리과운영팀-2026-0501", contractor_name: "제주주차시스템", contractor_business_number: "616-00-00001", contractor_contact_person: "박담당", contractor_phone: "064-700-0001", contract_amount: 100000000, vat_amount: 10000000, total_amount: 110000000, contract_date: "2026-08-15", contract_start: "2026-08-20", contract_end: "2026-10-31", status: "active", signed_at: "2026-08-16", performance_bond_number: "SGI-2026-1001", performance_bond_company: "서울보증보험", performance_bond_rate: 10, performance_bond_amount: 11000000, performance_bond_end: "2026-11-30", advance_payment_amount: 22000000, advance_bond_amount: 22000000, defect_bond_rate: 3, defect_bond_amount: 3300000, warranty_end: "2027-10-31", created_at: "2026-08-15" },
  ],
  documents: [
    { id: "doc-1", bid_project_id: "project-1", contract_id: null, document_number: "제주시청-차량관리과운영팀-2026-0401", doc_category: "bid", doc_type: "announcement", title: "입찰공고문", version: "1.0", is_current: true, file_path: "procurement/project-1/announcement.pdf", created_at: "2026-07-20" },
    { id: "doc-2", bid_project_id: "project-1", contract_id: "contract-1", document_number: "제주시청-차량관리과운영팀-2026-0501", doc_category: "bond", doc_type: "performance_bond", title: "계약이행보증증권", version: "1.0", is_current: true, file_path: "procurement/project-1/bond.pdf", created_at: "2026-08-16" },
    { id: "doc-3", bid_project_id: "project-2", contract_id: null, document_number: null, doc_category: "bid", doc_type: "announcement", title: "소방시설 보강 공고문", version: "1.0", is_current: true, file_path: "", created_at: "2026-08-05" },
  ],
  budgetItems: [
    { id: "budget-1", item_code: "E-2026-01", item_name: "주차관제장비 교체", allocated_amount: 150000000, executed_amount: 0, returned_amount: 0 },
    { id: "budget-2", item_code: "E-2026-02", item_name: "소방시설 보강", allocated_amount: 70000000, executed_amount: 0, returned_amount: 0 },
  ],
  profiles: [{ id: "profile-1", name: "운영팀 주무관" }, { id: "profile-2", name: "시설팀 주무관" }],
  documentNumbers: {
    "BID_PROJECT:project-1": ["제주시청-차량관리과운영팀-2026-0401"],
    "BID_CONTRACT:contract-1": ["제주시청-차량관리과운영팀-2026-0501"],
    "BID_DOCUMENT:doc-2": ["제주시청-차량관리과운영팀-2026-0501"],
  },
};
