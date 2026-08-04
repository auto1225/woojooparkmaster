import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { BudgetReportDataset } from "../src/lib/budget-report";

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

const {
  buildBudgetReportModel,
  budgetReportBriefRows,
  budgetReportSummaryRows,
  defaultBudgetReportFields,
  parseBudgetReportOptions,
  toOperationsCompatibleBudgetModel,
} = await import("../src/lib/budget-report");
const { createOperationsHwpx, validateOperationsHwpx } = await import("../src/lib/operations-report");

const parkingLots = [
  { id: "lot-offstreet", code: "JJP-001", name: "동문 공영주차장", lot_type: "offstreet", status: "active" },
  { id: "lot-building", code: "JJP-002", name: "칠성골 주차빌딩", lot_type: "multilevel", status: "active" },
  { id: "lot-onstreet", code: "JJP-003", name: "중앙로 노상주차장", lot_type: "onstreet", status: "active" },
];

const dataset: BudgetReportDataset = {
  parkingLots,
  plans: [
    {
      id: "plan-main", fiscal_year: 2026, plan_type: "original", plan_number: 1,
      title: "2026년 제주시 공영주차장 본예산", total_revenue: 600_000_000,
      total_expenditure: 500_000_000, balance: 100_000_000, status: "approved",
      submitted_at: "2025-11-20", approved_at: "2026-01-05",
      document_number: "제주시청-차량관리과운영팀-2026-1001", author_name: "예산담당 주무관",
      approved_by_name: "차량관리과장",
    },
    {
      id: "plan-supplementary", fiscal_year: 2026, plan_type: "supplementary", plan_number: 1,
      title: "2026년 제1회 공영주차장 추가경정예산", total_revenue: 0,
      total_expenditure: 100_000_000, balance: -100_000_000, status: "submitted",
      submitted_at: "2026-07-28", author_name: "예산담당 주무관",
    },
  ],
  items: [
    {
      id: "item-revenue", plan_id: "plan-main", lot_id: "lot-offstreet", item_code: "R-001",
      budget_type: "revenue", category_l1: "세외수입", category_l2: "사용료수입",
      item_name: "공영주차장 사용료 수입", previous_year_amount: 550_000_000,
      requested_amount: 620_000_000, planned_amount: 600_000_000, allocated_amount: 600_000_000,
      executed_amount: 480_000_000, returned_amount: 0, remaining_amount: 120_000_000,
      execution_rate: 80, is_mandatory: false, is_recurring: true,
      document_number: "제주시청-차량관리과운영팀-2026-1101", responsible_person_name: "수입담당 주무관",
      parking_lots: parkingLots[0], lot_type_at_event: "offstreet",
    },
    {
      id: "item-offstreet", plan_id: "plan-main", lot_id: "lot-offstreet", item_code: "E-101",
      budget_type: "expenditure", category_l1: "시설비", category_l2: "관제설비",
      item_name: "노외주차장 관제장비 개선", previous_year_amount: 150_000_000,
      requested_amount: 190_000_000, planned_amount: 180_000_000, allocated_amount: 170_000_000,
      executed_amount: 120_000_000, returned_amount: 10_000_000, remaining_amount: 40_000_000,
      execution_rate: 70.588, is_mandatory: false, is_recurring: false,
      responsible_person_name: "시설담당 주무관", parking_lots: parkingLots[0], lot_type_at_event: "offstreet",
    },
    {
      id: "item-building", plan_id: "plan-main", lot_id: "lot-building", item_code: "E-201",
      budget_type: "expenditure", category_l1: "공공운영비", category_l2: "시설유지비",
      item_name: "주차빌딩 전기·소방 유지관리", previous_year_amount: 200_000_000,
      requested_amount: 230_000_000, planned_amount: 220_000_000, allocated_amount: 200_000_000,
      executed_amount: 215_000_000, returned_amount: 0, remaining_amount: -15_000_000,
      execution_rate: 107.5, is_mandatory: true, is_recurring: true,
      document_number: "제주시청-차량관리과운영팀-2026-1103", responsible_person_name: "시설담당 주무관",
      parking_lots: parkingLots[1], lot_type_at_event: "multilevel",
    },
    {
      id: "item-onstreet", plan_id: "plan-main", lot_id: "lot-onstreet", item_code: "E-301",
      budget_type: "expenditure", category_l1: "시설비", category_l2: "노면정비",
      item_name: "노상주차장 노면표시 정비", previous_year_amount: 80_000_000,
      requested_amount: 110_000_000, planned_amount: 100_000_000, allocated_amount: 80_000_000,
      executed_amount: 20_000_000, returned_amount: 5_000_000, remaining_amount: 55_000_000,
      execution_rate: 25, is_mandatory: false, is_recurring: true,
      responsible_person_name: "도로시설담당 주무관", parking_lots: parkingLots[2], lot_type_at_event: "onstreet",
    },
  ],
  executions: [
    {
      id: "exec-revenue", item_id: "item-revenue", lot_id: "lot-offstreet",
      execution_number: "BE-2026-0801", execution_date: "2026-08-01", execution_type: "revenue_collection",
      amount: 480_000_000, description: "1~7월 공영주차장 사용료 수입 징수", vendor_name: "제주시 세입계좌",
      status: "executed", approved_at: "2026-08-02", document_number: "제주시청-차량관리과운영팀-2026-1201",
      reference_module: "REVENUE_CLOSE", reference_number: "REV-202607", parking_lots: parkingLots[0],
      lot_type_at_event: "offstreet",
    },
    {
      id: "exec-offstreet", item_id: "item-offstreet", lot_id: "lot-offstreet",
      execution_number: "BE-2026-0802", execution_date: "2026-08-02", execution_type: "expenditure",
      amount: 120_000_000, description: "무인정산기 및 차단기 개선사업 기성금", vendor_name: "제주관제시스템",
      status: "executed", approved_at: "2026-08-03", reference_module: "FACILITY_MAINTENANCE",
      reference_number: "MW-202608-001", parking_lots: parkingLots[0], lot_type_at_event: "offstreet",
    },
    {
      id: "exec-building", item_id: "item-building", lot_id: "lot-building",
      execution_number: "BE-2026-0803", execution_date: "2026-08-03", execution_type: "expenditure",
      amount: 200_000_000, description: "주차빌딩 전기·소방 유지관리 연간 기성금", vendor_name: "탐라시설관리",
      status: "executed", approved_at: "2026-08-04", document_number: "제주시청-차량관리과운영팀-2026-1203",
      parking_lots: parkingLots[1], lot_type_at_event: "multilevel",
    },
    {
      id: "exec-building-pending", item_id: "item-building", lot_id: "lot-building",
      execution_number: "BE-2026-0804", execution_date: "2026-08-04", execution_type: "expenditure",
      amount: 15_000_000, description: "승강기 긴급 보수 추가 집행", vendor_name: "제주승강기안전",
      status: "pending", parking_lots: parkingLots[1], lot_type_at_event: "multilevel",
    },
    {
      id: "exec-onstreet", item_id: "item-onstreet", lot_id: "lot-onstreet",
      execution_number: "BE-2026-0805", execution_date: "2026-08-04", execution_type: "expenditure",
      amount: 20_000_000, description: "노상주차구획 노면표시 정비 선금", vendor_name: "제주도로안전",
      status: "executed", approved_at: "2026-08-04", parking_lots: parkingLots[2], lot_type_at_event: "onstreet",
    },
  ],
  transfers: [
    {
      id: "transfer-approved", fiscal_year: 2026, transfer_number: "BT-2026-0801",
      transfer_type: "appropriation", from_item_id: "item-offstreet", to_item_id: "item-building",
      amount: 15_000_000, reason: "주차빌딩 승강기 긴급 보수 재원 확보",
      legal_basis: "지방재정법 제49조 및 제주시 예산운영 기준", status: "approved",
      approved_at: "2026-08-03", approval_number: "예산전용-2026-08-01",
      document_number: "제주시청-차량관리과운영팀-2026-1301",
    },
    {
      id: "transfer-pending", fiscal_year: 2026, transfer_number: "BT-2026-0802",
      transfer_type: "transfer", from_item_id: "item-building", to_item_id: "item-onstreet",
      amount: 5_000_000, reason: "노상주차장 노면표시 긴급 정비비 보강",
      legal_basis: "지방재정법 및 예산집행지침", status: "pending",
    },
  ],
  documentNumbers: {
    "BUDGET_PLAN:plan-main": ["제주시청-차량관리과운영팀-2026-1001"],
    "BUDGET_ITEM:item-offstreet": ["제주시청-차량관리과운영팀-2026-1102"],
    "BUDGET_EXECUTION:exec-offstreet": ["제주시청-차량관리과운영팀-2026-1202"],
    "BUDGET_TRANSFER:transfer-approved": ["제주시청-차량관리과운영팀-2026-1301"],
  },
};

const options = parseBudgetReportOptions({
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  report_scope: "budget",
  budget_fiscal_years: "2026",
  budget_sections: "overview,plans,items,executions,transfers,risks,documents",
  budget_fields: JSON.stringify(defaultBudgetReportFields()),
  budget_lot_types: "offstreet,building,onstreet",
  budget_sort: "attention",
  budget_orientation: "portrait",
});
const model = buildBudgetReportModel(dataset, options);

const expectedSummary: Partial<typeof model.summary> = {
  parkingLots: 3,
  plans: 2,
  approvedPlans: 1,
  pendingPlans: 1,
  plannedRevenue: 600_000_000,
  plannedExpenditure: 500_000_000,
  allocatedExpenditure: 450_000_000,
  executedExpenditure: 355_000_000,
  returnedExpenditure: 15_000_000,
  remainingExpenditure: 80_000_000,
  executionRows: 5,
  executedRows: 4,
  executedRecordAmount: 820_000_000,
  pendingExecutionRows: 1,
  pendingExecutionAmount: 15_000_000,
  transfers: 2,
  approvedTransfers: 1,
  approvedTransferAmount: 15_000_000,
  pendingTransfers: 1,
  pendingTransferAmount: 5_000_000,
  riskCount: 10,
  overrunItems: 1,
  linkedDocuments: 8,
  missingDocuments: 5,
};
for (const [key, expected] of Object.entries(expectedSummary)) {
  const actual = model.summary[key];
  if (actual !== expected) throw new Error(`예산보고서 검증값 불일치: ${key}=${actual}, expected=${expected}`);
}
if (Math.abs(model.summary.executionRate - 78.8888888889) > 0.0001) {
  throw new Error(`세출 집행률 검증값 불일치: ${model.summary.executionRate}`);
}

const hwpx = await createOperationsHwpx({
  model: toOperationsCompatibleBudgetModel(model),
  title: "2026년 8월 제주시 공영주차장 예산관리 종합 현황 보고서",
  reportNumber: "RPT-BUD-202608-001",
  orientation: options.orientation,
  officialDocumentNumber: "제주시청-차량관리과운영팀-2026-1000",
  authorName: "예산담당 주무관",
  organizationName: "제주시청",
  disclosureStatus: "공개",
  documentSummary: "공영주차장 예산의 편성·배정·집행·잔액과 전용·이체 승인상태를 점검하고 재정 위험 및 공식 문서번호 누락을 확인함.",
  keywords: "제주시, 공영주차장, 예산관리, 예산집행, 전용이체",
  documentOverrides: {
    briefRows: budgetReportBriefRows(model),
    summaryRows: budgetReportSummaryRows(model),
    footerLabel: "예산관리",
    flowDetailTablesAcrossPages: true,
  },
});
const validation = await validateOperationsHwpx(hwpx, "예산관리");
if (!validation.valid || validation.textLength < 1_000) {
  throw new Error(`HWPX 패키지 검증 실패: ${JSON.stringify(validation)}`);
}

const outputDirectory = resolve("work", "verification");
await mkdir(outputDirectory, { recursive: true });
const hwpxPath = resolve(outputDirectory, "budget-report-integrated.hwpx");
await writeFile(hwpxPath, Buffer.from(await hwpx.arrayBuffer()));
const hwpxFile = await stat(hwpxPath);
if (!hwpxFile.isFile() || hwpxFile.size < 1_000) throw new Error("HWPX 파일 저장 검증 실패");

const response = await fetch("http://127.0.0.1:43127/convert", {
  method: "POST",
  headers: { "Content-Type": "application/hwp+zip" },
  body: hwpx,
  signal: AbortSignal.timeout(120_000),
});
if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "한컴 PDF 변환 실패");
const pdf = await response.arrayBuffer();
if (new TextDecoder("latin1").decode(pdf.slice(0, 5)) !== "%PDF-") {
  throw new Error("한컴 변환 결과가 PDF가 아닙니다.");
}
const pdfPages = Number(response.headers.get("X-PDF-Page-Count"));
if (!Number.isInteger(pdfPages) || pdfPages < 1) throw new Error(`PDF 페이지 수 검증 실패: ${pdfPages}`);
const pdfPath = resolve(outputDirectory, "budget-report-integrated-hancom.pdf");
await writeFile(pdfPath, Buffer.from(pdf));
const pdfFile = await stat(pdfPath);
if (!pdfFile.isFile() || pdfFile.size < 1_000) throw new Error("PDF 파일 저장 검증 실패");

process.stdout.write(JSON.stringify({
  hwpx: { path: hwpxPath, exists: hwpxFile.isFile(), bytes: hwpxFile.size, validation },
  pdf: { path: pdfPath, exists: pdfFile.isFile(), bytes: pdfFile.size, pages: pdfPages },
  summary: model.summary,
  sourceCounts: model.sourceCounts,
  riskNarrative: model.riskNarrative,
  tables: model.tables.map(table => ({
    id: table.id,
    title: table.title,
    subtitle: table.subtitle,
    columns: table.columns.length,
    rows: table.rows.length,
  })),
}));
