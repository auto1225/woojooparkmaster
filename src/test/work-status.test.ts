import { describe, expect, it } from "vitest";
import { OPEN_COMPLAINT_STATUSES, OPEN_MAINTENANCE_STATUSES } from "@/lib/work-status";

describe("shared open work statuses", () => {
  it("keeps responded complaints visible until closure", () => {
    expect(OPEN_COMPLAINT_STATUSES).toContain("responded");
    expect(OPEN_COMPLAINT_STATUSES).not.toContain("closed");
  });

  it("keeps completed maintenance visible until verification", () => {
    expect(OPEN_MAINTENANCE_STATUSES).toContain("completed");
    expect(OPEN_MAINTENANCE_STATUSES).not.toContain("verified");
  });
});
