import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import type { ProcurementReportDataset, ProcurementReportSectionId } from "../src/lib/procurement-report";

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const {
  PROCUREMENT_REPORT_SAMPLE_DATASET,
  PROCUREMENT_REPORT_SECTIONS,
  buildProcurementReportModel,
  defaultProcurementReportFields,
  parseProcurementReportOptions,
  procurementReportBriefRows,
  procurementReportSummaryRows,
  toOperationsCompatibleProcurementModel,
} = await vite.ssrLoadModule("/src/lib/procurement-report.ts");
const { createOperationsHwpx, validateOperationsHwpx } = await vite.ssrLoadModule("/src/lib/operations-report.ts");

const dataset: ProcurementReportDataset = structuredClone(PROCUREMENT_REPORT_SAMPLE_DATASET);
const onstreetLot = { id: "lot-3", code: "JJP-003", name: "중앙로 노상주차장", lot_type: "onstreet", status: "active" };
dataset.parkingLots.push(onstreetLot);
dataset.projects.push({
  id: "project-4",
  bid_number: "JJC-BID-2026-3004",
  document_number: "제주시청-차량관리과운영팀-2026-0404",
  title: "중앙로 노상주차장 노면표시 정비",
  lot_id: "lot-3",
  lot_type_at_event: "onstreet",
  bid_type: "limited",
  contract_type: "construction",
  evaluation_method: "qualification",
  status: "failed",
  nara_ref: "20260900444-00",
  announce_date: "2026-08-20",
  bid_start_date: "2026-08-24",
  bid_deadline: "2026-09-02",
  bid_open_date: "2026-09-03",
  bid_open_location: "국가종합전자조달시스템",
  budget_item_id: "budget-3",
  budget_available_amount: 70_000_000,
  estimated_amount: 60_000_000,
  design_amount: 65_000_000,
  lowest_price_rate: 87.745,
  assigned_to: "profile-3",
  created_at: "2026-08-18",
  parking_lots: onstreetLot,
});
dataset.submissions.push(
  {
    id: "sub-4",
    bid_project_id: "project-4",
    submission_number: "JJC-SUB-2026-3004",
    company_name: "제주도로안전",
    representative: "고대표",
    contact_person: "김현장",
    bid_amount: 58_000_000,
    bid_rate: 89.23,
    submitted_at: "2026-09-02",
    is_valid: true,
  },
  {
    id: "sub-5",
    bid_project_id: "project-4",
    submission_number: "JJC-SUB-2026-3005",
    company_name: "한라노면정비",
    representative: "양대표",
    contact_person: "이입찰",
    bid_amount: 57_500_000,
    bid_rate: 88.46,
    submitted_at: "2026-09-02",
    is_valid: true,
  },
);
dataset.evaluations.push({
  id: "eval-3",
  bid_project_id: "project-4",
  submission_id: "sub-4",
  evaluator_name: "계약담당 주무관",
  evaluation_date: "2026-09-03",
  price_score: 29,
  technical_score: 42,
  business_score: 17,
  performance_score: 0,
  total_score: 88,
  rank: 1,
  is_qualified: false,
  disqualification_reason: "필수 시공실적 기준 미충족",
});
dataset.documents.push({
  id: "doc-4",
  bid_project_id: "project-4",
  contract_id: null,
  document_number: "제주시청-차량관리과운영팀-2026-0404",
  doc_category: "bid",
  doc_type: "announcement",
  title: "노상주차장 정비 입찰공고문",
  version: "1.0",
  is_current: true,
  file_path: "procurement/project-4/announcement.pdf",
  created_at: "2026-08-20",
});
dataset.budgetItems.push({
  id: "budget-3",
  item_code: "E-2026-03",
  item_name: "노상주차장 노면표시 정비",
  allocated_amount: 70_000_000,
  executed_amount: 0,
  returned_amount: 0,
});
dataset.profiles.push({ id: "profile-3", name: "계약담당 주무관" });
dataset.documentNumbers["BID_PROJECT:project-4"] = ["제주시청-차량관리과운영팀-2026-0404"];
dataset.documentNumbers["BID_DOCUMENT:doc-4"] = ["제주시청-차량관리과운영팀-2026-0404"];

const selectedFields = defaultProcurementReportFields();
const includeNamedOwner = (section: ProcurementReportSectionId, ...fields: string[]) => {
  selectedFields[section] = [...new Set([...(selectedFields[section] || []), ...fields])];
};
includeNamedOwner("announcements", "assigned_to");
includeNamedOwner("submissions", "contact_person");
includeNamedOwner("evaluations", "evaluator_name");
includeNamedOwner("contracts", "contractor_contact_person");
includeNamedOwner("deadlines", "owner");

const sectionIds = PROCUREMENT_REPORT_SECTIONS.map(section => section.id);
const options = parseProcurementReportOptions({
  period_start: "2026-07-01",
  period_end: "2026-09-30",
  report_scope: "procurement",
  procurement_sections: sectionIds.join(","),
  procurement_fields: JSON.stringify(selectedFields),
  procurement_lot_types: "offstreet,building,onstreet",
  procurement_sort: "attention",
  procurement_orientation: "landscape",
  procurement_include_invalid_submissions: "true",
});
const model = buildProcurementReportModel(dataset, options);

const expectedSummary: Partial<typeof model.summary> = {
  parkingLots: 3,
  projects: 4,
  activeProjects: 2,
  awardedProjects: 2,
  failedProjects: 1,
  estimatedAmount: 300_000_000,
  designAmount: 326_000_000,
  budgetAvailableAmount: 340_000_000,
  submissions: 5,
  validSubmissions: 4,
  invalidSubmissions: 1,
  contracts: 1,
  bondsRegistered: 1,
};
for (const [key, expected] of Object.entries(expectedSummary)) {
  const actual = model.summary[key];
  if (actual !== expected) throw new Error(`입찰보고서 검증값 불일치: ${key}=${actual}, expected=${expected}`);
}
if (model.lotTypeLabels.join(",") !== "노외주차장,주차빌딩,노상주차장") {
  throw new Error(`주차장 형태 검증 실패: ${model.lotTypeLabels.join(",")}`);
}

const requiredTableIds = ["announcements", "openings", "submissions", "evaluations", "contracts", "bonds", "deadlines", "documents", "risks"];
for (const id of requiredTableIds) {
  if (!model.tables.some(table => table.id === id)) throw new Error(`입찰보고서 필수 표 누락: ${id}`);
}
const reportText = model.tables.flatMap(table => [table.title, ...table.columns.map(column => column.label), ...table.rows.flatMap(row => Object.values(row))]).join("\n");
for (const token of [
  "노외주차장", "주차빌딩", "노상주차장", "입찰 공고", "개찰·낙찰", "평가 결과", "계약 현황", "보증 현황", "기한 관리",
  "제주주차시스템", "계약담당 주무관", "가용예산", "낙찰률", "제주시청-차량관리과운영팀-2026-0404", "리스크·조치사항",
]) {
  if (!reportText.includes(token)) throw new Error(`입찰보고서 필수 내용 누락: ${token}`);
}
if (model.summary.riskCount < 1 || !model.riskNarrative.includes("문서·원문 누락")) {
  throw new Error(`입찰보고서 위험 검증 실패: ${model.riskNarrative}`);
}

const hwpx = await createOperationsHwpx({
  model: toOperationsCompatibleProcurementModel(model),
  title: "2026년 3분기 제주시 공영주차장 입찰·계약 종합 현황 보고서",
  reportNumber: "RPT-PROC-202609-001",
  orientation: options.orientation,
  officialDocumentNumber: "제주시청-차량관리과운영팀-2026-0600",
  authorName: "계약담당 주무관",
  organizationName: "제주시청",
  disclosureStatus: "부분공개",
  disclosureBasis: "업체 담당자 이름 등 개인정보는 내부 업무용으로 제한",
  documentSummary: "공영주차장 입찰의 공고·개찰·평가·계약·보증·기한과 예산 대비 낙찰 결과를 점검하고 공식 문서번호 및 후속조치 위험을 확인함.",
  keywords: "제주시, 공영주차장, 입찰관리, 계약관리, 보증, 낙찰률",
  documentOverrides: {
    briefRows: procurementReportBriefRows(model),
    summaryRows: procurementReportSummaryRows(model),
    footerLabel: "입찰관리",
    flowDetailTablesAcrossPages: true,
  },
});
const validation = await validateOperationsHwpx(hwpx, "입찰관리");
if (!validation.valid || validation.textLength < 2_000) {
  throw new Error(`HWPX 패키지 검증 실패: ${JSON.stringify(validation)}`);
}

const outputDirectory = resolve("work", "verification");
await mkdir(outputDirectory, { recursive: true });
const hwpxPath = resolve(outputDirectory, "procurement-report-integrated.hwpx");
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
if (new TextDecoder("latin1").decode(pdf.slice(0, 5)) !== "%PDF-") throw new Error("한컴 변환 결과가 PDF가 아닙니다.");
const pdfPages = Number(response.headers.get("X-PDF-Page-Count"));
if (!Number.isInteger(pdfPages) || pdfPages < 1) throw new Error(`PDF 페이지 수 검증 실패: ${pdfPages}`);
const pdfPath = resolve(outputDirectory, "procurement-report-integrated-hancom.pdf");
await writeFile(pdfPath, Buffer.from(pdf));
const pdfFile = await stat(pdfPath);
if (!pdfFile.isFile() || pdfFile.size < 1_000) throw new Error("PDF 파일 저장 검증 실패");

const pdfText = Buffer.from(pdf).toString("latin1");
const mediaBox = pdfText.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
const pageSizeMm = mediaBox
  ? {
      width: Math.round((Number(mediaBox[3]) - Number(mediaBox[1])) * 25.4 / 72 * 10) / 10,
      height: Math.round((Number(mediaBox[4]) - Number(mediaBox[2])) * 25.4 / 72 * 10) / 10,
    }
  : null;

await vite.close();
process.stdout.write(JSON.stringify({
  hwpx: { path: hwpxPath, exists: hwpxFile.isFile(), bytes: hwpxFile.size, validation },
  pdf: { path: pdfPath, exists: pdfFile.isFile(), bytes: pdfFile.size, pages: pdfPages, pageSizeMm },
  lotTypes: model.lotTypeLabels,
  summary: model.summary,
  sourceCounts: model.sourceCounts,
  riskNarrative: model.riskNarrative,
  tables: model.tables.map(table => ({ id: table.id, columns: table.columns.length, rows: table.rows.length })),
}));
