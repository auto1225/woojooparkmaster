import { describe, expect, it } from "vitest";
import { getModuleForPath } from "@/lib/authorization";

describe("master route module authorization", () => {
  it.each([
    ["/master/surveys", "SURVEY"],
    ["/master/ops", "OPS"],
    ["/master/facility", "FACILITY"],
    ["/master/revenue", "REVENUE"],
    ["/master/budget", "BUDGET"],
    ["/master/procurement", "PROCUREMENT"],
    ["/master/service", "SERVICE"],
    ["/master/complaints", "COMPLAINT"],
    ["/master/planning", "PLANNING"],
    ["/master/realtime", "REALTIME"],
    ["/master/reports", "REPORT"],
  ])("maps %s to %s", (path, moduleCode) => {
    expect(getModuleForPath(path)).toBe(moduleCode);
  });

  it("keeps the hub itself module-neutral", () => {
    expect(getModuleForPath("/master")).toBeNull();
  });
});
