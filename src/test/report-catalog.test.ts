import { describe, expect, it } from "vitest";
import { getReportBuilderKind, reportGeneratePath } from "@/lib/report-catalog";

describe("report catalog routing", () => {
  it("routes the operations pilot through the central report builder", () => {
    expect(getReportBuilderKind("RPT-OPS-STATUS")).toBe("operations");
    expect(reportGeneratePath("RPT-OPS-STATUS")).toBe("/reports/generate?template=RPT-OPS-STATUS&scope=operations");
    expect(getReportBuilderKind("RPT-MONTHLY")).toBe("generic");
  });

  it("keeps generic templates in the shared builder and preserves copy source", () => {
    expect(getReportBuilderKind("RPT-FACILITY")).toBe("facility");
    expect(reportGeneratePath("RPT-FACILITY", "report-1")).toBe("/reports/generate?template=RPT-FACILITY&scope=facility&source=report-1");
  });

  it("routes the Jeju annual integrated report through its dedicated builder", () => {
    expect(getReportBuilderKind("RPT-JEJU-ANNUAL")).toBe("annual_parking");
    expect(reportGeneratePath("RPT-JEJU-ANNUAL")).toBe(
      "/reports/generate?template=RPT-JEJU-ANNUAL&scope=annual_parking",
    );
  });

  it("routes finance reports through dedicated builders", () => {
    expect(getReportBuilderKind("RPT-REVENUE")).toBe("revenue");
    expect(reportGeneratePath("RPT-REVENUE")).toBe("/reports/generate?template=RPT-REVENUE&scope=revenue");
    expect(getReportBuilderKind("RPT-BUDGET")).toBe("budget");
    expect(reportGeneratePath("RPT-BUDGET")).toBe("/reports/generate?template=RPT-BUDGET&scope=budget");
  });

  it("routes service reports through the dedicated builder", () => {
    expect(getReportBuilderKind("RPT-SERVICE")).toBe("service");
    expect(reportGeneratePath("RPT-SERVICE")).toBe("/reports/generate?template=RPT-SERVICE&scope=service");
    expect(getReportBuilderKind("RPT-PROCUREMENT")).toBe("procurement");
    expect(reportGeneratePath("RPT-PROCUREMENT")).toBe("/reports/generate?template=RPT-PROCUREMENT&scope=procurement");
  });

  it("routes complaint reports through the privacy-aware builder", () => {
    expect(getReportBuilderKind("RPT-COMPLAINT")).toBe("complaint");
    expect(reportGeneratePath("RPT-COMPLAINT")).toBe("/reports/generate?template=RPT-COMPLAINT&scope=complaint");
  });

  it("routes survey reports through the evidence-aware builder", () => {
    expect(getReportBuilderKind("RPT-SURVEY")).toBe("survey");
    expect(reportGeneratePath("RPT-SURVEY")).toBe("/reports/generate?template=RPT-SURVEY&scope=survey");
  });

  it("routes planning reports through the decision-support builder", () => {
    expect(getReportBuilderKind("RPT-PLANNING")).toBe("planning");
    expect(reportGeneratePath("RPT-PLANNING")).toBe("/reports/generate?template=RPT-PLANNING&scope=planning");
  });

  it("routes realtime reports through the device-health builder", () => {
    expect(getReportBuilderKind("RPT-REALTIME")).toBe("realtime");
    expect(reportGeneratePath("RPT-REALTIME")).toBe("/reports/generate?template=RPT-REALTIME&scope=realtime");
  });

  it("restores an operations report through its saved scope during template migration", () => {
    expect(reportGeneratePath("RPT-MONTHLY", "report-1", "operations")).toBe(
      "/reports/generate?template=RPT-OPS-STATUS&scope=operations&source=report-1",
    );
  });
});
