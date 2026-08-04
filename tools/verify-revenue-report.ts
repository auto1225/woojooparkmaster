import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RevenueReportDataset } from "../src/lib/revenue-report";

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

const {
  buildRevenueReportModel,
  defaultRevenueReportFields,
  parseRevenueReportOptions,
  revenueReportBriefRows,
  revenueReportSummaryRows,
  toOperationsCompatibleRevenueModel,
} = await import("../src/lib/revenue-report");
const { createOperationsHwpx, validateOperationsHwpx } = await import("../src/lib/operations-report");

const parkingLots = [
  { id: "lot-offstreet", code: "JJP-001", name: "동문 공영주차장", lot_type: "offstreet", status: "active" },
  { id: "lot-building", code: "JJP-002", name: "칠성골 주차빌딩", lot_type: "multilevel", status: "active" },
  { id: "lot-onstreet", code: "JJP-003", name: "중앙로 노상주차장", lot_type: "onstreet", status: "active" },
];

const lotRef = (index: number) => parkingLots[index];
const daily = (
  id: string,
  lotIndex: number,
  revenueDate: string,
  amounts: [number, number, number, number, number],
  verified: boolean,
  totalAmount?: number,
) => ({
  id,
  lot_id: parkingLots[lotIndex].id,
  revenue_date: revenueDate,
  lot_type_at_event: parkingLots[lotIndex].lot_type,
  parking_lots: lotRef(lotIndex),
  cash_amount: amounts[0],
  card_amount: amounts[1],
  mobile_amount: amounts[2],
  monthly_pass_amount: amounts[3],
  other_amount: amounts[4],
  total_amount: totalAmount ?? amounts.reduce((sum, amount) => sum + amount, 0),
  total_vehicles: 80 + lotIndex * 30,
  exemption_count: lotIndex + 1,
  exemption_amount: (lotIndex + 1) * 500,
  data_source: lotIndex === 0 ? "kiosk" : lotIndex === 1 ? "system" : "manual",
  verified,
  verified_at: verified ? "2026-08-01T09:00:00" : null,
  verified_by_name: verified ? "수입담당 주무관" : null,
  author_name: verified ? null : "주차장 현장담당자",
  discrepancy_note: verified ? null : "정산기 마감자료와 카드 승인내역 대조 필요",
});

const dataset: RevenueReportDataset = {
  parkingLots,
  dailyRevenue: [
    daily("daily-001", 0, "2026-07-01", [100_000, 800_000, 100_000, 50_000, 0], true),
    daily("daily-002", 0, "2026-07-02", [120_000, 900_000, 120_000, 60_000, 0], true),
    daily("daily-003", 1, "2026-07-01", [200_000, 1_500_000, 200_000, 100_000, 0], true),
    daily("daily-004", 1, "2026-07-02", [150_000, 1_000_000, 200_000, 100_000, 50_000], false),
    daily("daily-005", 2, "2026-07-01", [80_000, 500_000, 80_000, 40_000, 0], true),
    daily("daily-006", 2, "2026-07-02", [50_000, 350_000, 50_000, 30_000, 20_000], false),
    daily("daily-007", 2, "2026-07-03", [90_000, 560_000, 90_000, 50_000, 10_000], true, 850_000),
  ],
  periodCloses: [
    {
      id: "close-001", lot_id: "lot-offstreet", period_month: "2026-07-01", parking_lots: lotRef(0),
      lot_type_at_event: "offstreet", record_count: 2, total_amount: 2_250_000, is_closed: true,
      closed_at: "2026-08-01T10:00:00", closed_by_name: "수입담당 주무관",
    },
    {
      id: "close-002", lot_id: "lot-building", period_month: "2026-07-01", parking_lots: lotRef(1),
      lot_type_at_event: "multilevel", record_count: 2, total_amount: 3_500_000, is_closed: false,
    },
    {
      id: "close-003", lot_id: "lot-onstreet", period_month: "2026-07-01", parking_lots: lotRef(2),
      lot_type_at_event: "onstreet", record_count: 3, total_amount: 2_050_000, is_closed: true,
      closed_at: "2026-08-01T11:00:00", reopened_at: "2026-08-02T09:00:00",
      reopen_reason: "카드 승인 취소 1건 반영", closed_by_name: "수입담당 주무관",
    },
  ],
  reconciliations: [
    {
      id: "recon-001", recon_number: "REV-REC-202607-001", lot_id: "lot-offstreet", parking_lots: lotRef(0),
      lot_type_at_event: "offstreet", company_name: "제주주차서비스", period_start: "2026-07-01", period_end: "2026-07-31",
      reported_cash: 220_000, reported_card: 1_705_000, reported_mobile: 220_000, reported_monthly_pass: 110_000, reported_other: 0,
      system_cash: 220_000, system_card: 1_700_000, system_mobile: 220_000, system_monthly_pass: 110_000, system_other: 0,
      reported_vehicles: 221, system_vehicles: 220, diff_rate: 0.22, status: "discrepancy",
      diff_analysis: "카드 취소 반영 시점 차이", resolution_type: "차월 조정", resolution_note: "승인취소 전표 확인 후 차월 정산 반영",
    },
    {
      id: "recon-002", recon_number: "REV-REC-202607-002", lot_id: "lot-building", parking_lots: lotRef(1),
      lot_type_at_event: "multilevel", company_name: "탐라시설관리", period_start: "2026-07-01", period_end: "2026-07-31",
      reported_cash: 350_000, reported_card: 2_500_000, reported_mobile: 400_000, reported_monthly_pass: 200_000, reported_other: 50_000,
      system_cash: 350_000, system_card: 2_500_000, system_mobile: 400_000, system_monthly_pass: 200_000, system_other: 50_000,
      reported_vehicles: 280, system_vehicles: 280, diff_rate: 0, status: "matched",
      diff_analysis: "금액과 차량 대수 일치", resolution_type: "일치 확인", resolution_note: "추가 조치 없음", resolved_at: "2026-08-03",
      resolved_by_name: "수입담당 주무관",
    },
  ],
  missingDays: [
    { lot_id: "lot-building", revenue_date: "2026-07-03", lot_type_at_event: "multilevel", parking_lots: lotRef(1) },
    { lot_id: "lot-onstreet", revenue_date: "2026-07-04", lot_type_at_event: "onstreet", parking_lots: lotRef(2) },
  ],
  documentNumbers: {
    "REVENUE_DAILY:daily-001": ["제주시청-차량관리과운영팀-2026-0301"],
    "REVENUE_CLOSE:close-001": ["제주시청-차량관리과운영팀-2026-0302"],
    "REVENUE_CLOSE:close-003": ["제주시청-차량관리과운영팀-2026-0303"],
    "REVENUE_RECONCILIATION:recon-001": ["제주시청-차량관리과운영팀-2026-0304"],
  },
};

const options = parseRevenueReportOptions({
  period_start: "2026-07-01",
  period_end: "2026-07-31",
  report_scope: "revenue",
  revenue_sections: "overview,certified,unverified,closes,reconciliation,payment_methods",
  revenue_fields: JSON.stringify(defaultRevenueReportFields()),
  revenue_lot_types: "offstreet,building,onstreet",
  revenue_sort: "attention",
  revenue_orientation: "portrait",
});
const model = buildRevenueReportModel(dataset, options);

const expectedSummary = {
  parkingLots: 3,
  dailyRows: 7,
  certifiedRows: 4,
  verifiedPendingClose: 1,
  unverifiedRows: 2,
  missingDays: 2,
  closedLots: 2,
  reconciliationRows: 2,
  openReconciliations: 1,
  integrityMismatchRows: 1,
  linkedDocuments: 4,
};
for (const [key, expected] of Object.entries(expectedSummary)) {
  const actual = model.summary[key];
  if (actual !== expected) throw new Error(`수입보고서 검증값 불일치: ${key}=${actual}, expected=${expected}`);
}

const hwpx = await createOperationsHwpx({
  model: toOperationsCompatibleRevenueModel(model),
  title: "2026년 7월 제주시 공영주차장 수입·정산 종합 현황 보고서",
  reportNumber: "RPT-REV-202607-001",
  orientation: options.orientation,
  officialDocumentNumber: "제주시청-차량관리과운영팀-2026-0300",
  authorName: "수입·정산 담당 주무관",
  organizationName: "제주시청",
  disclosureStatus: "공개",
  documentSummary: "공영주차장 일별 수입원장의 검증과 월 마감 상태를 확인하고 위탁업체 보고자료와 시스템 집계자료의 차이를 점검함.",
  keywords: "제주시, 공영주차장, 수입관리, 월마감, 위탁대사",
  documentOverrides: {
    briefRows: revenueReportBriefRows(model),
    summaryRows: revenueReportSummaryRows(model),
    footerLabel: "수입관리",
    flowDetailTablesAcrossPages: true,
  },
});
const validation = await validateOperationsHwpx(hwpx, "수입관리");
const outputDirectory = resolve("work", "verification");
await mkdir(outputDirectory, { recursive: true });
const hwpxPath = resolve(outputDirectory, "revenue-report-integrated.hwpx");
await writeFile(hwpxPath, Buffer.from(await hwpx.arrayBuffer()));

let pdfResult: { pdfPath: string; pdfBytes: number; pages: number } | null = null;
try {
  const response = await fetch("http://127.0.0.1:43127/convert", {
    method: "POST",
    headers: { "Content-Type": "application/hwp+zip" },
    body: hwpx,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "한컴 PDF 변환 실패");
  const pdf = await response.arrayBuffer();
  if (new TextDecoder("latin1").decode(pdf.slice(0, 5)) !== "%PDF-") throw new Error("한컴 변환 결과가 PDF가 아닙니다.");
  const pdfPath = resolve(outputDirectory, "revenue-report-integrated-hancom.pdf");
  await writeFile(pdfPath, Buffer.from(pdf));
  pdfResult = { pdfPath, pdfBytes: pdf.byteLength, pages: Number(response.headers.get("X-PDF-Page-Count")) || 1 };
} catch (error) {
  if (!(error instanceof TypeError) && !(error instanceof DOMException && error.name === "TimeoutError")) throw error;
}

process.stdout.write(JSON.stringify({
  hwpxPath,
  hwpxBytes: hwpx.size,
  validation,
  summary: model.summary,
  sourceCounts: model.sourceCounts,
  tables: model.tables.map(table => ({ id: table.id, title: table.title, subtitle: table.subtitle, columns: table.columns.length, rows: table.rows.length })),
  hancom: pdfResult,
}));
