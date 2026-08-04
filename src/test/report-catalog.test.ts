import { describe, expect, it } from "vitest";
import { getReportBuilderKind, reportGeneratePath } from "@/lib/report-catalog";

describe("report catalog routing", () => {
  it("routes the operations pilot through the central report builder", () => {
    expect(getReportBuilderKind("RPT-OPS-STATUS")).toBe("operations");
    expect(reportGeneratePath("RPT-OPS-STATUS")).toBe("/reports/generate?template=RPT-OPS-STATUS&scope=operations");
    expect(getReportBuilderKind("RPT-MONTHLY")).toBe("generic");
  });

  it("keeps generic templates in the shared builder and preserves copy source", () => {
    expect(getReportBuilderKind("RPT-FACILITY")).toBe("generic");
    expect(reportGeneratePath("RPT-FACILITY", "report-1")).toBe("/reports/generate?template=RPT-FACILITY&source=report-1");
  });

  it("routes the Jeju annual integrated report through its dedicated builder", () => {
    expect(getReportBuilderKind("RPT-JEJU-ANNUAL")).toBe("annual_parking");
    expect(reportGeneratePath("RPT-JEJU-ANNUAL")).toBe(
      "/reports/generate?template=RPT-JEJU-ANNUAL&scope=annual_parking",
    );
  });

  it("restores an operations report through its saved scope during template migration", () => {
    expect(reportGeneratePath("RPT-MONTHLY", "report-1", "operations")).toBe(
      "/reports/generate?template=RPT-OPS-STATUS&scope=operations&source=report-1",
    );
  });
});
