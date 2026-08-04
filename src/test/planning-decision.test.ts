import { describe, expect, it } from "vitest";
import { getSiteGrade, getSiteGradeColor, normalizeSiteScore } from "@/types/planning";

describe("planning decision scoring", () => {
  it("normalizes legacy five-category totals to a 100 point scale", () => {
    expect(normalizeSiteScore(458)).toBeCloseTo(91.6);
    expect(normalizeSiteScore(342)).toBeCloseTo(68.4);
  });

  it("preserves scores already stored on a 100 point scale", () => {
    expect(normalizeSiteScore(78)).toBe(78);
  });

  it("assigns grades using the normalized score", () => {
    expect(getSiteGrade(458)).toBe("A(우수)");
    expect(getSiteGrade(342)).toBe("B(양호)");
    expect(getSiteGradeColor(342)).toContain("blue");
  });
});
