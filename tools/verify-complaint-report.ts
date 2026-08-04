import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { HwpxReader } from "hwp-convert";

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

const {
  COMPLAINT_REPORT_SAMPLE_DATASET,
  buildComplaintReportModel,
  complaintReportBriefRows,
  complaintReportSummaryRows,
  defaultComplaintReportFields,
  parseComplaintReportOptions,
  toOperationsCompatibleComplaintModel,
} = await import("../src/lib/complaint-report");
const { createOperationsHwpx, validateOperationsHwpx } = await import("../src/lib/operations-report");

const options = parseComplaintReportOptions({
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  complaint_as_of_date: "2026-08-31",
  report_scope: "complaints",
  complaint_sections: "overview,intake,sla,assignments,timeline,repeats,prevention,lot_types,documents",
  complaint_fields: JSON.stringify(defaultComplaintReportFields()),
  complaint_lot_types: "offstreet,building,onstreet",
  complaint_sort: "attention",
  complaint_orientation: "portrait",
});
const model = buildComplaintReportModel(COMPLAINT_REPORT_SAMPLE_DATASET, options);

const expectedSummary: Partial<typeof model.summary> = {
  parkingLots: 3,
  totalComplaints: 5,
  openComplaints: 2,
  respondedComplaints: 1,
  closedComplaints: 2,
  unassignedComplaints: 1,
  overdueComplaints: 1,
  dueSoonComplaints: 1,
  completedWithinSla: 2,
  completedLate: 1,
  repeatComplaints: 1,
  preventionRequired: 1,
  preventionCompleted: 1,
  fieldVisits: 2,
  linkedFacilityWork: 2,
  officialResponses: 2,
  missingOfficialResponses: 1,
};
for (const [key, expected] of Object.entries(expectedSummary)) {
  const actual = model.summary[key];
  if (actual !== expected) {
    throw new Error(`민원 보고서 검증값 불일치: ${key}=${actual}, expected=${expected}`);
  }
}
if (Math.abs(model.summary.slaComplianceRate - (2 / 3 * 100)) > 0.001) {
  throw new Error(`SLA 준수율 검증값 불일치: ${model.summary.slaComplianceRate}`);
}
if (model.protectedFieldCount !== 0) {
  throw new Error(`개인정보 최소화 실패: 보호항목 ${model.protectedFieldCount}개가 출력 대상으로 선택되었습니다.`);
}
if (!model.evidenceMetadata.complete || model.evidenceMetadata.truncationPolicy !== "fail") {
  throw new Error("민원 보고서 증거 메타데이터의 완전성 또는 행 절단 정책이 올바르지 않습니다.");
}

const hwpx = await createOperationsHwpx({
  model: toOperationsCompatibleComplaintModel(model),
  title: "2026년 8월 제주시 공영주차장 민원관리 종합 현황 보고서",
  reportNumber: "RPT-CMP-202608-001",
  orientation: options.orientation,
  officialDocumentNumber: "제주시청-차량관리과운영팀-2026-2100",
  authorName: "민원관리 담당 주무관",
  organizationName: "제주시청",
  disclosureStatus: "부분공개",
  disclosureBasis: "개인정보 보호를 위해 민원인 식별정보를 제외함",
  documentSummary: "공영주차장 민원의 접수·배정·처리기한·현장조치·회신·완결 현황을 점검하고 기한 초과와 반복민원의 재발방지 조치 및 공식 답변문서 연계를 확인함.",
  keywords: "제주시, 공영주차장, 민원관리, 처리기한, 반복민원, 개인정보 비식별",
  documentOverrides: {
    briefRows: complaintReportBriefRows(model),
    summaryRows: complaintReportSummaryRows(model),
    footerLabel: "민원관리",
    flowDetailTablesAcrossPages: true,
  },
});

const validation = await validateOperationsHwpx(hwpx, "민원관리");
if (!validation.valid || validation.textLength < 1_000) {
  throw new Error(`HWPX 패키지 검증 실패: ${JSON.stringify(validation)}`);
}

const reader = new HwpxReader();
await reader.loadFromArrayBuffer(await hwpx.arrayBuffer());
const extractedText = await reader.extractText();
const requiredText = [
  "기한 초과",
  "처리 타임라인",
  "반복민원",
  "재발방지",
  "공식 답변문서",
  "제주시청-차량관리과운영팀-2026-2101",
  "제주시청-차량관리과운영팀-2026-2105",
  "[전화번호 비공개]",
  "[차량번호 비공개]",
];
const missingText = requiredText.filter(value => !extractedText.includes(value));
if (missingText.length) {
  throw new Error(`HWPX 필수 본문 검증 실패: ${missingText.join(", ")}`);
}
const forbiddenText = ["010-1234-5678", "12가3456"];
const leakedText = forbiddenText.filter(value => extractedText.includes(value));
if (leakedText.length) {
  throw new Error(`개인정보 비식별 실패: ${leakedText.join(", ")}`);
}

const outputDirectory = resolve("work", "verification");
await mkdir(outputDirectory, { recursive: true });
const hwpxPath = resolve(outputDirectory, "complaint-report-integrated.hwpx");
await writeFile(hwpxPath, Buffer.from(await hwpx.arrayBuffer()));
const hwpxFile = await stat(hwpxPath);
if (!hwpxFile.isFile() || hwpxFile.size < 1_000) {
  throw new Error("HWPX 파일 저장 검증 실패");
}

let response: Response;
try {
  response = await fetch("http://127.0.0.1:43127/convert", {
    method: "POST",
    headers: { "Content-Type": "application/hwp+zip" },
    body: hwpx,
    signal: AbortSignal.timeout(120_000),
  });
} catch (error) {
  throw new Error(
    `한컴 PDF 변환 브리지에 연결할 수 없습니다. 먼저 npm run hancom:bridge를 실행하세요. (${String(error)})`,
    { cause: error },
  );
}
if (!response.ok) {
  const detail = (await response.json().catch(() => null))?.error;
  throw new Error(detail || `한컴 PDF 변환 실패: HTTP ${response.status}`);
}
const pdf = await response.arrayBuffer();
if (new TextDecoder("latin1").decode(pdf.slice(0, 5)) !== "%PDF-") {
  throw new Error("한컴 변환 결과가 PDF 형식이 아닙니다.");
}
const pdfPages = Number(response.headers.get("X-PDF-Page-Count"));
if (!Number.isInteger(pdfPages) || pdfPages < 1) {
  throw new Error(`PDF 페이지 수 검증 실패: ${pdfPages}`);
}
const pdfPath = resolve(outputDirectory, "complaint-report-integrated-hancom.pdf");
await writeFile(pdfPath, Buffer.from(pdf));
const pdfFile = await stat(pdfPath);
if (!pdfFile.isFile() || pdfFile.size < 1_000) {
  throw new Error("PDF 파일 저장 검증 실패");
}

process.stdout.write(JSON.stringify({
  hwpx: {
    path: hwpxPath,
    bytes: hwpxFile.size,
    validation,
    privacy: {
      protectedFields: model.protectedFieldCount,
      rawIdentifiersAbsent: true,
      redactionMarkersPresent: true,
    },
  },
  pdf: { path: pdfPath, bytes: pdfFile.size, pages: pdfPages, engine: "Hancom Office" },
  summary: model.summary,
  sourceCounts: model.sourceCounts,
  evidence: model.evidenceMetadata,
  tables: model.tables.map(table => ({
    id: table.id,
    title: table.title,
    subtitle: table.subtitle,
    columns: table.columns.length,
    rows: table.rows.length,
  })),
}, null, 2));
