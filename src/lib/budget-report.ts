import { PRIMARY_DEPARTMENT } from "@/config/organization";
import { supabase } from "@/integrations/supabase/client";
import {
  BUDGET_STATUS_LABELS,
  BUDGET_TYPE_LABELS,
  EXECUTION_TYPE_LABELS,
  PLAN_TYPE_LABELS,
  TRANSFER_TYPE_LABELS,
} from "@/types/budget";
import type {
  OperationsReportModel,
  OperationsReportOrientation,
  OperationsReportTable,
} from "@/lib/operations-report";

export type BudgetReportSectionId = "overview" | "plans" | "items" | "executions" | "transfers" | "risks" | "documents";
export type BudgetReportSort = "attention" | "date_desc" | "amount_desc" | "status" | "category";
export type BudgetReportOrientation = OperationsReportOrientation;

export interface BudgetReportField {
  key: string;
  label: string;
  protected?: boolean;
  value: (row: any, dataset: BudgetReportDataset) => unknown;
}

export interface BudgetReportSection {
  id: BudgetReportSectionId;
  label: string;
  description: string;
  fields: BudgetReportField[];
  defaultFields: string[];
}

export interface BudgetReportOptions {
  periodStart: string;
  periodEnd: string;
  fiscalYears: number[];
  selectedSections: BudgetReportSectionId[];
  selectedFields: Partial<Record<BudgetReportSectionId, string[]>>;
  lotTypes: string[];
  sort: BudgetReportSort;
  orientation: BudgetReportOrientation;
  includeArchived: boolean;
  includeSummaryItems: boolean;
}

export interface BudgetReportDataset {
  parkingLots: any[];
  plans: any[];
  items: any[];
  executions: any[];
  transfers: any[];
  documentNumbers: Record<string, string[]>;
}

export interface BudgetReportSummary extends Record<string, number> {
  parkingLots: number;
  plans: number;
  approvedPlans: number;
  pendingPlans: number;
  plannedRevenue: number;
  plannedExpenditure: number;
  allocatedExpenditure: number;
  executedExpenditure: number;
  returnedExpenditure: number;
  remainingExpenditure: number;
  executionRate: number;
  executionRows: number;
  executedRows: number;
  executedRecordAmount: number;
  pendingExecutionRows: number;
  pendingExecutionAmount: number;
  transfers: number;
  approvedTransfers: number;
  approvedTransferAmount: number;
  pendingTransfers: number;
  pendingTransferAmount: number;
  riskCount: number;
  overrunItems: number;
  linkedDocuments: number;
  missingDocuments: number;
}

export interface BudgetReportModel {
  period: { start: string; end: string };
  fiscalYears: number[];
  lotTypeLabels: string[];
  summary: BudgetReportSummary;
  sourceCounts: Record<string, number>;
  tables: OperationsReportTable[];
  selectedFieldCount: number;
  protectedFieldCount: number;
  riskNarrative: string;
}

const LOT_TYPE_ALIASES: Record<string, string[]> = {
  offstreet: ["offstreet", "surface"],
  building: ["building", "parking_building", "multilevel", "mechanical"],
  onstreet: ["onstreet"],
};

const LOT_TYPE_LABELS: Record<string, string> = {
  offstreet: "노외주차장", surface: "노외주차장",
  building: "주차빌딩", parking_building: "주차빌딩", multilevel: "주차빌딩", mechanical: "주차빌딩",
  onstreet: "노상주차장",
};

export const BUDGET_LOT_TYPE_OPTIONS = [
  { value: "offstreet", label: "노외주차장" },
  { value: "building", label: "주차빌딩" },
  { value: "onstreet", label: "노상주차장" },
];

const relation = (row: any, key: string) => Array.isArray(row?.[key]) ? row[key][0] : row?.[key];
const number = (value: unknown) => Number(value || 0);
const text = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);
const dateOnly = (value: unknown) => value ? String(value).split("T")[0] : "-";
const won = (value: unknown) => `${number(value).toLocaleString("ko-KR")}원`;
const percent = (value: unknown) => `${number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
const yesNo = (value: unknown) => value ? "예" : "아니오";
const unique = (values: unknown[]) => [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
const isArchived = (row: any) => Boolean(row?.archived_at);
const lot = (row: any) => relation(row, "parking_lots");
const lotName = (row: any) => lot(row)?.name || row?.parking_lot_name || "공통예산";
const lotType = (row: any) => row?.lot_type_at_event || lot(row)?.lot_type || row?.lot_type || "";
const itemLabel = (row: any) => `${row?.item_code || ""} ${row?.item_name || ""}`.trim() || "-";
const statusLabel = (status: unknown) => BUDGET_STATUS_LABELS[String(status || "")] || text(status);
const documentKey = (module: string, id: string) => `${module}:${id}`;

function relatedPlan(row: any, dataset: BudgetReportDataset) {
  return relation(row, "budget_plans") || dataset.plans.find(plan => plan.id === row.plan_id);
}

function relatedItem(row: any, dataset: BudgetReportDataset) {
  return relation(row, "budget_items") || dataset.items.find(item => item.id === row.item_id);
}

function transferItem(row: any, dataset: BudgetReportDataset, direction: "from" | "to") {
  return relation(row, `${direction}_item`) || relation(row, `${direction}_budget_item`) || dataset.items.find(item => item.id === row[`${direction}_item_id`]);
}

function itemRemaining(row: any) {
  if (row.remaining_amount !== null && row.remaining_amount !== undefined) return number(row.remaining_amount);
  return number(row.allocated_amount) - number(row.executed_amount) - number(row.returned_amount);
}

function itemExecutionRate(row: any) {
  if (row.execution_rate !== null && row.execution_rate !== undefined) return number(row.execution_rate);
  return number(row.allocated_amount) ? number(row.executed_amount) / number(row.allocated_amount) * 100 : 0;
}

function rowDocuments(dataset: BudgetReportDataset, module: string, row: any) {
  return unique([
    row.document_number,
    ...(dataset.documentNumbers[documentKey(module, row.id)] || []),
  ]);
}

const documentList = (dataset: BudgetReportDataset, module: string, row: any) => rowDocuments(dataset, module, row).join(", ") || "-";
const field = (key: string, label: string, value: BudgetReportField["value"], protectedField = false): BudgetReportField => ({ key, label, value, protected: protectedField });

export const BUDGET_REPORT_SECTIONS: BudgetReportSection[] = [
  { id: "overview", label: "예산관리 현황", description: "편성·배정·집행·잔액·승인 핵심지표", fields: [], defaultFields: [] },
  {
    id: "plans", label: "예산편성", description: "회계연도별 본예산·추경 편성안과 승인상태",
    fields: [
      field("fiscal_year", "회계연도", row => `${row.fiscal_year}년`), field("plan_type", "편성구분", row => PLAN_TYPE_LABELS[row.plan_type] || row.plan_type),
      field("plan_number", "차수", row => `제${number(row.plan_number)}차`), field("title", "편성안", row => row.title),
      field("total_revenue", "세입 편성액", row => won(row.total_revenue)), field("total_expenditure", "세출 편성액", row => won(row.total_expenditure)),
      field("balance", "수지차", row => won(row.balance ?? number(row.total_revenue) - number(row.total_expenditure))),
      field("status", "승인상태", row => statusLabel(row.status)), field("submitted_at", "제출일", row => dateOnly(row.submitted_at)),
      field("approved_at", "승인일", row => dateOnly(row.approved_at)), field("document_number", "근거 문서번호", (row, dataset) => documentList(dataset, "BUDGET_PLAN", row)),
      field("author_name", "작성자", row => row.author_name, true), field("approved_by", "승인자", row => row.approved_by_name || row.approved_by, true),
    ],
    defaultFields: ["fiscal_year", "plan_type", "plan_number", "title", "total_revenue", "total_expenditure", "balance", "status", "submitted_at", "approved_at", "document_number"],
  },
  {
    id: "items", label: "예산항목", description: "세입·세출 항목별 편성·배정·집행·반납·잔액·집행률",
    fields: [
      field("item_code", "항목코드", row => row.item_code), field("budget_type", "세입·세출", row => BUDGET_TYPE_LABELS[row.budget_type] || row.budget_type),
      field("category", "예산분류", row => [row.category_l1, row.category_l2, row.category_l3, row.category_l4].filter(Boolean).join(" > ")),
      field("item_name", "예산항목", row => row.item_name), field("lot", "대상 주차장", row => lotName(row)),
      field("lot_type", "주차장 형태", row => LOT_TYPE_LABELS[lotType(row)] || lotType(row) || "공통"),
      field("previous_year_amount", "전년도액", row => won(row.previous_year_amount)), field("requested_amount", "요구액", row => won(row.requested_amount)),
      field("planned_amount", "편성액", row => won(row.planned_amount)), field("allocated_amount", "배정액", row => won(row.allocated_amount)),
      field("executed_amount", "집행액", row => won(row.executed_amount)), field("returned_amount", "반납액", row => won(row.returned_amount)),
      field("remaining_amount", "잔액", row => won(itemRemaining(row))), field("execution_rate", "집행률", row => percent(itemExecutionRate(row))),
      field("is_mandatory", "의무지출", row => yesNo(row.is_mandatory)), field("is_recurring", "반복사업", row => yesNo(row.is_recurring)),
      field("document_number", "근거 문서번호", (row, dataset) => documentList(dataset, "BUDGET_ITEM", row)),
      field("responsible_person", "담당자", row => row.responsible_person_name || row.responsible_person, true),
    ],
    defaultFields: ["item_code", "budget_type", "category", "item_name", "lot", "lot_type", "previous_year_amount", "requested_amount", "planned_amount", "allocated_amount", "executed_amount", "returned_amount", "remaining_amount", "execution_rate", "document_number"],
  },
  {
    id: "executions", label: "예산집행", description: "집행원장별 금액·승인상태·지출근거",
    fields: [
      field("execution_number", "집행번호", row => row.execution_number), field("execution_date", "집행일", row => dateOnly(row.execution_date)),
      field("execution_type", "집행구분", row => EXECUTION_TYPE_LABELS[row.execution_type] || row.execution_type),
      field("item", "예산항목", (row, dataset) => itemLabel(relatedItem(row, dataset))), field("lot", "대상 주차장", row => lotName(row)),
      field("amount", "집행금액", row => won(row.amount)), field("description", "집행내용", row => row.description), field("vendor_name", "지급처", row => row.vendor_name),
      field("status", "승인상태", row => statusLabel(row.status)), field("approved_at", "승인일", row => dateOnly(row.approved_at)),
      field("document_number", "지출근거 문서번호", (row, dataset) => documentList(dataset, "BUDGET_EXECUTION", row)),
      field("reference_number", "연계 업무번호", row => row.reference_number), field("reject_reason", "반려사유", row => row.reject_reason),
      field("vendor_business_number", "사업자번호", row => row.vendor_business_number, true), field("bank_account", "계좌번호", row => row.bank_account, true),
    ],
    defaultFields: ["execution_number", "execution_date", "execution_type", "item", "lot", "amount", "description", "vendor_name", "status", "approved_at", "document_number", "reference_number", "reject_reason"],
  },
  {
    id: "transfers", label: "전용·이체", description: "예산 전용·이용·이체·예비비·이월 승인 현황",
    fields: [
      field("transfer_number", "이동번호", row => row.transfer_number), field("fiscal_year", "회계연도", row => `${row.fiscal_year}년`),
      field("transfer_type", "이동구분", row => TRANSFER_TYPE_LABELS[row.transfer_type] || row.transfer_type),
      field("from_item", "출발 항목", (row, dataset) => itemLabel(transferItem(row, dataset, "from"))),
      field("to_item", "도착 항목", (row, dataset) => itemLabel(transferItem(row, dataset, "to"))),
      field("amount", "이동금액", row => won(row.amount)), field("reason", "이동사유", row => row.reason), field("legal_basis", "법적근거", row => row.legal_basis),
      field("status", "승인상태", row => statusLabel(row.status)), field("approved_at", "승인일", row => dateOnly(row.approved_at)),
      field("approval_number", "승인번호", row => row.approval_number), field("document_number", "근거 문서번호", (row, dataset) => documentList(dataset, "BUDGET_TRANSFER", row)),
      field("reject_reason", "반려사유", row => row.reject_reason), field("approved_by", "승인자", row => row.approved_by_name || row.approved_by, true),
    ],
    defaultFields: ["transfer_number", "fiscal_year", "transfer_type", "from_item", "to_item", "amount", "reason", "legal_basis", "status", "approved_at", "approval_number", "document_number", "reject_reason"],
  },
  {
    id: "risks", label: "위험·조치사항", description: "미승인·집행초과·집행부진·문서누락·원장불일치",
    fields: [
      field("risk_level", "위험도", row => row.risk_level), field("area", "구분", row => row.area), field("reference", "대상번호", row => row.reference),
      field("finding", "확인사항", row => row.finding), field("amount", "관련금액", row => row.amount === null ? "-" : won(row.amount)),
      field("status", "처리상태", row => row.status), field("document_number", "문서번호", row => row.document_number),
    ],
    defaultFields: ["risk_level", "area", "reference", "finding", "amount", "status", "document_number"],
  },
  {
    id: "documents", label: "문서번호 연계", description: "편성·항목·집행·전용이체별 근거 문서번호",
    fields: [
      field("source_type", "업무구분", row => row.source_type), field("record_number", "업무번호", row => row.record_number),
      field("title", "문서대상", row => row.title), field("document_number", "문서번호", row => row.document_number),
      field("approval_number", "승인번호", row => row.approval_number), field("status", "승인상태", row => row.status), field("record_date", "기준일", row => row.record_date),
    ],
    defaultFields: ["source_type", "record_number", "title", "document_number", "approval_number", "status", "record_date"],
  },
];

export const BUDGET_REPORT_PRESETS = {
  summary: { label: "간부 요약", sections: ["overview", "plans", "items", "risks"] as BudgetReportSectionId[] },
  standard: { label: "실무 종합", sections: BUDGET_REPORT_SECTIONS.map(section => section.id) },
  audit: { label: "감사 대응", sections: ["overview", "plans", "items", "executions", "transfers", "risks", "documents"] as BudgetReportSectionId[] },
};

export function defaultBudgetReportFields(): Partial<Record<BudgetReportSectionId, string[]>> {
  return Object.fromEntries(BUDGET_REPORT_SECTIONS.map(section => [section.id, [...section.defaultFields]]));
}

export function parseBudgetReportOptions(parameters: Record<string, string>): BudgetReportOptions {
  const knownSections = new Set(BUDGET_REPORT_SECTIONS.map(section => section.id));
  const selectedSections = (parameters.budget_sections || BUDGET_REPORT_PRESETS.summary.sections.join(","))
    .split(",").filter((id): id is BudgetReportSectionId => knownSections.has(id as BudgetReportSectionId));
  let selectedFields = defaultBudgetReportFields();
  try {
    const parsed = JSON.parse(parameters.budget_fields || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) selectedFields = { ...selectedFields, ...parsed };
  } catch {
    selectedFields = defaultBudgetReportFields();
  }
  const periodStart = parameters.period_start;
  const periodEnd = parameters.period_end || periodStart;
  const derivedYear = Number(String(periodStart || new Date().getFullYear()).slice(0, 4));
  const fiscalYears = unique((parameters.budget_fiscal_years || String(derivedYear)).split(","))
    .map(value => Number(value)).filter(value => Number.isInteger(value) && value >= 2000 && value <= 2200);
  return {
    periodStart,
    periodEnd,
    fiscalYears: fiscalYears.length ? fiscalYears : [derivedYear],
    selectedSections: selectedSections.length ? selectedSections : ["overview"],
    selectedFields,
    lotTypes: (parameters.budget_lot_types || "offstreet,building,onstreet").split(",").filter(Boolean),
    sort: (["attention", "date_desc", "amount_desc", "status", "category"].includes(parameters.budget_sort) ? parameters.budget_sort : "attention") as BudgetReportSort,
    orientation: parameters.budget_orientation === "landscape" ? "landscape" : "portrait",
    includeArchived: parameters.budget_include_archived === "true",
    includeSummaryItems: parameters.budget_include_summary_items === "true",
  };
}

function matchesLotType(row: any, selected: string[]) {
  const actual = lotType(row);
  if (!actual || !selected.length || selected.length === BUDGET_LOT_TYPE_OPTIONS.length) return true;
  return selected.some(group => (LOT_TYPE_ALIASES[group] || [group]).includes(actual));
}

function inPeriod(value: unknown, options: BudgetReportOptions) {
  const date = dateOnly(value);
  return date !== "-" && date >= options.periodStart && date <= options.periodEnd;
}

function planYear(row: any, dataset: BudgetReportDataset) {
  return number(row.fiscal_year || relatedPlan(row, dataset)?.fiscal_year || String(row.execution_date || "").slice(0, 4));
}

function inFiscalYears(row: any, dataset: BudgetReportDataset, options: BudgetReportOptions) {
  return options.fiscalYears.includes(planYear(row, dataset));
}

const BUDGET_QUERY_LIMIT = 5000;
const DOCUMENT_ID_CHUNK_SIZE = 200;
const BUDGET_DOCUMENT_MODULES = ["BUDGET_PLAN", "BUDGET_ITEM", "BUDGET_EXECUTION", "BUDGET_TRANSFER"] as const;

async function checkedBudgetQuery(label: string, promise: PromiseLike<any>, limit = BUDGET_QUERY_LIMIT) {
  const result = await promise;
  if (result.error) throw new Error(`${label} 자료 조회에 실패했습니다: ${result.error.message}`);
  const rows = result.data || [];
  if (typeof result.count === "number" && (result.count > limit || result.count > rows.length)) {
    throw new Error(`${label} 자료 ${result.count}건 중 ${rows.length}건만 조회되어 보고서 생성을 중단했습니다.`);
  }
  return rows;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function collectBudgetDocumentNumbers(references: Array<{ module: string; id: string }>) {
  const idsByModule = references.reduce<Map<string, Set<string>>>((result, reference) => {
    if (!reference.id || !BUDGET_DOCUMENT_MODULES.includes(reference.module as typeof BUDGET_DOCUMENT_MODULES[number])) return result;
    const ids = result.get(reference.module) || new Set<string>();
    ids.add(reference.id);
    result.set(reference.module, ids);
    return result;
  }, new Map());
  if (!idsByModule.size) return {};

  const links: any[] = [];
  for (const [module, ids] of idsByModule) {
    for (const idChunk of chunks([...ids], DOCUMENT_ID_CHUNK_SIZE)) {
      const remaining = BUDGET_QUERY_LIMIT - links.length;
      if (remaining <= 0) throw new Error(`공식문서 첨부가 ${BUDGET_QUERY_LIMIT}건을 초과하여 보고서 생성을 중단했습니다.`);
      const rows = await checkedBudgetQuery(
        `${module} 공식문서 첨부`,
        supabase.from("attachments")
          .select("module, ref_id, file_path", { count: "exact" })
          .eq("ref_type", "official_document_link")
          .eq("module", module)
          .in("ref_id", idChunk)
          .limit(remaining),
        remaining,
      );
      links.push(...rows);
    }
  }

  const documentIds = unique(links.map(link => String(link.file_path || "").replace("parkmaster-document://", "")));
  if (!documentIds.length) return {};
  const documents: any[] = [];
  for (const idChunk of chunks(documentIds, DOCUMENT_ID_CHUNK_SIZE)) {
    const remaining = BUDGET_QUERY_LIMIT - documents.length;
    if (remaining <= 0) throw new Error(`공식문서가 ${BUDGET_QUERY_LIMIT}건을 초과하여 보고서 생성을 중단했습니다.`);
    const rows = await checkedBudgetQuery(
      "공식문서대장",
      supabase.from("official_documents").select("id, document_number", { count: "exact" }).in("id", idChunk).limit(remaining),
      remaining,
    );
    documents.push(...rows);
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

export async function collectBudgetReportData(options: BudgetReportOptions): Promise<BudgetReportDataset> {
  const [parkingLotRows, planRows] = await Promise.all([
    checkedBudgetQuery(
      "주차장",
      supabase.from("parking_lots").select("id, code, name, lot_type, status", { count: "exact" }).limit(BUDGET_QUERY_LIMIT),
    ),
    checkedBudgetQuery(
      "예산편성",
      supabase.from("budget_plans").select("*", { count: "exact" })
        .in("fiscal_year", options.fiscalYears)
        .order("fiscal_year", { ascending: false })
        .order("plan_number")
        .limit(BUDGET_QUERY_LIMIT),
    ),
  ]);
  const active = (row: any) => options.includeArchived || !isArchived(row);
  const plans = planRows.filter(active);
  const planIds = plans.map(row => row.id).filter(Boolean);
  const itemRows = planIds.length ? await checkedBudgetQuery(
    "예산항목",
    supabase.from("budget_items").select("*", { count: "exact" })
      .in("plan_id", planIds)
      .order("sort_order")
      .limit(BUDGET_QUERY_LIMIT),
  ) : [];
  const [executionRows, transferRows] = await Promise.all([
    checkedBudgetQuery(
      "예산집행",
      supabase.from("budget_executions").select("*", { count: "exact" })
        .gte("execution_date", options.periodStart)
        .lte("execution_date", options.periodEnd)
        .order("execution_date", { ascending: false })
        .limit(BUDGET_QUERY_LIMIT),
    ),
    checkedBudgetQuery(
      "예산 전용·이체",
      supabase.from("budget_transfers").select("*", { count: "exact" })
        .in("fiscal_year", options.fiscalYears)
        .order("created_at", { ascending: false })
        .limit(BUDGET_QUERY_LIMIT),
    ),
  ]);

  const lotById = new Map(parkingLotRows.map(row => [row.id, row]));
  const withParkingLot = (row: any) => ({ ...row, parking_lots: relation(row, "parking_lots") || lotById.get(row.lot_id) });
  const parkingLots = parkingLotRows.filter(row => matchesLotType(row, options.lotTypes));
  const items = itemRows.map(withParkingLot).filter(row => active(row) && matchesLotType(row, options.lotTypes));
  const itemIds = new Set(items.map(row => row.id));
  const executions = executionRows.map(withParkingLot).filter(row => (
    active(row)
    && itemIds.has(row.item_id)
    && inPeriod(row.execution_date, options)
    && matchesLotType(row, options.lotTypes)
  ));
  const transfers = transferRows.filter(row => (
    active(row)
    && options.fiscalYears.includes(number(row.fiscal_year))
    && (itemIds.has(row.from_item_id) || itemIds.has(row.to_item_id))
  ));
  const references = [
    ...plans.map(row => ({ module: "BUDGET_PLAN", id: row.id })),
    ...items.map(row => ({ module: "BUDGET_ITEM", id: row.id })),
    ...executions.map(row => ({ module: "BUDGET_EXECUTION", id: row.id })),
    ...transfers.map(row => ({ module: "BUDGET_TRANSFER", id: row.id })),
  ];
  const documentNumbers = await collectBudgetDocumentNumbers(references);
  return { parkingLots, plans, items, executions, transfers, documentNumbers };
}

function sortRows(rows: any[], sort: BudgetReportSort) {
  const statusRank: Record<string, number> = { rejected: 0, pending: 1, submitted: 2, review: 3, draft: 4, approved: 5, executed: 6, cancelled: 7 };
  const rowDate = (row: any) => row.execution_date || row.approved_at || row.submitted_at || row.created_at || row.record_date || "";
  const rowAmount = (row: any) => number(row.amount ?? row.allocated_amount ?? row.planned_amount ?? row.total_expenditure);
  return [...rows].sort((a, b) => {
    if (sort === "date_desc") return String(rowDate(b)).localeCompare(String(rowDate(a)));
    if (sort === "amount_desc") return rowAmount(b) - rowAmount(a);
    if (sort === "status") return (statusRank[a.status] ?? 50) - (statusRank[b.status] ?? 50);
    if (sort === "category") return text(a.category_l1 || a.area || a.source_type).localeCompare(text(b.category_l1 || b.area || b.source_type), "ko", { numeric: true });
    const riskRank: Record<string, number> = { "높음": 0, "주의": 1, "확인": 2 };
    return (riskRank[a.risk_level] ?? statusRank[a.status] ?? 20) - (riskRank[b.risk_level] ?? statusRank[b.status] ?? 20) || String(rowDate(b)).localeCompare(String(rowDate(a)));
  });
}

function buildDocumentRows(dataset: BudgetReportDataset, plans: any[], items: any[], executions: any[], transfers: any[]) {
  const rows: any[] = [];
  const add = (sourceType: string, module: string, row: any, recordNumber: string, title: string, recordDate: unknown) => {
    const documents = rowDocuments(dataset, module, row);
    rows.push({
      source_type: sourceType, record_number: recordNumber || "-", title: title || "-",
      document_number: documents.join(", ") || "-", approval_number: row.approval_number || "-",
      status: statusLabel(row.status), record_date: dateOnly(recordDate), __missing_document: documents.length === 0,
    });
  };
  plans.forEach(row => add("예산편성", "BUDGET_PLAN", row, `${row.fiscal_year}-${row.plan_type}-${row.plan_number}`, row.title, row.approved_at || row.created_at));
  items.forEach(row => add("예산항목", "BUDGET_ITEM", row, row.item_code, row.item_name, row.updated_at || row.created_at));
  executions.forEach(row => add("예산집행", "BUDGET_EXECUTION", row, row.execution_number, row.description, row.execution_date));
  transfers.forEach(row => add("전용·이체", "BUDGET_TRANSFER", row, row.transfer_number, row.reason, row.approved_at || row.created_at));
  return rows;
}

function buildRiskRows(dataset: BudgetReportDataset, plans: any[], items: any[], executions: any[], transfers: any[], documents: any[]) {
  const rows: any[] = [];
  plans.filter(row => !["approved", "executed", "cancelled"].includes(row.status)).forEach(row => rows.push({ risk_level: row.status === "rejected" ? "높음" : "주의", area: "예산편성", reference: `${row.fiscal_year}-${row.plan_type}-${row.plan_number}`, finding: `편성안 승인상태: ${statusLabel(row.status)}`, amount: number(row.total_expenditure), status: statusLabel(row.status), document_number: documentList(dataset, "BUDGET_PLAN", row) }));
  items.filter(row => row.budget_type === "expenditure" && itemRemaining(row) < 0).forEach(row => rows.push({ risk_level: "높음", area: "예산항목", reference: row.item_code, finding: "배정액을 초과하여 집행·반납됨", amount: Math.abs(itemRemaining(row)), status: "조치 필요", document_number: documentList(dataset, "BUDGET_ITEM", row) }));
  items.filter(row => row.budget_type === "expenditure" && number(row.allocated_amount) > 0 && itemExecutionRate(row) < 50).forEach(row => rows.push({ risk_level: "주의", area: "집행률", reference: row.item_code, finding: `집행률 ${percent(itemExecutionRate(row))}`, amount: itemRemaining(row), status: "집행 점검", document_number: documentList(dataset, "BUDGET_ITEM", row) }));
  executions.filter(row => ["pending", "rejected"].includes(row.status)).forEach(row => rows.push({ risk_level: row.status === "rejected" ? "높음" : "주의", area: "예산집행", reference: row.execution_number, finding: `집행 승인상태: ${statusLabel(row.status)}`, amount: number(row.amount), status: statusLabel(row.status), document_number: documentList(dataset, "BUDGET_EXECUTION", row) }));
  transfers.filter(row => ["pending", "rejected"].includes(row.status)).forEach(row => rows.push({ risk_level: row.status === "rejected" ? "높음" : "주의", area: "전용·이체", reference: row.transfer_number, finding: `${TRANSFER_TYPE_LABELS[row.transfer_type] || row.transfer_type} 승인상태: ${statusLabel(row.status)}`, amount: number(row.amount), status: statusLabel(row.status), document_number: documentList(dataset, "BUDGET_TRANSFER", row) }));
  const executedByItem = new Map<string, number>();
  executions.filter(row => row.status === "executed").forEach(row => executedByItem.set(row.item_id, (executedByItem.get(row.item_id) || 0) + number(row.amount)));
  items.filter(row => Math.abs(number(row.executed_amount) - (executedByItem.get(row.id) || 0)) > 0).forEach(row => rows.push({ risk_level: "높음", area: "원장정합성", reference: row.item_code, finding: `항목 집행액과 집행원장 차이 ${won(number(row.executed_amount) - (executedByItem.get(row.id) || 0))}`, amount: Math.abs(number(row.executed_amount) - (executedByItem.get(row.id) || 0)), status: "대사 필요", document_number: documentList(dataset, "BUDGET_ITEM", row) }));
  const missingByType = documents.filter(row => row.__missing_document).reduce((counts: Record<string, number>, row) => ({ ...counts, [row.source_type]: (counts[row.source_type] || 0) + 1 }), {});
  Object.entries(missingByType).forEach(([sourceType, count]) => rows.push({ risk_level: "확인", area: "문서번호", reference: sourceType, finding: `근거 문서번호 미등록 ${count}건`, amount: null, status: "등록 필요", document_number: "-" }));
  return rows;
}

const TABLE_IDENTITY_FIELDS: Record<Exclude<BudgetReportSectionId, "overview">, string[]> = {
  plans: ["fiscal_year", "plan_type", "title"], items: ["item_code", "item_name"], executions: ["execution_number", "execution_date"],
  transfers: ["transfer_number", "transfer_type"], risks: ["risk_level", "area", "reference"], documents: ["source_type", "record_number"],
};

const TABLE_GROUP_TITLES: Record<Exclude<BudgetReportSectionId, "overview">, string[]> = {
  plans: ["편성액·수지·승인상태", "제출·승인·문서 근거"],
  items: ["분류·편성·배정", "집행·반납·잔액·집행률", "속성·문서 근거"],
  executions: ["집행원장·금액·승인상태", "지급처·업무연계·문서 근거"],
  transfers: ["전용·이체 대상과 금액", "사유·법적근거·승인·문서"],
  risks: ["위험 및 조치 필요사항"], documents: ["업무별 근거 문서번호"],
};

function splitBudgetFields(id: Exclude<BudgetReportSectionId, "overview">, fields: BudgetReportField[], orientation: BudgetReportOrientation) {
  const maximumColumns = orientation === "portrait" ? 10 : 14;
  if (fields.length <= maximumColumns) return [fields];
  const identity = fields.filter(item => TABLE_IDENTITY_FIELDS[id].includes(item.key));
  const details = fields.filter(item => !TABLE_IDENTITY_FIELDS[id].includes(item.key));
  const detailLimit = Math.max(1, maximumColumns - identity.length);
  const groups: BudgetReportField[][] = [];
  for (let index = 0; index < details.length; index += detailLimit) groups.push([...identity, ...details.slice(index, index + detailLimit)]);
  return groups;
}

export function buildBudgetReportModel(dataset: BudgetReportDataset, options: BudgetReportOptions): BudgetReportModel {
  const active = (row: any) => options.includeArchived || !isArchived(row);
  const plans = dataset.plans.filter(row => active(row) && inFiscalYears(row, dataset, options));
  const planIds = new Set(plans.map(row => row.id));
  const allItems = dataset.items.filter(row => active(row) && planIds.has(row.plan_id) && matchesLotType(row, options.lotTypes));
  const items = allItems.filter(row => options.includeSummaryItems || !row.is_summary);
  const leafItems = allItems.filter(row => !row.is_summary);
  const itemIds = new Set(allItems.map(row => row.id));
  const executions = dataset.executions.filter(row => active(row) && itemIds.has(row.item_id) && inPeriod(row.execution_date, options) && matchesLotType(row, options.lotTypes));
  const transfers = dataset.transfers.filter(row => active(row) && options.fiscalYears.includes(number(row.fiscal_year)) && (itemIds.has(row.from_item_id) || itemIds.has(row.to_item_id)));
  const documents = buildDocumentRows(dataset, plans, items, executions, transfers);
  const risks = buildRiskRows(dataset, plans, leafItems, executions, transfers, documents);
  const expenditureItems = leafItems.filter(row => row.budget_type === "expenditure");
  const revenueItems = leafItems.filter(row => row.budget_type === "revenue");
  const allocatedExpenditure = expenditureItems.reduce((sum, row) => sum + number(row.allocated_amount), 0);
  const executedExpenditure = expenditureItems.reduce((sum, row) => sum + number(row.executed_amount), 0);
  const returnedExpenditure = expenditureItems.reduce((sum, row) => sum + number(row.returned_amount), 0);
  const executedRows = executions.filter(row => row.status === "executed");
  const pendingExecutions = executions.filter(row => row.status === "pending");
  const approvedTransfers = transfers.filter(row => ["approved", "executed"].includes(row.status));
  const pendingTransfers = transfers.filter(row => row.status === "pending");
  const linkedDocuments = unique(documents.flatMap(row => row.document_number === "-" ? [] : row.document_number.split(","))).length;
  const summary: BudgetReportSummary = {
    parkingLots: new Set(allItems.map(row => row.lot_id).filter(Boolean)).size,
    plans: plans.length,
    approvedPlans: plans.filter(row => ["approved", "executed"].includes(row.status)).length,
    pendingPlans: plans.filter(row => ["submitted", "review", "pending"].includes(row.status)).length,
    plannedRevenue: revenueItems.reduce((sum, row) => sum + number(row.planned_amount), 0),
    plannedExpenditure: expenditureItems.reduce((sum, row) => sum + number(row.planned_amount), 0),
    allocatedExpenditure,
    executedExpenditure,
    returnedExpenditure,
    remainingExpenditure: expenditureItems.reduce((sum, row) => sum + itemRemaining(row), 0),
    executionRate: allocatedExpenditure ? executedExpenditure / allocatedExpenditure * 100 : 0,
    executionRows: executions.length,
    executedRows: executedRows.length,
    executedRecordAmount: executedRows.reduce((sum, row) => sum + number(row.amount), 0),
    pendingExecutionRows: pendingExecutions.length,
    pendingExecutionAmount: pendingExecutions.reduce((sum, row) => sum + number(row.amount), 0),
    transfers: transfers.length,
    approvedTransfers: approvedTransfers.length,
    approvedTransferAmount: approvedTransfers.reduce((sum, row) => sum + number(row.amount), 0),
    pendingTransfers: pendingTransfers.length,
    pendingTransferAmount: pendingTransfers.reduce((sum, row) => sum + number(row.amount), 0),
    riskCount: risks.length,
    overrunItems: expenditureItems.filter(row => itemRemaining(row) < 0).length,
    linkedDocuments,
    missingDocuments: documents.filter(row => row.__missing_document).length,
  };
  const rowsBySection: Record<Exclude<BudgetReportSectionId, "overview">, any[]> = { plans, items, executions, transfers, risks, documents };
  const tables = options.selectedSections.filter((id): id is Exclude<BudgetReportSectionId, "overview"> => id !== "overview").flatMap(id => {
    const section = BUDGET_REPORT_SECTIONS.find(item => item.id === id)!;
    const requested = options.selectedFields[id] || section.defaultFields;
    const fields = section.fields.filter(item => requested.includes(item.key));
    const sourceRows = sortRows(rowsBySection[id], options.sort);
    const groups = splitBudgetFields(id, fields, options.orientation);
    return groups.map((group, groupIndex) => ({
      id,
      title: section.label,
      subtitle: groups.length > 1 ? (TABLE_GROUP_TITLES[id][groupIndex] || `${section.label} 세부정보`) : undefined,
      subtitleNumber: groups.length > 1 ? groupIndex + 1 : undefined,
      continuation: groupIndex > 0,
      columns: group.map(item => ({ key: item.key, label: item.label })),
      rows: sourceRows.map(row => Object.fromEntries(group.map(item => [item.key, text(item.value(row, dataset))]))),
    } as OperationsReportTable));
  });
  const selectedFields = options.selectedSections.flatMap(id => {
    const section = BUDGET_REPORT_SECTIONS.find(item => item.id === id)!;
    return section.fields.filter(item => (options.selectedFields[id] || section.defaultFields).includes(item.key));
  });
  const riskNarrative = [
    summary.pendingPlans ? `승인 진행 중 편성안 ${summary.pendingPlans}건` : "승인 진행 중 편성안 없음",
    summary.pendingExecutionRows ? `승인 대기 집행 ${summary.pendingExecutionRows}건` : "승인 대기 집행 없음",
    summary.pendingTransfers ? `승인 대기 전용·이체 ${summary.pendingTransfers}건` : "승인 대기 전용·이체 없음",
    summary.overrunItems ? `잔액 음수 예산항목 ${summary.overrunItems}건` : "잔액 초과 항목 없음",
    summary.missingDocuments ? `문서번호 미등록 ${summary.missingDocuments}건` : "문서번호 누락 없음",
  ].join("; ");
  return {
    period: { start: options.periodStart, end: options.periodEnd }, fiscalYears: options.fiscalYears,
    lotTypeLabels: BUDGET_LOT_TYPE_OPTIONS.filter(item => options.lotTypes.includes(item.value)).map(item => item.label),
    summary,
    sourceCounts: { lots: summary.parkingLots, plans: plans.length, items: items.length, executions: executions.length, transfers: transfers.length, risks: risks.length, documents: linkedDocuments },
    tables, selectedFieldCount: selectedFields.length, protectedFieldCount: selectedFields.filter(item => item.protected).length, riskNarrative,
  };
}

export function budgetReportBriefRows(model: BudgetReportModel, documentSummary?: string): string[][] {
  return [
    ["담당부서", PRIMARY_DEPARTMENT],
    ["보고기간", `${model.period.start} ~ ${model.period.end}`],
    ["보고대상", `${model.fiscalYears.join("·")}회계연도 제주시 공영주차장 예산`],
    ["주요내용", unique(model.tables.filter(table => !table.continuation).map(table => table.title)).join("·") || "예산관리 핵심 현황"],
    ["작성목적", documentSummary || "공영주차장 예산의 편성·배정·집행·잔액과 전용·이체 승인상태를 구분하여 재정 집행의 적정성과 후속 조치 필요사항을 확인하기 위함."],
    ["산출기준", `요약항목을 제외한 세부 예산항목을 기준으로 편성액·배정액·집행액·반납액·잔액을 각각 집계하고 집행원장 및 근거 문서번호를 대조함. ${model.riskNarrative}`],
  ];
}

export function budgetReportSummaryRows(model: BudgetReportModel): string[][] {
  return [
    ["예산편성안", `${model.summary.plans.toLocaleString("ko-KR")}건`, "승인 편성안", `${model.summary.approvedPlans.toLocaleString("ko-KR")}건`],
    ["세입 편성액", won(model.summary.plannedRevenue), "세출 편성액", won(model.summary.plannedExpenditure)],
    ["세출 배정액", won(model.summary.allocatedExpenditure), "세출 집행액", won(model.summary.executedExpenditure)],
    ["반납액", won(model.summary.returnedExpenditure), "집행가능 잔액", won(model.summary.remainingExpenditure)],
    ["세출 집행률", percent(model.summary.executionRate), "집행완료 원장", `${model.summary.executedRows.toLocaleString("ko-KR")}건`],
    ["승인대기 집행", `${model.summary.pendingExecutionRows.toLocaleString("ko-KR")}건 · ${won(model.summary.pendingExecutionAmount)}`, "집행원장 금액", won(model.summary.executedRecordAmount)],
    ["승인 전용·이체", `${model.summary.approvedTransfers.toLocaleString("ko-KR")}건 · ${won(model.summary.approvedTransferAmount)}`, "승인대기 전용·이체", `${model.summary.pendingTransfers.toLocaleString("ko-KR")}건 · ${won(model.summary.pendingTransferAmount)}`],
    ["위험·확인사항", `${model.summary.riskCount.toLocaleString("ko-KR")}건`, "잔액 초과 항목", `${model.summary.overrunItems.toLocaleString("ko-KR")}건`],
    ["연결 공식문서", `${model.summary.linkedDocuments.toLocaleString("ko-KR")}건`, "문서번호 미등록", `${model.summary.missingDocuments.toLocaleString("ko-KR")}건`],
  ];
}

export function toOperationsCompatibleBudgetModel(model: BudgetReportModel): OperationsReportModel {
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

export async function getBudgetReportEvidence(parameters: Record<string, string>) {
  const options = parseBudgetReportOptions(parameters);
  const dataset = await collectBudgetReportData(options);
  const model = buildBudgetReportModel(dataset, options);
  return {
    period: model.period,
    fiscalYears: model.fiscalYears,
    sourceCounts: model.sourceCounts,
    summary: model.summary,
    selectedFieldCount: model.selectedFieldCount,
    protectedFieldCount: model.protectedFieldCount,
    riskNarrative: model.riskNarrative,
  };
}

export const BUDGET_REPORT_SAMPLE_DATASET: BudgetReportDataset = {
  parkingLots: [
    { id: "lot-1", code: "JJP-001", name: "동문공설", lot_type: "offstreet" },
    { id: "lot-2", code: "JJP-002", name: "칠성골", lot_type: "multilevel" },
  ],
  plans: [
    { id: "plan-1", fiscal_year: 2026, plan_type: "original", plan_number: 1, title: "2026년 공영주차장 본예산", total_revenue: 400000000, total_expenditure: 300000000, status: "approved", approved_at: "2026-01-05", document_number: "제주시청-차량관리과운영팀-2026-0001" },
    { id: "plan-2", fiscal_year: 2026, plan_type: "supplementary", plan_number: 1, title: "2026년 제1회 추경", total_revenue: 0, total_expenditure: 50000000, status: "submitted", submitted_at: "2026-08-02" },
  ],
  items: [
    { id: "item-1", plan_id: "plan-1", lot_id: "lot-1", item_code: "E-001", budget_type: "expenditure", category_l1: "시설비", item_name: "주차관제 장비 교체", planned_amount: 100000000, allocated_amount: 90000000, executed_amount: 45000000, returned_amount: 5000000, remaining_amount: 40000000, execution_rate: 50, document_number: "제주시청-차량관리과운영팀-2026-0010", parking_lots: { id: "lot-1", name: "동문공설", lot_type: "offstreet" } },
    { id: "item-2", plan_id: "plan-1", lot_id: "lot-2", item_code: "E-002", budget_type: "expenditure", category_l1: "운영비", item_name: "주차빌딩 유지관리", planned_amount: 200000000, allocated_amount: 180000000, executed_amount: 190000000, returned_amount: 0, remaining_amount: -10000000, execution_rate: 105.56, parking_lots: { id: "lot-2", name: "칠성골", lot_type: "multilevel" } },
    { id: "item-3", plan_id: "plan-1", item_code: "R-001", budget_type: "revenue", category_l1: "주차수입", item_name: "공영주차장 사용료", planned_amount: 400000000, allocated_amount: 400000000, executed_amount: 320000000, returned_amount: 0, remaining_amount: 80000000, document_number: "제주시청-차량관리과운영팀-2026-0011" },
  ],
  executions: [
    { id: "exec-1", item_id: "item-1", lot_id: "lot-1", execution_number: "BE-2026-001", execution_date: "2026-08-01", execution_type: "expenditure", amount: 45000000, description: "관제장비 선금 지급", vendor_name: "제주관제", status: "executed", approved_at: "2026-08-02", document_number: "제주시청-차량관리과운영팀-2026-0201", parking_lots: { id: "lot-1", name: "동문공설", lot_type: "offstreet" } },
    { id: "exec-2", item_id: "item-2", lot_id: "lot-2", execution_number: "BE-2026-002", execution_date: "2026-08-03", execution_type: "expenditure", amount: 180000000, description: "유지관리 기성금", vendor_name: "제주유지관리", status: "executed", document_number: "제주시청-차량관리과운영팀-2026-0202", parking_lots: { id: "lot-2", name: "칠성골", lot_type: "multilevel" } },
    { id: "exec-3", item_id: "item-2", lot_id: "lot-2", execution_number: "BE-2026-003", execution_date: "2026-08-04", execution_type: "expenditure", amount: 10000000, description: "추가 보수비", status: "pending", parking_lots: { id: "lot-2", name: "칠성골", lot_type: "multilevel" } },
  ],
  transfers: [
    { id: "transfer-1", fiscal_year: 2026, transfer_number: "BT-2026-001", transfer_type: "appropriation", from_item_id: "item-1", to_item_id: "item-2", amount: 10000000, reason: "긴급 보수비 확보", legal_basis: "지방재정법", status: "approved", approved_at: "2026-08-03", approval_number: "승인-2026-01", document_number: "제주시청-차량관리과운영팀-2026-0301" },
    { id: "transfer-2", fiscal_year: 2026, transfer_number: "BT-2026-002", transfer_type: "use", from_item_id: "item-1", to_item_id: "item-2", amount: 5000000, reason: "집행잔액 조정", status: "pending" },
  ],
  documentNumbers: {
    "BUDGET_PLAN:plan-1": ["제주시청-차량관리과운영팀-2026-0001"],
    "BUDGET_EXECUTION:exec-1": ["제주시청-차량관리과운영팀-2026-0201"],
    "BUDGET_TRANSFER:transfer-1": ["제주시청-차량관리과운영팀-2026-0301"],
  },
};
