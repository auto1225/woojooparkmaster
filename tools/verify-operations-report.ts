import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
import type { OperationsReportDataset } from "../src/lib/operations-report";

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};
const { buildOperationsReportModel, createOperationsHwpx, createOperationsPdf, parseOperationsReportOptions, validateOperationsHwpx } = await import("../src/lib/operations-report");

const dataset: OperationsReportDataset = {
  parkingLots: [
    { code: "JJP-001", name: "동문공설주차장", lot_type: "offstreet", operator_type: "직영", total_spaces: 120, status: "active" },
    { code: "JJP-002", name: "칠성골주차빌딩", lot_type: "building", operator_type: "위탁", total_spaces: 240, status: "active" },
    { code: "JJP-003", name: "중앙로 노상주차장", lot_type: "onstreet", operator_type: "직영", total_spaces: 48, status: "active" },
  ],
  contracts: [{ company_name: "제주주차서비스", contract_number: "OPS-2026-01", contract_start: "2026-01-01", contract_end: "2026-12-31", contract_amount: 120000000, status: "active", parking_lots: { name: "칠성골주차빌딩", lot_type: "building" } }],
  staff: [], fees: [], exemptions: [],
  passes: [{ pass_number: "PASS-2026-081", pass_start: "2026-08-01", pass_end: "2026-08-31", fee_amount: 100000, fee_paid: 100000, status: "active", parking_lots: { name: "동문공설주차장", lot_type: "offstreet" } }],
  enforcement: [{ enforcement_number: "ENF-2026-0801", violation_date: "2026-08-02T10:00:00", violation_type: "주차구획 위반", fine_amount: 40000, fine_due_date: "2026-08-31", payment_status: "unpaid", document_number: "제주시청-차량관리과운영팀-2026-0142", parking_lots: { name: "중앙로 노상주차장", lot_type: "onstreet" } }],
  freeHours: [], abandoned: [], security: [],
};

const options = parseOperationsReportOptions({
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  ops_sections: "overview,lots,contracts,passes,enforcement",
  ops_lot_types: "offstreet,building,onstreet",
  ops_sort: "parking_lot",
});
const model = buildOperationsReportModel(dataset, options);
const commonInput = {
  model,
  title: "2026년 8월 공영주차장 운영관리 종합 현황 보고서",
  reportNumber: "RPT-OPS-202608-001",
  officialDocumentNumber: "제주시청-차량관리과운영팀-2026-0142",
  authorName: "운영팀 주무관",
  organizationName: "제주시청",
  disclosureStatus: "공개",
  documentSummary: "2026년 8월 공영주차장 운영 현황과 미납 단속 조치대상을 종합함.",
  keywords: "제주시, 공영주차장, 운영관리, 단속",
};
const portraitBlob = await createOperationsHwpx({ ...commonInput, orientation: "portrait" });
const landscapeBlob = await createOperationsHwpx({ ...commonInput, orientation: "landscape" });
const [portraitValidation, landscapeValidation] = await Promise.all([
  validateOperationsHwpx(portraitBlob),
  validateOperationsHwpx(landscapeBlob),
]);
const outputDirectory = resolve("work", "verification");
const outputPath = resolve(outputDirectory, "operations-report-sample.hwpx");
const landscapeOutputPath = resolve(outputDirectory, "operations-report-landscape.hwpx");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, Buffer.from(await portraitBlob.arrayBuffer()));
await writeFile(landscapeOutputPath, Buffer.from(await landscapeBlob.arrayBuffer()));

const readOrientation = async (blob: Blob) => {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const sectionPath = Object.keys(zip.files).find(path => /^Contents\/section\d+\.xml$/i.test(path));
  const xml = sectionPath ? await zip.file(sectionPath)?.async("text") : "";
  const match = xml?.match(/landscape="([A-Z]+)"/);
  return match?.[1] === "NARROWLY" ? "landscape" : "portrait";
};

const fontBytes = await readFile(resolve("public", "fonts", "NanumGothic-Regular.ttf"));
(globalThis as any).fetch = async () => new Response(fontBytes, { status: 200 });
const [portraitPdf, landscapePdf] = await Promise.all([
  createOperationsPdf({ ...commonInput, orientation: "portrait" }),
  createOperationsPdf({ ...commonInput, orientation: "landscape" }),
]);
const portraitPdfPath = resolve(outputDirectory, "operations-report-portrait.pdf");
const landscapePdfPath = resolve(outputDirectory, "operations-report-landscape.pdf");
await writeFile(portraitPdfPath, Buffer.from(await portraitPdf.blob.arrayBuffer()));
await writeFile(landscapePdfPath, Buffer.from(await landscapePdf.blob.arrayBuffer()));

const stressDataset: OperationsReportDataset = {
  ...dataset,
  parkingLots: Array.from({ length: 116 }, (_, index) => ({
    code: `JJP-${String(index + 1).padStart(3, "0")}`,
    name: `검증 공영주차장 ${String(index + 1).padStart(3, "0")}`,
    lot_type: ["offstreet", "building", "onstreet"][index % 3],
    operator_type: index % 4 === 0 ? "위탁" : "직영",
    total_spaces: 20 + (index % 180),
    status: "active",
  })),
  contracts: [],
  passes: [],
  enforcement: [],
};
const stressOptions = parseOperationsReportOptions({
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  ops_sections: "overview,lots",
  ops_fields: JSON.stringify({ lots: ["code", "name", "lot_type", "operator_type", "operator_name", "total_spaces", "floors", "status", "document_number", "updated_at"] }),
  ops_lot_types: "offstreet,building,onstreet",
  ops_sort: "parking_lot",
});
const stressPdf = await createOperationsPdf({
  ...commonInput,
  model: buildOperationsReportModel(stressDataset, stressOptions),
  title: "공영주차장 116개소 운영 현황 편집 검증 보고서",
  orientation: "portrait",
});
const stressPdfPath = resolve(outputDirectory, "operations-report-116-lots.pdf");
await writeFile(stressPdfPath, Buffer.from(await stressPdf.blob.arrayBuffer()));
const stressHwpx = await createOperationsHwpx({
  ...commonInput,
  model: buildOperationsReportModel(stressDataset, stressOptions),
  title: "공영주차장 116개소 운영 현황 편집 검증 보고서",
  orientation: "portrait",
});
const stressHwpxPath = resolve(outputDirectory, "operations-report-116-lots-paginated.hwpx");
await writeFile(stressHwpxPath, Buffer.from(await stressHwpx.arrayBuffer()));
const stressHwpxValidation = await validateOperationsHwpx(stressHwpx);
const stressArchive = await JSZip.loadAsync(await stressHwpx.arrayBuffer());
const stressHeader = await stressArchive.file("Contents/header.xml")?.async("string") || "";
const stressSection = (await Promise.all(
  Object.keys(stressArchive.files)
    .filter(path => /^Contents\/section\d+\.xml$/.test(path))
    .map(path => stressArchive.file(path)!.async("string")),
)).join("\n");
const stressDetailTables = [...stressSection.matchAll(/<hp:tbl\b[^>]*colCnt="10"[\s\S]*?<\/hp:tbl>/g)].map(match => match[0]);
const stressTableStructure = stressDetailTables.map(table => {
  const width = Number(table.match(/<hp:sz\b[^>]*width="(\d+)"/)?.[1] || 0);
  const columnHeaderRow = (table.match(/<hp:tr\b[\s\S]*?<\/hp:tr>/g) || [])[0] || "";
  const columns = [...columnHeaderRow.matchAll(/<hp:cellSz\b[^>]*width="(\d+)"/g)]
    .map(match => Number(match[1]));
  return {
    rows: Number(table.match(/\browCnt="(\d+)"/)?.[1] || 0),
    height: Number(table.match(/<hp:sz\b[^>]*height="(\d+)"/)?.[1] || 0),
    width,
    columnWidth: columns.reduce((sum, column) => sum + column, 0),
  };
});

process.stdout.write(JSON.stringify({
  portrait: { outputPath, bytes: portraitBlob.size, orientation: await readOrientation(portraitBlob), ...portraitValidation, pdfPath: portraitPdfPath, pdfBytes: portraitPdf.blob.size, pages: portraitPdf.pageCount },
  landscape: { outputPath: landscapeOutputPath, bytes: landscapeBlob.size, orientation: await readOrientation(landscapeBlob), ...landscapeValidation, pdfPath: landscapePdfPath, pdfBytes: landscapePdf.blob.size, pages: landscapePdf.pageCount },
  stress: {
    pdfPath: stressPdfPath,
    pdfBytes: stressPdf.blob.size,
    pages: stressPdf.pageCount,
    hwpxPath: stressHwpxPath,
    hwpxBytes: stressHwpx.size,
    structure: {
      tableCount: stressDetailTables.length,
      tables: stressTableStructure,
      continuationCount: (stressSection.match(/계속 \d+\/\d+/g) || []).length,
      firstEmptyLineHidden: stressSection.includes('hideFirstEmptyLine="1"'),
      firstDetailStartsPage: /<hp:p\b[^>]*pageBreak="1"[\s\S]*?<hp:t>2\. 주차장 운영<\/hp:t>/.test(stressSection),
      sectionLineSpacing150: /<hh:lineSpacing\b[^>]*value="150"/.test(stressHeader),
    },
    ...stressHwpxValidation,
  },
}));
