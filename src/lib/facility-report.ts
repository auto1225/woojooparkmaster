import { supabase } from "@/integrations/supabase/client";
import { PRIMARY_DEPARTMENT } from "@/config/organization";
import {
  CONDITION_LABELS,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_TYPE_LABELS,
  INSPECTION_TYPE_LABELS,
  MAINT_STATUS_LABELS,
  MAINT_TYPE_LABELS,
  MARKING_TYPE_LABELS,
  PRIORITY_LABELS,
  SCHEDULE_TYPE_LABELS,
} from "@/types/facility";
import type {
  OperationsReportModel,
  OperationsReportOrientation,
  OperationsReportTable,
} from "@/lib/operations-report";

export type FacilityReportSectionId = "overview" | "equipment" | "maintenance" | "schedules" | "safety" | "markings";
export type FacilityReportSort = "parking_lot" | "date_desc" | "attention" | "cost_desc";
export type FacilityReportOrientation = OperationsReportOrientation;

export interface FacilityReportField {
  key: string;
  label: string;
  protected?: boolean;
  value: (row: any, dataset: FacilityReportDataset) => unknown;
}

export interface FacilityReportSection {
  id: FacilityReportSectionId;
  label: string;
  description: string;
  fields: FacilityReportField[];
  defaultFields: string[];
}

export interface FacilityReportOptions {
  periodStart: string;
  periodEnd: string;
  selectedSections: FacilityReportSectionId[];
  selectedFields: Partial<Record<FacilityReportSectionId, string[]>>;
  lotTypes: string[];
  sort: FacilityReportSort;
  orientation: FacilityReportOrientation;
  includeInactive: boolean;
}

export interface FacilityReportDataset {
  parkingLots: any[];
  equipment: any[];
  maintenance: any[];
  schedules: any[];
  safety: any[];
  markings: any[];
  documentNumbers: Record<string, string[]>;
}

export interface FacilityReportModel {
  period: { start: string; end: string };
  lotTypeLabels: string[];
  summary: Record<string, number>;
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

export const FACILITY_LOT_TYPE_OPTIONS = [
  { value: "offstreet", label: "노외주차장" },
  { value: "building", label: "주차빌딩" },
  { value: "onstreet", label: "노상주차장" },
];

const relation = (row: any, key: string) => Array.isArray(row?.[key]) ? row[key][0] : row?.[key];
const lot = (row: any) => relation(row, "parking_lots");
const equipmentRelation = (row: any) => relation(row, "equipment");
const lotName = (row: any) => lot(row)?.name || row?.parking_lot_name || "공통";
const lotType = (row: any) => row?.lot_type_at_event || lot(row)?.lot_type || row?.lot_type || "";
const dateOnly = (value: unknown) => value ? String(value).split("T")[0] : "-";
const text = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);
const won = (value: unknown) => `${Number(value || 0).toLocaleString("ko-KR")}원`;
const yesNo = (value: unknown) => value ? "예" : "아니오";
const documentKey = (module: string, id: string) => `${module}:${id}`;
const documentList = (dataset: FacilityReportDataset, module: string, row: any) => dataset.documentNumbers[documentKey(module, row.id)]?.join(", ") || "-";
const photoCount = (row: any, keys: string[]) => keys.reduce((count, key) => {
  const value = row?.[key];
  if (Array.isArray(value)) return count + value.filter(Boolean).length;
  return count + (value ? 1 : 0);
}, 0);
const evidenceLabel = (row: any, keys: string[]) => {
  const count = photoCount(row, keys);
  return count ? `사진 ${count}건 등록` : "사진 없음";
};
const daysBetween = (from: string, to: string) => Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
const isArchived = (row: any) => Boolean(row?.archived_at);
const isOpenMaintenance = (row: any) => !["completed", "verified", "cancelled"].includes(row.status);

const field = (key: string, label: string, value: FacilityReportField["value"], protectedField = false): FacilityReportField => ({ key, label, value, protected: protectedField });

export const FACILITY_REPORT_SECTIONS: FacilityReportSection[] = [
  { id: "overview", label: "시설 현황", description: "시설관리 핵심지표와 조치 필요사항", fields: [], defaultFields: [] },
  {
    id: "equipment", label: "장비 관리", description: "장비 기본정보·상태·보증·정비비용",
    fields: [
      field("equipment_code", "장비코드", row => row.equipment_code), field("lot", "주차장", row => lotName(row)),
      field("lot_type", "형태", row => LOT_TYPE_LABELS[lotType(row)] || lotType(row)), field("name", "장비명", row => row.name),
      field("equipment_type", "유형", row => EQUIPMENT_TYPE_LABELS[row.equipment_type] || row.equipment_type),
      field("location_detail", "설치위치", row => row.location_detail), field("manufacturer", "제조사", row => row.manufacturer),
      field("model", "모델", row => row.model), field("install_date", "설치일", row => dateOnly(row.install_date)),
      field("warranty_end", "보증만료", row => dateOnly(row.warranty_end)), field("replacement_due", "교체예정", row => dateOnly(row.replacement_due)),
      field("status", "상태", row => EQUIPMENT_STATUS_LABELS[row.status as keyof typeof EQUIPMENT_STATUS_LABELS] || row.status),
      field("maintenance_count", "정비횟수", row => row.maintenance_count || 0), field("total_maintenance_cost", "누적정비비", row => won(row.total_maintenance_cost)),
      field("photo_evidence", "사진증빙", row => evidenceLabel(row, ["photo_path"])),
      field("document_numbers", "문서번호", (row, dataset) => documentList(dataset, "FACILITY_EQUIPMENT", row)),
      field("ip_address", "IP 주소", row => row.ip_address, true),
    ],
    defaultFields: ["equipment_code", "lot", "lot_type", "name", "equipment_type", "location_detail", "install_date", "warranty_end", "status", "maintenance_count", "total_maintenance_cost", "photo_evidence", "document_numbers"],
  },
  {
    id: "maintenance", label: "유지보수", description: "작업 접수부터 원인·조치·비용·완료 검증까지",
    fields: [
      field("log_number", "작업번호", row => row.log_number), field("lot", "주차장", row => lotName(row)),
      field("lot_type", "형태", row => LOT_TYPE_LABELS[lotType(row)] || lotType(row)), field("equipment", "대상장비", row => equipmentRelation(row)?.name),
      field("title", "작업명", row => row.title), field("maintenance_type", "작업유형", row => MAINT_TYPE_LABELS[row.maintenance_type] || row.maintenance_type),
      field("priority", "우선순위", row => PRIORITY_LABELS[row.priority] || row.priority), field("status", "상태", row => MAINT_STATUS_LABELS[row.status as keyof typeof MAINT_STATUS_LABELS] || row.status),
      field("reported_at", "접수일", row => dateOnly(row.reported_at)), field("due_date", "처리기한", row => dateOnly(row.due_date)),
      field("cause", "원인", row => row.cause), field("resolution", "조치내용", row => row.resolution),
      field("completed_at", "완료일", row => dateOnly(row.completed_at)), field("downtime_hours", "중단시간", row => row.downtime_hours ? `${row.downtime_hours}시간` : "-"),
      field("total_cost", "총비용", row => won(row.total_cost)), field("next_action", "다음조치", row => row.next_action),
      field("photo_evidence", "사진증빙", row => evidenceLabel(row, ["before_photo", "after_photo"])),
      field("document_numbers", "문서번호", (row, dataset) => documentList(dataset, "FACILITY_MAINTENANCE", row)),
      field("vendor_contact", "업체 연락처", row => row.vendor_contact, true),
    ],
    defaultFields: ["log_number", "lot", "lot_type", "equipment", "title", "maintenance_type", "priority", "status", "reported_at", "due_date", "cause", "resolution", "completed_at", "downtime_hours", "total_cost", "next_action", "photo_evidence", "document_numbers"],
  },
  {
    id: "schedules", label: "점검 스케줄", description: "정기점검 주기·담당·예정일·지연 현황",
    fields: [
      field("lot", "주차장", row => lotName(row)), field("lot_type", "형태", row => LOT_TYPE_LABELS[lotType(row)] || lotType(row)),
      field("schedule_name", "점검명", row => row.schedule_name), field("schedule_type", "주기", row => SCHEDULE_TYPE_LABELS[row.schedule_type] || row.schedule_type),
      field("equipment", "대상장비", row => equipmentRelation(row)?.name), field("assigned_team", "담당팀", row => row.assigned_team),
      field("last_completed", "최근완료", row => dateOnly(row.last_completed)), field("next_due_date", "다음점검", row => dateOnly(row.next_due_date)),
      field("delay_days", "지연일수", row => row.next_due_date && row.next_due_date < row.__period_end ? `${Math.max(0, daysBetween(row.next_due_date, row.__period_end))}일` : "-"),
      field("estimated_cost", "예상비용", row => won(row.estimated_cost)), field("estimated_hours", "예상시간", row => row.estimated_hours ? `${row.estimated_hours}시간` : "-"),
      field("is_active", "사용", row => yesNo(row.is_active)), field("document_numbers", "문서번호", (row, dataset) => documentList(dataset, "FACILITY_SCHEDULE", row)),
      field("vendor_contact", "업체 연락처", row => row.vendor_phone || row.vendor_contact, true),
    ],
    defaultFields: ["lot", "lot_type", "schedule_name", "schedule_type", "equipment", "assigned_team", "last_completed", "next_due_date", "delay_days", "estimated_cost", "is_active", "document_numbers"],
  },
  {
    id: "safety", label: "안전점검", description: "점검 결과·불합격·시정조치·후속점검",
    fields: [
      field("inspection_number", "점검번호", row => row.inspection_number), field("lot", "주차장", row => lotName(row)),
      field("lot_type", "형태", row => LOT_TYPE_LABELS[lotType(row)] || lotType(row)), field("inspection_type", "점검유형", row => INSPECTION_TYPE_LABELS[row.inspection_type] || row.inspection_type),
      field("inspection_date", "점검일", row => dateOnly(row.inspection_date)), field("overall_grade", "등급", row => row.overall_grade),
      field("fail_items", "불합격", row => row.fail_items || 0), field("issues_found", "문제사항", row => row.issues_found),
      field("corrective_actions", "시정조치", row => row.corrective_actions), field("correction_deadline", "시정기한", row => dateOnly(row.correction_deadline)),
      field("correction_completed", "시정완료", row => dateOnly(row.correction_completed)), field("follow_up_required", "후속점검", row => yesNo(row.follow_up_required)),
      field("status", "상태", row => row.status), field("photo_evidence", "사진증빙", row => evidenceLabel(row, ["photo_paths"])),
      field("document_numbers", "문서번호", (row, dataset) => documentList(dataset, "FACILITY_SAFETY", row)),
      field("inspector_name", "점검자", row => row.inspector_name, true),
    ],
    defaultFields: ["inspection_number", "lot", "lot_type", "inspection_type", "inspection_date", "overall_grade", "fail_items", "issues_found", "corrective_actions", "correction_deadline", "correction_completed", "follow_up_required", "status", "photo_evidence", "document_numbers"],
  },
  {
    id: "markings", label: "노면표시", description: "노면표시·안내표지 상태와 재시공 계획",
    fields: [
      field("lot", "주차장", row => lotName(row)), field("lot_type", "형태", row => LOT_TYPE_LABELS[lotType(row)] || lotType(row)),
      field("marking_type", "유형", row => MARKING_TYPE_LABELS[row.marking_type] || row.marking_type), field("marking_name", "표시명", row => row.marking_name),
      field("location_detail", "위치", row => row.location_detail), field("floor", "층", row => row.floor), field("quantity", "수량", row => row.quantity || 0),
      field("material", "재질", row => row.material), field("condition", "상태", row => CONDITION_LABELS[row.condition as keyof typeof CONDITION_LABELS] || row.condition),
      field("last_repainted", "최종시공", row => dateOnly(row.last_repainted)), field("next_due", "재시공예정", row => dateOnly(row.next_due)),
      field("estimated_cost", "예상비용", row => won(row.estimated_cost)), field("regulation_ref", "규정근거", row => row.regulation_ref),
      field("photo_evidence", "사진증빙", row => evidenceLabel(row, ["photo_path"])),
      field("document_numbers", "문서번호", (row, dataset) => documentList(dataset, "FACILITY_MARKING", row)),
    ],
    defaultFields: ["lot", "lot_type", "marking_type", "marking_name", "location_detail", "floor", "quantity", "condition", "last_repainted", "next_due", "estimated_cost", "regulation_ref", "photo_evidence", "document_numbers"],
  },
];

export const FACILITY_REPORT_PRESETS = {
  summary: { label: "간부 요약", sections: ["overview", "equipment", "maintenance", "safety"] as FacilityReportSectionId[] },
  standard: { label: "실무 종합", sections: FACILITY_REPORT_SECTIONS.map(section => section.id) },
  audit: { label: "감사 대응", sections: ["overview", "equipment", "maintenance", "schedules", "safety", "markings"] as FacilityReportSectionId[] },
};

export function defaultFacilityReportFields(): Partial<Record<FacilityReportSectionId, string[]>> {
  return Object.fromEntries(FACILITY_REPORT_SECTIONS.map(section => [section.id, [...section.defaultFields]]));
}

export function parseFacilityReportOptions(parameters: Record<string, string>): FacilityReportOptions {
  const knownSections = new Set(FACILITY_REPORT_SECTIONS.map(section => section.id));
  const selectedSections = (parameters.facility_sections || FACILITY_REPORT_PRESETS.summary.sections.join(","))
    .split(",").filter((id): id is FacilityReportSectionId => knownSections.has(id as FacilityReportSectionId));
  let selectedFields = defaultFacilityReportFields();
  try {
    const parsed = JSON.parse(parameters.facility_fields || "{}");
    if (parsed && typeof parsed === "object") selectedFields = { ...selectedFields, ...parsed };
  } catch {
    selectedFields = defaultFacilityReportFields();
  }
  return {
    periodStart: parameters.period_start,
    periodEnd: parameters.period_end || parameters.period_start,
    selectedSections: selectedSections.length ? selectedSections : ["overview"],
    selectedFields,
    lotTypes: (parameters.facility_lot_types || "offstreet,building,onstreet").split(",").filter(Boolean),
    sort: (["parking_lot", "date_desc", "attention", "cost_desc"].includes(parameters.facility_sort) ? parameters.facility_sort : "attention") as FacilityReportSort,
    orientation: parameters.facility_orientation === "landscape" ? "landscape" : "portrait",
    includeInactive: parameters.facility_include_inactive === "true",
  };
}

function matchesLotType(row: any, selected: string[]) {
  if (!selected.length || selected.length === FACILITY_LOT_TYPE_OPTIONS.length) return true;
  const actual = lotType(row);
  return selected.some(group => (LOT_TYPE_ALIASES[group] || [group]).includes(actual));
}

async function checkedQuery(label: string, promise: PromiseLike<any>, limit = 3000) {
  const result = await promise;
  if (result.error) throw new Error(`${label} 자료 조회에 실패했습니다: ${result.error.message}`);
  const rows = result.data || [];
  if (typeof result.count === "number" && result.count > rows.length && rows.length >= limit) {
    throw new Error(`${label} 자료 ${result.count}건 중 ${rows.length}건만 조회되어 보고서 생성을 중단했습니다.`);
  }
  return rows;
}

async function collectDocumentNumbers(recordIds: Set<string>) {
  if (!recordIds.size) return {};
  const modules = ["FACILITY_EQUIPMENT", "FACILITY_MAINTENANCE", "FACILITY_SCHEDULE", "FACILITY_SAFETY", "FACILITY_MARKING"];
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
    const id = String(link.file_path || "").replace("parkmaster-document://", "");
    const number = numberById.get(id);
    if (!number) return result;
    const key = documentKey(link.module, link.ref_id);
    result[key] = Array.from(new Set([...(result[key] || []), number]));
    return result;
  }, {});
}

export async function collectFacilityReportData(options: FacilityReportOptions): Promise<FacilityReportDataset> {
  const selected = new Set(options.selectedSections);
  const query = (enabled: boolean, label: string, promise: PromiseLike<any>) => enabled ? checkedQuery(label, promise) : Promise.resolve([]);
  const [parkingLots, equipment, maintenance, schedules, safety, markings] = await Promise.all([
    checkedQuery("주차장", supabase.from("parking_lots").select("id, code, name, lot_type, total_spaces, floors, status", { count: "exact" }).limit(3000)),
    query(selected.has("overview") || selected.has("equipment"), "시설장비", supabase.from("equipment").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).limit(3000)),
    query(selected.has("overview") || selected.has("maintenance"), "유지보수", supabase.from("maintenance_logs").select("*, parking_lots(code, name, lot_type), equipment(name, equipment_type)", { count: "exact" }).limit(3000)),
    query(selected.has("overview") || selected.has("schedules"), "점검스케줄", supabase.from("maintenance_schedules").select("*, parking_lots(code, name, lot_type), equipment(name, equipment_type)", { count: "exact" }).limit(3000)),
    query(selected.has("overview") || selected.has("safety"), "안전점검", supabase.from("safety_inspections").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).limit(3000)),
    query(selected.has("overview") || selected.has("markings"), "노면표시", supabase.from("surface_markings").select("*, parking_lots(code, name, lot_type)", { count: "exact" }).limit(3000)),
  ]);
  const lotFiltered = (rows: any[]) => rows.filter(row => matchesLotType(row, options.lotTypes));
  const filtered = {
    parkingLots: lotFiltered(parkingLots),
    equipment: lotFiltered(equipment).filter(row => options.includeInactive || (!isArchived(row) && row.status !== "decommissioned")),
    maintenance: lotFiltered(maintenance).filter(row => dateOnly(row.reported_at) >= options.periodStart && dateOnly(row.reported_at) <= options.periodEnd && (options.includeInactive || !isArchived(row))),
    schedules: lotFiltered(schedules).filter(row => row.next_due_date <= options.periodEnd && (options.includeInactive || (!isArchived(row) && row.is_active))),
    safety: lotFiltered(safety).filter(row => dateOnly(row.inspection_date) >= options.periodStart && dateOnly(row.inspection_date) <= options.periodEnd && (options.includeInactive || !isArchived(row))),
    markings: lotFiltered(markings).filter(row => options.includeInactive || !isArchived(row)),
  };
  filtered.schedules = filtered.schedules.map(row => ({ ...row, __period_end: options.periodEnd }));
  const recordIds = new Set<string>([...filtered.equipment, ...filtered.maintenance, ...filtered.schedules, ...filtered.safety, ...filtered.markings].map(row => row.id));
  const documentNumbers = await collectDocumentNumbers(recordIds);
  return { ...filtered, documentNumbers };
}

function sortRows(rows: any[], sort: FacilityReportSort, periodEnd: string) {
  const statusRank = (row: any) => {
    if (row.priority === "critical" || row.status === "broken" || Number(row.fail_items || 0) > 0 || ["poor", "damaged", "missing"].includes(row.condition)) return 0;
    if (row.priority === "high" || row.status === "warning" || row.next_due_date < periodEnd || row.correction_deadline < periodEnd) return 1;
    return 5;
  };
  const dateValue = (row: any) => row.reported_at || row.inspection_date || row.next_due_date || row.next_due || row.warranty_end || row.updated_at || "";
  const costValue = (row: any) => Number(row.total_cost || row.total_maintenance_cost || row.estimated_cost || 0);
  return [...rows].sort((a, b) => {
    if (sort === "date_desc") return String(dateValue(b)).localeCompare(String(dateValue(a)), "ko");
    if (sort === "attention") return statusRank(a) - statusRank(b) || String(dateValue(a)).localeCompare(String(dateValue(b)), "ko");
    if (sort === "cost_desc") return costValue(b) - costValue(a);
    return lotName(a).localeCompare(lotName(b), "ko", { numeric: true }) || text(a.equipment_code || a.log_number || a.inspection_number || a.marking_name).localeCompare(text(b.equipment_code || b.log_number || b.inspection_number || b.marking_name), "ko", { numeric: true });
  });
}

const DATASET_KEY: Record<Exclude<FacilityReportSectionId, "overview">, keyof Pick<FacilityReportDataset, "equipment" | "maintenance" | "schedules" | "safety" | "markings">> = {
  equipment: "equipment", maintenance: "maintenance", schedules: "schedules", safety: "safety", markings: "markings",
};

const TABLE_IDENTITY_FIELDS: Record<Exclude<FacilityReportSectionId, "overview">, string[]> = {
  equipment: ["equipment_code", "lot", "name"],
  maintenance: ["log_number", "lot", "title"],
  schedules: ["lot", "schedule_name"],
  safety: ["inspection_number", "lot"],
  markings: ["lot", "marking_name"],
};

const TABLE_GROUP_TITLES: Record<Exclude<FacilityReportSectionId, "overview">, string[]> = {
  equipment: ["장비 기본정보·상태", "정비비용·증빙·문서 연계"],
  maintenance: ["접수·대상·처리기한", "원인·조치·비용·완료", "문서·업체 연락처"],
  schedules: ["점검계획·일정", "사용·비용·문서 연계"],
  safety: ["점검결과·시정기한", "시정완료·후속점검·증빙"],
  markings: ["표시현황·상태·재시공일정", "비용·규정·증빙·문서 연계"],
};

function splitFacilityFields(id: Exclude<FacilityReportSectionId, "overview">, fields: FacilityReportField[], orientation: FacilityReportOrientation) {
  const maximumColumns = orientation === "portrait" ? 10 : 14;
  if (fields.length <= maximumColumns) return [fields];
  const identityKeys = TABLE_IDENTITY_FIELDS[id];
  const identity = fields.filter(item => identityKeys.includes(item.key));
  const details = fields.filter(item => !identityKeys.includes(item.key));
  const detailLimit = Math.max(1, maximumColumns - identity.length);
  const groups: FacilityReportField[][] = [];
  for (let index = 0; index < details.length; index += detailLimit) groups.push([...identity, ...details.slice(index, index + detailLimit)]);
  return groups;
}

export function buildFacilityReportModel(dataset: FacilityReportDataset, options: FacilityReportOptions): FacilityReportModel {
  const equipmentAttention = dataset.equipment.filter(row => ["warning", "broken", "maintenance"].includes(row.status)).length;
  const openMaintenance = dataset.maintenance.filter(isOpenMaintenance).length;
  const overdueMaintenance = dataset.maintenance.filter(row => isOpenMaintenance(row) && row.due_date && row.due_date < options.periodEnd).length;
  const overdueSchedules = dataset.schedules.filter(row => row.next_due_date && row.next_due_date < options.periodEnd).length;
  const safetyFailures = dataset.safety.filter(row => Number(row.fail_items || 0) > 0).length;
  const overdueCorrections = dataset.safety.filter(row => row.correction_deadline && row.correction_deadline < options.periodEnd && !row.correction_completed).length;
  const markingAttention = dataset.markings.filter(row => ["poor", "faded", "damaged", "missing"].includes(row.condition)).length;
  const repaintDue = dataset.markings.filter(row => row.next_due && row.next_due <= options.periodEnd).length;
  const photoEvidence = [
    ...dataset.equipment.map(row => photoCount(row, ["photo_path"])),
    ...dataset.maintenance.map(row => photoCount(row, ["before_photo", "after_photo"])),
    ...dataset.safety.map(row => photoCount(row, ["photo_paths"])),
    ...dataset.markings.map(row => photoCount(row, ["photo_path"])),
  ].reduce((sum, count) => sum + count, 0);
  const linkedDocuments = Object.values(dataset.documentNumbers).reduce((sum, numbers) => sum + numbers.length, 0);
  const summary = {
    parkingLots: dataset.parkingLots.length,
    equipment: dataset.equipment.length,
    equipmentAttention,
    maintenance: dataset.maintenance.length,
    openMaintenance,
    overdueMaintenance,
    maintenanceCost: dataset.maintenance.reduce((sum, row) => sum + Number(row.total_cost || 0), 0),
    downtimeHours: dataset.maintenance.reduce((sum, row) => sum + Number(row.downtime_hours || 0), 0),
    schedules: dataset.schedules.length,
    overdueSchedules,
    safety: dataset.safety.length,
    safetyFailures,
    overdueCorrections,
    markings: dataset.markings.length,
    markingAttention,
    repaintDue,
    photoEvidence,
    linkedDocuments,
  };
  const tables = options.selectedSections.filter((id): id is Exclude<FacilityReportSectionId, "overview"> => id !== "overview").flatMap(id => {
    const section = FACILITY_REPORT_SECTIONS.find(item => item.id === id)!;
    const requested = options.selectedFields[id] || section.defaultFields;
    const fields = section.fields.filter(item => requested.includes(item.key));
    const sourceRows = sortRows(dataset[DATASET_KEY[id]], options.sort, options.periodEnd);
    const fieldGroups = splitFacilityFields(id, fields, options.orientation);
    return fieldGroups.map((group, groupIndex) => ({
      id: id as any,
      title: section.label,
      subtitle: fieldGroups.length > 1 ? (TABLE_GROUP_TITLES[id][groupIndex] || `${section.label} 세부정보`) : undefined,
      subtitleNumber: fieldGroups.length > 1 ? groupIndex + 1 : undefined,
      continuation: groupIndex > 0,
      columns: group.map(item => ({ key: item.key, label: item.label })),
      rows: sourceRows.map(row => Object.fromEntries(group.map(item => [item.key, text(item.value(row, dataset))]))),
    } as OperationsReportTable));
  });
  const selectedFields = options.selectedSections.flatMap(id => {
    const section = FACILITY_REPORT_SECTIONS.find(item => item.id === id)!;
    return section.fields.filter(item => (options.selectedFields[id] || section.defaultFields).includes(item.key));
  });
  const risks = [
    equipmentAttention ? `조치 필요 장비 ${equipmentAttention}대` : "장비 중대 이상 없음",
    overdueMaintenance ? `기한 경과 유지보수 ${overdueMaintenance}건` : "기한 경과 유지보수 없음",
    overdueSchedules ? `지연 점검 ${overdueSchedules}건` : "지연 점검 없음",
    overdueCorrections ? `미완료 안전 시정 ${overdueCorrections}건` : "안전 시정 지연 없음",
    markingAttention ? `정비 필요 노면표시 ${markingAttention}건` : "노면표시 중대 이상 없음",
  ];
  return {
    period: { start: options.periodStart, end: options.periodEnd },
    lotTypeLabels: FACILITY_LOT_TYPE_OPTIONS.filter(item => options.lotTypes.includes(item.value)).map(item => item.label),
    summary, sourceCounts: { lots: dataset.parkingLots.length, equipment: dataset.equipment.length, maintenance: dataset.maintenance.length, schedules: dataset.schedules.length, safety: dataset.safety.length, markings: dataset.markings.length, documents: linkedDocuments, photos: photoEvidence },
    tables, selectedFieldCount: selectedFields.length, protectedFieldCount: selectedFields.filter(item => item.protected).length,
    attentionNarrative: risks.join("; "),
  };
}

export function facilityReportBriefRows(model: FacilityReportModel, documentSummary?: string): string[][] {
  const sourceCount = model.summary.equipment + model.summary.maintenance + model.summary.schedules + model.summary.safety + model.summary.markings;
  return [
    ["담당부서", PRIMARY_DEPARTMENT],
    ["보고기간", `${model.period.start} ~ ${model.period.end}`],
    ["보고대상", `제주시 ${model.lotTypeLabels.join("·") || "공영주차장 전체"}`],
    ["주요내용", [...new Set(model.tables.filter(table => !table.continuation).map(table => table.title))].join("·") || "시설관리 핵심 현황"],
    ["작성목적", documentSummary || "시설·장비의 상태와 점검·정비 이력을 확인하고 안전 및 운영 중단 위험에 선제적으로 대응하기 위함."],
    ["산출기준", `보고기간과 주차장 형태 조건에 해당하는 시설관리 원천자료 ${sourceCount.toLocaleString("ko-KR")}건을 집계함. ${model.attentionNarrative}`],
  ];
}

export function facilityReportSummaryRows(model: FacilityReportModel): string[][] {
  return [
    ["대상 주차장", `${model.summary.parkingLots.toLocaleString("ko-KR")}개소`, "등록 장비", `${model.summary.equipment.toLocaleString("ko-KR")}대`],
    ["조치 필요 장비", `${model.summary.equipmentAttention.toLocaleString("ko-KR")}대`, "미종결 유지보수", `${model.summary.openMaintenance.toLocaleString("ko-KR")}건`],
    ["기한 경과 작업", `${model.summary.overdueMaintenance.toLocaleString("ko-KR")}건`, "지연 점검", `${model.summary.overdueSchedules.toLocaleString("ko-KR")}건`],
    ["안전 불합격 점검", `${model.summary.safetyFailures.toLocaleString("ko-KR")}건`, "미완료 안전 시정", `${model.summary.overdueCorrections.toLocaleString("ko-KR")}건`],
    ["정비 필요 노면표시", `${model.summary.markingAttention.toLocaleString("ko-KR")}건`, "재시공 도래", `${model.summary.repaintDue.toLocaleString("ko-KR")}건`],
    ["기간 유지보수비", won(model.summary.maintenanceCost), "운영 중단시간", `${model.summary.downtimeHours.toLocaleString("ko-KR")}시간`],
    ["사진 증빙", `${model.summary.photoEvidence.toLocaleString("ko-KR")}건`, "연결 공식문서", `${model.summary.linkedDocuments.toLocaleString("ko-KR")}건`],
  ];
}

export function toOperationsCompatibleFacilityModel(model: FacilityReportModel): OperationsReportModel {
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

export async function getFacilityReportEvidence(parameters: Record<string, string>) {
  const options = parseFacilityReportOptions(parameters);
  const dataset = await collectFacilityReportData(options);
  const model = buildFacilityReportModel(dataset, options);
  return { period: model.period, sourceCounts: model.sourceCounts, summary: model.summary, selectedFieldCount: model.selectedFieldCount, protectedFieldCount: model.protectedFieldCount, attentionNarrative: model.attentionNarrative };
}
