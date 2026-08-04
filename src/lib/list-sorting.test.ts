import { describe, expect, it } from "vitest";
import { compareListValues, stableMultiSort } from "./list-sorting";

describe("list sorting", () => {
  it("sorts Korean text with embedded numbers naturally", () => {
    expect(["장비10", "장비2", "장비1"].sort(compareListValues)).toEqual(["장비1", "장비2", "장비10"]);
  });

  it("keeps empty values at the selected edge", () => {
    expect([null, "나", "가"].sort((a, b) => compareListValues(a, b, "last"))).toEqual(["가", "나", null]);
  });

  it("applies secondary criteria and keeps ties stable", () => {
    const rows = [{ lot: "B", date: 2 }, { lot: "A", date: 2 }, { lot: "A", date: 1 }];
    expect(stableMultiSort(rows, [
      { value: (row) => row.lot, direction: "asc" },
      { value: (row) => row.date, direction: "desc" },
    ])).toEqual([{ lot: "A", date: 2 }, { lot: "A", date: 1 }, { lot: "B", date: 2 }]);
  });
});
