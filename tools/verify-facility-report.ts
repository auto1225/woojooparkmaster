import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FacilityReportDataset } from "../src/lib/facility-report";

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

const {
  buildFacilityReportModel,
  defaultFacilityReportFields,
  facilityReportBriefRows,
  facilityReportSummaryRows,
  parseFacilityReportOptions,
  toOperationsCompatibleFacilityModel,
} = await import("../src/lib/facility-report");
const { createOperationsHwpx, validateOperationsHwpx } = await import("../src/lib/operations-report");

const lotTypes = ["offstreet", "multilevel", "onstreet"];
const lots = Array.from({ length: 18 }, (_, index) => ({
  id: `lot-${index + 1}`,
  code: `JJP-${String(index + 1).padStart(3, "0")}`,
  name: `시설보고 검증 공영주차장 ${String(index + 1).padStart(2, "0")}`,
  lot_type: lotTypes[index % lotTypes.length],
  total_spaces: 35 + index * 3,
  status: "active",
}));
const lotRef = (index: number) => ({ name: lots[index % lots.length].name, lot_type: lots[index % lots.length].lot_type });

const dataset: FacilityReportDataset = {
  parkingLots: lots,
  equipment: Array.from({ length: 48 }, (_, index) => ({
    id: `eq-${index + 1}`, equipment_code: `EQ-${String(index + 1).padStart(3, "0")}`,
    name: `${["무인정산기", "차단기", "CCTV", "소화기", "조명"][index % 5]} ${index + 1}`,
    equipment_type: ["kiosk", "barrier", "cctv", "fire_extinguisher", "lighting"][index % 5],
    location_detail: index % 3 === 1 ? `${(index % 4) + 1}층 출구 측 설비구역` : "주출입구 인근",
    install_date: "2024-01-15", warranty_end: index % 7 === 0 ? "2026-08-20" : "2028-12-31",
    status: index % 11 === 0 ? "broken" : index % 7 === 0 ? "warning" : "normal",
    maintenance_count: index % 6, total_maintenance_cost: index * 45000,
    photo_path: index % 4 === 0 ? `local-photo://equipment/${index + 1}` : null,
    parking_lots: lotRef(index),
  })),
  maintenance: Array.from({ length: 26 }, (_, index) => ({
    id: `maint-${index + 1}`, log_number: `MW-202608-${String(index + 1).padStart(3, "0")}`,
    title: `${["차단기 작동불량 수리", "정산기 영수증 장치 점검", "CCTV 영상 끊김 조치"][index % 3]} ${index + 1}`,
    maintenance_type: index % 4 === 0 ? "emergency" : "repair", priority: index % 8 === 0 ? "critical" : index % 5 === 0 ? "high" : "medium",
    status: index % 5 === 0 ? "in_progress" : "verified", reported_at: `2026-08-${String((index % 20) + 1).padStart(2, "0")}`,
    due_date: `2026-08-${String((index % 20) + 3).padStart(2, "0")}`, cause: "현장 점검 결과 부품 마모 확인",
    resolution: "부품 교체 후 반복 동작 시험을 실시하고 정상 작동을 확인함.", completed_at: index % 5 ? "2026-08-22" : null,
    downtime_hours: index % 5, total_cost: 120000 + index * 18000, next_action: index % 5 === 0 ? "담당자 완료 검증" : "정기점검 시 재확인",
    before_photo: `local-photo://maintenance/before/${index + 1}`, after_photo: index % 5 ? `local-photo://maintenance/after/${index + 1}` : null,
    parking_lots: lotRef(index), equipment: { name: `대상 장비 ${index + 1}`, equipment_type: "other" },
  })),
  schedules: Array.from({ length: 18 }, (_, index) => ({
    id: `schedule-${index + 1}`, schedule_name: `${["월간 전기설비 점검", "분기 소방설비 점검", "주간 정산기 점검"][index % 3]} ${index + 1}`,
    schedule_type: ["monthly", "quarterly", "weekly"][index % 3], assigned_team: "차량관리과 운영팀",
    last_completed: "2026-07-15", next_due_date: `2026-08-${String((index % 24) + 1).padStart(2, "0")}`, __period_end: "2026-08-31",
    estimated_cost: index * 30000, estimated_hours: 2, is_active: true, parking_lots: lotRef(index), equipment: { name: `점검 장비 ${index + 1}` },
  })),
  safety: Array.from({ length: 12 }, (_, index) => ({
    id: `safety-${index + 1}`, inspection_number: `SI-202608-${String(index + 1).padStart(3, "0")}`,
    inspection_type: index % 2 ? "monthly" : "special", inspection_date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    overall_grade: index % 5 === 0 ? "C" : "A", fail_items: index % 5 === 0 ? 2 : 0,
    issues_found: index % 5 === 0 ? "피난 유도표지 일부 훼손 및 소화기 점검표 미부착" : "특이사항 없음",
    corrective_actions: index % 5 === 0 ? "유도표지 교체와 점검표 부착 후 사진 증빙 등록" : "해당 없음",
    correction_deadline: "2026-08-20", correction_completed: index % 5 === 0 ? null : "2026-08-12",
    follow_up_required: index % 5 === 0, status: "completed", photo_paths: [`local-photo://safety/${index + 1}`], parking_lots: lotRef(index),
  })),
  markings: Array.from({ length: 24 }, (_, index) => ({
    id: `marking-${index + 1}`, marking_type: ["parking_line", "arrow", "disabled_sign"][index % 3], marking_name: `노면표시 ${index + 1}`,
    location_detail: "주차구획 및 차량 동선", floor: lots[index % lots.length].lot_type === "multilevel" ? (index % 4) + 1 : null,
    quantity: 5 + index, material: "상온형 도료", condition: index % 6 === 0 ? "faded" : "good",
    last_repainted: "2025-09-01", next_due: index % 6 === 0 ? "2026-08-15" : "2027-09-01", estimated_cost: 80000 + index * 5000,
    regulation_ref: index % 3 === 2 ? "장애인등편의법 관련 기준" : "주차장법 및 내부 유지관리 기준",
    photo_path: `local-photo://markings/${index + 1}`, parking_lots: lotRef(index),
  })),
  documentNumbers: {
    "FACILITY_EQUIPMENT:eq-1": ["제주시청-차량관리과운영팀-2026-0211"],
    "FACILITY_MAINTENANCE:maint-1": ["제주시청-차량관리과운영팀-2026-0212"],
    "FACILITY_SAFETY:safety-1": ["제주시청-차량관리과운영팀-2026-0213"],
  },
};

const options = parseFacilityReportOptions({
  period_start: "2026-08-01", period_end: "2026-08-31", report_scope: "facility",
  facility_sections: "overview,equipment,maintenance,schedules,safety,markings",
  facility_fields: JSON.stringify(defaultFacilityReportFields()), facility_lot_types: "offstreet,building,onstreet",
  facility_sort: "attention", facility_orientation: "portrait",
});
const model = buildFacilityReportModel(dataset, options);
const compatibleModel = toOperationsCompatibleFacilityModel(model);
const hwpx = await createOperationsHwpx({
  model: compatibleModel,
  title: "2026년 8월 제주시 공영주차장 시설관리 종합 현황 보고서",
  reportNumber: "RPT-FAC-202608-001",
  orientation: "portrait",
  officialDocumentNumber: "제주시청-차량관리과운영팀-2026-0210",
  authorName: "시설관리 담당 주무관",
  organizationName: "제주시청",
  disclosureStatus: "공개",
  documentSummary: "시설·장비의 상태와 점검·정비 이력을 확인하고 안전 및 운영 중단 위험에 선제적으로 대응하기 위함.",
  keywords: "제주시, 공영주차장, 시설관리, 안전점검",
  documentOverrides: {
    briefRows: facilityReportBriefRows(model),
    summaryRows: facilityReportSummaryRows(model),
    footerLabel: "시설관리",
    flowDetailTablesAcrossPages: true,
  },
});
const validation = await validateOperationsHwpx(hwpx, "시설관리");
const outputDirectory = resolve("work", "verification");
await mkdir(outputDirectory, { recursive: true });
const outputSuffix = process.env.FACILITY_REPORT_VERIFY_SUFFIX?.trim() || "";
const hwpxPath = resolve(outputDirectory, `facility-report-integrated${outputSuffix}.hwpx`);
await writeFile(hwpxPath, Buffer.from(await hwpx.arrayBuffer()));

const response = await fetch("http://127.0.0.1:43127/convert", { method: "POST", headers: { "Content-Type": "application/hwp+zip" }, body: hwpx });
if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "한컴 PDF 변환 실패");
const pdf = await response.arrayBuffer();
if (new TextDecoder("latin1").decode(pdf.slice(0, 5)) !== "%PDF-") throw new Error("한컴 변환 결과가 PDF가 아닙니다.");
const pdfPath = resolve(outputDirectory, `facility-report-integrated${outputSuffix}-hancom.pdf`);
await writeFile(pdfPath, Buffer.from(pdf));

process.stdout.write(JSON.stringify({ hwpxPath, hwpxBytes: hwpx.size, pdfPath, pdfBytes: pdf.byteLength, pages: Number(response.headers.get("X-PDF-Page-Count")) || 1, validation, summary: model.summary }));
