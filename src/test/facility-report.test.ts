import { describe, expect, it } from "vitest";
import {
  buildFacilityReportModel,
  defaultFacilityReportFields,
  facilityReportBriefRows,
  facilityReportSummaryRows,
  parseFacilityReportOptions,
  type FacilityReportDataset,
} from "@/lib/facility-report";

const dataset: FacilityReportDataset = {
  parkingLots: [
    { id: "lot-1", code: "JJP-001", name: "노외 1", lot_type: "offstreet" },
    { id: "lot-2", code: "JJP-002", name: "빌딩 1", lot_type: "multilevel" },
    { id: "lot-3", code: "JJP-003", name: "노상 1", lot_type: "onstreet" },
  ],
  equipment: [
    { id: "eq-1", equipment_code: "EQ-001", name: "정산기", equipment_type: "kiosk", status: "broken", maintenance_count: 2, total_maintenance_cost: 300000, photo_path: "local-photo://eq-1", parking_lots: { name: "노외 1", lot_type: "offstreet" } },
  ],
  maintenance: [
    { id: "m-1", log_number: "MW-001", title: "정산기 수리", priority: "critical", status: "in_progress", reported_at: "2026-08-01", due_date: "2026-08-03", total_cost: 120000, downtime_hours: 3, before_photo: "local-photo://before", parking_lots: { name: "노외 1", lot_type: "offstreet" }, equipment: { name: "정산기" } },
  ],
  schedules: [
    { id: "s-1", schedule_name: "월간 점검", schedule_type: "monthly", next_due_date: "2026-08-02", __period_end: "2026-08-04", is_active: true, parking_lots: { name: "빌딩 1", lot_type: "multilevel" }, equipment: { name: "소방설비" } },
  ],
  safety: [
    { id: "safe-1", inspection_number: "SI-001", inspection_type: "monthly", inspection_date: "2026-08-02", fail_items: 2, correction_deadline: "2026-08-03", correction_completed: null, follow_up_required: true, photo_paths: ["local-photo://safe-1"], parking_lots: { name: "빌딩 1", lot_type: "multilevel" } },
  ],
  markings: [
    { id: "mark-1", marking_type: "parking_line", marking_name: "주차선", condition: "faded", next_due: "2026-08-04", quantity: 10, photo_path: "local-photo://mark-1", parking_lots: { name: "노상 1", lot_type: "onstreet" } },
  ],
  documentNumbers: {
    "FACILITY_EQUIPMENT:eq-1": ["제주시청-차량관리과운영팀-2026-0101", "제주시청-차량관리과운영팀-2026-0102"],
  },
};

const options = parseFacilityReportOptions({
  period_start: "2026-08-01",
  period_end: "2026-08-04",
  facility_sections: "overview,equipment,maintenance,schedules,safety,markings",
  facility_fields: JSON.stringify(defaultFacilityReportFields()),
  facility_lot_types: "offstreet,building,onstreet",
  facility_sort: "attention",
  facility_orientation: "portrait",
});

describe("facility report", () => {
  it("parses the six-area integrated report without protected fields by default", () => {
    expect(options.selectedSections).toHaveLength(6);
    expect(options.orientation).toBe("portrait");
    expect(options.selectedFields.equipment).not.toContain("ip_address");
    expect(options.selectedFields.maintenance).not.toContain("vendor_contact");
  });

  it("builds actionable facility metrics and keeps linked document numbers in one row", () => {
    const model = buildFacilityReportModel(dataset, options);
    expect(model.summary.parkingLots).toBe(3);
    expect(model.summary.equipmentAttention).toBe(1);
    expect(model.summary.overdueMaintenance).toBe(1);
    expect(model.summary.overdueSchedules).toBe(1);
    expect(model.summary.overdueCorrections).toBe(1);
    expect(model.summary.markingAttention).toBe(1);
    expect(model.summary.photoEvidence).toBe(4);
    expect(model.summary.linkedDocuments).toBe(2);
    const equipmentTables = model.tables.filter(table => table.id === "equipment");
    expect(equipmentTables).toHaveLength(2);
    expect(equipmentTables.map(table => table.title)).toEqual(["장비 관리", "장비 관리"]);
    expect(equipmentTables.map(table => table.subtitle)).toEqual(["장비 기본정보·상태", "정비비용·증빙·문서 연계"]);
    expect(equipmentTables.map(table => table.subtitleNumber)).toEqual([1, 2]);
    expect(equipmentTables.map(table => Boolean(table.continuation))).toEqual([false, true]);
    const documentTable = equipmentTables.find(table => table.columns.some(column => column.key === "document_numbers"));
    expect(documentTable?.rows).toHaveLength(1);
    expect(documentTable?.rows[0].document_numbers).toContain("2026-0101");
    expect(documentTable?.rows[0].document_numbers).toContain("2026-0102");
  });

  it("uses public-sector report labels and a deterministic risk statement", () => {
    const model = buildFacilityReportModel(dataset, options);
    expect(facilityReportBriefRows(model)[0][0]).toBe("담당부서");
    expect(facilityReportBriefRows(model)[3][0]).toBe("주요내용");
    expect(facilityReportBriefRows(model)[5][1]).toContain("기한 경과 유지보수 1건");
    expect(facilityReportSummaryRows(model).flat()).toContain("미완료 안전 시정");
  });
});
