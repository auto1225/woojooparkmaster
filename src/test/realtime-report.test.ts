import { describe, expect, it } from "vitest";
import {
  REALTIME_REPORT_LOT_TYPE_OPTIONS,
  REALTIME_REPORT_PRESETS,
  REALTIME_REPORT_SAMPLE_DATASET,
  REALTIME_REPORT_SECTIONS,
  assertCompleteRealtimeResult,
  buildRealtimeReportModel,
  defaultRealtimeReportFields,
  parseRealtimeReportOptions,
  realtimeReportBriefRows,
  realtimeReportSummaryRows,
  toOperationsCompatibleRealtimeModel,
  type RealtimeReportDataset,
} from "@/lib/realtime-report";

const allSections = REALTIME_REPORT_SECTIONS.map(section => section.id).join(",");
const allOptions = (overrides: Record<string, string> = {}) => parseRealtimeReportOptions({
  period_start: "2026-08-01",
  period_end: "2026-08-04",
  realtime_as_of_date: "2026-08-04",
  realtime_sections: allSections,
  realtime_fields: JSON.stringify(defaultRealtimeReportFields()),
  realtime_lot_types: "offstreet,building,onstreet",
  realtime_sort: "attention",
  realtime_orientation: "landscape",
  ...overrides,
});

describe("realtime report", () => {
  it("defines the seven public-sector sections and all three parking-lot types", () => {
    expect(REALTIME_REPORT_SECTIONS.map(section => section.id)).toEqual([
      "overview", "occupancy", "devices", "communications", "discrepancies", "alerts", "documents",
    ]);
    expect(REALTIME_REPORT_LOT_TYPE_OPTIONS.map(item => item.value)).toEqual(["offstreet", "building", "onstreet"]);
    expect(REALTIME_REPORT_PRESETS.standard.sections).toHaveLength(7);
    expect(REALTIME_REPORT_PRESETS.audit.sections).toContain("documents");
    expect(defaultRealtimeReportFields().devices).toContain("device_id");
  });

  it("summarizes occupancy by offstreet, building and onstreet lots", () => {
    const model = buildRealtimeReportModel(REALTIME_REPORT_SAMPLE_DATASET, allOptions());
    expect(model.summary).toMatchObject({
      parkingLots: 3,
      offstreetLots: 1,
      buildingLots: 1,
      onstreetLots: 1,
      totalSpaces: 340,
      occupiedSpaces: 207,
      availableSpaces: 133,
      occupancyRate: 60.9,
      freshLots: 2,
      staleLots: 1,
    });
    expect(model.lotTypeLabels).toEqual(["노외주차장", "주차빌딩", "노상주차장"]);
    expect(model.tables.find(table => table.id === "occupancy")?.rows).toHaveLength(3);
  });

  it("counts device and communication health without mixing sensor and gateway sources", () => {
    const model = buildRealtimeReportModel(REALTIME_REPORT_SAMPLE_DATASET, allOptions());
    expect(model.summary).toMatchObject({ sensors: 4, activeSensors: 1, offlineSensors: 1, lowBatterySensors: 1, errorSensors: 1, gateways: 3, onlineGateways: 2, offlineGateways: 1 });
    const deviceText = model.tables.find(table => table.id === "devices")!.rows.flatMap(row => Object.values(row)).join(" ");
    const communicationText = model.tables.find(table => table.id === "communications")!.rows.flatMap(row => Object.values(row)).join(" ");
    expect(deviceText).toContain("SEN-003");
    expect(communicationText).toContain("GW-003");
    expect(communicationText).not.toContain("SEN-003");
  });

  it("detects map and status discrepancies plus actionable stale/offline alerts", () => {
    const model = buildRealtimeReportModel(REALTIME_REPORT_SAMPLE_DATASET, allOptions());
    expect(model.summary.discrepancyCount).toBe(1);
    expect(model.summary.alertCount).toBeGreaterThanOrEqual(4);
    const discrepancyText = model.tables.find(table => table.id === "discrepancies")!.rows.flatMap(row => Object.values(row)).join(" ");
    const alertText = model.tables.find(table => table.id === "alerts")!.rows.flatMap(row => Object.values(row)).join(" ");
    expect(discrepancyText).toContain("중앙로 노상주차장");
    expect(alertText).toContain("SEN-002");
    expect(alertText).toContain("SEN-003");
  });

  it("keeps official document numbers linked to lots and gateways", () => {
    const model = buildRealtimeReportModel(REALTIME_REPORT_SAMPLE_DATASET, allOptions());
    expect(model.summary.linkedDocuments).toBe(2);
    expect(model.summary.lotsMissingDocuments).toBe(2);
    const documentText = model.tables.find(table => table.id === "documents")!.rows.flatMap(row => Object.values(row)).join(" ");
    expect(documentText).toContain("제주시청-차량관리과-운영팀-2026-0301");
    expect(documentText).toContain("제주시청-차량관리과-운영팀-2026-0302");
    expect(model.tables.find(table => table.id === "devices")!.rows.flatMap(row => Object.values(row))).not.toContain("제주시청-차량관리과-운영팀-2026-0302");
  });

  it("applies lot type, status-independent selection, field selection, sorting and protected fields", () => {
    const fields = defaultRealtimeReportFields();
    fields.devices = ["device_id", "status", "ip_address"];
    const model = buildRealtimeReportModel(REALTIME_REPORT_SAMPLE_DATASET, allOptions({ realtime_lot_types: "building", realtime_fields: JSON.stringify(fields), realtime_sort: "status" }));
    expect(model.summary.parkingLots).toBe(1);
    expect(model.summary.sensors).toBe(2);
    expect(model.tables.find(table => table.id === "devices")!.columns.map(column => column.key)).toEqual(["device_id", "status", "ip_address"]);
    expect(model.protectedFieldCount).toBe(2);
    expect(model.tables.find(table => table.id === "devices")!.rows[0].device_id).toBe("SEN-002");
  });

  it("provides public-sector brief, summary, compatible model and exact evidence", () => {
    const model = buildRealtimeReportModel(REALTIME_REPORT_SAMPLE_DATASET, allOptions());
    expect(realtimeReportBriefRows(model).map(row => row[0])).toEqual(["담당부서", "보고대상", "주요내용", "자료상태"]);
    expect(realtimeReportSummaryRows(model).flat()).toContain("340면");
    expect(toOperationsCompatibleRealtimeModel(model).tables).toBe(model.tables);
    expect(model.evidenceMetadata).toMatchObject({ complete: true, queryLimit: 5000, truncationPolicy: "fail" });
    expect(model.evidenceMetadata.sourceTables).toEqual(expect.arrayContaining(["parking_lots", "realtime_map_view", "lot_realtime_status", "sensor_devices", "sensor_health_view", "gateway_devices", "official_documents"]));
    expect(Object.values(model.evidenceMetadata.sources).every(source => source.complete && source.loaded === source.expected)).toBe(true);
  });

  it("fails explicitly for count mismatch, truncation and incomplete evidence", () => {
    expect(() => assertCompleteRealtimeResult("실시간 현황", { data: [{ id: 1 }], count: 2, error: null })).toThrow("2건 중 1건");
    expect(() => assertCompleteRealtimeResult("센서", { data: [], count: 5001, error: null })).toThrow("5000건");
    expect(() => assertCompleteRealtimeResult("게이트웨이", { data: null, count: null, error: { message: "권한 없음" } })).toThrow("권한 없음");
    const incomplete: RealtimeReportDataset = structuredClone(REALTIME_REPORT_SAMPLE_DATASET);
    incomplete.evidenceMetadata = { ...incomplete.evidenceMetadata!, complete: false };
    expect(() => buildRealtimeReportModel(incomplete, allOptions())).toThrow("완전하지 않아");
  });

  it("falls back safely for invalid option values", () => {
    const options = parseRealtimeReportOptions({ period_start: "2026-01-01", period_end: "2026-12-31", realtime_sections: "unknown", realtime_fields: "{invalid", realtime_sort: "unknown", realtime_orientation: "unknown" });
    expect(options.selectedSections).toEqual(["overview"]);
    expect(options.selectedFields.devices).toEqual(defaultRealtimeReportFields().devices);
    expect(options.sort).toBe("attention");
    expect(options.orientation).toBe("portrait");
    expect(options.lotTypes).toEqual(["offstreet", "building", "onstreet"]);
  });
});
