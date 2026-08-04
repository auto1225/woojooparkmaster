import { describe, expect, it } from "vitest";
import { TEAM_DUTIES } from "@/config/team-duty-catalog";

describe("vehicle management duty catalog", () => {
  it("covers both operating departments and all supplied duty contacts", () => {
    expect(new Set(TEAM_DUTIES.map((duty) => duty.team))).toEqual(new Set(["operations", "facilities"]));
    expect(TEAM_DUTIES).toHaveLength(12);
    expect(TEAM_DUTIES.reduce((sum, duty) => sum + duty.duties.length, 0)).toBe(51);
  });

  it("maps every responsibility to a working destination and record workflow", () => {
    TEAM_DUTIES.forEach((duty) => {
      expect(duty.phone).toMatch(/^064-728-\d{4}$/);
      expect(duty.destination).toMatch(/^\//);
      expect(duty.recordType).toBeTruthy();
      expect(duty.category).toBeTruthy();
      expect(duty.duties.length).toBeGreaterThan(0);
    });
  });
});
