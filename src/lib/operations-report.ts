import { HwpxReader, htmlToHwpx } from "hwp-convert";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { PRIMARY_DEPARTMENT, PRIMARY_ORGANIZATION } from "@/config/organization";

export type OperationsReportSectionId =
  | "overview"
  | "lots"
  | "contracts"
  | "staff"
  | "fees"
  | "exemptions"
  | "passes"
  | "enforcement"
  | "free_hours"
  | "abandoned"
  | "security";

export type OperationsReportSort = "parking_lot" | "date_desc" | "status" | "amount_desc";
export type OperationsReportOrientation = "portrait" | "landscape";

export interface OperationsReportField {
  key: string;
  label: string;
  sensitive?: boolean;
  value: (row: any) => unknown;
}

export interface OperationsReportSection {
  id: OperationsReportSectionId;
  label: string;
  description: string;
  fields: OperationsReportField[];
  defaultFields: string[];
}

export interface OperationsReportOptions {
  periodStart: string;
  periodEnd: string;
  selectedSections: OperationsReportSectionId[];
  selectedFields: Partial<Record<OperationsReportSectionId, string[]>>;
  lotTypes: string[];
  sort: OperationsReportSort;
  orientation: OperationsReportOrientation;
  includeInactive: boolean;
}

export interface OperationsReportDataset {
  parkingLots: any[];
  contracts: any[];
  staff: any[];
  fees: any[];
  exemptions: any[];
  passes: any[];
  enforcement: any[];
  freeHours: any[];
  abandoned: any[];
  security: any[];
}

export interface OperationsReportTable {
  id: OperationsReportSectionId;
  title: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string>>;
}

export interface OperationsReportModel {
  period: { start: string; end: string };
  lotTypeLabels: string[];
  summary: Record<string, number>;
  sourceCounts: Record<string, number>;
  tables: OperationsReportTable[];
  selectedFieldCount: number;
  sensitiveFieldCount: number;
}

export interface OperationsReportBriefInput {
  model: OperationsReportModel;
  authorName?: string;
  documentSummary?: string;
}

const LOT_TYPE_ALIASES: Record<string, string[]> = {
  offstreet: ["offstreet", "surface"],
  building: ["building", "parking_building", "multilevel", "mechanical"],
  onstreet: ["onstreet"],
};

export const OPERATIONS_LOT_TYPE_OPTIONS = [
  { value: "offstreet", label: "노외주차장" },
  { value: "building", label: "주차빌딩" },
  { value: "onstreet", label: "노상주차장" },
];

const relation = (row: any) => Array.isArray(row?.parking_lots) ? row.parking_lots[0] : row?.parking_lots;
const lotName = (row: any) => relation(row)?.name || row?.parking_lot_name || "공통";
const lotType = (row: any) => relation(row)?.lot_type || row?.lot_type || "";
const payload = (row: any, key: string) => row?.payload?.[key] ?? "";
const dateOnly = (value: unknown) => value ? String(value).split("T")[0] : "-";
const yesNo = (value: unknown) => value ? "예" : "아니오";
const won = (value: unknown) => `${Number(value || 0).toLocaleString("ko-KR")}원`;
const text = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);

const LOT_TYPE_LABELS: Record<string, string> = {
  offstreet: "노외주차장", surface: "노외주차장", building: "주차빌딩",
  parking_building: "주차빌딩", multilevel: "주차빌딩", mechanical: "주차빌딩", onstreet: "노상주차장",
};

const STATUS_LABELS: Record<string, string> = {
  active: "운영", inactive: "중지", normal: "정상", registered: "등록", assigned: "배정",
  in_progress: "진행중", review: "검토", completed: "완료", on_hold: "보류", unpaid: "미납",
  overdue: "체납", paid: "납부", cancelled: "취소", expired: "만료", pending: "대기",
};

const OPERATOR_TYPE_LABELS: Record<string, string> = {
  direct: "직영", outsourced: "위탁", mixed: "혼합", other: "기타",
};

const field = (key: string, label: string, value: (row: any) => unknown, sensitive = false): OperationsReportField => ({ key, label, value, sensitive });

export const OPERATIONS_REPORT_SECTIONS: OperationsReportSection[] = [
  { id: "overview", label: "핵심 현황", description: "전체 운영지표와 주차장 형태별 현황", fields: [], defaultFields: [] },
  {
    id: "lots", label: "주차장 운영", description: "주차장 형태·운영방식·주차면·상태",
    fields: [field("code", "코드", r => r.code), field("name", "주차장", r => r.name), field("lot_type", "형태", r => LOT_TYPE_LABELS[r.lot_type] || r.lot_type), field("operator_type", "운영방식", r => OPERATOR_TYPE_LABELS[r.operator_type] || r.operator_type), field("operator_name", "운영기관·업체", r => r.operator_name), field("total_spaces", "주차면", r => r.total_spaces), field("floors", "층수", r => r.floors), field("status", "상태", r => STATUS_LABELS[r.status] || r.status), field("document_number", "문서번호", r => r.document_number), field("updated_at", "최근수정", r => dateOnly(r.updated_at))],
    defaultFields: ["code", "name", "lot_type", "operator_type", "total_spaces", "status"],
  },
  {
    id: "contracts", label: "위탁 계약", description: "위탁업체·기간·금액·만료 및 담당자",
    fields: [field("lot", "주차장", lotName), field("lot_type", "형태", r => LOT_TYPE_LABELS[lotType(r)] || lotType(r)), field("company_name", "위탁업체", r => r.company_name), field("contract_number", "계약번호", r => r.contract_number), field("contract_start", "시작일", r => dateOnly(r.contract_start)), field("contract_end", "종료일", r => dateOnly(r.contract_end)), field("contract_amount", "계약금액", r => won(r.contract_amount)), field("status", "상태", r => STATUS_LABELS[r.status] || r.status), field("contact_person", "업체 담당자", r => r.contact_person, true), field("contact_phone", "담당자 연락처", r => r.contact_phone, true), field("document_number", "문서번호", r => r.document_number)],
    defaultFields: ["lot", "lot_type", "company_name", "contract_number", "contract_start", "contract_end", "contract_amount", "status"],
  },
  {
    id: "staff", label: "인력 관리", description: "주차장별 근무인력과 재직 상태",
    fields: [field("lot", "주차장", lotName), field("lot_type", "형태", r => LOT_TYPE_LABELS[lotType(r)] || lotType(r)), field("staff_name", "성명", r => r.staff_name, true), field("position", "직책", r => r.position), field("staff_type", "고용유형", r => r.staff_type), field("hire_date", "입사일", r => dateOnly(r.hire_date)), field("phone", "연락처", r => r.phone, true), field("is_active", "재직", r => yesNo(r.is_active))],
    defaultFields: ["lot", "lot_type", "position", "staff_type", "hire_date", "is_active"],
  },
  {
    id: "fees", label: "요금 정책", description: "주차장별 요금·적용기간·법적 근거",
    fields: [field("lot", "주차장", lotName), field("lot_type", "형태", r => LOT_TYPE_LABELS[lotType(r)] || lotType(r)), field("policy_name", "정책명", r => r.policy_name), field("day_type", "요일구분", r => r.day_type), field("time", "적용시간", r => `${text(r.time_start)}~${text(r.time_end)}`), field("base_fee", "기본요금", r => won(r.base_fee)), field("add_fee", "추가요금", r => won(r.add_fee)), field("daily_max", "일최대", r => won(r.daily_max)), field("monthly_pass_fee", "정기권", r => won(r.monthly_pass_fee)), field("effective", "적용기간", r => `${dateOnly(r.effective_from)}~${dateOnly(r.effective_to)}`), field("legal_basis", "근거", r => r.legal_basis), field("is_active", "사용", r => yesNo(r.is_active))],
    defaultFields: ["lot", "lot_type", "policy_name", "day_type", "time", "base_fee", "daily_max", "effective", "is_active"],
  },
  {
    id: "exemptions", label: "감면 관리", description: "감면 대상·율·증빙·법적 근거",
    fields: [field("lot", "주차장", lotName), field("exemption_name", "감면명", r => r.exemption_name), field("exemption_type", "대상", r => r.exemption_type), field("discount", "감면", r => r.discount_type === "rate" ? `${Number(r.discount_rate || 0)}%` : won(r.discount_amount)), field("max_hours", "최대시간", r => r.max_hours), field("required_documents", "증빙서류", r => r.required_documents), field("legal_basis", "근거", r => r.legal_basis), field("effective", "적용기간", r => `${dateOnly(r.effective_from)}~${dateOnly(r.effective_to)}`), field("is_active", "사용", r => yesNo(r.is_active))],
    defaultFields: ["lot", "exemption_name", "exemption_type", "discount", "required_documents", "legal_basis", "is_active"],
  },
  {
    id: "passes", label: "월정기권", description: "정기권 발급·기간·수납 상태",
    fields: [field("pass_number", "정기권번호", r => r.pass_number), field("lot", "주차장", lotName), field("lot_type", "형태", r => LOT_TYPE_LABELS[lotType(r)] || lotType(r)), field("vehicle_number", "차량번호", r => r.vehicle_number, true), field("holder_name", "이용자", r => r.holder_name, true), field("period", "사용기간", r => `${dateOnly(r.pass_start)}\n~ ${dateOnly(r.pass_end)}`), field("fee_amount", "부과액", r => won(r.fee_amount)), field("fee_paid", "납부액", r => won(r.fee_paid)), field("receipt_number", "영수증", r => r.receipt_number), field("status", "상태", r => STATUS_LABELS[r.status] || r.status), field("auto_renew", "자동갱신", r => yesNo(r.auto_renew))],
    defaultFields: ["pass_number", "lot", "lot_type", "period", "fee_amount", "fee_paid", "status"],
  },
  {
    id: "enforcement", label: "단속 기록", description: "단속·납부·이의신청·공식 문서 연계",
    fields: [field("enforcement_number", "단속번호", r => r.enforcement_number), field("violation_date", "단속일", r => dateOnly(r.violation_date)), field("lot", "주차장", lotName), field("lot_type", "형태", r => LOT_TYPE_LABELS[lotType(r)] || lotType(r)), field("vehicle_number", "차량번호", r => r.vehicle_number, true), field("violation_type", "위반유형", r => r.violation_type), field("violation_location", "위치", r => r.violation_location), field("fine_amount", "부과액", r => won(r.fine_amount)), field("fine_due_date", "납부기한", r => dateOnly(r.fine_due_date)), field("payment_status", "납부상태", r => STATUS_LABELS[r.payment_status] || r.payment_status), field("appeal_status", "이의상태", r => r.appeal_status), field("document_number", "문서번호", r => r.document_number)],
    defaultFields: ["enforcement_number", "violation_date", "lot", "lot_type", "violation_type", "fine_amount", "fine_due_date", "payment_status", "document_number"],
  },
  {
    id: "free_hours", label: "무료개방", description: "무료개방 시간·사유·적용기간",
    fields: [field("lot", "주차장", lotName), field("lot_type", "형태", r => LOT_TYPE_LABELS[lotType(r)] || lotType(r)), field("setting_name", "설정명", r => r.setting_name), field("day_type", "요일구분", r => r.day_type), field("time", "개방시간", r => `${text(r.start_time)}~${text(r.end_time)}`), field("reason", "사유", r => r.reason), field("effective", "적용기간", r => `${dateOnly(r.effective_from)}~${dateOnly(r.effective_to)}`), field("is_active", "사용", r => yesNo(r.is_active))],
    defaultFields: ["lot", "lot_type", "setting_name", "day_type", "time", "reason", "effective", "is_active"],
  },
  {
    id: "abandoned", label: "방치차량 처리", description: "신고부터 견인·종결 근거까지",
    fields: [field("record_number", "관리번호", r => r.record_number), field("title", "사건", r => r.title), field("parking_lot", "발견장소", r => r.parking_lot_name || lotName(r)), field("vehicle_number", "차량번호", r => payload(r, "vehicleNumber"), true), field("reported_at", "신고일", r => dateOnly(payload(r, "reportedAt"))), field("owner_name", "담당자", r => r.owner_name), field("due_date", "처리기한", r => dateOnly(r.due_date)), field("disposition", "처분", r => payload(r, "disposition")), field("status", "단계", r => STATUS_LABELS[r.status] || r.status), field("document_number", "문서번호", r => r.document_number), field("evidence", "종결근거", r => payload(r, "completionEvidence"))],
    defaultFields: ["record_number", "title", "parking_lot", "reported_at", "owner_name", "due_date", "disposition", "status", "document_number"],
  },
  {
    id: "security", label: "관제·보안 점검", description: "CCTV·영상반출·비상벨 점검 및 시정조치",
    fields: [field("record_number", "점검번호", r => r.record_number), field("title", "점검명", r => r.title), field("parking_lot", "대상", r => r.parking_lot_name || lotName(r)), field("inspection_type", "점검유형", r => payload(r, "inspectionType")), field("inspection_date", "점검일", r => dateOnly(payload(r, "inspectionDate"))), field("owner_name", "담당자", r => r.owner_name), field("finding", "지적사항", r => payload(r, "finding")), field("corrective_action", "시정조치", r => payload(r, "correctiveAction")), field("status", "단계", r => STATUS_LABELS[r.status] || r.status), field("document_number", "문서번호", r => r.document_number), field("evidence", "완료근거", r => payload(r, "completionEvidence"))],
    defaultFields: ["record_number", "title", "parking_lot", "inspection_type", "inspection_date", "owner_name", "finding", "corrective_action", "status", "document_number"],
  },
];

export const OPERATIONS_REPORT_PRESETS = {
  summary: { label: "간부 보고", sections: ["overview", "lots", "contracts", "passes", "enforcement"] as OperationsReportSectionId[] },
  standard: { label: "실무 종합", sections: OPERATIONS_REPORT_SECTIONS.map(section => section.id) },
  audit: { label: "감사 대응", sections: ["overview", "contracts", "fees", "exemptions", "passes", "enforcement", "free_hours", "abandoned", "security"] as OperationsReportSectionId[] },
};

export function defaultOperationsReportFields(): Partial<Record<OperationsReportSectionId, string[]>> {
  return Object.fromEntries(OPERATIONS_REPORT_SECTIONS.map(section => [section.id, [...section.defaultFields]]));
}

export function parseOperationsReportOptions(parameters: Record<string, string>): OperationsReportOptions {
  const knownSections = new Set(OPERATIONS_REPORT_SECTIONS.map(section => section.id));
  const selectedSections = (parameters.ops_sections || OPERATIONS_REPORT_PRESETS.summary.sections.join(","))
    .split(",").filter((id): id is OperationsReportSectionId => knownSections.has(id as OperationsReportSectionId));
  let selectedFields = defaultOperationsReportFields();
  try {
    const parsed = JSON.parse(parameters.ops_fields || "{}");
    if (parsed && typeof parsed === "object") selectedFields = { ...selectedFields, ...parsed };
  } catch {
    selectedFields = defaultOperationsReportFields();
  }
  return {
    periodStart: parameters.period_start,
    periodEnd: parameters.period_end || parameters.period_start,
    selectedSections: selectedSections.length ? selectedSections : ["overview"],
    selectedFields,
    lotTypes: (parameters.ops_lot_types || "offstreet,building,onstreet").split(",").filter(Boolean),
    sort: (["parking_lot", "date_desc", "status", "amount_desc"].includes(parameters.ops_sort) ? parameters.ops_sort : "parking_lot") as OperationsReportSort,
    orientation: parameters.ops_orientation === "landscape" ? "landscape" : "portrait",
    includeInactive: parameters.ops_include_inactive === "true",
  };
}

function matchesLotType(row: any, selected: string[]) {
  if (!selected.length || selected.length === OPERATIONS_LOT_TYPE_OPTIONS.length) return true;
  const actual = row?.lot_type || lotType(row);
  if (!actual && row?.lot_id == null) return true;
  return selected.some(group => (LOT_TYPE_ALIASES[group] || [group]).includes(actual));
}

function overlaps(start: unknown, end: unknown, periodStart: string, periodEnd: string) {
  const rowStart = start ? dateOnly(start) : "0000-01-01";
  const rowEnd = end ? dateOnly(end) : "9999-12-31";
  return rowStart <= periodEnd && rowEnd >= periodStart;
}

async function checkedQuery(label: string, promise: PromiseLike<any>, limit = 2000) {
  const result = await promise;
  if (result.error) throw new Error(`${label} 자료 조회에 실패했습니다: ${result.error.message}`);
  const rows = result.data || [];
  if (typeof result.count === "number" && result.count > rows.length && rows.length >= limit) {
    throw new Error(`${label} 자료 ${result.count}건 중 ${rows.length}건만 조회되어 보고서 생성을 중단했습니다.`);
  }
  return rows;
}

export async function collectOperationsReportData(options: OperationsReportOptions): Promise<OperationsReportDataset> {
  const selected = new Set(options.selectedSections);
  const query = (enabled: boolean, label: string, promise: PromiseLike<any>) => enabled ? checkedQuery(label, promise) : Promise.resolve([]);
  const endAt = `${options.periodEnd}T23:59:59`;
  const startAt = `${options.periodStart}T00:00:00`;
  const [parkingLots, contracts, staff, fees, exemptions, passes, enforcement, freeHours, abandoned, security] = await Promise.all([
    query(selected.has("overview") || selected.has("lots"), "주차장", supabase.from("parking_lots").select("id, code, name, lot_type, operator_type, operator_name, total_spaces, floors, status, updated_at", { count: "exact" }).limit(2000)),
    query(selected.has("contracts"), "위탁계약", supabase.from("outsourcing_contracts").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).limit(2000)),
    query(selected.has("staff"), "운영인력", supabase.from("operations_staff").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).limit(2000)),
    query(selected.has("fees"), "요금정책", supabase.from("fee_policies").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).limit(2000)),
    query(selected.has("exemptions"), "감면정책", supabase.from("fee_exemptions").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).limit(2000)),
    query(selected.has("passes"), "월정기권", supabase.from("monthly_passes").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).limit(2000)),
    query(selected.has("enforcement"), "단속기록", supabase.from("enforcement_records").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).gte("violation_date", startAt).lte("violation_date", endAt).limit(2000)),
    query(selected.has("free_hours"), "무료개방", supabase.from("free_hours_settings").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).limit(2000)),
    query(selected.has("abandoned"), "방치차량", (supabase as any).from("team_work_records").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).eq("team", "operations").contains("payload", { workflow_key: "abandoned_vehicle" }).is("archived_at", null).limit(2000)),
    query(selected.has("security"), "관제·보안점검", (supabase as any).from("team_work_records").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).eq("team", "operations").contains("payload", { workflow_key: "security_inspection" }).is("archived_at", null).limit(2000)),
  ]);

  const lotFiltered = (rows: any[]) => rows.filter(row => matchesLotType(row, options.lotTypes));
  return {
    parkingLots: lotFiltered(parkingLots),
    contracts: lotFiltered(contracts).filter(row => overlaps(row.contract_start, row.contract_end, options.periodStart, options.periodEnd) && (options.includeInactive || row.status === "active")),
    staff: lotFiltered(staff).filter(row => options.includeInactive || row.is_active),
    fees: lotFiltered(fees).filter(row => overlaps(row.effective_from, row.effective_to, options.periodStart, options.periodEnd) && (options.includeInactive || row.is_active)),
    exemptions: lotFiltered(exemptions).filter(row => overlaps(row.effective_from, row.effective_to, options.periodStart, options.periodEnd) && (options.includeInactive || row.is_active)),
    passes: lotFiltered(passes).filter(row => overlaps(row.pass_start, row.pass_end, options.periodStart, options.periodEnd) && (options.includeInactive || row.status === "active")),
    enforcement: lotFiltered(enforcement),
    freeHours: lotFiltered(freeHours).filter(row => overlaps(row.effective_from, row.effective_to, options.periodStart, options.periodEnd) && (options.includeInactive || row.is_active)),
    abandoned: lotFiltered(abandoned),
    security: lotFiltered(security),
  };
}

function sortRows(rows: any[], sort: OperationsReportSort) {
  const statusOrder: Record<string, number> = { overdue: 0, unpaid: 1, on_hold: 2, registered: 3, assigned: 4, in_progress: 5, review: 6, active: 7, completed: 8, paid: 9 };
  const dateValue = (row: any) => row.violation_date || row.contract_end || row.pass_end || row.effective_from || payload(row, "inspectionDate") || payload(row, "reportedAt") || row.updated_at || row.created_at || "";
  const amountValue = (row: any) => Number(row.contract_amount || row.fine_amount || row.fee_amount || row.base_fee || row.discount_amount || 0);
  return [...rows].sort((a, b) => {
    if (sort === "date_desc") return String(dateValue(b)).localeCompare(String(dateValue(a)), "ko");
    if (sort === "status") return (statusOrder[a.status || a.payment_status] ?? 50) - (statusOrder[b.status || b.payment_status] ?? 50);
    if (sort === "amount_desc") return amountValue(b) - amountValue(a);
    return lotName(a).localeCompare(lotName(b), "ko", { numeric: true }) || text(a.code || a.record_number).localeCompare(text(b.code || b.record_number), "ko", { numeric: true });
  });
}

const DATASET_KEY: Record<Exclude<OperationsReportSectionId, "overview">, keyof OperationsReportDataset> = {
  lots: "parkingLots", contracts: "contracts", staff: "staff", fees: "fees", exemptions: "exemptions",
  passes: "passes", enforcement: "enforcement", free_hours: "freeHours", abandoned: "abandoned", security: "security",
};

export function buildOperationsReportModel(dataset: OperationsReportDataset, options: OperationsReportOptions): OperationsReportModel {
  const lots = dataset.parkingLots;
  const totalFine = dataset.enforcement.reduce((sum, row) => sum + Number(row.fine_amount || 0), 0);
  const unpaidFine = dataset.enforcement.filter(row => ["unpaid", "overdue"].includes(row.payment_status)).reduce((sum, row) => sum + Number(row.fine_amount || 0), 0);
  const summary = {
    parkingLots: lots.length,
    totalSpaces: lots.reduce((sum, row) => sum + Number(row.total_spaces || 0), 0),
    activeContracts: dataset.contracts.filter(row => row.status === "active").length,
    activeStaff: dataset.staff.filter(row => row.is_active).length,
    activePasses: dataset.passes.filter(row => row.status === "active").length,
    enforcementCount: dataset.enforcement.length,
    totalFine,
    unpaidFine,
    openAbandoned: dataset.abandoned.filter(row => row.status !== "completed").length,
    openSecurity: dataset.security.filter(row => row.status !== "completed").length,
  };
  const tables = options.selectedSections.filter((id): id is Exclude<OperationsReportSectionId, "overview"> => id !== "overview").map(id => {
    const section = OPERATIONS_REPORT_SECTIONS.find(item => item.id === id)!;
    const requested = options.selectedFields[id] || section.defaultFields;
    const selectedFields = section.fields.filter(item => requested.includes(item.key));
    const rows = sortRows(dataset[DATASET_KEY[id]], options.sort).map(row => Object.fromEntries(selectedFields.map(item => [item.key, text(item.value(row))])));
    return { id, title: section.label, columns: selectedFields.map(item => ({ key: item.key, label: item.label })), rows };
  });
  const selectedFields = options.selectedSections.flatMap(id => {
    const section = OPERATIONS_REPORT_SECTIONS.find(item => item.id === id)!;
    return section.fields.filter(item => (options.selectedFields[id] || section.defaultFields).includes(item.key));
  });
  return {
    period: { start: options.periodStart, end: options.periodEnd },
    lotTypeLabels: OPERATIONS_LOT_TYPE_OPTIONS.filter(item => options.lotTypes.includes(item.value)).map(item => item.label),
    summary,
    sourceCounts: {
      lots: dataset.parkingLots.length, contracts: dataset.contracts.length, staff: dataset.staff.length,
      fees: dataset.fees.length, exemptions: dataset.exemptions.length, passes: dataset.passes.length,
      enforcement: dataset.enforcement.length, freeHours: dataset.freeHours.length,
      abandoned: dataset.abandoned.length, security: dataset.security.length,
    },
    tables,
    selectedFieldCount: selectedFields.length,
    sensitiveFieldCount: selectedFields.filter(item => item.sensitive).length,
  };
}

/** Preserve every selected field as an independent column in a single section table. */
export function fitOperationsReportTable(table: OperationsReportTable, _orientation: OperationsReportOrientation): OperationsReportTable {
  return table;
}

export function buildOperationsReportBrief(input: OperationsReportBriefInput): string[][] {
  const { model } = input;
  const sourceCount = Object.values(model.sourceCounts).reduce((sum, count) => sum + Number(count || 0), 0);
  const subjects = model.tables.map(table => table.title).join("·") || "핵심 운영지표";
  const places = model.lotTypeLabels.length ? `제주시 ${model.lotTypeLabels.join("·")}` : "제주시 공영주차장 전체";
  return [
    ["담당부서", PRIMARY_DEPARTMENT],
    ["보고기간", `${model.period.start} ~ ${model.period.end}`],
    ["보고대상", places],
    ["주요내용", `${subjects}의 운영 현황 및 조치 필요사항`],
    ["작성목적", input.documentSummary || "공영주차장 운영 현황을 파악하고 후속 조치의 우선순위를 결정하기 위함."],
    ["산출기준", `보고기간 내 ParkMaster에 등록된 업무자료 ${sourceCount.toLocaleString("ko-KR")}건을 기준으로 선택 항목 ${model.selectedFieldCount.toLocaleString("ko-KR")}개를 집계·정렬함.`],
  ];
}

function visualTextLength(value: unknown) {
  return Array.from(text(value)).reduce((length, character) => length + (character.charCodeAt(0) > 0xff ? 2 : 1), 0);
}

export function operationsReportColumnWeights(
  columns: Array<{ key: string; label: string }>,
  rows: Array<Record<string, string>> = [],
) {
  const compactKeys = new Set(["status", "is_active", "total_spaces", "floors", "position", "staff_type", "auto_renew"]);
  const typeKeys = new Set(["lot_type", "operator_type", "violation_type", "payment_status", "appeal_status"]);
  const amountKeys = new Set(["contract_amount", "base_fee", "add_fee", "daily_max", "monthly_pass_fee", "fine_amount", "fee_amount", "fee_paid"]);
  const identifierKeys = new Set(["contract_number", "pass_number", "receipt_number", "enforcement_number", "record_number"]);
  const wideKeys = new Set(["name", "lot", "parking_lot", "title", "company_name", "policy_name", "exemption_name"]);
  const dateKeys = new Set(["updated_at", "contract_start", "contract_end", "hire_date", "violation_date", "fine_due_date", "inspection_date", "reported_at", "due_date"]);
  const narrativeKeys = new Set(["document_number", "legal_basis", "required_documents", "finding", "corrective_action", "evidence"]);
  const weights = columns.map(column => {
    const measured = rows
      .map(row => visualTextLength(row[column.key] || "-"))
      .sort((a, b) => a - b);
    const representativeLength = Math.max(
      visualTextLength(column.label),
      measured[Math.floor(Math.max(0, measured.length - 1) * 0.85)] || 0,
    );
    const observedWeight = 0.55 + Math.sqrt(Math.max(4, representativeLength)) * 0.33;
    const [base, minimum, maximum] = column.key === "period"
      ? [1.9, 1.6, 2.5]
      : column.key === "code"
        ? [1, 0.9, 1.3]
        : compactKeys.has(column.key)
          ? [0.8, 0.65, 0.95]
          : typeKeys.has(column.key)
            ? [1.15, 1, 1.4]
            : amountKeys.has(column.key)
              ? [1.3, 1.15, 1.6]
              : identifierKeys.has(column.key)
                ? [1.55, 1.25, 2.2]
      : wideKeys.has(column.key)
        ? [1.6, 1.15, 2.5]
        : dateKeys.has(column.key)
          ? [1.4, 1.05, 1.85]
          : narrativeKeys.has(column.key)
            ? [1.45, 1.1, 2.6]
            : [1.15, 0.75, 1.9];
    return Math.min(maximum, Math.max(minimum, base * 0.8, observedWeight));
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map(weight => weight / total);
}

type TableAlignment = "left" | "center" | "right";

const CENTERED_COLUMN_KEYS = new Set([
  "code", "lot_type", "operator_type", "status", "is_active", "position", "staff_type",
  "contract_number", "contract_start", "contract_end", "hire_date", "day_type", "time",
  "effective", "pass_number", "period", "receipt_number", "auto_renew", "enforcement_number",
  "violation_date", "fine_due_date", "payment_status", "appeal_status", "record_number",
  "reported_at", "due_date", "inspection_type", "inspection_date", "document_number",
]);

const RIGHT_ALIGNED_COLUMN_KEYS = new Set([
  "total_spaces", "floors", "contract_amount", "base_fee", "add_fee", "daily_max",
  "monthly_pass_fee", "discount", "max_hours", "fee_amount", "fee_paid", "fine_amount",
]);

const SINGLE_LINE_COLUMN_KEYS = new Set([
  "code", "status", "is_active", "lot_type", "operator_type", "position", "staff_type",
  "total_spaces", "floors", "contract_number", "contract_start", "contract_end", "hire_date",
  "pass_number", "receipt_number", "auto_renew", "enforcement_number", "violation_date",
  "fine_due_date", "payment_status", "appeal_status", "record_number", "reported_at",
  "due_date", "inspection_type", "inspection_date", "contract_amount", "base_fee", "add_fee",
  "daily_max", "monthly_pass_fee", "fee_amount", "fee_paid", "fine_amount",
]);

export function operationsReportColumnAlignment(key: string): TableAlignment {
  if (RIGHT_ALIGNED_COLUMN_KEYS.has(key)) return "right";
  if (CENTERED_COLUMN_KEYS.has(key)) return "center";
  return "left";
}

export function operationsReportTableTypography(columnCount: number, orientation: OperationsReportOrientation) {
  const landscapeBonus = orientation === "landscape" ? 0.4 : 0;
  if (columnCount <= 5) return { body: 9.5 + landscapeBonus, header: 9.6 + landscapeBonus, lineHeight: 4.3, padding: 1.9 };
  if (columnCount <= 7) return { body: 9 + landscapeBonus, header: 9.2 + landscapeBonus, lineHeight: 4.1, padding: 1.7 };
  if (columnCount <= 9) return { body: 8.6 + landscapeBonus, header: 8.8 + landscapeBonus, lineHeight: 3.9, padding: 1.5 };
  if (columnCount <= 11) return { body: 8.2 + landscapeBonus, header: 8.5 + landscapeBonus, lineHeight: 3.7, padding: 1.3 };
  return { body: 8 + landscapeBonus, header: 8.3 + landscapeBonus, lineHeight: 3.6, padding: 1.2 };
}

export function operationsReportHwpxTableTypography(columnCount: number, orientation: OperationsReportOrientation) {
  const pdfTypography = operationsReportTableTypography(columnCount, orientation);
  return {
    body: pdfTypography.body,
    header: pdfTypography.header,
    lineHeight: pdfTypography.lineHeight,
    // PDF padding is millimetres; the HTML-to-HWPX converter consumes CSS pixels.
    padding: Number((pdfTypography.padding * 3.2).toFixed(1)),
  };
}

export const OPERATIONS_REPORT_LAYOUT = {
  pageMarginMm: 14,
  pageTopMm: 13,
  hwpxPageTopMm: 10,
  pageBottomMm: 18,
  organizationFontPt: 9,
  titleFontPt: { portrait: 15, landscape: 17 },
  approvalHeaderFontPt: 7,
  keyValueFontPt: 8.4,
  sectionFontPt: 12,
  sectionHeightMm: 8,
  sectionGapMm: 3,
} as const;

const HWPX_PAGE_BREAK_MARKER = "__PARKMASTER_PAGE_BREAK__";

export function operationsReportKeyValueWidths(orientation: OperationsReportOrientation) {
  const pageWidthMm = orientation === "portrait" ? 210 : 297;
  const contentWidthMm = pageWidthMm - OPERATIONS_REPORT_LAYOUT.pageMarginMm * 2;
  const labelWidthMm = orientation === "portrait" ? 23 : 25;
  const labelPercent = labelWidthMm / contentWidthMm * 100;
  return [labelPercent, 50 - labelPercent, labelPercent, 50 - labelPercent];
}

export function operationsReportHwpxChunkSize(columnCount: number, orientation: OperationsReportOrientation) {
  if (orientation === "landscape") {
    if (columnCount <= 5) return 20;
    if (columnCount <= 7) return 18;
    if (columnCount <= 9) return 16;
    if (columnCount <= 11) return 14;
    return 12;
  }
  if (columnCount <= 5) return 26;
  if (columnCount <= 7) return 23;
  if (columnCount <= 9) return 20;
  if (columnCount <= 11) return 19;
  return 16;
}

export function operationsReportHwpxFirstPageChunkSize(columnCount: number, orientation: OperationsReportOrientation) {
  if (orientation === "landscape") return 0;
  if (columnCount <= 5) return 10;
  if (columnCount <= 7) return 8;
  if (columnCount <= 9) return 7;
  if (columnCount <= 11) return 5;
  return 5;
}

export function operationsReportHwpxRowHeight(columnCount: number, orientation: OperationsReportOrientation) {
  if (orientation === "landscape") {
    if (columnCount <= 5) return 2100;
    if (columnCount <= 7) return 2200;
    if (columnCount <= 9) return 2400;
    if (columnCount <= 11) return 2600;
    return 2800;
  }
  if (columnCount <= 5) return 2300;
  if (columnCount <= 7) return 2600;
  if (columnCount <= 9) return 3000;
  if (columnCount <= 11) return 3200;
  return 4000;
}

function balancedTableChunks<T>(rows: T[], maximumChunkSize: number): T[][] {
  if (!rows.length) return [];
  const chunkCount = Math.ceil(rows.length / maximumChunkSize);
  const baseSize = Math.floor(rows.length / chunkCount);
  const largerChunkCount = rows.length % chunkCount;
  const chunks: T[][] = [];
  let offset = 0;
  for (let index = 0; index < chunkCount; index += 1) {
    const size = baseSize + (index < largerChunkCount ? 1 : 0);
    chunks.push(rows.slice(offset, offset + size));
    offset += size;
  }
  return chunks;
}

export function selectOfficeDocumentFont(malgunGothicAvailable: boolean): "맑은 고딕" | "휴먼고딕" {
  return malgunGothicAvailable ? "맑은 고딕" : "휴먼고딕";
}

export async function applyOfficeFontToHwpx(
  bytes: Uint8Array,
  fontFamily: "맑은 고딕" | "휴먼고딕" = "맑은 고딕",
  tableLayouts: number[][] = [],
  tableRowHeights: number[] = [],
  tableTopMargins: number[] = [],
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes);
  const headerFile = zip.file("Contents/header.xml");
  if (!headerFile) throw new Error("HWPX 글꼴 정보를 찾지 못했습니다.");
  const header = await headerFile.async("string");
  const patched = header
    .replace(/<hh:(?:font|substFont)\b[^>]*>/g, fontTag => fontTag.replace(/face="[^"]*"/, `face="${fontFamily}"`))
    .replace(/<hh:fontRef\b[^>]*>/g, fontRef => ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"]
      .reduce((tag, script) => tag.replace(new RegExp(`${script}="\\d+"`), `${script}="0"`), fontRef));
  zip.file("Contents/header.xml", patched);

  let tableIndex = 0;
  const sectionPaths = Object.keys(zip.files)
    .filter(path => /^Contents\/section\d+\.xml$/i.test(path))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  for (const sectionPath of sectionPaths) {
    const sectionFile = zip.file(sectionPath);
    if (!sectionFile) continue;
    const sectionXml = (await sectionFile.async("string"))
      .replace(/hideFirstEmptyLine="0"/, 'hideFirstEmptyLine="1"');
    const compactedSectionXml = sectionXml.replace(/<hp:p\b(?=[^>]*\bpageBreak="0")[\s\S]*?<hp:secPr\b[\s\S]*?<\/hp:p>/, paragraphXml => paragraphXml
      .replace(/<hp:lineseg\b[^>]*\/>/g, lineSegment => lineSegment
        .replace(/vertsize="\d+"/, 'vertsize="0"')
        .replace(/textheight="\d+"/, 'textheight="0"')
        .replace(/baseline="\d+"/, 'baseline="0"')
        .replace(/spacing="\d+"/, 'spacing="0"')));
    const paginatedSectionXml = compactedSectionXml.replace(new RegExp(`<hp:p\\b(?=[^>]*\\bpageBreak="0")(?:(?!<\\/hp:p>)[\\s\\S])*?${HWPX_PAGE_BREAK_MARKER}(?:(?!<\\/hp:p>)[\\s\\S])*?<\\/hp:p>`, "g"), paragraphXml => paragraphXml
      .replace('pageBreak="0"', 'pageBreak="1"')
      .replace(HWPX_PAGE_BREAK_MARKER, ""));
    const patchedSection = paginatedSectionXml.replace(/<hp:tbl\b[\s\S]*?<\/hp:tbl>/g, tableXml => {
      const currentTableIndex = tableIndex++;
      const tableTopMargin = tableTopMargins[currentTableIndex] || 0;
      const spacedTable = tableTopMargin
        ? tableXml.replace(/<hp:outMargin\b[^>]*\/>/, margin => margin.replace(/top="\d+"/, `top="${tableTopMargin}"`))
        : tableXml;
      const layout = tableLayouts[currentTableIndex];
      if (!layout?.length) return spacedTable;
      const tableWidth = Number(spacedTable.match(/<hp:sz\b[^>]*width="(\d+)"/)?.[1] || 0);
      const columnCount = Number(spacedTable.match(/\bcolCnt="(\d+)"/)?.[1] || 0);
      if (!tableWidth || columnCount !== layout.length) return spacedTable;
      const totalWeight = layout.reduce((sum, weight) => sum + Math.max(0, weight), 0) || 1;
      const columnWidths = layout.map((weight, index) => index === layout.length - 1
        ? 0
        : Math.max(1, Math.round(tableWidth * Math.max(0, weight) / totalWeight)));
      columnWidths[columnWidths.length - 1] = tableWidth - columnWidths.slice(0, -1).reduce((sum, width) => sum + width, 0);
      const resizedTable = spacedTable.replace(/<hp:tc\b[\s\S]*?<\/hp:tc>/g, cellXml => {
        const columnAddress = Number(cellXml.match(/<hp:cellAddr\b[^>]*colAddr="(\d+)"/)?.[1] ?? -1);
        const columnSpan = Number(cellXml.match(/<hp:cellSpan\b[^>]*colSpan="(\d+)"/)?.[1] || 1);
        if (columnAddress < 0 || columnAddress >= columnWidths.length) return cellXml;
        const cellWidth = columnWidths.slice(columnAddress, columnAddress + columnSpan).reduce((sum, width) => sum + width, 0);
        return cellXml.replace(/(<hp:cellSz\b[^>]*width=")\d+("[^>]*>)/, `$1${cellWidth}$2`);
      });
      const detailRowHeight = tableRowHeights[currentTableIndex] || 0;
      if (!detailRowHeight) return resizedTable;

      const rows = resizedTable.match(/<hp:tr\b[\s\S]*?<\/hp:tr>/g) || [];
      const headerHeight = 2200;
      const rowHeights = rows.map((_, rowIndex) => rowIndex === 0 ? headerHeight : detailRowHeight);
      let rowIndex = 0;
      const withRowHeights = resizedTable.replace(/<hp:tr\b[\s\S]*?<\/hp:tr>/g, rowXml => {
        const height = rowHeights[rowIndex++] || detailRowHeight;
        return rowXml.replace(/(<hp:cellSz\b[^>]*height=")\d+("[^>]*>)/g, `$1${height}$2`);
      });
      const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0);
      return withRowHeights.replace(/(<hp:sz\b[^>]*height=")\d+("[^>]*>)/, `$1${totalHeight}$2`);
    });
    zip.file(sectionPath, patchedSection);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function preferredOfficeDocumentFont() {
  if (typeof document === "undefined" || !document.fonts?.check) return "맑은 고딕" as const;
  return selectOfficeDocumentFont(document.fonts.check('12px "맑은 고딕"'));
}

function summaryRows(model: OperationsReportModel) {
  return [
    ["관리 주차장", `${model.summary.parkingLots.toLocaleString("ko-KR")}개`, "총 주차면", `${model.summary.totalSpaces.toLocaleString("ko-KR")}면`],
    ["유효 위탁계약", `${model.summary.activeContracts.toLocaleString("ko-KR")}건`, "운영 인력", `${model.summary.activeStaff.toLocaleString("ko-KR")}명`],
    ["유효 정기권", `${model.summary.activePasses.toLocaleString("ko-KR")}건`, "기간 단속", `${model.summary.enforcementCount.toLocaleString("ko-KR")}건`],
    ["단속 부과액", won(model.summary.totalFine), "미납·체납액", won(model.summary.unpaidFine)],
    ["미종결 방치차량", `${model.summary.openAbandoned.toLocaleString("ko-KR")}건`, "미완료 보안점검", `${model.summary.openSecurity.toLocaleString("ko-KR")}건`],
  ];
}

export async function createOperationsHwpx(input: { model: OperationsReportModel; title: string; reportNumber: string; orientation?: OperationsReportOrientation; officialDocumentNumber?: string; authorName?: string; organizationName?: string; disclosureStatus?: string; disclosureBasis?: string; documentSummary?: string; keywords?: string }): Promise<Blob> {
  const documentFont = preferredOfficeDocumentFont();
  const escape = (value: unknown) => text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const multiline = (value: unknown) => escape(value).replace(/\n/g, "<br>");
  const tableHtml = (
    headers: string[],
    rows: string[][],
    widths?: string[],
    density: { bodyFont?: number; headerFont?: number; padding?: number; alignments?: TableAlignment[]; nowrapColumns?: number[] } = {},
  ) => {
    const bodyFont = density.bodyFont ?? 9.5;
    const headerFont = density.headerFont ?? bodyFont;
    const padding = density.padding ?? 5;
    return `<table style="width:100%;border-collapse:collapse;margin:0 0 14px 0;table-layout:fixed;page-break-inside:avoid"><thead><tr>${headers.map((header, index) => `<th style="${widths?.[index] ? `width:${widths[index]};` : ""}border:1px solid #64748b;background-color:#e7edf4;padding:${padding}px ${Math.max(3, padding)}px;text-align:center;vertical-align:middle;font-weight:bold;color:#172033;font-size:${headerFont}pt;line-height:1.25;word-break:keep-all">${escape(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row, rowIndex) => `<tr style="page-break-inside:avoid;background-color:${rowIndex % 2 ? "#f8fafc" : "#ffffff"}">${headers.map((_, index) => `<td style="border:1px solid #94a3b8;padding:${padding}px ${Math.max(3, padding)}px;vertical-align:middle;text-align:${density.alignments?.[index] || "left"};line-height:1.3;font-size:${bodyFont}pt;${density.nowrapColumns?.includes(index) ? "white-space:nowrap;" : ""}word-break:keep-all">${multiline(row[index] || "-")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  };
  const keyValueTableHtml = (rows: string[][], widths: string[]) => `<table style="width:100%;border-collapse:collapse;margin:0 0 12px 0;table-layout:fixed;page-break-inside:avoid"><tbody>${rows.map(row => `<tr>${row.map((value, index) => {
    const label = index % 2 === 0;
    return `<${label ? "th" : "td"} style="width:${widths[index]};border:1px solid #87919c;background-color:${label ? "#edf1f5" : "#ffffff"};padding:4px;vertical-align:middle;text-align:${label ? "center" : "left"};font-size:${OPERATIONS_REPORT_LAYOUT.keyValueFontPt}pt;line-height:1.3;${label ? "font-weight:normal;white-space:nowrap;" : ""}word-break:keep-all">${multiline(value || "-")}</${label ? "th" : "td"}>`;
  }).join("")}</tr>`).join("")}</tbody></table>`;
  const orientation = input.orientation || "portrait";
  const keyValueWidths = operationsReportKeyValueWidths(orientation).map(width => `${width.toFixed(2)}%`);
  const metadata = [
    ["관리번호", input.reportNumber, "관련 문서번호", input.officialDocumentNumber || "미지정"],
    ["담당부서", PRIMARY_DEPARTMENT, "작성자", input.authorName || "-"],
    ["보고기간", `${input.model.period.start} ~ ${input.model.period.end}`, "공개구분", input.disclosureStatus || "공개"],
  ];
  let sectionNo = 2;
  const detailTableLayouts: number[][] = [];
  const detailTableRowHeights: number[] = [];
  const sectionTitle = (value: string, pageBreakBefore = false) => `<p style="font-size:${OPERATIONS_REPORT_LAYOUT.sectionFontPt}pt;line-height:1.4;margin:0;padding:0;text-align:left;page-break-after:avoid">${pageBreakBefore ? HWPX_PAGE_BREAK_MARKER : ""}<br><span style="font-size:4pt">&#160;</span><strong>${escape(value)}</strong></p>`;
  const sections = input.model.tables.map(source => {
    const table = fitOperationsReportTable(source, orientation);
    const rows = table.rows.length ? table.rows.map(row => table.columns.map(column => row[column.key] || "-")) : [["해당 조건의 자료가 없습니다.", ...table.columns.slice(1).map(() => "")]];
    const columnWeights = operationsReportColumnWeights(table.columns, table.rows);
    const widths = columnWeights.map(weight => `${(weight * 100).toFixed(1)}%`);
    const typography = operationsReportHwpxTableTypography(table.columns.length, orientation);
    const chunkSize = operationsReportHwpxChunkSize(table.columns.length, orientation);
    const firstPageChunkSize = sectionNo === 2 ? operationsReportHwpxFirstPageChunkSize(table.columns.length, orientation) : 0;
    const firstChunk = firstPageChunkSize > 0 ? rows.slice(0, firstPageChunkSize) : [];
    const remainingRows = firstPageChunkSize > 0 ? rows.slice(firstPageChunkSize) : rows;
    const chunks = [
      ...(firstChunk.length ? [firstChunk] : []),
      ...balancedTableChunks(remainingRows, chunkSize),
    ];
    const html = chunks.map((chunk, chunkIndex) => {
      detailTableLayouts.push(columnWeights);
      detailTableRowHeights.push(operationsReportHwpxRowHeight(table.columns.length, orientation));
      const continuation = chunks.length > 1 && chunkIndex > 0 ? ` (계속 ${chunkIndex + 1}/${chunks.length})` : "";
      return `${sectionTitle(`${sectionNo}. ${table.title}${continuation}`, chunkIndex > 0)}${tableHtml(table.columns.map(column => column.label), chunk, widths, { bodyFont: typography.body, headerFont: typography.header, padding: typography.padding, alignments: table.columns.map(column => operationsReportColumnAlignment(column.key)) })}`;
    }).join("");
    sectionNo += 1;
    return html;
  }).join("");
  const brief = buildOperationsReportBrief({ model: input.model, authorName: input.authorName, documentSummary: input.documentSummary });
  const briefRows = [0, 2, 4].map(index => [brief[index][0], brief[index][1], brief[index + 1][0], brief[index + 1][1]]);
  const privacyLine = input.disclosureStatus && input.disclosureStatus !== "공개" ? `<p style="color:#9f1239"><strong>비공개 근거:</strong> ${escape(input.disclosureBasis || "근거 미입력")}</p>` : "";
  const titleWidth = orientation === "portrait" ? 72 : 76;
  const approvalWidth = (100 - titleWidth) / 3;
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div style="font-family:'${documentFont}';font-size:10pt;line-height:1.45;padding:0;color:#111827">
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 10px 0"><tbody><tr>
      <td style="width:50%;border:0;border-bottom:1px solid #1f2937;padding:0 0 5px 0;font-size:${OPERATIONS_REPORT_LAYOUT.organizationFontPt}pt;text-align:left">${escape(input.organizationName || PRIMARY_ORGANIZATION)}</td>
      <td style="width:50%;border:0;border-bottom:1px solid #1f2937;padding:0 0 5px 0;font-size:${OPERATIONS_REPORT_LAYOUT.organizationFontPt}pt;text-align:right">내부보고</td>
    </tr></tbody></table>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 12px 0"><tbody>
      <tr>
        <td rowspan="2" style="width:${titleWidth}%;border:0;padding:0 10px 0 0;vertical-align:middle;text-align:left;font-size:${OPERATIONS_REPORT_LAYOUT.titleFontPt[orientation]}pt;font-weight:bold;line-height:1.3"><strong>${escape(input.title)}</strong></td>
        ${["담당", "팀장", "과장"].map(label => `<th style="width:${approvalWidth.toFixed(2)}%;height:7mm;border:1px solid #646c74;background-color:#f2f4f7;padding:2px;text-align:center;vertical-align:middle;font-size:${OPERATIONS_REPORT_LAYOUT.approvalHeaderFontPt}pt">${label}</th>`).join("")}
      </tr>
      <tr>${["", "", ""].map(() => `<td style="height:14mm;border:1px solid #646c74;padding:2px;text-align:center;vertical-align:middle"></td>`).join("")}</tr>
    </tbody></table>
    ${keyValueTableHtml(metadata, keyValueWidths)}
    ${sectionTitle("보고 개요")}
    ${keyValueTableHtml(briefRows, keyValueWidths)}
    <p style="font-size:9.5pt;line-height:1.35;margin:5px 0 11px 0;color:#475569"><strong>키워드:</strong> ${escape(input.keywords || "공영주차장, 운영관리, 제주시")}</p>${privacyLine}
    ${sectionTitle("1. 핵심 지표")}
    ${tableHtml(["항목", "현황", "항목", "현황"], summaryRows(input.model), ["25%", "25%", "25%", "25%"], { bodyFont: 9.5, headerFont: 9.5, padding: 5, alignments: ["center", "right", "center", "right"] })}
    ${sections}
    <p style="font-size:8.5pt;line-height:1.3;color:#64748b;border-top:1px solid #94a3b8;padding-top:6px">자료기준: ParkMaster 등록자료 | 선택항목 ${input.model.selectedFieldCount}개 | 민감항목 ${input.model.sensitiveFieldCount}개 | ${escape(input.reportNumber)}</p>
  </div></body></html>`;
  const bytes = await htmlToHwpx(html, {
    title: input.title,
    creator: input.authorName || PRIMARY_DEPARTMENT,
    page: { size: "A4", orientation, margins: { left: OPERATIONS_REPORT_LAYOUT.pageMarginMm, right: OPERATIONS_REPORT_LAYOUT.pageMarginMm, top: OPERATIONS_REPORT_LAYOUT.hwpxPageTopMm, bottom: OPERATIONS_REPORT_LAYOUT.pageBottomMm, header: 5, footer: 8 } },
  });
  const patchedBytes = await applyOfficeFontToHwpx(Uint8Array.from(bytes), documentFont, [
    [1, 1],
    [titleWidth, approvalWidth, approvalWidth, approvalWidth],
    operationsReportKeyValueWidths(orientation),
    operationsReportKeyValueWidths(orientation),
    [25, 25, 25, 25],
    ...detailTableLayouts,
  ], [0, 0, 0, 0, 0, ...detailTableRowHeights], [0, 0, 0, 450, 450, ...detailTableRowHeights.map(() => 450)]);
  const arrayBuffer = patchedBytes.buffer.slice(patchedBytes.byteOffset, patchedBytes.byteOffset + patchedBytes.byteLength) as ArrayBuffer;
  return new Blob([arrayBuffer], { type: "application/hwp+zip" });
}

export async function validateOperationsHwpx(blob: Blob): Promise<{ valid: true; textLength: number }> {
  const reader = new HwpxReader();
  await reader.loadFromArrayBuffer(await blob.arrayBuffer());
  const [info, extracted] = await Promise.all([reader.getDocumentInfo(), reader.extractText()]);
  const textLength = extracted.length;
  if (!info.summary.contentsFiles.length) throw new Error("HWPX 본문 구역이 없습니다.");
  if (!extracted.includes("운영관리")) throw new Error("HWPX 운영관리 본문을 확인하지 못했습니다.");
  return { valid: true, textLength };
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export function isSupportedPdfFont(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 4) return false;
  const signature = new Uint8Array(bytes, 0, 4);
  const tag = String.fromCharCode(...signature);
  return tag === "OTTO" || tag === "true" || tag === "typ1"
    || (signature[0] === 0x00 && signature[1] === 0x01 && signature[2] === 0x00 && signature[3] === 0x00);
}

async function loadPreferredPdfFont() {
  const candidates = [
    { path: "/fonts/MalgunGothic.ttf", fileName: "MalgunGothic.ttf", family: "MalgunGothic" },
    { path: "/fonts/HumanGothic.ttf", fileName: "HumanGothic.ttf", family: "HumanGothic" },
    { path: "/fonts/NanumGothic-Regular.ttf", fileName: "NanumGothic-Regular.ttf", family: "NanumGothic" },
  ];
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.path);
      if (!response.ok) continue;
      const bytes = await response.arrayBuffer();
      if (isSupportedPdfFont(bytes)) return { ...candidate, bytes };
    } catch {
      // Continue to the next installed report font.
    }
  }
  throw new Error("PDF 한글 글꼴을 불러오지 못했습니다.");
}

export async function createOperationsPdf(input: { model: OperationsReportModel; title: string; reportNumber: string; orientation?: OperationsReportOrientation; officialDocumentNumber?: string; authorName?: string; organizationName?: string; disclosureStatus?: string; disclosureBasis?: string; documentSummary?: string; keywords?: string }): Promise<{ blob: Blob; pageCount: number }> {
  const [{ jsPDF }, font] = await Promise.all([import("jspdf"), loadPreferredPdfFont()]);
  const orientation = input.orientation || "portrait";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS(font.fileName, toBase64(font.bytes));
  doc.addFont(font.fileName, font.family, "normal");
  doc.setFont(font.family, "normal");
  const margin = OPERATIONS_REPORT_LAYOUT.pageMarginMm;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const contentBottom = pageHeight - OPERATIONS_REPORT_LAYOUT.pageBottomMm;
  let y = OPERATIONS_REPORT_LAYOUT.pageTopMm;
  const newPage = () => { doc.addPage(); doc.setFont(font.family, "normal"); y = OPERATIONS_REPORT_LAYOUT.pageMarginMm; };
  const ensure = (height: number) => { if (y + height > contentBottom) newPage(); };
  const sectionTitle = (value: string) => {
    ensure(20);
    y += 5;
    doc.setFontSize(OPERATIONS_REPORT_LAYOUT.sectionFontPt);
    doc.setTextColor(20, 30, 40);
    doc.text(value, margin, y + 4.5);
    y += 10;
  };
  const drawTable = (columns: Array<{ label: string; key: string }>, rows: Array<Record<string, string>>) => {
    const weights = operationsReportColumnWeights(columns, rows);
    const typography = operationsReportTableTypography(columns.length, orientation);
    const minimumFontSize = 8;
    doc.setFontSize(minimumFontSize);
    const minimumWidths = columns.map((column, index) => {
      const headerWidth = doc.getTextWidth(column.label) + typography.padding * 2;
      if (!SINGLE_LINE_COLUMN_KEYS.has(column.key)) return Math.max(9, Math.min(18, headerWidth));
      const measured = rows
        .map(row => doc.getTextWidth(row[column.key] || "-"))
        .sort((a, b) => a - b);
      const representativeWidth = measured[Math.floor(Math.max(0, measured.length - 1) * 0.85)] || 0;
      return Math.max(10, Math.min(contentWidth * 0.22, Math.max(headerWidth, representativeWidth + typography.padding * 2)));
    });
    const minimumTotal = minimumWidths.reduce((sum, width) => sum + width, 0);
    const widths = minimumTotal < contentWidth
      ? minimumWidths.map((width, index) => width + (contentWidth - minimumTotal) * weights[index])
      : weights.map(weight => contentWidth * weight);
    const lineHeight = typography.lineHeight;
    const availableWidth = (index: number) => Math.max(2, widths[index] - typography.padding * 2);
    const header = () => {
      doc.setFontSize(typography.header);
      const headerLines = columns.map((column, index) => doc.splitTextToSize(column.label, availableWidth(index)));
      const headerHeight = Math.max(5.5, ...headerLines.map(lines => lines.length * lineHeight + typography.padding * 2));
      ensure(headerHeight);
      let x = margin;
      columns.forEach((column, index) => {
        doc.setFillColor(231, 237, 244); doc.setDrawColor(112, 124, 138); doc.rect(x, y, widths[index], headerHeight, "FD");
        const headerTextHeight = headerLines[index].length * lineHeight;
        doc.setFontSize(typography.header); doc.setTextColor(20, 30, 40); doc.text(headerLines[index], x + widths[index] / 2, y + (headerHeight - headerTextHeight) / 2 + lineHeight, { align: "center" });
        x += widths[index];
      });
      y += headerHeight;
    };
    header();
    if (!rows.length) { doc.setFontSize(8); doc.text("해당 조건의 자료가 없습니다.", margin + 2, y + 5); y += 8; return; }
    rows.forEach((row, rowIndex) => {
      doc.setFontSize(typography.body);
      const cellFontSizes = columns.map((column, index) => {
        if (!SINGLE_LINE_COLUMN_KEYS.has(column.key)) return typography.body;
        const value = row[column.key] || "-";
        const naturalWidth = Math.max(1, doc.getTextWidth(value));
        return Math.max(minimumFontSize, Math.min(typography.body, typography.body * availableWidth(index) / naturalWidth));
      });
      const cellLines = columns.map((column, index) => SINGLE_LINE_COLUMN_KEYS.has(column.key)
        ? [row[column.key] || "-"]
        : doc.splitTextToSize(row[column.key] || "-", availableWidth(index)));
      const rowHeight = Math.max(5.5, ...cellLines.map(lines => lines.length * lineHeight + typography.padding * 2));
      if (y + rowHeight > contentBottom) { newPage(); header(); }
      let x = margin;
      columns.forEach((column, index) => {
        const shade = rowIndex % 2 ? 248 : 255;
        doc.setFillColor(shade, shade, shade); doc.setDrawColor(148, 158, 170); doc.rect(x, y, widths[index], rowHeight, "FD");
        const alignment = operationsReportColumnAlignment(column.key);
        const textX = alignment === "center" ? x + widths[index] / 2 : alignment === "right" ? x + widths[index] - typography.padding : x + typography.padding;
        const textHeight = cellLines[index].length * lineHeight;
        doc.setFontSize(cellFontSizes[index]); doc.setTextColor(20, 30, 40); doc.text(cellLines[index], textX, y + (rowHeight - textHeight) / 2 + lineHeight, { align: alignment });
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 3;
  };

  const drawKeyValueRows = (rows: string[][], requestedLabelWidth?: number) => {
    doc.setFontSize(OPERATIONS_REPORT_LAYOUT.keyValueFontPt);
    const measuredLabelWidth = Math.max(...rows.flatMap(row => [row[0], row[2]]).map(label => doc.getTextWidth(label))) + 6;
    const labelWidth = Math.min(30, Math.max(requestedLabelWidth || 0, measuredLabelWidth, orientation === "portrait" ? 18 : 20));
    const valueWidth = (contentWidth - labelWidth * 2) / 2;
    rows.forEach(row => {
      const widths = [labelWidth, valueWidth, labelWidth, valueWidth];
      const lines = row.map((value, index) => index % 2 === 0 ? [value] : doc.splitTextToSize(value, widths[index] - 4));
      const rowHeight = Math.max(8, ...lines.map(value => value.length * 3.3 + 3));
      ensure(rowHeight);
      let x = margin;
      row.forEach((value, index) => {
        const label = index % 2 === 0;
        doc.setFillColor(label ? 237 : 255, label ? 241 : 255, label ? 245 : 255);
        doc.setDrawColor(135, 145, 156); doc.rect(x, y, widths[index], rowHeight, "FD");
        const lineHeight = 3.8;
        const textHeight = lines[index].length * lineHeight;
        const textX = label ? x + widths[index] / 2 : x + 2;
        doc.setFontSize(OPERATIONS_REPORT_LAYOUT.keyValueFontPt); doc.setTextColor(30, 40, 50); doc.text(lines[index], textX, y + (rowHeight - textHeight) / 2 + lineHeight, { align: label ? "center" : "left" });
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 3;
  };

  doc.setFontSize(OPERATIONS_REPORT_LAYOUT.organizationFontPt); doc.setTextColor(30, 40, 50); doc.text(input.organizationName || PRIMARY_ORGANIZATION, margin, y); doc.text("내부보고", pageWidth - margin, y, { align: "right" });
  doc.setLineWidth(0.4); doc.line(margin, y + 3, pageWidth - margin, y + 3); y += 13;
  const approval = [["담당", "팀장", "과장"], ["", "", ""]];
  const aw = orientation === "portrait" ? 19 : 21;
  const ax = pageWidth - margin - aw * 3;
  const titleWidth = Math.max(75, ax - margin - 6);
  doc.setFontSize(OPERATIONS_REPORT_LAYOUT.titleFontPt[orientation]); doc.setTextColor(10, 20, 30);
  const titleLines = doc.splitTextToSize(input.title, titleWidth).slice(0, 2);
  doc.text(titleLines, margin, y);
  approval.forEach((row, rowIndex) => row.forEach((value, colIndex) => { const ay = y - 8 + rowIndex * 7; doc.setFillColor(rowIndex === 0 ? 242 : 255, rowIndex === 0 ? 244 : 255, rowIndex === 0 ? 247 : 255); doc.setDrawColor(100, 108, 116); doc.rect(ax + colIndex * aw, ay, aw, rowIndex === 0 ? 7 : 14, "FD"); if (value) { doc.setFontSize(7); doc.text(value, ax + colIndex * aw + aw / 2, ay + 4.8, { align: "center" }); } }));
  y += Math.max(18, titleLines.length * 7 + 7);
  const meta = [
    ["관리번호", input.reportNumber, "관련 문서번호", input.officialDocumentNumber || "미지정"],
    ["담당부서", PRIMARY_DEPARTMENT, "작성자", input.authorName || "-"],
    ["보고기간", `${input.model.period.start} ~ ${input.model.period.end}`, "공개구분", input.disclosureStatus || "공개"],
  ];
  drawKeyValueRows(meta, orientation === "portrait" ? 23 : 25);
  const brief = buildOperationsReportBrief({ model: input.model, authorName: input.authorName, documentSummary: input.documentSummary });
  const briefRows = [0, 2, 4].map(index => [brief[index][0], brief[index][1], brief[index + 1][0], brief[index + 1][1]]);
  sectionTitle("보고 개요");
  drawKeyValueRows(briefRows, orientation === "portrait" ? 23 : 25);
  doc.setFontSize(7.5); doc.setTextColor(70, 82, 96); doc.text(`키워드: ${input.keywords || "공영주차장, 운영관리, 제주시"}`, margin, y + 3); y += 5;
  if (input.disclosureStatus && input.disclosureStatus !== "공개") { doc.setTextColor(150, 30, 55); doc.text(`비공개 근거: ${input.disclosureBasis || "근거 미입력"}`, margin, y + 3); y += 5; }
  sectionTitle("1. 핵심 지표");
  const summaries = summaryRows(input.model).map(row => ({ a: row[0], b: row[1], c: row[2], d: row[3] }));
  drawTable([{ key: "a", label: "항목" }, { key: "b", label: "현황" }, { key: "c", label: "항목" }, { key: "d", label: "현황" }], summaries);
  let sectionNo = 2;
  input.model.tables.forEach(source => {
    const table = fitOperationsReportTable(source, orientation);
    sectionTitle(`${sectionNo}. ${table.title}`);
    drawTable(table.columns, table.rows);
    sectionNo += 1;
  });
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) { doc.setPage(page); doc.setFontSize(7); doc.setTextColor(110, 120, 130); doc.text(`${input.reportNumber} | ${page}/${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" }); }
  return { blob: doc.output("blob"), pageCount };
}

export async function getOperationsReportEvidence(parameters: Record<string, string>) {
  const options = parseOperationsReportOptions(parameters);
  const dataset = await collectOperationsReportData(options);
  const model = buildOperationsReportModel(dataset, options);
  return { period: model.period, sourceCounts: model.sourceCounts, summary: model.summary, selectedFieldCount: model.selectedFieldCount, sensitiveFieldCount: model.sensitiveFieldCount };
}
