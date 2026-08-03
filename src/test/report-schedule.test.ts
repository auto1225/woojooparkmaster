import { describe, expect, it } from "vitest";
import { calculateNextReportRun } from "@/lib/report-schedule";

describe("calculateNextReportRun", () => {
  it("moves an elapsed daily schedule to the next day", () => {
    const result = calculateNextReportRun({ frequency: "daily", executionTime: "06:00" }, new Date("2026-08-03T09:00:00+09:00"));
    expect(result.toISOString()).toBe("2026-08-03T21:00:00.000Z");
  });

  it("keeps quarterly schedules on the configured month cycle", () => {
    const result = calculateNextReportRun({ frequency: "quarterly", executionTime: "06:00", dayOfMonth: 10, monthOfYear: 2 }, new Date("2026-08-03T09:00:00+09:00"));
    expect(result.toISOString()).toBe("2026-08-09T21:00:00.000Z");
  });

  it("rolls an elapsed annual schedule to the next year", () => {
    const result = calculateNextReportRun({ frequency: "yearly", executionTime: "06:00", dayOfMonth: 1, monthOfYear: 1 }, new Date("2026-08-03T09:00:00+09:00"));
    expect(result.toISOString()).toBe("2026-12-31T21:00:00.000Z");
  });
});
