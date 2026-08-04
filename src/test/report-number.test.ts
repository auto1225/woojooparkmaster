import { describe, expect, it } from "vitest";
import { nextAnnualReportNumber } from "@/lib/report-number";

describe("nextAnnualReportNumber", () => {
  it("starts each year with a short four-digit sequence", () => {
    expect(nextAnnualReportNumber([], 2026)).toBe("RPT-2026-0001");
  });

  it("increments the highest matching annual sequence", () => {
    expect(nextAnnualReportNumber([
      "RPT-2026-0002",
      "RPT-2026-0010",
      "RPT-2025-9999",
      "RPT-20260804014440-25475",
      "RG-DEMO-0001",
    ], 2026)).toBe("RPT-2026-0011");
  });

  it("continues beyond four digits without truncation", () => {
    expect(nextAnnualReportNumber(["RPT-2026-9999"], 2026)).toBe("RPT-2026-10000");
  });
});
