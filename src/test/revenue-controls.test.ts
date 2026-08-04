import { describe, expect, it } from "vitest";
import { localDateIso, monthStart, previousMonthKey, revenueTotal, validateRevenueNumbers } from "@/lib/revenue-controls";

describe("revenue controls", () => {
  it("uses local calendar dates without UTC rollover", () => {
    const date = new Date(2026, 7, 3, 0, 15);
    expect(localDateIso(date)).toBe("2026-08-03");
    expect(monthStart(date)).toBe("2026-08-01");
    expect(previousMonthKey(date)).toBe("2026-07");
  });

  it("rejects negative or non-finite financial values", () => {
    expect(validateRevenueNumbers([0, 100, 2500])).toBe(true);
    expect(validateRevenueNumbers([0, -1])).toBe(false);
    expect(validateRevenueNumbers([Number.NaN])).toBe(false);
  });

  it("includes every payment method in the total", () => {
    expect(revenueTotal({ cash_amount: 1, card_amount: 2, mobile_amount: 3, monthly_pass_amount: 4, other_amount: 5 })).toBe(15);
  });
});
