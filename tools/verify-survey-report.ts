import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { HwpxReader } from "hwp-convert";
import { createServer } from "vite";

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const {
    SURVEY_REPORT_SAMPLE_DATASET,
    SURVEY_REPORT_SECTIONS,
    buildSurveyReportModel,
    defaultSurveyReportFields,
    parseSurveyReportOptions,
    surveyReportBriefRows,
    surveyReportSummaryRows,
    toOperationsCompatibleSurveyModel,
  } = await vite.ssrLoadModule("/src/lib/survey-report.ts");
  const { createOperationsHwpx, validateOperationsHwpx } = await vite.ssrLoadModule("/src/lib/operations-report.ts");

  const options = parseSurveyReportOptions({
    period_start: "2026-07-01",
    period_end: "2026-08-31",
    survey_as_of_date: "2026-08-31",
    report_scope: "survey",
    survey_sections: SURVEY_REPORT_SECTIONS.map((section: { id: string }) => section.id).join(","),
    survey_fields: JSON.stringify(defaultSurveyReportFields()),
    survey_lot_types: "offstreet,building,onstreet",
    survey_sort: "attention",
    survey_orientation: "landscape",
  });
  const model = buildSurveyReportModel(SURVEY_REPORT_SAMPLE_DATASET, options);

  const expectedSummary: Record<string, number> = {
    parkingLots: 3,
    surveys: 4,
    inProgress: 1,
    review: 1,
    approved: 1,
    rejected: 1,
    offstreetSurveys: 2,
    buildingSurveys: 1,
    onstreetSurveys: 1,
    totalSpaces: 478,
    completeRecords: 2,
    installedSensors: 280,
    plannedSensors: 128,
    plannedGateways: 7,
    photos: 7,
    missingTypePhotos: 2,
    linkedDocuments: 2,
    surveysMissingDocuments: 2,
    riskCount: 5,
  };
  for (const [key, expected] of Object.entries(expectedSummary)) {
    const actual = model.summary[key];
    if (actual !== expected) throw new Error(`현황조사 보고서 검증값 불일치: ${key}=${actual}, expected=${expected}`);
  }
  if (model.summary.completionRate !== 50) throw new Error(`현황조사 완성도 검증값 불일치: ${model.summary.completionRate}`);
  if (model.protectedFieldCount !== 0) throw new Error(`보호항목 최소화 실패: ${model.protectedFieldCount}개가 기본 출력에 포함되었습니다.`);
  if (!model.evidenceMetadata.complete || model.evidenceMetadata.truncationPolicy !== "fail") {
    throw new Error("현황조사 증거 메타데이터의 완전성 또는 절단 정책이 올바르지 않습니다.");
  }
  if (!Object.values(model.evidenceMetadata.sources).every((source: any) => source.complete && source.loaded === source.expected)) {
    throw new Error("현황조사 원천 테이블 중 완전 조회되지 않은 자료가 있습니다.");
  }
  const expectedTableIds = ["workflow", "lot_types", "basic", "infra", "operation", "usage", "sensor_plan", "photos", "documents", "risks"];
  for (const id of expectedTableIds) {
    if (!model.tables.some((table: { id: string }) => table.id === id)) throw new Error(`현황조사 필수 표 누락: ${id}`);
  }

  const hwpx = await createOperationsHwpx({
    model: toOperationsCompatibleSurveyModel(model),
    title: "2026년 7~8월 제주시 공영주차장 현황조사 종합 보고서",
    reportNumber: "RPT-SUR-202608-001",
    orientation: options.orientation,
    officialDocumentNumber: "제주시청-차량관리과운영팀-2026-0700",
    authorName: "현황조사 담당 주무관",
    organizationName: "제주시청",
    disclosureStatus: "공개",
    documentSummary: "노외주차장·주차빌딩·노상주차장의 기본시설, 운영, 이용, 인프라와 센서 설치계획을 조사하고 검토·승인, 사진 증빙 및 공식 문서번호의 완전성을 확인함.",
    keywords: "제주시, 공영주차장, 현황조사, 사진증빙, 센서계획, 검토승인",
    documentOverrides: {
      briefRows: surveyReportBriefRows(model),
      summaryRows: surveyReportSummaryRows(model),
      footerLabel: "현황조사",
      flowDetailTablesAcrossPages: true,
    },
  });

  const validation = await validateOperationsHwpx(hwpx, "현황조사");
  if (!validation.valid || validation.textLength < 2_000) {
    throw new Error(`HWPX 패키지 검증 실패: ${JSON.stringify(validation)}`);
  }

  const reader = new HwpxReader();
  await reader.loadFromArrayBuffer(await hwpx.arrayBuffer());
  const extractedText = await reader.extractText();
  const requiredText = [
    "노외주차장",
    "주차빌딩",
    "노상주차장",
    "사진 증빙",
    "센서 설치계획",
    "검토중",
    "승인",
    "공식 문서번호",
    "제주시청-차량관리과운영팀-2026-0701",
    "제주시청-차량관리과운영팀-2026-0702",
  ];
  const missingText = requiredText.filter(value => !extractedText.includes(value));
  if (missingText.length) throw new Error(`HWPX 필수 본문 검증 실패: ${missingText.join(", ")}`);

  const outputDirectory = resolve("work", "verification");
  await mkdir(outputDirectory, { recursive: true });
  const hwpxPath = resolve(outputDirectory, "survey-report-integrated.hwpx");
  await writeFile(hwpxPath, Buffer.from(await hwpx.arrayBuffer()));
  const hwpxFile = await stat(hwpxPath);
  if (!hwpxFile.isFile() || hwpxFile.size < 1_000) throw new Error("HWPX 파일 저장 검증 실패");

  let response: Response;
  try {
    response = await fetch("http://127.0.0.1:43127/convert", {
      method: "POST",
      headers: { "Content-Type": "application/hwp+zip" },
      body: hwpx,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    throw new Error(`한컴 PDF 변환 브리지에 연결할 수 없습니다. 먼저 npm run hancom:bridge를 실행하세요. (${String(error)})`, { cause: error });
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null))?.error;
    throw new Error(detail || `한컴 PDF 변환 실패: HTTP ${response.status}`);
  }
  const pdf = await response.arrayBuffer();
  if (new TextDecoder("latin1").decode(pdf.slice(0, 5)) !== "%PDF-") throw new Error("한컴 변환 결과가 PDF 형식이 아닙니다.");
  const pdfPages = Number(response.headers.get("X-PDF-Page-Count"));
  if (!Number.isInteger(pdfPages) || pdfPages < 1) throw new Error(`PDF 페이지 수 검증 실패: ${pdfPages}`);
  const pdfPath = resolve(outputDirectory, "survey-report-integrated-hancom.pdf");
  await writeFile(pdfPath, Buffer.from(pdf));
  const pdfFile = await stat(pdfPath);
  if (!pdfFile.isFile() || pdfFile.size < 1_000) throw new Error("PDF 파일 저장 검증 실패");

  process.stdout.write(JSON.stringify({
    hwpx: { path: hwpxPath, bytes: hwpxFile.size, validation, requiredTokens: requiredText, tokensVerified: true },
    pdf: { path: pdfPath, bytes: pdfFile.size, pages: pdfPages, engine: "Hancom Office" },
    lotTypes: model.lotTypeLabels,
    summary: model.summary,
    sourceCounts: model.sourceCounts,
    evidence: model.evidenceMetadata,
    tables: model.tables.map((table: any) => ({ id: table.id, title: table.title, subtitle: table.subtitle, columns: table.columns.length, rows: table.rows.length })),
  }, null, 2));
} finally {
  await vite.close();
}
