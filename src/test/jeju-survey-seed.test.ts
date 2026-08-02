import { describe, expect, it } from "vitest";
import seedData from "../../supabase/seed_data/jeju_paid_parking_2025.json";

interface SeedLot {
  code: string;
  name: string;
  total_spaces: number;
  general_spaces: number;
  disabled_spaces: number;
  ev_spaces: number;
  compact_spaces: number;
  pregnant_spaces: number;
  other_spaces: number;
  sections: Record<string, Record<string, unknown>>;
}

const seed = seedData as unknown as {
  source: { source_sha256: string; source_page_count: number };
  validation: Record<string, unknown>;
  lots: SeedLot[];
};

const sum = (field: keyof SeedLot) => seed.lots.reduce((total, lot) => total + Number(lot[field]), 0);

describe("Jeju paid-parking survey seed", () => {
  it("is tied to the supplied report", () => {
    expect(seed.source.source_sha256).toBe("6898406b5411d78c6e7422b85fb7686e779420d5b3311ea2ea7acecfcc349b1f");
    expect(seed.source.source_page_count).toBe(84);
  });

  it("contains 112 unique canonical parking lots", () => {
    expect(seed.lots).toHaveLength(112);
    expect(new Set(seed.lots.map((lot) => lot.code)).size).toBe(112);
    expect(new Set(seed.lots.map((lot) => lot.name)).size).toBe(112);
    expect(seed.lots[0].code).toBe("JJP-001");
    expect(seed.lots[111].code).toBe("JJP-112");
  });

  it("matches the sum of all parking-space detail rows", () => {
    expect(sum("total_spaces")).toBe(6380);
    expect(sum("general_spaces")).toBe(5358);
    expect(sum("disabled_spaces")).toBe(287);
    expect(sum("ev_spaces")).toBe(161);
    expect(sum("compact_spaces")).toBe(510);
    expect(sum("pregnant_spaces")).toBe(10);
    expect(sum("other_spaces")).toBe(54);
  });

  it("preserves every detailed survey section and its PDF page", () => {
    const sectionNames = [
      "spaces", "lot_type", "surface", "hours", "staff", "integration", "display",
      "access", "sensor", "control_vendor", "utilization", "sensor_plan", "environment", "priority",
    ];
    for (const lot of seed.lots) {
      expect(Object.keys(lot.sections).sort()).toEqual([...sectionNames].sort());
      for (const section of Object.values(lot.sections)) {
        expect(Number(section.pdf_page)).toBeGreaterThan(0);
      }
    }
  });
});
