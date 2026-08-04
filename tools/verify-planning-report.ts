import { execFile } from "node:child_process";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import { createServer } from "vite";
import type { PlanningReportDataset } from "../src/lib/planning-report";

const execFileAsync = promisify(execFile);
const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });

try {
  const {
    PLANNING_REPORT_SAMPLE_DATASET,
    PLANNING_REPORT_SECTIONS,
    buildPlanningReportModel,
    defaultPlanningReportFields,
    parsePlanningReportOptions,
    planningReportBriefRows,
    planningReportSummaryRows,
    toOperationsCompatiblePlanningModel,
  } = await vite.ssrLoadModule("/src/lib/planning-report.ts");
  const { createOperationsHwpx, validateOperationsHwpx } = await vite.ssrLoadModule("/src/lib/operations-report.ts");

  const dataset: PlanningReportDataset = structuredClone(PLANNING_REPORT_SAMPLE_DATASET);
  const options = parsePlanningReportOptions({
    period_start: "2026-01-01",
    period_end: "2026-08-31",
    report_scope: "planning",
    planning_sections: PLANNING_REPORT_SECTIONS.map((section: { id: string }) => section.id).join(","),
    planning_fields: JSON.stringify(defaultPlanningReportFields()),
    planning_lot_types: "offstreet,building,onstreet",
    planning_sort: "attention",
    planning_orientation: "landscape",
    planning_include_completed: "true",
  });
  const model = buildPlanningReportModel(dataset, options);

  const expectedSummary: Partial<typeof model.summary> = {
    sites: 3,
    selectedSites: 2,
    acquisitionSites: 1,
    expectedSpaces: 317,
    estimatedLandCost: 3_200_000_000,
    estimatedConstructionCost: 10_900_000_000,
    projects: 3,
    activeProjects: 3,
    totalBudget: 14_100_000_000,
    spent: 3_860_000_000,
    remaining: 10_240_000_000,
    procedures: 8,
    propertyProcedures: 2,
    overdueProcedures: 4,
    permits: 4,
    pendingPermits: 2,
    riskCount: 15,
    linkedDocuments: 10,
    missingDocuments: 7,
  };
  for (const [key, expected] of Object.entries(expectedSummary)) {
    const actual = model.summary[key];
    if (actual !== expected) throw new Error(`신설기획 보고서 검증값 불일치: ${key}=${actual}, expected=${expected}`);
  }
  if (Math.abs(model.summary.averageScore - 77.6) > 0.0001) {
    throw new Error(`후보지 평균점수 검증 실패: ${model.summary.averageScore}`);
  }
  if (model.lotTypeLabels.join(",") !== "노외주차장,주차빌딩,노상주차장") {
    throw new Error(`주차장 형태 검증 실패: ${model.lotTypeLabels.join(",")}`);
  }
  for (const [source, evidence] of Object.entries(model.evidenceMetadata.sources)) {
    if (!(evidence as { complete: boolean }).complete
      || (evidence as { expected: number }).expected !== (evidence as { loaded: number }).loaded) {
      throw new Error(`원천자료 완전성 검증 실패: ${source}`);
    }
  }

  const requiredTableIds = [
    "candidates", "feasibility", "acquisition", "property", "procedures",
    "projects", "budget", "progress", "risks", "documents",
  ];
  for (const id of requiredTableIds) {
    if (!model.tables.some((table: { id: string }) => table.id === id)) throw new Error(`신설기획 보고서 필수 표 누락: ${id}`);
  }
  const reportText = model.tables.flatMap((table: any) => [
    table.title,
    ...table.columns.map((column: { label: string }) => column.label),
    ...table.rows.flatMap((row: Record<string, string>) => Object.values(row)),
  ]).join("\n");
  const modelTokens = [
    "노외주차장", "주차빌딩", "노상주차장",
    "후보지 현황", "타당성 검토", "부지매입·취득", "공유재산 절차", "사전절차·인허가",
    "예산·사업비", "공정·단계게이트", "위험·보완사항", "공식 문서번호",
    "동문시장 인근 후보지", "B/C 0.82", "제주시청-차량관리과시설팀-2026-1001",
  ];
  for (const token of modelTokens) {
    if (!reportText.includes(token)) throw new Error(`신설기획 모델 필수 내용 누락: ${token}`);
  }

  const reportTitle = "2026년 제주시 공영주차장 신설기획 통합 현황 보고서";
  const officialDocumentNumber = "제주시청-차량관리과시설팀-2026-1500";
  const hwpx = await createOperationsHwpx({
    model: toOperationsCompatiblePlanningModel(model),
    title: reportTitle,
    reportNumber: "RPT-PLN-202608-001",
    orientation: options.orientation,
    officialDocumentNumber,
    authorName: "신설기획 담당 주무관",
    organizationName: "제주시청",
    disclosureStatus: "부분공개",
    disclosureBasis: "부지 소유자 정보 등 개인정보는 내부 업무용으로 제한",
    documentSummary: "공영주차장 신설·확충 후보지의 타당성, 부지취득, 공유재산과 사전절차, 사업계획, 예산, 공정, 위험 및 공식 문서번호를 통합 점검함.",
    keywords: "제주시, 공영주차장, 신설기획, 후보지, 타당성, 공유재산, 사전절차",
    documentOverrides: {
      briefRows: planningReportBriefRows(model),
      summaryRows: planningReportSummaryRows(model),
      footerLabel: "신설기획",
      flowDetailTablesAcrossPages: true,
    },
  });
  const validation = await validateOperationsHwpx(hwpx, "신설기획");
  if (!validation.valid || validation.textLength < 3_000) {
    throw new Error(`HWPX 본문 검증 실패: ${JSON.stringify(validation)}`);
  }

  const zip = await JSZip.loadAsync(await hwpx.arrayBuffer());
  const packageFiles = Object.keys(zip.files);
  for (const fileName of ["mimetype", "version.xml", "Contents/content.hpf", "Contents/section0.xml"]) {
    if (!zip.file(fileName)) throw new Error(`HWPX 필수 패키지 파일 누락: ${fileName}`);
  }
  const mimeType = await zip.file("mimetype")!.async("string");
  if (mimeType.trim() !== "application/hwp+zip") throw new Error(`HWPX MIME 선언 오류: ${mimeType}`);
  const sectionXml = (await Promise.all(
    packageFiles.filter((name) => /^Contents\/section\d+\.xml$/.test(name)).map((name) => zip.file(name)!.async("string")),
  )).join("\n");
  const hwpxTokens = [reportTitle, officialDocumentNumber, ...modelTokens];
  for (const token of hwpxTokens) {
    if (!sectionXml.includes(token)) throw new Error(`HWPX 본문 필수 토큰 누락: ${token}`);
  }

  const outputDirectory = resolve("work", "verification");
  await mkdir(outputDirectory, { recursive: true });
  const hwpxPath = resolve(outputDirectory, "planning-report-integrated.hwpx");
  await writeFile(hwpxPath, Buffer.from(await hwpx.arrayBuffer()));
  const hwpxFile = await stat(hwpxPath);
  if (!hwpxFile.isFile() || hwpxFile.size < 10_000) throw new Error(`HWPX 저장 검증 실패: ${hwpxFile.size} bytes`);

  const healthResponse = await fetch("http://127.0.0.1:43127/health", { signal: AbortSignal.timeout(5_000) });
  if (!healthResponse.ok) throw new Error(`한컴 변환 브리지 상태 확인 실패: HTTP ${healthResponse.status}`);
  const bridge = await healthResponse.json() as { available?: boolean; engine?: string; canonical?: string };
  if (!bridge.available || bridge.engine !== "Hancom Office" || bridge.canonical !== "HWPX") {
    throw new Error(`한컴 엔진 검증 실패: ${JSON.stringify(bridge)}`);
  }
  const response = await fetch("http://127.0.0.1:43127/convert", {
    method: "POST",
    headers: { "Content-Type": "application/hwp+zip" },
    body: hwpx,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(detail?.error || `한컴 PDF 변환 실패: HTTP ${response.status}`);
  }
  const pdfBytes = Buffer.from(await response.arrayBuffer());
  if (pdfBytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("한컴 변환 결과가 PDF가 아닙니다.");
  const bridgePageCount = Number(response.headers.get("X-PDF-Page-Count"));
  if (!Number.isInteger(bridgePageCount) || bridgePageCount < 1) throw new Error(`PDF 페이지 수 검증 실패: ${bridgePageCount}`);
  const pdfPath = resolve(outputDirectory, "planning-report-integrated-hancom.pdf");
  await writeFile(pdfPath, pdfBytes);
  const pdfFile = await stat(pdfPath);
  if (!pdfFile.isFile() || pdfFile.size < 10_000) throw new Error(`PDF 저장 검증 실패: ${pdfFile.size} bytes`);

  const popplerBinary = async (name: "pdfinfo" | "pdftoppm") => {
    const candidate = join(
      homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies",
      "native", "poppler", "Library", "bin", `${name}.exe`,
    );
    await access(candidate);
    return candidate;
  };
  const pdfInfoPath = await popplerBinary("pdfinfo");
  const { stdout: pdfInfoOutput } = await execFileAsync(pdfInfoPath, [pdfPath], { encoding: "utf8" });
  const pdfInfoPages = Number(/^Pages:\s+(\d+)$/m.exec(pdfInfoOutput)?.[1]);
  const pageSizeMatch = /^Page size:\s+([\d.]+) x ([\d.]+) pts(?: \(([^)]+)\))?$/m.exec(pdfInfoOutput);
  if (!Number.isInteger(pdfInfoPages) || pdfInfoPages !== bridgePageCount) {
    throw new Error(`PDF 페이지 수 교차검증 실패: bridge=${bridgePageCount}, pdfinfo=${pdfInfoPages}`);
  }
  if (!pageSizeMatch) throw new Error("PDF 용지 크기를 확인하지 못했습니다.");
  const pageWidthPt = Number(pageSizeMatch[1]);
  const pageHeightPt = Number(pageSizeMatch[2]);
  if (Math.abs(pageWidthPt - 841.89) > 3 || Math.abs(pageHeightPt - 595.28) > 3) {
    throw new Error(`PDF가 A4 가로 규격이 아닙니다: ${pageWidthPt} x ${pageHeightPt} pt`);
  }

  const previewPrefix = resolve(outputDirectory, "planning-report-integrated-preview-1");
  const previewPath = `${previewPrefix}.png`;
  await execFileAsync(await popplerBinary("pdftoppm"), ["-f", "1", "-singlefile", "-png", "-r", "120", pdfPath, previewPrefix]);
  const previewFile = await stat(previewPath);
  if (!previewFile.isFile() || previewFile.size < 10_000) throw new Error("PDF 첫 페이지 렌더링 검증 실패");

  process.stdout.write(JSON.stringify({
    bridge,
    hwpx: {
      path: hwpxPath,
      bytes: hwpxFile.size,
      valid: validation.valid,
      textLength: validation.textLength,
      packageFiles: packageFiles.length,
      verifiedTokens: hwpxTokens.length,
    },
    pdf: {
      path: pdfPath,
      bytes: pdfFile.size,
      pages: pdfInfoPages,
      pageSizePt: { width: pageWidthPt, height: pageHeightPt },
      pageSizeName: pageSizeMatch[3] || null,
    },
    preview: { path: previewPath, bytes: previewFile.size },
    lotTypes: model.lotTypeLabels,
    summary: model.summary,
    sourceCounts: model.sourceCounts,
    riskNarrative: model.riskNarrative,
    tables: model.tables.map((table: any) => ({
      id: table.id,
      title: table.title,
      columns: table.columns.length,
      rows: table.rows.length,
      continuation: Boolean(table.continuation),
    })),
  }, null, 2));
} finally {
  await vite.close();
}
