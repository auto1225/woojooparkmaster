import { describe, expect, it } from "vitest";
import { formatFacilityRelativeDay } from "@/lib/facility-format";

describe("facility relative day formatting", () => {
  const baseDate = new Date("2026-08-02T10:00:00+09:00");

  it("distinguishes upcoming, due-today, and overdue dates", () => {
    expect(formatFacilityRelativeDay("2026-08-05", baseDate)).toBe("D-3");
    expect(formatFacilityRelativeDay("2026-08-02", baseDate)).toBe("D-day");
    expect(formatFacilityRelativeDay("2026-07-31", baseDate)).toBe("D+2");
  });

  it("keeps empty and invalid values readable", () => {
    expect(formatFacilityRelativeDay(null, baseDate)).toBe("-");
    expect(formatFacilityRelativeDay("invalid", baseDate)).toBe("invalid");
  });
});
