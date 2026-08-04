import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  buildAnnualParkingReportModel,
  createAnnualParkingHwpx,
  createAnnualParkingTestLots,
  defaultAnnualParkingReportOptions,
  generateAnnualParkingTestDataset,
  parseAnnualParkingReportOptions,
  validateAnnualParkingHwpx,
} from "@/lib/annual-parking-report";

describe("Jeju annual integrated parking report", () => {
  it("uses the verified 2025 Jeju parking baseline", () => {
    const lots = createAnnualParkingTestLots();
    expect(lots).toHaveLength(112);
    expect(lots.reduce((sum, lot) => sum + lot.spaces, 0)).toBe(6380);
    expect(lots.filter(lot => lot.lotType === "offstreet")).toHaveLength(87);
    expect(lots.filter(lot => lot.lotType === "building")).toHaveLength(25);
    expect(lots.filter(lot => lot.lotType === "onstreet")).toHaveLength(0);
  });

  it("creates a deterministic 24-month fixture with one fact per lot and month", () => {
    const first = generateAnnualParkingTestDataset();
    const second = generateAnnualParkingTestDataset();
    expect(first.monthlyMetrics).toHaveLength(112 * 24);
    expect(first.monthlyMetrics).toEqual(second.monthlyMetrics);
    expect(first.sourceLabel).toContain("[TEST:JEJU-ANNUAL-2025-v1]");
    expect(new Set(first.monthlyMetrics.map(row => `${row.year}-${row.month}`)).size).toBe(24);
  });

  it("builds comparisons, monthly trends, risks, analysis, and recommendations", () => {
    const model = buildAnnualParkingReportModel(generateAnnualParkingTestDataset(), defaultAnnualParkingReportOptions());
    expect(model.current.year).toBe(2025);
    expect(model.previous.year).toBe(2024);
    expect(model.current.lotCount).toBe(112);
    expect(model.current.spaces).toBe(6380);
    expect(model.monthlyTrend).toHaveLength(12);
    expect(model.typeSummary).toHaveLength(3);
    expect(model.riskLots).toHaveLength(12);
    expect(model.analysis.length).toBeGreaterThanOrEqual(5);
    expect(model.recommendations.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps mandatory sections when optional output items are cleared", () => {
    const options = parseAnnualParkingReportOptions({
      year: "2025",
      comparison_year: "2024",
      annual_sections: "monthly_trend",
      annual_orientation: "landscape",
    });
    expect(options.orientation).toBe("landscape");
    expect(options.selectedSections).toEqual(expect.arrayContaining(["overview", "comparison", "analysis", "monthly_trend"]));
  });

  it("creates an editable Malgun Gothic HWPX with the complete annual narrative", async () => {
    const model = buildAnnualParkingReportModel(generateAnnualParkingTestDataset(), defaultAnnualParkingReportOptions());
    const blob = await createAnnualParkingHwpx({
      model,
      title: "2025년 제주시 공영주차장 현황 통합보고서",
      reportNumber: "RPT-2025-001",
      authorName: "차량관리과 운영팀 주무관",
      organizationName: "제주시청",
      disclosureStatus: "공개",
    });
    const validation = await validateAnnualParkingHwpx(blob);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const header = await zip.file("Contents/header.xml")?.async("string");
    const body = (await Promise.all(Object.keys(zip.files)
      .filter(path => /^Contents\/section\d+\.xml$/.test(path))
      .map(path => zip.file(path)!.async("string")))).join("\n");
    expect(validation.valid).toBe(true);
    expect(header).toContain("맑은 고딕");
    expect(body).toContain("2025년 제주시 공영주차장 현황 통합보고서");
    expect(body).toContain("차년도 조치계획");
    expect(body).not.toContain("__PARKMASTER_PAGE_BREAK__");
  });
});
