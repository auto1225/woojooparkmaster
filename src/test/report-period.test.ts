import { describe, expect, it } from "vitest";
import { getDefaultReportParameters, getReportPeriod } from "@/lib/report-engine";

describe("report period date boundaries", () => {
  it("keeps the full last day of a month in Korea", () => {
    expect(getReportPeriod({ month: "2026-05" })).toEqual({
      start: "2026-05-01",
      end: "2026-05-31",
    });
  });

  it("keeps the full last day of a quarter in Korea", () => {
    expect(getReportPeriod({ quarter_year: "2026", quarter_q: "2" })).toEqual({
      start: "2026-04-01",
      end: "2026-06-30",
    });
  });

  it("uses local calendar dates for defaults", () => {
    expect(getDefaultReportParameters("daily", new Date(2026, 7, 3, 0, 10))).toEqual({ date: "2026-08-02" });
    expect(getDefaultReportParameters("monthly", new Date(2026, 7, 3, 0, 10))).toEqual({ month: "2026-07" });
  });
});
