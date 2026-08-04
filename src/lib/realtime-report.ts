import { PRIMARY_DEPARTMENT } from "@/config/organization";
import { supabase } from "@/integrations/supabase/client";
import type { OperationsReportModel, OperationsReportOrientation, OperationsReportTable } from "@/lib/operations-report";

export type RealtimeReportSectionId = "overview" | "occupancy" | "devices" | "communications" | "discrepancies" | "alerts" | "documents";
export type RealtimeReportSort = "attention" | "occupancy_desc" | "parking_lot" | "last_updated" | "status" | "lot_type";
export type RealtimeReportOrientation = OperationsReportOrientation;

export interface RealtimeReportField {
  key: string;
  label: string;
  protected?: boolean;
  value: (row: any, dataset: RealtimeReportDataset, options: RealtimeReportOptions) => unknown;
}

export interface RealtimeReportSection {
  id: RealtimeReportSectionId;
  label: string;
  description: string;
  fields: RealtimeReportField[];
  defaultFields: string[];
}

export interface RealtimeReportOptions {
  periodStart: string;
  periodEnd: string;
  asOfDate: string;
  selectedSections: RealtimeReportSectionId[];
  selectedFields: Partial<Record<RealtimeReportSectionId, string[]>>;
  lotTypes: string[];
  statuses: string[];
  sort: RealtimeReportSort;
  orientation: RealtimeReportOrientation;
  includeOffline: boolean;
}

export interface RealtimeEvidenceSource { expected: number; loaded: number; complete: boolean; }
export interface RealtimeReportEvidenceMetadata {
  complete: boolean;
  collectedAt: string;
  queryLimit: number;
  truncationPolicy: "fail";
  sourceTables: string[];
  filters: { periodStart: string; periodEnd: string; asOfDate: string; lotTypes: string[]; statuses: string[]; includeOffline: boolean };
  sources: Record<string, RealtimeEvidenceSource>;
}

export interface RealtimeReportDataset {
  parkingLots: any[];
  mapRows: any[];
  lotStatuses: any[];
  sensors: any[];
  sensorHealth: any[];
  gateways: any[];
  attachments: any[];
  officialDocuments: any[];
  documentNumbers: Record<string, string[]>;
  evidenceMetadata?: RealtimeReportEvidenceMetadata;
}

export interface RealtimeReportSummary extends Record<string, number> {
  parkingLots: number;
  offstreetLots: number;
  buildingLots: number;
  onstreetLots: number;
  totalSpaces: number;
  occupiedSpaces: number;
  availableSpaces: number;
  occupancyRate: number;
  freshLots: number;
  staleLots: number;
  sensors: number;
  activeSensors: number;
  offlineSensors: number;
  lowBatterySensors: number;
  errorSensors: number;
  gateways: number;
  onlineGateways: number;
  offlineGateways: number;
  discrepancyCount: number;
  alertCount: number;
  linkedDocuments: number;
  lotsMissingDocuments: number;
}

export interface RealtimeReportModel {
  period: { start: string; end: string };
  asOfDate: string;
  lotTypeLabels: string[];
  summary: RealtimeReportSummary;
  sourceCounts: Record<string, number>;
  tables: OperationsReportTable[];
  selectedFieldCount: number;
  protectedFieldCount: number;
  riskNarrative: string;
  evidenceMetadata: RealtimeReportEvidenceMetadata;
}

const QUERY_LIMIT = 5000;
const ID_CHUNK_SIZE = 200;
const SOURCE_TABLES = ["parking_lots", "realtime_map_view", "lot_realtime_status", "sensor_devices", "sensor_health_view", "gateway_devices", "attachments", "official_documents"];
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
const STATUS_LABELS: Record<string, string> = { active: "정상", online: "온라인", offline: "오프라인", error: "오류", maintenance: "점검", low_battery: "저전압", stale: "갱신지연", full: "만차", normal: "운영" };
const DEVICE_STATUS = new Set(["active", "online", "offline", "error", "maintenance", "low_battery"]);

export const REALTIME_REPORT_LOT_TYPE_OPTIONS = [
  { value: "offstreet", label: "노외주차장" },
  { value: "building", label: "주차빌딩" },
  { value: "onstreet", label: "노상주차장" },
];

const relation = (row: any, key: string) => Array.isArray(row?.[key]) ? row[key][0] : row?.[key];
const text = (value: unknown) => value === null || value === undefined || value === "" ? "-" : String(value);
const dateOnly = (value: unknown) => value ? String(value).split("T")[0] : "-";
const dateTime = (value: unknown) => value ? String(value).replace("T", " ").replace("Z", "").slice(0, 16) : "-";
const unique = (values: unknown[]) => [...new Set(values.map(value => String(value || "").trim()).filter(Boolean))];
const countLabel = (value: unknown, suffix = "건") => `${Number(value || 0).toLocaleString("ko-KR")}${suffix}`;
const percent = (value: unknown) => `${Number(value || 0).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
const statusLabel = (value: unknown) => STATUS_LABELS[String(value || "")] || text(value);
const lot = (row: any) => relation(row, "parking_lots");
const lotId = (row: any) => row?.lot_id || row?.parking_lot_id || lot(row)?.id;
const lotName = (row: any, dataset: RealtimeReportDataset) => lot(row)?.name || row?.parking_lot_name || dataset.parkingLots.find(item => item.id === lotId(row))?.name || "미지정 주차장";
const lotType = (row: any, dataset: RealtimeReportDataset) => lot(row)?.lot_type || row?.lot_type || dataset.parkingLots.find(item => item.id === lotId(row))?.lot_type || "";
const lotTypeLabel = (row: any, dataset: RealtimeReportDataset) => LOT_TYPE_LABELS[lotType(row, dataset)] || text(lotType(row, dataset));
const timestamp = (row: any) => row?.last_updated || row?.last_sensor_update || row?.last_heartbeat || row?.updated_at || null;
const ageMinutes = (row: any, asOfDate: string) => {
  const value = timestamp(row);
  if (!value) return Number.POSITIVE_INFINITY;
  // The report's as-of date is a business-day observation date. Use a fixed
  // morning observation point so deterministic reports do not mark the whole
  // day as stale merely because the timestamp is earlier than midnight.
  const end = new Date(`${asOfDate}T09:00:00Z`).getTime();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, (end - time) / 60000) : Number.POSITIVE_INFINITY;
};
const isStale = (row: any, options: RealtimeReportOptions) => ageMinutes(row, options.asOfDate) > 30;
const documentKey = (id: string) => `REALTIME:${id}`;

function field(key: string, label: string, value: RealtimeReportField["value"], protectedField = false): RealtimeReportField {
  return { key, label, value, protected: protectedField };
}

export const REALTIME_REPORT_SECTIONS: RealtimeReportSection[] = [
  { id: "overview", label: "실시간 현황 요약", description: "주차장별 실시간 주차면·갱신 상태를 요약합니다.", fields: [], defaultFields: [] },
  { id: "occupancy", label: "주차장별 점유 현황", description: "주차장 형태별 총면수, 점유면수, 가용면수와 갱신시각입니다.", fields: [
    field("lot_code", "주차장코드", row => row.code || row.lot_code), field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)),
    field("total_spaces", "총 주차면", row => countLabel(row.total_spaces, "면")), field("occupied_spaces", "점유면", row => countLabel(row.occupied_spaces, "면")), field("available_spaces", "가용면", row => countLabel(row.available_spaces ?? Number(row.total_spaces || 0) - Number(row.occupied_spaces || 0), "면")),
    field("occupancy_rate", "점유율", row => percent(row.occupancy_rate ?? (Number(row.occupied_spaces || 0) / Math.max(1, Number(row.total_spaces || 0)) * 100))), field("congestion_level", "혼잡도", row => statusLabel(row.congestion_level)), field("last_updated", "최종 갱신", row => dateTime(row.last_updated || row.last_sensor_update)),
  ], defaultFields: ["lot_code", "lot", "lot_type", "total_spaces", "occupied_spaces", "available_spaces", "occupancy_rate", "congestion_level", "last_updated"] },
  { id: "devices", label: "센서 장비 현황", description: "센서 상태, 배터리, 마지막 응답과 오류를 확인합니다.", fields: [
    field("device_id", "장비ID", row => row.device_id), field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)), field("device_type", "장비종류", row => row.device_type || row.model), field("status", "상태", row => statusLabel(row.effective_status || row.status)), field("battery_level", "배터리", row => row.battery_level == null ? "-" : `${row.battery_level}%`), field("last_heartbeat", "최종 응답", row => dateTime(row.last_heartbeat)), field("error_count", "오류 건수", row => countLabel(row.error_count)), field("ip_address", "IP주소", row => row.ip_address, true), field("document_numbers", "문서번호", row => text(row.document_numbers)),
  ], defaultFields: ["device_id", "lot", "lot_type", "device_type", "status", "battery_level", "last_heartbeat", "error_count"] },
  { id: "communications", label: "통신 장비 현황", description: "게이트웨이 온라인 여부와 연결 센서 수를 확인합니다.", fields: [
    field("device_id", "게이트웨이ID", row => row.device_id), field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("status", "상태", row => statusLabel(row.effective_status || row.status)), field("protocol", "통신방식", row => row.protocol), field("connected_sensors", "연결 센서", row => countLabel(row.connected_sensors, "대")), field("last_heartbeat", "최종 응답", row => dateTime(row.last_heartbeat)), field("ip_address", "IP주소", row => row.ip_address, true), field("document_numbers", "문서번호", row => text(row.document_numbers)),
  ], defaultFields: ["device_id", "lot", "status", "protocol", "connected_sensors", "last_heartbeat", "document_numbers"] },
  { id: "discrepancies", label: "데이터 불일치", description: "지도·현황·센서 집계가 서로 다른 주차장을 확인합니다.", fields: [
    field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)), field("source", "비교 원천", row => row.source), field("expected", "기준값", row => countLabel(row.expected, "면")), field("actual", "수집값", row => countLabel(row.actual, "면")), field("difference", "차이", row => countLabel(row.difference, "면")), field("reason", "확인사항", row => row.reason),
  ], defaultFields: ["lot", "lot_type", "source", "expected", "actual", "difference", "reason"] },
  { id: "alerts", label: "경보·조치 대상", description: "갱신지연, 오프라인, 저전압, 오류를 조치 우선순위로 제공합니다.", fields: [
    field("priority", "우선순위", row => row.priority), field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)), field("target", "대상", row => row.target), field("status", "상태", row => statusLabel(row.status)), field("last_seen", "마지막 확인", row => dateTime(row.last_seen)), field("action", "권고 조치", row => row.action),
  ], defaultFields: ["priority", "lot", "lot_type", "target", "status", "last_seen", "action"] },
  { id: "documents", label: "연계 공식문서", description: "실시간 연계 설정과 장애 조치에 연결된 문서번호입니다.", fields: [
    field("lot", "주차장", (row, dataset) => lotName(row, dataset)), field("lot_type", "형태", (row, dataset) => lotTypeLabel(row, dataset)), field("document_number", "문서번호", row => row.document_number), field("document_type", "문서종류", row => row.document_type || "공문"), field("linked_at", "연계일", row => dateOnly(row.linked_at)), field("status", "상태", row => row.status || "연계"),
  ], defaultFields: ["lot", "lot_type", "document_number", "document_type", "linked_at", "status"] },
];

export const REALTIME_REPORT_PRESETS = {
  summary: { label: "간부 보고", sections: ["overview", "occupancy", "alerts", "discrepancies"] as RealtimeReportSectionId[] },
  standard: { label: "실무 종합", sections: REALTIME_REPORT_SECTIONS.map(section => section.id) },
  audit: { label: "장애·감사 대응", sections: ["overview", "devices", "communications", "discrepancies", "alerts", "documents"] as RealtimeReportSectionId[] },
};

export function defaultRealtimeReportFields(): Partial<Record<RealtimeReportSectionId, string[]>> {
  return Object.fromEntries(REALTIME_REPORT_SECTIONS.map(section => [section.id, [...section.defaultFields]]));
}

export function parseRealtimeReportOptions(parameters: Record<string, string>): RealtimeReportOptions {
  const knownSections = new Set(REALTIME_REPORT_SECTIONS.map(section => section.id));
  const rawSections = (parameters.realtime_sections || REALTIME_REPORT_PRESETS.summary.sections.join(",")).split(",").filter((id): id is RealtimeReportSectionId => knownSections.has(id as RealtimeReportSectionId));
  let selectedFields = defaultRealtimeReportFields();
  try { const parsed = JSON.parse(parameters.realtime_fields || "{}"); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) selectedFields = { ...selectedFields, ...parsed }; } catch { selectedFields = defaultRealtimeReportFields(); }
  const periodStart = parameters.period_start || new Date().toISOString().slice(0, 10);
  const periodEnd = parameters.period_end || periodStart;
  return {
    periodStart, periodEnd, asOfDate: parameters.realtime_as_of_date || periodEnd,
    selectedSections: rawSections.length ? rawSections : ["overview"], selectedFields,
    lotTypes: (parameters.realtime_lot_types || "offstreet,building,onstreet").split(",").filter(Boolean),
    statuses: (parameters.realtime_statuses || "").split(",").filter(Boolean),
    sort: (["attention", "occupancy_desc", "parking_lot", "last_updated", "status", "lot_type"].includes(parameters.realtime_sort) ? parameters.realtime_sort : "attention") as RealtimeReportSort,
    orientation: parameters.realtime_orientation === "landscape" ? "landscape" : "portrait", includeOffline: parameters.realtime_include_offline !== "false",
  };
}

function matchesLotType(row: any, dataset: RealtimeReportDataset, selected: string[]) {
  if (!selected.length || selected.length === REALTIME_REPORT_LOT_TYPE_OPTIONS.length) return true;
  const actual = lotType(row, dataset); return selected.some(group => (LOT_TYPE_ALIASES[group] || [group]).includes(actual));
}
function inPeriod(value: unknown, options: RealtimeReportOptions) { const date = dateOnly(value); return date === "-" || (date >= options.periodStart && date <= options.periodEnd); }
function chunks<T>(values: T[], size = ID_CHUNK_SIZE) { const result: T[][] = []; for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size)); return result; }

export function assertCompleteRealtimeResult(label: string, result: { data?: unknown[] | null; error?: { message: string } | null; count?: number | null }, limit = QUERY_LIMIT) {
  if (result.error) throw new Error(`${label} 자료 조회에 실패했습니다: ${result.error.message}`);
  if (typeof result.count !== "number") throw new Error(`${label} 전체 건수를 확인할 수 없어 보고서 생성을 중단했습니다.`);
  if (result.count > limit) throw new Error(`${label} 자료 ${result.count}건이 조회 한도 ${limit}건을 초과하여 보고서 생성을 중단했습니다.`);
  const rows = result.data || [];
  if (rows.length !== result.count) throw new Error(`${label} 자료 ${result.count}건 중 ${rows.length}건만 조회되어 보고서 생성을 중단했습니다.`);
  return rows;
}

async function checkedQuery(label: string, promise: PromiseLike<any>, limit = QUERY_LIMIT) { return assertCompleteRealtimeResult(label, await promise, limit) as any[]; }

async function collectChunked(label: string, ids: string[], query: (ids: string[], remaining: number) => PromiseLike<any>) {
  const rows: any[] = []; let expected = 0;
  for (const idChunk of chunks(unique(ids))) { const remaining = QUERY_LIMIT - rows.length; if (remaining <= 0) throw new Error(`${label} 자료가 ${QUERY_LIMIT}건을 초과했습니다.`); const result = await query(idChunk, remaining); rows.push(...assertCompleteRealtimeResult(label, result, remaining)); expected += Number(result.count || 0); }
  return { rows, evidence: { expected, loaded: rows.length, complete: true } as RealtimeEvidenceSource };
}

export async function collectRealtimeReportData(options: RealtimeReportOptions): Promise<RealtimeReportDataset> {
  const [lotsResult, mapResult, statusResult, sensorsResult, healthResult, gatewaysResult] = await Promise.all([
    (supabase as any).from("parking_lots").select("id, code, name, lot_type, status", { count: "exact" }).limit(QUERY_LIMIT),
    (supabase as any).from("realtime_map_view").select("*", { count: "exact" }).limit(QUERY_LIMIT),
    (supabase as any).from("lot_realtime_status").select("*", { count: "exact" }).limit(QUERY_LIMIT),
    (supabase as any).from("sensor_devices").select("*", { count: "exact" }).limit(QUERY_LIMIT),
    (supabase as any).from("sensor_health_view").select("*", { count: "exact" }).limit(QUERY_LIMIT),
    (supabase as any).from("gateway_devices").select("*", { count: "exact" }).limit(QUERY_LIMIT),
  ]);
  const parkingLots = assertCompleteRealtimeResult("주차장", lotsResult) as any[];
  const mapRows = assertCompleteRealtimeResult("실시간 지도", mapResult) as any[];
  const lotStatuses = assertCompleteRealtimeResult("주차장 실시간 현황", statusResult) as any[];
  const sensors = assertCompleteRealtimeResult("센서 장비", sensorsResult) as any[];
  const sensorHealth = assertCompleteRealtimeResult("센서 상태", healthResult) as any[];
  const gateways = assertCompleteRealtimeResult("게이트웨이", gatewaysResult) as any[];
  const lotById = new Map(parkingLots.map(row => [row.id, row]));
  const filtered = <T extends any[]>(rows: T) => rows.filter(row => matchesLotType(row, { parkingLots } as RealtimeReportDataset, options.lotTypes));
  const selectedLotIds = new Set(filtered(parkingLots).map(row => row.id));
  const byLots = <T extends any[]>(rows: T) => rows.filter(row => selectedLotIds.has(lotId(row)));
  const filteredMap = mapRows.filter(row => selectedLotIds.has(lotId(row)) && inPeriod(row.last_updated || row.updated_at, options));
  const filteredStatuses = byLots(lotStatuses); const filteredSensors = byLots(sensors); const filteredHealth = byLots(sensorHealth); const filteredGateways = byLots(gateways);
  const attachmentResult = await collectChunked("실시간 공식문서 연결", [...selectedLotIds, ...filteredSensors.map(row => row.id), ...filteredGateways.map(row => row.id)], (ids, remaining) => (
    (supabase as any).from("attachments").select("module, ref_id, ref_type, file_path, created_at", { count: "exact" }).eq("module", "REALTIME").in("ref_id", ids).limit(remaining)
  ));
  const documentIds = unique(attachmentResult.rows.map(row => String(row.file_path || "").replace("parkmaster-document://", "")).filter(id => id && !id.includes("/")));
  const documentResult = await collectChunked("실시간 공식문서", documentIds, (ids, remaining) => (supabase as any).from("official_documents").select("id, document_number, document_type, created_at", { count: "exact" }).in("id", ids).limit(remaining));
  const documentsById = new Map(documentResult.rows.map(row => [row.id, row]));
  const documentNumbers = attachmentResult.rows.reduce<Record<string, string[]>>((result, row) => { const doc = documentsById.get(String(row.file_path || "").replace("parkmaster-document://", "")); if (doc?.document_number) result[documentKey(row.ref_id)] = unique([...(result[documentKey(row.ref_id)] || []), doc.document_number]); return result; }, {});
  const evidenceMetadata: RealtimeReportEvidenceMetadata = { complete: true, collectedAt: new Date().toISOString(), queryLimit: QUERY_LIMIT, truncationPolicy: "fail", sourceTables: SOURCE_TABLES, filters: { periodStart: options.periodStart, periodEnd: options.periodEnd, asOfDate: options.asOfDate, lotTypes: options.lotTypes, statuses: options.statuses, includeOffline: options.includeOffline }, sources: {
    parkingLots: { expected: parkingLots.length, loaded: parkingLots.length, complete: true }, realtimeMap: { expected: mapRows.length, loaded: mapRows.length, complete: true }, lotStatuses: { expected: lotStatuses.length, loaded: lotStatuses.length, complete: true }, sensors: { expected: sensors.length, loaded: sensors.length, complete: true }, sensorHealth: { expected: sensorHealth.length, loaded: sensorHealth.length, complete: true }, gateways: { expected: gateways.length, loaded: gateways.length, complete: true }, attachments: attachmentResult.evidence, officialDocuments: documentResult.evidence,
  } };
  return { parkingLots: filtered(parkingLots), mapRows: filteredMap, lotStatuses: filteredStatuses, sensors: filteredSensors, sensorHealth: filteredHealth, gateways: filteredGateways, attachments: attachmentResult.rows, officialDocuments: documentResult.rows, documentNumbers, evidenceMetadata };
}

function statusForSensor(row: any) { const explicit = row.effective_status || row.status; if (explicit && DEVICE_STATUS.has(explicit)) return explicit; if (row.battery_level != null && Number(row.battery_level) < 20) return "low_battery"; return row.last_heartbeat ? "active" : "offline"; }
function statusForGateway(row: any, options: RealtimeReportOptions) { if (row.status === "maintenance") return "maintenance"; return ageMinutes(row, options.asOfDate) <= 5 && row.status === "active" ? "online" : "offline"; }
function selectedFields(section: RealtimeReportSection, options: RealtimeReportOptions) {
  const keys = options.selectedFields[section.id] || section.defaultFields; const byKey = new Map(section.fields.map(item => [item.key, item]));
  return [...new Set([...keys, ...section.fields.filter(item => item.protected).map(item => item.key)])].map(key => byKey.get(key)).filter(Boolean) as RealtimeReportField[];
}
function buildTable(section: RealtimeReportSection, rows: any[], dataset: RealtimeReportDataset, options: RealtimeReportOptions): OperationsReportTable {
  const fields = selectedFields(section, options); return { id: section.id, title: section.label, subtitle: section.description, columns: fields.map(item => ({ key: item.key, label: item.label })), rows: rows.map(row => Object.fromEntries(fields.map(item => [item.key, text(item.value(row, dataset, options))]))) };
}

function lotTypeMatch(row: any, dataset: RealtimeReportDataset, options: RealtimeReportOptions) { return matchesLotType(row, dataset, options.lotTypes); }
function occupancyRows(dataset: RealtimeReportDataset) { return dataset.lotStatuses.map(row => ({ ...row, ...(dataset.parkingLots.find(lotItem => lotItem.id === lotId(row)) || {}) })); }
function deviceRows(dataset: RealtimeReportDataset) {
  const healthById = new Map(dataset.sensorHealth.map(row => [row.id || row.sensor_id || row.device_id, row]));
  return dataset.sensors.map(row => ({ ...row, ...(healthById.get(row.id) || healthById.get(row.device_id) || {}), effective_status: statusForSensor({ ...row, ...(healthById.get(row.id) || {}) }), document_numbers: (dataset.documentNumbers[documentKey(row.id)] || []).join(", ") }));
}
function gatewayRows(dataset: RealtimeReportDataset, options: RealtimeReportOptions) { return dataset.gateways.map(row => ({ ...row, effective_status: statusForGateway(row, options), document_numbers: (dataset.documentNumbers[documentKey(row.id)] || []).join(", ") })); }
function sortRows(rows: any[], section: RealtimeReportSectionId, dataset: RealtimeReportDataset, options: RealtimeReportOptions) {
  const copy = [...rows]; const attention = (row: any) => section === "alerts" ? ({ 긴급: 0, 높음: 1, 보통: 2 }[row.priority] ?? 3) : section === "discrepancies" ? Math.abs(Number(row.difference || 0)) * -1 : isStale(row, options) ? 0 : 1;
  return copy.sort((a, b) => { if (options.sort === "attention") return attention(a) - attention(b); if (options.sort === "occupancy_desc") return Number(b.occupancy_rate || 0) - Number(a.occupancy_rate || 0); if (options.sort === "last_updated") return String(b.last_updated || b.last_heartbeat || "").localeCompare(String(a.last_updated || a.last_heartbeat || "")); if (options.sort === "status") return String(a.status || a.effective_status || "").localeCompare(String(b.status || b.effective_status || "")); if (options.sort === "lot_type") return lotType(a, dataset).localeCompare(lotType(b, dataset)); return lotName(a, dataset).localeCompare(lotName(b, dataset), "ko"); });
}

function makeDiscrepancies(dataset: RealtimeReportDataset, options: RealtimeReportOptions) {
  const mapByLot = new Map(dataset.mapRows.map(row => [lotId(row), row])); const result: any[] = [];
  dataset.lotStatuses.forEach(status => { const map = mapByLot.get(lotId(status)); const expected = Number(status.occupied_spaces || 0); const actual = Number(map?.occupied_spaces ?? expected); if (actual !== expected) result.push({ ...status, source: "지도·실시간 현황", expected, actual, difference: actual - expected, reason: "점유면 집계 기준 확인" }); });
  return result;
}
function makeAlerts(dataset: RealtimeReportDataset, options: RealtimeReportOptions) {
  const result: any[] = [];
  dataset.lotStatuses.forEach(row => { if (isStale(row, options)) result.push({ ...row, priority: "높음", target: "주차장 현황", status: "stale", last_seen: timestamp(row), action: "현장 통신·센서 갱신상태 확인" }); });
  deviceRows(dataset).forEach(row => { const status = statusForSensor(row); if (status === "offline" || status === "error" || status === "low_battery") result.push({ ...row, priority: status === "error" ? "긴급" : "높음", target: `센서 ${row.device_id}`, status, last_seen: row.last_heartbeat, action: status === "low_battery" ? "배터리 교체 일정 등록" : "장비·통신 상태 점검" }); });
  gatewayRows(dataset, options).forEach(row => { if (row.effective_status === "offline") result.push({ ...row, priority: "긴급", target: `게이트웨이 ${row.device_id}`, status: "offline", last_seen: row.last_heartbeat, action: "통신 회선과 전원 즉시 확인" }); });
  return result;
}

export function buildRealtimeReportModel(dataset: RealtimeReportDataset, options: RealtimeReportOptions): RealtimeReportModel {
  if (!dataset.evidenceMetadata?.complete) throw new Error("실시간 원자료가 완전하지 않아 보고서를 생성할 수 없습니다.");
  const selectedLots = dataset.parkingLots.filter(row => lotTypeMatch(row, dataset, options));
  const selectedLotIds = new Set(selectedLots.map(row => row.id));
  const scopedDataset: RealtimeReportDataset = {
    ...dataset,
    mapRows: dataset.mapRows.filter(row => selectedLotIds.has(lotId(row))),
    lotStatuses: dataset.lotStatuses.filter(row => selectedLotIds.has(lotId(row))),
    sensors: dataset.sensors.filter(row => selectedLotIds.has(lotId(row))),
    sensorHealth: dataset.sensorHealth.filter(row => selectedLotIds.has(lotId(row))),
    gateways: dataset.gateways.filter(row => selectedLotIds.has(lotId(row))),
    attachments: dataset.attachments.filter(row => selectedLotIds.has(row.ref_id) || dataset.sensors.some(sensor => sensor.id === row.ref_id && selectedLotIds.has(lotId(sensor))) || dataset.gateways.some(gateway => gateway.id === row.ref_id && selectedLotIds.has(lotId(gateway)))),
  };
  const occupancy = sortRows(occupancyRows(scopedDataset), "occupancy", scopedDataset, options); const devices = sortRows(deviceRows(scopedDataset), "devices", scopedDataset, options); const communications = sortRows(gatewayRows(scopedDataset, options), "communications", scopedDataset, options); const discrepancies = sortRows(makeDiscrepancies(scopedDataset, options), "discrepancies", scopedDataset, options); const alerts = sortRows(makeAlerts(scopedDataset, options), "alerts", scopedDataset, options);
  const totalSpaces = occupancy.reduce((sum, row) => sum + Number(row.total_spaces || 0), 0); const occupiedSpaces = occupancy.reduce((sum, row) => sum + Number(row.occupied_spaces || 0), 0); const statuses = devices.map(row => statusForSensor(row)); const gateways = communications.map(row => row.effective_status); const sourceCounts = Object.fromEntries(Object.entries({ parkingLots: selectedLots, mapRows: scopedDataset.mapRows, lotStatuses: scopedDataset.lotStatuses, sensors: scopedDataset.sensors, sensorHealth: scopedDataset.sensorHealth, gateways: scopedDataset.gateways, attachments: scopedDataset.attachments, officialDocuments: scopedDataset.officialDocuments }).map(([key, rows]) => [key, rows.length]));
  const documents = scopedDataset.attachments.map(row => { const docId = String(row.file_path || "").replace("parkmaster-document://", ""); const document = scopedDataset.officialDocuments.find(item => item.id === docId); return { ...row, lot_id: row.ref_id, document_number: document?.document_number || "-", document_type: document?.document_type, linked_at: row.created_at }; }).filter(row => row.document_number !== "-");
  const summary: RealtimeReportSummary = { parkingLots: selectedLots.length, offstreetLots: selectedLots.filter(row => LOT_TYPE_ALIASES.offstreet.includes(row.lot_type)).length, buildingLots: selectedLots.filter(row => LOT_TYPE_ALIASES.building.includes(row.lot_type)).length, onstreetLots: selectedLots.filter(row => LOT_TYPE_ALIASES.onstreet.includes(row.lot_type)).length, totalSpaces, occupiedSpaces, availableSpaces: Math.max(0, totalSpaces - occupiedSpaces), occupancyRate: totalSpaces ? Math.round(occupiedSpaces / totalSpaces * 1000) / 10 : 0, freshLots: occupancy.filter(row => !isStale(row, options)).length, staleLots: occupancy.filter(row => isStale(row, options)).length, sensors: devices.length, activeSensors: statuses.filter(status => status === "active").length, offlineSensors: statuses.filter(status => status === "offline").length, lowBatterySensors: statuses.filter(status => status === "low_battery").length, errorSensors: statuses.filter(status => status === "error").length, gateways: gateways.length, onlineGateways: gateways.filter(status => status === "online").length, offlineGateways: gateways.filter(status => status === "offline").length, discrepancyCount: discrepancies.length, alertCount: alerts.length, linkedDocuments: documents.length, lotsMissingDocuments: selectedLots.filter(row => !(dataset.documentNumbers[documentKey(row.id)] || []).length).length };
  const rowsBySection: Record<RealtimeReportSectionId, any[]> = { overview: [summary], occupancy, devices, communications, discrepancies, alerts, documents };
  const tables = options.selectedSections.map(id => { const section = REALTIME_REPORT_SECTIONS.find(item => item.id === id)!; return buildTable(section, rowsBySection[id], dataset, options); });
  const selectedFieldCount = tables.reduce((sum, table) => sum + table.columns.length, 0); const protectedFieldCount = options.selectedSections.reduce((sum, id) => sum + REALTIME_REPORT_SECTIONS.find(section => section.id === id)!.fields.filter(fieldItem => fieldItem.protected).length, 0);
  const riskNarrative = summary.alertCount || summary.discrepancyCount ? `실시간 경보 ${summary.alertCount}건과 데이터 불일치 ${summary.discrepancyCount}건이 확인되어 담당자 조치가 필요합니다.` : "실시간 수집자료에서 즉시 조치 대상이 확인되지 않았습니다.";
  return { period: { start: options.periodStart, end: options.periodEnd }, asOfDate: options.asOfDate, lotTypeLabels: options.lotTypes.map(type => REALTIME_REPORT_LOT_TYPE_OPTIONS.find(item => item.value === type)?.label || type), summary, sourceCounts, tables, selectedFieldCount, protectedFieldCount, riskNarrative, evidenceMetadata: dataset.evidenceMetadata };
}

export function realtimeReportBriefRows(model: RealtimeReportModel, documentSummary?: string): string[][] {
  return [["담당부서", PRIMARY_DEPARTMENT, "보고기간", `${model.period.start} ~ ${model.period.end}`], ["보고대상", model.lotTypeLabels.join(", "), "기준일", model.asOfDate], ["주요내용", documentSummary || "주차장 실시간 점유·장비·통신 상태와 조치대상", "산출기준", `주차장 ${model.summary.parkingLots}개소, 센서 ${model.summary.sensors}대의 원자료를 기준으로 집계`], ["자료상태", model.evidenceMetadata.complete ? "전체 건수 확인 완료" : "확인 필요", "위험요약", model.riskNarrative]];
}
export function realtimeReportSummaryRows(model: RealtimeReportModel): string[][] {
  return [["총 주차면", countLabel(model.summary.totalSpaces, "면"), "점유 주차면", countLabel(model.summary.occupiedSpaces, "면")], ["점유율", percent(model.summary.occupancyRate), "갱신지연", countLabel(model.summary.staleLots, "개소")], ["센서 정상", countLabel(model.summary.activeSensors, "대"), "센서 조치대상", countLabel(model.summary.offlineSensors + model.summary.lowBatterySensors + model.summary.errorSensors, "대")], ["게이트웨이 온라인", countLabel(model.summary.onlineGateways, "대"), "경보·불일치", `${model.summary.alertCount + model.summary.discrepancyCount}건`]];
}
export function toOperationsCompatibleRealtimeModel(model: RealtimeReportModel): OperationsReportModel {
  return { period: model.period, lotTypeLabels: model.lotTypeLabels, summary: model.summary, sourceCounts: model.sourceCounts, tables: model.tables, selectedFieldCount: model.selectedFieldCount, sensitiveFieldCount: model.protectedFieldCount };
}
export async function getRealtimeReportEvidence(parameters: Record<string, string>) { const options = parseRealtimeReportOptions(parameters); const dataset = await collectRealtimeReportData(options); return { metadata: dataset.evidenceMetadata, sourceCounts: Object.fromEntries(Object.entries(dataset).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, (value as any[]).length])) }; }

export const REALTIME_REPORT_SAMPLE_DATASET: RealtimeReportDataset = (() => {
  const parkingLots = [
    { id: "lot-off-1", code: "JJP-RT-001", name: "제주시청 노외주차장", lot_type: "offstreet", total_spaces: 100 },
    { id: "lot-building-1", code: "JJP-RT-002", name: "제주시청 주차빌딩", lot_type: "building", total_spaces: 180 },
    { id: "lot-on-1", code: "JJP-RT-003", name: "중앙로 노상주차장", lot_type: "onstreet", total_spaces: 60 },
  ];
  const now = "2026-08-04T09:00:00.000Z";
  const lotStatuses = [{ lot_id: "lot-off-1", total_spaces: 100, occupied_spaces: 72, available_spaces: 28, occupancy_rate: 72, congestion_level: "crowded", last_updated: now }, { lot_id: "lot-building-1", total_spaces: 180, occupied_spaces: 81, available_spaces: 99, occupancy_rate: 45, congestion_level: "normal", last_updated: now }, { lot_id: "lot-on-1", total_spaces: 60, occupied_spaces: 54, available_spaces: 6, occupancy_rate: 90, congestion_level: "full", last_updated: "2026-08-04T07:20:00.000Z" }];
  const mapRows = [{ lot_id: "lot-off-1", total_spaces: 100, occupied_spaces: 72, last_updated: now }, { lot_id: "lot-building-1", total_spaces: 180, occupied_spaces: 81, last_updated: now }, { lot_id: "lot-on-1", total_spaces: 60, occupied_spaces: 50, last_updated: "2026-08-04T07:20:00.000Z" }];
  const sensors = [{ id: "sensor-1", lot_id: "lot-off-1", device_id: "SEN-001", device_type: "레이더", status: "active", battery_level: 91, last_heartbeat: now, error_count: 0 }, { id: "sensor-2", lot_id: "lot-building-1", device_id: "SEN-002", device_type: "자기식", status: "low_battery", battery_level: 14, last_heartbeat: now, error_count: 1 }, { id: "sensor-3", lot_id: "lot-building-1", device_id: "SEN-003", device_type: "초음파", status: "offline", battery_level: 80, last_heartbeat: "2026-08-03T05:00:00.000Z", error_count: 4 }, { id: "sensor-4", lot_id: "lot-on-1", device_id: "SEN-004", device_type: "카메라", status: "error", battery_level: 88, last_heartbeat: now, error_count: 8 }];
  const sensorHealth = sensors.map(row => ({ id: row.id, lot_id: row.lot_id, device_id: row.device_id, health_status: row.status }));
  const gateways = [{ id: "gateway-1", lot_id: "lot-off-1", device_id: "GW-001", status: "active", protocol: "MQTT", connected_sensors: 1, last_heartbeat: now }, { id: "gateway-2", lot_id: "lot-building-1", device_id: "GW-002", status: "active", protocol: "LTE", connected_sensors: 2, last_heartbeat: now }, { id: "gateway-3", lot_id: "lot-on-1", device_id: "GW-003", status: "active", protocol: "LTE", connected_sensors: 1, last_heartbeat: "2026-08-04T08:00:00.000Z" }];
  const attachments = [{ module: "REALTIME", ref_id: "lot-off-1", ref_type: "official_document_link", file_path: "parkmaster-document://doc-1", created_at: "2026-08-01T00:00:00.000Z" }, { module: "REALTIME", ref_id: "gateway-2", ref_type: "official_document_link", file_path: "parkmaster-document://doc-2", created_at: "2026-08-02T00:00:00.000Z" }];
  const officialDocuments = [{ id: "doc-1", document_number: "제주시청-차량관리과-운영팀-2026-0301", document_type: "공문", created_at: "2026-08-01" }, { id: "doc-2", document_number: "제주시청-차량관리과-운영팀-2026-0302", document_type: "점검결과", created_at: "2026-08-02" }];
  return { parkingLots, mapRows, lotStatuses, sensors, sensorHealth, gateways, attachments, officialDocuments, documentNumbers: { "REALTIME:lot-off-1": [officialDocuments[0].document_number], "REALTIME:gateway-2": [officialDocuments[1].document_number] }, evidenceMetadata: { complete: true, collectedAt: now, queryLimit: QUERY_LIMIT, truncationPolicy: "fail", sourceTables: SOURCE_TABLES, filters: { periodStart: "2026-08-01", periodEnd: "2026-08-04", asOfDate: "2026-08-04", lotTypes: ["offstreet", "building", "onstreet"], statuses: [], includeOffline: true }, sources: { parkingLots: { expected: 3, loaded: 3, complete: true }, realtimeMap: { expected: 3, loaded: 3, complete: true }, lotStatuses: { expected: 3, loaded: 3, complete: true }, sensors: { expected: 4, loaded: 4, complete: true }, sensorHealth: { expected: 4, loaded: 4, complete: true }, gateways: { expected: 3, loaded: 3, complete: true }, attachments: { expected: 2, loaded: 2, complete: true }, officialDocuments: { expected: 2, loaded: 2, complete: true } } } };
})();
