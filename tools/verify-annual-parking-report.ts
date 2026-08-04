import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

const {
  buildAnnualParkingReportModel,
  createAnnualParkingHwpx,
  defaultAnnualParkingReportOptions,
  generateAnnualParkingTestDataset,
  validateAnnualParkingHwpx,
} = await import("../src/lib/annual-parking-report");

const options = defaultAnnualParkingReportOptions(2025);
const dataset = generateAnnualParkingTestDataset(undefined, 2024, 2025);
const model = buildAnnualParkingReportModel(dataset, options);
const hwpx = await createAnnualParkingHwpx({
  model,
  title: "2025년 제주시 공영주차장 현황 통합보고서",
  reportNumber: "RPT-2025-001",
  officialDocumentNumber: "제주시청-차량관리과운영팀-2025-0127",
  authorName: "차량관리과 운영팀 주무관",
  organizationName: "제주시청",
  disclosureStatus: "공개",
  documentSummary: "2025년 공영주차장 운영성과와 서비스·시설·안전 위험을 전년과 비교하고 차년도 조치계획을 수립함.",
});
const validation = await validateAnnualParkingHwpx(hwpx);
const outputDirectory = resolve("work", "verification");
await mkdir(outputDirectory, { recursive: true });
const hwpxPath = resolve(outputDirectory, "2025-jeju-parking-annual-integrated-report.hwpx");
const pdfPath = resolve(outputDirectory, "2025-jeju-parking-annual-integrated-report.pdf");
await writeFile(hwpxPath, Buffer.from(await hwpx.arrayBuffer()));

const response = await fetch("http://127.0.0.1:43127/convert", {
  method: "POST",
  headers: { "Content-Type": "application/hwp+zip" },
  body: hwpx,
});
if (!response.ok) {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  throw new Error(payload.error || `한컴 PDF 변환 실패 (${response.status})`);
}
const pdf = Buffer.from(await response.arrayBuffer());
if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("PDF 서명을 확인하지 못했습니다.");
await writeFile(pdfPath, pdf);

process.stdout.write(JSON.stringify({
  hwpxPath,
  pdfPath,
  hwpxBytes: hwpx.size,
  pdfBytes: pdf.length,
  pages: Number(response.headers.get("X-PDF-Page-Count")) || 0,
  baseline: { lots: model.current.lotCount, spaces: model.current.spaces },
  sourceCounts: model.sourceCounts,
  validation,
}));
