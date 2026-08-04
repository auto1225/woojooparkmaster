import { PRIMARY_DEPARTMENT } from "@/config/organization";
import { supabase } from "@/integrations/supabase/client";
import type {
  OperationsReportModel,
  OperationsReportOrientation,
  OperationsReportTable,
} from "@/lib/operations-report";

export type RevenueReportSectionId = "overview" | "certified" | "unverified" | "closes" | "reconciliation" | "payment_methods";
export type RevenueReportSort = "attention" | "date_desc" | "parking_lot" | "amount_desc" | "difference_desc";
export type RevenueReportOrientation = OperationsReportOrientation;

export interface RevenueReportField {
  key: string;
  label: string;
  protected?: boolean;
  value: (row: any, dataset: RevenueReportDataset) => unknown;
}

export interface RevenueReportSection {
  id: RevenueReportSectionId;
  label: string;
  description: string;
  fields: RevenueReportField[];
  defaultFields: string[];
}

export interface RevenueReportOptions {
  periodStart: string;
  periodEnd: string;
  selectedSections: RevenueReportSectionId[];
  selectedFields: Partial<Record<RevenueReportSectionId, string[]>>;
  lotTypes: string[];
  sort: RevenueReportSort;
  orientation: RevenueReportOrientation;
  includeArchived: boolean;
}

export interface RevenueReportDataset {
  parkingLots: any[];
  dailyRevenue: any[];
  periodCloses: any[];
  reconciliations: any[];
  missingDays: any[];
  documentNumbers: Record<string, string[]>;
}

export interface RevenueReportSummary extends Record<string, number> {
  parkingLots: number;
  dailyRows: number;
  verifiedRows: number;
  certifiedRows: number;
  verifiedPendingClose: number;
  unverifiedRows: number;
  missingDays: number;
  finalizedRevenue: number;
  unverifiedRevenue: number;
  closedLots: number;
  reconciliationRows: number;
  openReconciliations: number;
  reconciliationNetDifference: number;
  reconciliationAbsoluteDifference: number;
  integrityMismatchRows: number;
  linkedDocuments: number;
  cashAmount: number;
  cardAmount: number;
  mobileAmount: number;
  monthlyPassAmount: number;
  otherAmount: number;
}

export interface RevenueReportModel {
  period: { start: string; end: string };
  lotTypeLabels: string[];
  summary: RevenueReportSummary;
  sourceCounts: Record<string, number>;
  tables: OperationsReportTable[];
  selectedFieldCount: number;
  protectedFieldCount: number;
  attentionNarrative: string;
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

const DATA_SOURCE_LABELS: Record<string, string> = {
  manual: "수동입력", kiosk: "무인정산기", system: "관제시스템", import: "파일 가져오기",
};

const RECONCILIATION_STATUS_LABELS: Record<string, string> = {
  pending: "대기", reviewing: "검토중", matched: "금액·차량 일치", discrepancy: "불일치",
  resolved: "차이 조치 종결", disputed: "업체 이의제기",
};

export const REVENUE_RECONCILIATION_SCOPE_NOTICE = "위탁대사는 업체 보고자료와 ParkMaster 시스템 집계자료 간 비교이며, 은행 입금자료 및 세외수입 수납시스템 자료는 포함하지 않음.";

export const REVENUE_LOT_TYPE_OPTIONS = [
  { value: "offstreet", label: "노외주차장" },
  { value: "building", label: "주차빌딩" },
  { value: "onstreet", label: "노상주차장" },
];

const relation = (row: any, key = "parking_lots") => Array.isArray(row?.[key]) ? row[key][0] : row?.[key];
const lot = (row: any) => relation(row);
const lotId = (row: any) => String(row?.lot_id || lot(row)?.id || "");
const lotName = (row: any) => lot(row)?.name || row?.lot_name || row?.parking_lot_name || "공통";
const lotType = (row: any) => row?.lot_type_at_event || lot(row)?.lot_type || row?.lot_type || "";
const dateOnly = (value: unknown) => value ? String(value).split("T")[0] : "-";
const monthKey = (value: unknown) => value ? dateOnly(value).slice(0, 7) : "";
const text = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);
const won = (value: unknown) => `${Number(value || 0).toLocaleString("ko-KR")}원`;
const number = (value: unknown) => Number(value || 0);
const isArchived = (row: any) => Boolean(row?.archived_at);
const documentKey = (module: string, id: string) => `${module}:${id}`;
const unique = <T>(values: T[]) => Array.from(new Set(values));

function dailyTotal(row: any) {
  return number(row.cash_amount) + number(row.card_amount) + number(row.mobile_amount)
    + number(row.monthly_pass_amount) + number(row.other_amount);
}

function reconciliationReportedTotal(row: any) {
  return number(row.reported_cash) + number(row.reported_card) + number(row.reported_mobile)
    + number(row.reported_monthly_pass) + number(row.reported_other);
}

function reconciliationSystemTotal(row: any) {
  return number(row.system_cash) + number(row.system_card) + number(row.system_mobile)
    + number(row.system_monthly_pass) + number(row.system_other);
}

function reconciliationDifference(row: any) {
  return reconciliationReportedTotal(row) - reconciliationSystemTotal(row);
}

function linkedDocumentList(dataset: RevenueReportDataset, module: string, row: any) {
  const direct = row?.document_number ? [String(row.document_number)] : [];
  const linked = dataset.documentNumbers[documentKey(module, row.id)] || [];
  return unique([...direct, ...linked].filter(Boolean)).join(", ") || "-";
}

const field = (key: string, label: string, value: RevenueReportField["value"], protectedField = false): RevenueReportField => ({ key, label, value, protected: protectedField });

export const REVENUE_REPORT_SECTIONS: RevenueReportSection[] = [
  { id: "overview", label: "수입 총괄", description: "확정수입·미검증·월마감·위탁대사 핵심지표", fields: [], defaultFields: [] },
  {
    id: "certified", label: "확정 수입", description: "검증 완료 후 해당 월이 마감된 수입원장",
    fields: [
      field("revenue_date", "수입일", row => dateOnly(row.revenue_date)), field("lot", "주차장", row => lotName(row)),
      field("lot_type", "형태", row => LOT_TYPE_LABELS[lotType(row)] || lotType(row)), field("cash_amount", "현금", row => won(row.cash_amount)),
      field("card_amount", "카드", row => won(row.card_amount)), field("mobile_amount", "모바일", row => won(row.mobile_amount)),
      field("monthly_pass_amount", "월정기권", row => won(row.monthly_pass_amount)), field("other_amount", "기타", row => won(row.other_amount)),
      field("total_amount", "확정합계", row => won(dailyTotal(row))), field("total_vehicles", "이용차량", row => `${number(row.total_vehicles).toLocaleString("ko-KR")}대`),
      field("exemption_count", "감면건수", row => `${number(row.exemption_count).toLocaleString("ko-KR")}건`), field("exemption_amount", "감면액", row => won(row.exemption_amount)),
      field("data_source", "자료출처", row => DATA_SOURCE_LABELS[row.data_source] || row.data_source), field("verified_at", "검증일시", row => dateOnly(row.verified_at)),
      field("document_numbers", "문서번호", (row, dataset) => linkedDocumentList(dataset, "REVENUE_DAILY", row)),
      field("verified_by", "검증자", row => row.verified_by_name || row.verified_by, true),
    ],
    defaultFields: ["revenue_date", "lot", "lot_type", "cash_amount", "card_amount", "mobile_amount", "monthly_pass_amount", "other_amount", "total_amount", "total_vehicles", "exemption_count", "exemption_amount", "data_source", "verified_at", "document_numbers"],
  },
  {
    id: "unverified", label: "미검증·누락", description: "확정실적에서 제외되는 미검증 원장과 누락일",
    fields: [
      field("record_type", "구분", row => row.__record_type === "missing" ? "누락일" : "미검증"), field("revenue_date", "수입일", row => dateOnly(row.revenue_date)),
      field("lot", "주차장", row => lotName(row)), field("lot_type", "형태", row => LOT_TYPE_LABELS[lotType(row)] || lotType(row)),
      field("total_amount", "입력합계", row => row.__record_type === "missing" ? "-" : won(dailyTotal(row))),
      field("total_vehicles", "이용차량", row => row.__record_type === "missing" ? "-" : `${number(row.total_vehicles).toLocaleString("ko-KR")}대`),
      field("data_source", "자료출처", row => row.__record_type === "missing" ? "미입력" : DATA_SOURCE_LABELS[row.data_source] || row.data_source),
      field("discrepancy_note", "확인사항", row => row.__record_type === "missing" ? "일별 수입 미입력" : row.discrepancy_note),
      field("document_numbers", "문서번호", (row, dataset) => row.__record_type === "missing" ? "-" : linkedDocumentList(dataset, "REVENUE_DAILY", row)),
      field("input_by", "입력자", row => row.author_name || row.input_by_name || row.input_by, true),
    ],
    defaultFields: ["record_type", "revenue_date", "lot", "lot_type", "total_amount", "total_vehicles", "data_source", "discrepancy_note", "document_numbers"],
  },
  {
    id: "closes", label: "월 마감", description: "주차장별 월 마감·재개방 및 확정 범위",
    fields: [
      field("period_month", "대상월", row => monthKey(row.period_month)), field("lot", "주차장", row => lotName(row)),
      field("lot_type", "형태", row => LOT_TYPE_LABELS[lotType(row)] || lotType(row)), field("record_count", "원장건수", row => `${number(row.record_count).toLocaleString("ko-KR")}건`),
      field("total_amount", "마감금액", row => won(row.total_amount)), field("close_status", "마감상태", row => row.is_closed ? "마감" : "미마감"),
      field("closed_at", "마감일시", row => dateOnly(row.closed_at)), field("reopened_at", "재개방일시", row => dateOnly(row.reopened_at)),
      field("reopen_reason", "재개방사유", row => row.reopen_reason), field("document_numbers", "문서번호", (row, dataset) => linkedDocumentList(dataset, "REVENUE_CLOSE", row)),
      field("closed_by", "마감자", row => row.closed_by_name || row.closed_by, true),
    ],
    defaultFields: ["period_month", "lot", "lot_type", "record_count", "total_amount", "close_status", "closed_at", "reopened_at", "reopen_reason", "document_numbers"],
  },
  {
    id: "reconciliation", label: "위탁수입 대사", description: "업체 보고자료와 ParkMaster 시스템 집계자료 비교",
    fields: [
      field("recon_number", "대사번호", row => row.recon_number), field("lot", "주차장", row => lotName(row)),
      field("lot_type", "형태", row => LOT_TYPE_LABELS[lotType(row)] || lotType(row)), field("company_name", "위탁업체", row => row.company_name),
      field("period", "대사기간", row => `${dateOnly(row.period_start)} ~ ${dateOnly(row.period_end)}`), field("reported_total", "업체보고액", row => won(reconciliationReportedTotal(row))),
      field("system_total", "시스템집계액", row => won(reconciliationSystemTotal(row))), field("diff_amount", "차이액", row => won(reconciliationDifference(row))),
      field("diff_rate", "차이율", row => `${number(row.diff_rate).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`),
      field("reported_vehicles", "업체차량", row => `${number(row.reported_vehicles).toLocaleString("ko-KR")}대`),
      field("system_vehicles", "시스템차량", row => `${number(row.system_vehicles).toLocaleString("ko-KR")}대`),
      field("status", "처리상태", row => RECONCILIATION_STATUS_LABELS[row.status] || row.status), field("diff_analysis", "차이분석", row => row.diff_analysis),
      field("resolution_type", "처리방법", row => row.resolution_type), field("resolution_note", "처리소견", row => row.resolution_note),
      field("resolved_at", "조치종결일", row => dateOnly(row.resolved_at)), field("document_numbers", "문서번호", (row, dataset) => linkedDocumentList(dataset, "REVENUE_RECONCILIATION", row)),
      field("resolved_by", "조치자", row => row.resolved_by_name || row.resolved_by, true),
    ],
    defaultFields: ["recon_number", "lot", "lot_type", "company_name", "period", "reported_total", "system_total", "diff_amount", "diff_rate", "reported_vehicles", "system_vehicles", "status", "diff_analysis", "resolution_type", "resolution_note", "resolved_at", "document_numbers"],
  },
  {
    id: "payment_methods", label: "결제수단", description: "확정수입 기준 결제수단별 금액과 구성비",
    fields: [
      field("payment_method", "결제수단", row => row.payment_method), field("finalized_amount", "확정금액", row => won(row.finalized_amount)),
      field("ratio", "구성비", row => `${number(row.ratio).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`),
      field("basis", "산출기준", row => row.basis),
    ],
    defaultFields: ["payment_method", "finalized_amount", "ratio", "basis"],
  },
];

export const REVENUE_REPORT_PRESETS = {
  summary: { label: "간부 요약", sections: ["overview", "certified", "closes", "reconciliation", "payment_methods"] as RevenueReportSectionId[] },
  standard: { label: "실무 종합", sections: REVENUE_REPORT_SECTIONS.map(section => section.id) },
  audit: { label: "감사 대응", sections: ["overview", "certified", "unverified", "closes", "reconciliation", "payment_methods"] as RevenueReportSectionId[] },
};

export function defaultRevenueReportFields(): Partial<Record<RevenueReportSectionId, string[]>> {
  return Object.fromEntries(REVENUE_REPORT_SECTIONS.map(section => [section.id, [...section.defaultFields]]));
}

export function parseRevenueReportOptions(parameters: Record<string, string>): RevenueReportOptions {
  const knownSections = new Set(REVENUE_REPORT_SECTIONS.map(section => section.id));
  const selectedSections = (parameters.revenue_sections || REVENUE_REPORT_PRESETS.summary.sections.join(","))
    .split(",").filter((id): id is RevenueReportSectionId => knownSections.has(id as RevenueReportSectionId));
  let selectedFields = defaultRevenueReportFields();
  try {
    const parsed = JSON.parse(parameters.revenue_fields || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) selectedFields = { ...selectedFields, ...parsed };
  } catch {
    selectedFields = defaultRevenueReportFields();
  }
  return {
    periodStart: parameters.period_start,
    periodEnd: parameters.period_end || parameters.period_start,
    selectedSections: selectedSections.length ? selectedSections : ["overview"],
    selectedFields,
    lotTypes: (parameters.revenue_lot_types || "offstreet,building,onstreet").split(",").filter(Boolean),
    sort: (["attention", "date_desc", "parking_lot", "amount_desc", "difference_desc"].includes(parameters.revenue_sort) ? parameters.revenue_sort : "attention") as RevenueReportSort,
    orientation: parameters.revenue_orientation === "landscape" ? "landscape" : "portrait",
    includeArchived: parameters.revenue_include_archived === "true",
  };
}

async function checkedQuery(label: string, promise: PromiseLike<any>, limit = 5000) {
  const result = await promise;
  if (result.error) throw new Error(`${label} 자료 조회에 실패했습니다: ${result.error.message}`);
  const rows = result.data || [];
  if (typeof result.count === "number" && result.count > rows.length && rows.length >= limit) {
    throw new Error(`${label} 자료 ${result.count}건 중 ${rows.length}건만 조회되어 보고서 생성을 중단했습니다.`);
  }
  return rows;
}

async function collectRevenueDocumentNumbers(recordIds: Set<string>) {
  if (!recordIds.size) return {};
  const modules = ["REVENUE_DAILY", "REVENUE_CLOSE", "REVENUE_RECONCILIATION"];
  const { data: links, error } = await supabase.from("attachments")
    .select("module, ref_id, file_path")
    .eq("ref_type", "official_document_link")
    .in("module", modules)
    .limit(5000);
  if (error) return {};
  const relevant = (links || []).filter(link => recordIds.has(link.ref_id));
  const ids = Array.from(new Set(relevant.map(link => String(link.file_path || "").replace("parkmaster-document://", "")).filter(Boolean)));
  if (!ids.length) return {};
  const { data: documents, error: documentError } = await supabase.from("official_documents").select("id, document_number").in("id", ids);
  if (documentError) return {};
  const numberById = new Map((documents || []).map(document => [document.id, document.document_number]));
  return relevant.reduce<Record<string, string[]>>((result, link) => {
    const documentId = String(link.file_path || "").replace("parkmaster-document://", "");
    const documentNumber = numberById.get(documentId);
    if (!documentNumber) return result;
    const key = documentKey(link.module, link.ref_id);
    result[key] = unique([...(result[key] || []), documentNumber]);
    return result;
  }, {});
}

function enumerateRevenueMissingDays(parkingLots: any[], dailyRows: any[], start: string, end: string) {
  const recorded = new Set(dailyRows.map(row => `${row.lot_id}:${dateOnly(row.revenue_date)}`));
  const rows: any[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    const day = [cursor.getFullYear(), String(cursor.getMonth() + 1).padStart(2, "0"), String(cursor.getDate()).padStart(2, "0")].join("-");
    parkingLots.forEach(parkingLot => {
      if (!recorded.has(`${parkingLot.id}:${day}`)) rows.push({ lot_id: parkingLot.id, revenue_date: day, parking_lots: parkingLot, lot_type_at_event: parkingLot.lot_type });
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

export async function collectRevenueReportData(options: RevenueReportOptions): Promise<RevenueReportDataset> {
  const [parkingLots, dailyRevenue, periodCloses, reconciliations] = await Promise.all([
    checkedQuery("주차장", supabase.from("parking_lots").select("id, code, name, lot_type, status", { count: "exact" }).limit(5000)),
    checkedQuery("일별 수입", supabase.from("revenue_daily").select("*, parking_lots(id, code, name, lot_type)", { count: "exact" }).gte("revenue_date", options.periodStart).lte("revenue_date", options.periodEnd).order("revenue_date", { ascending: false }).limit(5000)),
    checkedQuery("월 마감", (supabase.from("revenue_period_closes" as any) as any).select("*, parking_lots(id, code, name, lot_type)", { count: "exact" }).gte("period_month", `${options.periodStart.slice(0, 7)}-01`).lte("period_month", options.periodEnd).limit(5000)),
    checkedQuery("위탁대사", supabase.from("revenue_reconciliation").select("*, parking_lots(id, code, name, lot_type)", { count: "exact" }).lte("period_start", options.periodEnd).gte("period_end", options.periodStart).order("period_start", { ascending: false }).limit(5000)),
  ]);
  const activeLots = parkingLots.filter((row: any) => matchesLotType(row, options.lotTypes) && row.status !== "inactive");
  const missingDays = enumerateRevenueMissingDays(activeLots, dailyRevenue, options.periodStart, options.periodEnd);
  const recordIds = new Set<string>([...dailyRevenue, ...periodCloses, ...reconciliations].map((row: any) => row.id).filter(Boolean));
  const documentNumbers = await collectRevenueDocumentNumbers(recordIds);
  return { parkingLots, dailyRevenue, periodCloses, reconciliations, missingDays, documentNumbers };
}

function matchesLotType(row: any, selected: string[]) {
  if (!selected.length || selected.length === REVENUE_LOT_TYPE_OPTIONS.length) return true;
  const actual = lotType(row);
  return selected.some(group => (LOT_TYPE_ALIASES[group] || [group]).includes(actual));
}

function inPeriod(value: unknown, options: RevenueReportOptions) {
  const date = dateOnly(value);
  return date !== "-" && date >= options.periodStart && date <= options.periodEnd;
}

function closeKey(row: any) {
  return `${lotId(row)}:${monthKey(row.period_month)}`;
}

function dailyCloseKey(row: any) {
  return `${lotId(row)}:${monthKey(row.revenue_date)}`;
}

function sortRows(rows: any[], sort: RevenueReportSort) {
  return [...rows].sort((a, b) => {
    const dateA = a.revenue_date || a.period_month || a.period_start || "";
    const dateB = b.revenue_date || b.period_month || b.period_start || "";
    if (sort === "date_desc") return String(dateB).localeCompare(String(dateA));
    if (sort === "parking_lot") return lotName(a).localeCompare(lotName(b), "ko", { numeric: true }) || String(dateB).localeCompare(String(dateA));
    if (sort === "amount_desc") {
      const amount = (row: any) => row.finalized_amount ?? row.total_amount ?? (row.recon_number ? reconciliationReportedTotal(row) : dailyTotal(row));
      return number(amount(b)) - number(amount(a));
    }
    if (sort === "difference_desc") return Math.abs(reconciliationDifference(b)) - Math.abs(reconciliationDifference(a));
    const attentionRank = (row: any) => row.__record_type === "missing" || row.verified === false || ["discrepancy", "disputed"].includes(row.status) || row.is_closed === false ? 0 : ["pending", "reviewing"].includes(row.status) ? 1 : 5;
    return attentionRank(a) - attentionRank(b) || String(dateB).localeCompare(String(dateA));
  });
}

const TABLE_IDENTITY_FIELDS: Record<Exclude<RevenueReportSectionId, "overview">, string[]> = {
  certified: ["revenue_date", "lot"],
  unverified: ["record_type", "revenue_date", "lot"],
  closes: ["period_month", "lot"],
  reconciliation: ["recon_number", "lot", "period"],
  payment_methods: ["payment_method"],
};

const TABLE_GROUP_TITLES: Record<Exclude<RevenueReportSectionId, "overview">, string[]> = {
  certified: ["원장·결제수단별 확정액", "이용·감면·검증·문서 근거"],
  unverified: ["미검증·누락 대상", "확인사항·문서 근거"],
  closes: ["월 마감 현황", "재개방·문서 근거"],
  reconciliation: ["업체보고·시스템집계 비교", "차이분석·처리·문서 근거"],
  payment_methods: ["확정수입 결제수단 구성"],
};

function splitRevenueFields(id: Exclude<RevenueReportSectionId, "overview">, fields: RevenueReportField[], orientation: RevenueReportOrientation) {
  const maximumColumns = orientation === "portrait" ? 10 : 14;
  if (fields.length <= maximumColumns) return [fields];
  const identity = fields.filter(item => TABLE_IDENTITY_FIELDS[id].includes(item.key));
  const details = fields.filter(item => !TABLE_IDENTITY_FIELDS[id].includes(item.key));
  const detailLimit = Math.max(1, maximumColumns - identity.length);
  const groups: RevenueReportField[][] = [];
  for (let index = 0; index < details.length; index += detailLimit) groups.push([...identity, ...details.slice(index, index + detailLimit)]);
  return groups;
}

function paymentMethodRows(certifiedRows: any[]) {
  const total = certifiedRows.reduce((sum, row) => sum + dailyTotal(row), 0);
  return [
    ["현금", "cash_amount"], ["카드", "card_amount"], ["모바일", "mobile_amount"], ["월정기권", "monthly_pass_amount"], ["기타", "other_amount"],
  ].map(([payment_method, key]) => {
    const finalized_amount = certifiedRows.reduce((sum, row) => sum + number(row[key]), 0);
    return { payment_method, finalized_amount, ratio: total ? finalized_amount / total * 100 : 0, basis: "검증 완료·월 마감 원장" };
  });
}

export function buildRevenueReportModel(dataset: RevenueReportDataset, options: RevenueReportOptions): RevenueReportModel {
  const dailyRows = dataset.dailyRevenue.filter(row => matchesLotType(row, options.lotTypes) && inPeriod(row.revenue_date, options) && (options.includeArchived || !isArchived(row)));
  const closes = dataset.periodCloses.filter(row => matchesLotType(row, options.lotTypes) && monthKey(row.period_month) >= monthKey(options.periodStart) && monthKey(row.period_month) <= monthKey(options.periodEnd) && (options.includeArchived || !isArchived(row)));
  const closedKeys = new Set(closes.filter(row => row.is_closed).map(closeKey));
  const certifiedRows = dailyRows.filter(row => row.verified && closedKeys.has(dailyCloseKey(row)));
  const verifiedRows = dailyRows.filter(row => row.verified);
  const unverifiedRows = dailyRows.filter(row => !row.verified);
  const verifiedPendingClose = verifiedRows.filter(row => !closedKeys.has(dailyCloseKey(row)));
  const missingRows = dataset.missingDays.filter(row => matchesLotType(row, options.lotTypes) && inPeriod(row.revenue_date, options)).map(row => ({ ...row, __record_type: "missing" }));
  const reconciliationRows = dataset.reconciliations.filter(row => matchesLotType(row, options.lotTypes) && dateOnly(row.period_end) >= options.periodStart && dateOnly(row.period_start) <= options.periodEnd && (options.includeArchived || !isArchived(row)));
  const paymentRows = paymentMethodRows(certifiedRows);
  const documentCount = Object.values(dataset.documentNumbers).reduce((sum, values) => sum + unique(values).length, 0);
  const integrityMismatchRows = dailyRows.filter(row => row.total_amount !== null && row.total_amount !== undefined && number(row.total_amount) !== dailyTotal(row)).length;
  const openReconciliations = reconciliationRows.filter(row => !["matched", "resolved"].includes(row.status)).length;
  const summary: RevenueReportSummary = {
    parkingLots: dataset.parkingLots.filter(row => matchesLotType(row, options.lotTypes)).length,
    dailyRows: dailyRows.length,
    verifiedRows: verifiedRows.length,
    certifiedRows: certifiedRows.length,
    verifiedPendingClose: verifiedPendingClose.length,
    unverifiedRows: unverifiedRows.length,
    missingDays: missingRows.length,
    finalizedRevenue: certifiedRows.reduce((sum, row) => sum + dailyTotal(row), 0),
    unverifiedRevenue: unverifiedRows.reduce((sum, row) => sum + dailyTotal(row), 0),
    closedLots: new Set(closes.filter(row => row.is_closed).map(row => lotId(row))).size,
    reconciliationRows: reconciliationRows.length,
    openReconciliations,
    reconciliationNetDifference: reconciliationRows.reduce((sum, row) => sum + reconciliationDifference(row), 0),
    reconciliationAbsoluteDifference: reconciliationRows.reduce((sum, row) => sum + Math.abs(reconciliationDifference(row)), 0),
    integrityMismatchRows,
    linkedDocuments: documentCount,
    cashAmount: certifiedRows.reduce((sum, row) => sum + number(row.cash_amount), 0),
    cardAmount: certifiedRows.reduce((sum, row) => sum + number(row.card_amount), 0),
    mobileAmount: certifiedRows.reduce((sum, row) => sum + number(row.mobile_amount), 0),
    monthlyPassAmount: certifiedRows.reduce((sum, row) => sum + number(row.monthly_pass_amount), 0),
    otherAmount: certifiedRows.reduce((sum, row) => sum + number(row.other_amount), 0),
  };
  const rowsBySection: Record<Exclude<RevenueReportSectionId, "overview">, any[]> = {
    certified: certifiedRows,
    unverified: [...unverifiedRows.map(row => ({ ...row, __record_type: "unverified" })), ...missingRows],
    closes,
    reconciliation: reconciliationRows,
    payment_methods: paymentRows,
  };
  const tables = options.selectedSections.filter((id): id is Exclude<RevenueReportSectionId, "overview"> => id !== "overview").flatMap(id => {
    const section = REVENUE_REPORT_SECTIONS.find(item => item.id === id)!;
    const requested = options.selectedFields[id] || section.defaultFields;
    const fields = section.fields.filter(item => requested.includes(item.key));
    const sourceRows = sortRows(rowsBySection[id], options.sort);
    const groups = splitRevenueFields(id, fields, options.orientation);
    return groups.map((group, groupIndex) => ({
      id: id as any,
      title: section.label,
      subtitle: groups.length > 1 ? (TABLE_GROUP_TITLES[id][groupIndex] || `${section.label} 세부정보`) : undefined,
      subtitleNumber: groups.length > 1 ? groupIndex + 1 : undefined,
      continuation: groupIndex > 0,
      columns: group.map(item => ({ key: item.key, label: item.label })),
      rows: sourceRows.map(row => Object.fromEntries(group.map(item => [item.key, text(item.value(row, dataset))]))),
    } as OperationsReportTable));
  });
  const selectedFields = options.selectedSections.flatMap(id => {
    const section = REVENUE_REPORT_SECTIONS.find(item => item.id === id)!;
    return section.fields.filter(item => (options.selectedFields[id] || section.defaultFields).includes(item.key));
  });
  const attentionNarrative = [
    unverifiedRows.length ? `미검증 수입원장 ${unverifiedRows.length}건` : "미검증 수입원장 없음",
    missingRows.length ? `누락일 ${missingRows.length}건` : "누락일 없음",
    verifiedPendingClose.length ? `검증 후 월마감 대기 ${verifiedPendingClose.length}건` : "검증 후 월마감 대기 없음",
    openReconciliations ? `미해결 위탁대사 ${openReconciliations}건` : "미해결 위탁대사 없음",
    integrityMismatchRows ? `결제수단 합계 불일치 ${integrityMismatchRows}건` : "결제수단 합계 불일치 없음",
  ].join("; ");
  return {
    period: { start: options.periodStart, end: options.periodEnd },
    lotTypeLabels: REVENUE_LOT_TYPE_OPTIONS.filter(item => options.lotTypes.includes(item.value)).map(item => item.label),
    summary,
    sourceCounts: { lots: summary.parkingLots, daily: dailyRows.length, closes: closes.length, reconciliations: reconciliationRows.length, missingDays: missingRows.length, documents: documentCount, paymentMethods: paymentRows.length },
    tables,
    selectedFieldCount: selectedFields.length,
    protectedFieldCount: selectedFields.filter(item => item.protected).length,
    attentionNarrative,
  };
}

export function revenueReportBriefRows(model: RevenueReportModel, documentSummary?: string): string[][] {
  return [
    ["담당부서", PRIMARY_DEPARTMENT],
    ["보고기간", `${model.period.start} ~ ${model.period.end}`],
    ["보고대상", `제주시 ${model.lotTypeLabels.join("·") || "공영주차장 전체"}`],
    ["주요내용", unique(model.tables.filter(table => !table.continuation).map(table => table.title)).join("·") || "수입관리 핵심 현황"],
    ["작성목적", documentSummary || "공영주차장 수입원장의 검증·월마감 상태와 위탁대사 차이를 확인하여 정산 오류와 누락을 예방하기 위함."],
    ["산출기준", `검증 완료 후 월 마감된 수입원장 ${model.summary.certifiedRows.toLocaleString("ko-KR")}건을 확정수입으로 집계하고, 미검증·누락·미마감 자료는 별도 표시함. ${REVENUE_RECONCILIATION_SCOPE_NOTICE} ${model.attentionNarrative}`],
  ];
}

export function revenueReportSummaryRows(model: RevenueReportModel): string[][] {
  return [
    ["대상 주차장", `${model.summary.parkingLots.toLocaleString("ko-KR")}개소`, "확정 수입", won(model.summary.finalizedRevenue)],
    ["확정 원장", `${model.summary.certifiedRows.toLocaleString("ko-KR")}건`, "미검증 원장", `${model.summary.unverifiedRows.toLocaleString("ko-KR")}건`],
    ["월마감 주차장", `${model.summary.closedLots.toLocaleString("ko-KR")}개소`, "검증 후 마감대기", `${model.summary.verifiedPendingClose.toLocaleString("ko-KR")}건`],
    ["누락일", `${model.summary.missingDays.toLocaleString("ko-KR")}건`, "미검증 입력액", won(model.summary.unverifiedRevenue)],
    ["위탁대사", `${model.summary.reconciliationRows.toLocaleString("ko-KR")}건`, "미해결 위탁대사", `${model.summary.openReconciliations.toLocaleString("ko-KR")}건`],
    ["대사 차이 절대합", won(model.summary.reconciliationAbsoluteDifference), "결제합계 불일치", `${model.summary.integrityMismatchRows.toLocaleString("ko-KR")}건`],
    ["현금 확정액", won(model.summary.cashAmount), "카드 확정액", won(model.summary.cardAmount)],
    ["모바일 확정액", won(model.summary.mobileAmount), "월정기권 확정액", won(model.summary.monthlyPassAmount)],
    ["연결 공식문서", `${model.summary.linkedDocuments.toLocaleString("ko-KR")}건`, "외부 수납자료", "미연계"],
  ];
}

export function toOperationsCompatibleRevenueModel(model: RevenueReportModel): OperationsReportModel {
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

export async function getRevenueReportEvidence(parameters: Record<string, string>) {
  const options = parseRevenueReportOptions(parameters);
  const dataset = await collectRevenueReportData(options);
  const model = buildRevenueReportModel(dataset, options);
  return {
    period: model.period,
    sourceCounts: model.sourceCounts,
    summary: model.summary,
    selectedFieldCount: model.selectedFieldCount,
    protectedFieldCount: model.protectedFieldCount,
    attentionNarrative: model.attentionNarrative,
  };
}
