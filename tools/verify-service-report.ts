import { execFile } from "node:child_process";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import type { ServiceReportDataset } from "../src/lib/service-report";

const execFileAsync = promisify(execFile);
const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

const {
  SERVICE_REPORT_SAMPLE_DATASET,
  SERVICE_REPORT_SECTIONS,
  buildServiceReportModel,
  defaultServiceReportFields,
  parseServiceReportOptions,
  serviceReportBriefRows,
  serviceReportSummaryRows,
  toOperationsCompatibleServiceModel,
} = await import("../src/lib/service-report");
const { createOperationsHwpx, validateOperationsHwpx } = await import("../src/lib/operations-report");

const onstreetLot = {
  id: "lot-3",
  code: "JJP-003",
  name: "중앙로 노상주차장",
  lot_type: "onstreet",
};

const dataset: ServiceReportDataset = structuredClone(SERVICE_REPORT_SAMPLE_DATASET);
dataset.parkingLots.push(onstreetLot);
dataset.projects.push({
  id: "project-3",
  project_number: "SVC-2026-003",
  title: "노상주차장 환경정비 및 현장운영 용역",
  lot_id: onstreetLot.id,
  service_type: "cleaning",
  scope_of_work: "노상 주차구획 청소, 노면표시 주변 정비 및 민원 발생 구간 현장조치",
  contractor_name: "제주도시환경 주식회사",
  contractor_business_number: "616-81-12345",
  contractor_representative: "고대표",
  contractor_address: "제주특별자치도 제주시 중앙로 100",
  contractor_phone: "064-728-4100",
  contractor_email: "field@jeju-clean.example",
  contractor_manager: "강현장",
  contractor_manager_phone: "010-5555-6600",
  contract_date: "2026-03-05",
  start_date: "2026-03-15",
  end_date: "2026-11-30",
  actual_start_date: "2026-03-15",
  contract_amount: 72_000_000,
  vat_amount: 7_200_000,
  total_amount: 79_200_000,
  paid_amount: 31_680_000,
  remaining_amount: 47_520_000,
  progress_pct: 58,
  progress_note: "8월 정기 환경정비 및 민원 다발구간 집중조치 진행 중",
  status: "in_progress",
  bid_contract_id: "bid-3",
  budget_item_id: "budget-3",
  parking_lots: onstreetLot,
  supervisor: { name: "운영팀 주무관" },
  sub_supervisor: { name: "시설팀 주무관" },
  inspector: { name: "현장 검수담당" },
});
dataset.milestones.push({
  id: "milestone-4",
  project_id: "project-3",
  milestone_number: 1,
  milestone_type: "kickoff",
  title: "착수보고 및 현장안전계획 확인",
  target_date: "2026-03-15",
  actual_date: "2026-03-15",
  delay_days: 0,
  weight_pct: 10,
  deliverables_count: 1,
  deliverables_submitted: 1,
  payment_amount: 7_920_000,
  payment_requested: true,
  status: "completed",
});
dataset.milestones.push({
  id: "milestone-5",
  project_id: "project-3",
  milestone_number: 2,
  milestone_type: "progress",
  title: "8월 기성 및 민원구간 조치결과",
  target_date: "2026-08-25",
  actual_date: "2026-08-24",
  delay_days: 0,
  weight_pct: 40,
  deliverables_count: 2,
  deliverables_submitted: 2,
  payment_amount: 23_760_000,
  payment_requested: true,
  status: "completed",
});
dataset.inspections.push({
  id: "inspection-3",
  project_id: "project-3",
  inspection_number: "SINSP-2026-003",
  inspection_type: "progress",
  inspection_date: "2026-08-26",
  title: "노상주차장 8월 기성검수",
  target_amount: 23_760_000,
  approved_amount: 23_760_000,
  deduction_amount: 0,
  result: "pass",
  pass_items: 12,
  fail_items: 0,
  correction_verified: true,
  status: "approved",
  inspector_name: "현장 검수담당",
  photos: ["onstreet-before", "onstreet-after"],
});
dataset.payments.push({
  id: "payment-3",
  project_id: "project-3",
  payment_number: "SPAY-2026-003",
  payment_type: "progress",
  title: "노상주차장 8월 기성금",
  request_date: "2026-08-27",
  due_date: "2026-09-05",
  gross_amount: 23_760_000,
  advance_deduction: 0,
  other_deduction: 0,
  net_amount: 23_760_000,
  paid_amount: null,
  status: "approved",
  budget_execution_id: "budget-exec-3",
});
dataset.deliverables.push({
  id: "deliverable-4",
  project_id: "project-3",
  deliverable_number: "DEL-2026-004",
  deliverable_type: "report",
  title: "착수보고서 및 현장안전계획서",
  format_required: "HWPX+PDF",
  required_copies: 3,
  submitted_at: "2026-03-15",
  status: "accepted",
  review_score: 92,
  revision_count: 0,
});
dataset.deliverables.push({
  id: "deliverable-5",
  project_id: "project-3",
  deliverable_number: "DEL-2026-005",
  deliverable_type: "photo_ledger",
  title: "8월 현장조치 사진대지",
  format_required: "HWPX+PDF+원본사진",
  required_copies: 2,
  submitted_at: "2026-08-24",
  status: "accepted",
  review_score: 94,
  revision_count: 0,
});
dataset.issues.push({
  id: "issue-3",
  project_id: "project-3",
  issue_number: "ISS-2026-003",
  issue_type: "safety",
  severity: "high",
  title: "우천 시 노면 미끄럼 위험구간 확인",
  description: "중앙로 노상주차장 12번 구획 배수불량으로 미끄럼 위험이 확인됨",
  impact_amount: 1_500_000,
  impact_days: 2,
  reported_at: "2026-08-22",
  revised_end_date: "2026-09-02",
  requires_approval: true,
  approval_status: "approved",
  status: "in_progress",
});
Object.assign(dataset.documentNumbers, {
  "SERVICE:project-3": ["제주시청-차량관리과운영팀-2026-0601"],
  "SERVICE_MILESTONE:milestone-4": ["제주시청-차량관리과운영팀-2026-0610"],
  "SERVICE_MILESTONE:milestone-5": ["제주시청-차량관리과운영팀-2026-0611"],
  "SERVICE_INSPECTION:inspection-3": ["제주시청-차량관리과운영팀-2026-0620"],
  "SERVICE_PAYMENT:payment-3": ["제주시청-차량관리과운영팀-2026-0630"],
  "SERVICE_DELIVERABLE:deliverable-4": ["제주시청-차량관리과운영팀-2026-0640"],
  "SERVICE_DELIVERABLE:deliverable-5": ["제주시청-차량관리과운영팀-2026-0641"],
  "SERVICE_ISSUE:issue-3": ["제주시청-차량관리과운영팀-2026-0650"],
});

const options = parseServiceReportOptions({
  period_start: "2026-01-01",
  period_end: "2026-08-31",
  report_scope: "service",
  service_sections: SERVICE_REPORT_SECTIONS.map((section) => section.id).join(","),
  service_fields: JSON.stringify(defaultServiceReportFields()),
  service_lot_types: "offstreet,building,onstreet",
  service_sort: "attention",
  service_orientation: "portrait",
  service_include_closed: "true",
});
const model = buildServiceReportModel(dataset, options);

if (model.summary.parkingLots !== 3 || model.summary.projects !== 3) {
  throw new Error(`주차장 형태별 용역 집계 오류: 주차장 ${model.summary.parkingLots}개소, 용역 ${model.summary.projects}건`);
}
if (model.lotTypeLabels.join(",") !== "노외주차장,주차빌딩,노상주차장") {
  throw new Error(`주차장 형태 표시 오류: ${model.lotTypeLabels.join(",")}`);
}
const requiredTableIds = ["projects", "contracts", "contacts", "milestones", "inspections", "payments", "deliverables", "risks", "documents"];
for (const tableId of requiredTableIds) {
  if (!model.tables.some((table) => table.id === tableId)) throw new Error(`필수 보고서 표 누락: ${tableId}`);
}
for (const [source, evidence] of Object.entries(model.evidenceMetadata.sources)) {
  if (!evidence.complete || evidence.expected !== evidence.loaded) {
    throw new Error(`원천자료 절단 감지: ${source} ${evidence.loaded}/${evidence.expected}`);
  }
}
const onstreetProjectRows = model.tables.filter((table) => table.id === "projects").flatMap((table) => table.rows);
if (!onstreetProjectRows.some((row) => row.project_number === "SVC-2026-003" && row.lot_type === "노상주차장")) {
  throw new Error("노상주차장 용역 개요가 보고서 모델에 포함되지 않았습니다.");
}

const reportTitle = "2026년 제주시 공영주차장 용역사업 통합 현황 보고서";
const officialDocumentNumber = "제주시청-차량관리과운영팀-2026-0600";
const hwpx = await createOperationsHwpx({
  model: toOperationsCompatibleServiceModel(model),
  title: reportTitle,
  reportNumber: "RPT-SVC-202608-001",
  orientation: options.orientation,
  officialDocumentNumber,
  authorName: "용역사업 담당 주무관",
  organizationName: "제주시청",
  disclosureStatus: "공개",
  documentSummary: "제주시 공영주차장 용역사업의 계약, 업체 및 현장담당 연락처, 착수와 진도, 검수, 대금, 성과물, 하자와 리스크 및 공식 문서번호를 통합 점검함.",
  keywords: "제주시, 공영주차장, 용역사업, 계약, 검수, 대금, 성과물, 하자",
  documentOverrides: {
    briefRows: serviceReportBriefRows(model),
    summaryRows: serviceReportSummaryRows(model),
    footerLabel: "용역사업관리",
    flowDetailTablesAcrossPages: true,
  },
});

const validation = await validateOperationsHwpx(hwpx, "용역사업");
if (!validation.valid || validation.textLength < 2_000) {
  throw new Error(`HWPX 본문 검증 실패: ${JSON.stringify(validation)}`);
}
const zip = await JSZip.loadAsync(await hwpx.arrayBuffer());
const packageFiles = Object.keys(zip.files);
const requiredPackageFiles = ["mimetype", "version.xml", "Contents/content.hpf", "Contents/section0.xml"];
for (const fileName of requiredPackageFiles) {
  if (!zip.file(fileName)) throw new Error(`HWPX 필수 패키지 파일 누락: ${fileName}`);
}
const mimeType = await zip.file("mimetype")!.async("string");
if (mimeType.trim() !== "application/hwp+zip") throw new Error(`HWPX MIME 선언 오류: ${mimeType}`);
const sectionXml = (await Promise.all(
  packageFiles.filter((name) => /^Contents\/section\d+\.xml$/.test(name)).map((name) => zip.file(name)!.async("string")),
)).join("\n");
const requiredText = [
  reportTitle,
  officialDocumentNumber,
  "노외주차장",
  "주차빌딩",
  "노상주차장",
  "계약 현황",
  "업체·현장담당 연락처",
  "착수·진도",
  "검수·시정조치",
  "대금 지급",
  "성과물",
  "하자·리스크",
  "공식 문서번호",
  "제주도시환경 주식회사",
  "강현장",
  "010-5555-6600",
];
for (const marker of requiredText) {
  if (!sectionXml.includes(marker)) throw new Error(`HWPX 본문 필수 내용 누락: ${marker}`);
}

const outputDirectory = resolve("work", "verification");
await mkdir(outputDirectory, { recursive: true });
const hwpxPath = resolve(outputDirectory, "service-report-integrated.hwpx");
await writeFile(hwpxPath, Buffer.from(await hwpx.arrayBuffer()));
const hwpxFile = await stat(hwpxPath);
if (!hwpxFile.isFile() || hwpxFile.size < 10_000) throw new Error(`HWPX 파일 저장 검증 실패: ${hwpxFile.size} bytes`);

const healthResponse = await fetch("http://127.0.0.1:43127/health", { signal: AbortSignal.timeout(5_000) });
if (!healthResponse.ok) throw new Error(`한컴 변환 브리지 상태 확인 실패: HTTP ${healthResponse.status}`);
const bridgeHealth = await healthResponse.json() as { available?: boolean; engine?: string; canonical?: string };
if (!bridgeHealth.available || bridgeHealth.engine !== "Hancom Office") {
  throw new Error(`설치된 한컴 엔진을 사용할 수 없습니다: ${JSON.stringify(bridgeHealth)}`);
}
const conversionResponse = await fetch("http://127.0.0.1:43127/convert", {
  method: "POST",
  headers: { "Content-Type": "application/hwp+zip" },
  body: hwpx,
  signal: AbortSignal.timeout(120_000),
});
if (!conversionResponse.ok) {
  const detail = await conversionResponse.json().catch(() => null) as { error?: string } | null;
  throw new Error(detail?.error || `한컴 PDF 변환 실패: HTTP ${conversionResponse.status}`);
}
const pdfBytes = Buffer.from(await conversionResponse.arrayBuffer());
if (pdfBytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("한컴 변환 결과가 PDF 형식이 아닙니다.");
const bridgePageCount = Number(conversionResponse.headers.get("X-PDF-Page-Count"));
if (!Number.isInteger(bridgePageCount) || bridgePageCount < 1) throw new Error(`한컴 브리지 페이지 수 오류: ${bridgePageCount}`);
const pdfPath = resolve(outputDirectory, "service-report-integrated-hancom.pdf");
await writeFile(pdfPath, pdfBytes);
const pdfFile = await stat(pdfPath);
if (!pdfFile.isFile() || pdfFile.size < 10_000) throw new Error(`PDF 파일 저장 검증 실패: ${pdfFile.size} bytes`);

async function installedPopplerBinary(name: "pdfinfo" | "pdftoppm") {
  const candidate = join(
    homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "native",
    "poppler",
    "Library",
    "bin",
    `${name}.exe`,
  );
  await access(candidate);
  return candidate;
}

const pdfInfoPath = await installedPopplerBinary("pdfinfo");
const { stdout: pdfInfoOutput } = await execFileAsync(pdfInfoPath, [pdfPath], { encoding: "utf8" });
const pdfInfoPages = Number(/^Pages:\s+(\d+)$/m.exec(pdfInfoOutput)?.[1]);
const pageSizeMatch = /^Page size:\s+([\d.]+) x ([\d.]+) pts(?: \(([^)]+)\))?$/m.exec(pdfInfoOutput);
if (!Number.isInteger(pdfInfoPages) || pdfInfoPages !== bridgePageCount) {
  throw new Error(`PDF 페이지 수 교차검증 실패: bridge=${bridgePageCount}, pdfinfo=${pdfInfoPages}`);
}
if (!pageSizeMatch) throw new Error("PDF 용지 크기를 확인하지 못했습니다.");
const pageWidthPt = Number(pageSizeMatch[1]);
const pageHeightPt = Number(pageSizeMatch[2]);
if (Math.abs(pageWidthPt - 595.28) > 3 || Math.abs(pageHeightPt - 841.89) > 3) {
  throw new Error(`PDF가 A4 세로 규격이 아닙니다: ${pageWidthPt} x ${pageHeightPt} pt`);
}

const previewPrefix = resolve(outputDirectory, "service-report-integrated-preview-1");
const previewPath = `${previewPrefix}.png`;
const pdftoppmPath = await installedPopplerBinary("pdftoppm");
await execFileAsync(pdftoppmPath, ["-f", "1", "-singlefile", "-png", "-r", "120", pdfPath, previewPrefix]);
const previewFile = await stat(previewPath);
if (!previewFile.isFile() || previewFile.size < 10_000) throw new Error("PDF 첫 페이지 렌더링 검증 실패");

process.stdout.write(JSON.stringify({
  bridge: bridgeHealth,
  hwpx: {
    path: hwpxPath,
    bytes: hwpxFile.size,
    valid: validation.valid,
    textLength: validation.textLength,
    packageFiles: packageFiles.length,
    requiredMarkers: requiredText.length,
  },
  pdf: {
    path: pdfPath,
    bytes: pdfFile.size,
    pages: pdfInfoPages,
    pageSizePt: { width: pageWidthPt, height: pageHeightPt },
    pageSizeName: pageSizeMatch[3] || null,
  },
  preview: { path: previewPath, bytes: previewFile.size },
  summary: model.summary,
  evidence: model.evidenceMetadata,
  tables: model.tables.map((table) => ({
    id: table.id,
    title: table.title,
    columns: table.columns.length,
    rows: table.rows.length,
    continuation: Boolean(table.continuation),
  })),
}, null, 2));
